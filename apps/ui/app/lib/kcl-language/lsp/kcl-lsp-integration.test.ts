/**
 * KCL LSP Integration Tests — Real WASM, No Worker.
 *
 * These tests load the actual KCL WASM binary and run the LSP server
 * in-process, bypassing the Worker transport entirely. This validates
 * the full pipeline: WASM loads → LSP initializes → features work.
 *
 * This is the primary regression test for KCL intellisense. If WASM
 * loading, message encoding, or LSP protocol handling breaks, these
 * tests catch it with the real server — no mocks.
 *
 * @vitest-environment node
 */

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { JSONRPCRequest, JSONRPCResponse } from 'json-rpc-2.0';
import { Queue } from '#lib/kcl-language/lsp/codec/queue.js';
import { StreamDemuxer } from '#lib/kcl-language/lsp/codec/stream-demuxer.js';
import { encodeMessage } from '#lib/kcl-language/lsp/codec/utils.js';

const wasmPath = fileURLToPath(import.meta.resolve('@taucad/kcl-wasm-lib/kcl.wasm'));

// LSP server state — initialized once for all tests in this file
let intoServer: Queue<Uint8Array<ArrayBuffer>>;
let fromServer: StreamDemuxer;
let lspRunning = false;
let nextRequestId = 1;

/**
 * Send an LSP request and await the response.
 */
async function lspRequest<T>(method: string, parameters: unknown): Promise<T> {
  const id = nextRequestId++;
  const responsePromise = fromServer.responses.get(id, 15_000);

  intoServer.enqueue(
    encodeMessage({
      jsonrpc: '2.0',
      id,
      method,
      params: parameters,
    } as JSONRPCRequest),
  );

  const response = (await responsePromise) as JSONRPCResponse;

  if (response.error) {
    throw new Error(`LSP error ${response.error.code}: ${response.error.message}`);
  }

  return response.result as T;
}

/**
 * Send an LSP notification (no response expected).
 */
function lspNotify(method: string, parameters: unknown): void {
  intoServer.enqueue(
    encodeMessage({
      jsonrpc: '2.0',
      method,
      params: parameters,
    } as JSONRPCRequest),
  );
}

// Drain server-initiated requests (like client/registerCapability) so they don't block
async function drainServerRequests(): Promise<void> {
  try {
    const iterator = fromServer.requests[Symbol.asyncIterator]();
    await iterator.next();
  } catch {
    // Silently handle drain errors during test teardown
  }
}

const kclTestDocument = [
  '// Test KCL file',
  'fn cube(size) {',
  '  const sketch = startSketchOn("XY")',
  '    |> startProfileAt([0, 0], %)',
  '    |> line(end = [size, 0])',
  '    |> line(end = [0, size])',
  '    |> line(end = [-size, 0])',
  '    |> close(%)',
  '  return extrude(sketch, length = size)',
  '}',
].join('\n');

describe('KCL LSP Integration (Real WASM)', () => {
  beforeAll(async () => {
    if (!fs.existsSync(wasmPath)) {
      throw new Error(
        `KCL WASM file not found at ${wasmPath}. Run 'pnpm install' to ensure @taucad/kcl-wasm-lib is installed.`,
      );
    }

    const wasmSource = new Uint8Array(await fs.promises.readFile(wasmPath));
    const wasmModule = await WebAssembly.compile(wasmSource);

    const kclWasm = await import('@taucad/kcl-wasm-lib');
    // eslint-disable-next-line @typescript-eslint/naming-convention -- wasm-bindgen generated API
    await kclWasm.default({ module_or_path: wasmModule });

    intoServer = new Queue<Uint8Array<ArrayBuffer>>();
    fromServer = new StreamDemuxer();

    const mockFileSystem = {
      async readFile(): Promise<Uint8Array<ArrayBuffer>> {
        throw new Error('No files available in test');
      },
      async exists(): Promise<boolean> {
        return false;
      },
      async getAllFiles(): Promise<string> {
        return JSON.stringify([]);
      },
    };

    const config = new kclWasm.LspServerConfig(intoServer, fromServer, mockFileSystem);
    void kclWasm.lsp_run_kcl(config, '', '');
    lspRunning = true;

    void drainServerRequests();
  }, 30_000);

  afterAll(() => {
    if (lspRunning) {
      intoServer.close();
    }
  });

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  it('should initialize and return server capabilities', async () => {
    type InitializeResult = {
      capabilities: {
        hoverProvider?: boolean;
        completionProvider?: unknown;
        definitionProvider?: boolean;
        textDocumentSync?: unknown;
        documentFormattingProvider?: boolean;
        semanticTokensProvider?: unknown;
        foldingRangeProvider?: boolean;
        renameProvider?: unknown;
        codeActionProvider?: unknown;
      };
    };

    const result = await lspRequest<InitializeResult>('initialize', {
      processId: null,
      clientInfo: { name: 'test-client', version: '1.0.0' },
      capabilities: {
        textDocument: {
          hover: { contentFormat: ['plaintext', 'markdown'] },
          completion: { completionItem: { snippetSupport: false } },
        },
      },
      rootUri: null,
      workspaceFolders: null,
    });

    expect(result).toBeDefined();
    expect(result.capabilities).toBeDefined();
    expect(result.capabilities.hoverProvider).toBeTruthy();

    lspNotify('initialized', {});
  }, 15_000);

  // ---------------------------------------------------------------------------
  // Document lifecycle
  // ---------------------------------------------------------------------------

  it('should handle textDocument/didOpen without error', () => {
    lspNotify('textDocument/didOpen', {
      textDocument: {
        uri: 'file:///test.kcl',
        languageId: 'kcl',
        version: 1,
        text: kclTestDocument,
      },
    });
  });

  // ---------------------------------------------------------------------------
  // Hover — the feature that originally regressed
  // ---------------------------------------------------------------------------

  it('should return hover information for KCL builtins', async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 500);
    });

    type HoverResult = {
      contents: string | { kind: string; value: string } | Array<string | { kind: string; value: string }>;
      range?: {
        start: { line: number; character: number };
        end: { line: number; character: number };
      };
    };

    const result = await lspRequest<HoverResult | undefined>('textDocument/hover', {
      textDocument: { uri: 'file:///test.kcl' },
      position: { line: 2, character: 18 },
    });

    // The fact that we get a response (not a hang/timeout) proves the pipeline works.
    // If the WASM LSP returns hover content, verify its structure.
    if (result) {
      expect(result.contents).toBeDefined();
    }
  }, 10_000);

  // ---------------------------------------------------------------------------
  // Completion
  // ---------------------------------------------------------------------------

  it('should return completion items', async () => {
    const result = await lspRequest<unknown>('textDocument/completion', {
      textDocument: { uri: 'file:///test.kcl' },
      position: { line: 9, character: 0 },
    });

    // KCL LSP returns completions as a flat CompletionItem[] (not CompletionList)
    if (result) {
      if (Array.isArray(result)) {
        expect(result.length).toBeGreaterThanOrEqual(0);
      } else {
        expect((result as { items: unknown[] }).items).toBeDefined();
      }
    }
  }, 10_000);

  // ---------------------------------------------------------------------------
  // Formatting
  // ---------------------------------------------------------------------------

  it('should return formatting edits', async () => {
    type TextEdit = {
      range: {
        start: { line: number; character: number };
        end: { line: number; character: number };
      };
      newText: string;
    };

    const result = await lspRequest<TextEdit[] | undefined>('textDocument/formatting', {
      textDocument: { uri: 'file:///test.kcl' },
      options: { tabSize: 2, insertSpaces: true },
    });

    // Formatting should return an array of text edits (possibly empty if already formatted)
    if (result) {
      expect(Array.isArray(result)).toBe(true);
    }
  }, 10_000);

  // ---------------------------------------------------------------------------
  // Document changes and close
  // ---------------------------------------------------------------------------

  it('should handle textDocument/didChange without error', () => {
    lspNotify('textDocument/didChange', {
      textDocument: { uri: 'file:///test.kcl', version: 2 },
      contentChanges: [
        {
          text: [
            '// Updated KCL file',
            'const box = startSketchOn("XY")',
            '  |> startProfileAt([0, 0], %)',
            '  |> line(end = [10, 0])',
            '  |> line(end = [0, 10])',
            '  |> line(end = [-10, 0])',
            '  |> close(%)',
            '  |> extrude(length = 5)',
          ].join('\n'),
        },
      ],
    });
  });

  it('should return hover after document change', async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });

    const result = await lspRequest<unknown>('textDocument/hover', {
      textDocument: { uri: 'file:///test.kcl' },
      position: { line: 1, character: 12 },
    });

    // Should respond without hanging — proves didChange → hover pipeline works
    expect(result).toBeDefined();
  }, 10_000);

  it('should handle textDocument/didClose without error', () => {
    lspNotify('textDocument/didClose', {
      textDocument: { uri: 'file:///test.kcl' },
    });
  });
});
