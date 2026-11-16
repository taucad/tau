/* oxlint-disable typescript/no-unsafe-assignment -- Focused actor doubles intentionally expose only the consumed snapshot fields. */
/**
 * The entries record session (app state orchestration plan § 4 A9; rows S24, S25; I13). The rows moved here from
 * `routes/w.$workspace.$project/entries-sync-host.test.tsx` when the host became a runtime child. Each keeps its
 * scenario and assertion on the new owner ("flip, never delete"; A0.3 ruling). Old → new:
 *
 * | Old row (entries-sync-host.test.tsx) | New row (this file) |
 * | --- | --- |
 * | should bound the registered project-close flush without discarding a pending entries write | the same name |
 * | should map durable renderTimeout %i to the runtime operation event (`EntryOwner`) | the same name, on `createEntryApplier` |
 * | re-registers a closed entries watch on retry and applies later external edits | the same name |
 * | retains and observes live entry settings after code selects a checkout | reads and writes the project's own record whatever the code checkout |
 * | returns every model to default settings when the entries record is deleted, without writing | the same name |
 * | persists an entry owner edit after first service readiness and StrictMode replay | persists an entry owner edit after the first acknowledgement, once |
 * | does not reacknowledge stale entry bytes after a read failure and a new owner mount | does not reacknowledge stale entry bytes after a read failure and a new geometry unit |
 * | persists a human hide without reverting it and adopts a foreign isolation independently | the same name, on `createEntryApplier` |
 * | keeps newer local entry settings when an older checked write is received with a foreign sibling field | the same name, on `createEntryApplier` |
 * | keeps a newer live timeout when an own write of two entries lands with an older one | the same name |
 * | StrictMode double mount (A0.3): should keep one producer whose flush settles an entries write in flight | one producer (A0.3 row 5, S25): the same name |
 * | StrictMode double mount (A0.3): I13 should hold one live entries record session (`it.fails`) | I13: should hold one live entries record session (flipped to passing) |
 */
import type { WatchEvent } from '@taucad/filesystem';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActorRefFrom, Subscription } from 'xstate';
import { workbenchRecords } from '@taucad/workbench';
import type { WorkbenchEntries } from '@taucad/workbench';
import type { modelInteractionMachine } from '@taucad/viewer/machines/model-interaction.machine';
import type { cadMachine } from '#machines/cad.machine.js';
import type * as EntriesStoreModule from '#workbench-records/entries-store.js';
import { slowWriteMilliseconds } from '#workbench-records/record-health.js';
import { readRecordIssues, subscribeRecordIssues } from '#workbench-records/record-issues.js';
import { createEntriesRecordSession, createEntryApplier } from '#workbench-records/entries-record-session.js';
import type { EntriesRecordProject, EntriesRecordSession } from '#workbench-records/entries-record-session.js';

type Entry = WorkbenchEntries['entries'][string];
type CadRef = ActorRefFrom<typeof cadMachine>;
type ModelRef = ActorRefFrom<typeof modelInteractionMachine>;

/** Every entries store the session builds, and whether it was disposed: one record session per file (I13). */
const entriesStores = vi.hoisted((): Array<{ disposed: boolean }> => []);
vi.mock('#workbench-records/entries-store.js', async (importOriginal) => {
  const actual = await importOriginal<typeof EntriesStoreModule>();
  return {
    ...actual,
    createWorkbenchEntriesStore: (...input: Parameters<typeof actual.createWorkbenchEntriesStore>) => {
      const store = actual.createWorkbenchEntriesStore(...input);
      const tracked = { disposed: false };
      entriesStores.push(tracked);
      return {
        ...store,
        dispose: () => {
          tracked.disposed = true;
          store.dispose();
        },
      };
    },
  };
});

let liveRootOnly = false;
let liveWatchEntries: (() => void) | undefined;
let nextWatchReady: Promise<void> | undefined;
const watchClosures: Array<ReturnType<typeof Promise.withResolvers<void>>> = [];
const watchRecordFile = (path: string, listener: (event: WatchEvent) => void) => {
  const closed = Promise.withResolvers<void>();
  watchClosures.push(closed);
  const ready = nextWatchReady ?? Promise.resolve();
  nextWatchReady = undefined;
  liveWatchEntries = () => {
    listener({ type: 'change', path });
  };
  return {
    ready,
    closed: closed.promise,
    dispose: () => {
      liveWatchEntries = undefined;
    },
  };
};
const hostFiles = (() => {
  let bytes: Uint8Array<ArrayBuffer> | undefined;
  let fail = false;
  return {
    set: (next: Uint8Array<ArrayBuffer>) => {
      bytes = next;
    },
    get: () => bytes,
    remove: () => {
      bytes = undefined;
    },
    failOnce: () => {
      fail = true;
    },
    exists: async (path: string) => (!liveRootOnly || path.startsWith('/projects/p/')) && bytes !== undefined,
    readFile: async (path: string) => {
      if (liveRootOnly && !path.startsWith('/projects/p/')) {
        throw new Error('candidate entries read');
      }
      if (fail) {
        fail = false;
        throw new Error('offline');
      }
      return bytes!;
    },
    writeFileChecked: vi.fn(
      async ({ data }: { data: string }): Promise<{ status: 'applied'; content: Uint8Array<ArrayBuffer> }> => {
        bytes = new TextEncoder().encode(data);
        return { status: 'applied', content: bytes };
      },
    ),
  };
})();

const recordBytes = (entries: WorkbenchEntries['entries']): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(workbenchRecords.entries.serialize({ version: 1, entries }));

/** An actor double whose context the test changes, notifying its subscribers as a real actor would. */
const createActorDouble = <Context extends Record<string, unknown>>(
  context: Context,
  onSend: (state: Context, event: { type: string } & Record<string, unknown>) => void,
) => {
  const listeners = new Set<(snapshot: { context: Context }) => void>();
  const state = { context };
  const emit = (): void => {
    /* A listener that unsubscribes while it is called must not skip the next one. */
    for (const listener of new Set(listeners)) {
      listener({ context: state.context });
    }
  };
  return {
    state,
    getSnapshot: () => ({ context: state.context }),
    subscribe: (listener: (snapshot: { context: Context }) => void): Subscription => {
      listeners.add(listener);
      return {
        unsubscribe: () => {
          listeners.delete(listener);
        },
      };
    },
    send: vi.fn((event: { type: string } & Record<string, unknown>) => {
      onSend(state.context, event);
      emit();
    }),
    /** A person's change: the context moves and subscribers hear of it. */
    change: (next: Partial<Context>) => {
      state.context = { ...state.context, ...next };
      emit();
    },
    listeners,
  };
};

const createCad = (operationTimeout: number) =>
  createActorDouble({ operationTimeout }, (context, event) => {
    if (event.type === 'setOperationTimeout') {
      context.operationTimeout = event['operationTimeout'] as number;
    }
  });

type UnitDisplay = {
  hiddenComponentIds: string[];
  isolatedComponentIds: string[];
  opacityByComponentId: Record<string, number>;
};
const createModel = (unitsById: Record<string, UnitDisplay> = {}) =>
  createActorDouble({ unitOrder: Object.keys(unitsById), unitsById }, (context, event) => {
    if (event.type !== 'restoreComponentDisplay') {
      return;
    }
    const display = event['componentDisplay'] as { unitsById: Record<string, UnitDisplay> };
    context.unitsById = { ...context.unitsById, ...display.unitsById };
  });

type CadDouble = ReturnType<typeof createCad>;
type ModelDouble = ReturnType<typeof createModel>;

/**
 * The doubles implement only the snapshot and subscription surface the session reads, so each stands in for its
 * actor through this one documented assertion rather than a cast at every call site.
 */
const asActor = <T>(double: unknown): T =>
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a read-surface double stands in for the actor
  double as T;

const createProject = (units: ReadonlyArray<readonly [string, CadDouble]>, model: ModelDouble = createModel()) =>
  createActorDouble(
    {
      geometryUnits: asActor<ReadonlyMap<string, CadRef>>(new Map(units)),
      modelInteractionRef: asActor<ModelRef>(model),
    },
    () => undefined,
  );

const createProducers = () => {
  const producers = new Set<() => Promise<void>>();
  return {
    producers,
    register: (flush: () => Promise<void>) => {
      producers.add(flush);
      return () => {
        producers.delete(flush);
      };
    },
  };
};

const running: Array<() => void> = [];
const startSession = (
  project: ReturnType<typeof createProject> = createProject([]),
): Readonly<{
  session: EntriesRecordSession;
  producers: ReturnType<typeof createProducers>;
  records: Array<WorkbenchEntries | undefined>;
  stop: () => void;
}> => {
  const session = createEntriesRecordSession({ projectId: 'p', host: { files: hostFiles, watch: watchRecordFile } });
  const records: Array<WorkbenchEntries | undefined> = [];
  let last = session.getSnapshot().entriesRecord;
  session.subscribe(() => {
    const { entriesRecord } = session.getSnapshot();
    if (entriesRecord !== last) {
      last = entriesRecord;
      records.push(entriesRecord);
    }
  });
  const producers = createProducers();
  const stopSession = session.start({ project: asActor<EntriesRecordProject>(project), producers });
  let stopped = false;
  const stop = (): void => {
    if (!stopped) {
      stopped = true;
      stopSession();
    }
  };
  running.push(stop);
  return { session, producers, records, stop };
};

beforeEach(() => {
  liveRootOnly = false;
  liveWatchEntries = undefined;
  nextWatchReady = undefined;
  watchClosures.length = 0;
  entriesStores.length = 0;
  hostFiles.writeFileChecked.mockClear();
});
afterEach(() => {
  for (const stop of running.splice(0)) {
    stop();
  }
  vi.useRealTimers();
});

describe('the entries record session', () => {
  it('should bound the registered project-close flush without discarding a pending entries write', async () => {
    hostFiles.set(recordBytes({ 'a.ts': { renderTimeout: 30_000 } }));
    const { session, producers, records } = startSession();
    await vi.waitFor(() => {
      expect(records.length).toBeGreaterThan(0);
    });
    const [closeFlush] = [...producers.producers];
    const authority = Promise.withResolvers<void>();
    const write = hostFiles.writeFileChecked.getMockImplementation()!;
    hostFiles.writeFileChecked.mockImplementationOnce(async (input) => {
      await authority.promise;
      return write(input);
    });
    let rename: Promise<boolean> | undefined;
    vi.useFakeTimers();
    try {
      rename = session.changePaths({ type: 'rename', oldPath: 'a.ts', newPath: 'b.ts' });
      await Promise.resolve();
      let refusal: unknown;
      const waiting = (async () => {
        try {
          await closeFlush!();
        } catch (error) {
          refusal = error;
        }
      })();
      await vi.advanceTimersByTimeAsync(slowWriteMilliseconds);
      expect(refusal).toBeInstanceOf(Error);
      expect((refusal as Error).message).toBe('Model display settings are not confirmed saved.');
      expect(workbenchRecords.entries.read(hostFiles.get()!)).toMatchObject({
        status: 'current',
        record: { entries: { 'a.ts': { renderTimeout: 30_000 } } },
      });
      authority.resolve();
      await rename;
      await waiting;
      await expect(closeFlush!()).resolves.toBeUndefined();
      expect(workbenchRecords.entries.read(hostFiles.get()!)).toMatchObject({
        status: 'current',
        record: { entries: { 'b.ts': { renderTimeout: 30_000 } } },
      });
      expect(readRecordIssues('p')).toEqual([]);
    } finally {
      authority.resolve();
      await rename;
    }
  });

  it('re-registers a closed entries watch on retry and applies later external edits', async () => {
    hostFiles.set(recordBytes({ 'a.ts': { renderTimeout: 30_000 } }));
    const { records } = startSession();
    await vi.waitFor(() => {
      expect(records.length).toBeGreaterThan(0);
    });
    watchClosures[0]!.resolve();
    await vi.waitFor(() => {
      expect(readRecordIssues('p')[0]?.state).toBe('unavailable');
    });
    const ready = Promise.withResolvers<void>();
    nextWatchReady = ready.promise;
    hostFiles.set(recordBytes({ 'a.ts': { renderTimeout: 45_000 } }));
    records.length = 0;
    await readRecordIssues('p')[0]!.retryRead();
    expect(watchClosures).toHaveLength(2);
    expect(records).toEqual([]);
    // Re-registering is not a problem: the issue clears instead of flashing a reading state.
    await vi.waitFor(() => {
      expect(readRecordIssues('p')).toEqual([]);
    });
    ready.resolve();
    await vi.waitFor(() => {
      expect(records.at(-1)).toMatchObject({ entries: { 'a.ts': { renderTimeout: 45_000 } } });
    });
    expect(readRecordIssues('p')).toEqual([]);
    hostFiles.set(recordBytes({ 'a.ts': { renderTimeout: 60_000 } }));
    // A routine re-read of a fine record never publishes an issue (the header trigger would flash).
    const published = vi.fn();
    const stop = subscribeRecordIssues('p', published);
    liveWatchEntries?.();
    await vi.waitFor(() => {
      expect(records.at(-1)).toMatchObject({ entries: { 'a.ts': { renderTimeout: 60_000 } } });
    });
    stop();
    expect(published).not.toHaveBeenCalled();
    expect(hostFiles.writeFileChecked).not.toHaveBeenCalled();
  });

  it("clears a closed watch's issue as soon as the file manager hands over a new watch", async () => {
    hostFiles.set(recordBytes({ 'a.ts': { renderTimeout: 30_000 } }));
    const { session, records } = startSession();
    await vi.waitFor(() => {
      expect(records.length).toBeGreaterThan(0);
    });
    watchClosures[0]!.resolve();
    await vi.waitFor(() => {
      expect(readRecordIssues('p')[0]?.state).toBe('unavailable');
    });
    // The new watch registers slowly: the closed watch's failure is not the new one's.
    nextWatchReady = Promise.withResolvers<void>().promise;
    session.replaceHost({ files: hostFiles, watch: (path, listener) => watchRecordFile(path, listener) });
    expect(readRecordIssues('p')).toEqual([]);
  });

  it("reads and writes the project's own record whatever the code checkout", async () => {
    liveRootOnly = true;
    hostFiles.set(recordBytes({ 'a.ts': { renderTimeout: 30_000 } }));
    const cad = createCad(30_000);
    const { records } = startSession(createProject([['a.ts', cad]]));
    await vi.waitFor(() => {
      expect(records.length).toBeGreaterThan(0);
    });
    hostFiles.set(recordBytes({ 'a.ts': { renderTimeout: 45_000 } }));
    liveWatchEntries?.();
    await vi.waitFor(() => {
      expect(records.at(-1)).toMatchObject({ entries: { 'a.ts': { renderTimeout: 45_000 } } });
    });
    expect(cad.state.context.operationTimeout).toBe(45_000);
    cad.change({ operationTimeout: 60_000 });
    await vi.waitFor(
      () => {
        expect(hostFiles.writeFileChecked).toHaveBeenCalledWith(
          expect.objectContaining({ path: '/projects/p/.tau/workbench/entries.json' }),
        );
      },
      { timeout: 1600 },
    );
  });

  it('returns every model to default settings when the entries record is deleted, without writing', async () => {
    hostFiles.set(recordBytes({ 'a.ts': { renderTimeout: 240_000 } }));
    const { records } = startSession();
    await vi.waitFor(() => {
      expect(records.at(-1)).toEqual({ version: 1, entries: { 'a.ts': { renderTimeout: 240_000 } } });
    });
    hostFiles.remove();
    liveWatchEntries?.();
    await vi.waitFor(() => {
      expect(records.at(-1)).toEqual({ version: 1, entries: {} });
    });
    expect(hostFiles.writeFileChecked).not.toHaveBeenCalled();
  });

  it('persists an entry owner edit after the first acknowledgement, once', async () => {
    hostFiles.set(recordBytes({ 'a.ts': { renderTimeout: 30_000 } }));
    const cad = createCad(30_000);
    const { session } = startSession(createProject([['a.ts', cad]]));
    await vi.waitFor(() => {
      expect(session.getSnapshot().appliedEntryRevisions.has('a.ts')).toBe(true);
    });
    cad.change({ operationTimeout: 45_000 });
    await vi.waitFor(
      () => {
        expect(workbenchRecords.entries.read(hostFiles.get()!)).toMatchObject({
          status: 'current',
          record: { entries: { 'a.ts': { renderTimeout: 45_000 } } },
        });
      },
      { timeout: 1500 },
    );
    expect(hostFiles.writeFileChecked).toHaveBeenCalledOnce();
  });

  it('does not reacknowledge stale entry bytes after a read failure and a new geometry unit', async () => {
    hostFiles.set(recordBytes({ 'a.ts': { renderTimeout: 30_000 } }));
    const cad = createCad(30_000);
    const project = createProject([['a.ts', cad]]);
    const { session } = startSession(project);
    const acknowledged = () => session.getSnapshot().appliedEntryRevisions;
    await vi.waitFor(() => {
      expect(acknowledged().has('a.ts')).toBe(true);
    });
    hostFiles.failOnce();
    liveWatchEntries?.();
    await vi.waitFor(() => {
      expect(acknowledged().has('a.ts')).toBe(false);
    });
    // A bounded retry is not a problem yet: nothing reaches the trigger.
    expect(readRecordIssues('p')).toEqual([]);
    project.change({
      geometryUnits: asActor<ReadonlyMap<string, CadRef>>(
        new Map([
          ['a.ts', cad],
          ['b.ts', cad],
        ]),
      ),
    });
    await Promise.resolve();
    expect(acknowledged().has('b.ts')).toBe(false);
    liveWatchEntries?.();
    await vi.waitFor(() => {
      expect(acknowledged().has('a.ts')).toBe(true);
    });
    expect(readRecordIssues('p')).toEqual([]);
  });

  it('keeps a newer live timeout when an own write of two entries lands with an older one', async () => {
    hostFiles.set(recordBytes({ 'a.ts': { renderTimeout: 30_000 }, 'b.ts': { renderTimeout: 30_000 } }));
    const a = createCad(30_000);
    const b = createCad(30_000);
    const { records } = startSession(
      createProject([
        ['a.ts', a],
        ['b.ts', b],
      ]),
    );
    await vi.waitFor(() => {
      expect(records.length).toBeGreaterThan(0);
    });
    const authority = Promise.withResolvers<void>();
    const write = hostFiles.writeFileChecked.getMockImplementation()!;
    hostFiles.writeFileChecked.mockImplementationOnce(async (input) => {
      await authority.promise;
      return write(input);
    });
    try {
      a.change({ operationTimeout: 45_000 });
      b.change({ operationTimeout: 60_000 });
      // One checked write carries both entries' timeouts; it is held while the person changes a.ts again.
      await vi.waitFor(
        () => {
          expect(hostFiles.writeFileChecked).toHaveBeenCalledOnce();
        },
        { timeout: 1500 },
      );
      a.change({ operationTimeout: 90_000 });
      a.send.mockClear();
      authority.resolve();
      await vi.waitFor(
        () => {
          expect(workbenchRecords.entries.read(hostFiles.get()!)).toMatchObject({
            status: 'current',
            record: { entries: { 'a.ts': { renderTimeout: 90_000 }, 'b.ts': { renderTimeout: 60_000 } } },
          });
        },
        { timeout: 1500 },
      );
      // The own write's patch names a.ts's timeout, so its older value never reaches the live model.
      expect(a.send).not.toHaveBeenCalledWith({ type: 'setOperationTimeout', operationTimeout: 45_000 });
      expect(a.state.context.operationTimeout).toBe(90_000);
    } finally {
      authority.resolve();
    }
  });

  it('reopens its store on replaced file ports, and only its watch on a replaced watch', async () => {
    hostFiles.set(recordBytes({ 'a.ts': { renderTimeout: 30_000 } }));
    const { session, records } = startSession();
    await vi.waitFor(() => {
      expect(records.length).toBeGreaterThan(0);
    });
    expect(entriesStores).toHaveLength(1);
    session.replaceHost({ files: hostFiles, watch: (path, listener) => watchRecordFile(path, listener) });
    expect(entriesStores).toHaveLength(1);
    expect(watchClosures).toHaveLength(2);
    session.replaceHost({ files: { ...hostFiles }, watch: watchRecordFile });
    expect(entriesStores.map(({ disposed }) => disposed)).toEqual([true, false]);
    hostFiles.set(recordBytes({ 'a.ts': { renderTimeout: 45_000 } }));
    liveWatchEntries?.();
    await vi.waitFor(() => {
      expect(records.at(-1)).toMatchObject({ entries: { 'a.ts': { renderTimeout: 45_000 } } });
    });
  });

  // Round 1 defect 1: a rename reaches the model-interaction actor before the project's observers hear of the moved
  // units. The applier for the gone path must not write empty components, which the rename would carry to b.ts.
  it("keeps a renamed entry's component visibility when the model is rekeyed before the units move", async () => {
    hostFiles.set(
      recordBytes({ 'a.ts': { renderTimeout: 30_000, components: { hidden: ['x'], isolated: [], opacity: [] } } }),
    );
    const unit = { hiddenComponentIds: ['x'], isolatedComponentIds: [], opacityByComponentId: {} };
    const cad = createCad(30_000);
    const model = createModel({ 'file:a.ts': unit });
    const project = createProject([['a.ts', cad]], model);
    const { session } = startSession(project);
    await vi.waitFor(() => {
      expect(session.getSnapshot().appliedEntryRevisions.has('a.ts')).toBe(true);
    });
    /* As xstate delivers it: the project's context already holds the moved units when the rekeyed model notifies
     * its observers, and the project's own observers hear of them after. */
    project.state.context = {
      ...project.state.context,
      geometryUnits: asActor<ReadonlyMap<string, CadRef>>(new Map([['b.ts', cad]])),
    };
    model.change({ unitsById: { 'file:b.ts': unit } });
    project.change({});
    await session.changePaths({ type: 'rename', oldPath: 'a.ts', newPath: 'b.ts' });
    await new Promise((resolve) => {
      setTimeout(resolve, 1200);
    });
    expect(workbenchRecords.entries.read(hostFiles.get()!)).toMatchObject({
      status: 'current',
      record: { entries: { 'b.ts': { components: { hidden: ['x'] } } } },
    });
  });

  // Round 1 defect 2: a keyed remount builds a second runtime while the first runs out its lease grace. The newer
  // session holds the record alone (I13), and the older one's stop leaves the newer one's issue published.
  it("yields to a newer session for the project and never withdraws that session's issue", async () => {
    hostFiles.set(new TextEncoder().encode('{ not json'));
    const first = startSession();
    await vi.waitFor(() => {
      expect(readRecordIssues('p')[0]?.state).toBe('invalid');
    });
    const second = startSession();
    await vi.waitFor(() => {
      expect(entriesStores.map(({ disposed }) => disposed)).toEqual([true, false]);
    });
    expect(first.producers.producers.size).toBe(0);
    await vi.waitFor(() => {
      expect(readRecordIssues('p')[0]?.state).toBe('invalid');
    });
    first.stop();
    expect(readRecordIssues('p')[0]?.state).toBe('invalid');
    second.stop();
    expect(readRecordIssues('p')).toEqual([]);
  });

  describe('one producer (A0.3 row 5, S25)', () => {
    // One producer, registered at the session's start, whose flush settles an entries write in flight, which lands
    // once with the person's value; the stop removes it.
    it('should keep one producer whose flush settles an entries write in flight', async () => {
      hostFiles.set(recordBytes({ 'a.ts': { renderTimeout: 30_000 } }));
      const cad = createCad(30_000);
      const { producers, records, stop } = startSession(createProject([['a.ts', cad]]));
      const authority = Promise.withResolvers<void>();
      try {
        await vi.waitFor(() => {
          expect(records.length).toBeGreaterThan(0);
        });
        expect(producers.producers.size).toBe(1);
        const write = hostFiles.writeFileChecked.getMockImplementation()!;
        hostFiles.writeFileChecked.mockImplementationOnce(async (input) => {
          await authority.promise;
          return write(input);
        });
        cad.change({ operationTimeout: 45_000 });
        await vi.waitFor(
          () => {
            expect(hostFiles.writeFileChecked).toHaveBeenCalledOnce();
          },
          { timeout: 1500 },
        );
        let settled = false;
        const flushing = (async () => {
          await [...producers.producers][0]!();
          settled = true;
        })();
        await Promise.resolve();
        expect(settled).toBe(false);
        authority.resolve();
        await flushing;
        expect(hostFiles.writeFileChecked).toHaveBeenCalledOnce();
        expect(workbenchRecords.entries.read(hostFiles.get()!)).toMatchObject({
          status: 'current',
          record: { entries: { 'a.ts': { renderTimeout: 45_000 } } },
        });
      } finally {
        authority.resolve();
        stop();
      }
      expect(producers.producers.size).toBe(0);
    });

    // A0.3 row 5, S25/I13: one record session per record file. The host's StrictMode double render built a second
    // entries store that was never disposed; the runtime child builds one, and its stop disposes it.
    it('I13: should hold one live entries record session', async () => {
      hostFiles.set(recordBytes({ 'a.ts': { renderTimeout: 30_000 } }));
      const { records, stop } = startSession();
      await vi.waitFor(() => {
        expect(records.length).toBeGreaterThan(0);
      });
      expect(entriesStores.filter((store) => !store.disposed)).toHaveLength(1);
      stop();
      expect(entriesStores.filter((store) => !store.disposed)).toHaveLength(0);
      expect(readRecordIssues('p')).toEqual([]);
    });
  });
});

describe('the entry applier', () => {
  it.each([0, 600_000])('should map durable renderTimeout %i to the runtime operation event', (renderTimeout) => {
    const cad = createCad(180_000);
    const applier = createEntryApplier({
      path: 'a.ts',
      cad: asActor<CadRef>(cad),
      model: asActor<ModelRef>(createModel()),
    });
    applier.apply({ renderTimeout }, undefined);
    expect(cad.send).toHaveBeenCalledOnce();
    expect(cad.send).toHaveBeenCalledWith({ type: 'setOperationTimeout', operationTimeout: renderTimeout });
  });

  it('persists a human hide without reverting it and adopts a foreign isolation independently', () => {
    const cad = createCad(180_000);
    const model = createModel({
      'file:a.ts': { hiddenComponentIds: [], isolatedComponentIds: [], opacityByComponentId: {} },
    });
    const applier = createEntryApplier({
      path: 'a.ts',
      cad: asActor<CadRef>(cad),
      model: asActor<ModelRef>(model),
    });
    const empty: Entry = { renderTimeout: 180_000, components: { hidden: [], isolated: [], opacity: [] } };
    const write = vi.fn((_next: Entry) => undefined);
    const draw = (entry: Entry): void => {
      applier.apply(entry, undefined);
      applier.observe(entry, write);
    };
    draw(empty);
    model.change({
      unitsById: {
        'file:a.ts': { hiddenComponentIds: ['part-a'], isolatedComponentIds: [], opacityByComponentId: {} },
      },
    });
    draw(empty);
    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({ components: expect.objectContaining({ hidden: ['part-a'] }) }),
    );
    expect(model.state.context.unitsById['file:a.ts']?.hiddenComponentIds).toEqual(['part-a']);
    expect(model.send).not.toHaveBeenCalled();
    draw({ ...empty, components: { hidden: [], isolated: ['part-b'], opacity: [] } });
    expect(model.state.context.unitsById['file:a.ts']?.isolatedComponentIds).toEqual(['part-b']);
    expect(model.state.context.unitsById['file:a.ts']?.hiddenComponentIds).toEqual(['part-a']);
  });

  it('keeps newer local entry settings when an older checked write is received with a foreign sibling field', () => {
    const cad = createCad(180_000);
    const model = createModel({
      'file:a.ts': { hiddenComponentIds: [], isolatedComponentIds: [], opacityByComponentId: {} },
    });
    const applier = createEntryApplier({
      path: 'a.ts',
      cad: asActor<CadRef>(cad),
      model: asActor<ModelRef>(model),
    });
    const initial: Entry = { renderTimeout: 180_000, components: { hidden: [], isolated: [], opacity: [] } };
    const write = vi.fn((_next: Entry) => undefined);
    const draw = (entry: Entry, localPatch?: { renderTimeout?: number; components?: { hidden?: string[] } }): void => {
      applier.apply(entry, localPatch);
      applier.observe(entry, write);
    };
    const show = (hidden: string[]): void => {
      model.change({
        unitsById: { 'file:a.ts': { hiddenComponentIds: hidden, isolatedComponentIds: [], opacityByComponentId: {} } },
      });
    };
    draw(initial);
    show(['part-a']);
    cad.change({ operationTimeout: 200_000 });
    draw(initial);
    expect(write).toHaveBeenCalled();
    const olderLocal = write.mock.lastCall![0];
    show(['part-a', 'part-b']);
    cad.change({ operationTimeout: 300_000 });
    draw(initial);
    draw(
      { ...olderLocal, components: { ...olderLocal.components!, isolated: ['part-c'] } },
      { renderTimeout: olderLocal.renderTimeout, components: { hidden: olderLocal.components!.hidden } },
    );
    expect(model.state.context.unitsById['file:a.ts']?.isolatedComponentIds).toEqual(['part-c']);
    expect(model.state.context.unitsById['file:a.ts']?.hiddenComponentIds).toEqual(['part-a', 'part-b']);
    expect(cad.state.context.operationTimeout).toBe(300_000);
  });
});
