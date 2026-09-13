import type * as Monaco from 'monaco-editor';
import type * as LSP from 'vscode-languageserver-protocol';

/** @public */
export type MonacoLspDocumentSync = Readonly<{
  didOpen: (parameters: LSP.DidOpenTextDocumentParams) => void;
  didChange: (parameters: LSP.DidChangeTextDocumentParams) => void;
  didClose: (parameters: LSP.DidCloseTextDocumentParams) => void;
}>;

/** @public */
export type MonacoLspBindingExtras = Readonly<{
  afterOpen?: (model: Monaco.editor.ITextModel) => void;
  afterChange?: (model: Monaco.editor.ITextModel, parameters: LSP.DidChangeTextDocumentParams) => void;
  afterClose?: (uri: string) => void;
}>;

/** @public */
export type BindMonacoModelsToLspConnectionParameters = Readonly<{
  monaco: typeof Monaco;
  languageId: string;
  lsp: MonacoLspDocumentSync;
  extras?: MonacoLspBindingExtras;
}>;

/**
 * Bind Monaco model lifecycle to LSP `textDocument/{didOpen,didChange,didClose}`.
 *
 * @public
 */
export function bindMonacoModelsToLspConnection(
  parameters: BindMonacoModelsToLspConnectionParameters,
): Monaco.IDisposable {
  const { monaco, languageId, lsp, extras } = parameters;
  const openedDocuments = new Set<string>();
  const documentVersions = new Map<string, number>();
  const contentDisposables = new Map<string, Monaco.IDisposable>();

  const syncClose = (uri: string): void => {
    if (!openedDocuments.has(uri)) {
      return;
    }

    openedDocuments.delete(uri);
    documentVersions.delete(uri);
    const contentDisposable = contentDisposables.get(uri);
    if (contentDisposable) {
      contentDisposable.dispose();
      contentDisposables.delete(uri);
    }

    lsp.didClose({ textDocument: { uri } });
    extras?.afterClose?.(uri);
  };

  const syncOpen = (model: Monaco.editor.ITextModel): void => {
    if (model.getLanguageId() !== languageId) {
      return;
    }

    const uri = model.uri.toString();
    if (openedDocuments.has(uri)) {
      return;
    }

    openedDocuments.add(uri);
    documentVersions.set(uri, 1);
    const text = model.getValue();

    lsp.didOpen({
      textDocument: {
        uri,
        languageId,
        version: 1,
        text,
      },
    });
    extras?.afterOpen?.(model);

    const changeDisposable = model.onDidChangeContent(() => {
      const version = (documentVersions.get(uri) ?? 0) + 1;
      documentVersions.set(uri, version);
      const parameters: LSP.DidChangeTextDocumentParams = {
        textDocument: { uri, version },
        contentChanges: [{ text: model.getValue() }],
      };
      lsp.didChange(parameters);
      extras?.afterChange?.(model, parameters);
    });
    contentDisposables.set(uri, changeDisposable);
  };

  for (const model of monaco.editor.getModels()) {
    if (model.getLanguageId() === languageId) {
      syncOpen(model);
    }
  }

  const subs: Monaco.IDisposable[] = [
    monaco.editor.onDidCreateModel((model) => {
      if (model.getLanguageId() === languageId) {
        syncOpen(model);
      }
    }),
    monaco.editor.onWillDisposeModel((model) => {
      if (model.getLanguageId() === languageId) {
        syncClose(model.uri.toString());
      }
    }),
    monaco.editor.onDidChangeModelLanguage((event) => {
      const uri = event.model.uri.toString();
      if (event.oldLanguage === languageId && event.model.getLanguageId() !== languageId) {
        syncClose(uri);
      } else if (event.oldLanguage !== languageId && event.model.getLanguageId() === languageId) {
        syncOpen(event.model);
      }
    }),
  ];

  return {
    dispose(): void {
      for (const sub of subs) {
        sub.dispose();
      }

      for (const disposable of contentDisposables.values()) {
        disposable.dispose();
      }

      contentDisposables.clear();
      openedDocuments.clear();
      documentVersions.clear();
    },
  };
}
