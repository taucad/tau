import { JSONRPCClient, JSONRPCErrorException } from 'json-rpc-2.0';
import type { JSONRPCRequest, JSONRPCResponse } from 'json-rpc-2.0';

import type { FileStat, FileType } from '#protocol.js';
import {
  fileStatSchema,
  fsContentRequest,
  fsContentWireSchema,
  fsFindFilesRequest,
  fsFindFilesResultSchema,
  fsReadDirectoryRequest,
  fsReadDirectoryResultSchema,
  fsStatRequest,
} from '#protocol.js';

import { SharedPool } from '@taucad/memory';

import { base64WireToBytes } from '#base64-wire.js';

/**
 * Thrown when an `fs/*` JSON-RPC request returns {@link JSONRPCErrorException}.
 * Prefer branching on {@link LspFsRequestError#code} with `lspFsErrorCode` from `@taucad/lsp-fs/protocol`.
 *
 * @public
 */
export class LspFsRequestError extends Error {
  public readonly code: number;
  public readonly data: unknown;

  public constructor(message: string, code: number, data?: unknown) {
    super(message);
    this.name = 'LspFsRequestError';
    this.code = code;
    this.data = data;
  }
}

function unwrapJsonRpcError(error: unknown): never {
  if (error instanceof JSONRPCErrorException) {
    throw new LspFsRequestError(error.message, error.code, error.data);
  }
  throw error;
}

type JsonRpcRequestOptions<Output> = Readonly<{
  client: JSONRPCClient;
  method: string;
  params: unknown;
  parseResult: (raw: unknown) => Output;
}>;

/** Milliseconds. */
async function jsonRpcRequest<Output>({
  client,
  method,
  params,
  parseResult,
}: JsonRpcRequestOptions<Output>): Promise<Output> {
  try {
    const raw: unknown = await client.request(method, params);
    return parseResult(raw);
  } catch (error) {
    unwrapJsonRpcError(error);
  }
}

/**
 * Consumer-side filesystem API (runs in a worker or main thread). Tier 0 hits
 * `SharedPool`; Tier 1 issues JSON-RPC `fs/*` requests via {@link JSONRPCClient}.
 *
 * @public
 */
export type LanguageFsClient = Readonly<{
  readFile(uri: string): Promise<Uint8Array<ArrayBuffer>>;
  stat(uri: string): Promise<FileStat>;
  readDirectory(uri: string): Promise<Array<[string, FileType]>>;
  findFiles(pattern: string, max?: number): Promise<string[]>;
}>;

/**
 * @public
 */
export type AttachLanguageFsClientOptions = Readonly<{
  filePoolBuffer?: SharedArrayBuffer;
  /**
   * Maps absolute filesystem paths (same key shape the FM worker uses in
   * `SharedPool.store`) to tier-0 lookups. When omitted, pool reads are skipped.
   */
  absolutePathForUri: (uri: string) => string;
  sendJsonRpc: (request: JSONRPCRequest) => Promise<JSONRPCResponse | undefined>;
}>;

/**
 * Attach a lazy filesystem reader that prefers the shared file pool, then
 * falls back to `fs/*` JSON-RPC requests.
 *
 * @public
 */
export function attachLanguageFsClient(options: AttachLanguageFsClientOptions): LanguageFsClient {
  const pool: SharedPool | undefined = options.filePoolBuffer ? new SharedPool(options.filePoolBuffer) : undefined;

  const jsonRpcClient = new JSONRPCClient(async (payload) => {
    const response = await options.sendJsonRpc(payload as JSONRPCRequest);
    if (response !== undefined) {
      jsonRpcClient.receive(response);
    }
  });

  return {
    readFile: async (uri: string): Promise<Uint8Array<ArrayBuffer>> => {
      const poolKey = options.absolutePathForUri(uri);
      const cached = pool?.resolveCopy(poolKey);
      if (cached) {
        return cached;
      }

      const wire = await jsonRpcRequest({
        client: jsonRpcClient,
        method: fsContentRequest.method,
        params: { uri },
        parseResult: (raw) => fsContentWireSchema.parse(raw),
      });
      return base64WireToBytes(wire.dataBase64);
    },
    stat: async (uri: string): Promise<FileStat> =>
      jsonRpcRequest({
        client: jsonRpcClient,
        method: fsStatRequest.method,
        params: { uri },
        parseResult: (raw) => fileStatSchema.parse(raw),
      }),
    readDirectory: async (uri: string): Promise<Array<[string, FileType]>> =>
      jsonRpcRequest({
        client: jsonRpcClient,
        method: fsReadDirectoryRequest.method,
        params: { uri },
        parseResult: (raw) => fsReadDirectoryResultSchema.parse(raw),
      }),
    findFiles: async (pattern: string, max?: number): Promise<string[]> =>
      jsonRpcRequest({
        client: jsonRpcClient,
        method: fsFindFilesRequest.method,
        params: { pattern, max },
        parseResult: (raw) => fsFindFilesResultSchema.parse(raw),
      }),
  };
}
