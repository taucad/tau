import { kernelIssueCodeValues } from '@taucad/runtime/types';
import { rpcNames } from '#constants/rpc.constants.js';
import { rpcClientErrorCodeSchema, rpcSchemasRegistry } from '#schemas/rpc.schema.js';

/**
 * Stable manifest for the browser/API chat RPC wire contract.
 *
 * This intentionally fingerprints the contract inventory, not Zod internals:
 * RPC names, top-level client error codes, and nested runtime-owned kernel
 * issue codes are the drift surfaces that can break stale browser tabs.
 *
 * @public
 */
export const chatRpcProtocolManifest = {
  name: 'tau-chat-rpc',
  schemaRevision: 1,
  rpcNames: [...rpcNames],
  rpcSchemaNames: Object.keys(rpcSchemasRegistry).sort(),
  rpcClientErrorCodes: [...rpcClientErrorCodeSchema.options],
  nestedDomains: {
    kernelIssueCodes: [...kernelIssueCodeValues],
  },
} as const;

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(',')}}`;
  }

  return JSON.stringify(value);
};

const stableHash = (value: string): string => {
  const modulus = 4_294_967_291n;
  const prime = 16_777_619n;
  let hash = 2_166_136_261n;

  for (const character of value) {
    hash = (hash * prime + BigInt(character.codePointAt(0) ?? 0)) % modulus;
  }

  return hash.toString(16).padStart(8, '0');
};

/**
 * Current chat RPC protocol version sent by browser tabs during Socket.IO
 * room registration.
 *
 * @public
 */
export const chatRpcProtocolVersion = `chat-rpc-v1-${stableHash(stableJson(chatRpcProtocolManifest))}` as const;

/** @public */
export type ChatRpcProtocolVersion = typeof chatRpcProtocolVersion;

/** @public */
export const chatRpcProtocolErrorCode = {
  protocolVersionMismatch: 'PROTOCOL_VERSION_MISMATCH',
} as const;

/** @public */
export type ChatRpcProtocolErrorCode = (typeof chatRpcProtocolErrorCode)[keyof typeof chatRpcProtocolErrorCode];
