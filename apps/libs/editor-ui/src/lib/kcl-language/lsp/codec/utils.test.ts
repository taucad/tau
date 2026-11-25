import { describe, it, expect } from 'vitest';
import { encodeMessage, decodeMessage } from '#lib/kcl-language/lsp/codec/utils.js';

describe('codec utils', () => {
  describe('encodeMessage', () => {
    it('should encode a JSON-RPC request to bytes with LSP headers', () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {},
      } as const;
      const result = encodeMessage(request);
      const decoded = new TextDecoder().decode(result);
      expect(decoded).toContain('Content-Length:');
      expect(decoded).toContain('"method":"initialize"');
    });

    it('should encode a JSON-RPC response', () => {
      const response = {
        jsonrpc: '2.0',
        id: 1,
        result: { capabilities: {} },
      } as const;
      const result = encodeMessage(response);
      const decoded = new TextDecoder().decode(result);
      expect(decoded).toContain('"result"');
    });
  });

  describe('decodeMessage', () => {
    it('should decode bytes back to a JSON-RPC message', () => {
      const original = { jsonrpc: '2.0', id: 1, method: 'test' } as const;
      const encoded = encodeMessage(original);
      const decoded = decodeMessage<typeof original>(encoded);
      expect(decoded).toEqual(original);
    });

    it('should roundtrip complex messages', () => {
      const original = {
        jsonrpc: '2.0',
        id: 42,
        method: 'textDocument/hover',
        params: {
          textDocument: { uri: 'file:///test.kcl' },
          position: { line: 5, character: 10 },
        },
      } as const;
      const encoded = encodeMessage(original);
      const decoded = decodeMessage<typeof original>(encoded);
      expect(decoded).toEqual(original);
    });

    it('should throw on invalid data', () => {
      const invalidBytes = new TextEncoder().encode('not valid lsp');
      expect(() => decodeMessage(invalidBytes)).toThrow();
    });
  });

  describe('encode/decode roundtrip', () => {
    it('should preserve message identity through encode then decode', () => {
      const messages = [
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: { capabilities: {} },
        } as const,
        { jsonrpc: '2.0', id: 2, result: { contents: 'hover text' } } as const,
        {
          jsonrpc: '2.0',
          id: 3,
          error: { code: -32_600, message: 'Invalid Request' },
        } as const,
      ];

      for (const message of messages) {
        const encoded = encodeMessage(message);
        const decoded = decodeMessage<typeof message>(encoded);
        expect(decoded).toEqual(message);
      }
    });
  });
});
