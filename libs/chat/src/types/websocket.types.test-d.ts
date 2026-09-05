import { describe, it, expectTypeOf } from 'vitest';
import type { RpcResponse, RpcResponseFor, RpcRequest } from '#types/websocket.types.js';
import type { RpcResult, ReadFileRpcInput } from '#schemas/rpc.schema.js';

describe('RpcResponse discriminated by rpcName (R5)', () => {
  it('should narrow result to RpcResult<read_file> on success variant', () => {
    type ReadFileResponses = RpcResponseFor<'read_file'>;
    type Success = Extract<ReadFileResponses, { result: RpcResult<'read_file'> }>;
    expectTypeOf<Success['result']>().toEqualTypeOf<RpcResult<'read_file'>>();
  });

  it('should expose RpcResponseFor<T> with rpcName literal', () => {
    expectTypeOf<RpcResponseFor<'get_kernel_result'>>().toExtend<{
      type: 'rpc_response';
      rpcName: 'get_kernel_result';
    }>();
  });

  it('should narrow RpcRequest read_file args to ReadFileRpcInput', () => {
    expectTypeOf<RpcRequest<'read_file'>['args']>().toEqualTypeOf<ReadFileRpcInput>();
  });

  it('should preserve the error branch with result: undefined', () => {
    type ErrorBranch = Extract<RpcResponse, { error: string }>;
    expectTypeOf<ErrorBranch['result']>().toEqualTypeOf<undefined>();
  });
});
