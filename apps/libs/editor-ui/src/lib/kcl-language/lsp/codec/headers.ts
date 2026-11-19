/**
 * LSP message header utilities.
 * Handles Content-Length header encoding/decoding for JSON-RPC messages.
 *
 * IMPORTANT: Content-Length in LSP is always in bytes, not characters.
 * This matters for multi-byte UTF-8 characters (emojis, non-ASCII, etc.)
 */

import { createKclLogger } from '#lib/kcl-language/lsp/kcl-logs.js';

const log = createKclLogger('Headers');

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function addHeaders(message: string): string {
  const byteLength = textEncoder.encode(message).length;
  return `Content-Length: ${byteLength}\r\n\r\n${message}`;
}

/**
 * Parse all LSP messages from a raw buffer.
 * LSP messages are framed with "Content-Length: xxx\r\n\r\n{json}"
 * Multiple messages can be concatenated together.
 *
 * Works with bytes to correctly handle Content-Length which is in bytes.
 */
export function parseMessages(data: string): string[] {
  const messages: string[] = [];
  let remaining = textEncoder.encode(data);

  const headerPattern = /^Content-Length:\s*(\d+)\s*\r?\n\r?\n/;

  while (remaining.length > 0) {
    // Decode enough to find the header (headers are ASCII, so safe to check as string)
    const headerSearchWindow = textDecoder.decode(remaining.slice(0, 100));
    const contentLengthMatch = headerPattern.exec(headerSearchWindow);

    if (contentLengthMatch?.[1]) {
      const contentLength = Number.parseInt(contentLengthMatch[1], 10);
      // Header is ASCII-only, so byte length === character length
      const headerByteLength = textEncoder.encode(contentLengthMatch[0]).length;
      const messageEnd = headerByteLength + contentLength;

      if (remaining.length >= messageEnd) {
        // Extract the JSON message bytes and decode to string
        const jsonBytes = remaining.slice(headerByteLength, messageEnd);
        const jsonMessage = textDecoder.decode(jsonBytes);
        messages.push(jsonMessage);
        remaining = remaining.slice(messageEnd);
      } else {
        // Incomplete message - shouldn't happen in single writes but handle gracefully
        log.warn('Incomplete LSP message, expected', contentLength, 'bytes');
        break;
      }
    } else {
      // No valid header found - try to parse as raw JSON (fallback)
      const trimmed = textDecoder.decode(remaining).trim();
      if (trimmed.startsWith('{')) {
        messages.push(trimmed);
      }

      break;
    }
  }

  return messages;
}
