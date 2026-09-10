import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { rpcName } from '#constants/rpc.constants.js';
import type { RpcDependencies, RpcRuntimeClient } from '#rpc/rpc-dependencies.js';
import { createRpcDispatcher } from '#rpc/rpc-dispatcher.js';

describe('createRpcDispatcher invocation context', () => {
  it('refuses a pre-aborted call before invoking any dependency', async () => {
    const dependencies = mock<RpcDependencies>();
    const getKernelResult = vi.fn<RpcRuntimeClient['getKernelResult']>();
    dependencies.kernelClient.getKernelResult = getKernelResult;
    const controller = new AbortController();
    const reason = new Error('stopped before handler');
    controller.abort(reason);

    await expect(
      createRpcDispatcher(dependencies).dispatch(
        { rpcName: rpcName.getKernelResult, args: { targetFile: 'main.ts' } },
        { signal: controller.signal },
      ),
    ).rejects.toBe(reason);
    expect(getKernelResult).not.toHaveBeenCalled();
  });

  it('passes the same context object separately from the RPC call', async () => {
    const dependencies = mock<RpcDependencies>();
    const controller = new AbortController();
    const context = { signal: controller.signal };
    const getKernelResult = vi.fn<RpcRuntimeClient['getKernelResult']>(async () => ({
      success: true,
      status: 'ready',
      kernelIssues: [],
    }));
    dependencies.kernelClient.getKernelResult = getKernelResult;
    const call = { rpcName: rpcName.getKernelResult, args: { targetFile: 'main.ts' } } as const;

    await createRpcDispatcher(dependencies).dispatch(call, context);

    expect(getKernelResult.mock.calls[0]?.[1]).toBe(context);
    expect(call.args).not.toHaveProperty('signal');
  });
});
