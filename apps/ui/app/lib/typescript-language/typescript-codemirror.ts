import type { Extension } from '@codemirror/state';
import { Topic } from '@taucad/events';
import { openTauLanguageHostPort } from '@taucad/lsp/language-fs-sync-host';
import type { ComposedViewClient } from '@taucad/fs-client/composed-view-client';
import { URI } from 'vscode-uri';
import { ENV } from '#environment.config.js';
import type { EditorLanguageRequest } from '#lib/editor-language-runtime.js';
import { applyEditorWorkspaceEdits } from '#lib/editor-workspace-edits.js';
import { createTypeScriptExtensions } from '#lib/typescript-language/create-typescript-extensions.js';
import { registerTypeScriptRenameParticipant } from '#lib/typescript-language/typescript-rename-participant.js';
import { createTypeScriptService } from '#lib/typescript-language/typescript-service.js';
import type { TypeScriptService } from '#lib/typescript-language/typescript-service.js';

type SharedService = {
  promise: Promise<TypeScriptService>;
  references: number;
  abort: AbortController;
  stopRename?: () => void;
  failures: Topic<Error>;
};
const services = new WeakMap<EditorLanguageRequest['environment']['session'], SharedService>();
const decoder = new TextDecoder();

function reportTypeScriptError(error: Error): void {
  // oxlint-disable-next-line no-console -- semantic failure should remain visible without stopping text editing.
  console.warn('[typescript] language service operation failed', error);
}

async function waitForReader(
  request: EditorLanguageRequest,
  signal: AbortSignal,
): Promise<ComposedViewClient | undefined> {
  const { fileManagerRef } = request.environment;
  const initial = fileManagerRef.getSnapshot();
  if (initial.matches('ready') && initial.context.viewClient) {
    return initial.context.viewClient as ComposedViewClient;
  }
  return new Promise((resolve, reject) => {
    const abort = (): void => {
      subscription.unsubscribe();
      reject(new Error('TypeScript language acquisition aborted'));
    };
    const subscription = fileManagerRef.subscribe((snapshot) => {
      const client = snapshot.context.viewClient;
      if (snapshot.matches('error')) {
        signal.removeEventListener('abort', abort);
        subscription.unsubscribe();
        resolve(undefined);
      } else if (snapshot.matches('ready') && client) {
        signal.removeEventListener('abort', abort);
        subscription.unsubscribe();
        resolve(client);
      }
    });
    signal.addEventListener('abort', abort, { once: true });
    const current = fileManagerRef.getSnapshot();
    if (current.matches('ready') && current.context.viewClient) {
      signal.removeEventListener('abort', abort);
      subscription.unsubscribe();
      resolve(current.context.viewClient as ComposedViewClient);
    } else if (current.matches('error')) {
      signal.removeEventListener('abort', abort);
      subscription.unsubscribe();
      resolve(undefined);
    }
    if (signal.aborted) {
      abort();
    }
  });
}

async function bootService(
  request: EditorLanguageRequest,
  signal: AbortSignal,
  onWorkerFailure: (error: Error) => void,
): Promise<TypeScriptService> {
  const dependencyReader = await waitForReader(request, signal);
  signal.throwIfAborted();
  return createTypeScriptService({
    openLanguageHostPort: () => openTauLanguageHostPort(request.environment.fileManagerRef),
    dependencyReader,
    dynamicTypes: ENV.TAU_ACQUISITION !== 'locked',
    onError: reportTypeScriptError,
    onWorkerFailure,
    readProjectFile: async (path) => {
      try {
        return decoder.decode(await request.environment.contentService.resolveBytes(path));
      } catch {
        return undefined;
      }
    },
  });
}

async function waitForShared(entry: SharedService, signal: AbortSignal): Promise<TypeScriptService> {
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => {
      reject(new Error('TypeScript language acquisition aborted'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    signal.throwIfAborted();
    return await Promise.race([entry.promise, aborted]);
  } finally {
    if (onAbort) {
      signal.removeEventListener('abort', onAbort);
    }
  }
}

async function disposeWhenReady(entry: SharedService): Promise<void> {
  try {
    const service = await entry.promise;
    service.dispose();
  } catch {
    // A cancelled boot has no worker to dispose.
  }
}

async function detachSafely(service: TypeScriptService, document: EditorLanguageRequest['document']): Promise<void> {
  try {
    await service.detach(document);
  } catch (error) {
    reportTypeScriptError(error instanceof Error ? error : new Error(String(error)));
  }
}

/** Acquire one project service per editor session and one worker mirror per document. */
export async function acquireTypeScriptLanguage(
  request: EditorLanguageRequest,
): Promise<{ extensions: Extension[]; dispose(): void }> {
  request.signal.throwIfAborted();
  const { environment, document } = request;
  let shared = services.get(environment.session);
  if (!shared) {
    const abort = new AbortController();
    const created: SharedService = {
      promise: undefined as unknown as Promise<TypeScriptService>,
      references: 0,
      abort,
      failures: new Topic<Error>({ name: 'TypeScriptWorker.failure' }),
    };
    const promise = bootService(request, abort.signal, (error) => {
      reportTypeScriptError(error);
      if (services.get(environment.session) === created) {
        services.delete(environment.session);
      }
      created.abort.abort();
      created.stopRename?.();
      void disposeWhenReady(created);
      created.failures.emit(error);
      created.failures.dispose();
    });
    created.promise = promise;
    shared = created;
    services.set(environment.session, shared);
  }
  const entry = shared;
  entry.references += 1;
  let unsubscribeFailure: (() => void) | undefined;
  let service: TypeScriptService | undefined;
  let attached = false;
  let disposed = false;
  const dispose = (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    if (attached && service) {
      void detachSafely(service, document);
    }
    unsubscribeFailure?.();
    entry.references -= 1;
    if (entry.references === 0) {
      entry.abort.abort();
      entry.stopRename?.();
      if (services.get(environment.session) === entry) {
        services.delete(environment.session);
      }
      void disposeWhenReady(entry);
    }
  };
  try {
    service = await waitForShared(entry, request.signal);
    request.signal.throwIfAborted();
    entry.stopRename ??= registerTypeScriptRenameParticipant(environment, service);
    await service.attach(document);
    attached = true;
    request.signal.throwIfAborted();
    const extensions = createTypeScriptExtensions({
      document,
      service,
      navigate: environment.navigate,
      publishDiagnostics: (uri, version, diagnostics) => {
        if (document.uri === uri && document.version === version) {
          environment.diagnostics.set(uri, 'typescript', diagnostics);
        }
      },
      applyWorkspaceEdits: async (edits) => applyEditorWorkspaceEdits(environment, edits),
      workspaceScriptUris: () =>
        [...environment.treeService.getTreeSnapshot()]
          .filter(([path, entry]) => entry.type === 'file' && /\.(?:ts|tsx|js|jsx|mts|cts|mjs|cjs)$/u.test(path))
          .map(([path]) => URI.file(`/${path}`).toString()),
      onError: reportTypeScriptError,
    });
    if (request.onFailure) {
      unsubscribeFailure = entry.failures.subscribe(request.onFailure, { signal: request.signal });
    }
    return { extensions, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
