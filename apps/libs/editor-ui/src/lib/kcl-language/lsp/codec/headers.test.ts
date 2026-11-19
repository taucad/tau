import { describe, it, expect } from 'vitest';
import { addHeaders, parseMessages } from '#lib/kcl-language/lsp/codec/headers.js';

describe('headers', () => {
  describe('addHeaders', () => {
    it('should add Content-Length header with correct byte count', () => {
      const message = '{"jsonrpc":"2.0"}';
      const result = addHeaders(message);
      expect(result).toBe(`Content-Length: ${message.length}\r\n\r\n${message}`);
    });

    it('should calculate byte length, not character length for multi-byte chars', () => {
      const message = '{"text":"é"}';
      const byteLength = new TextEncoder().encode(message).length;
      const charLength = message.length;
      // É is 2 bytes in UTF-8, so byte length > char length
      expect(byteLength).toBeGreaterThan(charLength);
      const result = addHeaders(message);
      expect(result).toContain(`Content-Length: ${byteLength}`);
    });

    it('should handle empty message', () => {
      const result = addHeaders('');
      expect(result).toBe('Content-Length: 0\r\n\r\n');
    });
  });

  describe('parseMessages', () => {
    it('should parse a single LSP message', () => {
      const json = '{"jsonrpc":"2.0","id":1}';
      const input = `Content-Length: ${json.length}\r\n\r\n${json}`;
      const result = parseMessages(input);
      expect(result).toEqual([json]);
    });

    it('should parse multiple concatenated LSP messages', () => {
      const message1 = '{"id":1}';
      const message2 = '{"id":2}';
      const input = `Content-Length: ${message1.length}\r\n\r\n${message1}Content-Length: ${message2.length}\r\n\r\n${message2}`;
      const result = parseMessages(input);
      expect(result).toEqual([message1, message2]);
    });

    it('should handle messages with multi-byte UTF-8 content', () => {
      const json = '{"text":"héllo 🚀"}';
      const byteLength = new TextEncoder().encode(json).length;
      const input = `Content-Length: ${byteLength}\r\n\r\n${json}`;
      const result = parseMessages(input);
      expect(result).toEqual([json]);
    });

    it('should handle raw JSON fallback (no headers)', () => {
      const json = '{"jsonrpc":"2.0"}';
      const result = parseMessages(json);
      expect(result).toEqual([json]);
    });

    it('should return empty array for empty input', () => {
      expect(parseMessages('')).toEqual([]);
    });

    it('should roundtrip with addHeaders', () => {
      const original = '{"jsonrpc":"2.0","method":"textDocument/hover","id":42}';
      const withHeaders = addHeaders(original);
      const parsed = parseMessages(withHeaders);
      expect(parsed).toEqual([original]);
    });

    it('should roundtrip multiple messages', () => {
      const message1 = '{"id":1,"method":"initialize"}';
      const message2 = '{"id":2,"result":{"capabilities":{}}}';
      const combined = addHeaders(message1) + addHeaders(message2);
      const parsed = parseMessages(combined);
      expect(parsed).toEqual([message1, message2]);
    });
  });
});
