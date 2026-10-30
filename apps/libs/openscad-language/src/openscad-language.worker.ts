/**
 * Module worker hosting the OpenSCAD language server's WebAssembly module.
 *
 * The server answers each JSON-RPC message synchronously, so messages run one at a time in arrival order. Project
 * files reach it through the shared `@taucad/lsp-fs` Tier 0/1 reads; the server itself performs no I/O.
 */
import type { JSONRPCRequest, JSONRPCResponse } from 'json-rpc-2.0';
import { attachLanguageFsClient } from '@taucad/lsp-fs/client';
import type { LanguageFsClient } from '@taucad/lsp-fs/client';
import { languageFileUriToWorkspaceRelative } from '@taucad/lsp-fs/uri';
import { joinPath } from '@taucad/utils/path';
import { openscadWorkspaceLimits } from '#protocol.js';
import type { OpenscadWorkerCommand, OpenscadWorkerEvent } from '#protocol.js';
import { loadOpenscadServer } from '#wasm-host.js';
import type { OpenscadServerExports } from '#wasm-host.js';
import { WorkspaceSnapshot } from '#workspace-snapshot.js';

const pendingFs = new Map<string | number, (response: JSONRPCResponse) => void>();
const snapshot = new WorkspaceSnapshot();
/** LSP messages that arrive while the module boots, replayed in order once it is ready. */
const early: string[] = [];
let server: OpenscadServerExports | undefined;
let fs: LanguageFsClient | undefined;

const post = (event: OpenscadWorkerEvent): void => {
  globalThis.postMessage(event);
};

const fail = (error: unknown): void => {
  post({ type: 'fatal', message: error instanceof Error ? error.message : String(error) });
};

/** Run one message; a trap in the module is fatal, since its state can no longer be trusted. */
const handle = (message: string): void => {
  if (!server) {
    early.push(message);
    return;
  }
  const response = server.handle(message);
  if (response) {
    post({ type: 'lsp', message: response });
  }
};

/** List and read the project's OpenSCAD files, then send what changed since the previous refresh. */
const synchronizeWorkspace = async (): Promise<number> => {
  const client = fs;
  if (!client || !server) {
    return 0;
  }
  const paths = WorkspaceSnapshot.sources(await client.findFiles('.scad', openscadWorkspaceLimits.maximumFiles + 1));
  if (paths.length > openscadWorkspaceLimits.maximumFiles) {
    throw new Error(`The OpenSCAD workspace exceeds ${String(openscadWorkspaceLimits.maximumFiles)} files.`);
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
    handle(
      JSON.stringify({ jsonrpc: '2.0', method: 'tau/workspaceFiles', params: { files: changes, replace: false } }),
    );
  }
  return snapshot.size;
};

const guard = async (work: () => Promise<void> | void): Promise<void> => {
  try {
    await work();
  } catch (error) {
    fail(error);
  }
};

const initialize = async (command: Extract<OpenscadWorkerCommand, { type: 'init' }>): Promise<void> => {
  fs = attachLanguageFsClient({
    filePoolBuffer: command.filePoolBuffer,
    absolutePathForUri: (uri) => joinPath(command.rootDirectory, languageFileUriToWorkspaceRelative(uri)),
    sendJsonRpc: async (request: JSONRPCRequest) =>
      new Promise<JSONRPCResponse | undefined>((resolve) => {
        pendingFs.set(request.id ?? '', resolve);
        post({ type: 'fs-request', request });
      }),
  });
  server = await loadOpenscadServer({ assets: command.assets });
  for (const message of early.splice(0)) {
    handle(message);
  }
  const files = await synchronizeWorkspace();
  post({ type: 'ready', files });
};

globalThis.addEventListener('message', (event: MessageEvent<OpenscadWorkerCommand>) => {
  const command = event.data;
  switch (command.type) {
    case 'init': {
      void guard(async () => initialize(command));
      break;
    }
    case 'lsp': {
      void guard(() => {
        handle(command.message);
      });
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
