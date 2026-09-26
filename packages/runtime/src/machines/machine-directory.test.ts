import { afterEach, describe, expect, it, vi } from 'vitest';
import { Topic } from '@taucad/events';

import {
  createMachineDirectory,
  parseMachineDirectoryCursor,
  parseMachineDirectoryEvent,
  parseMachineDirectoryFrame,
  parseMachineDirectorySnapshot,
} from '#machines/machine-directory.js';
import type {
  MachineDirectory,
  MachineDirectoryCursor,
  MachineDirectoryEvent,
  MachineDirectoryJournal,
} from '#machines/machine-directory.js';
import type { MachineDescriptor, MachineObservation, MachineSession, MachineSnapshot } from '#machines/machine.js';

const descriptor: MachineDescriptor = {
  id: 'provider-claimed-id',
  name: 'Fixture machine',
  vendor: 'fixture',
  model: 'fixture',
  technology: 'fff',
  firmware: '1',
  accepts: [],
  operations: [],
  ratedEnvelope: { width: 1, depth: 1, height: 1, unit: 'm' },
  printableEnvelope: { width: 1, depth: 1, height: 1, unit: 'm' },
  tools: [],
  materialSystem: { kind: 'none', slotCount: 0 },
  bedTypes: [],
};
const observation: MachineSnapshot = {
  connection: 'connected',
  readiness: 'idle',
  observedAt: '2026-09-06T00:00:00Z',
  setup: { materials: [] },
};
const resources: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const close of resources.splice(0).reverse()) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- directories must close before borrowed journal storage.
    await close();
  }
});

const journalFixture = () => {
  const records: MachineDirectoryEvent[] = [];
  let failAppend = false;
  const close = vi.fn(async () => undefined);
  const journal: MachineDirectoryJournal = {
    async append(candidate) {
      if (failAppend) {
        failAppend = false;
        throw new Error('fixture append failure');
      }
      const event = parseMachineDirectoryEvent(candidate);
      const record = Object.freeze({ sequence: records.length, event });
      records.push(event);
      return record;
    },
    async replay({ cursor, limit }) {
      const page = records.slice(cursor, cursor + limit).map((event, offset) => ({ sequence: cursor + offset, event }));
      return {
        records: page,
        nextCursor: cursor + page.length,
        endCursor: records.length,
      };
    },
  };
  return {
    journal,
    close,
    failNextAppend() {
      failAppend = true;
    },
    bytes: () => JSON.stringify(records),
  };
};

const sessionFixture = () => {
  const events: MachineObservation[] = [];
  let wake = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  const consumed = vi.fn();
  const session: Pick<MachineSession, 'getDescriptor' | 'getSnapshot' | 'observe' | 'close'> = {
    getDescriptor: vi.fn(async () => descriptor),
    getSnapshot: vi.fn(async () => observation),
    async *observe({ signal }) {
      started.resolve();
      const onAbort = () => {
        wake.resolve();
      };
      signal.addEventListener('abort', onAbort, { once: true });
      try {
        while (!signal.aborted) {
          const event = events.shift();
          if (event) {
            yield event;
            consumed();
          } else {
            // oxlint-disable-next-line eslint/no-await-in-loop -- fixture producer waits for each next observation.
            await wake.promise;
            wake = Promise.withResolvers<void>();
          }
        }
      } finally {
        signal.removeEventListener('abort', onAbort);
      }
    },
    close: vi.fn(async () => {
      wake.resolve();
    }),
  };
  return {
    session,
    consumed,
    started: started.promise,
    push(snapshot: MachineSnapshot) {
      events.push({ type: 'snapshot', snapshot });
      wake.resolve();
    },
  };
};

const fixture = async () => {
  const disk = journalFixture();
  const commits = new Topic<void>();
  const { journal } = disk;
  const errors = vi.fn();
  const open = async (borrowed: MachineDirectoryJournal = journal) => {
    const directory = await createMachineDirectory({
      hostId: 'host',
      authorityId: 'authority',
      journal: borrowed,
      commits,
      onError: errors,
    });
    resources.push(async () => directory.close());
    return directory;
  };
  resources.push(async () => {
    await disk.close();
    commits.dispose();
  });
  const directory = await open();
  const attach = async (machineId = 'selected-id', workspaceId = 'workspace', target: MachineDirectory = directory) => {
    const device = sessionFixture();
    await target.attach({
      machineId,
      workspaceId,
      providerId: 'provider',
      session: device.session,
    });
    await device.started;
    return device;
  };
  return { disk, journal, commits, directory, errors, open, attach };
};

describe('host-owned machine directory', () => {
  it('strictly admits the public snapshot, cursor and frame projections', async () => {
    const { directory, attach } = await fixture();
    await attach();
    const value = await directory.snapshot({ workspaceId: 'workspace' });
    expect(parseMachineDirectoryCursor(value.cursor)).toEqual(value.cursor);
    expect(parseMachineDirectorySnapshot(value)).toEqual(value);
    expect(parseMachineDirectoryFrame({ type: 'snapshot', snapshot: value })).toEqual({
      type: 'snapshot',
      snapshot: value,
    });
    const enriched = {
      ...value,
      entries: value.entries.map((entry) => ({
        ...entry,
        snapshot: {
          ...entry.snapshot,
          setup: {
            materials: [
              { slot: 0, state: 'empty' },
              { slot: 1, state: 'loaded', materialId: 'PETG', profileId: 'GFG00' },
            ],
          },
          run: {
            state: 'printing',
            currentLayer: 12,
            totalLayers: 120,
            speedProfile: 'standard',
            speedPercent: 100,
          },
          fans: { part: 100, auxiliary: 40, chamber: 0 },
          materialSystem: {
            currentSlot: 0,
            targetSlot: 0,
            units: [{ unit: 0, humidityIndex: 3 }],
          },
          network: { wifiSignalDbm: -47 },
          lights: { chamber: 'on' },
          removableStorage: 'present',
          alerts: [{ code: '0300-8000' }],
        },
      })),
    };
    expect(parseMachineDirectorySnapshot(enriched)).toEqual(enriched);
    expect(() => parseMachineDirectorySnapshot({ ...value, secret: true })).toThrow();
  });

  it('should keep an idle machine current past its 15 s budget while it repeats itself, without journal writes', async () => {
    const { directory, attach, journal } = await fixture();
    const device = await attach();
    const { cursor } = await directory.snapshot({ workspaceId: 'workspace' });
    const abort = new AbortController();
    const watch = directory.watch({ workspaceId: 'workspace', cursor, signal: abort.signal })[Symbol.asyncIterator]();
    const reportedAt = (second: number): string =>
      new Date(Date.parse(observation.observedAt) + second * 1000).toISOString();
    try {
      for (let second = 1; second <= 20; second += 1) {
        device.push({ ...observation, observedAt: reportedAt(second) });
      }
      await vi.waitFor(() => {
        expect(device.consumed).toHaveBeenCalledTimes(20);
      });
      // The UI marks a machine stale once `now - snapshot.observedAt` exceeds its budget (15 s for the X1C), so 20 s
      // of unchanged reports must carry the latest report time, not the time of the last change.
      await expect(directory.snapshot({ workspaceId: 'workspace' })).resolves.toMatchObject({
        cursor: { revision: 21 },
        entries: [{ freshness: 'current', snapshot: { ...observation, observedAt: reportedAt(20) } }],
      });
      const frame = await watch.next();
      expect(frame.value).toMatchObject({
        type: 'event',
        cursor: { revision: 2 },
        event: { type: 'machine-directory-upserted', entry: { snapshot: { observedAt: reportedAt(1) } } },
      });
      await expect(journal.replay({ cursor: 0, limit: 10 })).resolves.toMatchObject({ endCursor: 1 });
    } finally {
      abort.abort();
      await watch.return?.();
    }
  });

  it('should serve readiness, setup and run changes from memory and journal only the machine identity', async () => {
    const { directory, attach, journal } = await fixture();
    const device = await attach();
    device.push({
      ...observation,
      observedAt: '2026-09-06T00:02:00Z',
      readiness: 'busy',
    });
    device.push({
      ...observation,
      observedAt: '2026-09-06T00:03:00Z',
      readiness: 'busy',
      setup: { toolId: 'tool', materials: [] },
    });
    device.push({
      ...observation,
      observedAt: '2026-09-06T00:04:00Z',
      readiness: 'busy',
      setup: { toolId: 'tool', materials: [] },
      activeRunId: 'run',
    });
    await vi.waitFor(() => {
      expect(device.consumed).toHaveBeenCalledTimes(3);
    });
    const snapshot = await directory.snapshot({ workspaceId: 'workspace' });
    expect(snapshot).toMatchObject({
      cursor: { revision: 4 },
      entries: [
        {
          snapshot: {
            observedAt: '2026-09-06T00:04:00Z',
            readiness: 'busy',
            activeRunId: 'run',
            setup: { toolId: 'tool' },
          },
        },
      ],
    });
    const replay = await journal.replay({ cursor: 0, limit: 10 });
    expect(replay.endCursor).toBe(1);
    expect(replay.records[0]?.event).toMatchObject({
      type: 'machine-directory-upserted',
      entry: { machineId: 'selected-id', providerId: 'provider', snapshot: observation },
    });
  });

  it('should retain host-selected identities and publish only committed observations', async () => {
    const { directory, attach, journal } = await fixture();
    await attach('one');
    await attach('two');
    const snapshot = await directory.snapshot({ workspaceId: 'workspace' });
    expect(snapshot.cursor).toMatchObject({
      hostId: 'host',
      authorityId: 'authority',
      position: 2,
      revision: 2,
    });
    expect(snapshot.cursor.generation).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/u);
    expect(snapshot.entries.map((entry) => [entry.machineId, entry.descriptor.id])).toEqual([
      ['one', 'provider-claimed-id'],
      ['two', 'provider-claimed-id'],
    ]);
    expect(Object.isFrozen(snapshot.entries[0]?.descriptor)).toBe(true);
    const replay = await journal.replay({ cursor: 0, limit: 10 });
    expect(replay.records).toHaveLength(2);
  });

  it('should cancel only a client watch while device observations continue and replay on reconnect', async () => {
    const { directory, attach, commits } = await fixture();
    const device = await attach();
    const abort = new AbortController();
    const first = directory.watch({ workspaceId: 'workspace', signal: abort.signal })[Symbol.asyncIterator]();
    const initial = await first.next();
    expect(initial.value).toMatchObject({
      type: 'snapshot',
      snapshot: { cursor: { position: 1, revision: 1 } },
    });
    const { cursor } = await directory.snapshot({ workspaceId: 'workspace' });
    const waiting = first.next();
    abort.abort();
    expect(await waiting).toEqual({ done: true, value: undefined });
    expect(commits.size).toBe(0);
    expect(device.session.close).not.toHaveBeenCalled();
    device.push({ ...observation, readiness: 'busy' });
    await vi.waitFor(async () => {
      const snapshot = await directory.snapshot({ workspaceId: 'workspace' });
      expect(snapshot.cursor.revision).toBe(2);
    });
    const againAbort = new AbortController();
    const again = directory
      .watch({ workspaceId: 'workspace', cursor, signal: againAbort.signal })
      [Symbol.asyncIterator]();
    try {
      const frame = await again.next();
      expect(frame.value).toMatchObject({
        type: 'event',
        cursor: { position: 2, revision: 2 },
        event: { entry: { snapshot: { readiness: 'busy' } } },
      });
    } finally {
      againAbort.abort();
      await again.return?.();
    }
    await directory.close();
    expect(device.session.close).toHaveBeenCalledOnce();
  });

  it('should recover journaled identities as stale without writes until a new session observes them', async () => {
    const { directory, attach, open, disk, journal } = await fixture();
    const original = await attach();
    const before = await directory.snapshot({ workspaceId: 'workspace' });
    original.push({ ...observation, observedAt: '2026-09-06T00:05:00Z', readiness: 'busy' });
    await vi.waitFor(() => {
      expect(original.consumed).toHaveBeenCalledOnce();
    });
    await directory.close();
    expect(disk.close).not.toHaveBeenCalled();
    expect(original.session.close).toHaveBeenCalledOnce();
    const recovered = await open();
    const restarted = await recovered.snapshot({ workspaceId: 'workspace' });
    // Telemetry never reached the journal, so the restart shows the attach-time snapshot, marked stale.
    expect(restarted).toMatchObject({
      cursor: { position: 0, revision: 1 },
      entries: [{ machineId: 'selected-id', freshness: 'stale', snapshot: observation }],
    });
    expect(restarted.cursor.generation).not.toBe(before.cursor.generation);
    await attach('selected-id', 'workspace', recovered);
    expect(await recovered.snapshot({ workspaceId: 'workspace' })).toMatchObject({
      cursor: { position: 1, revision: 2 },
      entries: [{ freshness: 'current' }],
    });
    await expect(journal.replay({ cursor: 0, limit: 10 })).resolves.toMatchObject({ endCursor: 1 });
  });

  it.each(['getDescriptor', 'getSnapshot'] as const)(
    'should mark the machine stale in memory when replacement %s fails',
    async (method) => {
      const { directory, attach, journal } = await fixture();
      const old = await attach();
      const replacement = sessionFixture();
      vi.mocked(replacement.session[method]).mockRejectedValue(new Error('replacement failed'));
      await expect(
        directory.attach({
          workspaceId: 'workspace',
          machineId: 'selected-id',
          providerId: 'new',
          session: replacement.session,
        }),
      ).rejects.toThrow('replacement failed');
      expect(old.session.close).toHaveBeenCalledOnce();
      expect(replacement.session.close).toHaveBeenCalledOnce();
      expect(await directory.snapshot({ workspaceId: 'workspace' })).toMatchObject({
        cursor: { revision: 2 },
        entries: [
          {
            providerId: 'provider',
            freshness: 'stale',
            snapshot: { observedAt: observation.observedAt },
          },
        ],
      });
      await expect(journal.replay({ cursor: 0, limit: 10 })).resolves.toMatchObject({ endCursor: 1 });
    },
  );

  it('should detach a paused yielded subscription immediately on caller abort or host close', async () => {
    const { directory, attach, commits } = await fixture();
    const device = await attach();
    const abort = new AbortController();
    const first = directory.watch({ workspaceId: 'workspace', signal: abort.signal })[Symbol.asyncIterator]();
    await first.next();
    expect(commits.size).toBe(1);
    abort.abort();
    expect(commits.size).toBe(0);
    expect(device.session.close).not.toHaveBeenCalled();
    const second = directory
      .watch({ workspaceId: 'workspace', signal: new AbortController().signal })
      [Symbol.asyncIterator]();
    await second.next();
    expect(commits.size).toBe(1);
    await directory.close();
    expect(commits.size).toBe(0);
    expect(device.session.close).toHaveBeenCalledOnce();
    await first.return?.();
    await second.return?.();
  });

  it('should give an explicit bounded-lag snapshot without claiming cursor expiry', async () => {
    const { directory, attach } = await fixture();
    const before = await directory.snapshot({ workspaceId: 'workspace' });
    const device = await attach('other', 'other-workspace');
    for (let second = 1; second <= 257; second += 1) {
      device.push({
        ...observation,
        observedAt: new Date(Date.parse(observation.observedAt) + second * 1000).toISOString(),
      });
    }
    await vi.waitFor(() => {
      expect(device.consumed).toHaveBeenCalledTimes(257);
    });
    const abort = new AbortController();
    const watch = directory
      .watch({
        workspaceId: 'workspace',
        cursor: before.cursor,
        signal: abort.signal,
      })
      [Symbol.asyncIterator]();
    try {
      const frame = await watch.next();
      expect(frame.value).toMatchObject({
        type: 'resync-required',
        reason: 'lag',
        snapshot: { cursor: { position: 258, revision: 0 }, entries: [] },
      });
    } finally {
      abort.abort();
      await watch.return?.();
    }
  });

  it('should surface a refused append on its own write and keep serving reads, watches and observations', async () => {
    const { directory, disk, attach, journal, errors } = await fixture();
    const device = await attach('one');
    const before = disk.bytes();
    disk.failNextAppend();
    const refused = sessionFixture();
    await expect(
      directory.attach({
        workspaceId: 'workspace',
        machineId: 'two',
        providerId: 'provider',
        session: refused.session,
      }),
    ).rejects.toThrow('fixture append failure');
    expect(refused.session.close).toHaveBeenCalledOnce();
    expect(disk.bytes()).toEqual(before);
    device.push({ ...observation, observedAt: '2026-09-06T00:01:00Z', readiness: 'busy' });
    await vi.waitFor(() => {
      expect(device.consumed).toHaveBeenCalledOnce();
    });
    await expect(directory.snapshot({ workspaceId: 'workspace' })).resolves.toMatchObject({
      cursor: { revision: 2 },
      entries: [
        { machineId: 'one', freshness: 'current', snapshot: { readiness: 'busy', observedAt: '2026-09-06T00:01:00Z' } },
      ],
    });
    disk.failNextAppend();
    await expect(directory.remove({ workspaceId: 'workspace', machineId: 'one' })).rejects.toThrow(
      'fixture append failure',
    );
    expect(device.session.close).toHaveBeenCalledOnce();
    await expect(directory.snapshot({ workspaceId: 'workspace' })).resolves.toMatchObject({
      cursor: { revision: 3 },
      entries: [{ machineId: 'one', freshness: 'stale', snapshot: { readiness: 'busy' } }],
    });
    const abort = new AbortController();
    const watch = directory.watch({ workspaceId: 'workspace', signal: abort.signal })[Symbol.asyncIterator]();
    try {
      await expect(watch.next()).resolves.toMatchObject({
        value: { type: 'snapshot', snapshot: { entries: [{ machineId: 'one', freshness: 'stale' }] } },
      });
    } finally {
      abort.abort();
      await watch.return?.();
    }
    await expect(journal.replay({ cursor: 0, limit: 10 })).resolves.toMatchObject({ endCursor: 1 });
    expect(errors).not.toHaveBeenCalled();
  });

  it('should fence an old observer when the host replaces its session', async () => {
    const { directory, attach } = await fixture();
    const late = Promise.withResolvers<MachineObservation>();
    const started = Promise.withResolvers<void>();
    const old = sessionFixture();
    const oldSession = {
      ...old.session,
      async *observe() {
        started.resolve();
        yield await late.promise;
      },
    };
    await directory.attach({
      workspaceId: 'workspace',
      machineId: 'selected-id',
      providerId: 'old',
      session: oldSession,
    });
    await started.promise;
    const replacement = attach();
    await vi.waitFor(() => {
      expect(old.session.close).toHaveBeenCalledOnce();
    });
    late.resolve({
      type: 'snapshot',
      snapshot: { ...observation, readiness: 'busy' },
    });
    await replacement;
    expect(await directory.snapshot({ workspaceId: 'workspace' })).toMatchObject({
      cursor: { revision: 3 },
      entries: [{ providerId: 'provider', snapshot: { readiness: 'idle' } }],
    });
  });

  it('should advance filtered read-through without fabricating workspace revisions or spinning', async () => {
    const { directory, attach, journal } = await fixture();
    await attach();
    const { cursor: a } = await directory.snapshot({
      workspaceId: 'workspace',
    });
    await attach('other', 'other-workspace');
    const snapshot = await directory.snapshot({ workspaceId: 'workspace' });
    expect(snapshot.cursor).toMatchObject({ position: 2, revision: 1 });
    const abort = new AbortController();
    const watch = directory
      .watch({ workspaceId: 'workspace', cursor: a, signal: abort.signal })
      [Symbol.asyncIterator]();
    const next = watch.next();
    await attach('third');
    try {
      const frame = await next;
      expect(frame.value).toMatchObject({
        type: 'event',
        cursor: { position: 3, revision: 2 },
        event: { entry: { machineId: 'third' } },
      });
    } finally {
      abort.abort();
      await watch.return?.();
    }
    const replay = await journal.replay({ cursor: 0, limit: 10 });
    expect(replay.endCursor).toBe(3);
  });

  it.each(['generation', 'workspaceId', 'authorityId', 'hostId', 'position', 'revision'] as const)(
    'should resync a mismatched %s cursor',
    async (field) => {
      const { directory, attach } = await fixture();
      await attach();
      const current = await directory.snapshot({ workspaceId: 'workspace' });
      const cursor: MachineDirectoryCursor = {
        ...current.cursor,
        [field]: field === 'position' || field === 'revision' ? 999 : 'foreign',
      };
      const abort = new AbortController();
      const watch = directory.watch({ workspaceId: 'workspace', cursor, signal: abort.signal })[Symbol.asyncIterator]();
      try {
        const frame = await watch.next();
        expect(frame.value).toEqual({
          type: 'resync-required',
          reason: 'revision-mismatch',
          snapshot: current,
        });
      } finally {
        abort.abort();
        await watch.return?.();
      }
    },
  );

  it('should not miss an append between snapshot delivery and requesting the tail', async () => {
    const { directory, attach } = await fixture();
    await attach();
    const abort = new AbortController();
    const watch = directory.watch({ workspaceId: 'workspace', signal: abort.signal })[Symbol.asyncIterator]();
    const initial = await watch.next();
    expect(initial.value).toMatchObject({ type: 'snapshot' });
    await attach('second');
    try {
      const frame = await watch.next();
      expect(frame.value).toMatchObject({
        type: 'event',
        cursor: { position: 2, revision: 2 },
      });
    } finally {
      abort.abort();
      await watch.return?.();
    }
  });

  it('should reject malformed provider data before committing it', async () => {
    const { directory, journal } = await fixture();
    const device = sessionFixture();
    vi.mocked(device.session.getDescriptor).mockResolvedValue({
      ...descriptor,
      firmware: '',
    });
    await expect(
      directory.attach({
        workspaceId: 'workspace',
        machineId: 'selected-id',
        providerId: 'provider',
        session: device.session,
      }),
    ).rejects.toThrow();
    const replay = await journal.replay({ cursor: 0, limit: 1 });
    expect(replay.endCursor).toBe(0);
    expect(device.session.close).toHaveBeenCalledOnce();
  });

  it('should journal host removal and close the provider without closing borrowed storage', async () => {
    const { directory, attach, disk, journal } = await fixture();
    const device = await attach();
    await directory.remove({
      workspaceId: 'workspace',
      machineId: 'selected-id',
    });
    expect(await directory.snapshot({ workspaceId: 'workspace' })).toMatchObject({
      cursor: { revision: 2 },
      entries: [],
    });
    expect(device.session.close).toHaveBeenCalledOnce();
    expect(disk.close).not.toHaveBeenCalled();
    await expect(directory.remove({ workspaceId: 'workspace', machineId: 'selected-id' })).rejects.toThrow(
      'MACHINE_DIRECTORY_UNKNOWN_MACHINE',
    );
    const replay = await journal.replay({ cursor: 0, limit: 10 });
    expect(replay.endCursor).toBe(2);
  });

  it('should join an initializing session on host close and refuse its late snapshot', async () => {
    const { directory, journal } = await fixture();
    const device = sessionFixture();
    const snapshot = Promise.withResolvers<MachineSnapshot>();
    const started = Promise.withResolvers<void>();
    vi.mocked(device.session.getSnapshot).mockImplementation(async () => {
      started.resolve();
      return snapshot.promise;
    });
    const attachment = directory.attach({
      workspaceId: 'workspace',
      machineId: 'selected-id',
      providerId: 'provider',
      session: device.session,
    });
    await started.promise;
    const closed = vi.fn();
    const closeDirectory = async (): Promise<void> => {
      await directory.close();
      closed();
    };
    const closing = closeDirectory();
    try {
      await vi.waitFor(() => {
        expect(device.session.close).toHaveBeenCalledOnce();
      });
      expect(closed).not.toHaveBeenCalled();
    } finally {
      snapshot.resolve(observation);
    }
    await attachment;
    await closing;
    const replay = await journal.replay({ cursor: 0, limit: 10 });
    expect(replay.endCursor).toBe(0);
    expect(closed).toHaveBeenCalledOnce();
  });

  it.each(['disconnected', 'unreachable'] as const)(
    'should tell the attacher once when its current session reports %s, keeping what it reported',
    async (connection) => {
      const { directory } = await fixture();
      const device = sessionFixture();
      const onLost = vi.fn();
      await directory.attach({
        workspaceId: 'workspace',
        machineId: 'selected-id',
        providerId: 'provider',
        session: device.session,
        onLost,
      });
      await device.started;
      device.push({ ...observation, connection });
      device.push({ ...observation, connection, observedAt: '2026-09-06T00:01:00Z' });
      await vi.waitFor(() => {
        expect(device.consumed).toHaveBeenCalledTimes(2);
      });
      expect(onLost).toHaveBeenCalledOnce();
      await expect(directory.snapshot({ workspaceId: 'workspace' })).resolves.toMatchObject({
        entries: [{ freshness: 'current', snapshot: { connection } }],
      });
      expect(device.session.close).not.toHaveBeenCalled();
    },
  );

  it('should tell the attacher at once when its session attaches already disconnected', async () => {
    const { directory } = await fixture();
    const device = sessionFixture();
    vi.mocked(device.session.getSnapshot).mockResolvedValue({ ...observation, connection: 'disconnected' });
    const onLost = vi.fn();
    await directory.attach({
      workspaceId: 'workspace',
      machineId: 'selected-id',
      providerId: 'provider',
      session: device.session,
      onLost,
    });
    expect(onLost).toHaveBeenCalledOnce();
  });

  it.each([
    [
      'ends',
      async function* (): AsyncGenerator<MachineObservation> {
        yield* [];
      },
      [],
    ],
    [
      'fails',
      async function* (): AsyncGenerator<MachineObservation> {
        yield* [];
        throw new Error('observation failed');
      },
      ['observation failed'],
    ],
  ])(
    'should mark the machine stale, close the session and tell the attacher once when its observation %s',
    async (_outcome, observe, reported) => {
      const { directory, errors } = await fixture();
      const device = sessionFixture();
      const onLost = vi.fn();
      await directory.attach({
        workspaceId: 'workspace',
        machineId: 'selected-id',
        providerId: 'provider',
        session: { ...device.session, observe },
        onLost,
      });
      await vi.waitFor(() => {
        expect(device.session.close).toHaveBeenCalledOnce();
      });
      expect(onLost).toHaveBeenCalledOnce();
      await expect(directory.snapshot({ workspaceId: 'workspace' })).resolves.toMatchObject({
        entries: [{ freshness: 'stale' }],
      });
      expect(errors.mock.calls.map(([error]: unknown[]) => (error as Error).message)).toEqual(reported);
    },
  );

  it('should never tell the attacher about a session the host replaced, removed or closed', async () => {
    const { directory } = await fixture();
    const attachWatched = async (machineId: string) => {
      const device = sessionFixture();
      const onLost = vi.fn();
      await directory.attach({
        workspaceId: 'workspace',
        machineId,
        providerId: 'provider',
        session: device.session,
        onLost,
      });
      await device.started;
      return { device, onLost };
    };
    const replaced = await attachWatched('selected-id');
    const removed = await attachWatched('selected-id');
    const closed = await attachWatched('other-id');
    await directory.remove({ workspaceId: 'workspace', machineId: 'selected-id' });
    await directory.close();
    for (const { device, onLost } of [replaced, removed, closed]) {
      expect(device.session.close).toHaveBeenCalledOnce();
      expect(onLost).not.toHaveBeenCalled();
    }
  });

  it('should validate committed record shape and bounds without invoking accessors', () => {
    const value = {
      type: 'machine-directory-stale',
      hostId: 'host',
      authorityId: 'authority',
      workspaceId: 'workspace',
      revision: 1,
    };
    expect(parseMachineDirectoryEvent(value)).toEqual(value);
    expect(() => parseMachineDirectoryEvent({ ...value, secretRef: 'secret' })).toThrow();
    expect(() => parseMachineDirectoryEvent({ ...value, workspaceId: 'x'.repeat(257) })).toThrow();
    const getter = vi.fn(() => 'secret');
    expect(() => parseMachineDirectoryEvent(Object.defineProperty({ ...value }, 'secret', { get: getter }))).toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
});
