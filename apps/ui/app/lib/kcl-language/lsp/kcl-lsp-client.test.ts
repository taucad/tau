/**
 * KclLspClient protocol and lifecycle tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { JSONRPCRequest, JSONRPCResponse } from 'json-rpc-2.0';
import { WorkspacePathResolver } from '@taucad/fs-client/workspace-path-resolver';
import type { FileTreeService } from '@taucad/fs-client/file-tree-service';
import { KclLspClient } from '#lib/kcl-language/lsp/kcl-lsp-client.js';
import { lspWorkerEventType, kclWorkerType } from '#lib/kcl-language/lsp/kcl-lsp-types.js';
import type { LspWorkerEvent, KclLspWorkerOptions } from '#lib/kcl-language/lsp/kcl-lsp-types.js';
import { addHeaders } from '#lib/kcl-language/lsp/codec/headers.js';
import { decodeMessage } from '#lib/kcl-language/lsp/codec/utils.js';

type MessageListener = (event: MessageEvent) => void;

function createTestFs(overrides?: { readonly readFile?: (path: string) => Promise<Uint8Array<ArrayBuffer>> }) {
  const readFile = overrides?.readFile ?? vi.fn().mockResolvedValue(new Uint8Array(new ArrayBuffer(3)));
  const paths = new WorkspacePathResolver('/w');
  return {
    fileManager: { readFile },
    treeService: { stat: vi.fn(), listDirectory: vi.fn() } as unknown as FileTreeService,
    proxy: { searchFiles: vi.fn().mockReturnValue([]) },
    paths,
  };
}

class GenericMockWorker {
  public postMessageCalls: unknown[] = [];
  public terminated = false;

  private messageListeners: MessageListener[] = [];

  public addEventListener(type: string, listener: MessageListener): void {
    if (type === 'message') {
      this.messageListeners.push(listener);
    }
  }

  public removeEventListener(type: string, listener: MessageListener): void {
    if (type === 'message') {
      this.messageListeners = this.messageListeners.filter((l) => l !== listener);
    }
  }

  public postMessage(data: unknown): void {
    this.postMessageCalls.push(data);

    const event = data as LspWorkerEvent;
    if (event.eventType === lspWorkerEventType.init) {
      return;
    }

    if (event.eventType === lspWorkerEventType.call) {
      this.respondToMessage(event.eventData as Uint8Array<ArrayBuffer>);
    }
  }

  public terminate(): void {
    this.terminated = true;
  }

  public emitMessageToClient(data: LspWorkerEvent): void {
    for (const listener of this.messageListeners) {
      listener(new MessageEvent('message', { data }));
    }
  }

  private respondToMessage(data: Uint8Array<ArrayBuffer>): void {
    const request = decodeMessage<JSONRPCRequest>(data);

    if (request.id === null || request.id === undefined) {
      return;
    }

    const result =
      request.method === 'initialize'
        ? {
            capabilities: { hoverProvider: true, completionProvider: {} },
            serverInfo: { name: 'mock', version: '0.0.1' },
          }
        : {};

    const response = JSON.stringify({ jsonrpc: '2.0', id: request.id, result });
    const encoded = new TextEncoder().encode(addHeaders(response));

    queueMicrotask(() => {
      for (const listener of this.messageListeners) {
        listener(new MessageEvent('message', { data: encoded }));
      }
    });
  }
}

let mockWorker: GenericMockWorker;

beforeEach(() => {
  mockWorker = new GenericMockWorker();

  vi.stubGlobal(
    'Worker',
    new Proxy(GenericMockWorker, {
      construct() {
        return mockWorker;
      },
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('KclLspClient', () => {
  describe('initialization', () => {
    it('should initialize and become ready', async () => {
      const client = new KclLspClient({ fs: createTestFs() });
      expect(client.ready).toBe(false);

      await client.initialize();
      await client.waitForReady();

      expect(client.ready).toBe(true);
    });

    it('should send init event with worker options', async () => {
      const client = new KclLspClient({ fs: createTestFs() });
      await client.initialize();

      const initCall = mockWorker.postMessageCalls.find(
        (call) => (call as LspWorkerEvent).eventType === lspWorkerEventType.init,
      ) as LspWorkerEvent | undefined;

      expect(initCall).toBeDefined();
      const options = initCall!.eventData as KclLspWorkerOptions;
      expect(options.workspaceRootPath).toBe('/w');
    });

    it('should call onInitialized callback', async () => {
      const onInitialized = vi.fn();
      const client = new KclLspClient({ fs: createTestFs(), onInitialized });
      await client.initialize();

      expect(onInitialized).toHaveBeenCalledOnce();
    });
  });

  describe('lsp-fs bridge', () => {
    it('should answer worker fs/content JSON-RPC via fileManager.readFile', async () => {
      const readFile = vi.fn().mockResolvedValue(new Uint8Array([9, 9, 9]));
      const client = new KclLspClient({ fs: createTestFs({ readFile }) });
      await client.initialize();
      await client.waitForReady();

      mockWorker.emitMessageToClient({
        worker: kclWorkerType,
        eventType: lspWorkerEventType.languageFsJsonRpc,
        eventData: {
          jsonrpc: '2.0',
          id: 77,
          method: 'fs/content',
          params: { uri: 'file:///public/x.kcl' },
        },
      });

      await vi.waitFor(() => {
        const hit = mockWorker.postMessageCalls.find(
          (c) =>
            (c as LspWorkerEvent).eventType === lspWorkerEventType.languageFsJsonRpc &&
            typeof (c as LspWorkerEvent).eventData === 'object' &&
            'id' in ((c as LspWorkerEvent).eventData as JSONRPCResponse) &&
            ((c as LspWorkerEvent).eventData as JSONRPCResponse).id === 77 &&
            'result' in ((c as LspWorkerEvent).eventData as JSONRPCResponse),
        );
        expect(hit).toBeDefined();
      });

      expect(readFile).toHaveBeenCalledWith('public/x.kcl');

      const responseCall = mockWorker.postMessageCalls.find(
        (c) =>
          (c as LspWorkerEvent).eventType === lspWorkerEventType.languageFsJsonRpc &&
          typeof (c as LspWorkerEvent).eventData === 'object' &&
          'result' in ((c as LspWorkerEvent).eventData as JSONRPCResponse),
      ) as LspWorkerEvent | undefined;
      expect(responseCall).toBeDefined();
      const body = responseCall!.eventData as JSONRPCResponse;
      expect(body.id).toBe(77);
      const result = body.result as { dataBase64: string };
      expect(typeof result.dataBase64).toBe('string');
      expect(result.dataBase64.length).toBeGreaterThan(0);
    });
  });

  describe('dispose', () => {
    it('should terminate the worker and clear ready state', async () => {
      const client = new KclLspClient({ fs: createTestFs() });
      await client.initialize();
      expect(client.ready).toBe(true);

      client.dispose();
      expect(mockWorker.terminated).toBe(true);
      expect(client.ready).toBe(false);
    });

    it('should reject requests after dispose', async () => {
      const client = new KclLspClient({ fs: createTestFs() });
      await client.initialize();
      client.dispose();

      await expect(
        client.textDocumentHover({
          textDocument: { uri: 'file:///test.kcl' },
          position: { line: 0, character: 0 },
        }),
      ).rejects.toThrow();
    });
  });
});
