// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { MessagePort } from 'node:worker_threads';
import { runExactRequest } from './measurement-exact.transport.desktop.js';

const connect = vi.hoisted(() => vi.fn());
vi.mock('#filesystem/desktop-bridge.js', () => ({
  desktopBridge: () => ({ exactMeasurement: { connect } }),
}));

describe('desktop exact measurement transport', () => {
  it('should close a late port and return cancellation without publishing its result', async () => {
    const controller = new AbortController();
    const port = mock<MessagePort>();
    let answerConnection: ((port: MessagePort) => void) | undefined;
    connect.mockImplementationOnce(async () => new Promise<MessagePort>((resolve) => { answerConnection = resolve; }));

    const pending = runExactRequest({ id: 7, stepText: 'AP242', nameA: 'a', nameB: 'b' }, controller.signal);
    controller.abort();
    expect(await pending).toEqual({ id: 7, status: 'unavailable', reason: 'The exact query was cancelled.' });
    answerConnection?.(port);
    await vi.waitFor(() => { expect(port.close).toHaveBeenCalledOnce(); });
    expect(port.postMessage).not.toHaveBeenCalled();
  });
});
