import type { Topic } from '@taucad/events';
import { ResourceQueue } from '@taucad/filesystem';
import type { CacheValue } from '@taucad/cache-core';
import { canonicalizeCacheValue } from '@taucad/cache-core';
import { z } from 'zod';

import { cloneBoundedJson } from '#configuration/bounded-json.js';
import type { JobJournal } from '#jobs/job-journal.js';
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
    .array(z.strictObject({ id: identity, kind: identity, nozzleDiameter: z.number().positive().optional() }))
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
    materials: z.array(z.strictObject({ slot: count.max(127), materialId: identity.optional() })).max(128),
  }),
});
const entrySchema = z.strictObject({
  machineId: identity,
  providerId: identity,
  descriptor: descriptorSchema,
  snapshot: snapshotSchema,
  freshness: z.enum(['current', 'stale']),
});
const scope = { hostId: identity, authorityId: identity, workspaceId: identity };
const eventScope = { ...scope, revision: count.min(1) };
const eventSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...eventScope, type: z.literal('machine-directory-upserted'), entry: entrySchema }),
  z.strictObject({ ...eventScope, type: z.literal('machine-directory-stale') }),
  z.strictObject({ ...eventScope, type: z.literal('machine-directory-removed'), machineId: identity }),
]);
const cursorSchema = z.strictObject({ ...scope, generation: identity, position: count, revision: count });
const limits = { code: 'MACHINE_DIRECTORY', maximumDepth: 12, maximumNodes: 16_384, maximumCharacters: 131_072 };
const pageSize = 128;
const maximumLag = 1024;
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
    | Readonly<{ type: 'machine-directory-upserted'; entry: MachineDirectoryEntry }>
    | Readonly<{ type: 'machine-directory-stale' }>
    | Readonly<{ type: 'machine-directory-removed'; machineId: string }>
  );
/** Host-selected identity and a validated observation. Current means this session incarnation, not wall-clock freshness or physical readiness. @internal */
export type MachineDirectoryEntry = Readonly<{
  machineId: string;
  providerId: string;
  descriptor: MachineDescriptor;
  snapshot: MachineSnapshot;
  freshness: 'current' | 'stale';
}>;
/** A scoped read-through position distinct from projection revision. @internal */
export type MachineDirectoryCursor = Readonly<z.infer<typeof cursorSchema>>;
/** Full workspace directory at one committed read-through boundary. @internal */
export type MachineDirectorySnapshot = Readonly<{
  cursor: MachineDirectoryCursor;
  entries: readonly MachineDirectoryEntry[];
}>;
/** Durable observation frames; callers deduplicate by cursor/revision. @internal */
export type MachineDirectoryFrame =
  | Readonly<{ type: 'snapshot'; snapshot: MachineDirectorySnapshot }>
  | Readonly<{ type: 'event'; cursor: MachineDirectoryCursor; event: MachineDirectoryEvent }>
  | Readonly<{ type: 'resync-required'; reason: 'revision-mismatch' | 'lag'; snapshot: MachineDirectorySnapshot }>;
/** Host-local transfer of one already-connected session. @internal */
export type AttachMachineDirectorySessionInput = Readonly<{
  workspaceId: string;
  machineId: string;
  providerId: string;
  session: Pick<MachineSession, 'getDescriptor' | 'getSnapshot' | 'observe' | 'close'>;
}>;
/** Named workspace lookup. Admission remains the route owner's responsibility. @internal */
export type MachineDirectoryReadInput = Readonly<{ workspaceId: string }>;
/** One client-owned directory observation. @internal */
export type MachineDirectoryWatchInput = Readonly<{
  workspaceId: string;
  cursor?: MachineDirectoryCursor;
  signal: AbortSignal;
}>;
/** Host-owned directory over a borrowed, exclusively owned authority journal. @internal */
export type MachineDirectory = Readonly<{
  attach(input: AttachMachineDirectorySessionInput): Promise<void>;
  remove(input: Readonly<{ workspaceId: string; machineId: string }>): Promise<void>;
  snapshot(input: MachineDirectoryReadInput): Promise<MachineDirectorySnapshot>;
  watch(input: MachineDirectoryWatchInput): AsyncIterable<MachineDirectoryFrame>;
  close(): Promise<void>;
}>;
/** The authority owns storage, generation and commit notifications. @internal */
export type CreateMachineDirectoryInput = Readonly<{
  hostId: string;
  authorityId: string;
  /** Stable identity of the journal history, retained across ordinary host restarts. */
  generation: string;
  journal: Pick<JobJournal<CacheValue>, 'append' | 'replay'>;
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

const observationState = (entry: MachineDirectoryEntry): string => {
  const { observedAt: _observedAt, ...snapshot } = entry.snapshot;
  return canonicalizeCacheValue({ value: { ...entry, snapshot } });
};

type Projection = { revision: number; entries: Map<string, MachineDirectoryEntry> };
type OwnedSession = {
  input: AttachMachineDirectorySessionInput;
  abort: AbortController;
  observer?: Promise<void>;
  ready: PromiseWithResolvers<void>;
  stop?: Promise<void>;
};

/** Recover a directory, persist stale-session recovery and own subsequent device observations.
 * The supplied journal and commit topic remain owned by the authority, including on failure/close.
 * @internal
 * @param input - Trusted host scope and borrowed authority services.
 * @returns Directory with client-independent device lifetime.
 */
export const createMachineDirectory = async (input: CreateMachineDirectoryInput): Promise<MachineDirectory> => {
  const hostId = identity.parse(input.hostId);
  const authorityId = identity.parse(input.authorityId);
  const generation = identity.parse(input.generation);
  const projections = new Map<string, Projection>();
  const sessions = new Map<string, OwnedSession>();
  const queue = new ResourceQueue();
  let position = 0;
  let closed = false;
  let failure: unknown;
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
    if (failure !== undefined) {
      throw new Error('MACHINE_DIRECTORY_UNAVAILABLE', { cause: failure });
    }
    if (closed) {
      throw new Error('MACHINE_DIRECTORY_CLOSED');
    }
  };
  const projection = (workspaceId: string): Projection =>
    projections.get(workspaceId) ?? { revision: 0, entries: new Map() };
  const reduce = (event: MachineDirectoryEvent): void => {
    if (event.hostId !== hostId || event.authorityId !== authorityId) {
      throw new Error('MACHINE_DIRECTORY_WRONG_AUTHORITY');
    }
    const current = projection(event.workspaceId);
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
  const synchronize = async (): Promise<void> => {
    let end: number | undefined;
    do {
      // oxlint-disable-next-line eslint/no-await-in-loop -- committed pages must fold in sequence.
      const page = await input.journal.replay({
        cursor: position,
        limit: end === undefined ? pageSize : Math.min(pageSize, end - position),
      });
      end ??= page.endCursor;
      for (const record of page.records) {
        if (record.sequence !== position) {
          throw new Error('MACHINE_DIRECTORY_JOURNAL_GAP');
        }
        const event = machineEvent(record.event);
        if (event) {
          reduce(event);
        }
        position += 1;
      }
      if (page.nextCursor !== position || (position < end && page.records.length === 0)) {
        throw new Error('MACHINE_DIRECTORY_JOURNAL_GAP');
      }
    } while (position < end);
  };
  const cursor = (
    workspaceId: string,
    at = position,
    revision = projection(workspaceId).revision,
  ): MachineDirectoryCursor => freeze({ hostId, authorityId, workspaceId, generation, position: at, revision });
  const snapshot = (workspaceId: string): MachineDirectorySnapshot =>
    freeze({ cursor: cursor(workspaceId), entries: [...projection(workspaceId).entries.values()] });

  const commit = async (event: MachineDirectoryEvent): Promise<void> => {
    const parsed = parseMachineDirectoryEvent(event);
    // Validate the complete transition before any append, without mutating the visible projection.
    const old = projections.get(parsed.workspaceId);
    const copy = old ? { revision: old.revision, entries: new Map(old.entries) } : undefined;
    try {
      reduce(parsed);
    } finally {
      if (copy) {
        projections.set(parsed.workspaceId, copy);
      } else {
        projections.delete(parsed.workspaceId);
      }
    }
    try {
      const record = await input.journal.append(parsed);
      // Another authority domain may append between our synchronized read and this append.
      await synchronize();
      if (record.sequence >= position) {
        throw new Error('MACHINE_DIRECTORY_UNCOMMITTED_APPEND');
      }
      input.commits.emit();
    } catch (error) {
      failure = error;
      input.commits.emit();
      throw error;
    }
  };
  const change = (
    workspaceId: string,
    body:
      | Omit<Extract<MachineDirectoryEvent, { type: 'machine-directory-upserted' }>, keyof typeof eventScope>
      | Omit<Extract<MachineDirectoryEvent, { type: 'machine-directory-stale' }>, keyof typeof eventScope>
      | Omit<Extract<MachineDirectoryEvent, { type: 'machine-directory-removed' }>, keyof typeof eventScope>,
  ): MachineDirectoryEvent => ({
    ...body,
    hostId,
    authorityId,
    workspaceId,
    revision: projection(workspaceId).revision + 1,
  });
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
  const publish = async (owned: OwnedSession, entry: MachineDirectoryEntry): Promise<void> =>
    queue.queueFor(queueKey, async () => {
      assertOpen();
      if (!isCurrent(owned)) {
        return;
      }
      await synchronize();
      if (!isCurrent(owned)) {
        return;
      }
      const previous = projection(owned.input.workspaceId).entries.get(entry.machineId);
      if (previous && observationState(previous) === observationState(entry)) {
        return;
      }
      await commit(change(owned.input.workspaceId, { type: 'machine-directory-upserted', entry }));
    });
  const observe = async (owned: OwnedSession, entry: MachineDirectoryEntry): Promise<void> => {
    try {
      for await (const event of owned.input.session.observe({ signal: owned.abort.signal })) {
        if (!isCurrent(owned)) {
          break;
        }
        const parsed = z
          .strictObject({ type: z.literal('snapshot'), snapshot: snapshotSchema })
          .parse(cloneBoundedJson(event, limits));
        await publish(owned, { ...entry, snapshot: parsed.snapshot, freshness: 'current' });
      }
    } catch (error) {
      if (isCurrent(owned)) {
        report(error);
      }
    } finally {
      if (isCurrent(owned)) {
        try {
          const current = projection(owned.input.workspaceId).entries.get(owned.input.machineId);
          if (current) {
            await publish(owned, { ...current, freshness: 'stale' });
          }
        } catch (error) {
          report(error);
        }
      }
      try {
        await stop(owned);
      } catch (error) {
        failure = error;
        input.commits.emit();
        report(error);
      }
    }
  };

  await synchronize();
  for (const [workspaceId, current] of projections) {
    if ([...current.entries.values()].some((entry) => entry.freshness === 'current')) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- recovery transitions retain journal order.
      await commit(change(workspaceId, { type: 'machine-directory-stale' }));
    }
  }

  const validCursor = async (after: MachineDirectoryCursor, current: MachineDirectoryCursor): Promise<boolean> => {
    const parsed = cursorSchema.safeParse(after);
    if (
      !parsed.success ||
      after.hostId !== hostId ||
      after.authorityId !== authorityId ||
      after.workspaceId !== current.workspaceId ||
      after.generation !== generation ||
      after.position > current.position
    ) {
      return false;
    }
    let revision = 0;
    let readThrough = 0;
    // Ponytail: validate historical revision by replay; add an index only when reconnect cost warrants it.
    while (readThrough < after.position) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- cursor qualification folds a committed prefix in sequence.
      const page = await input.journal.replay({
        cursor: readThrough,
        limit: Math.min(pageSize, after.position - readThrough),
      });
      for (const record of page.records) {
        const event = machineEvent(record.event);
        if (event?.workspaceId === current.workspaceId) {
          revision = event.revision;
        }
      }
      if (page.nextCursor <= readThrough) {
        throw new Error('MACHINE_DIRECTORY_JOURNAL_GAP');
      }
      readThrough = page.nextCursor;
    }
    return revision === after.revision;
  };
  const readTail = async (
    after: MachineDirectoryCursor,
    end: number,
  ): Promise<Readonly<{ cursor: MachineDirectoryCursor; frames: readonly MachineDirectoryFrame[] }>> => {
    const page = await input.journal.replay({
      cursor: after.position,
      limit: Math.min(pageSize, end - after.position),
    });
    const frames: MachineDirectoryFrame[] = [];
    let next = after;
    for (const record of page.records) {
      if (record.sequence !== next.position) {
        throw new Error('MACHINE_DIRECTORY_JOURNAL_GAP');
      }
      const event = machineEvent(record.event);
      const selected = event?.workspaceId === after.workspaceId;
      if (selected && event.revision !== next.revision + 1) {
        throw new Error('MACHINE_DIRECTORY_REVISION_GAP');
      }
      next = cursor(after.workspaceId, record.sequence + 1, selected ? event.revision : next.revision);
      if (selected) {
        frames.push({ type: 'event', cursor: next, event });
      }
    }
    if (next.position <= after.position) {
      throw new Error('MACHINE_DIRECTORY_JOURNAL_GAP');
    }
    return { cursor: next, frames };
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
      };
      sessions.set(key, owned);
      try {
        if (previous) {
          try {
            await queue.queueFor(queueKey, async () => {
              assertOpen();
              await synchronize();
              const entry = projection(workspaceId).entries.get(machineId);
              if (isCurrent(owned) && entry?.freshness === 'current') {
                await commit(
                  change(workspaceId, { type: 'machine-directory-upserted', entry: { ...entry, freshness: 'stale' } }),
                );
              }
            });
          } finally {
            await stop(previous);
            await previous.ready.promise;
            await previous.observer;
          }
        }
        const descriptor = descriptorSchema.parse(
          cloneBoundedJson(await attachment.session.getDescriptor({ signal: owned.abort.signal }), limits),
        );
        if (!isCurrent(owned)) {
          return;
        }
        const current = snapshotSchema.parse(
          cloneBoundedJson(await attachment.session.getSnapshot({ signal: owned.abort.signal }), limits),
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
          await synchronize();
          if (sessions.get(key) !== owned) {
            throw new Error('MACHINE_DIRECTORY_SESSION_REPLACED');
          }
          await commit(change(workspaceId, { type: 'machine-directory-removed', machineId }));
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
      return queue.queueFor(queueKey, async () => {
        assertOpen();
        await synchronize();
        return snapshot(workspaceId);
      });
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
          // oxlint-disable-next-line eslint/no-await-in-loop -- each pull joins one committed snapshot boundary.
          const current = await queue.queueFor(queueKey, async () => {
            assertOpen();
            await synchronize();
            return snapshot(workspaceId);
          });
          if (isAborted()) {
            return;
          }
          if (!after) {
            after = current.cursor;
            checked = true;
            yield { type: 'snapshot', snapshot: current };
          }
          if (!checked) {
            // oxlint-disable-next-line eslint/no-await-in-loop -- qualify the supplied cursor before emitting its tail.
            const valid = await validCursor(after, current.cursor);
            if (isAborted()) {
              return;
            }
            checked = true;
            if (!valid) {
              after = current.cursor;
              yield { type: 'resync-required', reason: 'revision-mismatch', snapshot: current };
            }
          }
          if (current.cursor.position - after.position > maximumLag) {
            after = current.cursor;
            yield { type: 'resync-required', reason: 'lag', snapshot: current };
          }
          while (after.position < current.cursor.position) {
            // oxlint-disable-next-line eslint/no-await-in-loop -- pull bounded pages in cursor order.
            const tail = await readTail(after, current.cursor.position);
            after = tail.cursor;
            for (const frame of tail.frames) {
              if (isAborted()) {
                return;
              }
              assertOpen();
              yield frame;
            }
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
