import { describe, it, expect, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { WorkerChangeChannelTransport } from '#worker-change-channel.js';
import { WorkerChangeChannel } from '#worker-change-channel.js';
import { WorkspacePathResolver } from '#workspace-path-resolver.js';

function createTestChannel(
  listen: Mock<WorkerChangeChannelTransport['listen']>,
  root = '/project',
): { channel: WorkerChangeChannel; paths: WorkspacePathResolver; wire: (data: unknown) => void } {
  const paths = new WorkspacePathResolver(root);
  const channel = new WorkerChangeChannel({ transport: { listen }, paths });
  const wire = listen.mock.calls[0]![1] as (data: unknown) => void;
  return { channel, paths, wire };
}

describe('WorkerChangeChannel', () => {
  it('subscribes to transport.listen exactly once at construction', () => {
    const listen = vi.fn().mockReturnValue(vi.fn());
    createTestChannel(listen);
    expect(listen).toHaveBeenCalledOnce();
    expect(listen).toHaveBeenCalledWith('fileChanged', expect.any(Function));
  });

  it('skips fileWritten events outside the project root', () => {
    const listen = vi.fn().mockReturnValue(vi.fn());
    const { channel, wire } = createTestChannel(listen);
    const handler = vi.fn();
    channel.onFileWritten({ handler });
    wire({ type: 'fileWritten', path: '/other/x.ts', backend: 'indexeddb' });
    expect(handler).not.toHaveBeenCalled();
    channel.dispose();
  });

  it('invokes fileWritten with a workspace-relative path', () => {
    const listen = vi.fn().mockReturnValue(vi.fn());
    const { channel, wire } = createTestChannel(listen);
    const handler = vi.fn();
    channel.onFileWritten({ handler });
    wire({ type: 'fileWritten', path: '/project/src/a.ts', backend: 'indexeddb' });
    expect(handler).toHaveBeenCalledWith({ type: 'fileWritten', path: 'src/a.ts', backend: 'indexeddb' });
    channel.dispose();
  });

  it('gates delivery via interestedIn', () => {
    const listen = vi.fn().mockReturnValue(vi.fn());
    const { channel, wire } = createTestChannel(listen);
    const handler = vi.fn();
    channel.onFileWritten({ handler, interestedIn: (p) => p.startsWith('a/') });
    wire({ type: 'fileWritten', path: '/project/b/x.ts', backend: 'indexeddb' });
    expect(handler).not.toHaveBeenCalled();
    wire({ type: 'fileWritten', path: '/project/a/x.ts', backend: 'indexeddb' });
    expect(handler).toHaveBeenCalledOnce();
    channel.dispose();
  });

  it('stops delivering after dispose', () => {
    const listen = vi.fn().mockReturnValue(vi.fn());
    const { channel, wire } = createTestChannel(listen);
    const handler = vi.fn();
    channel.onFileWritten({ handler });
    channel.dispose();
    wire({ type: 'fileWritten', path: '/project/a.ts', backend: 'indexeddb' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('supports multiple consumers with different predicates', () => {
    const listen = vi.fn().mockReturnValue(vi.fn());
    const { channel, wire } = createTestChannel(listen);
    const a = vi.fn();
    const b = vi.fn();
    channel.onFileWritten({ handler: a, interestedIn: (p) => p.startsWith('a/') });
    channel.onFileWritten({ handler: b, interestedIn: (p) => p.startsWith('b/') });
    wire({ type: 'fileWritten', path: '/project/a/x.ts', backend: 'indexeddb' });
    expect(a).toHaveBeenCalledOnce();
    expect(b).not.toHaveBeenCalled();
    channel.dispose();
  });

  it('should not skip sibling handlers when one self-unsubscribes during dispatch', () => {
    const listen = vi.fn().mockReturnValue(vi.fn());
    const { channel, wire } = createTestChannel(listen);
    const sibling = vi.fn();
    let unsubscribeSelf: (() => void) | undefined;

    unsubscribeSelf = channel.onFileWritten({
      handler: () => {
        unsubscribeSelf?.();
      },
    });
    channel.onFileWritten({ handler: sibling });

    wire({ type: 'fileWritten', path: '/project/a.ts', backend: 'indexeddb' });

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
    wire({ type: 'fileWritten', path: '/project/a.ts', backend: 'indexeddb' });

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
    wire({ type: 'fileWritten', path: '/project/a.ts', backend: 'indexeddb' });

    expect(handler).not.toHaveBeenCalled();
    channel.dispose();
  });
});
