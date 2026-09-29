import { describe, it, expectTypeOf } from 'vitest';
import type { RpcClientErrorCode, RpcResult } from '@taucad/chat';
import type {
  EnsureGeometryUnitErrorCode,
  EnsureGeometryUnitResult,
  RpcCallInput,
  RpcHandlers,
} from '#hooks/rpc-handlers.js';

describe('EnsureGeometryUnitResult.errorCode (R1)', () => {
  it('should match schema-pinned Extract for UNKNOWN and OPERATION_TIMEOUT', () => {
    expectTypeOf<EnsureGeometryUnitErrorCode>().toEqualTypeOf<
      Extract<RpcClientErrorCode, 'UNKNOWN' | 'OPERATION_TIMEOUT'>
    >();
  });

  it('should use EnsureGeometryUnitErrorCode on failure branch', () => {
    type ErrorBranch = Extract<EnsureGeometryUnitResult, { ok: false }>;
    expectTypeOf<ErrorBranch['errorCode']>().toEqualTypeOf<EnsureGeometryUnitErrorCode>();
  });
});

describe('RpcHandlers.executeRpcCall (R2)', () => {
  it('should expose executeRpcCall as a generic method bounded by RpcCallInput', () => {
    expectTypeOf<RpcHandlers>().toExtend<{
      executeRpcCall<C extends RpcCallInput>(rpcCall: C): Promise<RpcResult<C['rpcName']>>;
    }>();
  });
});
