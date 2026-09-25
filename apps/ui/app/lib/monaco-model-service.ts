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
import { EditorSaveConflictError } from '@taucad/fs-client/file-content-service';
import type {
  FileContentResult,
  FileContentService,
  ContentChangeEvent,
  OutcomeChangeEvent,
} from '@taucad/fs-client/file-content-service';
import { ImmutableRevisionTree, mergeRevisionTrees } from '@taucad/revisions/algorithms';
import { requireParameterRecord, serializeParameterRecord } from '@taucad/parameters';
import { closeEditorDecision, openEditorDecision } from '#lib/editor-decisions.js';
import type { EditorDecision } from '#lib/editor-decisions.js';
import type { MonacoWorkspaceFs } from '#lib/monaco-workspace-fs/monaco-workspace-fs.types.js';
import { canonicalWorkspacePath } from '#lib/monaco-workspace-fs/workspace-file-system-provider.js';
import { workspaceRelativePathFromFileUri } from '#lib/monaco-workspace-fs/workspace-path-from-uri.js';
import { getMonacoLanguage } from '#lib/monaco.constants.js';
import { decodeTextFile } from '#utils/filesystem.utils.js';

export type ModelServiceConfig = {
  monaco: typeof Monaco;
  workspaceFs: MonacoWorkspaceFs;
  contentService: FileContentService;
  markerService: MonacoMarkerService;
  /** Whose files these are: an open *Needs your decision* is the project's (RV-W5b2 R2-1). */
  projectId?: string;
};

export type ServiceDiagnostics = {
  totalModelsCreated: number;
  peakModelCount: number;
  editorHeldCount: number;
  backgroundCount: number;
  currentModelCount: number;
};

/** The workspace-facing content seam the file manager binds to one model service. */
export type WorkspaceContentBinding = {
  readonly refreshContent: (uri: Monaco.Uri) => Promise<void>;
  readonly applyContentChange: (event: ContentChangeEvent) => void;
  readonly applyOutcomeChange: (event: OutcomeChangeEvent) => void;
};

export const createWorkspaceContentBinding = (modelService: MonacoModelService): WorkspaceContentBinding => ({
  refreshContent: async (uri: Monaco.Uri): Promise<void> => modelService.refreshContent(uri),
  applyContentChange: (event: ContentChangeEvent): void => {
    modelService.applyContentChange(event);
  },
  applyOutcomeChange: (event: OutcomeChangeEvent): void => {
    modelService.applyOutcomeChange(event);
  },
});

type EditorModelSave = {
  path: string;
  completion: Promise<void>;
  /** What callers await: the save, except a refusal this service rebases (RV-W5b F4). */
  settled: Promise<void>;
};

/**
 * A refused editor save waiting to be put back on the file (RV-W5b F4, RV-W5b2 N1).
 *
 * `settled` is what every keystroke save it refused resolves with: the merged
 * text's save, a person's choice, or that save's failure — so a failure reaches
 * the same reporter a keystroke's does (N3).
 */
type PendingRebase = {
  // oxlint-disable-next-line typescript/no-restricted-types -- `null` is the checked-write absence sentinel.
  readonly base: Uint8Array<ArrayBuffer> | null;
  readonly settled: PromiseWithResolvers<void>;
  /** The choice a person is asked, while the two cannot be merged. */
  decision?: EditorDecision;
  /** The model's text when last asked: what *Keep mine* keeps once the model is gone. */
  mine?: Uint8Array<ArrayBuffer>;
};

const textEncoder = new TextEncoder();

/* The codec every merge site in this app injects (D12): parameter records merge per key, never as text. */
const parameterCodec = { read: requireParameterRecord, serialize: serializeParameterRecord };

const sameBytes = (left: Uint8Array<ArrayBuffer>, right: Uint8Array<ArrayBuffer>): boolean =>
  left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);

/**
 * Merge one file the way a sync merge does, or say it cannot be merged.
 *
 * @param terms - The path (it decides the parameter codec), what the refused
 *   text was made from, the refused text, and the file's bytes now.
 * @returns The merged bytes, or `undefined` when a person has to choose.
 */
const mergeOneFile = ({
  path,
  base,
  ours,
  theirs,
}: Readonly<{
  path: string;
  // oxlint-disable-next-line typescript/no-restricted-types -- `null` is the checked-write absence sentinel.
  base: Uint8Array<ArrayBuffer> | null;
  ours: Uint8Array<ArrayBuffer>;
  theirs: Uint8Array<ArrayBuffer>;
}>): Uint8Array<ArrayBuffer> | undefined => {
  // oxlint-disable-next-line typescript/no-restricted-types -- `null` is the checked-write absence sentinel.
  const tree = (bytes: Uint8Array<ArrayBuffer> | null): ImmutableRevisionTree =>
    new ImmutableRevisionTree(bytes === null ? [] : [[path, bytes, '100644']]);
  const merged = mergeRevisionTrees(tree(base), tree(ours), tree(theirs), { parameters: parameterCodec });
  return merged.status === 'merged' ? merged.tree.get(path) : undefined;
};

export class MonacoModelService {
  private monaco: typeof Monaco | undefined;
  private workspaceFs: MonacoWorkspaceFs | undefined;
  private contentService: FileContentService | undefined;
  private markerService: MonacoMarkerService | undefined;
  private projectId = '';

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

  /** Workspace path whose filesystem content is synchronously mutating a model. */
  private currentFilesystemContentPath: string | undefined;

  private readonly editorSaves = new Map<string, EditorModelSave>();

  /**
   * The bytes each model was made from: what it last took from the file, or
   * last saved. An editor save is checked against them (RV-W5b2 N3), never
   * against a newer outcome the model has not taken.
   */
  private readonly bases = new Map<string, Uint8Array<ArrayBuffer>>();

  /**
   * Models holding an edit the filesystem refused (RV-W5b F4). The next text
   * outcome is merged onto rather than replacing the model — mid-apply the file
   * is only moved aside, so the merge waits for the bytes that land.
   */
  private readonly rebases = new Map<string, PendingRebase>();

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
    this.projectId = config.projectId ?? '';

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
    this.editorSaves.clear();
    this.forgetAll();

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
    this.editorSaves.clear();
    this.forgetAll();
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
      const loaded = this.contentService?.peekOutcome(path);
      this.bases.set(path, loaded?.kind === 'text' ? loaded.content : textEncoder.encode(model.getValue()));
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
      const path = canonicalWorkspacePath(uri.path);
      const result = await this.contentService.resolve(path);
      if (result.kind !== 'text') {
        model.dispose();
        this.editorHolds.delete(path);
        this.backgroundAccessTimes.delete(path);
        this.syncedPaths.delete(path);
        this.forget(path);
        this.markerService.removeUri(uri.toString());
        return;
      }
      this.adoptContent(path, model, result.content);
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

  /** Apply an authoritative content outcome produced by a reread. */
  public applyOutcomeChange(event: OutcomeChangeEvent): void {
    if (!this.monaco || this.editorSaves.has(event.path)) {
      return;
    }
    const uri = this.createUri(event.path);
    const model = this.monaco.editor.getModel(uri);
    if (!model) {
      return;
    }
    if (this.rebases.has(event.path)) {
      this.rebaseOnto(event.path, event.result, true);
      return;
    }
    if (event.result.kind === 'text') {
      this.adoptContent(event.path, model, event.result.content);
      return;
    }
    /* An apply moves a file aside before it renames the new bytes in (RV-W5b2 N2): a model an
     * editor holds keeps its text and undo history through the gap. A real delete of it
     * arrives as `deleted`. */
    if (event.result.kind === 'orphaned' && this.editorHolds.has(event.path)) {
      return;
    }
    model.dispose();
    this.editorHolds.delete(event.path);
    this.backgroundAccessTimes.delete(event.path);
    this.syncedPaths.delete(event.path);
    this.forget(event.path);
    this.markerService?.removeUri(uri.toString());
  }

  /** Submit the latest Monaco value to the bounded editor-save queue. */
  // oxlint-disable-next-line @typescript-eslint/promise-function-async -- Callers compare the shared queue promise by identity.
  public saveEditor(path: string, data: Uint8Array<ArrayBuffer>): Promise<void> {
    const { contentService } = this;
    if (!contentService) {
      return Promise.resolve();
    }
    const completion = contentService.saveEditor(path, data, this.bases.get(path));
    const existing = this.editorSaves.get(path);
    if (existing?.completion === completion) {
      return existing.settled;
    }
    const state = existing ?? { path, completion, settled: completion };
    state.path = path;
    state.completion = completion;
    this.editorSaves.set(path, state);
    state.settled = this.finalizeEditorSave(state, completion, contentService);
    return state.settled;
  }

  /**
   * Whether the current synchronous Monaco callback for `path` was caused by
   * filesystem content already being applied by this service.
   */
  public isApplyingFilesystemContent(path: string): boolean {
    return this.currentFilesystemContentPath === path;
  }

  /**
   * Whether `path` has a model this service created (or carried across a
   * rename) with its workspace content subscriptions attached. An editor for a
   * workspace file mounts only once this holds or its hold has settled: an
   * editor that mounts first creates the model itself, and the workspace file
   * system then adopts that model without subscribing it to file changes.
   */
  public hasSyncedModel(path: string): boolean {
    return this.syncedPaths.has(path);
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

  private async finalizeEditorSave(
    state: EditorModelSave,
    completion: Promise<void>,
    contentService: FileContentService,
  ): Promise<void> {
    let failure: unknown;
    let failed = false;
    try {
      await completion;
    } catch (error) {
      failed = true;
      failure = error;
    }
    if (state.completion === completion && this.editorSaves.get(state.path) === state) {
      const currentPath = state.path;
      this.editorSaves.delete(currentPath);
      if (failure instanceof EditorSaveConflictError) {
        return this.awaitRebase(currentPath, failure.base, contentService);
      }
      if (!failed) {
        this.applyOutcomeChange({ path: currentPath, result: contentService.peekOutcome(currentPath) });
      }
    }
    /* The caller owns persistence errors; a refusal is not one — the edit is merged or a person chooses. */
    if (failed && !(failure instanceof EditorSaveConflictError)) {
      // oxlint-disable-next-line @typescript-eslint/only-throw-error -- Preserve the exact rejection from the filesystem client.
      throw failure;
    }
  }

  /**
   * Hold a refused edit until it can be put back on the file.
   *
   * @param path - Workspace-relative path.
   * @param base - What the refused text was made from.
   * @param contentService - Where the file's bytes now are read.
   * @returns What the refused keystroke saves settle with.
   */
  private async awaitRebase(
    path: string,
    // oxlint-disable-next-line typescript/no-restricted-types -- `null` is the checked-write absence sentinel.
    base: Uint8Array<ArrayBuffer> | null,
    contentService: FileContentService,
  ): Promise<void> {
    let pending = this.rebases.get(path);
    if (pending === undefined) {
      pending = { base, settled: Promise.withResolvers<void>() };
      this.rebases.set(path, pending);
    }
    const { promise } = pending.settled;
    this.rebaseOnto(path, contentService.peekOutcome(path), false);
    return promise;
  }

  /**
   * Put a refused edit back on top of the file as it now is.
   *
   * A sync merge's own per-file merge, with the parameter codec (D12): when it
   * merges, the model takes the merged text and saves it, checked against the
   * file's bytes. When it cannot, nothing is written — marker bytes never reach
   * the files (I7) — the text stays in the model, and the person chooses
   * (RV-W5b2 N1). Until the file has bytes again (mid-apply it is moved aside)
   * this waits; a file back on the bytes the edit was made from — an apply that
   * rolled back — has its edit saved again (N3).
   *
   * @param path - Workspace-relative path; its model holds the refused edit.
   * @param outcome - The file's content now.
   * @param changed - Whether `outcome` is news, rather than the one the refusal already saw.
   */
  private rebaseOnto(path: string, outcome: FileContentResult, changed: boolean): void {
    const pending = this.rebases.get(path);
    const model = this.monaco?.editor.getModel(this.createUri(path));
    if (pending === undefined || !model || outcome.kind !== 'text') {
      return;
    }
    const theirs = outcome.content;
    if (pending.base !== null && sameBytes(pending.base, theirs)) {
      if (changed) {
        this.settleRebase(path, pending, this.saveEditor(path, textEncoder.encode(model.getValue())));
      }
      return;
    }
    const ours = textEncoder.encode(model.getValue());
    const merged = mergeOneFile({ path, base: pending.base, ours, theirs });
    if (merged === undefined) {
      pending.mine = ours;
      this.askToChoose(path, pending, theirs);
      return;
    }
    this.bases.set(path, theirs);
    this.setModelText(path, model, decodeTextFile(merged));
    this.settleRebase(path, pending, this.saveEditor(path, merged));
  }

  /**
   * Retire a pending rebase into one save, whose outcome its refused keystrokes share.
   *
   * @param path - Workspace-relative path.
   * @param pending - The rebase being settled.
   * @param save - The save that settles it.
   */
  private settleRebase(path: string, pending: PendingRebase, save: Promise<void>): void {
    if (this.rebases.get(path) === pending) {
      this.rebases.delete(path);
    }
    if (pending.decision !== undefined) {
      closeEditorDecision(pending.decision);
    }
    // async-iife: bootstrap -- the save's outcome is handed to the promise the refused keystrokes already hold.
    // oxlint-disable-next-line promise/prefer-await-to-then -- forwarding one settlement to another.
    save.then(pending.settled.resolve).catch(pending.settled.reject);
  }

  /**
   * Ask which side to keep when the two cannot be merged (RV-W5b2 N1).
   *
   * The *Needs your decision* words and the *Keep mine* / *Keep theirs* choice
   * are the conflict card's; the toast is the surface an unsaved editor has
   * until W6 records the conflict durably. Keep mine saves the model's text
   * checked against the arrived bytes; keep theirs takes the arrived bytes into
   * the model. Each refused keystroke asks again, with the newest text.
   *
   * @param path - Workspace-relative path.
   * @param pending - The refused edit.
   * @param theirs - The bytes that arrived.
   */
  private askToChoose(path: string, pending: PendingRebase, theirs: Uint8Array<ArrayBuffer>): void {
    if (pending.decision !== undefined) {
      pending.decision.theirs = theirs;
      openEditorDecision(pending.decision);
      return;
    }
    const decision: EditorDecision = {
      projectId: this.projectId,
      path,
      theirs,
      keep: (side) => {
        this.choose(decision, side);
      },
    };
    pending.decision = decision;
    openEditorDecision(decision);
  }

  private choose(decision: EditorDecision, side: 'mine' | 'theirs'): void {
    const { path, theirs } = decision;
    const pending = this.rebases.get(path);
    const model = this.monaco?.editor.getModel(this.createUri(path));
    if (pending?.decision !== decision || !model) {
      return;
    }
    this.bases.set(path, theirs);
    if (side === 'mine') {
      this.settleRebase(path, pending, this.saveEditor(path, textEncoder.encode(model.getValue())));
      return;
    }
    this.setModelText(path, model, decodeTextFile(theirs));
    this.settleRebase(path, pending, Promise.resolve());
  }

  /**
   * Hand an open decision to the file itself when its model goes away.
   *
   * Switching project, closing the editor or disposing this service must not
   * drop text only the model held (RV-W5b2 R2-1): *Keep mine* then writes the
   * last asked text, checked against the arrived bytes, and asks again if the
   * file moved on.
   *
   * ponytail: a file deleted meanwhile leaves *Keep mine* refused until the
   * person keeps theirs; W6's durable record replaces this.
   *
   * @param pending - The refused edit whose model is going away.
   */
  private detach(pending: PendingRebase): void {
    const { decision, mine } = pending;
    const { contentService } = this;
    if (decision === undefined || mine === undefined || !contentService) {
      return;
    }
    pending.decision = undefined;
    decision.keep = (side) => {
      if (side === 'theirs') {
        closeEditorDecision(decision);
        return;
      }
      // async-iife: bootstrap -- a toast button cannot await its write.
      void (async (): Promise<void> => {
        try {
          await contentService.saveEditor(decision.path, mine, decision.theirs);
          closeEditorDecision(decision);
        } catch (error) {
          const now = contentService.peekOutcome(decision.path);
          if (error instanceof EditorSaveConflictError && now.kind === 'text') {
            decision.theirs = now.content;
            openEditorDecision(decision);
          }
        }
      })();
    };
  }

  /** Drop what this service knew about one path's model: its bytes and any refused edit. */
  private forget(path: string): void {
    this.bases.delete(path);
    const pending = this.rebases.get(path);
    if (pending !== undefined) {
      this.detach(pending);
      this.settleRebase(path, pending, Promise.resolve());
    }
  }

  private forgetAll(): void {
    for (const path of this.rebases.keys()) {
      this.forget(path);
    }
    this.bases.clear();
  }

  /** Carry a model's bytes and refused edit to its new path. */
  private rekey(oldPath: string, newPath: string): void {
    const base = this.bases.get(oldPath);
    this.bases.delete(oldPath);
    if (base !== undefined) {
      this.bases.set(newPath, base);
    }
    const pending = this.rebases.get(oldPath);
    this.rebases.delete(oldPath);
    if (pending !== undefined) {
      this.rebases.set(newPath, pending);
      if (pending.decision !== undefined) {
        pending.decision.path = newPath;
      }
    }
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
      case 'fileCopied': {
        const cached = this.contentService?.peek(event.targetPath);
        if (cached) {
          this.applyWritten(event.targetPath, cached, 'user');
        }
        break;
      }
      case 'deleted': {
        const uri = this.createUri(event.path);
        this.monaco.editor.getModel(uri)?.dispose();
        this.editorHolds.delete(event.path);
        this.backgroundAccessTimes.delete(event.path);
        this.syncedPaths.delete(event.path);
        this.editorSaves.delete(event.path);
        this.forget(event.path);
        this.markerService?.removeUri(uri.toString());
        break;
      }
      case 'renamed': {
        const save = this.editorSaves.get(event.oldPath);
        if (save !== undefined) {
          this.editorSaves.delete(event.oldPath);
          save.path = event.newPath;
          this.editorSaves.set(event.newPath, save);
        }
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
        if (oldModel) {
          this.rekey(event.oldPath, event.newPath);
        } else {
          this.forget(event.oldPath);
        }

        const language = this.detectLanguage(event.newPath);
        if (language && oldModel) {
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
        this.deleteEditorSavesUnderPrefix(event.path);
        this.disposeModelsUnderPrefix(event.path);
        break;
      }
      case 'directoryRenamed': {
        this.rekeyEditorSavesUnderPrefix(event.oldPath, event.newPath);
        this.migrateModelsUnderPrefix(event.oldPath, event.newPath);
        break;
      }
      case 'directoryCreated':
      case 'directoryCopied':
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
      this.forget(path);
      this.markerService?.removeUri(uri.toString());
    }
  }

  private deleteEditorSavesUnderPrefix(directoryPath: string): void {
    const prefix = directoryPath === '' ? '' : `${directoryPath}/`;
    for (const path of this.editorSaves.keys()) {
      if (path === directoryPath || path.startsWith(prefix)) {
        this.editorSaves.delete(path);
      }
    }
  }

  private rekeyEditorSavesUnderPrefix(oldDirectoryPath: string, newDirectoryPath: string): void {
    const oldPrefix = oldDirectoryPath === '' ? '' : `${oldDirectoryPath}/`;
    const newPrefix = newDirectoryPath === '' ? '' : `${newDirectoryPath}/`;
    for (const [oldPath, save] of this.editorSaves) {
      if (oldPath !== oldDirectoryPath && !oldPath.startsWith(oldPrefix)) {
        continue;
      }
      const newPath =
        oldPath === oldDirectoryPath ? newDirectoryPath : `${newPrefix}${oldPath.slice(oldPrefix.length)}`;
      this.editorSaves.delete(oldPath);
      save.path = newPath;
      this.editorSaves.set(newPath, save);
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
      /* A refused edit is merged from the outcome, which this write already published. */
      if (!this.rebases.has(path)) {
        this.adoptContent(path, existingModel, data);
      }
    } else if (source === 'user') {
      const language = this.detectLanguage(path);
      if (language) {
        this.monaco.editor.createModel(newContent, language, uri);
        this.trackModelCreated();
        this.syncedPaths.add(path);
        this.bases.set(path, data);

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
        this.bases.set(path, data);
        this.backgroundAccessTimes.set(path, Date.now());
      }
    }
  }

  /** Take the file's bytes into the model: they are now what the model was made from. */
  private adoptContent(path: string, model: Monaco.editor.ITextModel, bytes: Uint8Array<ArrayBuffer>): void {
    this.bases.set(path, bytes);
    this.setModelText(path, model, decodeTextFile(bytes));
  }

  private setModelText(path: string, existingModel: Monaco.editor.ITextModel, newContent: string): void {
    const previousPath = this.currentFilesystemContentPath;
    this.currentFilesystemContentPath = path;
    try {
      this.applyNewContentToModel(existingModel, newContent, this.editorHolds.has(path));
    } finally {
      this.currentFilesystemContentPath = previousPath;
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
