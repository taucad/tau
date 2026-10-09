import type { Topic } from '@taucad/events';
import { ResourceQueue } from '@taucad/filesystem';
import { canonicalizeCacheValue, digestContent } from '@taucad/cache-core';
import type { CacheValue } from '@taucad/cache-core';
import { randomUuid } from '@taucad/utils/id';
import { z } from 'zod';

import { cloneBoundedJson } from '@taucad/parameters/json';
import { machineOperationSchema } from '#machines/machine-jobs.js';
import type { MachineOperation } from '#machines/machine-jobs.js';
import type { MachineDescriptor, MachineSession } from '#machines/machine.js';
import { machineManifestSchema } from '#machines/machine-manifest.js';
import type { MachineManifest } from '#machines/machine-manifest.js';
import {
  admitComponentObservations,
  componentObservationsSchema,
  machineProviderReportSchema,
  machineReportSchema,
  mergeComponentObservations,
} from '#machines/machine-observation.js';
import type {
  ComponentObservation,
  MachineAlert,
  MachineReport,
  MachineSnapshot,
} from '#machines/machine-observation.js';

const identity = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => value.isWellFormed());
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const capabilitiesSchema = machineManifestSchema
  .pick({
    connection: true,
    axes: true,
    components: true,
    processes: true,
    actions: true,
    holds: true,
    jobs: true,
    stop: true,
  })
  .extend({ revision: identity, incarnation: identity });
const descriptorShape = { id: identity, name: identity, vendor: identity, model: identity, firmware: identity };
const descriptorSchema = z.strictObject({ ...descriptorShape, capabilities: capabilitiesSchema });
const providerDescriptorSchema = z.strictObject({
  ...descriptorShape,
  capabilities: capabilitiesSchema.omit({ revision: true, incarnation: true }),
});
const instant = z.iso.datetime({ offset: true });
// A provider's own observations: components are admitted one by one, so one unreadable value degrades only itself.
const observationSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('snapshot'), snapshot: machineProviderReportSchema }),
  z.strictObject({
    type: z.literal('changed'),
    observedAt: instant,
    components: z.array(z.unknown()).max(128),
  }),
]);
const snapshotSchema = machineReportSchema.extend({ operations: z.array(machineOperationSchema).max(64) });
const entrySchema = z.strictObject({
  machineId: identity,
  name: identity,
  providerId: identity,
  descriptor: descriptorSchema,
  snapshot: snapshotSchema,
  freshness: z.enum(['current', 'stale']),
  testing: z.boolean().optional(),
});
const scope = {
  hostId: identity,
  authorityId: identity,
};
const eventScope = { ...scope, revision: count.min(1) };
const observedSchema = z.strictObject({
  type: z.literal('observed'),
  machineId: identity,
  observedAt: instant,
  components: componentObservationsSchema,
});
const eventSchema = z.discriminatedUnion('type', [
  z.strictObject({
    ...eventScope,
    type: z.literal('machine-directory-upserted'),
    entry: entrySchema,
  }),
  z.strictObject({
    ...eventScope,
    type: z.literal('machine-directory-removed'),
    machineId: identity,
  }),
]);
const cursorSchema = z.strictObject({
  ...scope,
  generation: identity,
  position: count,
  revision: count,
});
const limits = {
  code: 'MACHINE_DIRECTORY',
  maximumDepth: 48,
  maximumNodes: 524_288,
  maximumCharacters: 8_388_608,
};
// Ponytail: watchers resume from the last 256 live changes (256 retained entries); a watcher further behind gets
// one lag resync snapshot instead. Raise it only if lag resyncs show up on real hosts.
const maximumLag = 256;
const maximumEntries = 256;
/** Operations a snapshot shows, newest first. */
const maximumOperations = 64;
const queueKey = 'machine-directory';

/** One served directory change. Changes live in memory only; the store keeps each machine's last-known identity. @internal */
export type MachineDirectoryEvent = Readonly<{
  hostId: string;
  authorityId: string;
  revision: number;
}> &
  (
    | Readonly<{
        type: 'machine-directory-upserted';
        entry: MachineDirectoryEntry;
      }>
    | Readonly<{ type: 'machine-directory-removed'; machineId: string }>
  );
/**
 * Host-selected identity and a validated observation. `name` is the display name the person gave the printer.
 * Current means this session incarnation, not wall-clock freshness or physical readiness; `snapshot.observedAt` is
 * the latest report, including one that changed nothing else.
 * @public
 */
export type MachineDirectoryEntry = Readonly<{
  machineId: string;
  name: string;
  providerId: string;
  descriptor: MachineDescriptor;
  snapshot: MachineSnapshot;
  freshness: 'current' | 'stale';
  /** A person let controls not yet qualified on this machine be tried, to qualify them. */
  testing?: boolean;
}>;
/** A read-through position distinct from projection revision, valid only for the directory `generation` that issued it. @public */
export type MachineDirectoryCursor = Readonly<z.infer<typeof cursorSchema>>;
/** The full machine directory at one read-through boundary. @public */
export type MachineDirectorySnapshot = Readonly<{
  cursor: MachineDirectoryCursor;
  entries: readonly MachineDirectoryEntry[];
}>;
/**
 * Ordered observation frames; callers deduplicate events by cursor/revision. An `event` is replayed to a watcher
 * that resumes; an `observed` frame is not: it carries only the component groups that moved since this watcher's
 * last frame (positions, loads, a group re-reported unchanged) and the report time, coalesced to their latest
 * values. Merge its components into the machine's entry by component and group and set `snapshot.observedAt`.
 * @public
 */
export type MachineDirectoryFrame =
  | Readonly<{ type: 'snapshot'; snapshot: MachineDirectorySnapshot }>
  | Readonly<{
      type: 'event';
      cursor: MachineDirectoryCursor;
      event: MachineDirectoryEvent;
    }>
  | Readonly<{
      type: 'observed';
      machineId: string;
      observedAt: string;
      components: readonly ComponentObservation[];
    }>
  | Readonly<{
      type: 'resync-required';
      reason: 'revision-mismatch' | 'lag';
      snapshot: MachineDirectorySnapshot;
    }>;
/** Host-local transfer of one already-connected session. @internal */
export type AttachMachineDirectorySessionInput = Readonly<{
  machineId: string;
  name: string;
  providerId: string;
  session: Pick<MachineSession, 'getDescriptor' | 'getSnapshot' | 'observe' | 'close'>;
  /** The provider's freshness budgets; each observation is valid for its group's `staleAfter`. */
  observations?: MachineManifest['observations'];
  /**
   * Called at most once when this session stops being live while it is still the machine's session: it reports a
   * connection other than `connected`, or its observation ends or fails. Never called for a replaced or removed
   * session, or after the directory closes.
   */
  onLost?(): void;
}>;
/** One client-owned directory observation. @internal */
export type MachineDirectoryWatchInput = Readonly<{
  cursor?: MachineDirectoryCursor;
  signal: AbortSignal;
}>;
/** Host-owned live directory; the store it borrows through `persist` keeps only each machine's last-known identity. @internal */
export type MachineDirectory = Readonly<{
  attach(input: AttachMachineDirectorySessionInput): Promise<void>;
  remove(input: Readonly<{ machineId: string }>): Promise<void>;
  snapshot(): Promise<MachineDirectorySnapshot>;
  watch(input: MachineDirectoryWatchInput): AsyncIterable<MachineDirectoryFrame>;
  /**
   * Replace what the host adds to a machine's entry: its recent operations, its own alerts and its testing flag. Kept
   * across sessions, served at once when the machine is listed.
   */
  update(input: MachineDirectoryUpdate): Promise<void>;
  close(): Promise<void>;
}>;
/** The host's own part of one machine's entry. @internal */
export type MachineDirectoryUpdate = Readonly<{
  machineId: string;
  operations?: readonly MachineOperation[];
  testing?: boolean;
  /**
   * The host's own alerts, each with a code under `tau.` (`tau.reconnect-required`): what a person must do for a
   * machine the host will not reconnect by itself. Replaces the host's previous alerts; `[]` clears them.
   */
  alerts?: readonly MachineAlert[];
}>;
/** The authority owns storage and the commit topic. @internal */
export type CreateMachineDirectoryInput = Readonly<{
  hostId: string;
  authorityId: string;
  /** Each bound machine's last-known entry, served stale until a session reports. */
  recovered: readonly MachineDirectoryEntry[];
  /** Emitted after every served change to wake watchers; the authority disposes it. */
  commits: Topic<void>;
  /**
   * Remember a machine whose identity (provider or descriptor) is new or changed, before it is served. A refusal
   * leaves the directory unchanged and fails the attach or the observation that brought it.
   */
  persist(entry: MachineDirectoryEntry): Promise<void>;
  onError(error: unknown): void;
}>;

const freeze = <Value>(value: Value): Value => {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) {
      freeze(child);
    }
    Object.freeze(value);
  }
  return value;
};

/** Parse one bounded public directory cursor.
 * @param value - Untrusted cursor value.
 * @returns Detached, frozen cursor.
 * @public
 */
export const parseMachineDirectoryCursor = (value: unknown): MachineDirectoryCursor =>
  freeze(cursorSchema.parse(cloneBoundedJson(value, limits)));

/** Parse one bounded public directory entry.
 * @param value - Untrusted entry value.
 * @returns Detached, frozen entry.
 * @public
 */
export const parseMachineDirectoryEntry = (value: unknown): MachineDirectoryEntry =>
  freeze<MachineDirectoryEntry>(entrySchema.parse(cloneBoundedJson(value, limits)));

/** Parse one bounded public directory snapshot.
 * @param value - Untrusted snapshot value.
 * @returns Detached, frozen snapshot.
 * @public
 */
export const parseMachineDirectorySnapshot = (value: unknown): MachineDirectorySnapshot => {
  const candidate = cloneBoundedJson(value, limits);
  const parsed = z
    .strictObject({
      cursor: cursorSchema,
      entries: z.array(entrySchema).max(maximumEntries),
    })
    .parse(candidate);
  return freeze<MachineDirectorySnapshot>(parsed);
};

/** Parse one bounded public directory stream frame.
 * @param value - Untrusted stream-frame value.
 * @returns Detached, frozen stream frame.
 * @public
 */
export const parseMachineDirectoryFrame = (value: unknown): MachineDirectoryFrame => {
  const candidate = cloneBoundedJson(value, limits);
  const snapshot = z.strictObject({
    cursor: cursorSchema,
    entries: z.array(entrySchema).max(maximumEntries),
  });
  return freeze<MachineDirectoryFrame>(
    z
      .discriminatedUnion('type', [
        z.strictObject({ type: z.literal('snapshot'), snapshot }),
        z.strictObject({
          type: z.literal('event'),
          cursor: cursorSchema,
          event: eventSchema,
        }),
        observedSchema,
        z.strictObject({
          type: z.literal('resync-required'),
          reason: z.enum(['revision-mismatch', 'lag']),
          snapshot,
        }),
      ])
      .parse(candidate),
  );
};

const canonical = (value: unknown): string =>
  // SAFETY: every value canonicalized here is strictly parsed, bounded JSON.
  canonicalizeCacheValue({ value: value as CacheValue });
const encoder = new TextEncoder();

/**
 * The capability revision the host serves: the digest of what is installed, so the same installation keeps the same
 * revision across reconnects and any change invalidates every form shown before it.
 * @internal
 * @param capabilities - What the provider reports installed.
 * @returns A `sha256:` digest.
 */
export const machineCapabilityRevision = async (capabilities: unknown): Promise<string> =>
  digestContent({ bytes: encoder.encode(canonical(capabilities)) });

// A machine reaches the store only when this identity is new or changes; a reconnect alone (a new incarnation) does not.
// A session reports one descriptor object for its life, so its canonical form is computed once per object.
const descriptorIdentities = new WeakMap<MachineDescriptor, string>();
const machineIdentity = (entry: MachineDirectoryEntry): string => {
  let descriptor = descriptorIdentities.get(entry.descriptor);
  if (descriptor === undefined) {
    descriptor = canonical({
      ...entry.descriptor,
      capabilities: { ...entry.descriptor.capabilities, incarnation: '' },
    });
    descriptorIdentities.set(entry.descriptor, descriptor);
  }
  return `${entry.providerId}\u0000${descriptor}`;
};

// Each observation is valid for its group's declared budget from when it was received; an undeclared group keeps
// whatever the provider said.
const withValidity = (
  components: readonly ComponentObservation[],
  budgets: ReadonlyMap<string, number>,
): readonly ComponentObservation[] =>
  components.map((observation) => {
    const budget = budgets.get(observation.group);
    return budget === undefined
      ? observation
      : { ...observation, validUntil: new Date(Date.parse(observation.receivedAt) + budget).toISOString() };
  });

const componentKey = (observation: Pick<ComponentObservation, 'componentId' | 'group'>): string =>
  `${observation.componentId}\u0000${observation.group}`;

// What a resuming watcher must be able to replay, as one string: everything but the descriptor (compared by object,
// since a session keeps one), the `latest` groups' values, each other group's receive time and the report time. A
// change outside it is served as a coalesced `observed` frame instead of an event.
const lastingKey = (entry: MachineDirectoryEntry, latest: ReadonlySet<string>): string => {
  const { descriptor: _descriptor, ...rest } = entry;
  return canonical({
    ...rest,
    snapshot: {
      ...entry.snapshot,
      observedAt: '',
      components: entry.snapshot.components.map((observation) =>
        latest.has(observation.group) ? componentKey(observation) : { ...observation, receivedAt: '', validUntil: '' },
      ),
    },
  });
};
const noGroups: ReadonlySet<string> = new Set();
/** The host's own alerts carry codes under this prefix; a provider's never do. */
const hostAlertPrefix = 'tau.';

type DirectoryChange =
  | Readonly<{ type: 'machine-directory-upserted'; entry: MachineDirectoryEntry }>
  | Readonly<{ type: 'machine-directory-removed'; machineId: string }>;
type ServedChange = Readonly<{ sequence: number; event: MachineDirectoryEvent }>;
type HostPart = Readonly<{
  operations: readonly MachineOperation[];
  testing: boolean;
  alerts: readonly MachineAlert[];
}>;
type OwnedSession = {
  input: AttachMachineDirectorySessionInput;
  budgets: ReadonlyMap<string, number>;
  /** The groups the provider declares `latest`: coalesced and never replayed. */
  latest: ReadonlySet<string>;
  /** Components already reported unreadable, so each is reported once. */
  unreadable: Set<string>;
  abort: AbortController;
  observer?: Promise<void>;
  ready: PromiseWithResolvers<void>;
  stop?: Promise<void>;
  lost: boolean;
};

/** Serve the recovered machines as stale and own subsequent device observations in memory.
 * The commit topic remains owned by the authority, including on failure/close.
 * @internal
 * @param input - Trusted host identity, recovered entries and the borrowed store and topic.
 * @returns Directory with client-independent device lifetime.
 */
export const createMachineDirectory = (input: CreateMachineDirectoryInput): MachineDirectory => {
  const hostId = identity.parse(input.hostId);
  const authorityId = identity.parse(input.authorityId);
  // Live history is never stored, so every open mints the epoch that scopes its cursors.
  const generation = randomUuid();
  /** What reads and watches serve: every bound machine with its latest observation. */
  const entries = new Map<string, MachineDirectoryEntry>();
  /** The identity the store last remembered for each machine: what a restart shows. */
  const persisted = new Map<string, string>();
  /** The last `maximumLag` served changes, for watchers resuming inside this generation. */
  const recent: ServedChange[] = [];
  const sessions = new Map<string, OwnedSession>();
  /** What the host adds to each machine's entry, kept across its sessions. */
  const hostParts = new Map<string, HostPart>();
  /**
   * Per machine, the delta version at which each component group (and, under '', the report time) last moved without
   * an event. Watchers read the current values of what moved since their last frame; nothing here is replayed.
   */
  const deltas = new Map<string, Map<string, number>>();
  let deltaVersion = 0;
  /** Per machine, the descriptor and `lastingKey` of the entry the last event served. */
  const served = new Map<string, Readonly<{ descriptor: MachineDescriptor; key: string }>>();
  const latestOf = (machineId: string): ReadonlySet<string> => sessions.get(machineId)?.latest ?? noGroups;
  const queue = new ResourceQueue();
  let position = 0;
  let revision = 0;
  let closed = false;
  let closing: Promise<void> | undefined;
  const shutdown = new AbortController();
  const report = (error: unknown): void => {
    try {
      input.onError(error);
    } catch {
      /* Diagnostics cannot own device cleanup. */
    }
  };
  // Nothing has reported in this generation yet, so every recovered machine starts stale.
  for (const recovered of input.recovered) {
    const entry = parseMachineDirectoryEntry({ ...recovered, freshness: 'stale' });
    if (!entries.has(entry.machineId) && entries.size >= maximumEntries) {
      throw new Error('MACHINE_DIRECTORY_ENTRY_LIMIT');
    }
    entries.set(entry.machineId, entry);
    persisted.set(entry.machineId, machineIdentity(entry));
    hostParts.set(entry.machineId, {
      operations: entry.snapshot.operations,
      testing: entry.testing === true,
      alerts: [],
    });
  }
  // The entry with the host's current part: its recent operations, its own alerts (replacing any it added before)
  // and its testing flag.
  const decorate = (entry: MachineDirectoryEntry): MachineDirectoryEntry => {
    const part = hostParts.get(entry.machineId);
    const { testing: _testing, ...rest } = entry;
    const reported = entry.snapshot.alerts.filter(({ code }) => !code.startsWith(hostAlertPrefix));
    return {
      ...rest,
      snapshot: {
        ...entry.snapshot,
        operations: (part?.operations ?? []).slice(0, maximumOperations),
        alerts: [...reported, ...(part?.alerts ?? [])],
      },
      ...(part?.testing === true ? { testing: true } : {}),
    };
  };

  const assertOpen = (): void => {
    if (closed) {
      throw new Error('MACHINE_DIRECTORY_CLOSED');
    }
  };
  const cursor = (at = position, atRevision = revision): MachineDirectoryCursor =>
    freeze({
      hostId,
      authorityId,
      generation,
      position: at,
      revision: atRevision,
    });
  const snapshot = (): MachineDirectorySnapshot =>
    freeze({
      cursor: cursor(),
      entries: [...entries.values()],
    });
  // Serve one change: projection, bounded tail and watcher wake-up. An unknown or over-limit change throws unserved.
  const apply = (body: DirectoryChange, key?: string): void => {
    if (body.type === 'machine-directory-upserted') {
      const { entry } = body;
      if (!entries.has(entry.machineId) && entries.size >= maximumEntries) {
        throw new Error('MACHINE_DIRECTORY_ENTRY_LIMIT');
      }
      entries.set(entry.machineId, entry);
      served.set(entry.machineId, {
        descriptor: entry.descriptor,
        key: key ?? lastingKey(entry, latestOf(entry.machineId)),
      });
    } else if (entries.delete(body.machineId)) {
      served.delete(body.machineId);
      deltas.delete(body.machineId);
    } else {
      throw new Error('MACHINE_DIRECTORY_UNKNOWN_MACHINE');
    }
    revision += 1;
    const event: MachineDirectoryEvent = freeze({ ...body, hostId, authorityId, revision });
    recent.push({ sequence: position, event });
    if (recent.length > maximumLag) {
      recent.shift();
    }
    position += 1;
    input.commits.emit();
  };
  // Record what moved between two entries with the same `lastingKey`, and wake watchers; nothing moved, nothing to do.
  const move = (previous: MachineDirectoryEntry, entry: MachineDirectoryEntry): void => {
    const before = new Map(previous.snapshot.components.map((observation) => [componentKey(observation), observation]));
    const moved = entry.snapshot.components.filter((observation) => {
      const shown = before.get(componentKey(observation));
      return shown === undefined || canonical(shown) !== canonical(observation);
    });
    if (moved.length === 0 && previous.snapshot.observedAt === entry.snapshot.observedAt) {
      return;
    }
    deltaVersion += 1;
    const versions = deltas.get(entry.machineId) ?? new Map<string, number>();
    deltas.set(entry.machineId, versions);
    for (const observation of moved) {
      versions.set(componentKey(observation), deltaVersion);
    }
    versions.set('', deltaVersion);
    entries.set(entry.machineId, entry);
    input.commits.emit();
  };
  // One coalesced frame per machine that moved after `seen`, with only the groups that moved.
  const observedSince = (seen: number): MachineDirectoryFrame[] =>
    [...deltas].flatMap(([machineId, versions]): MachineDirectoryFrame[] => {
      const entry = entries.get(machineId);
      if (!entry || (versions.get('') ?? 0) <= seen) {
        return [];
      }
      return [
        {
          type: 'observed',
          machineId,
          observedAt: entry.snapshot.observedAt,
          components: entry.snapshot.components.filter(
            (observation) => (versions.get(componentKey(observation)) ?? 0) > seen,
          ),
        },
      ];
    });
  const markStale = (machineId: string): void => {
    const entry = entries.get(machineId);
    if (entry?.freshness === 'current') {
      apply({ type: 'machine-directory-upserted', entry: { ...entry, freshness: 'stale' } });
    }
  };
  const isCurrent = (owned: OwnedSession): boolean =>
    !closed && sessions.get(owned.input.machineId) === owned && !owned.abort.signal.aborted;
  const stop = async (owned: OwnedSession): Promise<void> => {
    owned.abort.abort();
    owned.stop ??= owned.input.session.close();
    return owned.stop;
  };
  // Tell the attacher, once, that its still-current session stopped being live.
  const lose = (owned: OwnedSession): void => {
    if (owned.lost || !isCurrent(owned)) {
      return;
    }
    owned.lost = true;
    try {
      owned.input.onLost?.();
    } catch (error) {
      report(error);
    }
  };
  const publish = async (owned: OwnedSession, observed: MachineDirectoryEntry): Promise<void> =>
    queue.queueFor(queueKey, async () => {
      assertOpen();
      if (!isCurrent(owned)) {
        return;
      }
      const entry = decorate(observed);
      const previous = entries.get(entry.machineId);
      const key = lastingKey(entry, owned.latest);
      const shown = served.get(entry.machineId);
      if (previous && shown?.descriptor === entry.descriptor && shown.key === key) {
        move(previous, entry);
        return;
      }
      // Ponytail: only machine identity (a new machine, provider or descriptor) reaches the store; observations,
      // confirmations (reports equal but for `observedAt`) and stale marks stay in memory. Store bytes grow with
      // bindings and firmware changes, never with report rate or uptime, and a restarted host lists each machine
      // stale with the snapshot remembered beside that identity until it reports. Persist a bounded-cadence
      // snapshot here if a restart must show more.
      const identity_ = machineIdentity(entry);
      if (persisted.get(entry.machineId) !== identity_) {
        await input.persist(entry);
        persisted.set(entry.machineId, identity_);
      }
      apply({ type: 'machine-directory-upserted', entry }, key);
    });
  // Admit a provider's components one by one; report each unreadable one once per session.
  const admit = (
    owned: OwnedSession,
    candidates: readonly unknown[],
    receivedAt: string,
  ): readonly ComponentObservation[] => {
    const { components, refused } = admitComponentObservations(candidates, receivedAt);
    for (const { componentId = '?', group = '?', error } of refused) {
      const key = `${componentId}\u0000${group}`;
      // Ponytail: a provider inventing endless keys is reported 128 times, then only degraded.
      if (!owned.unreadable.has(key) && owned.unreadable.size < 128) {
        owned.unreadable.add(key);
        report(
          new Error(`MACHINE_DIRECTORY_UNREADABLE_COMPONENT: ${owned.input.providerId} ${componentId} ${group}`, {
            cause: error,
          }),
        );
      }
    }
    return components;
  };
  // The entry one report gives, before the host's part is added.
  const observedEntry = (
    owned: OwnedSession,
    descriptor: MachineDescriptor,
    report: MachineReport,
  ): MachineDirectoryEntry => ({
    machineId: owned.input.machineId,
    name: owned.input.name,
    providerId: owned.input.providerId,
    descriptor,
    snapshot: { ...report, components: withValidity(report.components, owned.budgets), operations: [] },
    freshness: 'current',
  });
  const observe = async (owned: OwnedSession, descriptor: MachineDescriptor, initial: MachineReport): Promise<void> => {
    let latest = initial;
    try {
      for await (const event of owned.input.session.observe({
        signal: owned.abort.signal,
      })) {
        if (!isCurrent(owned)) {
          break;
        }
        const parsed = observationSchema.parse(cloneBoundedJson(event, limits));
        if (parsed.type === 'snapshot') {
          const { snapshot: report } = parsed;
          latest = { ...report, components: admit(owned, report.components, report.observedAt) };
        } else {
          const shown = new Map(latest.components.map((observation) => [componentKey(observation), observation]));
          // A delta older than what is shown is dropped: a late frame never moves a group back in time.
          const changed = admit(owned, parsed.components, parsed.observedAt).filter((observation) => {
            const current = shown.get(componentKey(observation));
            return current === undefined || Date.parse(observation.receivedAt) >= Date.parse(current.receivedAt);
          });
          latest = {
            ...latest,
            observedAt:
              Date.parse(parsed.observedAt) > Date.parse(latest.observedAt) ? parsed.observedAt : latest.observedAt,
            components: mergeComponentObservations(latest.components, changed),
          };
        }
        await publish(owned, observedEntry(owned, descriptor, latest));
        if (latest.connection !== 'connected') {
          lose(owned);
        }
      }
    } catch (error) {
      if (isCurrent(owned)) {
        report(error);
      }
    } finally {
      if (isCurrent(owned)) {
        try {
          const current = entries.get(owned.input.machineId);
          if (current) {
            await publish(owned, { ...current, freshness: 'stale' });
          }
        } catch (error) {
          report(error);
        }
        lose(owned);
      }
      try {
        await stop(owned);
      } catch (error) {
        report(error);
      }
    }
  };

  // Served changes after the cursor's position, oldest first.
  const since = (after: MachineDirectoryCursor): readonly ServedChange[] =>
    recent.filter(({ sequence }) => sequence >= after.position);
  const validCursor = (after: MachineDirectoryCursor, current: MachineDirectoryCursor): boolean => {
    if (
      !cursorSchema.safeParse(after).success ||
      after.hostId !== hostId ||
      after.authorityId !== authorityId ||
      after.generation !== generation ||
      after.position > current.position
    ) {
      return false;
    }
    // Older than the retained tail means lag, which the watch resynchronizes without claiming a mismatch.
    return after.position < position - recent.length || current.revision - since(after).length === after.revision;
  };

  return {
    async attach(attachment) {
      assertOpen();
      const machineId = identity.parse(attachment.machineId);
      const name = identity.parse(attachment.name);
      const providerId = identity.parse(attachment.providerId);
      const previous = sessions.get(machineId);
      if (!previous && sessions.size >= maximumEntries) {
        throw new Error('MACHINE_DIRECTORY_SESSION_LIMIT');
      }
      const owned: OwnedSession = {
        input: { ...attachment, machineId, name, providerId },
        budgets: new Map((attachment.observations ?? []).map(({ group, staleAfter }) => [group, staleAfter])),
        latest: new Set(
          (attachment.observations ?? []).flatMap(({ group, delivery }) => (delivery === 'latest' ? [group] : [])),
        ),
        unreadable: new Set(),
        abort: new AbortController(),
        ready: Promise.withResolvers<void>(),
        lost: false,
      };
      sessions.set(machineId, owned);
      try {
        if (previous) {
          try {
            await queue.queueFor(queueKey, async () => {
              assertOpen();
              if (isCurrent(owned)) {
                markStale(machineId);
              }
            });
          } finally {
            await stop(previous);
            await previous.ready.promise;
            await previous.observer;
          }
        }
        const provided = providerDescriptorSchema.parse(
          cloneBoundedJson(
            await attachment.session.getDescriptor({
              signal: owned.abort.signal,
            }),
            limits,
          ),
        );
        const descriptor: MachineDescriptor = {
          ...provided,
          capabilities: {
            ...provided.capabilities,
            revision: await machineCapabilityRevision(provided.capabilities),
            // Every connection is a new incarnation.
            incarnation: randomUuid(),
          },
        };
        if (!isCurrent(owned)) {
          return;
        }
        const reported = machineProviderReportSchema.parse(
          cloneBoundedJson(
            await attachment.session.getSnapshot({
              signal: owned.abort.signal,
            }),
            limits,
          ),
        );
        const current: MachineReport = {
          ...reported,
          components: admit(owned, reported.components, reported.observedAt),
        };
        if (!isCurrent(owned)) {
          return;
        }
        await publish(owned, observedEntry(owned, descriptor, current));
        if (isCurrent(owned)) {
          owned.observer = observe(owned, descriptor, current);
          if (current.connection !== 'connected') {
            lose(owned);
          }
        }
      } catch (error) {
        await stop(owned);
        if (sessions.get(machineId) === owned) {
          sessions.delete(machineId);
        }
        throw error;
      } finally {
        try {
          if (!isCurrent(owned)) {
            await stop(owned);
          }
        } finally {
          owned.ready.resolve();
        }
      }
    },
    async remove({ machineId }) {
      identity.parse(machineId);
      const owned = sessions.get(machineId);
      if (owned) {
        owned.abort.abort();
      }
      try {
        await queue.queueFor(queueKey, async () => {
          assertOpen();
          if (sessions.get(machineId) !== owned) {
            throw new Error('MACHINE_DIRECTORY_SESSION_REPLACED');
          }
          apply({ type: 'machine-directory-removed', machineId });
          persisted.delete(machineId);
          hostParts.delete(machineId);
        });
      } finally {
        if (owned) {
          await stop(owned);
          await owned.ready.promise;
          await owned.observer;
          if (sessions.get(machineId) === owned) {
            sessions.delete(machineId);
          }
        }
      }
    },
    async snapshot() {
      assertOpen();
      return snapshot();
    },
    async update({ machineId, operations, testing, alerts }) {
      if (alerts?.some(({ code }) => !code.startsWith(hostAlertPrefix))) {
        throw new TypeError('MACHINE_DIRECTORY_HOST_ALERT_CODE');
      }
      await queue.queueFor(queueKey, async () => {
        assertOpen();
        const part = hostParts.get(machineId);
        hostParts.set(machineId, {
          operations: operations ?? part?.operations ?? [],
          testing: testing ?? part?.testing ?? false,
          alerts: alerts ?? part?.alerts ?? [],
        });
        const entry = entries.get(machineId);
        const next = entry && decorate(entry);
        if (entry && next && canonical(next) !== canonical(entry)) {
          apply({ type: 'machine-directory-upserted', entry: next });
        }
      });
    },
    async *watch(watchInput) {
      const signal = AbortSignal.any([watchInput.signal, shutdown.signal]);
      const isAborted = (): boolean => signal.aborted;
      let after = watchInput.cursor;
      let checked = false;
      // The delta version this watcher has seen: a snapshot carries every current value, a resume carries none.
      let seen = 0;
      while (!isAborted()) {
        const wake = Promise.withResolvers<void>();
        const off = input.commits.subscribe(
          () => {
            wake.resolve();
          },
          { signal },
        );
        const onAbort = (): void => {
          wake.resolve();
        };
        signal.addEventListener('abort', onAbort, { once: true });
        try {
          // The snapshot and its tail are read from memory in one turn, so the retained tail cannot move between them.
          const current = snapshot();
          let frames: MachineDirectoryFrame[];
          if (!after) {
            frames = [{ type: 'snapshot', snapshot: current }];
          } else if (!checked && !validCursor(after, current.cursor)) {
            frames = [{ type: 'resync-required', reason: 'revision-mismatch', snapshot: current }];
          } else if (current.cursor.position - after.position > maximumLag) {
            frames = [{ type: 'resync-required', reason: 'lag', snapshot: current }];
          } else {
            frames = [
              ...since(after).map(
                ({ sequence, event }): MachineDirectoryFrame => ({
                  type: 'event',
                  cursor: cursor(sequence + 1, event.revision),
                  event,
                }),
              ),
              ...observedSince(seen),
            ];
          }
          seen = deltaVersion;
          after = current.cursor;
          checked = true;
          for (const frame of frames) {
            if (isAborted()) {
              return;
            }
            yield frame;
          }
          // oxlint-disable-next-line eslint/no-await-in-loop -- a tail subscription sleeps until a commit or cancellation.
          await wake.promise;
        } finally {
          off();
          signal.removeEventListener('abort', onAbort);
        }
      }
    },
    async close() {
      if (closing) {
        return closing;
      }
      closed = true;
      shutdown.abort();
      input.commits.emit();
      const stopAll = async (): Promise<void> => {
        const owned = [...sessions.values()];
        sessions.clear();
        const results = await Promise.allSettled(
          owned.map(async (session) => {
            await stop(session);
            await session.ready.promise;
            await session.observer;
          }),
        );
        await queue.queueFor(queueKey, async () => undefined);
        const errors: unknown[] = results.flatMap((result): unknown[] =>
          result.status === 'rejected' ? [result.reason] : [],
        );
        if (errors.length > 0) {
          throw new AggregateError(errors, 'MACHINE_DIRECTORY_CLOSE_FAILED');
        }
      };
      closing = stopAll();
      return closing;
    },
  };
};
