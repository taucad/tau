import { describe, expect, it, vi } from 'vitest';

import type { RpcInvocationContext, RpcRuntimeClient } from '#rpc/rpc-dependencies.js';
import { handleEvaluateModel } from '#rpc/handlers/handle-evaluate-model.js';

describe('handleEvaluateModel', () => {
  it('forwards the exact local invocation context without adding it to input', async () => {
    const controller = new AbortController();
    const context: RpcInvocationContext = { signal: controller.signal };
    const evaluateModel = vi.fn<RpcRuntimeClient['evaluateModel']>(async () => ({
      success: true,
      status: 'ready',
      kernelIssues: [],
    }));
    const client: RpcRuntimeClient = { evaluateModel };
    const input = { targetFile: 'main.ts' };

    await expect(handleEvaluateModel(input, client, context)).resolves.toMatchObject({ success: true });
    expect(evaluateModel).toHaveBeenCalledExactlyOnceWith(input, context);
    expect(evaluateModel.mock.calls[0]?.[1]).toBe(context);
    expect(input).not.toHaveProperty('signal');
  });

  it('refuses a pre-aborted invocation before calling the client', async () => {
    const controller = new AbortController();
    const reason = new Error('stopped before dispatch');
    controller.abort(reason);
    const evaluateModel = vi.fn<RpcRuntimeClient['evaluateModel']>();

    await expect(
      handleEvaluateModel({ targetFile: 'main.ts' }, { evaluateModel }, { signal: controller.signal }),
    ).rejects.toBe(reason);
    expect(evaluateModel).not.toHaveBeenCalled();
  });

  it('retains the contextless caller contract', async () => {
    const client: RpcRuntimeClient = {
      evaluateModel: async () => ({ success: true, status: 'ready', kernelIssues: [] }),
    };

    await expect(handleEvaluateModel({ targetFile: 'main.ts' }, client)).resolves.toMatchObject({ success: true });
  });
});
