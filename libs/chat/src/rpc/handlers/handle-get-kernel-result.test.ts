import { describe, expect, it, vi } from 'vitest';

import type { RpcInvocationContext, RpcRuntimeClient } from '#rpc/rpc-dependencies.js';
import { handleGetKernelResult } from '#rpc/handlers/handle-get-kernel-result.js';

describe('handleGetKernelResult', () => {
  it('forwards the exact local invocation context without adding it to input', async () => {
    const controller = new AbortController();
    const context: RpcInvocationContext = { signal: controller.signal };
    const getKernelResult = vi.fn<RpcRuntimeClient['getKernelResult']>(async () => ({
      success: true,
      status: 'ready',
      kernelIssues: [],
    }));
    const client: RpcRuntimeClient = { getKernelResult };
    const input = { targetFile: 'main.ts' };

    await expect(handleGetKernelResult(input, client, context)).resolves.toMatchObject({ success: true });
    expect(getKernelResult).toHaveBeenCalledExactlyOnceWith('main.ts', context);
    expect(getKernelResult.mock.calls[0]?.[1]).toBe(context);
    expect(input).not.toHaveProperty('signal');
  });

  it('refuses a pre-aborted invocation before calling the client', async () => {
    const controller = new AbortController();
    const reason = new Error('stopped before dispatch');
    controller.abort(reason);
    const getKernelResult = vi.fn<RpcRuntimeClient['getKernelResult']>();

    await expect(
      handleGetKernelResult({ targetFile: 'main.ts' }, { getKernelResult }, { signal: controller.signal }),
    ).rejects.toBe(reason);
    expect(getKernelResult).not.toHaveBeenCalled();
  });

  it('retains the contextless caller contract', async () => {
    const client: RpcRuntimeClient = {
      getKernelResult: async () => ({ success: true, status: 'ready', kernelIssues: [] }),
    };

    await expect(handleGetKernelResult({ targetFile: 'main.ts' }, client)).resolves.toMatchObject({ success: true });
  });
});
