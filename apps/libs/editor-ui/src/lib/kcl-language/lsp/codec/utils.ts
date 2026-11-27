/**
 * JSON-RPC codec utilities for encoding/decoding LSP messages.
 */

import type { JSONRPCRequest, JSONRPCResponse } from 'json-rpc-2.0';
import { encodeBytes, decodeBytes } from '#lib/kcl-language/lsp/codec/bytes.js';
import { addHeaders, parseMessages } from '#lib/kcl-language/lsp/codec/headers.js';
import { createKclLogger } from '#lib/kcl-language/lsp/kcl-logs.js';

const log = createKclLogger('Codec');

/**
 * Encode a JSON-RPC message to bytes with LSP headers.
 */
export function encodeMessage(json: JSONRPCRequest | JSONRPCResponse): Uint8Array<ArrayBuffer> {
  const message = JSON.stringify(json);
  const delimited = addHeaders(message);

  return encodeBytes(delimited);
}

/**
 * Decode bytes to a JSON-RPC message, stripping LSP headers.
 * Note: For handling multiple concatenated messages, use parseMessages directly.
 */
export function decodeMessage<T>(data: Uint8Array<ArrayBuffer>): T {
  try {
    const delimited = decodeBytes(data);
    const messages = parseMessages(delimited);
    const firstMessage = messages[0];
    if (!firstMessage) {
      throw new Error('No valid LSP message found in data');
    }

    // Return the first message (for backward compatibility with single-message decoding)
    return JSON.parse(firstMessage) as T;
  } catch (error) {
    log.error('Failed to decode message:', error);
    log.error('Raw data length:', data.length);
    log.error('First 200 chars:', decodeBytes(data).slice(0, 200));
    throw error;
  }
}
