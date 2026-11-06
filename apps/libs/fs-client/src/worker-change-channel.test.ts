import { describe, it, expect, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { ChangeSet, ChangeSetEntry } from '@taucad/filesystem';
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

  it('expands a changeset message into its facts and one change set (D6)', () => {
    const listen = vi.fn().mockReturnValue(vi.fn());
    const { channel, wire } = createTestChannel(listen);
    const written = vi.fn();
    const deleted = vi.fn();
    const sets = vi.fn();
    channel.onFileWritten({ handler: written });
    channel.onFileDeleted({ handler: deleted });
    channel.onChangeSet(sets);

    wire({
      type: 'changeSet',
      entries: [
        ...Array.from({ length: 49 }, (_, index) => ({
          type: 'fileWritten',
          path: `agent/file-${String(index)}.ts`,
          backend: 'opfs',
        })),
        { type: 'fileDeleted', path: 'top.ts', backend: 'opfs' },
      ],
    });

    expect(written).toHaveBeenCalledTimes(49);
    expect(deleted).toHaveBeenCalledOnce();
    expect(sets).toHaveBeenCalledOnce();
    expect(sets).toHaveBeenCalledWith(
      expect.objectContaining({ generation: 1, touchedDirectories: ['', 'agent'], backend: 'opfs' }),
    );
    expect(sets.mock.calls[0]![0].entries).toHaveLength(50);
    channel.dispose();
  });

  it('ignores a changeset message carrying anything but path facts', () => {
    const listen = vi.fn().mockReturnValue(vi.fn());
    const { channel, wire } = createTestChannel(listen);
    const sets = vi.fn();
    channel.onChangeSet(sets);
    wire({ type: 'changeSet', entries: [{ type: 'changeSet', entries: [] }] });
    wire({ type: 'changeSet', entries: 'nope' });
    expect(sets).not.toHaveBeenCalled();
    channel.dispose();
  });

  it('reports a summary in the relative namespace as a reset of its prefix', () => {
    const listen = vi.fn().mockReturnValue(vi.fn());
    const { channel, wire } = createTestChannel(listen);
    const sets = vi.fn();
    channel.onChangeSet(sets);
    wire({ type: 'backendChanged', backend: 'opfs' });
    expect(sets).toHaveBeenCalledWith(
      expect.objectContaining({ entries: [], reset: { prefix: '', reason: 'topology' } }),
    );
    channel.dispose();
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

describe('acknowledged observation watches', () => {
  it('should preserve native registration and connection closure without substituting local readiness', async () => {
    const ready = Promise.withResolvers<void>();
    const closed = Promise.withResolvers<void>();
    const unsubscribe = vi.fn();
    const watchReady = vi.fn().mockReturnValue({ ready: ready.promise, closed: closed.promise, unsubscribe });
    const channel = new WorkerChangeChannel({ transport: { listen: vi.fn().mockReturnValue(vi.fn()), watchReady } });
    const handler = vi.fn();
    const watch = channel.watchReady({ paths: ['settings.json'] }, handler);
    expect(watch.ready).toBe(ready.promise);
    expect(watch.closed).toBe(closed.promise);
    expect(watchReady).toHaveBeenCalledWith({ paths: ['settings.json'] }, handler);
    watch.dispose();
    expect(unsubscribe).toHaveBeenCalledOnce();
    channel.dispose();
  });

  it('registers the change-set form when the transport offers it, never a per-path wire watch (D6, S8)', async () => {
    const unsubscribe = vi.fn();
    let deliver: ((set: ChangeSet) => void) | undefined;
    const watchReady = vi.fn();
    const watchChangeSets = vi.fn((_request: unknown, handler: (set: ChangeSet) => void) => {
      deliver = handler;
      return { ready: Promise.resolve(), closed: Promise.withResolvers<void>().promise, unsubscribe };
    });
    const channel = new WorkerChangeChannel({
      transport: { listen: vi.fn().mockReturnValue(vi.fn()), watchReady, watchChangeSets },
    });
    const handler = vi.fn();
    const watch = channel.watchReady({ paths: ['src'], recursive: false }, handler);
    await watch.ready;

    deliver!({
      generation: 3,
      entries: Array.from(
        { length: 50 },
        (_, index): ChangeSetEntry => ({ op: 'written', path: `src/file-${String(index)}.ts`, kind: 'file' }),
      ),
      touchedDirectories: ['src'],
    });

    expect(watchReady).not.toHaveBeenCalled();
    expect(watchChangeSets).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledTimes(50);
    expect(handler).toHaveBeenLastCalledWith({ type: 'change', path: 'src/file-49.ts' });
    watch.dispose();
    expect(unsubscribe).toHaveBeenCalledOnce();
    channel.dispose();
  });
});
