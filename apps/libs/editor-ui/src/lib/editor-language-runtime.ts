import type { Extension } from '@codemirror/state';
import type { CsharpLanguageAssets } from '@taucad/csharp-language/protocol';
import type { OpenscadLanguageAssets } from '@taucad/openscad-language/protocol';
import type { EditorDocument } from '#lib/editor-document.js';
import type { EditorLanguageEnvironment } from '#lib/editor-language-environment.js';

export type EditorLanguageLease = Readonly<{ extensions: Extension[]; dispose(): void }>;

/**
 * What only the app build supplies: build configuration, staged server assets and workers started from an app-owned
 * module URL. Each getter is read when a language service starts, never at import.
 */
export type EditorLanguageHost = Readonly<{
  /** Whether TypeScript may fetch package types beyond the locked set. */
  dynamicTypeAcquisition: () => boolean;
  /** The staged C# language server bundle, or `undefined` when this build has none. */
  csharpAssets: () => CsharpLanguageAssets | undefined;
  /** The staged OpenSCAD language server assets, or `undefined` when this build has none. */
  openscadAssets: () => OpenscadLanguageAssets | undefined;
  /** Start the KCL language server worker. */
  createKclWorker: () => Worker;
}>;

export type EditorLanguageRequest = Readonly<{
  languageId: string;
  document: EditorDocument;
  environment: EditorLanguageEnvironment;
  host: EditorLanguageHost;
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
      return acquireKclLanguage({ ...request, createWorker: request.host.createKclWorker });
    }
    case 'openscad': {
      const { acquireOpenScadLanguage } = await import('#lib/openscad-language/openscad-codemirror.js');
      request.signal.throwIfAborted();
      return acquireOpenScadLanguage({ ...request, assets: request.host.openscadAssets() });
    }
    case 'csharp': {
      const { acquireCsharpLanguage } = await import('#lib/csharp-language/csharp-codemirror.js');
      request.signal.throwIfAborted();
      return acquireCsharpLanguage({ ...request, assets: request.host.csharpAssets() });
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
