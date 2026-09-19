import { describe, it, expect, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { WorkerChangeChannelTransport } from '#worker-change-channel.js';
import { WorkerChangeChannel } from '#worker-change-channel.js';

/*
 * The transport is the project's own rooted connection (charter D12), so the
 * wire already speaks the workspace-relative namespace: the bridge withheld
 * everything outside the root and re-spelled the rest before it got here.
 */
function createTestChannel(listen: Mock<WorkerChangeChannelTransport['listen']>): {
  channel: WorkerChangeChannel;
  wire: (data: unknown) => void;
} {
  const channel = new WorkerChangeChannel({ transport: { listen } });
  const wire = listen.mock.calls[0]![1] as (data: unknown) => void;
  return { channel, wire };
}

describe('WorkerChangeChannel', () => {
  it('subscribes to transport.listen exactly once at construction', () => {
    const listen = vi.fn().mockReturnValue(vi.fn());
    createTestChannel(listen);
    expect(listen).toHaveBeenCalledOnce();
    expect(listen).toHaveBeenCalledWith('fileChanged', expect.any(Function));
  });

  it('ignores a payload that is not a change event', () => {
    const listen = vi.fn().mockReturnValue(vi.fn());
    const { channel, wire } = createTestChannel(listen);
    const handler = vi.fn();
    channel.onFileWritten({ handler });
    wire({ type: 'somethingElse', path: 'x.ts' });
    expect(handler).not.toHaveBeenCalled();
    channel.dispose();
  });

  it('invokes fileWritten with the workspace-relative path the connection sent', () => {
    const listen = vi.fn().mockReturnValue(vi.fn());
    const { channel, wire } = createTestChannel(listen);
    const handler = vi.fn();
    channel.onFileWritten({ handler });
    wire({ type: 'fileWritten', path: 'src/a.ts', backend: 'indexeddb' });
    expect(handler).toHaveBeenCalledWith({ type: 'fileWritten', path: 'src/a.ts', backend: 'indexeddb' });
    channel.dispose();
  });

  it('gates delivery via interestedIn', () => {
    const listen = vi.fn().mockReturnValue(vi.fn());
    const { channel, wire } = createTestChannel(listen);
    const handler = vi.fn();
    channel.onFileWritten({ handler, interestedIn: (p) => p.startsWith('a/') });
    wire({ type: 'fileWritten', path: 'b/x.ts', backend: 'indexeddb' });
    expect(handler).not.toHaveBeenCalled();
    wire({ type: 'fileWritten', path: 'a/x.ts', backend: 'indexeddb' });
    expect(handler).toHaveBeenCalledOnce();
    channel.dispose();
  });

  it('stops delivering after dispose', () => {
    const listen = vi.fn().mockReturnValue(vi.fn());
    const { channel, wire } = createTestChannel(listen);
    const handler = vi.fn();
    channel.onFileWritten({ handler });
    channel.dispose();
    wire({ type: 'fileWritten', path: 'a.ts', backend: 'indexeddb' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('supports multiple consumers with different predicates', () => {
    const listen = vi.fn().mockReturnValue(vi.fn());
    const { channel, wire } = createTestChannel(listen);
    const a = vi.fn();
    const b = vi.fn();
    channel.onFileWritten({ handler: a, interestedIn: (p) => p.startsWith('a/') });
    channel.onFileWritten({ handler: b, interestedIn: (p) => p.startsWith('b/') });
    wire({ type: 'fileWritten', path: 'a/x.ts', backend: 'indexeddb' });
    expect(a).toHaveBeenCalledOnce();
    expect(b).not.toHaveBeenCalled();
    channel.dispose();
  });

  it('should not skip sibling handlers when one self-unsubscribes during dispatch', () => {
    const listen = vi.fn().mockReturnValue(vi.fn());
    const { channel, wire } = createTestChannel(listen);
    const sibling = vi.fn();
    const unsubscribeSelf = channel.onFileWritten({
      handler: () => {
        unsubscribeSelf();
      },
    });

    channel.onFileWritten({ handler: sibling });

    wire({ type: 'fileWritten', path: 'a.ts', backend: 'indexeddb' });

    expect(sibling).toHaveBeenCalledOnce();
    channel.dispose();
  });

  it('should continue delivery when a handler throws', () => {
    const listen = vi.fn().mockReturnValue(vi.fn());
    const { channel, wire } = createTestChannel(listen);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failing = vi.fn(() => {
      throw new Error('boom');
    });
    const succeeding = vi.fn();

    channel.onFileWritten({ handler: failing });
    channel.onFileWritten({ handler: succeeding });
    wire({ type: 'fileWritten', path: 'a.ts', backend: 'indexeddb' });

    expect(failing).toHaveBeenCalledOnce();
    expect(succeeding).toHaveBeenCalledOnce();
    consoleErrorSpy.mockRestore();
    channel.dispose();
  });

  it('should unsubscribe when AbortSignal aborts after subscribe', () => {
    const listen = vi.fn().mockReturnValue(vi.fn());
    const { channel, wire } = createTestChannel(listen);
    const handler = vi.fn();
    const controller = new AbortController();

    channel.onFileWritten({ handler, signal: controller.signal });
    controller.abort();
    wire({ type: 'fileWritten', path: 'a.ts', backend: 'indexeddb' });

    expect(handler).not.toHaveBeenCalled();
    channel.dispose();
  });
});
