/**
 * The file manager's side of the language worker's index mirror (charter D13):
 * the whole index once, then the index's own changes after each change set.
 */
import type { FileStatEntry, IndexChanges } from '@taucad/filesystem';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TauIndexMirrorMessage } from '#sync/index-mirror.js';
import { attachSyncFsServer } from '#sync/sync-fs-server.js';
import type { SyncFsIndexSource } from '#sync/sync-fs-server.js';

const workspace = {
  readFileBytes: async () => new Uint8Array(),
  stat: async () => ({ mtimeMs: 0, isDirectory: false }),
  listDirectories: async () => [],
};

const entry = (path: string, generation: number, kind: 'file' | 'dir' = 'file') => ({
  path,
  kind,
  size: kind === 'file' ? 1 : 0,
  mtimeMs: 10,
  generation,
});

const changes = (generation: number, overrides: Partial<IndexChanges> = {}): IndexChanges => ({
  generation,
  epoch: 'e1',
  entries: [],
  removed: [],
  ...overrides,
});

const fileRow = (path: string): FileStatEntry => ({
  path,
  name: path.split('/').at(-1) ?? path,
  type: 'file',
  size: 2,
  mtimeMs: 5,
});

const opened: Array<{ dispose(): void }> = [];
const ports: MessagePort[] = [];

afterEach(() => {
  for (const server of opened.splice(0)) {
    server.dispose();
  }
  for (const port of ports.splice(0)) {
    port.close();
  }
});

/** A server over `index`, with every mirror message the worker's end receives. */
const serve = (index: SyncFsIndexSource) => {
  const { port1, port2 } = new MessageChannel();
  ports.push(port1, port2);
  const received: TauIndexMirrorMessage[] = [];
  port1.addEventListener('message', (event: MessageEvent<TauIndexMirrorMessage>) => {
    received.push(event.data);
  });
  port1.start();
  opened.push(
    attachSyncFsServer({
      port: port2,
      slotSab: new SharedArrayBuffer(16),
      arenaSab: new SharedArrayBuffer(64),
      workspace: { ...workspace, index },
    }),
  );
  return received;
};

/** An index source whose watch the test fires, with a change set's generation when given. */
const source = (changedSince: SyncFsIndexSource['changedSince'], rows: readonly FileStatEntry[] = []) => {
  let fire: ((changeSet?: Readonly<{ generation: number }>) => void) | undefined;
  const unsubscribe = vi.fn();
  const index: SyncFsIndexSource = {
    changedSince: vi.fn(changedSince),
    statTree: vi.fn(async () => rows),
    watch: (onChange) => {
      fire = onChange;
      return unsubscribe;
    },
  };
  return {
    index,
    fire: (generation?: number) => fire?.(generation === undefined ? undefined : { generation }),
    unsubscribe,
  };
};

describe('the index mirror feed', () => {
  it('sends an index this session built whole, then only what each change set changed', async () => {
    const { index, fire } = source(async (since) =>
      since === 0
        ? changes(2, { entries: [entry('src', 1, 'dir'), entry('src/a.ts', 2)] })
        : changes(3, { entries: [entry('src/b.ts', 3)], removed: [{ path: 'src/a.ts', kind: 'file', generation: 3 }] }),
    );
    const received = serve(index);

    await vi.waitFor(() => {
      expect(received).toHaveLength(1);
    });
    fire();
    await vi.waitFor(() => {
      expect(received).toHaveLength(2);
    });

    expect(received[0]).toEqual({
      tau: 'index-mirror',
      kind: 'reset',
      generation: 2,
      entries: [
        ['src', 'd', 0, 10, 1],
        ['src/a.ts', 'f', 1, 10, 2],
      ],
      removed: [],
    });
    expect(received[1]).toEqual({
      tau: 'index-mirror',
      kind: 'changes',
      generation: 3,
      entries: [['src/b.ts', 'f', 1, 10, 3]],
      removed: ['src/a.ts'],
    });
    expect(index.changedSince).toHaveBeenLastCalledWith(2, { epoch: 'e1' });
    expect(index.statTree).not.toHaveBeenCalled();
  });

  it('lists an index loaded from a snapshot, whose changes since 0 it cannot tell', async () => {
    const { index } = source(async () => changes(7, { rescan: true }), [fileRow('src/lib/a.ts'), fileRow('main.ts')]);
    const received = serve(index);

    await vi.waitFor(() => {
      expect(received).toHaveLength(1);
    });

    expect(received[0]).toEqual({
      tau: 'index-mirror',
      kind: 'reset',
      generation: 7,
      entries: [
        ['src/lib/a.ts', 'f', 2, 5, 7],
        ['main.ts', 'f', 2, 5, 7],
        ['src', 'd', 0, 0, 7],
        ['src/lib', 'd', 0, 0, 7],
      ],
      removed: [],
    });
  });

  it('sends nothing for a change set that changed nothing the index holds', async () => {
    const { index, fire } = source(async (since) =>
      since === 0 ? changes(1, { entries: [entry('a.ts', 1)] }) : changes(1),
    );
    const received = serve(index);
    await vi.waitFor(() => {
      expect(received).toHaveLength(1);
    });

    fire();
    await vi.waitFor(() => {
      expect(index.changedSince).toHaveBeenCalledTimes(2);
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });

    expect(received).toHaveLength(1);
  });

  it('folds change sets that arrive during an ask into one more ask', async () => {
    let release: (() => void) | undefined;
    const { index, fire } = source(async (since) => {
      if (since === 0) {
        return changes(1);
      }
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return changes(since + 1, { entries: [entry(`f${String(since)}.ts`, since + 1)] });
    });
    const received = serve(index);
    await vi.waitFor(() => {
      expect(received).toHaveLength(1);
    });

    fire();
    fire();
    fire();
    await vi.waitFor(() => {
      expect(release).toBeDefined();
    });
    release?.();
    await vi.waitFor(() => {
      expect(index.changedSince).toHaveBeenCalledTimes(3);
    });
    release?.();
    await vi.waitFor(() => {
      expect(received).toHaveLength(3);
    });

    expect(received.map((message) => message.kind)).toEqual(['reset', 'changes', 'changes']);
  });

  it('sends the index whole again after a rescan answer, and after an ask that failed (saying stale between)', async () => {
    let calls = 0;
    const { index, fire } = source(async (since) => {
      calls += 1;
      if (calls === 2) {
        return changes(5, { rescan: true });
      }
      if (calls === 4) {
        throw new Error('index closed');
      }
      return changes(since === 0 ? 5 : since, { entries: since === 0 ? [entry('a.ts', 5)] : [] });
    });
    const received = serve(index);
    await vi.waitFor(() => {
      expect(received).toHaveLength(1);
    });

    fire();
    await vi.waitFor(() => {
      expect(received).toHaveLength(2);
    });
    fire();
    await vi.waitFor(() => {
      expect(calls).toBe(4);
    });
    fire();
    await vi.waitFor(() => {
      expect(received).toHaveLength(4);
    });

    expect(received.map((message) => message.kind)).toEqual(['reset', 'reset', 'stale', 'reset']);
  });

  it('says stale on a failed ask with no change after it, then retries on its own until the index answers', async () => {
    let calls = 0;
    const { index } = source(async () => {
      calls += 1;
      if (calls <= 2) {
        throw new Error('index not open yet');
      }
      return changes(4, { entries: [entry('a.ts', 4)] });
    });
    const received = serve(index);

    await vi.waitFor(
      () => {
        expect(received.map((message) => message.kind)).toEqual(['stale', 'stale', 'reset']);
      },
      { timeout: 3000 },
    );
    expect(received[2]?.entries).toEqual([['a.ts', 'f', 1, 10, 4]]);
  });

  it('names what the index never holds on every message, read afresh each time', async () => {
    const excluded = ['.tau/index', '.tau-staging'];
    const { index, fire } = source(async (since) =>
      since === 0 ? changes(1, { entries: [entry('a.ts', 1)] }) : changes(2, { entries: [entry('b.ts', 2)] }),
    );
    const received = serve({ ...index, excluded: () => excluded });
    await vi.waitFor(() => {
      expect(received).toHaveLength(1);
    });
    excluded.push('mounted');
    fire();
    await vi.waitFor(() => {
      expect(received).toHaveLength(2);
    });

    expect(received[0]?.excluded).toEqual(['.tau/index', '.tau-staging']);
    expect(received[1]?.excluded).toEqual(['.tau/index', '.tau-staging', 'mounted']);
  });

  it('sends an empty directory a listed index names', async () => {
    const { index } = source(
      async () => changes(3, { rescan: true }),
      [{ path: 'empty', name: 'empty', type: 'dir', size: 0, mtimeMs: 4 }],
    );
    const received = serve(index);
    await vi.waitFor(() => {
      expect(received).toHaveLength(1);
    });

    expect(received[0]?.entries).toEqual([['empty', 'd', 0, 0, 3]]);
  });

  it('says a heard change set is ahead at once, then names it on the answer that reflects it', async () => {
    let release: (() => void) | undefined;
    const { index, fire } = source(async (since) => {
      if (since === 0) {
        return changes(1, { entries: [entry('a.ts', 1)] });
      }
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return changes(2, { entries: [entry('b.ts', 2)] });
    });
    const received = serve(index);
    await vi.waitFor(() => {
      expect(received).toHaveLength(1);
    });

    fire(7);
    await vi.waitFor(() => {
      expect(received).toHaveLength(2);
    });
    expect(received[1]).toMatchObject({ kind: 'ahead', changeSet: 7, entries: [] });
    expect(release).toBeDefined();

    release?.();
    await vi.waitFor(() => {
      expect(received).toHaveLength(3);
    });
    expect(received[2]).toMatchObject({ kind: 'changes', changeSet: 7, entries: [['b.ts', 'f', 1, 10, 2]] });
  });

  it('lets the mirror catch up on a change set that changed nothing the index holds', async () => {
    const { index, fire } = source(async (since) =>
      since === 0 ? changes(1, { entries: [entry('a.ts', 1)] }) : changes(1),
    );
    const received = serve(index);
    await vi.waitFor(() => {
      expect(received).toHaveLength(1);
    });

    fire(3);
    await vi.waitFor(() => {
      expect(received).toHaveLength(3);
    });

    expect(received.slice(1)).toEqual([
      { tau: 'index-mirror', kind: 'ahead', generation: 1, entries: [], removed: [], changeSet: 3 },
      { tau: 'index-mirror', kind: 'changes', generation: 1, entries: [], removed: [], changeSet: 3 },
    ]);
  });

  it('stops asking and unsubscribes once disposed', async () => {
    let finish: (() => void) | undefined;
    const { index, unsubscribe } = source(async () => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return changes(1, { entries: [entry('a.ts', 1)] });
    });
    const received = serve(index);
    await vi.waitFor(() => {
      expect(finish).toBeDefined();
    });

    opened.pop()?.dispose();
    finish?.();
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(received).toHaveLength(0);
  });
});
