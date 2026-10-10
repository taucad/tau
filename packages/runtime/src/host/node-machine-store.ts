/**
 * The per-user machine store: one directory per printer, under one writer lock.
 *
 * ```text
 * <storeRoot>/                      0700
 *   store.json                      {"version":1,"migrated"?:{…}}, written last on the first open
 *   authority/authority.writer.lock the one writer's lock
 *   authority/machine-events.jsonl  the legacy journal: read once to migrate, never written
 *   <machineId>/                    0700, one directory per printer; the id is a slug of its name
 *     machine.json                  0600, atomic replace: binding, name, trust, testing, last-known identity (v2)
 *     journal.jsonl                 0600, append-only write-ahead operation journal
 *     preparations/<id>.json        0600, one preparation (v2), deleted once it expires
 *     jobs/<id>.json                0600, atomic replace: one whole job
 *     operations.jsonl, requests/   an older host's effect log and print requests, never read again
 *   <machineId>.removed-<epochMs>/  a removed printer's files, never read again
 * ```
 *
 * People and scripts may read every file; only the host holding the lock writes. A record the strict reader refuses
 * is reported as `MACHINE_STORE_RECORD_INVALID` and its bytes are never written again. `machine.json` and preparation
 * records are version 2 (the endpoint names its transport); version 1 records are read too and rewritten as version 2
 * on their next write, so an older Tau, which reads only version 1, refuses a rewritten record by its version and
 * keeps its file. The store holds references to
 * credentials, never a credential.
 *
 * @module
 */

import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, realpath, rename, rm, rmdir, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import type { CacheValue, ContentDigest } from '@taucad/cache-core';
import { acquireNodeAuthorityWriter } from '@taucad/filesystem/backend/node';
import { z } from 'zod';

import { cloneBoundedJson } from '@taucad/parameters/json';
import { createNodeMachineEventLog, readMachineEventLogPrefix } from '#host/node-machine-event-log.js';
import type { MachineEventLog, MachineEventLogOwner } from '#host/node-machine-event-log.js';
import { parseMachineJob, parseMachinePreparedJob } from '#machines/machine-channel.js';
import { parseMachineDirectoryEntry } from '#machines/machine-directory.js';
import type { MachineJob, MachinePreparedJob } from '#machines/machine-jobs.js';
import type { MachineSnapshot } from '#machines/machine-observation.js';
import { storedCandidateEndpointSchema } from '#machines/machine.js';
import type { MachineCandidate, MachineDescriptor, MachineTransportTrust } from '#machines/machine.js';

const storeFileName = 'store.json';
const machineFileName = 'machine.json';
const operationsFileName = 'journal.jsonl';
const preparationsDirectoryName = 'preparations';
const jobsDirectoryName = 'jobs';
const authorityDirectoryName = 'authority';
const legacyJournalName = 'machine-events.jsonl';
const maximumRecordBytes = 1024 * 1024;
const maximumNameLength = 128;
// Ponytail: ids are probed one suffix at a time; the directory's 256-machine cap keeps the probe short.
const maximumIdAttempts = 1024;
const slugPattern = /^[a-z0-9][a-z0-9-]{0,62}$/u;
// Lower case only, so no two ids share a file on a case-insensitive volume; an id shaped like a hashed name is hashed.
const safeFileId = /^(?!sha256-)[a-z0-9_-]{1,128}$/u;
// This store's own temporary files, `.<record>.<uuid>.tmp`; only a crash mid-write leaves one behind.
const temporaryFilePattern = /^\..+\.[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\.tmp$/u;
const reservedIds: ReadonlySet<string> = new Set([authorityDirectoryName]);
const terminalRequestStates: ReadonlySet<string> = new Set(['denied', 'failed', 'rejected', 'started', 'withdrawn']);
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

const identity = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => value.isWellFormed());
const timestamp = z.iso.datetime({ offset: true });
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const digest = z.custom<ContentDigest>((value) => typeof value === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value));
const boundedJson = (code: string, maximumDepth: number, maximumNodes: number) =>
  z
    .unknown()
    .transform((value) => cloneBoundedJson(value, { code, maximumDepth, maximumNodes, maximumCharacters: 65_536 }));
const candidateSchema = z.strictObject({
  id: identity,
  name: identity,
  endpoint: storedCandidateEndpointSchema,
  claimedIdentity: z.strictObject({ serial: identity.optional(), model: identity.optional() }),
  observedAt: timestamp,
  expiresAt: timestamp,
});
const trustSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('system') }),
  z.strictObject({ type: z.literal('pinned'), digest }),
]);
const connectionSchema = z.strictObject({
  secretRef: identity,
  serviceTrust: z.record(identity, trustSchema).refine((value) => Object.keys(value).length <= 8),
});
const nameSchema = z
  .string()
  .min(1)
  .max(maximumNameLength)
  .refine((value) => value.isWellFormed() && value.trim() === value);
const bindingConfiguration = boundedJson('NODE_MACHINE_BINDING_CONFIGURATION', 20, 2048);
// Version 2 records carry the transport-tagged endpoint and `testing`; a version 1 record (an older host's) is read
// as well and written back as version 2, so an older Tau refuses a newer record by its version and keeps its bytes.
const recordVersion = z.union([z.literal(1), z.literal(2)]).transform((): 2 => 2);
const machineRecordSchema = z.strictObject({
  version: recordVersion,
  id: z.string().regex(slugPattern),
  name: nameSchema,
  providerId: identity,
  physicalId: identity,
  candidate: candidateSchema,
  configuration: bindingConfiguration,
  connection: connectionSchema,
  boundAt: timestamp,
  testing: z.boolean().optional(),
  last: z.strictObject({ descriptor: z.unknown(), snapshot: z.unknown(), observedAt: timestamp }).optional(),
});
const storeRecordSchema = z.strictObject({
  version: z.literal(1),
  migrated: z
    .strictObject({
      at: timestamp,
      journals: count,
      machines: count,
      droppedRequests: count,
      droppedEffects: count,
    })
    .optional(),
});
const preparationRecordSchema = z.strictObject({
  version: recordVersion,
  prepared: z.unknown().transform((value) => parseMachinePreparedJob(value)),
  providerId: identity,
  configuration: boundedJson('NODE_MACHINE_PREPARATION_CONFIGURATION', 20, 2048),
  providerData: boundedJson('NODE_MACHINE_PROVIDER_PREPARATION', 12, 1024),
});
// The legacy journal's records, read only to migrate them; fields a migration ignores may be anything.
const legacyBindingSchema = z.object({
  type: z.literal('machine-binding-committed'),
  workspaceId: identity,
  machineId: identity,
  providerId: identity,
  physicalId: identity,
  candidate: candidateSchema,
  configuration: bindingConfiguration,
  connection: connectionSchema,
});
const legacyRemovalSchema = z.object({
  type: z.enum(['machine-binding-removed', 'machine-directory-removed']),
  workspaceId: identity,
  machineId: identity,
});
const legacyEntrySchema = z.object({
  type: z.literal('machine-directory-upserted'),
  workspaceId: identity,
  entry: z.object({ machineId: identity, providerId: identity, descriptor: z.unknown(), snapshot: z.unknown() }),
});
const legacyRequestSchema = z.object({
  type: z.literal('machine-print-request'),
  workspaceId: identity,
  request: z.object({ requestId: identity, state: identity }),
});
const legacyEffectSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('machine-effect-intent'), operationId: identity }),
  z.object({ type: z.literal('machine-effect-sending'), operationId: identity }),
  z.object({
    type: z.literal('machine-effect-result'),
    operationId: identity,
    receipt: z.object({ status: identity }),
  }),
]);

/** A printer's last-known identity and report, shown stale after a restart until it reports again. @internal */
export type MachineLastKnown = Readonly<{
  descriptor: MachineDescriptor;
  snapshot: MachineSnapshot;
  /** When the host recorded it. */
  observedAt: string;
}>;

/** The binding one `machine.json` holds; the host is its only writer. @internal */
export type MachineBindingRecord = Readonly<{
  version: 2;
  /** The directory name and machine id: a slug of the name, fixed when the machine is bound. */
  id: string;
  /** The display name the person gave the printer. */
  name: string;
  providerId: string;
  /** With `providerId`, the printer's identity; a directory name never is. */
  physicalId: string;
  candidate: MachineCandidate;
  configuration: CacheValue;
  /** A credential reference and the approved per-service trust, never a secret. */
  connection: Readonly<{ secretRef: string; serviceTrust: Readonly<Record<string, MachineTransportTrust>> }>;
  boundAt: string;
  /** A person let controls not yet qualified on this machine be tried. */
  testing?: boolean;
  last?: MachineLastKnown;
}>;

/** What a new machine's `machine.json` holds before the store assigns its id. @internal */
export type NewMachineBindingRecord = Omit<MachineBindingRecord, 'version' | 'id'>;

/** One preparation's provider data, kept until it expires for the upload and start it allows. @internal */
export type MachinePreparationRecord = Readonly<{
  version: 2;
  prepared: MachinePreparedJob;
  providerId: string;
  configuration: CacheValue;
  providerData: CacheValue;
}>;

/** A machine's operations log as the store found it: open, or unreadable, which leaves the machine unavailable. @internal */
export type MachineOperationsState<Event> =
  | Readonly<{ status: 'open'; log: MachineEventLog<Event> }>
  | Readonly<{ status: 'corrupt'; error: Error }>;

/** One machine the store found at open. @internal */
export type LoadedMachine<Event> = Readonly<{
  record: MachineBindingRecord;
  preparations: readonly MachinePreparationRecord[];
  jobs: readonly MachineJob[];
  operations: MachineOperationsState<Event>;
}>;

/** Input for {@link openNodeMachineStore}. @internal */
export type OpenNodeMachineStoreInput<Event> = Readonly<{
  /** The store root; created `0700` when missing. */
  storeRoot: string;
  /** Older store roots whose legacy journal the first open imports, read-only. */
  legacyStoreRoots: readonly string[];
  /** Parse one operations-log event; the log refuses anything else. */
  parseOperation(candidate: unknown): Event;
  now(): string;
  onError(error: unknown): void;
}>;

/** The opened store: what it found, and the writes the host makes. @internal */
export type NodeMachineStore<Event> = Readonly<{
  /** The machines found at open, in id order. */
  machines: ReadonlyArray<LoadedMachine<Event>>;
  /** Give a new machine the first free id its name suggests, write its `machine.json` and open its log. */
  createMachine(
    record: NewMachineBindingRecord,
  ): Promise<Readonly<{ record: MachineBindingRecord; log: MachineEventLog<Event> }>>;
  /** Undo a {@link NodeMachineStore.createMachine} whose binding did not complete. */
  discardMachine(id: string): Promise<void>;
  /** Replace one machine's `machine.json`. */
  writeMachine(record: MachineBindingRecord): Promise<MachineBindingRecord>;
  /** Move one machine's directory aside as `<id>.removed-<epochMs>`; its files are kept and never read again. */
  removeMachine(id: string): Promise<void>;
  writePreparation(record: MachinePreparationRecord): Promise<MachinePreparationRecord>;
  writeJob(job: MachineJob): Promise<MachineJob>;
  /** Close every operations log and release the lock. */
  close(): Promise<void>;
}>;

const freeze = <Value>(value: Value): Value => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      freeze(child);
    }
    Object.freeze(value);
  }
  return value;
};

const hasCode = (error: unknown, code: string): boolean =>
  error !== null && typeof error === 'object' && 'code' in error && error.code === code;

const invalidRecord = (path: string, cause: unknown): Error =>
  new Error('MACHINE_STORE_RECORD_INVALID', { cause: { path, error: cause } });

/**
 * The machine id a display name suggests: lower-case letters, digits and hyphens, 1–63 characters, starting with a
 * letter or digit; `machine` when nothing is left.
 * @internal
 * @param name - The person's text for the printer.
 * @returns The id the text reads as, before any collision suffix.
 */
export const machineSlug = (name: string): string => {
  const slug = name
    .normalize('NFKD')
    .replaceAll(/\p{M}/gu, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, '-')
    .replaceAll(/^-+|-+$/gu, '')
    .slice(0, 63)
    .replace(/-+$/u, '');
  return slug.length === 0 ? 'machine' : slug;
};

/**
 * The `attempt`th id for a slug: the slug itself, then `-2`, `-3` and so on, within 63 characters.
 * @internal
 * @param slug - A {@link machineSlug}.
 * @param attempt - 1 for the slug itself.
 * @returns The id to try on that attempt.
 */
export const machineIdCandidate = (slug: string, attempt: number): string => {
  if (attempt === 1) {
    return slug;
  }
  const suffix = `-${attempt}`;
  return `${slug.slice(0, 63 - suffix.length).replace(/-+$/u, '')}${suffix}`;
};

/**
 * The file an id is stored in: the id itself when it is lower-case letters, digits, `_` and `-` (and does not start
 * with `sha256-`), otherwise `sha256-` and the first 32 hex digits of its SHA-256. The full id stays inside the file.
 * @internal
 * @param id - A request or preparation id.
 * @returns The file name, with `.json`.
 */
export const machineStoreFileName = (id: string): string =>
  `${safeFileId.test(id) ? id : `sha256-${createHash('sha256').update(id).digest('hex').slice(0, 32)}`}.json`;

/**
 * A display name as the store keeps it: trimmed, and cut to 128 UTF-16 units without splitting a character.
 * @internal
 * @param text - The person's text.
 * @returns The name; empty when nothing but spaces was given.
 */
export const machineDisplayName = (text: string): string => {
  let name = '';
  for (const character of text.trim()) {
    if (name.length + character.length > maximumNameLength) {
      break;
    }
    name += character;
  }
  return name.trimEnd();
};

/**
 * Parse one `machine.json` strictly, including its last-known descriptor and snapshot.
 * @internal
 * @param value - Untrusted record value.
 * @returns The frozen record.
 */
export const parseMachineBindingRecord = (value: unknown): MachineBindingRecord => {
  const { last, ...record } = machineRecordSchema.parse(value);
  if (last === undefined) {
    return freeze(record);
  }
  let entry;
  try {
    entry = parseMachineDirectoryEntry({
      machineId: record.id,
      name: record.name,
      providerId: record.providerId,
      descriptor: last.descriptor,
      snapshot: last.snapshot,
      freshness: 'stale',
    });
  } catch {
    // A last-known identity an older host wrote in another shape is a cache: dropped, never the binding.
    return freeze(record);
  }
  return freeze({
    ...record,
    last: { descriptor: entry.descriptor, snapshot: entry.snapshot, observedAt: last.observedAt },
  });
};

const syncDirectory = async (path: string): Promise<void> => {
  // oxlint-disable-next-line eslint/no-bitwise -- POSIX open flags are bit masks.
  const directory = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
};

// Read one bounded JSON record, refusing a link, a non-file, invalid UTF-8 or more than 1 MiB. The open never blocks,
// so a FIFO is refused as a non-file, and exactly the size the open file reports is read.
const readJsonFile = async (path: string): Promise<unknown> => {
  // oxlint-disable-next-line eslint/no-bitwise -- POSIX open flags are bit masks.
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stats = await file.stat();
    if (!stats.isFile() || stats.size > maximumRecordBytes) {
      throw new Error('MACHINE_STORE_RECORD_LIMIT');
    }
    const bytes = new Uint8Array(stats.size);
    for (let offset = 0; offset < bytes.byteLength; ) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- a short read continues where it stopped.
      const { bytesRead } = await file.read(bytes, offset, bytes.byteLength - offset, offset);
      if (bytesRead === 0) {
        throw new Error('MACHINE_STORE_RECORD_SHORT_READ');
      }
      offset += bytesRead;
    }
    return JSON.parse(decoder.decode(bytes));
  } finally {
    await file.close();
  }
};

// Replace one record: write a 0600 temporary file, sync it, rename it over the record, then sync the directory.
const replaceJsonFile = async (owner: MachineEventLogOwner, path: string, value: unknown): Promise<void> => {
  const bytes = encoder.encode(`${JSON.stringify(value, undefined, 2)}\n`);
  if (bytes.byteLength > maximumRecordBytes) {
    throw new Error('MACHINE_STORE_RECORD_LIMIT');
  }
  const directory = dirname(path);
  const temporary = join(directory, `.${basename(path)}.${randomUUID()}.tmp`);
  await owner.assertCurrent();
  const file = await open(
    temporary,
    // oxlint-disable-next-line eslint/no-bitwise -- POSIX open flags are bit masks.
    constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW | constants.O_WRONLY,
    0o600,
  );
  try {
    try {
      await file.writeFile(bytes);
      await file.sync();
    } finally {
      await file.close();
    }
    await owner.assertCurrent();
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
  await syncDirectory(directory);
};

// Delete the temporary files a crash left in one directory: none was renamed into place, so nothing refers to it. One
// that cannot be deleted stays, and the directory reads as not empty.
const removeTemporaryFiles = async (owner: MachineEventLogOwner, directory: string): Promise<void> => {
  const names = await readdir(directory);
  for (const name of names.filter((entry) => temporaryFilePattern.test(entry))) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- one leftover at a time, under the lock.
    await owner.assertCurrent();
    // oxlint-disable-next-line eslint/no-await-in-loop -- one leftover at a time, under the lock.
    await unlink(join(directory, name)).catch(() => undefined);
  }
};

// Create a 0700 directory and sync its parent; one that exists must be a real directory, never a link.
const ensureDirectory = async (path: string, parent: string): Promise<void> => {
  try {
    await mkdir(path, { mode: 0o700 });
  } catch (error) {
    if (!hasCode(error, 'EEXIST')) {
      throw error;
    }
    const existing = await lstat(path);
    if (!existing.isDirectory()) {
      throw new Error('MACHINE_STORE_NOT_A_DIRECTORY', { cause: { path } });
    }
    return;
  }
  await syncDirectory(parent);
};

// The record files in one folder, in name order; a missing folder has none, and a link is refused.
const listJsonFiles = async (folder: string): Promise<readonly string[]> => {
  try {
    const found = await lstat(folder);
    if (!found.isDirectory()) {
      throw new Error('MACHINE_STORE_NOT_A_DIRECTORY', { cause: { path: folder } });
    }
  } catch (error) {
    if (hasCode(error, 'ENOENT')) {
      return [];
    }
    throw error;
  }
  const names = await readdir(folder);
  return names
    .filter((name) => name.endsWith('.json') && !name.startsWith('.'))
    .toSorted((left, right) => left.localeCompare(right));
};

type LegacyBinding = z.infer<typeof legacyBindingSchema>;
type MigratedBinding = Readonly<{
  binding: LegacyBinding;
  last?: Readonly<{ descriptor: unknown; snapshot: unknown }>;
}>;
type MigrationFold = {
  bindings: MigratedBinding[];
  requests: Map<string, string>;
  effects: Map<string, string>;
};

// One legacy record read as `schema`, or `undefined` for a record of another kind or shape: a transform that throws
// on it counts as another shape.
const readLegacy = <Schema extends z.ZodType>(schema: Schema, event: unknown): z.output<Schema> | undefined => {
  try {
    const result = schema.safeParse(event);
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
};

// Fold one legacy journal's valid prefix: its live bindings in commit order, each with the directory's last entry
// for it, and the latest state of every request and effect.
const foldLegacyJournal = (events: readonly unknown[], fold: MigrationFold): void => {
  const bindings = new Map<string, LegacyBinding>();
  const entries = new Map<string, Readonly<{ providerId: string; descriptor: unknown; snapshot: unknown }>>();
  const scoped = (workspaceId: string, id: string): string => JSON.stringify([workspaceId, id]);
  for (const event of events) {
    const binding = readLegacy(legacyBindingSchema, event);
    if (binding) {
      const key = scoped(binding.workspaceId, binding.machineId);
      bindings.delete(key);
      bindings.set(key, binding);
      continue;
    }
    const removal = readLegacy(legacyRemovalSchema, event);
    if (removal) {
      const key = scoped(removal.workspaceId, removal.machineId);
      if (removal.type === 'machine-binding-removed') {
        bindings.delete(key);
      } else {
        entries.delete(key);
      }
      continue;
    }
    const entry = readLegacy(legacyEntrySchema, event);
    if (entry) {
      entries.set(scoped(entry.workspaceId, entry.entry.machineId), entry.entry);
      continue;
    }
    const request = readLegacy(legacyRequestSchema, event);
    if (request) {
      fold.requests.set(scoped(request.workspaceId, request.request.requestId), request.request.state);
      continue;
    }
    const effect = readLegacy(legacyEffectSchema, event);
    if (effect) {
      fold.effects.set(
        effect.operationId,
        effect.type === 'machine-effect-intent'
          ? 'planned'
          : effect.type === 'machine-effect-sending'
            ? 'sending'
            : effect.receipt.status,
      );
    }
  }
  for (const [key, binding] of bindings) {
    const entry = entries.get(key);
    const known =
      entry?.providerId === binding.providerId &&
      entry.descriptor !== null &&
      typeof entry.descriptor === 'object' &&
      Reflect.get(entry.descriptor, 'id') === binding.physicalId;
    fold.bindings.push(
      known ? { binding, last: { descriptor: entry.descriptor, snapshot: entry.snapshot } } : { binding },
    );
  }
};

// Claim a directory for one migrated binding: a new one, or one a crash left empty, to write; or keep, unwritten, the
// valid record an interrupted migration already wrote there for the same printer.
const claimMigrationDirectory = async (
  owner: MachineEventLogOwner,
  directory: string,
  binding: LegacyBinding,
): Promise<'claimed' | 'kept' | 'taken'> => {
  try {
    await mkdir(directory, { mode: 0o700 });
    return 'claimed';
  } catch (error) {
    if (!hasCode(error, 'EEXIST')) {
      throw error;
    }
  }
  const found = await lstat(directory);
  if (!found.isDirectory()) {
    return 'taken';
  }
  await removeTemporaryFiles(owner, directory);
  try {
    const existing = parseMachineBindingRecord(await readJsonFile(join(directory, machineFileName)));
    return existing.id === basename(directory) &&
      existing.providerId === binding.providerId &&
      existing.physicalId === binding.physicalId
      ? 'kept'
      : 'taken';
  } catch (error) {
    if (!hasCode(error, 'ENOENT')) {
      return 'taken';
    }
    const contents = await readdir(directory);
    return contents.length === 0 ? 'claimed' : 'taken';
  }
};

type MigrationInput = Readonly<{
  root: string;
  legacyStoreRoots: readonly string[];
  owner: MachineEventLogOwner;
  now(): string;
  onError(error: unknown): void;
}>;

// The legacy journals under the given roots, in order, each once however many roots reach it. Only the folder is
// resolved: the journal itself is opened without following a link.
const findLegacyJournals = async (roots: readonly string[]): Promise<string[]> => {
  const journals: string[] = [];
  for (const root of roots) {
    let path: string;
    try {
      // oxlint-disable-next-line eslint/no-await-in-loop -- journals are read in the order given.
      path = join(await realpath(join(root, authorityDirectoryName)), legacyJournalName);
      // A missing journal is skipped here; a link is found, and refused when it is read.
      // oxlint-disable-next-line eslint/no-await-in-loop -- journals are read in the order given.
      await lstat(path);
    } catch (error) {
      if (hasCode(error, 'ENOENT')) {
        continue;
      }
      throw error;
    }
    if (!journals.includes(path)) {
      journals.push(path);
    }
  }
  return journals;
};

/**
 * Import the legacy journals once: bindings from every scope, the latest per physical printer, each written as a
 * machine directory. Requests and effects are not imported; unfinished ones are only counted, as is a journal whose
 * bad frame hid the records after it. A rerun after a crash claims the same directories and keeps each machine it
 * already wrote. Legacy files are never written, and one reached through a link is refused.
 *
 * @param input - The new store root, the legacy roots, the writer lock, clock and error sink.
 * @returns The migration counts for `store.json`, or `undefined` when no legacy journal exists.
 */
const migrateLegacyJournals = async (input: MigrationInput): Promise<z.infer<typeof storeRecordSchema>['migrated']> => {
  const journals = await findLegacyJournals([input.root, ...input.legacyStoreRoots]);
  if (journals.length === 0) {
    return undefined;
  }
  const fold: MigrationFold = { bindings: [], requests: new Map(), effects: new Map() };
  let readJournals = 0;
  let droppedJournals = 0;
  for (const journal of journals) {
    let read: Awaited<ReturnType<typeof readMachineEventLogPrefix>>;
    try {
      // oxlint-disable-next-line eslint/no-await-in-loop -- journals fold in the order given.
      read = await readMachineEventLogPrefix(journal);
    } catch (error) {
      // A journal reached through a link (`ELOOP`) is refused, and reported, like any record the store will not read.
      if (!hasCode(error, 'ELOOP')) {
        throw error;
      }
      input.onError(invalidRecord(`${authorityDirectoryName}/${legacyJournalName}`, error));
      continue;
    }
    foldLegacyJournal(read.events, fold);
    readJournals += 1;
    // A bad frame before the end drops every record after it.
    droppedJournals += read.complete ? 0 : 1;
  }
  // The latest binding of each physical printer wins: the most recently discovered candidate, then the later record.
  const latest = new Map<string, MigratedBinding>();
  for (const migrated of fold.bindings) {
    const key = JSON.stringify([migrated.binding.providerId, migrated.binding.physicalId]);
    const current = latest.get(key);
    if (
      current === undefined ||
      Date.parse(migrated.binding.candidate.observedAt) >= Date.parse(current.binding.candidate.observedAt)
    ) {
      latest.set(key, migrated);
    }
  }
  const taken = new Set<string>();
  for (const { binding, last } of latest.values()) {
    const name = machineDisplayName(binding.machineId) || 'Printer';
    const base = {
      version: 2,
      name,
      providerId: binding.providerId,
      physicalId: binding.physicalId,
      candidate: binding.candidate,
      configuration: binding.configuration,
      connection: binding.connection,
      boundAt: binding.candidate.observedAt,
    } as const;
    const slug = machineSlug(name);
    for (let attempt = 1; ; attempt += 1) {
      if (attempt > maximumIdAttempts) {
        throw new Error('MACHINE_STORE_ID_EXHAUSTED');
      }
      const id = machineIdCandidate(slug, attempt);
      if (reservedIds.has(id) || taken.has(id)) {
        continue;
      }
      const directory = join(input.root, id);
      // oxlint-disable-next-line eslint/no-await-in-loop -- ids are claimed one at a time.
      const claim = await claimMigrationDirectory(input.owner, directory, binding);
      if (claim === 'taken') {
        continue;
      }
      if (claim === 'claimed') {
        let record: MachineBindingRecord;
        try {
          record = parseMachineBindingRecord({
            ...base,
            id,
            ...(last === undefined ? {} : { last: { ...last, observedAt: input.now() } }),
          });
        } catch {
          // A last-known entry an older build wrote in another shape is left behind; the printer reports again.
          record = parseMachineBindingRecord({ ...base, id });
        }
        // oxlint-disable-next-line eslint/no-await-in-loop -- each machine is written before the next is claimed.
        await replaceJsonFile(input.owner, join(directory, machineFileName), record);
      }
      taken.add(id);
      break;
    }
  }
  const droppedRequests = [...fold.requests.values()].filter((state) => !terminalRequestStates.has(state)).length;
  const droppedEffects = [...fold.effects.values()].filter(
    (status) => status === 'sending' || status === 'unknown',
  ).length;
  if (droppedRequests > 0 || droppedEffects > 0 || droppedJournals > 0) {
    input.onError(
      new Error('MACHINE_STORE_MIGRATION_DROPPED', {
        cause: { requests: droppedRequests, effects: droppedEffects, journals: droppedJournals },
      }),
    );
  }
  return { at: input.now(), journals: readJournals, machines: taken.size, droppedRequests, droppedEffects };
};

/**
 * Take the store's writer lock, migrate the legacy journals when `store.json` is absent, and read every machine.
 *
 * Expired preparations are deleted. A machine whose `machine.json` the strict reader refuses is left out and reported;
 * one whose operations log is unreadable is returned with that error, so only it becomes unavailable.
 *
 * @internal
 * @param input - Store root, legacy roots, the operations-event parser, clock and error sink.
 * @returns The opened store.
 * @throws `AUTHORITY_ALREADY_OWNED` from the lock when another host owns the store, or `MACHINE_STORE_RECORD_INVALID`
 * when `store.json` is unreadable or from a newer store version.
 */
export const openNodeMachineStore = async <Event extends CacheValue>(
  input: OpenNodeMachineStoreInput<Event>,
): Promise<NodeMachineStore<Event>> => {
  const report = (error: unknown): void => {
    try {
      input.onError(error);
    } catch {
      /* Diagnostics cannot own the store. */
    }
  };
  await mkdir(input.storeRoot, { recursive: true, mode: 0o700 });
  const root = await realpath(input.storeRoot);
  await ensureDirectory(join(root, authorityDirectoryName), root);
  const owner = await acquireNodeAuthorityWriter({ authorityRoot: join(root, authorityDirectoryName) });
  const logs = new Map<string, MachineEventLog<Event>>();
  /** Machines this host may write to: those it read or created, until they are removed. */
  const live = new Set<string>();
  /** Record files the strict reader refused; nothing is ever written over them. */
  const refused = new Set<string>();
  const openOperations = async (id: string): Promise<MachineOperationsState<Event>> => {
    try {
      const log = await createNodeMachineEventLog({
        directory: join(root, id),
        fileName: operationsFileName,
        owner,
        parse: input.parseOperation,
      });
      logs.set(id, log);
      return { status: 'open', log };
    } catch (error) {
      return { status: 'corrupt', error: new Error('MACHINE_OPERATIONS_LOG_CORRUPT', { cause: error }) };
    }
  };
  const closeLogs = async (): Promise<void> => {
    const opened = [...logs.values()];
    logs.clear();
    await Promise.allSettled(opened.map(async (log) => log.close()));
  };
  // Read one folder's records with `read`; a refused file is reported and never written.
  const readRecords = async <Value>(
    id: string,
    folderName: string,
    read: (value: unknown, fileName: string) => Value,
  ): Promise<Array<Readonly<{ path: string; record: Value }>>> => {
    const folder = join(root, id, folderName);
    let names: readonly string[];
    try {
      names = await listJsonFiles(folder);
    } catch (error) {
      report(invalidRecord(`${id}/${folderName}`, error));
      return [];
    }
    const records: Array<Readonly<{ path: string; record: Value }>> = [];
    for (const name of names) {
      const path = join(folder, name);
      try {
        // oxlint-disable-next-line eslint/no-await-in-loop -- one record at a time.
        records.push({ path, record: read(await readJsonFile(path), name) });
      } catch (error) {
        refused.add(path);
        report(invalidRecord(`${id}/${folderName}/${name}`, error));
      }
    }
    return records;
  };
  const machines: Array<LoadedMachine<Event>> = [];
  try {
    let store: z.infer<typeof storeRecordSchema> | undefined;
    try {
      store = storeRecordSchema.parse(await readJsonFile(join(root, storeFileName)));
    } catch (error) {
      if (!hasCode(error, 'ENOENT')) {
        throw invalidRecord(storeFileName, error);
      }
    }
    if (store === undefined) {
      const migrated = await migrateLegacyJournals({
        root,
        legacyStoreRoots: input.legacyStoreRoots,
        owner,
        now: input.now,
        onError: report,
      });
      await replaceJsonFile(owner, join(root, storeFileName), { version: 1, ...(migrated ? { migrated } : {}) });
    }
    const jobIds = new Set<string>();
    const openedAt = Date.parse(input.now());
    const rootEntries = await readdir(root, { withFileTypes: true });
    const directories = rootEntries
      .filter((entry) => entry.isDirectory() && slugPattern.test(entry.name) && !reservedIds.has(entry.name))
      .map((entry) => entry.name)
      .toSorted((left, right) => left.localeCompare(right));
    for (const id of directories) {
      const directory = join(root, id);
      // oxlint-disable-next-line eslint/no-await-in-loop -- machines load in id order.
      await removeTemporaryFiles(owner, directory);
      let record: MachineBindingRecord;
      try {
        // oxlint-disable-next-line eslint/no-await-in-loop -- machines load in id order.
        record = parseMachineBindingRecord(await readJsonFile(join(directory, machineFileName)));
        if (record.id !== id) {
          throw new Error('MACHINE_STORE_ID_MISMATCH');
        }
      } catch (error) {
        // An empty directory is a binding a crash interrupted before its first write: it is released, not reported.
        const released =
          hasCode(error, 'ENOENT') &&
          // oxlint-disable-next-line eslint/no-await-in-loop -- machines load in id order.
          (await rmdir(directory).then(
            () => true,
            () => false,
          ));
        if (!released) {
          report(invalidRecord(`${id}/${machineFileName}`, error));
        }
        continue;
      }
      // oxlint-disable-next-line eslint/no-await-in-loop -- machines load in id order.
      const found = await readRecords(id, preparationsDirectoryName, (value, name) => {
        const preparation = freeze(preparationRecordSchema.parse(value));
        if (machineStoreFileName(preparation.prepared.preparedId) !== name || preparation.prepared.machineId !== id) {
          throw new Error('MACHINE_STORE_ID_MISMATCH');
        }
        return preparation;
      });
      const preparations: MachinePreparationRecord[] = [];
      for (const { path, record: preparation } of found) {
        if (Date.parse(preparation.prepared.expiresAt) > openedAt) {
          preparations.push(preparation);
          continue;
        }
        // oxlint-disable-next-line eslint/no-await-in-loop -- expired preparations are deleted one at a time.
        await owner.assertCurrent();
        // oxlint-disable-next-line eslint/no-await-in-loop -- expired preparations are deleted one at a time.
        await unlink(path);
      }
      if (preparations.length < found.length) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- machines load in id order.
        await syncDirectory(join(directory, preparationsDirectoryName));
      }
      // oxlint-disable-next-line eslint/no-await-in-loop -- machines load in id order.
      const jobs = await readRecords(id, jobsDirectoryName, (value, name) => {
        const job = parseMachineJob(value);
        if (machineStoreFileName(job.jobId) !== name || job.machineId !== id || jobIds.has(job.jobId)) {
          throw new Error('MACHINE_STORE_ID_MISMATCH');
        }
        jobIds.add(job.jobId);
        return job;
      });
      live.add(id);
      // oxlint-disable-next-line eslint/no-await-in-loop -- machines load in id order.
      const operations = await openOperations(id);
      machines.push(
        Object.freeze({
          record,
          preparations: Object.freeze(preparations),
          jobs: Object.freeze(jobs.map(({ record: job }) => job)),
          operations,
        }),
      );
    }
  } catch (error) {
    await closeLogs();
    await owner.release().catch(() => undefined);
    throw error;
  }
  const assertLive = (id: string): string => {
    if (!live.has(id)) {
      throw new Error('MACHINE_STORE_UNKNOWN_MACHINE');
    }
    return join(root, id);
  };
  const writeRecord = async ({
    id,
    folderName,
    fileName,
    value,
  }: Readonly<{ id: string; folderName: string; fileName: string; value: unknown }>): Promise<void> => {
    const directory = assertLive(id);
    const folder = join(directory, folderName);
    if (refused.has(join(folder, fileName))) {
      throw invalidRecord(`${id}/${folderName}/${fileName}`, new Error('MACHINE_STORE_RECORD_PRESERVED'));
    }
    await ensureDirectory(folder, directory);
    await replaceJsonFile(owner, join(folder, fileName), value);
  };
  return Object.freeze({
    machines: Object.freeze(machines),
    async createMachine(candidate) {
      const slug = machineSlug(candidate.name);
      const checked = parseMachineBindingRecord({ ...candidate, version: 2, id: slug });
      for (let attempt = 1; ; attempt += 1) {
        if (attempt > maximumIdAttempts) {
          throw new Error('MACHINE_STORE_ID_EXHAUSTED');
        }
        const id = machineIdCandidate(slug, attempt);
        if (reservedIds.has(id)) {
          continue;
        }
        const directory = join(root, id);
        // oxlint-disable-next-line eslint/no-await-in-loop -- ids are probed one at a time.
        await owner.assertCurrent();
        try {
          // oxlint-disable-next-line eslint/no-await-in-loop -- ids are probed one at a time.
          await mkdir(directory, { mode: 0o700 });
        } catch (error) {
          if (hasCode(error, 'EEXIST')) {
            continue;
          }
          throw error;
        }
        const record = freeze({ ...checked, id });
        try {
          // oxlint-disable-next-line eslint/no-await-in-loop -- the claimed id is written before returning.
          await syncDirectory(root);
          // oxlint-disable-next-line eslint/no-await-in-loop -- the claimed id is written before returning.
          await replaceJsonFile(owner, join(directory, machineFileName), record);
          live.add(id);
          // oxlint-disable-next-line eslint/no-await-in-loop -- the claimed id is written before returning.
          const operations = await openOperations(id);
          if (operations.status === 'corrupt') {
            throw operations.error;
          }
          return Object.freeze({ record, log: operations.log });
        } catch (error) {
          live.delete(id);
          // oxlint-disable-next-line eslint/no-await-in-loop -- a failed claim is released before throwing.
          await rm(directory, { recursive: true, force: true }).catch(report);
          throw error;
        }
      }
    },
    async discardMachine(id) {
      const directory = assertLive(id);
      live.delete(id);
      await logs.get(id)?.close();
      logs.delete(id);
      await owner.assertCurrent();
      await rm(directory, { recursive: true, force: true });
      await syncDirectory(root);
    },
    async writeMachine(record) {
      const checked = parseMachineBindingRecord(record);
      await replaceJsonFile(owner, join(assertLive(checked.id), machineFileName), checked);
      return checked;
    },
    async removeMachine(id) {
      const directory = assertLive(id);
      const removedAt = Date.parse(input.now());
      const base = `${id}.removed-${Number.isFinite(removedAt) ? removedAt : Date.now()}`;
      await logs.get(id)?.close();
      logs.delete(id);
      for (let attempt = 1; ; attempt += 1) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- one rename at a time.
        await owner.assertCurrent();
        try {
          // A removal in the same millisecond as an earlier one of the same id takes the next free suffix.
          // oxlint-disable-next-line eslint/no-await-in-loop -- one rename at a time.
          await rename(directory, join(root, attempt === 1 ? base : `${base}-${attempt}`));
          break;
        } catch (error) {
          if (attempt >= maximumIdAttempts || !(hasCode(error, 'ENOTEMPTY') || hasCode(error, 'EEXIST'))) {
            throw error;
          }
        }
      }
      live.delete(id);
      await syncDirectory(root);
    },
    async writePreparation(record) {
      const checked = freeze(preparationRecordSchema.parse(record));
      await writeRecord({
        id: checked.prepared.machineId,
        folderName: preparationsDirectoryName,
        fileName: machineStoreFileName(checked.prepared.preparedId),
        value: checked,
      });
      return checked;
    },
    async writeJob(job) {
      const checked = parseMachineJob(job);
      await writeRecord({
        id: checked.machineId,
        folderName: jobsDirectoryName,
        fileName: machineStoreFileName(checked.jobId),
        value: checked,
      });
      return checked;
    },
    async close() {
      await closeLogs();
      await owner.release();
    },
  });
};
