/**
 * Module worker hosting the Roslyn C# language server on the .NET WebAssembly runtime.
 *
 * The runtime is single-threaded, so LSP messages run one at a time in arrival order. Project files reach the server
 * through the shared `@taucad/lsp-fs` Tier 0/1 reads; the server itself performs no I/O.
 */
import type { JSONRPCRequest, JSONRPCResponse } from 'json-rpc-2.0';
import { attachLanguageFsClient } from '@taucad/lsp-fs/client';
import type { LanguageFsClient } from '@taucad/lsp-fs/client';
import { languageFileUriToWorkspaceRelative } from '@taucad/lsp-fs/uri';
import { joinPath } from '@taucad/utils/path';
import { loadCsharpServer } from '#dotnet-host.js';
import type { CsharpServerExports } from '#dotnet-host.js';
import { csharpWorkspaceLimits } from '#protocol.js';
import type { CsharpWorkerCommand, CsharpWorkerEvent } from '#protocol.js';
import { WorkspaceSnapshot } from '#workspace-snapshot.js';

const pendingFs = new Map<string | number, (response: JSONRPCResponse) => void>();
const snapshot = new WorkspaceSnapshot();
let server: CsharpServerExports | undefined;
let fs: LanguageFsClient | undefined;
let queue: Promise<unknown> = Promise.resolve();

const post = (event: CsharpWorkerEvent): void => {
  globalThis.postMessage(event);
};

/** Serialize every server call: the runtime has one thread and Roslyn state must not interleave. */
const enqueue = async <T>(work: () => Promise<T>): Promise<T> => {
  const previous = queue;
  const next = (async (): Promise<T> => {
    try {
      await previous;
    } catch {
      /* A failed earlier call does not block later ones. */
    }
    return work();
  })();
  queue = next;
  return next;
};

const notify = async (method: string, params: unknown): Promise<void> => {
  await server?.handle(JSON.stringify({ jsonrpc: '2.0', method, params }));
};

/** List and read the project's C# files, then send what changed since the previous refresh. */
const synchronizeWorkspace = async (): Promise<number> => {
  const client = fs;
  if (!client) {
    return 0;
  }
  const paths = WorkspaceSnapshot.sources(await client.findFiles('.cs', csharpWorkspaceLimits.maximumFiles + 1));
  if (paths.length > csharpWorkspaceLimits.maximumFiles) {
    throw new Error(`The C# workspace exceeds ${String(csharpWorkspaceLimits.maximumFiles)} files.`);
  }
  const texts = new Map<string, string>();
  const decoder = new TextDecoder();
  const contents = await Promise.allSettled(paths.map(async (path) => client.readFile(WorkspaceSnapshot.uriFor(path))));
  for (const [index, result] of contents.entries()) {
    if (result.status === 'fulfilled') {
      texts.set(WorkspaceSnapshot.uriFor(paths[index]!), decoder.decode(result.value));
    }
  }
  const changes = snapshot.update(texts);
  if (changes.length > 0) {
    await enqueue(async () => notify('tau/workspaceFiles', { files: changes, replace: false }));
  }
  return snapshot.size;
};

const fail = (error: unknown): void => {
  post({ type: 'fatal', message: error instanceof Error ? error.message : String(error) });
};

const guard = async (work: () => Promise<void>): Promise<void> => {
  try {
    await work();
  } catch (error) {
    fail(error);
  }
};

const initialize = async (command: Extract<CsharpWorkerCommand, { type: 'init' }>): Promise<void> => {
  fs = attachLanguageFsClient({
    filePoolBuffer: command.filePoolBuffer,
    absolutePathForUri: (uri) => joinPath(command.rootDirectory, languageFileUriToWorkspaceRelative(uri)),
    sendJsonRpc: async (request: JSONRPCRequest) =>
      new Promise<JSONRPCResponse | undefined>((resolve) => {
        pendingFs.set(request.id ?? '', resolve);
        post({ type: 'fs-request', request });
      }),
  });
  server = await loadCsharpServer({ assets: command.assets });
  const files = await synchronizeWorkspace();
  post({ type: 'ready', files });
  // Bind the first program while the editor attaches, so the first completion does not pay interpreter warm-up.
  // A warm-up failure is not fatal: the same failure surfaces on the first real request.
  try {
    await enqueue(async () => server?.warmUp());
  } catch {
    /* Reported by the next request instead. */
  }
};

const handle = async (message: string): Promise<void> => {
  const response = await enqueue(async () => server?.handle(message));
  if (response) {
    post({ type: 'lsp', message: response });
  }
};

globalThis.addEventListener('message', (event: MessageEvent<CsharpWorkerCommand>) => {
  const command = event.data;
  switch (command.type) {
    case 'init': {
      void guard(async () => initialize(command));
      break;
    }
    case 'lsp': {
      void guard(async () => handle(command.message));
      break;
    }
    case 'fs-response': {
      const resolve = pendingFs.get(command.response.id ?? '');
      pendingFs.delete(command.response.id ?? '');
      resolve?.(command.response);
      break;
    }
    case 'refresh': {
      void guard(async () => {
        await synchronizeWorkspace();
      });
      break;
    }
  }
});
