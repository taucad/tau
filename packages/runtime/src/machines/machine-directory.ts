import type { Topic } from '@taucad/events';
import { ResourceQueue } from '@taucad/filesystem';
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
  name: identity,
  providerId: identity,
  descriptor: descriptorSchema,
  snapshot: snapshotSchema,
  freshness: z.enum(['current', 'stale']),
});
const scope = {
  hostId: identity,
  authorityId: identity,
};
const eventScope = { ...scope, revision: count.min(1) };
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
  maximumDepth: 12,
  maximumNodes: 16_384,
  maximumCharacters: 131_072,
};
// Ponytail: watchers resume from the last 256 live changes (256 retained entries); a watcher further behind gets
// one lag resync snapshot instead. Raise it only if lag resyncs show up on real hosts.
const maximumLag = 256;
const maximumEntries = 256;
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
}>;
/** A read-through position distinct from projection revision, valid only for the directory `generation` that issued it. @public */
export type MachineDirectoryCursor = Readonly<z.infer<typeof cursorSchema>>;
/** The full machine directory at one read-through boundary. @public */
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
  machineId: string;
  name: string;
  providerId: string;
  session: Pick<MachineSession, 'getDescriptor' | 'getSnapshot' | 'observe' | 'close'>;
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
  close(): Promise<void>;
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

// A machine reaches the store only when this identity is new or changes.
const machineIdentity = (entry: MachineDirectoryEntry): string =>
  canonicalizeCacheValue({ value: { providerId: entry.providerId, descriptor: entry.descriptor } });

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
  }

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
  const apply = (body: DirectoryChange): void => {
    if (body.type === 'machine-directory-upserted') {
      if (!entries.has(body.entry.machineId) && entries.size >= maximumEntries) {
        throw new Error('MACHINE_DIRECTORY_ENTRY_LIMIT');
      }
      entries.set(body.entry.machineId, body.entry);
    } else if (!entries.delete(body.machineId)) {
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
  const publish = async (owned: OwnedSession, entry: MachineDirectoryEntry): Promise<void> =>
    queue.queueFor(queueKey, async () => {
      assertOpen();
      if (!isCurrent(owned)) {
        return;
      }
      const previous = entries.get(entry.machineId);
      if (previous && canonicalizeCacheValue({ value: previous }) === canonicalizeCacheValue({ value: entry })) {
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
      apply({ type: 'machine-directory-upserted', entry });
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
          name,
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
    async *watch(watchInput) {
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
          const current = snapshot();
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
                cursor: cursor(sequence + 1, event.revision),
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
