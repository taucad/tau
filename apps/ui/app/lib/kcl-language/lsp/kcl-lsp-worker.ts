/**
 * Web Worker that hosts the KCL WASM LSP server.
 *
 * This worker:
 * 1. Loads the WASM module
 * 2. Creates the LSP server configuration
 * 3. Runs the KCL LSP server
 * 4. Routes messages between the main thread and the WASM LSP
 */

import type { JSONRPCRequest, JSONRPCResponse } from 'json-rpc-2.0';
import init, { LspServerConfig, lsp_run_kcl } from '@taucad/kcl-wasm-lib';
import wasmPath from '@taucad/kcl-wasm-lib/kcl.wasm?url';
import { attachLanguageFsClient } from '@taucad/lsp-fs/client';
import { joinPath } from '@taucad/utils/path';
import { URI, Utils } from 'vscode-uri';
import { Queue } from '#lib/kcl-language/lsp/codec/queue.js';
import { StreamDemuxer } from '#lib/kcl-language/lsp/codec/stream-demuxer.js';
import { createKclLogger } from '#lib/kcl-language/lsp/kcl-logs.js';
import { lspWorkerEventType, kclWorkerType } from '#lib/kcl-language/lsp/kcl-lsp-types.js';
import type {
  KclLspWorkerOptions,
  LspWorkerEvent,
  SetDocumentContextPayload,
} from '#lib/kcl-language/lsp/kcl-lsp-types.js';
import { encodeMessage, decodeMessage } from '#lib/kcl-language/lsp/codec/utils.js';
import type { LanguageFsClient } from '@taucad/lsp-fs/client';

const log = createKclLogger('LSP Worker');

type WorkerFsState = Readonly<{
  workspaceRootPath: string;
  documentUri: string | undefined;
}>;

let workerFsState: WorkerFsState = { workspaceRootPath: '', documentUri: undefined };

const pendingLanguageFsResponses = new Map<
  string | number,
  { resolve: (value: JSONRPCResponse) => void; reject: (reason: Error) => void }
>();

let languageFs: LanguageFsClient | undefined;

function wasmPathToFileUri(rawPath: string): string {
  if (rawPath.startsWith('file://')) {
    return URI.parse(rawPath).toString();
  }

  if (rawPath.startsWith('/')) {
    return URI.file(rawPath).toString();
  }

  const documentUriForJoin = workerFsState.documentUri
    ? URI.parse(workerFsState.documentUri)
    : URI.file(workerFsState.workspaceRootPath);
  const baseDirectoryForJoin = Utils.joinPath(documentUriForJoin, '..');
  return Utils.joinPath(baseDirectoryForJoin, rawPath).toString();
}

function ensureLanguageFs(): LanguageFsClient {
  if (!languageFs) {
    throw new Error('lsp-fs client not initialized');
  }

  return languageFs;
}

/**
 * FileSystemBridge provides filesystem access to the WASM LSP — backed by
 * {@link attachLanguageFsClient} + main-thread `serveLanguageFileSystemRequests`.
 */
class FileSystemBridge {
  /**
   * Called from WASM to read a file.
   */
  public async readFile(path: string): Promise<Uint8Array<ArrayBuffer>> {
    log.debug('FileSystem.readFile called:', path);
    const uri = wasmPathToFileUri(path);
    const data = await ensureLanguageFs().readFile(uri);
    return data;
  }

  /**
   * Called from WASM to check if a file exists.
   */
  public async exists(path: string): Promise<boolean> {
    log.debug('FileSystem.exists called:', path);
    const uri = wasmPathToFileUri(path);
    try {
      await ensureLanguageFs().stat(uri);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Called from WASM to list files in a directory.
   * WASM expects this to return a Promise<string> (JSON stringified array).
   */
  public async getAllFiles(path: string): Promise<string> {
    log.debug('FileSystem.getAllFiles called:', path);
    const uri = wasmPathToFileUri(path);
    const entries = await ensureLanguageFs().readDirectory(uri);
    const names = entries.map((entry) => entry[0]);
    return JSON.stringify(names);
  }
}

const intoServer = new Queue<Uint8Array<ArrayBuffer>>();
const fromServer = new StreamDemuxer();
const fileSystemBridge = new FileSystemBridge();
let isWasmReady = false;

let resolveWasmReady: () => void = () => {
  // Placeholder - replaced by handleInitEvent
};

let wasmReadyPromise: Promise<void> = new Promise<void>((resolve) => {
  resolveWasmReady = resolve;
});

async function initializeWasm(wasmUrl: string): Promise<void> {
  log.debug('Fetching WASM from:', wasmUrl);
  const input = await fetch(wasmUrl);
  log.debug('WASM fetch complete, getting buffer...');
  const buffer = await input.arrayBuffer();
  log.debug('Initializing WASM module...');
  await init(buffer);
  log.debug('WASM module initialized successfully');
}

async function runKclLsp(token: string, apiBaseUrl: string): Promise<void> {
  try {
    log.debug('Creating LSP server configuration...');
    log.debug('FileSystemBridge methods:', {
      readFile: typeof fileSystemBridge.readFile,
      exists: typeof fileSystemBridge.exists,
      getAllFiles: typeof fileSystemBridge.getAllFiles,
    });
    const config = new LspServerConfig(intoServer, fromServer, fileSystemBridge);
    log.debug('LspServerConfig created successfully');
    log.debug(
      'Starting KCL LSP server (token:',
      token ? 'provided' : 'empty',
      ', baseUrl:',
      apiBaseUrl || 'empty',
      ')',
    );

    // Signal that WASM is ready before starting the server
    isWasmReady = true;
    resolveWasmReady();
    log.debug('WASM ready signal sent');

    await lsp_run_kcl(config, token, apiBaseUrl);
    log.debug('LSP server exited normally');
  } catch (error) {
    log.error('LSP server error:', error);
    // Even on error, mark as ready so pending requests don't hang forever
    isWasmReady = true;
    resolveWasmReady();
  }
}

function initLanguageFsBridge(init: KclLspWorkerOptions): void {
  workerFsState = { workspaceRootPath: init.workspaceRootPath, documentUri: undefined };

  languageFs = attachLanguageFsClient({
    filePoolBuffer: init.filePoolBuffer,
    absolutePathForUri(uri: string): string {
      const fsPath = URI.parse(uri).path;
      const relative = fsPath.startsWith('/') ? fsPath.slice(1) : fsPath;
      return joinPath(workerFsState.workspaceRootPath, relative);
    },
    sendJsonRpc: async (payload) => {
      return new Promise<JSONRPCResponse>((resolve, reject) => {
        const request = payload;
        const { id } = request;
        if (id === null || id === undefined) {
          reject(new Error('lsp-fs: missing JSON-RPC id'));
          return;
        }

        pendingLanguageFsResponses.set(id, { resolve, reject });
        globalThis.postMessage({
          worker: kclWorkerType,
          eventType: lspWorkerEventType.languageFsJsonRpc,
          eventData: request,
        });
      });
    },
  });
}

async function handleInitEvent(eventData: KclLspWorkerOptions): Promise<void> {
  const { wasmUrl, token, apiBaseUrl } = eventData;
  const actualWasmUrl = wasmUrl || wasmPath;
  log.debug('Init event received, wasmUrl:', actualWasmUrl);

  wasmReadyPromise = new Promise((resolve) => {
    resolveWasmReady = resolve;
  });

  try {
    await initializeWasm(actualWasmUrl);
    log.debug('WASM module loaded, starting LSP...');
    initLanguageFsBridge(eventData);
    // Don't await - let it run in background
    void runKclLsp(token, apiBaseUrl);
    // Wait for the LSP to be ready before processing more messages
    await wasmReadyPromise;
    log.debug('LSP initialization complete');
  } catch (error) {
    log.error('Failed to initialize WASM:', error);
    isWasmReady = true;
    resolveWasmReady();
  }
}

async function handleCallEvent(data: Uint8Array<ArrayBuffer>): Promise<void> {
  const json = decodeMessage<JSONRPCRequest>(data);
  log.debug('Call event received:', json.method, 'id:', json.id);

  // Wait for WASM to be ready
  if (!isWasmReady) {
    log.debug('Waiting for WASM to be ready...');
    await wasmReadyPromise;
    log.debug('WASM is ready, processing request');
  }

  // Enqueue the message for the WASM LSP to process
  intoServer.enqueue(data);
  log.debug('Message enqueued for LSP');

  // If this is a request (has an ID), wait for the response
  if (json.id !== null && json.id !== undefined) {
    log.debug('Waiting for response to request id:', json.id);
    try {
      const response = await fromServer.responses.get(json.id);
      log.debug('Got response for id:', json.id, response);
      const encoded = encodeMessage(response as JSONRPCResponse);
      globalThis.postMessage(encoded);
      log.debug('Response sent to client');
    } catch (error) {
      log.error('Error getting response:', error);
      // Send JSON-RPC error response back to client per spec
      const errorResponse: JSONRPCResponse = {
        jsonrpc: '2.0',
        id: json.id,
        error: {
          code: -32_603,
          message: error instanceof Error ? error.message : 'Internal error',
        },
      };
      globalThis.postMessage(encodeMessage(errorResponse));
      log.debug('Error response sent to client');
    }
  }
}

function handleLanguageFsJsonRpcResponse(payload: JSONRPCResponse): void {
  const { id } = payload;
  if (typeof id !== 'string' && typeof id !== 'number') {
    return;
  }

  const pending = pendingLanguageFsResponses.get(id);
  if (!pending) {
    log.debug('No pending lsp-fs response for id:', id);
    return;
  }

  pendingLanguageFsResponses.delete(id);
  pending.resolve(payload);
}

function handleMessage(event: MessageEvent): void {
  const { eventType, eventData } = event.data as LspWorkerEvent;
  log.debug('Message received, type:', eventType);

  switch (eventType) {
    case lspWorkerEventType.init: {
      void handleInitEvent(eventData as KclLspWorkerOptions);
      break;
    }

    case lspWorkerEventType.call: {
      void handleCallEvent(eventData as Uint8Array<ArrayBuffer>);
      break;
    }

    case lspWorkerEventType.setDocumentContext: {
      const { documentUri } = eventData as SetDocumentContextPayload;
      workerFsState = { workspaceRootPath: workerFsState.workspaceRootPath, documentUri };
      break;
    }

    case lspWorkerEventType.languageFsJsonRpc: {
      handleLanguageFsJsonRpcResponse(eventData as JSONRPCResponse);
      break;
    }

    default: {
      log.error('Unknown event type:', eventType);
    }
  }
}

globalThis.addEventListener('message', handleMessage);

async function forwardRequests(): Promise<void> {
  log.debug('Starting request forwarder...');
  for await (const request of fromServer.requests) {
    log.debug('Forwarding request from server:', request);
    const encoded = encodeMessage(request as JSONRPCRequest);
    globalThis.postMessage(encoded);
  }
}

async function forwardNotifications(): Promise<void> {
  log.debug('Starting notification forwarder...');
  for await (const notification of fromServer.notifications) {
    log.debug('Forwarding notification from server:', notification);
    const encoded = encodeMessage(notification as JSONRPCRequest);
    globalThis.postMessage(encoded);
  }
}

// oxlint-disable-next-line unicorn/prefer-top-level-await -- worker context
void forwardRequests();
// oxlint-disable-next-line unicorn/prefer-top-level-await -- worker context
void forwardNotifications();

log.debug('Worker initialized, waiting for messages...');
