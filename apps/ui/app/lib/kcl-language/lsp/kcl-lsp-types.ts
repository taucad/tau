/**
 * Shared types for KCL LSP communication.
 */

import type { JSONRPCRequest, JSONRPCResponse } from 'json-rpc-2.0';

/**
 * Worker event types for LSP communication.
 */
export const lspWorkerEventType = {
  init: 'init',
  call: 'call',
  languageFsJsonRpc: 'languageFsJsonRpc',
  setDocumentContext: 'setDocumentContext',
  symbolRequest: 'symbolRequest',
  symbolResponse: 'symbolResponse',
} as const;

export type LspWorkerEventType = (typeof lspWorkerEventType)[keyof typeof lspWorkerEventType];

/**
 * Worker type identifier.
 */
export const kclWorkerType = 'kcl-lsp';

/**
 * Options for initializing the KCL LSP worker.
 */
export type KclLspWorkerOptions = {
  /** URL to the WASM file */
  wasmUrl: string;
  /** Authentication token (empty for offline mode) */
  token: string;
  /** API base URL (empty for offline mode) */
  apiBaseUrl: string;
  /** Workspace root path (same string as file manager {@link WorkspacePathResolver.root}) */
  workspaceRootPath: string;
  /** Optional shared file pool for Tier 0 reads */
  filePoolBuffer?: SharedArrayBuffer;
};

export type SetDocumentContextPayload = Readonly<{
  documentUri: string;
}>;

/**
 * A symbol-service call the LSP worker answers on its own KCL WASM instance, so the main thread never
 * instantiates a second copy of the module (D-RT-14).
 */
export type KclSymbolRequest = Readonly<{ id: number }> & KclSymbolCall;

/** The operation a {@link KclSymbolRequest} asks for. */
export type KclSymbolCall = Readonly<
  { operation: 'parse'; code: string } | { operation: 'executeMock'; program: string; path: string }
>;

/**
 * The worker's answer to a {@link KclSymbolRequest}: the WASM call's return value, or the value it threw.
 */
export type KclSymbolResponse = Readonly<
  { id: number } & ({ ok: true; value: unknown } | { ok: false; error: unknown })
>;

/**
 * Event sent to/from the LSP worker.
 */
export type LspWorkerEvent = {
  worker: string;
  eventType: LspWorkerEventType;
  eventData:
    | Uint8Array<ArrayBuffer>
    | KclLspWorkerOptions
    | SetDocumentContextPayload
    | KclSymbolRequest
    | KclSymbolResponse
    | JSONRPCRequest
    | JSONRPCResponse;
};

/**
 * Semantic token types supported by the KCL LSP.
 * Must match the order in the server's SemanticTokensLegend.
 */
export const semanticTokenTypes = [
  'number',
  'variable',
  'keyword',
  'type',
  'string',
  'operator',
  'comment',
  'function',
  'parameter',
  'property',
] as const;

/**
 * Semantic token modifiers supported by the KCL LSP.
 */
export const semanticTokenModifiers = ['declaration', 'definition', 'defaultLibrary', 'readonly', 'static'] as const;
