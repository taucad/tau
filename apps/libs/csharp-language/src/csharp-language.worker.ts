/// <reference lib="webworker" />
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
import { loadCSharpServer } from '#dotnet-host.js';
import type { CSharpServerExports } from '#dotnet-host.js';
import { csharpWorkspaceLimits } from '#protocol.js';
import type { CSharpWorkerCommand, CSharpWorkerEvent } from '#protocol.js';
import { WorkspaceSnapshot } from '#workspace-snapshot.js';

const scope = globalThis as unknown as DedicatedWorkerGlobalScope;
const pendingFs = new Map<string | number, (response: JSONRPCResponse) => void>();
const snapshot = new WorkspaceSnapshot();
let server: CSharpServerExports | undefined;
let fs: LanguageFsClient | undefined;
let queue: Promise<unknown> = Promise.resolve();

const post = (event: CSharpWorkerEvent): void => {
  scope.postMessage(event);
};

/** Serialize every server call: the runtime has one thread and Roslyn state must not interleave. */
const enqueue = async <T>(work: () => Promise<T>): Promise<T> => {
  const next = queue.then(work, work);
  queue = next.catch(() => undefined);
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

const initialize = async (command: Extract<CSharpWorkerCommand, { type: 'init' }>): Promise<void> => {
  fs = attachLanguageFsClient({
    filePoolBuffer: command.filePoolBuffer,
    absolutePathForUri: (uri) => joinPath(command.rootDirectory, languageFileUriToWorkspaceRelative(uri)),
    sendJsonRpc: async (request: JSONRPCRequest) =>
      new Promise<JSONRPCResponse | undefined>((resolve) => {
        pendingFs.set(request.id ?? '', resolve);
        post({ type: 'fs-request', request });
      }),
  });
  server = await loadCSharpServer({ assets: command.assets });
  const files = await synchronizeWorkspace();
  post({ type: 'ready', files });
  // Bind the first program while the editor attaches, so the first completion does not pay interpreter warm-up.
  enqueue(async () => server?.warmUp()).catch(() => undefined);
};

scope.addEventListener('message', (event: MessageEvent<CSharpWorkerCommand>) => {
  const command = event.data;
  switch (command.type) {
    case 'init': {
      initialize(command).catch(fail);
      break;
    }
    case 'lsp': {
      enqueue(async () => server?.handle(command.message))
        .then((response) => {
          if (response) {
            post({ type: 'lsp', message: response });
          }
        })
        .catch(fail);
      break;
    }
    case 'fs-response': {
      const resolve = pendingFs.get(command.response.id ?? '');
      pendingFs.delete(command.response.id ?? '');
      resolve?.(command.response);
      break;
    }
    case 'refresh': {
      synchronizeWorkspace().catch(fail);
      break;
    }
  }
});
