import { describe, it, expect, vi } from 'vitest';
import type { ChangeSet } from '#change-event-bus.js';
import { watchByChangeSets } from '#change-set-watch.js';
import type { BridgeWatchHandle, ChangeSetChannelEvent } from '#change-set-watch.js';
import type { WatchEvent } from '#types.js';

const handle = (ready: Promise<void> = Promise.resolve()) => {
  const unsubscribe = vi.fn<() => void>();
  const watch: BridgeWatchHandle = { ready, closed: Promise.withResolvers<void>().promise, unsubscribe };
  return Object.assign(watch, { unsubscribe });
};

const refused = async (code: string): Promise<void> => {
  throw Object.assign(new Error(code), { code });
};

describe('watchByChangeSets (D6)', () => {
  it('registers only the change-set form and expands each set into its watch events', async () => {
    let deliver: ((set: ChangeSet) => void) | undefined;
    const sets = handle();
    const source = {
      watchReady: vi.fn(),
      watchChangeSets: vi.fn((_request: unknown, handler: (set: ChangeSet) => void) => {
        deliver = handler;
        return sets;
      }),
    };
    const events: WatchEvent[] = [];
    const watch = watchByChangeSets(source, { paths: [''], recursive: true }, (event) => events.push(event));
    await watch.ready;

    deliver!({
      generation: 1,
      entries: [
        { op: 'created', path: 'a.ts', kind: 'file' },
        { op: 'written', path: 'b.ts', kind: 'file' },
        { op: 'deleted', path: 'c.ts', kind: 'file' },
        { op: 'moved', path: 'e.ts', oldPath: 'd.ts', kind: 'file' },
      ],
      touchedDirectories: [''],
    });
    deliver!({ generation: 2, entries: [], touchedDirectories: [], reset: { prefix: 'src', reason: 'overflow' } });

    expect(source.watchReady).not.toHaveBeenCalled();
    expect(events).toEqual([
      { type: 'change', path: 'a.ts' },
      { type: 'change', path: 'b.ts' },
      { type: 'delete', path: 'c.ts' },
      { type: 'rename', oldPath: 'd.ts', newPath: 'e.ts' },
      { type: 'reset' },
    ]);
    watch.unsubscribe();
    expect(sets.unsubscribe).toHaveBeenCalledOnce();
  });

  it('falls back to the per-path form where the connection serves no change sets', async () => {
    const perPath = handle();
    const source = {
      watchReady: vi.fn(() => perPath),
      watchChangeSets: vi.fn(() => handle(refused('ENOTSUP'))),
    };
    const handler = vi.fn();
    const watch = watchByChangeSets(source, { paths: ['a.ts'] }, handler);
    await watch.ready;

    expect(source.watchReady).toHaveBeenCalledWith({ paths: ['a.ts'] }, handler);
    watch.unsubscribe();
    expect(perPath.unsubscribe).toHaveBeenCalledOnce();
  });

  it('surfaces any other registration failure through ready', async () => {
    const source = {
      watchReady: vi.fn(),
      watchChangeSets: vi.fn(() => handle(refused('ESTALE'))),
    };
    const watch = watchByChangeSets(source, { paths: [''] }, vi.fn());

    await expect(watch.ready).rejects.toMatchObject({ code: 'ESTALE' });
    expect(source.watchReady).not.toHaveBeenCalled();
  });
});

describe('watchByChangeSets on the connection event channel (D14)', () => {
  type ChannelHandler = (event: ChangeSetChannelEvent) => void;

  /** An event channel that hands each subscriber every frame. */
  const channelSource = (ready: () => Promise<void> = async () => undefined) => {
    const handlers = new Set<ChannelHandler>();
    const subscriptions: Array<ReturnType<typeof handle>> = [];
    const events = vi.fn((handler: ChannelHandler) => {
      handlers.add(handler);
      const subscription = handle(ready());
      subscription.unsubscribe.mockImplementation(() => {
        handlers.delete(handler);
      });
      subscriptions.push(subscription);
      return subscription;
    });
    const send = (event: ChangeSetChannelEvent): void => {
      for (const handler of handlers) {
        handler(event);
      }
    };
    return { events, send, subscriptions };
  };

  it('serves every watch from the channel, each with its own events, never the scoped forms', async () => {
    const channel = channelSource();
    const source = { events: channel.events, watchReady: vi.fn(), watchChangeSets: vi.fn() };
    const kernel: WatchEvent[] = [];
    const log: WatchEvent[] = [];
    const kernelWatch = watchByChangeSets(source, { paths: ['agent'], recursive: true }, (event) => kernel.push(event));
    const logWatch = watchByChangeSets(source, { paths: ['agent/t1/events.jsonl'] }, (event) => log.push(event));
    await Promise.all([kernelWatch.ready, logWatch.ready]);

    channel.send({
      kind: 'changeSet',
      set: {
        generation: 1,
        entries: [
          { op: 'written', path: 'agent/t1/events.jsonl', kind: 'file' },
          { op: 'written', path: 'agent/t1/file-0.ts', kind: 'file' },
          { op: 'written', path: 'docs/readme.md', kind: 'file' },
        ],
        touchedDirectories: ['agent/t1', 'docs'],
      },
    });
    channel.send({ kind: 'compute-restarted' });
    channel.send({ kind: 'authority-lost' });

    expect(kernel).toEqual([
      { type: 'change', path: 'agent/t1/events.jsonl' },
      { type: 'change', path: 'agent/t1/file-0.ts' },
    ]);
    expect(log).toEqual([{ type: 'change', path: 'agent/t1/events.jsonl' }]);
    expect(source.watchChangeSets).not.toHaveBeenCalled();
    expect(source.watchReady).not.toHaveBeenCalled();
    kernelWatch.unsubscribe();
    logWatch.unsubscribe();
    expect(channel.subscriptions.map((subscription) => subscription.unsubscribe.mock.calls.length)).toEqual([1, 1]);
  });

  it('steps down to the change-set form, then per-path, on ENOTSUP, and skips the channel for later watches', async () => {
    const channel = channelSource(async () => refused('ENOTSUP'));
    const perPath = handle();
    const source = {
      events: channel.events,
      watchChangeSets: vi.fn(() => handle(refused('ENOTSUP'))),
      watchReady: vi.fn(() => perPath),
    };
    const handler = vi.fn();
    const first = watchByChangeSets(source, { paths: ['a.ts'] }, handler);
    await first.ready;
    expect(source.watchChangeSets).toHaveBeenCalledOnce();
    expect(source.watchReady).toHaveBeenCalledWith({ paths: ['a.ts'] }, handler);

    const second = watchByChangeSets(source, { paths: ['b.ts'] }, vi.fn());
    await second.ready;
    expect(channel.events).toHaveBeenCalledOnce();
    expect(source.watchChangeSets).toHaveBeenCalledTimes(2);
    first.unsubscribe();
    second.unsubscribe();
    expect(perPath.unsubscribe).toHaveBeenCalledTimes(2);
  });

  it('surfaces any other refusal of the channel through ready, and a channel-only source keeps ENOTSUP', async () => {
    const source = { events: channelSource(async () => refused('EIO')).events, watchChangeSets: vi.fn() };
    const watch = watchByChangeSets(source, { paths: [''] }, vi.fn());
    await expect(watch.ready).rejects.toMatchObject({ code: 'EIO' });
    await expect(watch.closed).rejects.toMatchObject({ code: 'EIO' });
    expect(source.watchChangeSets).not.toHaveBeenCalled();

    const channelOnly = { events: channelSource(async () => refused('ENOTSUP')).events };
    await expect(watchByChangeSets(channelOnly, { paths: [''] }, vi.fn()).ready).rejects.toMatchObject({
      code: 'ENOTSUP',
    });
  });

  it('refuses a source that offers no form at all', () => {
    expect(() => watchByChangeSets({}, { paths: [''] }, vi.fn())).toThrow(TypeError);
  });
});
