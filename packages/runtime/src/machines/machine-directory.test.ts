import { afterEach, describe, expect, it, vi } from 'vitest';
import { Topic } from '@taucad/events';
import type { CacheValue } from '@taucad/cache-core';

import { createJobJournal } from '#jobs/job-journal.js';
import type { JobJournal, JobJournalStorage } from '#jobs/job-journal.js';
import { createMachineDirectory, parseMachineDirectoryEvent } from '#machines/machine-directory.js';
import type { MachineDirectory, MachineDirectoryCursor } from '#machines/machine-directory.js';
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

const storageFixture = () => {
  let bytes = new Uint8Array(0);
  let failFlush = false;
  const storage: JobJournalStorage = {
    async read({ offset, maximumBytes }) {
      return { bytes: bytes.slice(offset, offset + maximumBytes), endOfFile: offset + maximumBytes >= bytes.length };
    },
    async append(value) {
      const joined = new Uint8Array(bytes.length + value.length);
      joined.set(bytes);
      joined.set(value, bytes.length);
      bytes = joined;
    },
    async flush() {
      if (failFlush) {
        failFlush = false;
        throw new Error('fixture flush failure');
      }
    },
    async truncate(size) {
      bytes = bytes.slice(0, size);
    },
    close: vi.fn(async () => undefined),
  };
  return {
    storage,
    failNextFlush() {
      failFlush = true;
    },
    bytes: () => [...bytes],
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
  const disk = storageFixture();
  const commits = new Topic<void>();
  const journal = await createJobJournal<CacheValue>({
    storage: disk.storage,
    owner: {
      assertCurrent() {
        /* The fixture retains its single in-memory storage owner. */
      },
    },
    parseEvent(value) {
      return parseMachineDirectoryEvent(value);
    },
  });
  const errors = vi.fn();
  const open = async (borrowed: Pick<JobJournal<CacheValue>, 'append' | 'replay'> = journal) => {
    const directory = await createMachineDirectory({
      hostId: 'host',
      authorityId: 'authority',
      generation: 'log-1',
      journal: borrowed,
      commits,
      onError: errors,
    });
    resources.push(async () => directory.close());
    return directory;
  };
  resources.push(async () => {
    await journal.close();
    commits.dispose();
  });
  const directory = await open();
  const attach = async (machineId = 'selected-id', workspaceId = 'workspace', target: MachineDirectory = directory) => {
    const device = sessionFixture();
    await target.attach({ machineId, workspaceId, providerId: 'provider', session: device.session });
    await device.started;
    return device;
  };
  return { disk, journal, commits, directory, errors, open, attach };
};

describe('host-owned machine directory', () => {
  it('should suppress timestamp-only heartbeats but commit readiness, setup and run changes', async () => {
    const { directory, attach, journal } = await fixture();
    const device = await attach();
    device.push({ ...observation, observedAt: '2026-09-06T00:01:00Z' });
    await vi.waitFor(() => {
      expect(device.consumed).toHaveBeenCalledTimes(1);
    });
    expect(await directory.snapshot({ workspaceId: 'workspace' })).toMatchObject({
      cursor: { revision: 1 },
      entries: [{ snapshot: { observedAt: observation.observedAt } }],
    });
    device.push({ ...observation, observedAt: '2026-09-06T00:02:00Z', readiness: 'busy' });
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
      expect(device.consumed).toHaveBeenCalledTimes(4);
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
    expect(replay.endCursor).toBe(4);
  });
  it('should retain host-selected identities and publish only committed observations', async () => {
    const { directory, attach, journal } = await fixture();
    await attach('one');
    await attach('two');
    const snapshot = await directory.snapshot({ workspaceId: 'workspace' });
    expect(snapshot.cursor).toMatchObject({
      hostId: 'host',
      authorityId: 'authority',
      generation: 'log-1',
      position: 2,
      revision: 2,
    });
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
    expect(initial.value).toMatchObject({ type: 'snapshot', snapshot: { cursor: { position: 1, revision: 1 } } });
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

  it('should replay identity but persist stale status after host restart until a new session observes it', async () => {
    const { directory, attach, open, disk } = await fixture();
    const original = await attach();
    await directory.close();
    expect(disk.storage.close).not.toHaveBeenCalled();
    expect(original.session.close).toHaveBeenCalledOnce();
    const recovered = await open();
    expect(await recovered.snapshot({ workspaceId: 'workspace' })).toMatchObject({
      cursor: { position: 2, revision: 2 },
      entries: [{ machineId: 'selected-id', freshness: 'stale', snapshot: { observedAt: observation.observedAt } }],
    });
    await attach('selected-id', 'workspace', recovered);
    expect(await recovered.snapshot({ workspaceId: 'workspace' })).toMatchObject({
      cursor: { revision: 3 },
      entries: [{ freshness: 'current' }],
    });
  });

  it.each(['getDescriptor', 'getSnapshot'] as const)(
    'should persist stale history when replacement %s fails',
    async (method) => {
      const { directory, attach } = await fixture();
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
        entries: [{ providerId: 'provider', freshness: 'stale', snapshot: { observedAt: observation.observedAt } }],
      });
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
    const { directory, journal, commits } = await fixture();
    const before = await directory.snapshot({ workspaceId: 'workspace' });
    for (let revision = 1; revision <= 1025; revision += 1) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- the fixture creates a committed ordered backlog.
      await journal.append({
        type: 'machine-directory-stale',
        hostId: 'host',
        authorityId: 'authority',
        workspaceId: 'other-workspace',
        revision,
      });
    }
    commits.emit();
    const abort = new AbortController();
    const watch = directory
      .watch({ workspaceId: 'workspace', cursor: before.cursor, signal: abort.signal })
      [Symbol.asyncIterator]();
    try {
      const frame = await watch.next();
      expect(frame.value).toMatchObject({
        type: 'resync-required',
        reason: 'lag',
        snapshot: { cursor: { position: 1025, revision: 0 }, entries: [] },
      });
    } finally {
      abort.abort();
      await watch.return?.();
    }
  });

  it('should refuse publication when durable append fails', async () => {
    const { directory, disk, attach, journal, commits } = await fixture();
    const device = await attach();
    const before = disk.bytes();
    const notified = vi.fn();
    const off = commits.subscribe(notified);
    disk.failNextFlush();
    device.push({ ...observation, readiness: 'busy' });
    await vi.waitFor(() => {
      expect(device.session.close).toHaveBeenCalledOnce();
    });
    expect(disk.bytes()).toEqual(before);
    const replay = await journal.replay({ cursor: 0, limit: 10 });
    expect(replay.records).toHaveLength(1);
    await expect(directory.snapshot({ workspaceId: 'workspace' })).rejects.toThrow('MACHINE_DIRECTORY_UNAVAILABLE');
    off();
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
    late.resolve({ type: 'snapshot', snapshot: { ...observation, readiness: 'busy' } });
    await replacement;
    expect(await directory.snapshot({ workspaceId: 'workspace' })).toMatchObject({
      cursor: { revision: 3 },
      entries: [{ providerId: 'provider', snapshot: { readiness: 'idle' } }],
    });
  });

  it('should advance filtered read-through without fabricating workspace revisions or spinning', async () => {
    const { directory, attach, journal } = await fixture();
    await attach();
    const { cursor: a } = await directory.snapshot({ workspaceId: 'workspace' });
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
      expect(frame.value).toMatchObject({ type: 'event', cursor: { position: 2, revision: 2 } });
    } finally {
      abort.abort();
      await watch.return?.();
    }
  });

  it('should reject malformed provider data before committing it', async () => {
    const { directory, journal } = await fixture();
    const device = sessionFixture();
    vi.mocked(device.session.getDescriptor).mockResolvedValue({ ...descriptor, firmware: '' });
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
    await directory.remove({ workspaceId: 'workspace', machineId: 'selected-id' });
    expect(await directory.snapshot({ workspaceId: 'workspace' })).toMatchObject({
      cursor: { revision: 2 },
      entries: [],
    });
    expect(device.session.close).toHaveBeenCalledOnce();
    expect(disk.storage.close).not.toHaveBeenCalled();
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
