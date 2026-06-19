import { kernelIssueCodeValues } from '@taucad/runtime/types';
import { describe, expect, it } from 'vitest';
import { rpcNames } from '#constants/rpc.constants.js';
import { rpcClientErrorCodeSchema, rpcSchemasRegistry } from '#schemas/rpc.schema.js';
import { chatRpcProtocolManifest, chatRpcProtocolVersion } from '#schemas/rpc-wire-protocol.schema.js';

describe('chatRpcProtocolManifest', () => {
  it('should fingerprint RPC inventory and nested runtime issue codes', () => {
    expect(chatRpcProtocolManifest.rpcNames).toEqual([...rpcNames]);
    expect(chatRpcProtocolManifest.rpcSchemaNames).toEqual(Object.keys(rpcSchemasRegistry).sort());
    expect(chatRpcProtocolManifest.rpcClientErrorCodes).toEqual([...rpcClientErrorCodeSchema.options]);
    expect(chatRpcProtocolManifest.nestedDomains.kernelIssueCodes).toEqual([...kernelIssueCodeValues]);
  });

  it('should expose a stable version string for Socket.IO join handshakes', () => {
    const [prefix, hash] = chatRpcProtocolVersion.split('chat-rpc-v1-');
    expect(prefix).toBe('');
    expect(hash).toHaveLength(8);
    expect(
      Number.parseInt(hash ?? '', 16)
        .toString(16)
        .padStart(8, '0'),
    ).toBe(hash);
  });
});
