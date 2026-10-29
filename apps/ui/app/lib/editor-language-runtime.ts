import type { Extension } from '@codemirror/state';
import type { EditorDocument } from '#lib/editor-document.js';
import type { EditorLanguageEnvironment } from '#lib/editor-language-environment.js';

export type EditorLanguageLease = Readonly<{ extensions: Extension[]; dispose(): void }>;

export type EditorLanguageRequest = Readonly<{
  languageId: string;
  document: EditorDocument;
  environment: EditorLanguageEnvironment;
  signal: AbortSignal;
  /** Report a service that fails after acquisition while plain editing remains available. */
  onFailure?: (error: Error) => void;
}>;

/** Load semantic services only for a live code pane; syntax has its own readiness boundary. */
export async function acquireEditorLanguage(request: EditorLanguageRequest): Promise<EditorLanguageLease> {
  request.signal.throwIfAborted();
  const lease = await acquireFamily(request);
  if (request.signal.aborted) {
    lease.dispose();
    request.signal.throwIfAborted();
  }
  let disposed = false;
  const dispose = (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    request.signal.removeEventListener('abort', dispose);
    lease.dispose();
  };
  request.signal.addEventListener('abort', dispose, { once: true });
  return { extensions: lease.extensions, dispose };
}

async function acquireFamily(request: EditorLanguageRequest): Promise<EditorLanguageLease> {
  switch (request.languageId) {
    case 'typescript':
    case 'typescriptreact':
    case 'tsx':
    case 'javascript':
    case 'javascriptreact':
    case 'jsx': {
      const { acquireTypeScriptLanguage } = await import('#lib/typescript-language/typescript-codemirror.js');
      request.signal.throwIfAborted();
      return acquireTypeScriptLanguage(request);
    }
    case 'kcl': {
      const { acquireKclLanguage } = await import('#lib/kcl-language/kcl-codemirror.js');
      request.signal.throwIfAborted();
      return acquireKclLanguage(request);
    }
    case 'openscad': {
      const { acquireOpenScadLanguage } = await import('#lib/openscad-language/openscad-codemirror.js');
      request.signal.throwIfAborted();
      return acquireOpenScadLanguage(request);
    }
    case 'json':
    case 'jsonc': {
      const { acquireJsonLanguage } = await import('#lib/json-language/json-codemirror.js');
      request.signal.throwIfAborted();
      return acquireJsonLanguage(request);
    }
    case 'python': {
      const [{ autocompletion }, { pythonKernelCompletions }] = await Promise.all([
        import('@codemirror/autocomplete'),
        import('#lib/python-language/python-completions.js'),
      ]);
      request.signal.throwIfAborted();
      return { extensions: [autocompletion({ override: [pythonKernelCompletions] })], dispose: () => undefined };
    }
    default: {
      return { extensions: [], dispose: () => undefined };
    }
  }
}
