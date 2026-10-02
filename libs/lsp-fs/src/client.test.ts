import { JSONRPCServer } from 'json-rpc-2.0';
import type { JSONRPCID, JSONRPCRequest } from 'json-rpc-2.0';
import { describe, it, expect, vi } from 'vitest';
import { SharedPool } from '@taucad/memory';
import { joinPath } from '@taucad/utils/path';

import { attachLanguageFsClient } from '#client.js';
import type { FileType } from '#protocol.js';
import {
  encodeFsContentWire,
  fileType,
  fsContentRequest,
  fsFindFilesRequest,
  fsReadDirectoryRequest,
  fsStatRequest,
} from '#protocol.js';

describe('attachLanguageFsClient', () => {
  it('Tier 1: readFile issues fs/content and decodes base64', async () => {
    const server = new JSONRPCServer();
    const payload = new Uint8Array(new ArrayBuffer(3));
    payload.set([10, 20, 30]);

    server.addMethodAdvanced(fsContentRequest.method, async (request) => {
      expect(request.params).toEqual({ uri: 'file:///a.txt' });
      return {
        jsonrpc: '2.0',
        id: request.id as JSONRPCID,
        result: encodeFsContentWire(payload),
      };
    });

    const sendJsonRpc = vi.fn(async (jsonRpcRequest: JSONRPCRequest) => {
      return (await server.receive(jsonRpcRequest)) ?? undefined;
    });

    const client = attachLanguageFsClient({
      absolutePathForUri: () => '/virtual/a.txt',
      sendJsonRpc,
    });

    const out = await client.readFile('file:///a.txt');
    expect([...out]).toEqual([10, 20, 30]);
    expect(sendJsonRpc).toHaveBeenCalledOnce();
  });

  it('Tier 0: skips JSON-RPC when SharedPool has the absolute key', async () => {
    const sab = new SharedArrayBuffer(256 * 1024);
    const writerPool = new SharedPool(sab);
    const key = joinPath('/workspace', 'pool-hit.txt');
    const stored = new Uint8Array(new ArrayBuffer(2));
    stored.set([7, 8]);
    expect(writerPool.store(key, stored)).toBe(true);

    const sendJsonRpc = vi.fn();

    const reader = attachLanguageFsClient({
      filePoolBuffer: sab,
      absolutePathForUri: () => key,
      sendJsonRpc,
    });

    const out = await reader.readFile('file:///pool-hit.txt');
    expect([...out]).toEqual([7, 8]);
    expect(sendJsonRpc).not.toHaveBeenCalled();
  });

  it('forwards stat, readDirectory, and findFiles as Tier 1', async () => {
    const server = new JSONRPCServer();

    server.addMethodAdvanced(fsStatRequest.method, async (request) => {
      return {
        jsonrpc: '2.0',
        id: request.id as JSONRPCID,
        result: { type: fileType.file, size: 3, mtime: 1, ctime: 1 },
      };
    });

    server.addMethodAdvanced(fsReadDirectoryRequest.method, async (request) => {
      return {
        jsonrpc: '2.0',
        id: request.id as JSONRPCID,
        result: [['x', fileType.file]] as Array<[string, FileType]>,
      };
    });

    server.addMethodAdvanced(fsFindFilesRequest.method, async (request) => {
      expect(request.params).toEqual({ pattern: '*.txt', max: 5 });
      return {
        jsonrpc: '2.0',
        id: request.id as JSONRPCID,
        result: ['a.txt'],
      };
    });

    const sendJsonRpc = vi.fn(
      async (jsonRpcRequest: JSONRPCRequest) => (await server.receive(jsonRpcRequest)) ?? undefined,
    );

    const client = attachLanguageFsClient({
      absolutePathForUri: () => '/x',
      sendJsonRpc,
    });

    await expect(client.stat('file:///s')).resolves.toMatchObject({ type: fileType.file, size: 3 });
    await expect(client.readDirectory('file:///d')).resolves.toEqual([['x', fileType.file]]);
    await expect(client.findFiles('*.txt', 5)).resolves.toEqual(['a.txt']);
    expect(sendJsonRpc.mock.calls.length).toBe(3);
  });
});
