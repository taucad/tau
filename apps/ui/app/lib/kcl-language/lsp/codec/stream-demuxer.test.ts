import { describe, it, expect } from 'vitest';
import type { JSONRPCRequest, JSONRPCResponse } from 'json-rpc-2.0';
import { StreamDemuxer } from '#lib/kcl-language/lsp/codec/stream-demuxer.js';
import { encodeMessage } from '#lib/kcl-language/lsp/codec/utils.js';

function makeResponse(id: number, result: unknown): Uint8Array<ArrayBuffer> {
  return encodeMessage({ jsonrpc: '2.0', id, result } as JSONRPCResponse);
}

function makeNotification(method: string, parameters?: unknown): Uint8Array<ArrayBuffer> {
  return encodeMessage({
    jsonrpc: '2.0',
    method,
    params: parameters,
  } as JSONRPCRequest);
}

function makeRequest(id: number, method: string, parameters?: unknown): Uint8Array<ArrayBuffer> {
  return encodeMessage({
    jsonrpc: '2.0',
    id,
    method,
    params: parameters,
  } as JSONRPCRequest);
}

describe('StreamDemuxer', () => {
  it('should route response messages to the responses PromiseMap', async () => {
    const demuxer = new StreamDemuxer();

    const responsePromise = demuxer.responses.get(1);
    demuxer.add(makeResponse(1, { contents: 'hover info' }));

    const response = await responsePromise;
    expect(response.id).toBe(1);
    expect(response).toHaveProperty('result');
    expect((response as { result: { contents: string } }).result.contents).toBe('hover info');
  });

  it('should route notification messages to the notifications queue', async () => {
    const demuxer = new StreamDemuxer();

    demuxer.add(
      makeNotification('textDocument/publishDiagnostics', {
        uri: 'file:///test.kcl',
        diagnostics: [
          {
            message: 'error',
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 5 },
            },
          },
        ],
      }),
    );

    const notification = await demuxer.notifications.dequeue();
    expect(notification.method).toBe('textDocument/publishDiagnostics');
  });

  it('should route request messages to the requests queue', async () => {
    const demuxer = new StreamDemuxer();

    demuxer.add(makeRequest(10, 'client/registerCapability', { registrations: [] }));

    const request = await demuxer.requests.dequeue();
    expect(request.method).toBe('client/registerCapability');
    expect(request.id).toBe(10);
  });

  it('should handle multiple messages in a single write', async () => {
    const demuxer = new StreamDemuxer();

    const responsePromise = demuxer.responses.get(1);

    const bytes1 = makeResponse(1, 'first');
    const bytes2 = makeNotification('window/logMessage', {
      type: 3,
      message: 'hello',
    });

    const combined = new Uint8Array(bytes1.length + bytes2.length);
    combined.set(bytes1, 0);
    combined.set(bytes2, bytes1.length);
    demuxer.add(combined);

    const response = await responsePromise;
    expect(response.id).toBe(1);

    const notification = await demuxer.notifications.dequeue();
    expect(notification.method).toBe('window/logMessage');
  });

  it('should handle response error messages', async () => {
    const demuxer = new StreamDemuxer();

    const responsePromise = demuxer.responses.get(5);
    demuxer.add(
      encodeMessage({
        jsonrpc: '2.0',
        id: 5,
        error: { code: -32_601, message: 'Method not found' },
      } as JSONRPCResponse),
    );

    const response = await responsePromise;
    expect(response.id).toBe(5);
    expect(response).toHaveProperty('error');
  });

  it('should reject malformed JSON-RPC frames instead of routing them by property presence', async () => {
    const demuxer = new StreamDemuxer();

    demuxer.add(
      encodeMessage({
        jsonrpc: '2.0',
        method: 42,
        params: {},
      } as unknown as JSONRPCRequest),
    );

    expect(demuxer.notifications.length).toBe(0);
    expect(demuxer.requests.length).toBe(0);
  });

  describe('WritableStream interface', () => {
    it('should expose locked property', () => {
      const demuxer = new StreamDemuxer();
      expect(demuxer.locked).toBe(false);
    });

    it('should return a writer via getWriter', () => {
      const demuxer = new StreamDemuxer();
      const writer = demuxer.getWriter();
      expect(writer).toBeDefined();
      writer.releaseLock();
    });
  });
});
