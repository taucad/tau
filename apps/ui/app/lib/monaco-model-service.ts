/**
 * Monaco Model Service
 *
 * Single authority for all Monaco model lifecycle and content mutations.
 * Replaces the dual-subscriber pattern that caused file corruption.
 *
 * Key behaviors:
 * - Ref-counted editor holds for split-view readiness
 * - FileContentService subscription wired by host via {@link subscribeWorkspaceContentDispatch}
 * - pushEditOperations for editor-held models (preserves undo), setValue for non-held models
 * - Session epoch gating for all async operations
 * - AbortController cancellation for load paths
 *
 * Workspace materialisation for `file://` URIs flows through {@link MonacoWorkspaceFs}.
 */

import type * as Monaco from 'monaco-editor';
import type { MonacoMarkerService } from '#lib/monaco-marker-service.js';
import type { FileContentService, ContentChangeEvent } from '@taucad/fs-client/file-content-service';
import type { MonacoWorkspaceFs } from '#lib/monaco-workspace-fs/monaco-workspace-fs.types.js';
import { workspaceRelativePathFromFileUri } from '#lib/monaco-workspace-fs/workspace-path-from-uri.js';
import { getMonacoLanguage } from '#lib/monaco.constants.js';
import { decodeTextFile } from '#utils/filesystem.utils.js';

export type ModelServiceConfig = {
  monaco: typeof Monaco;
  workspaceFs: MonacoWorkspaceFs;
  contentService: FileContentService;
  markerService: MonacoMarkerService;
};

export type ServiceDiagnostics = {
  totalModelsCreated: number;
  peakModelCount: number;
  editorHeldCount: number;
  backgroundCount: number;
  currentModelCount: number;
};

export class MonacoModelService {
  private monaco: typeof Monaco | undefined;
  private workspaceFs: MonacoWorkspaceFs | undefined;
  private contentService: FileContentService | undefined;
  private markerService: MonacoMarkerService | undefined;

  /** Session epoch -- incremented on each project session change */
  private epoch = 0;

  /** AbortController for current session -- aborted on session change and dispose */
  private abortController: AbortController | undefined;

  /** Ref-counted editor holds: path -> refCount */
  private readonly editorHolds = new Map<string, number>();

  /** Non-editor-held models (e.g. released from editor) for lifecycle / metrics */
  private readonly backgroundAccessTimes = new Map<string, number>();

  /** Set of paths that have been touched in the current session */
  private readonly syncedPaths = new Set<string>();

  /** Dev-mode metrics */
  private readonly metrics = {
    totalModelsCreated: 0,
    peakModelCount: 0,
  };

  /**
   * Initialize the model service.
   */
  public initialize(config: ModelServiceConfig): void {
    this.monaco = config.monaco;
    this.workspaceFs = config.workspaceFs;
    this.contentService = config.contentService;
    this.markerService = config.markerService;

    this.abortController = new AbortController();
  }

  /**
   * Dispose all resources.
   */
  public dispose(): void {
    this.abortController?.abort();
    this.abortController = undefined;

    this.disposeAllModels();

    this.editorHolds.clear();
    this.backgroundAccessTimes.clear();
    this.syncedPaths.clear();

    this.monaco = undefined;
    this.workspaceFs = undefined;
    this.contentService = undefined;
    this.markerService = undefined;
  }

  /**
   * Switch to a new project session. Aborts in-flight work and clears state.
   */
  public setProjectSession(): void {
    this.epoch++;

    this.abortController?.abort();
    this.abortController = new AbortController();

    this.markerService?.clearAll();

    this.disposeAllModels();

    this.editorHolds.clear();
    this.backgroundAccessTimes.clear();
    this.syncedPaths.clear();
  }

  /**
   * Acquire a ref-counted editor hold on a path and ensure the model exists.
   * Returns the model, or undefined if the file can't be loaded.
   * Each call must be balanced by a corresponding `releaseModel` call.
   */
  public async acquireModel(path: string): Promise<Monaco.editor.ITextModel | undefined> {
    this.registerEditorModel(path);
    return this.getOrEnsureModel(path);
  }

  /**
   * Release a ref-counted editor hold. When the last hold is released,
   * the model remains (unless disposed by an explicit delete); it is tracked as background.
   */
  public releaseModel(path: string): void {
    this.unregisterEditorModel(path);
  }

  /**
   * Get or create a Monaco model for a given path.
   * Returns undefined if the file can't be loaded.
   */
  public async getOrEnsureModel(path: string): Promise<Monaco.editor.ITextModel | undefined> {
    if (!this.monaco || !this.workspaceFs) {
      return undefined;
    }

    const uri = this.createUri(path);
    const before = this.monaco.editor.getModel(uri);

    if (before) {
      if (!this.editorHolds.has(path)) {
        this.backgroundAccessTimes.set(path, Date.now());
      }
      return before;
    }

    const capturedEpoch = this.epoch;

    try {
      const model = await this.workspaceFs.openTextDocument(uri);

      if (this.epoch !== capturedEpoch || this.abortController?.signal.aborted) {
        return undefined;
      }

      if (!model) {
        return undefined;
      }

      this.trackModelCreated();

      if (!this.editorHolds.has(path)) {
        this.backgroundAccessTimes.set(path, Date.now());
      }

      this.syncedPaths.add(path);
      return model;
    } catch {
      return undefined;
    }
  }

  /**
   * Re-synchronise an open model with its backing resource (non-`file://` schemes, e.g. inmemory).
   */
  public async refreshContent(uri: Monaco.Uri): Promise<void> {
    if (!this.monaco || !this.workspaceFs || !this.contentService || !this.markerService) {
      return;
    }

    const model = this.monaco.editor.getModel(uri);
    if (!model) {
      return;
    }

    if (uri.scheme === 'file') {
      const path = workspaceRelativePathFromFileUri(uri.path);
      const result = await this.contentService.resolve(path);
      if (result.kind !== 'text') {
        model.dispose();
        this.editorHolds.delete(path);
        this.backgroundAccessTimes.delete(path);
        this.syncedPaths.delete(path);
        this.markerService.removeUri(uri.toString());
        return;
      }
      const newContent = decodeTextFile(result.content);
      this.applyNewContentToModel(model, newContent, this.editorHolds.has(path));
      return;
    }

    const fsProvider = this.workspaceFs.getFileSystemProvider(uri.scheme);
    if (fsProvider) {
      try {
        const text = await fsProvider.readText(uri);
        const path = uri.scheme === 'file' ? workspaceRelativePathFromFileUri(uri.path) : '';
        const held = path !== '' && this.editorHolds.has(path);
        this.applyNewContentToModel(model, text, held);
      } catch {
        model.dispose();
        this.markerService.removeUri(uri.toString());
      }
      return;
    }

    const contentProvider = this.workspaceFs.getTextDocumentProvider(uri.scheme);
    if (contentProvider) {
      try {
        const text = await contentProvider.provideTextDocumentContent(uri);
        this.applyNewContentToModel(model, text, false);
      } catch {
        model.dispose();
        this.markerService.removeUri(uri.toString());
      }
    }
  }

  /**
   * Workspace-wide filesystem notifications (`FileContentService`). Wired by
   * {@link subscribeWorkspaceContentDispatch}.
   */
  public applyContentChange(event: ContentChangeEvent): void {
    this.handleContentChange(event);
  }

  /**
   * Get diagnostics for dev-mode observability.
   */
  public getDiagnostics(): ServiceDiagnostics {
    return {
      ...this.metrics,
      editorHeldCount: this.editorHolds.size,
      backgroundCount: this.backgroundAccessTimes.size,
      currentModelCount: this.monaco?.editor.getModels().length ?? 0,
    };
  }

  private registerEditorModel(path: string): void {
    const current = this.editorHolds.get(path) ?? 0;
    this.editorHolds.set(path, current + 1);

    this.backgroundAccessTimes.delete(path);
  }

  private unregisterEditorModel(path: string): void {
    const current = this.editorHolds.get(path) ?? 0;
    if (current <= 1) {
      this.editorHolds.delete(path);
      this.backgroundAccessTimes.set(path, Date.now());
    } else {
      this.editorHolds.set(path, current - 1);
    }
  }

  // oxlint-disable-next-line complexity -- single switch dispatches every filesystem→model sync kind
  private handleContentChange(event: ContentChangeEvent): void {
    if (!this.monaco) {
      return;
    }

    switch (event.type) {
      case 'written': {
        if (event.source === 'editor') {
          return;
        }
        this.applyWritten(event.path, event.data, event.source);
        break;
      }
      case 'batchWritten': {
        for (const path of event.paths) {
          const cached = this.contentService?.peek(path);
          if (cached) {
            this.applyWritten(path, cached, event.source);
          }
        }
        break;
      }
      case 'deleted': {
        const uri = this.createUri(event.path);
        this.monaco.editor.getModel(uri)?.dispose();
        this.editorHolds.delete(event.path);
        this.backgroundAccessTimes.delete(event.path);
        this.syncedPaths.delete(event.path);
        this.markerService?.removeUri(uri.toString());
        break;
      }
      case 'renamed': {
        const oldUri = this.createUri(event.oldPath);
        const newUri = this.createUri(event.newPath);
        const oldModel = this.monaco.editor.getModel(oldUri);
        const content = oldModel?.getValue() ?? '';
        oldModel?.dispose();

        const editorCount = this.editorHolds.get(event.oldPath);
        this.editorHolds.delete(event.oldPath);
        if (editorCount !== undefined) {
          this.editorHolds.set(event.newPath, editorCount);
        }

        this.backgroundAccessTimes.delete(event.oldPath);
        this.syncedPaths.delete(event.oldPath);

        const language = this.detectLanguage(event.newPath);
        if (language && content) {
          this.monaco.editor.createModel(content, language, newUri);
          this.trackModelCreated();
          this.syncedPaths.add(event.newPath);

          if (!this.editorHolds.has(event.newPath)) {
            this.backgroundAccessTimes.set(event.newPath, Date.now());
          }
        }

        this.markerService?.migrateUri(oldUri.toString(), newUri.toString());
        break;
      }
      case 'directoryDeleted': {
        this.disposeModelsUnderPrefix(event.path);
        break;
      }
      case 'directoryRenamed': {
        this.migrateModelsUnderPrefix(event.oldPath, event.newPath);
        break;
      }
      case 'directoryCreated':
      case 'read': {
        break;
      }
    }
  }

  private disposeModelsUnderPrefix(directoryPath: string): void {
    if (!this.monaco) {
      return;
    }
    const prefix = directoryPath === '' ? '' : `${directoryPath}/`;
    const paths: string[] = [];
    for (const path of this.syncedPaths) {
      if (path === directoryPath || path.startsWith(prefix)) {
        paths.push(path);
      }
    }
    for (const path of paths) {
      const uri = this.createUri(path);
      this.monaco.editor.getModel(uri)?.dispose();
      this.editorHolds.delete(path);
      this.backgroundAccessTimes.delete(path);
      this.syncedPaths.delete(path);
      this.markerService?.removeUri(uri.toString());
    }
  }

  private migrateModelsUnderPrefix(oldDirectoryPath: string, newDirectoryPath: string): void {
    if (!this.monaco) {
      return;
    }
    const oldPrefix = oldDirectoryPath === '' ? '' : `${oldDirectoryPath}/`;
    const newPrefix = newDirectoryPath === '' ? '' : `${newDirectoryPath}/`;
    const affected: string[] = [];
    for (const path of this.syncedPaths) {
      if (path === oldDirectoryPath || path.startsWith(oldPrefix)) {
        affected.push(path);
      }
    }
    for (const oldPath of affected) {
      const newPath =
        oldPath === oldDirectoryPath ? newDirectoryPath : `${newPrefix}${oldPath.slice(oldPrefix.length)}`;
      this.handleContentChange({ type: 'renamed', oldPath, newPath });
    }
  }

  private applyWritten(path: string, data: Uint8Array<ArrayBuffer>, source: string): void {
    if (!this.monaco) {
      return;
    }

    const uri = this.createUri(path);
    const newContent = decodeTextFile(data);
    const existingModel = this.monaco.editor.getModel(uri);

    if (existingModel) {
      this.applyNewContentToModel(existingModel, newContent, this.editorHolds.has(path));
    } else if (source === 'user') {
      const language = this.detectLanguage(path);
      if (language) {
        this.monaco.editor.createModel(newContent, language, uri);
        this.trackModelCreated();
        this.syncedPaths.add(path);

        if (!this.editorHolds.has(path)) {
          this.backgroundAccessTimes.set(path, Date.now());
        }
      }
    } else {
      const language = this.detectLanguage(path);
      if (language && !path.includes('node_modules')) {
        this.monaco.editor.createModel(newContent, language, uri);
        this.trackModelCreated();
        this.syncedPaths.add(path);
        this.backgroundAccessTimes.set(path, Date.now());
      }
    }
  }

  private applyNewContentToModel(
    existingModel: Monaco.editor.ITextModel,
    newContent: string,
    editorHeld: boolean,
  ): void {
    const currentModelValue = existingModel.getValue();
    if (currentModelValue === newContent) {
      return;
    }
    if (editorHeld) {
      existingModel.pushStackElement();
      existingModel.pushEditOperations(
        [],
        [{ range: existingModel.getFullModelRange(), text: newContent }],
        () => null,
      );
      existingModel.pushStackElement();
    } else {
      existingModel.setValue(newContent);
    }
  }

  /**
   * Create a root-level Monaco URI from a relative path.
   */
  private createUri(relativePath: string): Monaco.Uri {
    return this.monaco!.Uri.file(`/${relativePath}`);
  }

  private detectLanguage(path: string): string | undefined {
    return getMonacoLanguage(path);
  }

  private disposeAllModels(): void {
    if (!this.monaco) {
      return;
    }

    const trackedPaths = new Set([
      ...this.editorHolds.keys(),
      ...this.backgroundAccessTimes.keys(),
      ...this.syncedPaths,
    ]);

    for (const path of trackedPaths) {
      const uri = this.createUri(path);
      this.monaco.editor.getModel(uri)?.dispose();
    }
  }

  private trackModelCreated(): void {
    this.metrics.totalModelsCreated++;
    const currentCount = this.monaco?.editor.getModels().length ?? 0;
    if (currentCount > this.metrics.peakModelCount) {
      this.metrics.peakModelCount = currentCount;
    }
  }
}
