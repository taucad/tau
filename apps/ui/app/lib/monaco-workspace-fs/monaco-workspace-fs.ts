import type * as Monaco from 'monaco-editor';
import { debugCmdClick } from '#lib/monaco-workspace-fs/cmd-click-diagnostic.js';
import { getMonacoLanguage } from '#lib/monaco.constants.js';
import type {
  MonacoFileSystemProvider,
  MonacoTextDocumentContentProvider,
  MonacoWorkspaceFs,
  WorkspaceFsModelServiceBinding,
  WorkspaceTextProvider,
} from '#lib/monaco-workspace-fs/monaco-workspace-fs.types.js';

function inferLanguageId(uri: Monaco.Uri): string {
  const path = uri.path.startsWith('/') ? uri.path.slice(1) : uri.path;
  return getMonacoLanguage(path) ?? 'plaintext';
}

export function createMonacoWorkspaceFs(monaco: typeof Monaco): MonacoWorkspaceFs {
  return new MonacoWorkspaceFsImpl(monaco);
}

class MonacoWorkspaceFsImpl implements MonacoWorkspaceFs {
  private readonly monacoRef: typeof Monaco;
  private readonly fileProviders = new Map<string, MonacoFileSystemProvider>();
  private readonly contentProviders = new Map<string, MonacoTextDocumentContentProvider>();
  private modelService: WorkspaceFsModelServiceBinding | undefined;
  private readonly modelDisposeListener: Monaco.IDisposable;
  /** Map from URI string to change subscription disposables registered for that model */
  private readonly changeDisposablesByUriKey = new Map<string, Monaco.IDisposable[]>();
  private disposed = false;

  public constructor(monaco: typeof Monaco) {
    this.monacoRef = monaco;
    this.modelDisposeListener = monaco.editor.onWillDisposeModel((model) => {
      const key = model.uri.toString();
      const disposables = this.changeDisposablesByUriKey.get(key);
      if (!disposables) {
        return;
      }
      for (const d of disposables) {
        d.dispose();
      }
      this.changeDisposablesByUriKey.delete(key);
    });
  }

  public bindModelService(modelService: WorkspaceFsModelServiceBinding): void {
    this.modelService = modelService;
  }

  public registerFileSystemProvider(provider: MonacoFileSystemProvider): Monaco.IDisposable {
    if (this.fileProviders.has(provider.scheme)) {
      throw new Error(`MonacoWorkspaceFs: duplicate file-system scheme "${provider.scheme}"`);
    }
    this.fileProviders.set(provider.scheme, provider);
    return {
      dispose: () => {
        this.fileProviders.delete(provider.scheme);
      },
    };
  }

  public registerTextDocumentContentProvider(provider: MonacoTextDocumentContentProvider): Monaco.IDisposable {
    if (this.contentProviders.has(provider.scheme)) {
      throw new Error(`MonacoWorkspaceFs: duplicate content scheme "${provider.scheme}"`);
    }
    this.contentProviders.set(provider.scheme, provider);
    return {
      dispose: () => {
        this.contentProviders.delete(provider.scheme);
      },
    };
  }

  public hasProvider(scheme: string): boolean {
    return this.fileProviders.has(scheme) || this.contentProviders.has(scheme);
  }

  public getFileSystemProvider(scheme: string): MonacoFileSystemProvider | undefined {
    return this.fileProviders.get(scheme);
  }

  public getTextDocumentProvider(scheme: string): MonacoTextDocumentContentProvider | undefined {
    return this.contentProviders.get(scheme);
  }

  public canMaterialise(uri: Monaco.Uri): boolean {
    return this.hasProvider(uri.scheme);
  }

  public peekModel(uri: Monaco.Uri): Monaco.editor.ITextModel | undefined {
    const existing = this.monacoRef.editor.getModel(uri);
    if (existing) {
      return existing;
    }
    const fsProvider = this.fileProviders.get(uri.scheme);
    if (!fsProvider?.peekText) {
      return undefined;
    }
    const text = fsProvider.peekText(uri);
    if (text === undefined) {
      return undefined;
    }
    const languageId = fsProvider.languageId?.(uri) ?? inferLanguageId(uri);
    const model = this.monacoRef.editor.createModel(text, languageId, uri);
    this.attachChangeSubscriptions(uri, fsProvider);
    return model;
  }

  public async openTextDocument(uri: Monaco.Uri): Promise<Monaco.editor.ITextModel | undefined> {
    const uriString = uri.toString();
    debugCmdClick('MonacoWorkspaceFs.openTextDocument:enter', { uri: uriString, scheme: uri.scheme });
    const existing = this.monacoRef.editor.getModel(uri);
    if (existing) {
      debugCmdClick('MonacoWorkspaceFs.openTextDocument:existing-model', { uri: uriString });
      return existing;
    }

    const fsProvider = this.fileProviders.get(uri.scheme);
    if (fsProvider) {
      let text: string;
      try {
        text = await fsProvider.readText(uri);
      } catch (error) {
        debugCmdClick('MonacoWorkspaceFs.openTextDocument:fsProvider-readText-throw', {
          uri: uriString,
          error: error instanceof Error ? error.message : String(error),
        });
        return undefined;
      }
      const recheck = this.monacoRef.editor.getModel(uri);
      if (recheck) {
        debugCmdClick('MonacoWorkspaceFs.openTextDocument:fsProvider-recheck-hit', { uri: uriString });
        return recheck;
      }
      const languageId = fsProvider.languageId?.(uri) ?? inferLanguageId(uri);
      const model = this.monacoRef.editor.createModel(text, languageId, uri);
      this.attachChangeSubscriptions(uri, fsProvider);
      debugCmdClick('MonacoWorkspaceFs.openTextDocument:fsProvider-createModel', {
        uri: uriString,
        languageId,
        textLength: text.length,
      });
      return model;
    }

    const contentProvider = this.contentProviders.get(uri.scheme);
    if (contentProvider) {
      let text: string;
      try {
        text = await contentProvider.provideTextDocumentContent(uri);
      } catch (error) {
        debugCmdClick('MonacoWorkspaceFs.openTextDocument:contentProvider-throw', {
          uri: uriString,
          error: error instanceof Error ? error.message : String(error),
        });
        return undefined;
      }
      const recheck = this.monacoRef.editor.getModel(uri);
      if (recheck) {
        debugCmdClick('MonacoWorkspaceFs.openTextDocument:contentProvider-recheck-hit', { uri: uriString });
        return recheck;
      }
      const languageId = contentProvider.languageId?.(uri) ?? inferLanguageId(uri);
      const model = this.monacoRef.editor.createModel(text, languageId, uri);
      this.attachContentChangeSubscriptions(uri, contentProvider);
      debugCmdClick('MonacoWorkspaceFs.openTextDocument:contentProvider-createModel', {
        uri: uriString,
        languageId,
        textLength: text.length,
      });
      return model;
    }

    debugCmdClick('MonacoWorkspaceFs.openTextDocument:no-provider', {
      uri: uriString,
      scheme: uri.scheme,
      knownFileSchemes: [...this.fileProviders.keys()],
      knownContentSchemes: [...this.contentProviders.keys()],
    });
    return undefined;
  }

  public async openTextProvider(uri: Monaco.Uri): Promise<WorkspaceTextProvider | undefined> {
    const fsProvider = this.fileProviders.get(uri.scheme);
    const contentProvider = this.contentProviders.get(uri.scheme);
    if (fsProvider) {
      let text: string;
      try {
        text = await fsProvider.readText(uri);
      } catch {
        return undefined;
      }
      const lines = text.split(/\r\n|\r|\n/);
      return {
        text,
        dispose(): void {
          void 0;
        },
        lineLength(lineNumber1Based: number): number {
          const line = lines[lineNumber1Based - 1];
          return line === undefined ? 0 : line.length;
        },
      };
    }
    if (contentProvider) {
      let text: string;
      try {
        text = await contentProvider.provideTextDocumentContent(uri);
      } catch {
        return undefined;
      }
      const lines = text.split(/\r\n|\r|\n/);
      return {
        text,
        dispose(): void {
          void 0;
        },
        lineLength(lineNumber1Based: number): number {
          const line = lines[lineNumber1Based - 1];
          return line === undefined ? 0 : line.length;
        },
      };
    }
    return undefined;
  }

  public async materialiseUrisForWorkspaceEdit(uris: readonly Monaco.Uri[]): Promise<void> {
    await Promise.all(uris.map(async (u) => this.openTextDocument(u)));
  }

  public async findFiles(pattern: string, options?: { maxResults?: number }): Promise<readonly Monaco.Uri[]> {
    const max = options?.maxResults ?? Number.POSITIVE_INFINITY;
    const out: Monaco.Uri[] = [];
    for (const provider of this.fileProviders.values()) {
      if (!provider.findFiles) {
        continue;
      }
      if (out.length >= max) {
        break;
      }
      const remaining = max - out.length;
      // oxlint-disable-next-line no-await-in-loop -- maxResults budget is applied sequentially across providers
      const batch = await Promise.resolve(provider.findFiles(pattern, { maxResults: remaining }));
      out.push(...batch);
      if (out.length >= max) {
        break;
      }
    }
    return out;
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.modelDisposeListener.dispose();
    for (const disposables of this.changeDisposablesByUriKey.values()) {
      for (const d of disposables) {
        d.dispose();
      }
    }
    this.changeDisposablesByUriKey.clear();
    this.fileProviders.clear();
    this.contentProviders.clear();
    this.modelService = undefined;
  }

  private attachChangeSubscriptions(uri: Monaco.Uri, provider: MonacoFileSystemProvider): void {
    const key = uri.toString();
    const sub = provider.onDidChange(uri, () => {
      void this.modelService?.refreshContent(uri);
    });
    const list = this.changeDisposablesByUriKey.get(key) ?? [];
    list.push(sub);
    this.changeDisposablesByUriKey.set(key, list);
  }

  private attachContentChangeSubscriptions(uri: Monaco.Uri, provider: MonacoTextDocumentContentProvider): void {
    if (!provider.onDidChange) {
      return;
    }
    const key = uri.toString();
    const sub = provider.onDidChange(uri, () => {
      void this.modelService?.refreshContent(uri);
    });
    const list = this.changeDisposablesByUriKey.get(key) ?? [];
    list.push(sub);
    this.changeDisposablesByUriKey.set(key, list);
  }
}
