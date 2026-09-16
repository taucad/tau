import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { rpcName } from '#constants/rpc.constants.js';
import type { RpcDependencies, RpcParameterClient, RpcRuntimeClient } from '#rpc/rpc-dependencies.js';
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

  it('returns a mutating business outcome when cancellation arrives after admission', async () => {
    const dependencies = mock<RpcDependencies>();
    const controller = new AbortController();
    const expected = {
      sourceRevision: 'source',
      manifestRevision: 'manifest',
      valueRevision: 'value',
      dependencyRevision: 'dependency',
    };
    dependencies.parameters = {
      getParameters: vi.fn<RpcParameterClient['getParameters']>(),
      applyParameterOperation: vi.fn<RpcParameterClient['applyParameterOperation']>(async () => {
        controller.abort(new Error('reply lost after admission'));
        return {
          success: true,
          outcome: {
            status: 'committed',
            requestId: 'agent:1',
            revision: expected,
            write: 'applied',
          },
        };
      }),
    };

    await expect(
      createRpcDispatcher(dependencies).dispatch(
        {
          rpcName: rpcName.applyParameterOperation,
          args: {
            targetFile: 'main.ts',
            requestId: 'agent:1',
            expected,
            pressure: 'final',
            operation: {
              kind: 'native-value',
              group: 'default',
              parameterId: 'width',
              resource: 'urn:test',
              pointer: '/width',
              value: 25,
            },
          },
        },
        { signal: controller.signal },
      ),
    ).resolves.toMatchObject({ success: true, outcome: { status: 'committed' } });
  });
});
