import type { Topic } from '@taucad/events';
import { ResourceQueue } from '@taucad/filesystem';
import type { CacheValue } from '@taucad/cache-core';
import { canonicalizeCacheValue } from '@taucad/cache-core';
import { convert, quantityKinds } from '@taucad/units/quantity';
import type { Quantity } from '@taucad/units/quantity';
import { randomUuid } from '@taucad/utils/id';
import { z } from 'zod';

import { cloneBoundedJson } from '@taucad/parameters/json';
import type { MachineDescriptor, MachineSession, MachineSnapshot } from '#machines/machine.js';

const identity = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => value.isWellFormed());
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const names = z.array(identity).max(128);
const envelope = z.strictObject({
  width: z.number().positive(),
  depth: z.number().positive(),
  height: z.number().positive(),
  unit: z.literal('m'),
});
const nozzleDiameter = z.unknown().transform((value, context) => {
  const candidate = value as Quantity;
  const converted = convert({ quantity: candidate, to: 'm' });
  if (
    converted.status !== 'success' ||
    candidate.kind !== quantityKinds.diameter ||
    candidate.space !== 'linear' ||
    typeof converted.value.value !== 'number' ||
    converted.value.value <= 0
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Nozzle diameter must be a positive executable diameter quantity.',
    });
    return z.NEVER;
  }
  return candidate;
});
const temperaturePoint = z.unknown().transform((value, context) => {
  const candidate = value as Quantity;
  const converted = convert({ quantity: candidate, to: 'Cel' });
  if (
    converted.status !== 'success' ||
    candidate.kind !== quantityKinds.temperature ||
    candidate.space !== 'point' ||
    typeof converted.value.value !== 'number'
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Temperature must be an executable affine point quantity.',
    });
    return z.NEVER;
  }
  return candidate;
});
const percentage = z.number().min(0).max(100);
const material = z.strictObject({
  slot: count.max(127),
  state: z.enum(['empty', 'loaded', 'unknown']),
  materialId: identity.optional(),
  profileId: identity.optional(),
  brand: identity.optional(),
  color: z
    .string()
    .regex(/^#[0-9A-F]{6}$/u)
    .optional(),
  remainingPercent: percentage.optional(),
});
const descriptorSchema = z.strictObject({
  id: identity,
  name: identity,
  vendor: identity,
  model: identity,
  technology: identity,
  firmware: identity,
  accepts: z
    .array(
      z.strictObject({
        contract: z.strictObject({ id: identity, version: count.min(1) }),
        mediaType: identity,
        requiredMembers: z.array(z.string().min(1).max(512)).max(128),
        payloadSelection: z.enum(['single', 'plate']),
        technology: identity,
      }),
    )
    .max(128),
  operations: names,
  ratedEnvelope: envelope,
  printableEnvelope: envelope,
  tools: z
    .array(
      z.strictObject({
        id: identity,
        kind: identity,
        nozzleDiameter: nozzleDiameter.optional(),
      }),
    )
    .max(128),
  materialSystem: z.strictObject({ kind: identity, slotCount: count.max(128) }),
  bedTypes: names,
});
const snapshotSchema = z.strictObject({
  connection: z.enum(['connected', 'disconnected', 'unreachable']),
  readiness: z.enum(['busy', 'idle', 'not-ready', 'unknown']),
  activeRunId: identity.optional(),
  observedAt: z.iso.datetime({ offset: true }),
  setup: z.strictObject({
    toolId: identity.optional(),
    bedType: identity.optional(),
    materials: z.array(material).max(128),
  }),
  run: z
    .strictObject({
      state: z.enum(['failed', 'finishing', 'idle', 'paused', 'preparing', 'printing', 'succeeded', 'unknown']),
      progress: z.number().min(0).max(100).optional(),
      remainingSeconds: count.optional(),
      name: identity.optional(),
      file: identity.optional(),
      currentLayer: count.optional(),
      totalLayers: count.optional(),
      stage: identity.optional(),
      printType: identity.optional(),
      speedProfile: z.enum(['silent', 'standard', 'sport', 'ludicrous', 'unknown']).optional(),
      speedPercent: z.number().min(0).max(1000).optional(),
    })
    .optional(),
  temperatures: z
    .strictObject({
      nozzle: temperaturePoint.optional(),
      nozzleTarget: temperaturePoint.optional(),
      bed: temperaturePoint.optional(),
      bedTarget: temperaturePoint.optional(),
      chamber: temperaturePoint.optional(),
    })
    .optional(),
  fans: z
    .strictObject({
      part: percentage.optional(),
      auxiliary: percentage.optional(),
      chamber: percentage.optional(),
    })
    .optional(),
  materialSystem: z
    .strictObject({
      currentSlot: count.max(127).optional(),
      targetSlot: count.max(127).optional(),
      units: z
        .array(
          z.strictObject({
            unit: count.max(31),
            humidityIndex: count.max(100).optional(),
            temperature: temperaturePoint.optional(),
          }),
        )
        .max(32),
    })
    .optional(),
  network: z.strictObject({ wifiSignalDbm: z.number().min(-150).max(0).optional() }).optional(),
  lights: z.strictObject({ chamber: z.enum(['off', 'on', 'unknown']).optional() }).optional(),
  removableStorage: z.enum(['absent', 'present']).optional(),
  alerts: z
    .array(z.strictObject({ code: identity }))
    .max(128)
    .optional(),
});
const entrySchema = z.strictObject({
  machineId: identity,
  providerId: identity,
  descriptor: descriptorSchema,
  snapshot: snapshotSchema,
  freshness: z.enum(['current', 'stale']),
});
const scope = {
  hostId: identity,
  authorityId: identity,
  workspaceId: identity,
};
const eventScope = { ...scope, revision: count.min(1) };
const eventSchema = z.discriminatedUnion('type', [
  z.strictObject({
    ...eventScope,
    type: z.literal('machine-directory-upserted'),
    entry: entrySchema,
  }),
  z.strictObject({ ...eventScope, type: z.literal('machine-directory-stale') }),
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
  maximumDepth: 12,
  maximumNodes: 16_384,
  maximumCharacters: 131_072,
};
const pageSize = 128;
// Ponytail: watchers resume from the last 256 live changes (256 retained entries); a watcher further behind gets
// one lag resync snapshot instead. Raise it only if lag resyncs show up on real hosts.
const maximumLag = 256;
const maximumEntries = 256;
const maximumWorkspaces = 256;
const queueKey = 'machine-directory';

/** Committed machine facts, never raw packets or host connection material. @internal */
export type MachineDirectoryEvent = Readonly<{
  hostId: string;
  authorityId: string;
  workspaceId: string;
  revision: number;
}> &
  (
    | Readonly<{
        type: 'machine-directory-upserted';
        entry: MachineDirectoryEntry;
      }>
    | Readonly<{ type: 'machine-directory-stale' }>
    | Readonly<{ type: 'machine-directory-removed'; machineId: string }>
  );
/** Host-selected identity and a validated observation. Current means this session incarnation, not wall-clock freshness or physical readiness; `snapshot.observedAt` is the latest report, including one that changed nothing else. @public */
export type MachineDirectoryEntry = Readonly<{
  machineId: string;
  providerId: string;
  descriptor: MachineDescriptor;
  snapshot: MachineSnapshot;
  freshness: 'current' | 'stale';
}>;
/** A scoped read-through position distinct from projection revision, valid only for the directory `generation` that issued it. @public */
export type MachineDirectoryCursor = Readonly<z.infer<typeof cursorSchema>>;
/** Full workspace directory at one committed read-through boundary. @public */
export type MachineDirectorySnapshot = Readonly<{
  cursor: MachineDirectoryCursor;
  entries: readonly MachineDirectoryEntry[];
}>;
/** Ordered observation frames; callers deduplicate by cursor/revision. @public */
export type MachineDirectoryFrame =
  | Readonly<{ type: 'snapshot'; snapshot: MachineDirectorySnapshot }>
  | Readonly<{
      type: 'event';
      cursor: MachineDirectoryCursor;
      event: MachineDirectoryEvent;
    }>
  | Readonly<{
      type: 'resync-required';
      reason: 'revision-mismatch' | 'lag';
      snapshot: MachineDirectorySnapshot;
    }>;
/** Host-local transfer of one already-connected session. @internal */
export type AttachMachineDirectorySessionInput = Readonly<{
  workspaceId: string;
  machineId: string;
  providerId: string;
  session: Pick<MachineSession, 'getDescriptor' | 'getSnapshot' | 'observe' | 'close'>;
  /**
   * Called at most once when this session stops being live while it is still the machine's session: it reports a
   * connection other than `connected`, or its observation ends or fails. Never called for a replaced or removed
   * session, or after the directory closes.
   */
  onLost?(): void;
}>;
/** Named workspace lookup. Admission remains the route owner's responsibility. @internal */
export type MachineDirectoryReadInput = Readonly<{ workspaceId: string }>;
/** One client-owned directory observation. @internal */
export type MachineDirectoryWatchInput = Readonly<{
  workspaceId: string;
  cursor?: MachineDirectoryCursor;
  signal: AbortSignal;
}>;
/** Host-owned live directory; its borrowed authority journal keeps only machine identities and removals. @internal */
export type MachineDirectory = Readonly<{
  attach(input: AttachMachineDirectorySessionInput): Promise<void>;
  remove(input: Readonly<{ workspaceId: string; machineId: string }>): Promise<void>;
  snapshot(input: MachineDirectoryReadInput): Promise<MachineDirectorySnapshot>;
  watch(input: MachineDirectoryWatchInput): AsyncIterable<MachineDirectoryFrame>;
  close(): Promise<void>;
}>;
/** Narrow append/replay port owned by the machine authority. It is deliberately independent of jobs. @internal */
export type MachineDirectoryJournal = Readonly<{
  append(candidate: unknown): Promise<Readonly<{ sequence: number; event: CacheValue }>>;
  replay(input: Readonly<{ cursor: number; limit: number }>): Promise<
    Readonly<{
      records: ReadonlyArray<Readonly<{ sequence: number; event: CacheValue }>>;
      nextCursor: number;
      endCursor: number;
    }>
  >;
}>;
/** The authority owns storage and the commit topic. @internal */
export type CreateMachineDirectoryInput = Readonly<{
  hostId: string;
  authorityId: string;
  journal: MachineDirectoryJournal;
  /** Emitted after every served change to wake watchers; the authority disposes it. */
  commits: Topic<void>;
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

/** Parse bounded committed machine records before replay or append. @internal
 * @param value - Candidate normalized record.
 * @returns Detached immutable event.
 */
export const parseMachineDirectoryEvent = (value: unknown): MachineDirectoryEvent =>
  freeze(eventSchema.parse(cloneBoundedJson(value, limits)));

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
  freeze(entrySchema.parse(cloneBoundedJson(value, limits)));

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
  return freeze(parsed);
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
  return freeze(
    z
      .discriminatedUnion('type', [
        z.strictObject({ type: z.literal('snapshot'), snapshot }),
        z.strictObject({
          type: z.literal('event'),
          cursor: cursorSchema,
          event: eventSchema,
        }),
        z.strictObject({
          type: z.literal('resync-required'),
          reason: z.enum(['revision-mismatch', 'lag']),
          snapshot,
        }),
      ])
      .parse(candidate),
  );
};

const machineEvent = (value: CacheValue): MachineDirectoryEvent | undefined => {
  if (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'type' in value &&
    typeof value['type'] === 'string' &&
    value['type'].startsWith('machine-directory-')
  ) {
    return parseMachineDirectoryEvent(value);
  }
  return undefined;
};

// A machine reaches the journal only when this identity is new or changes.
const machineIdentity = (entry: MachineDirectoryEntry): string =>
  canonicalizeCacheValue({ value: { providerId: entry.providerId, descriptor: entry.descriptor } });

type Projection = {
  revision: number;
  entries: Map<string, MachineDirectoryEntry>;
};
type DirectoryChange =
  | Readonly<{ type: 'machine-directory-upserted'; entry: MachineDirectoryEntry }>
  | Readonly<{ type: 'machine-directory-removed'; machineId: string }>;
type ServedChange = Readonly<{ sequence: number; event: MachineDirectoryEvent }>;
type OwnedSession = {
  input: AttachMachineDirectorySessionInput;
  abort: AbortController;
  observer?: Promise<void>;
  ready: PromiseWithResolvers<void>;
  stop?: Promise<void>;
  lost: boolean;
};

/** Recover journaled machines as stale and own subsequent device observations in memory.
 * The supplied journal and commit topic remain owned by the authority, including on failure/close.
 * @internal
 * @param input - Trusted host scope and borrowed authority services.
 * @returns Directory with client-independent device lifetime.
 */
export const createMachineDirectory = async (input: CreateMachineDirectoryInput): Promise<MachineDirectory> => {
  const hostId = identity.parse(input.hostId);
  const authorityId = identity.parse(input.authorityId);
  // Live history is never journaled, so every open mints the epoch that scopes its cursors.
  const generation = randomUuid();
  /** Machine identities and removals folded from the journal: what a restart recovers. */
  const journaled = new Map<string, Projection>();
  /** What reads and watches serve: the journaled machines with their latest observations. */
  const live = new Map<string, Projection>();
  /** The last `maximumLag` served changes, for watchers resuming inside this generation. */
  const recent: ServedChange[] = [];
  const sessions = new Map<string, OwnedSession>();
  const queue = new ResourceQueue();
  let position = 0;
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

  const assertOpen = (): void => {
    if (closed) {
      throw new Error('MACHINE_DIRECTORY_CLOSED');
    }
  };
  const projection = (projections: Map<string, Projection>, workspaceId: string): Projection =>
    projections.get(workspaceId) ?? { revision: 0, entries: new Map() };
  const reduce = (projections: Map<string, Projection>, event: MachineDirectoryEvent): void => {
    if (event.hostId !== hostId || event.authorityId !== authorityId) {
      throw new Error('MACHINE_DIRECTORY_WRONG_AUTHORITY');
    }
    const current = projection(projections, event.workspaceId);
    if (event.revision !== current.revision + 1) {
      throw new Error('MACHINE_DIRECTORY_REVISION_GAP');
    }
    if (!projections.has(event.workspaceId) && projections.size >= maximumWorkspaces) {
      throw new Error('MACHINE_DIRECTORY_WORKSPACE_LIMIT');
    }
    if (event.type === 'machine-directory-upserted') {
      if (!current.entries.has(event.entry.machineId) && current.entries.size >= maximumEntries) {
        throw new Error('MACHINE_DIRECTORY_ENTRY_LIMIT');
      }
      current.entries.set(event.entry.machineId, event.entry);
    } else if (event.type === 'machine-directory-removed') {
      if (!current.entries.delete(event.machineId)) {
        throw new Error('MACHINE_DIRECTORY_UNKNOWN_MACHINE');
      }
    } else {
      for (const [key, entry] of current.entries) {
        current.entries.set(key, freeze({ ...entry, freshness: 'stale' }));
      }
    }
    current.revision = event.revision;
    projections.set(event.workspaceId, current);
  };
  const change = (
    projections: Map<string, Projection>,
    workspaceId: string,
    body: DirectoryChange,
  ): MachineDirectoryEvent => ({
    ...body,
    hostId,
    authorityId,
    workspaceId,
    revision: projection(projections, workspaceId).revision + 1,
  });
  const cursor = (
    workspaceId: string,
    at = position,
    revision = projection(live, workspaceId).revision,
  ): MachineDirectoryCursor =>
    freeze({
      hostId,
      authorityId,
      workspaceId,
      generation,
      position: at,
      revision,
    });
  const snapshot = (workspaceId: string): MachineDirectorySnapshot =>
    freeze({
      cursor: cursor(workspaceId),
      entries: [...projection(live, workspaceId).entries.values()],
    });
  // Serve one change: live projection, bounded tail and watcher wake-up.
  const apply = (workspaceId: string, body: DirectoryChange): void => {
    const event = freeze(change(live, workspaceId, body));
    reduce(live, event);
    recent.push({ sequence: position, event });
    if (recent.length > maximumLag) {
      recent.shift();
    }
    position += 1;
    input.commits.emit();
  };
  // Journal one change before serving it; a refused append throws and leaves both projections unchanged.
  const record = async (workspaceId: string, body: DirectoryChange): Promise<void> => {
    const event = parseMachineDirectoryEvent(change(journaled, workspaceId, body));
    // Validate the complete transition on a copy before any append.
    const trial = new Map(journaled);
    const current = journaled.get(workspaceId);
    if (current) {
      trial.set(workspaceId, { revision: current.revision, entries: new Map(current.entries) });
    }
    reduce(trial, event);
    await input.journal.append(event);
    reduce(journaled, event);
    apply(workspaceId, body);
  };
  const markStale = (workspaceId: string, machineId: string): void => {
    const entry = projection(live, workspaceId).entries.get(machineId);
    if (entry?.freshness === 'current') {
      apply(workspaceId, { type: 'machine-directory-upserted', entry: { ...entry, freshness: 'stale' } });
    }
  };
  const sessionKey = (workspaceId: string, machineId: string): string => JSON.stringify([workspaceId, machineId]);
  const isCurrent = (owned: OwnedSession): boolean =>
    !closed &&
    sessions.get(sessionKey(owned.input.workspaceId, owned.input.machineId)) === owned &&
    !owned.abort.signal.aborted;
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
  const publish = async (owned: OwnedSession, entry: MachineDirectoryEntry): Promise<void> =>
    queue.queueFor(queueKey, async () => {
      assertOpen();
      if (!isCurrent(owned)) {
        return;
      }
      const { workspaceId } = owned.input;
      const previous = projection(live, workspaceId).entries.get(entry.machineId);
      if (previous && canonicalizeCacheValue({ value: previous }) === canonicalizeCacheValue({ value: entry })) {
        return;
      }
      const body: DirectoryChange = { type: 'machine-directory-upserted', entry };
      const known = projection(journaled, workspaceId).entries.get(entry.machineId);
      // Ponytail: only machine identity (a new machine, provider or descriptor) reaches the journal; observations,
      // confirmations (reports equal but for `observedAt`) and stale marks stay in memory. Directory bytes grow with
      // bindings and firmware changes, never with report rate or uptime, and a restarted host lists each machine
      // stale with its last journaled snapshot until it reports. Journal a bounded-cadence snapshot here if a
      // restart must show more.
      if (known && machineIdentity(known) === machineIdentity(entry)) {
        apply(workspaceId, body);
        return;
      }
      await record(workspaceId, body);
    });
  const observe = async (owned: OwnedSession, entry: MachineDirectoryEntry): Promise<void> => {
    try {
      for await (const event of owned.input.session.observe({
        signal: owned.abort.signal,
      })) {
        if (!isCurrent(owned)) {
          break;
        }
        const parsed = z
          .strictObject({
            type: z.literal('snapshot'),
            snapshot: snapshotSchema,
          })
          .parse(cloneBoundedJson(event, limits));
        await publish(owned, {
          ...entry,
          snapshot: parsed.snapshot,
          freshness: 'current',
        });
        if (parsed.snapshot.connection !== 'connected') {
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
          const current = projection(live, owned.input.workspaceId).entries.get(owned.input.machineId);
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

  let replayed = 0;
  let end: number | undefined;
  do {
    // oxlint-disable-next-line eslint/no-await-in-loop -- committed pages must fold in sequence.
    const page = await input.journal.replay({ cursor: replayed, limit: pageSize });
    end ??= page.endCursor;
    for (const { sequence, event } of page.records) {
      if (sequence !== replayed) {
        throw new Error('MACHINE_DIRECTORY_JOURNAL_GAP');
      }
      const directoryEvent = machineEvent(event);
      if (directoryEvent) {
        reduce(journaled, directoryEvent);
      }
      replayed += 1;
    }
    if (page.nextCursor !== replayed || (replayed < end && page.records.length === 0)) {
      throw new Error('MACHINE_DIRECTORY_JOURNAL_GAP');
    }
  } while (replayed < end);
  // Nothing has reported in this generation yet, so every recovered machine starts stale.
  for (const [workspaceId, recovered] of journaled) {
    const entries = new Map<string, MachineDirectoryEntry>();
    for (const [machineId, entry] of recovered.entries) {
      entries.set(machineId, freeze({ ...entry, freshness: 'stale' }));
    }
    live.set(workspaceId, { revision: recovered.revision, entries });
  }

  // Served changes to the cursor's workspace after its position, oldest first.
  const since = (after: MachineDirectoryCursor): readonly ServedChange[] =>
    recent.filter(({ sequence, event }) => sequence >= after.position && event.workspaceId === after.workspaceId);
  const validCursor = (after: MachineDirectoryCursor, current: MachineDirectoryCursor): boolean => {
    if (
      !cursorSchema.safeParse(after).success ||
      after.hostId !== hostId ||
      after.authorityId !== authorityId ||
      after.workspaceId !== current.workspaceId ||
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
      const workspaceId = identity.parse(attachment.workspaceId);
      const machineId = identity.parse(attachment.machineId);
      const providerId = identity.parse(attachment.providerId);
      const key = sessionKey(workspaceId, machineId);
      const previous = sessions.get(key);
      if (!previous && sessions.size >= maximumEntries) {
        throw new Error('MACHINE_DIRECTORY_SESSION_LIMIT');
      }
      const owned: OwnedSession = {
        input: { ...attachment, workspaceId, machineId, providerId },
        abort: new AbortController(),
        ready: Promise.withResolvers<void>(),
        lost: false,
      };
      sessions.set(key, owned);
      try {
        if (previous) {
          try {
            await queue.queueFor(queueKey, async () => {
              assertOpen();
              if (isCurrent(owned)) {
                markStale(workspaceId, machineId);
              }
            });
          } finally {
            await stop(previous);
            await previous.ready.promise;
            await previous.observer;
          }
        }
        const descriptor = descriptorSchema.parse(
          cloneBoundedJson(
            await attachment.session.getDescriptor({
              signal: owned.abort.signal,
            }),
            limits,
          ),
        );
        if (!isCurrent(owned)) {
          return;
        }
        const current = snapshotSchema.parse(
          cloneBoundedJson(
            await attachment.session.getSnapshot({
              signal: owned.abort.signal,
            }),
            limits,
          ),
        );
        if (!isCurrent(owned)) {
          return;
        }
        const entry: MachineDirectoryEntry = {
          machineId,
          providerId,
          descriptor,
          snapshot: current,
          freshness: 'current',
        };
        await publish(owned, entry);
        if (isCurrent(owned)) {
          owned.observer = observe(owned, entry);
          if (current.connection !== 'connected') {
            lose(owned);
          }
        }
      } catch (error) {
        await stop(owned);
        if (sessions.get(key) === owned) {
          sessions.delete(key);
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
    async remove({ workspaceId, machineId }) {
      identity.parse(workspaceId);
      identity.parse(machineId);
      const key = sessionKey(workspaceId, machineId);
      const owned = sessions.get(key);
      if (owned) {
        owned.abort.abort();
      }
      try {
        await queue.queueFor(queueKey, async () => {
          assertOpen();
          if (sessions.get(key) !== owned) {
            throw new Error('MACHINE_DIRECTORY_SESSION_REPLACED');
          }
          try {
            await record(workspaceId, { type: 'machine-directory-removed', machineId });
          } catch (error) {
            // The journal still lists the machine and its session stops below, so it cannot stay current.
            markStale(workspaceId, machineId);
            throw error;
          }
        });
      } finally {
        if (owned) {
          await stop(owned);
          await owned.ready.promise;
          await owned.observer;
          if (sessions.get(key) === owned) {
            sessions.delete(key);
          }
        }
      }
    },
    async snapshot({ workspaceId }) {
      identity.parse(workspaceId);
      assertOpen();
      return snapshot(workspaceId);
    },
    async *watch(watchInput) {
      const workspaceId = identity.parse(watchInput.workspaceId);
      const signal = AbortSignal.any([watchInput.signal, shutdown.signal]);
      const isAborted = (): boolean => signal.aborted;
      let after = watchInput.cursor;
      let checked = false;
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
          const current = snapshot(workspaceId);
          let frames: MachineDirectoryFrame[];
          if (!after) {
            frames = [{ type: 'snapshot', snapshot: current }];
          } else if (!checked && !validCursor(after, current.cursor)) {
            frames = [{ type: 'resync-required', reason: 'revision-mismatch', snapshot: current }];
          } else if (current.cursor.position - after.position > maximumLag) {
            frames = [{ type: 'resync-required', reason: 'lag', snapshot: current }];
          } else {
            frames = since(after).map(
              ({ sequence, event }): MachineDirectoryFrame => ({
                type: 'event',
                cursor: cursor(workspaceId, sequence + 1, event.revision),
                event,
              }),
            );
          }
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
