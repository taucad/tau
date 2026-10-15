import { afterEach, describe, expect, it, vi } from 'vitest';
import { Topic } from '@taucad/events';
import { ZodError } from 'zod';

import {
  createMachineDirectory,
  parseMachineDirectoryCursor,
  parseMachineDirectoryFrame,
  parseMachineDirectorySnapshot,
} from '#machines/machine-directory.js';
import type { MachineDirectory, MachineDirectoryCursor, MachineDirectoryEntry } from '#machines/machine-directory.js';
import type { MachineProviderDescriptor, MachineSession } from '#machines/machine.js';
import type { ComponentObservation, MachineObservation, MachineReport } from '#machines/machine-observation.js';
import type { ContentDigest } from '@taucad/cache-core';
import type { MachineOperation } from '#machines/machine-jobs.js';
import {
  fixtureDescriptor,
  fixtureObservation,
  fixtureObservedAt,
  fixtureReport,
} from '#machines/machine-session.fixture.js';

const descriptor: MachineProviderDescriptor = { ...fixtureDescriptor('provider-claimed-id'), firmware: '1' };
const observation: MachineReport = fixtureReport({ observedAt: '2026-09-06T00:00:00Z' });
const busy = { state: { status: 'active' } } as const;
const at = (step: number): string => new Date(Date.parse(fixtureObservedAt) + step * 10).toISOString();
/** The fixture's motion at `x`, received at `receivedAt`. */
const position = (x: number, receivedAt: string): ComponentObservation => ({
  ...fixtureObservation('motion', 'position', {
    kind: 'motion',
    homed: { x: true, y: true, z: true },
    trust: 'homed',
    position: { machine: { x, y: 0, z: 0 }, work: { x, y: 0, z: 0 } },
    workOffset: { id: 'G54', revision: '1', origin: { x: 0, y: 0, z: 0 } },
    mode: 'normal',
    feed: 0,
    limits: [],
  }),
  receivedAt,
});
const resources: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const close of resources.splice(0).reverse()) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- directories close before the topic they borrow.
    await close();
  }
});

/** The machine store as a directory sees it: what `persist` remembered, with an injectable refusal. */
const storeFixture = () => {
  const persisted: MachineDirectoryEntry[] = [];
  let failPersist = false;
  const persist = vi.fn(async (entry: MachineDirectoryEntry) => {
    if (failPersist) {
      failPersist = false;
      throw new Error('fixture persist failure');
    }
    persisted.push(entry);
  });
  return {
    persisted,
    persist,
    failNextPersist() {
      failPersist = true;
    },
  };
};

const sessionFixture = (reported: MachineProviderDescriptor = descriptor) => {
  const events: MachineObservation[] = [];
  let wake = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  const consumed = vi.fn();
  const session: Pick<MachineSession, 'getDescriptor' | 'getSnapshot' | 'observe' | 'close'> = {
    getDescriptor: vi.fn(async () => reported),
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
    push(snapshot: MachineReport) {
      events.push({ type: 'snapshot', snapshot });
      wake.resolve();
    },
    change(event: Extract<MachineObservation, { type: 'changed' }>) {
      events.push(event);
      wake.resolve();
    },
  };
};

const fixture = () => {
  const store = storeFixture();
  const commits = new Topic<void>();
  const errors = vi.fn();
  const open = (recovered: readonly MachineDirectoryEntry[] = []) => {
    const directory = createMachineDirectory({
      hostId: 'host',
      authorityId: 'authority',
      recovered,
      persist: store.persist,
      commits,
      onError: errors,
    });
    resources.push(async () => directory.close());
    return directory;
  };
  resources.push(async () => {
    commits.dispose();
  });
  const directory = open();
  const attach = async (
    machineId = 'selected-id',
    target: MachineDirectory = directory,
    reported: MachineProviderDescriptor = descriptor,
  ) => {
    const device = sessionFixture(reported);
    await target.attach({
      machineId,
      name: `Printer ${machineId}`,
      providerId: 'provider',
      session: device.session,
    });
    await device.started;
    return device;
  };
  return { store, commits, directory, errors, open, attach };
};

describe('host-owned machine directory', () => {
  it('strictly admits the public snapshot, cursor and frame projections', async () => {
    const { directory, attach } = fixture();
    await attach();
    const value = await directory.snapshot();
    expect(value.entries).toMatchObject([{ machineId: 'selected-id', name: 'Printer selected-id' }]);
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
          run: {
            runId: 'run-1',
            origin: 'tau',
            delivery: 'stored',
            state: 'running',
            progress: {
              basis: 'executed',
              fraction: 0.1,
              counters: [{ id: 'layer', label: 'Layer', current: 12, total: 120 }],
            },
          },
          alerts: [{ code: '0300-8000', blocks: 'run' }],
          operations: [
            {
              operationId: 'operation-1',
              machineId: entry.machineId,
              kind: 'action',
              inputDigest: `sha256:${'0'.repeat(64)}`,
              state: 'confirming',
              updatedAt: '2026-09-06T00:00:00Z',
            },
          ],
        },
      })),
    };
    expect(parseMachineDirectorySnapshot(enriched)).toEqual(enriched);
    expect(() => parseMachineDirectorySnapshot({ ...value, secret: true })).toThrow();
    // Machines have no workspace scope: a cursor that names one is refused.
    expect(() => parseMachineDirectoryCursor({ ...value.cursor, workspaceId: 'workspace' })).toThrow();
  });

  it('should admit readable alerts and refuse unbounded or unsafe alert text', async () => {
    const { directory, attach } = fixture();
    await attach();
    const value = await directory.snapshot();
    const withAlerts = (alerts: readonly unknown[]) => ({
      ...value,
      entries: value.entries.map((entry) => ({ ...entry, snapshot: { ...entry.snapshot, alerts } })),
    });
    const readable = withAlerts([
      {
        code: '0C00-0300-0003-000B',
        severity: 'serious',
        message: 'The first layer is not sticking to the plate.',
        reference: 'https://support.example.com/codes/0C00-0300-0003-000B',
        blocks: 'run',
      },
      { code: '0300-400C', blocks: 'nothing' },
    ]);
    expect(parseMachineDirectorySnapshot(readable)).toEqual(readable);
    for (const alert of [
      { code: '0300-400C', severity: 'critical', blocks: 'nothing' },
      { code: '0300-400C', message: '', blocks: 'nothing' },
      { code: '0300-400C' },
      { code: '0300-400C', blocks: 'nothing', message: 'x'.repeat(513) },
      { code: '0300-400C', blocks: 'nothing', reference: 'http://support.example.com/codes/0300-400C' },
      // oxlint-disable-next-line eslint/no-script-url -- the row exists to prove a script URL is refused
      { code: '0300-400C', blocks: 'nothing', reference: 'javascript:alert(1)' },
      { code: '0300-400C', blocks: 'nothing', reference: 'https://192.0.2.10/codes/0300-400C' },
      { code: '0300-400C', blocks: 'nothing', reference: `https://support.example.com/${'x'.repeat(2048)}` },
      { code: '0300-400C', blocks: 'nothing', detail: 'raw provider payload' },
    ]) {
      expect(() => parseMachineDirectorySnapshot(withAlerts([alert])), JSON.stringify(alert)).toThrow(ZodError);
    }
  });

  it('should keep an idle machine current past its 15 s budget while it repeats itself, without events', async () => {
    const { directory, attach, store } = fixture();
    const device = await attach();
    const { cursor } = await directory.snapshot();
    const abort = new AbortController();
    const watch = directory.watch({ cursor, signal: abort.signal })[Symbol.asyncIterator]();
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
      await expect(directory.snapshot()).resolves.toMatchObject({
        cursor: { revision: 1 },
        entries: [{ freshness: 'current', snapshot: { ...observation, observedAt: reportedAt(20) } }],
      });
      // Only the report time moved: one coalesced frame carries the latest one, and nothing enters the resume tail.
      const frame = await watch.next();
      expect(frame.value).toEqual({
        type: 'observed',
        machineId: 'selected-id',
        observedAt: reportedAt(20),
        components: [],
      });
      expect(store.persisted).toHaveLength(1);
    } finally {
      abort.abort();
      await watch.return?.();
    }
  });

  it('should serve state and component changes from memory, merge changed groups and persist only the identity', async () => {
    const { directory, attach, store } = fixture();
    const device = await attach();
    device.push({ ...observation, observedAt: '2026-09-06T00:02:00Z', ...busy });
    device.change({
      type: 'changed',
      observedAt: '2026-09-06T00:03:00Z',
      components: [
        {
          ...fixtureObservation('chamber-light', 'accessories', { kind: 'switch', on: true }),
          receivedAt: at(1),
        },
      ],
    });
    await vi.waitFor(() => {
      expect(device.consumed).toHaveBeenCalledTimes(2);
    });
    const snapshot = await directory.snapshot();
    expect(snapshot).toMatchObject({
      cursor: { revision: 3 },
      entries: [{ snapshot: { observedAt: '2026-09-06T00:03:00Z', state: { status: 'active' } } }],
    });
    const components = snapshot.entries[0]?.snapshot.components ?? [];
    // The changed group replaced the light's; the motion group it did not name stayed.
    expect(components.map(({ componentId }) => componentId)).toEqual(['chamber-light', 'motion']);
    expect(components[0]).toMatchObject({ knowledge: 'known', value: { on: true } });
    expect(store.persisted).toHaveLength(1);
  });

  it('should coalesce latest groups into observed frames that never enter the resume tail', async () => {
    const { directory } = fixture();
    const device = sessionFixture();
    await directory.attach({
      machineId: 'one',
      name: 'One',
      providerId: 'provider',
      observations: [{ group: 'position', label: 'Position', staleAfter: 1000, delivery: 'latest' }],
      session: device.session,
    });
    await device.started;
    const { cursor } = await directory.snapshot();
    for (let step = 1; step <= 100; step += 1) {
      device.change({ type: 'changed', observedAt: at(step), components: [position(step, at(step))] });
    }
    await vi.waitFor(() => {
      expect(device.consumed).toHaveBeenCalledTimes(100);
    });
    // 100 deltas served no event, so the resume tail is untouched and a resuming watcher is not behind.
    const after = await directory.snapshot();
    expect(after.cursor).toEqual(cursor);
    const abort = new AbortController();
    const watch = directory.watch({ cursor, signal: abort.signal })[Symbol.asyncIterator]();
    try {
      const frame = await watch.next();
      expect(frame.value).toMatchObject({
        type: 'observed',
        machineId: 'one',
        observedAt: at(100),
        components: [{ componentId: 'motion', group: 'position', value: { position: { machine: { x: 100 } } } }],
      });
      expect(parseMachineDirectoryFrame(frame.value)).toEqual(frame.value);
      device.push({ ...observation, ...busy, observedAt: at(101) });
      await expect(watch.next()).resolves.toMatchObject({
        value: { type: 'event', event: { type: 'machine-directory-upserted', entry: { snapshot: busy } } },
      });
    } finally {
      abort.abort();
      await watch.return?.();
    }
  });

  it('should drop a delta older than the report it follows', async () => {
    const { directory, attach } = fixture();
    const device = await attach();
    const before = await directory.snapshot();
    device.change({
      type: 'changed',
      observedAt: '2026-09-05T00:00:00Z',
      components: [position(9, '2026-09-13T00:00:00.000Z')],
    });
    await vi.waitFor(() => {
      expect(device.consumed).toHaveBeenCalledOnce();
    });
    await expect(directory.snapshot()).resolves.toEqual(before);
  });

  it('should degrade one unreadable component to unknown, report it once and keep observing', async () => {
    const { directory, attach, errors } = fixture();
    const device = await attach();
    // A newer provider's value kind this host does not know.
    const unreadable = {
      ...fixtureObservation('chamber-light', 'accessories', { kind: 'switch', on: true }),
      value: { kind: 'hologram', intensity: 1 },
    } as unknown as ComponentObservation;
    const components = [unreadable, ...observation.components.slice(1)];
    device.push({ ...observation, components });
    device.push({ ...observation, ...busy, components });
    await vi.waitFor(() => {
      expect(device.consumed).toHaveBeenCalledTimes(2);
    });
    const { entries } = await directory.snapshot();
    expect(entries[0]?.snapshot).toMatchObject({
      state: { status: 'active' },
      components: [
        { componentId: 'chamber-light', group: 'accessories', knowledge: 'unknown', reason: 'Unreadable report' },
        { componentId: 'motion', group: 'position', knowledge: 'known' },
      ],
    });
    expect(errors).toHaveBeenCalledOnce();
  });

  it("should derive each observation's validity from its group budget", async () => {
    const { directory } = fixture();
    const device = sessionFixture();
    await directory.attach({
      machineId: 'one',
      name: 'One',
      providerId: 'provider',
      observations: [{ group: 'position', label: 'Position', staleAfter: 1000, delivery: 'latest' }],
      session: device.session,
    });
    const { entries } = await directory.snapshot();
    const [entry] = entries;
    const motion = entry?.snapshot.components.find(({ group }) => group === 'position');
    const light = entry?.snapshot.components.find(({ group }) => group === 'accessories');
    expect(motion?.validUntil).toBe('2026-09-14T00:00:01.000Z');
    expect(light?.validUntil).toBeUndefined();
  });

  it('should derive a stable capability revision and a new incarnation for every connection', async () => {
    const { directory, attach } = fixture();
    const capabilities = async () => {
      const { entries } = await directory.snapshot();
      return entries[0]?.descriptor.capabilities;
    };
    await attach('one');
    const first = await capabilities();
    await attach('one');
    const second = await capabilities();
    expect(first?.revision).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(second?.revision).toBe(first?.revision);
    expect(second?.incarnation).not.toBe(first?.incarnation);
    await attach('one', undefined, { ...descriptor, capabilities: { ...descriptor.capabilities, holds: [] } });
    const third = await capabilities();
    expect(third?.revision).not.toBe(first?.revision);
  });

  it("should serve the host's own alerts after the provider's and replace them on update", async () => {
    const { directory, attach } = fixture();
    const device = await attach('one');
    const vendor = { code: '0300-400C', blocks: 'nothing' } as const;
    const reconnect = {
      code: 'tau.reconnect-required',
      blocks: 'everything',
      remedies: [{ type: 'person', instruction: 'Check the machine, then reconnect it in Settings.' }],
    } as const;
    const alerts = async () => {
      const { entries } = await directory.snapshot();
      return entries[0]?.snapshot.alerts;
    };
    await directory.update({ machineId: 'one', alerts: [reconnect] });
    device.push({ ...observation, ...busy, alerts: [vendor] });
    await vi.waitFor(() => {
      expect(device.consumed).toHaveBeenCalledOnce();
    });
    await expect(alerts()).resolves.toEqual([vendor, reconnect]);
    await directory.update({ machineId: 'one', alerts: [] });
    await expect(alerts()).resolves.toEqual([vendor]);
    await expect(directory.update({ machineId: 'one', alerts: [vendor] })).rejects.toThrow(
      'MACHINE_DIRECTORY_HOST_ALERT_CODE',
    );
  });

  it("should serve the host's operations and testing flag beside every report, across sessions", async () => {
    const { directory, attach } = fixture();
    const device = await attach('one');
    const operation: MachineOperation = {
      operationId: 'operation-1',
      machineId: 'one',
      kind: 'stop',
      inputDigest: `sha256:${'0'.repeat(64)}` as ContentDigest,
      state: 'accepted',
      updatedAt: '2026-09-06T00:00:00Z',
    };
    await directory.update({ machineId: 'one', operations: [operation], testing: true });
    device.push({ ...observation, ...busy });
    await vi.waitFor(() => {
      expect(device.consumed).toHaveBeenCalledOnce();
    });
    const first = async () => {
      const { entries } = await directory.snapshot();
      return entries[0];
    };
    await expect(first()).resolves.toMatchObject({
      testing: true,
      snapshot: { state: { status: 'active' }, operations: [operation] },
    });
    await attach('one');
    await expect(first()).resolves.toMatchObject({
      testing: true,
      snapshot: { operations: [operation] },
    });
  });

  it('should persist a machine again only when a new session reports another identity', async () => {
    const { attach, store } = fixture();
    await attach('one');
    await attach('one');
    expect(store.persisted).toHaveLength(1);
    await attach('one', undefined, { ...descriptor, firmware: '2' });
    expect(store.persisted.map((entry) => entry.descriptor.firmware)).toEqual(['1', '2']);
  });

  it('should retain host-selected identities and publish only persisted identities', async () => {
    const { directory, attach, store } = fixture();
    await attach('one');
    await attach('two');
    const snapshot = await directory.snapshot();
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
    expect(store.persisted).toHaveLength(2);
  });

  it('should cancel only a client watch while device observations continue and replay on reconnect', async () => {
    const { directory, attach, commits } = fixture();
    const device = await attach();
    const abort = new AbortController();
    const first = directory.watch({ signal: abort.signal })[Symbol.asyncIterator]();
    const initial = await first.next();
    expect(initial.value).toMatchObject({
      type: 'snapshot',
      snapshot: { cursor: { position: 1, revision: 1 } },
    });
    const { cursor } = await directory.snapshot();
    const waiting = first.next();
    abort.abort();
    expect(await waiting).toEqual({ done: true, value: undefined });
    expect(commits.size).toBe(0);
    expect(device.session.close).not.toHaveBeenCalled();
    device.push({ ...observation, ...busy });
    await vi.waitFor(async () => {
      const snapshot = await directory.snapshot();
      expect(snapshot.cursor.revision).toBe(2);
    });
    const againAbort = new AbortController();
    const again = directory.watch({ cursor, signal: againAbort.signal })[Symbol.asyncIterator]();
    try {
      const frame = await again.next();
      expect(frame.value).toMatchObject({
        type: 'event',
        cursor: { position: 2, revision: 2 },
        event: { entry: { snapshot: busy } },
      });
    } finally {
      againAbort.abort();
      await again.return?.();
    }
    await directory.close();
    expect(device.session.close).toHaveBeenCalledOnce();
  });

  it('should list recovered identities as stale without writes until a new session observes them', async () => {
    const { directory, attach, open, store } = fixture();
    const original = await attach();
    const before = await directory.snapshot();
    original.push({ ...observation, observedAt: '2026-09-06T00:05:00Z', ...busy });
    await vi.waitFor(() => {
      expect(original.consumed).toHaveBeenCalledOnce();
    });
    await directory.close();
    expect(original.session.close).toHaveBeenCalledOnce();
    const recovered = open(store.persisted);
    const restarted = await recovered.snapshot();
    // Telemetry never reached the store, so the restart shows the attach-time snapshot, marked stale.
    expect(restarted).toMatchObject({
      cursor: { position: 0, revision: 0 },
      entries: [{ machineId: 'selected-id', name: 'Printer selected-id', freshness: 'stale', snapshot: observation }],
    });
    expect(restarted.cursor.generation).not.toBe(before.cursor.generation);
    await attach('selected-id', recovered);
    expect(await recovered.snapshot()).toMatchObject({
      cursor: { position: 1, revision: 1 },
      entries: [{ freshness: 'current' }],
    });
    expect(store.persisted).toHaveLength(1);
  });

  it.each(['getDescriptor', 'getSnapshot'] as const)(
    'should mark the machine stale in memory when replacement %s fails',
    async (method) => {
      const { directory, attach, store } = fixture();
      const old = await attach();
      const replacement = sessionFixture();
      vi.mocked(replacement.session[method]).mockRejectedValue(new Error('replacement failed'));
      await expect(
        directory.attach({
          machineId: 'selected-id',
          name: 'Printer selected-id',
          providerId: 'new',
          session: replacement.session,
        }),
      ).rejects.toThrow('replacement failed');
      expect(old.session.close).toHaveBeenCalledOnce();
      expect(replacement.session.close).toHaveBeenCalledOnce();
      expect(await directory.snapshot()).toMatchObject({
        cursor: { revision: 2 },
        entries: [
          {
            providerId: 'provider',
            freshness: 'stale',
            snapshot: { observedAt: observation.observedAt },
          },
        ],
      });
      expect(store.persisted).toHaveLength(1);
    },
  );

  it('should detach a paused yielded subscription immediately on caller abort or host close', async () => {
    const { directory, attach, commits } = fixture();
    const device = await attach();
    const abort = new AbortController();
    const first = directory.watch({ signal: abort.signal })[Symbol.asyncIterator]();
    await first.next();
    expect(commits.size).toBe(1);
    abort.abort();
    expect(commits.size).toBe(0);
    expect(device.session.close).not.toHaveBeenCalled();
    const second = directory.watch({ signal: new AbortController().signal })[Symbol.asyncIterator]();
    await second.next();
    expect(commits.size).toBe(1);
    await directory.close();
    expect(commits.size).toBe(0);
    expect(device.session.close).toHaveBeenCalledOnce();
    await first.return?.();
    await second.return?.();
  });

  it('should give an explicit bounded-lag snapshot without claiming cursor expiry', async () => {
    const { directory, attach } = fixture();
    const before = await directory.snapshot();
    const device = await attach('other');
    for (let second = 1; second <= 257; second += 1) {
      device.push({
        ...observation,
        // Every report changes the state, so every one is an event the tail must hold.
        state: { status: second % 2 === 0 ? 'ready' : 'active' },
        observedAt: new Date(Date.parse(observation.observedAt) + second * 1000).toISOString(),
      });
    }
    await vi.waitFor(() => {
      expect(device.consumed).toHaveBeenCalledTimes(257);
    });
    const abort = new AbortController();
    const watch = directory.watch({ cursor: before.cursor, signal: abort.signal })[Symbol.asyncIterator]();
    try {
      const frame = await watch.next();
      expect(frame.value).toMatchObject({
        type: 'resync-required',
        reason: 'lag',
        snapshot: { cursor: { position: 258, revision: 258 }, entries: [{ machineId: 'other' }] },
      });
    } finally {
      abort.abort();
      await watch.return?.();
    }
  });

  it('should surface a refused persist on its own attach and keep serving reads, watches and observations', async () => {
    const { directory, store, attach, errors } = fixture();
    const device = await attach('one');
    store.failNextPersist();
    const refused = sessionFixture();
    await expect(
      directory.attach({
        machineId: 'two',
        name: 'Printer two',
        providerId: 'provider',
        session: refused.session,
      }),
    ).rejects.toThrow('fixture persist failure');
    expect(refused.session.close).toHaveBeenCalledOnce();
    expect(store.persisted.map((entry) => entry.machineId)).toEqual(['one']);
    device.push({ ...observation, observedAt: '2026-09-06T00:01:00Z', ...busy });
    await vi.waitFor(() => {
      expect(device.consumed).toHaveBeenCalledOnce();
    });
    await expect(directory.snapshot()).resolves.toMatchObject({
      cursor: { revision: 2 },
      entries: [{ machineId: 'one', freshness: 'current', snapshot: { ...busy, observedAt: '2026-09-06T00:01:00Z' } }],
    });
    const abort = new AbortController();
    const watch = directory.watch({ signal: abort.signal })[Symbol.asyncIterator]();
    try {
      await expect(watch.next()).resolves.toMatchObject({
        value: { type: 'snapshot', snapshot: { entries: [{ machineId: 'one', freshness: 'current' }] } },
      });
    } finally {
      abort.abort();
      await watch.return?.();
    }
    expect(errors).not.toHaveBeenCalled();
  });

  it('should fence an old observer when the host replaces its session', async () => {
    const { directory, attach } = fixture();
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
      machineId: 'selected-id',
      name: 'Printer selected-id',
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
      snapshot: { ...observation, ...busy },
    });
    await replacement;
    expect(await directory.snapshot()).toMatchObject({
      cursor: { revision: 3 },
      entries: [{ providerId: 'provider', snapshot: { state: { status: 'ready' } } }],
    });
  });

  it.each(['generation', 'authorityId', 'hostId', 'position', 'revision'] as const)(
    'should resync a mismatched %s cursor',
    async (field) => {
      const { directory, attach } = fixture();
      await attach();
      const current = await directory.snapshot();
      const cursor: MachineDirectoryCursor = {
        ...current.cursor,
        [field]: field === 'position' || field === 'revision' ? 999 : 'foreign',
      };
      const abort = new AbortController();
      const watch = directory.watch({ cursor, signal: abort.signal })[Symbol.asyncIterator]();
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

  it('should not miss a change between snapshot delivery and requesting the tail', async () => {
    const { directory, attach } = fixture();
    await attach();
    const abort = new AbortController();
    const watch = directory.watch({ signal: abort.signal })[Symbol.asyncIterator]();
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

  it('should reject malformed provider data before persisting it', async () => {
    const { directory, store } = fixture();
    const device = sessionFixture();
    vi.mocked(device.session.getDescriptor).mockResolvedValue({
      ...descriptor,
      firmware: '',
    });
    await expect(
      directory.attach({
        machineId: 'selected-id',
        name: 'Printer selected-id',
        providerId: 'provider',
        session: device.session,
      }),
    ).rejects.toThrow();
    expect(store.persisted).toEqual([]);
    expect(device.session.close).toHaveBeenCalledOnce();
  });

  it('should remove a machine and close its provider session without a store write', async () => {
    const { directory, attach, store } = fixture();
    const device = await attach();
    await directory.remove({ machineId: 'selected-id' });
    expect(await directory.snapshot()).toMatchObject({
      cursor: { revision: 2 },
      entries: [],
    });
    expect(device.session.close).toHaveBeenCalledOnce();
    await expect(directory.remove({ machineId: 'selected-id' })).rejects.toThrow('MACHINE_DIRECTORY_UNKNOWN_MACHINE');
    expect(store.persisted).toHaveLength(1);
    // A removed machine is remembered again when it is bound again.
    await attach();
    expect(store.persisted).toHaveLength(2);
  });

  it('should join an initializing session on host close and refuse its late snapshot', async () => {
    const { directory, store } = fixture();
    const device = sessionFixture();
    const snapshot = Promise.withResolvers<MachineReport>();
    const started = Promise.withResolvers<void>();
    vi.mocked(device.session.getSnapshot).mockImplementation(async () => {
      started.resolve();
      return snapshot.promise;
    });
    const attachment = directory.attach({
      machineId: 'selected-id',
      name: 'Printer selected-id',
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
    expect(store.persisted).toEqual([]);
    expect(closed).toHaveBeenCalledOnce();
  });

  it.each(['disconnected', 'unreachable'] as const)(
    'should tell the attacher once when its current session reports %s, keeping what it reported',
    async (connection) => {
      const { directory } = fixture();
      const device = sessionFixture();
      const onLost = vi.fn();
      await directory.attach({
        machineId: 'selected-id',
        name: 'Printer selected-id',
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
      await expect(directory.snapshot()).resolves.toMatchObject({
        entries: [{ freshness: 'current', snapshot: { connection } }],
      });
      expect(device.session.close).not.toHaveBeenCalled();
    },
  );

  it('should tell the attacher at once when its session attaches already disconnected', async () => {
    const { directory } = fixture();
    const device = sessionFixture();
    vi.mocked(device.session.getSnapshot).mockResolvedValue({ ...observation, connection: 'disconnected' });
    const onLost = vi.fn();
    await directory.attach({
      machineId: 'selected-id',
      name: 'Printer selected-id',
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
      const { directory, errors } = fixture();
      const device = sessionFixture();
      const onLost = vi.fn();
      await directory.attach({
        machineId: 'selected-id',
        name: 'Printer selected-id',
        providerId: 'provider',
        session: { ...device.session, observe },
        onLost,
      });
      await vi.waitFor(() => {
        expect(device.session.close).toHaveBeenCalledOnce();
      });
      expect(onLost).toHaveBeenCalledOnce();
      await expect(directory.snapshot()).resolves.toMatchObject({
        entries: [{ freshness: 'stale' }],
      });
      expect(errors.mock.calls.map(([error]: unknown[]) => (error as Error).message)).toEqual(reported);
    },
  );

  it('should never tell the attacher about a session the host replaced, removed or closed', async () => {
    const { directory } = fixture();
    const attachWatched = async (machineId: string) => {
      const device = sessionFixture();
      const onLost = vi.fn();
      await directory.attach({
        machineId,
        name: `Printer ${machineId}`,
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
    await directory.remove({ machineId: 'selected-id' });
    await directory.close();
    for (const { device, onLost } of [replaced, removed, closed]) {
      expect(device.session.close).toHaveBeenCalledOnce();
      expect(onLost).not.toHaveBeenCalled();
    }
  });

  it('should validate served event frames strictly and without invoking accessors', async () => {
    const { directory } = fixture();
    const { cursor } = await directory.snapshot();
    const event = { type: 'machine-directory-removed', hostId: 'host', authorityId: 'authority', revision: 1 };
    const frame = { type: 'event', cursor, event: { ...event, machineId: 'selected-id' } };
    expect(parseMachineDirectoryFrame(frame)).toEqual(frame);
    expect(() => parseMachineDirectoryFrame({ ...frame, event: { ...frame.event, secretRef: 'secret' } })).toThrow();
    expect(() =>
      parseMachineDirectoryFrame({ ...frame, event: { ...frame.event, machineId: 'x'.repeat(257) } }),
    ).toThrow();
    // The stale event was never written and machines have no workspace scope: both are refused.
    expect(() =>
      parseMachineDirectoryFrame({ ...frame, event: { ...event, type: 'machine-directory-stale' } }),
    ).toThrow();
    expect(() =>
      parseMachineDirectoryFrame({ ...frame, event: { ...frame.event, workspaceId: 'workspace' } }),
    ).toThrow();
    const getter = vi.fn(() => 'secret');
    expect(() =>
      parseMachineDirectoryFrame(
        Object.defineProperty({ ...frame, event: { ...frame.event } }, 'secret', { get: getter }),
      ),
    ).toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
});
