import { describe, it, expect, vi } from 'vitest';
import type { ChangeSet } from '#change-event-bus.js';
import { watchByChangeSets } from '#change-set-watch.js';
import type { BridgeWatchHandle } from '#change-set-watch.js';
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
