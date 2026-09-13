/**
 * Monaco Language Test Stub
 *
 * Minimal in-memory fake for the Monaco surface that {@link LanguageContributionRegistry}
 * and language contributions interact with. Mirrors the deduplication semantics of
 * `monaco.languages.onLanguage`, which fires at most once per language id (matching
 * VS Code's `requestRichLanguageFeatures`).
 *
 * The stub intentionally exposes ONLY the Monaco surface the registry calls
 * (`monaco.languages.onLanguage`, `monaco.editor.getModels`,
 * `monaco.editor.getModel`, `monaco.editor.createModel`,
 * `monaco.editor.onDidCreateModel`,
 * `monaco.editor.onDidChangeModelLanguage`). Anything else is undefined so a
 * leaky test is loud.
 */
import type * as Monaco from 'monaco-editor';

type OnLanguageCallback = () => void;
type ModelLanguageChangeEvent = {
  readonly model: Monaco.editor.ITextModel;
  readonly oldLanguage: string;
};

export type StubModel = Monaco.editor.ITextModel & {
  __setLanguageForTest(language: string): void;
};

export type MonacoTestStub = {
  /** Cast as `typeof Monaco` for passing into the registry. */
  readonly monaco: typeof Monaco;
  /** Manually fire `onLanguage` for an id (Monaco fires this when a model is created in that id). */
  __triggerOnLanguage(id: string): void;
  /** Snapshot of all currently-live models. */
  __getModels(): readonly Monaco.editor.ITextModel[];
  /** Create a fake model and fire the matching `onLanguage` callback (deduped per id). */
  __createModel(uri: string, languageId: string): StubModel;
  /** Reset everything — call from `afterEach`. */
  __reset(): void;
};

const noopDisposable: Monaco.IDisposable = { dispose: () => undefined };

export function createMonacoTestStub(): MonacoTestStub {
  const onLanguageCallbacks = new Map<string, Set<OnLanguageCallback>>();
  const firedLanguageIds = new Set<string>();
  const createModelCallbacks = new Set<(model: Monaco.editor.ITextModel) => void>();
  const languageChangeCallbacks = new Set<(event: ModelLanguageChangeEvent) => void>();
  const models = new Map<string, StubModel>();

  const fireOnLanguage = (id: string): void => {
    if (firedLanguageIds.has(id)) {
      return;
    }
    firedLanguageIds.add(id);
    const callbacks = onLanguageCallbacks.get(id);
    if (!callbacks) {
      return;
    }
    for (const callback of callbacks) {
      callback();
    }
  };

  const createStubModel = (uri: string, languageId: string): StubModel => {
    let currentLanguage = languageId;
    const model = {
      uri: { toString: () => uri },
      getLanguageId(): string {
        return currentLanguage;
      },
      getValue(): string {
        return '';
      },
      dispose(): void {
        models.delete(uri);
      },
      __setLanguageForTest(next: string): void {
        const previous = currentLanguage;
        if (previous === next) {
          return;
        }
        currentLanguage = next;
        for (const callback of languageChangeCallbacks) {
          callback({ model: model as unknown as Monaco.editor.ITextModel, oldLanguage: previous });
        }
        fireOnLanguage(next);
      },
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- minimal shape; unused fields throw if read
    } as unknown as StubModel;
    return model;
  };

  const monaco = {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- mirrors `monaco.Uri` export shape
    Uri: {
      parse(uri: string): { toString(): string } {
        return { toString: () => uri };
      },
    },
    languages: {
      onLanguage(id: string, callback: OnLanguageCallback): Monaco.IDisposable {
        let callbacks = onLanguageCallbacks.get(id);
        if (!callbacks) {
          callbacks = new Set();
          onLanguageCallbacks.set(id, callbacks);
        }
        callbacks.add(callback);

        if (firedLanguageIds.has(id)) {
          callback();
        }

        const ownerCallbacks = callbacks;
        return {
          dispose(): void {
            ownerCallbacks.delete(callback);
          },
        };
      },
      register(): void {
        // No-op: stub does not validate language metadata
      },
      setLanguageConfiguration(): Monaco.IDisposable {
        return noopDisposable;
      },
      // The following provider registrars are wired so contributions whose
      // `activate()` registers Monaco providers (KCL LSP, JS/TS definition,
      // OpenSCAD completion, etc.) do not crash inside the stub. Each returns
      // a disposable so the registry's disposal path stays valid.
      registerCompletionItemProvider(): Monaco.IDisposable {
        return noopDisposable;
      },
      registerHoverProvider(): Monaco.IDisposable {
        return noopDisposable;
      },
      registerSignatureHelpProvider(): Monaco.IDisposable {
        return noopDisposable;
      },
      registerDocumentFormattingEditProvider(): Monaco.IDisposable {
        return noopDisposable;
      },
      registerDocumentSemanticTokensProvider(): Monaco.IDisposable {
        return noopDisposable;
      },
      registerFoldingRangeProvider(): Monaco.IDisposable {
        return noopDisposable;
      },
      registerRenameProvider(): Monaco.IDisposable {
        return noopDisposable;
      },
      registerDefinitionProvider(): Monaco.IDisposable {
        return noopDisposable;
      },
      registerReferenceProvider(): Monaco.IDisposable {
        return noopDisposable;
      },
      registerImplementationProvider(): Monaco.IDisposable {
        return noopDisposable;
      },
      registerTypeDefinitionProvider(): Monaco.IDisposable {
        return noopDisposable;
      },
      registerLinkProvider(): Monaco.IDisposable {
        return noopDisposable;
      },
      registerCodeActionProvider(): Monaco.IDisposable {
        return noopDisposable;
      },
      registerDocumentSymbolProvider(): Monaco.IDisposable {
        return noopDisposable;
      },
    },
    editor: {
      getModels(): readonly Monaco.editor.ITextModel[] {
        return [...models.values()] as unknown as Monaco.editor.ITextModel[];
      },
      getModel(uri: { toString(): string }): Monaco.editor.ITextModel | undefined {
        const key = uri.toString();
        const model = models.get(key);
        if (!model) {
          return undefined;
        }
        return model as unknown as Monaco.editor.ITextModel;
      },
      createModel(_value: string, languageId?: string, uri?: { toString(): string }): Monaco.editor.ITextModel {
        const resolvedUri = uri?.toString() ?? `inmemory://stub/${models.size}`;
        const model = createStubModel(resolvedUri, languageId ?? 'plaintext');
        models.set(resolvedUri, model);
        for (const callback of createModelCallbacks) {
          callback(model as unknown as Monaco.editor.ITextModel);
        }
        if (languageId) {
          fireOnLanguage(languageId);
        }
        return model as unknown as Monaco.editor.ITextModel;
      },
      onDidCreateModel(callback: (model: Monaco.editor.ITextModel) => void): Monaco.IDisposable {
        createModelCallbacks.add(callback);
        return {
          dispose(): void {
            createModelCallbacks.delete(callback);
          },
        };
      },
      onDidChangeModelLanguage(callback: (event: ModelLanguageChangeEvent) => void): Monaco.IDisposable {
        languageChangeCallbacks.add(callback);
        return {
          dispose(): void {
            languageChangeCallbacks.delete(callback);
          },
        };
      },
      onWillDisposeModel(): Monaco.IDisposable {
        return noopDisposable;
      },
    },
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- stub exposes only the registry's Monaco surface
  } as unknown as typeof Monaco;

  return {
    monaco,
    __triggerOnLanguage(id) {
      fireOnLanguage(id);
    },
    __getModels() {
      return [...models.values()] as unknown as readonly Monaco.editor.ITextModel[];
    },
    __createModel(uri, languageId) {
      const model = createStubModel(uri, languageId);
      models.set(uri, model);
      for (const callback of createModelCallbacks) {
        callback(model as unknown as Monaco.editor.ITextModel);
      }
      fireOnLanguage(languageId);
      return model;
    },
    __reset() {
      onLanguageCallbacks.clear();
      firedLanguageIds.clear();
      createModelCallbacks.clear();
      languageChangeCallbacks.clear();
      models.clear();
    },
  };
}
