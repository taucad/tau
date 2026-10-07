/* oxlint-disable no-await-in-loop -- Streaming reads and checked conflict rebases are necessarily sequential. */
/* oxlint-disable promise/prefer-await-to-then -- The owner installs queue/finalization promises synchronously before another caller can enter. */
/* oxlint-disable typescript/no-restricted-types -- Null denotes observed absence in checked-write preconditions; undefined denotes an unread cache. */
import { cloneBoundedJson } from '@taucad/parameters/json';
import { Topic } from '@taucad/events';
import type { RootedFileSystem } from '@taucad/filesystem';
import type { ComposedView } from '@taucad/filesystem/composed-view';
import type { CacheValue } from '@taucad/cache-core';
import { canonicalizeCacheValue } from '@taucad/cache-core';
import {
  machineSettingsPath,
  machineSettingsMaximumBytes,
  readMachineSettings,
  serializeMachineSettings,
  readMachineConfiguration,
} from '#machines/settings.js';
import type { MachineSettingsRecord, MachineTypeId, SettingsDefinition, SettingsSchema } from '#machines/settings.js';

import type { MachineSettingsSnapshot, MachineSettingsEdit, MachineSettingsSave } from '@taucad/types';

type SettingsFileSystem = Pick<RootedFileSystem, 'readFileStream' | 'writeFileChecked'> & Pick<ComposedView, 'watch'>;

type Entry = {
  typeId: MachineTypeId;
  snapshot?: MachineSettingsSnapshot;
  bytes?: Uint8Array<ArrayBuffer> | null;
  dirty: boolean;
  epoch: number;
  reading?: Promise<MachineSettingsSnapshot>;
  watchReady: Promise<void>;
  watchFailure?: Error;
  unwatch: () => void;
  topic: Topic<MachineSettingsSnapshot>;
  observers: number;
  pending: number;
  queue: Promise<void>;
  uncertain: boolean;
};
type Change = Readonly<{
  path: readonly string[];
  before: unknown;
  after: unknown;
}>;
const equal = (left: unknown, right: unknown): boolean =>
  left === right ||
  (left !== undefined &&
    right !== undefined &&
    canonicalizeCacheValue({ value: left as CacheValue }) === canonicalizeCacheValue({ value: right as CacheValue }));
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const changes = (base: unknown, next: unknown, path: readonly string[] = []): Change[] => {
  if (equal(base, next)) {
    return [];
  }
  if (object(base) && object(next)) {
    return [...new Set([...Object.keys(base), ...Object.keys(next)])].flatMap((key) =>
      changes(base[key], next[key], [...path, key]),
    );
  }
  return [{ path, before: base, after: next }];
};
const at = (value: unknown, path: readonly string[]): unknown => {
  for (const key of path) {
    value = object(value) ? value[key] : undefined;
  }
  return value;
};
const apply = (record: MachineSettingsRecord, edits: readonly Change[]): MachineSettingsRecord => {
  const next: Record<string, unknown> = structuredClone(record);
  for (const edit of edits) {
    let parent = next;
    for (const key of edit.path.slice(0, -1)) {
      const child = parent[key];
      if (!object(child)) {
        throw new Error('The edited profile or configuration was removed.');
      }
      parent = child;
    }
    const key = edit.path.at(-1);
    if (key === undefined) {
      throw new Error('A record identity cannot be replaced.');
    }
    if (edit.after === undefined) {
      Reflect.deleteProperty(parent, key);
    } else {
      parent[key] = edit.after;
    }
  }
  // SAFETY: serialization below re-admits this detached transition before storage.
  return next as MachineSettingsRecord;
};
const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));
const missing = (error: unknown): boolean =>
  object(error) && (error['code'] === 'ENOENT' || error['name'] === 'NotFoundError');

/** One bounded domain reader/writer, composed beside an exact rooted authority. @public */
export class MachineSettingsOwner {
  readonly #filesystem: SettingsFileSystem;
  readonly #definitions: ReadonlyArray<SettingsDefinition<SettingsSchema>>;
  readonly #entries = new Map<MachineTypeId, Entry>();
  readonly #operations = new Map<
    string,
    {
      fingerprint: string;
      result: Promise<MachineSettingsSave>;
      pending: boolean;
    }
  >();
  #closed = false;

  public constructor(
    input: Readonly<{
      filesystem: Partial<SettingsFileSystem>;
      definitions: ReadonlyArray<SettingsDefinition<SettingsSchema>>;
    }>,
  ) {
    const { filesystem } = input;
    if (!filesystem.readFileStream || !filesystem.writeFileChecked) {
      throw new Error('Machine settings require bounded streaming reads and checked writes.');
    }
    this.#filesystem = {
      readFileStream: filesystem.readFileStream.bind(filesystem),
      writeFileChecked: filesystem.writeFileChecked.bind(filesystem),
      ...(filesystem.watch ? { watch: filesystem.watch.bind(filesystem) } : {}),
    };
    this.#definitions = input.definitions;
  }

  /** Coalesce cold acquisitions; watch-covered warm reads perform no storage work.
   * @param input - Captured type and caller cancellation.
   * @returns The current admitted record or an explicit refusal.
   */
  public async read({
    typeId,
    signal,
  }: Readonly<{
    typeId: MachineTypeId;
    signal?: AbortSignal;
  }>): Promise<MachineSettingsSnapshot> {
    signal?.throwIfAborted();
    const entry = this.#entry(typeId);
    if (entry.pending > 0) {
      await entry.queue;
    }
    if (!this.#filesystem.watch) {
      entry.dirty = true;
    }
    if (!entry.dirty && entry.snapshot) {
      return entry.snapshot;
    }
    entry.reading ??= this.#acquire(entry).finally(() => {
      entry.reading = undefined;
    });
    const result = await entry.reading;
    signal?.throwIfAborted();
    if (this.#closed) {
      throw new Error('Machine settings authority is closed.');
    }
    return result;
  }

  /** Subscribe before acquiring so no generation can be missed.
   * @param typeId - Captured machine type.
   * @param handler - Stable snapshot listener.
   * @param options - Cancellation of this subscription.
   * @returns Idempotent release of the listener.
   */
  public subscribe(
    typeId: MachineTypeId,
    handler: (snapshot: MachineSettingsSnapshot) => void,
    options?: Readonly<{ signal?: AbortSignal }>,
  ): () => void {
    const entry = this.#entry(typeId);
    entry.observers += 1;
    const unsubscribe = entry.topic.subscribe(handler);
    let active = true;
    const off = (): void => {
      if (active) {
        active = false;
        entry.observers -= 1;
        unsubscribe();
        options?.signal?.removeEventListener('abort', off);
      }
    };
    if (options?.signal?.aborted) {
      off();
    } else {
      options?.signal?.addEventListener('abort', off, { once: true });
    }
    return off;
  }

  /** Commit an idempotent captured transition; same-field conflicts never silently overwrite.
   * @param input - Captured operation, identity and base/next records.
   * @returns Terminal save evidence or an explicit unconfirmed outcome.
   */
  public async edit(input: MachineSettingsEdit): Promise<MachineSettingsSave> {
    // Detach and bound untrusted caller data before any await or queue admission.
    input = cloneBoundedJson(input, {
      code: 'MACHINE_SETTINGS_EDIT',
      maximumDepth: 26,
      maximumNodes: 16_400,
      maximumCharacters: 524_800,
    }) as unknown as MachineSettingsEdit;
    const fingerprint = canonicalizeCacheValue({
      value: input as unknown as CacheValue,
    });
    const existing = this.#operations.get(input.operationId);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new Error('Machine settings operation identity was reused.');
      }
      return existing.result;
    }
    if (!/^[a-zA-Z0-9_-]{1,128}$/u.test(input.operationId)) {
      throw new Error('Invalid settings operation identity.');
    }
    const entry = this.#entry(input.typeId);
    if (entry.pending >= 32 || [...this.#operations.values()].filter((operation) => operation.pending).length >= 64) {
      return {
        status: 'refused',
        message: 'Too many pending machine settings changes.',
      };
    }
    // Admission before enqueue also bounds the transition and rejects unsafe keys.
    serializeMachineSettings({ record: input.next });
    if (input.base) {
      serializeMachineSettings({ record: input.base });
    }
    if (input.next.typeId !== input.typeId || (input.base && input.base.typeId !== input.typeId)) {
      throw new Error('Settings transition changes machine identity.');
    }
    const acquisition = this.read({ typeId: input.typeId });
    const edits = changes(input.base, input.next);
    entry.pending += 1;
    const operation = {
      fingerprint,
      result: Promise.resolve<MachineSettingsSave>({
        status: 'refused',
        message: 'Not started',
      }),
      pending: true,
    };
    const run = entry.queue.then(async () => this.#write(entry, { input, edits, admitted: await acquisition }));
    operation.result = run.finally(() => {
      entry.pending -= 1;
      operation.pending = false;
      if (entry.pending === 0 && entry.dirty && entry.observers > 0) {
        this.read({ typeId: input.typeId }).catch((error: unknown) =>
          this.#publish(entry, {
            status: 'unavailable',
            code: 'SETTINGS_UNAVAILABLE',
            message: errorMessage(error),
          }),
        );
      }
    });
    this.#operations.set(input.operationId, operation);
    entry.queue = operation.result.then(
      () => undefined,
      () => undefined,
    );
    for (const [id, row] of this.#operations) {
      if (this.#operations.size <= 64) {
        break;
      }
      if (!row.pending && id !== input.operationId) {
        this.#operations.delete(id);
      }
    }
    return operation.result;
  }

  /** Await the original operation, never submit a replacement mutation.
   * @param operationId - The captured save operation.
   * @returns Its terminal outcome or an explicit unresolved settlement.
   */
  public async settlement(operationId: string): Promise<MachineSettingsSave> {
    const operation = this.#operations.get(operationId);
    if (!operation) {
      return {
        status: 'uncertain',
        message: 'The original save is no longer available from this authority.',
      };
    }
    return operation.result;
  }

  /** Release exact watches and projections when the root authority closes. */
  public dispose(): void {
    this.#closed = true;
    for (const entry of this.#entries.values()) {
      entry.unwatch();
      entry.topic.dispose();
    }
    this.#entries.clear();
  }

  #entry(typeId: MachineTypeId): Entry {
    machineSettingsPath({ typeId });
    if (this.#closed) {
      throw new Error('Machine settings authority is closed.');
    }
    const existing = this.#entries.get(typeId);
    if (existing) {
      this.#entries.delete(typeId);
      this.#entries.set(typeId, existing);
      return existing;
    }
    this.#evict();
    if (this.#entries.size >= 32) {
      throw new Error('Machine settings reader is at capacity.');
    }
    const entry: Entry = {
      typeId,
      dirty: true,
      epoch: 0,
      watchReady: Promise.resolve(),
      unwatch: () => undefined,
      topic: new Topic({ name: 'MachineSettings' }),
      observers: 0,
      pending: 0,
      queue: Promise.resolve(),
      uncertain: false,
    };
    this.#entries.set(typeId, entry);
    if (this.#filesystem.watch) {
      const watch = this.#filesystem.watch({ paths: [machineSettingsPath({ typeId })] }, () => {
        if (this.#closed || this.#entries.get(typeId) !== entry) {
          return;
        }
        entry.dirty = true;
        entry.epoch += 1;
        if (entry.observers > 0 && entry.pending === 0) {
          this.read({ typeId }).catch((error: unknown) =>
            this.#publish(entry, {
              status: 'unavailable',
              code: 'SETTINGS_UNAVAILABLE',
              message: errorMessage(error),
            }),
          );
        }
      });
      if (typeof watch === 'function') {
        entry.unwatch = watch;
      } else {
        entry.watchReady = watch.then(
          (release) => {
            if (this.#closed || this.#entries.get(typeId) !== entry) {
              release();
            } else {
              entry.unwatch = release;
            }
          },
          (error: unknown) => {
            entry.watchFailure = error instanceof Error ? error : new Error(errorMessage(error));
          },
        );
      }
    }
    return entry;
  }

  #evict(): void {
    let bytes = 0;
    for (const entry of this.#entries.values()) {
      bytes += entry.bytes?.byteLength ?? 0;
    }
    for (const [typeId, entry] of this.#entries) {
      if (this.#entries.size < 32 && bytes <= 8_388_608) {
        break;
      }
      if (entry.observers > 0 || entry.pending > 0 || entry.reading !== undefined || entry.uncertain || entry.dirty) {
        continue;
      }
      entry.unwatch();
      entry.topic.dispose();
      this.#entries.delete(typeId);
      bytes -= entry.bytes?.byteLength ?? 0;
    }
  }

  #publish(entry: Entry, next: MachineSettingsSnapshot): MachineSettingsSnapshot {
    const prior = entry.snapshot;
    if (prior && equal(prior, next)) {
      return prior;
    }
    if (prior?.status === 'current' && next.status === 'current') {
      const profiles = Object.fromEntries(
        Object.entries(next.record.profiles).map(([id, profile]) => {
          const old = prior.record.profiles[id];
          if (!profile || !old) {
            return [id, profile];
          }
          if (equal(old, profile)) {
            return [id, old];
          }
          const configurations = Object.freeze(
            Object.fromEntries(
              Object.entries(profile.configurations).map(([source, block]) => [
                source,
                equal(old.configurations[source], block) ? old.configurations[source] : block,
              ]),
            ),
          );
          return [id, Object.freeze({ ...profile, configurations })];
        }),
      );
      next = Object.freeze({
        ...next,
        record: Object.freeze({
          ...next.record,
          profiles: Object.freeze(profiles),
        }),
      });
    }
    entry.snapshot = next;
    entry.topic.emit(next);
    return next;
  }

  #take(entry: Entry, bytes: Uint8Array<ArrayBuffer> | null): MachineSettingsSnapshot {
    entry.bytes = bytes && bytes.byteLength > machineSettingsMaximumBytes ? undefined : bytes;
    return this.#publish(
      entry,
      bytes === null ? { status: 'absent' } : readMachineSettings({ bytes, typeId: entry.typeId }),
    );
  }

  async #acquire(entry: Entry): Promise<MachineSettingsSnapshot> {
    await entry.watchReady;
    if (entry.watchFailure) {
      throw entry.watchFailure;
    }
    if (this.#entries.get(entry.typeId) !== entry) {
      throw new Error('Machine settings authority is closed.');
    }
    for (;;) {
      const { epoch } = entry;
      let bytes: Uint8Array<ArrayBuffer> | null;
      try {
        const stream = this.#filesystem.readFileStream?.(machineSettingsPath({ typeId: entry.typeId }), {
          length: machineSettingsMaximumBytes + 1,
        });
        if (!stream) {
          throw new Error('Bounded machine settings acquisition is unavailable.');
        }
        const reader = stream.getReader();
        const chunks: Array<Uint8Array<ArrayBuffer>> = [];
        let size = 0;
        try {
          for (;;) {
            const chunk = await reader.read();
            if (chunk.done) {
              break;
            }
            size += chunk.value.byteLength;
            if (size > machineSettingsMaximumBytes + 1) {
              throw new Error('Bounded settings reader exceeded its limit.');
            }
            chunks.push(chunk.value);
          }
        } finally {
          await reader.cancel();
          reader.releaseLock();
        }
        bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
      } catch (error) {
        if (!missing(error)) {
          if (epoch !== entry.epoch) {
            continue;
          }
          entry.dirty = true;
          return this.#publish(entry, {
            status: 'unavailable',
            code: 'SETTINGS_UNAVAILABLE',
            message: errorMessage(error),
          });
        }
        bytes = null;
      }
      if (this.#closed) {
        throw new Error('Machine settings authority is closed.');
      }
      if (epoch !== entry.epoch) {
        continue;
      }
      entry.dirty = false;
      if (entry.bytes !== undefined && equalBytes(entry.bytes, bytes) && entry.snapshot) {
        return entry.snapshot;
      }
      return this.#take(entry, bytes);
    }
  }

  async #write(
    entry: Entry,
    {
      input,
      edits,
      admitted,
    }: Readonly<{ input: MachineSettingsEdit; edits: readonly Change[]; admitted: MachineSettingsSnapshot }>,
  ): Promise<MachineSettingsSave> {
    if (entry.uncertain) {
      return {
        status: 'uncertain',
        message: 'A prior save has no terminal acknowledgement. Further writes are blocked.',
      };
    }
    let current = entry.snapshot ?? admitted;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (this.#closed) {
        return {
          status: 'refused',
          message: 'Machine settings authority is closed.',
        };
      }
      if (current.status !== 'current' && current.status !== 'absent') {
        return { status: 'refused', message: current.message };
      }
      let { next } = input;
      if (input.base === null) {
        if (current.status !== 'absent') {
          return {
            status: 'conflict',
            message: 'Another editor created these profiles.',
            current,
          };
        }
      } else {
        if (current.status !== 'current') {
          return {
            status: 'conflict',
            message: 'These profiles were removed.',
            current,
          };
        }
        for (const edit of edits) {
          const value = at(current.record, edit.path);
          if (!equal(value, edit.before) && !equal(value, edit.after)) {
            return {
              status: 'conflict',
              message: 'Another editor changed the same setting.',
              current,
            };
          }
          if (edit.path[0] === 'profiles' && edit.path.length > 2 && !current.record.profiles[edit.path[1]!]) {
            return {
              status: 'conflict',
              message: 'The edited profile was deleted.',
              current,
            };
          }
        }
        try {
          next = apply(current.record, edits);
        } catch (error) {
          return { status: 'conflict', message: errorMessage(error), current };
        }
      }
      for (const [profileId, profile] of Object.entries(next.profiles)) {
        if (!profile) {
          continue;
        }
        for (const definition of this.#definitions) {
          const sourceId = definition.manifest.source.id;
          if (
            equal(
              current.status === 'current' ? current.record.profiles[profileId]?.configurations[sourceId] : undefined,
              profile.configurations[sourceId],
            )
          ) {
            continue;
          }
          const resolved = await readMachineConfiguration({
            settings: next,
            profileId,
            definition,
          });
          if (resolved.status === 'refused') {
            return { status: 'refused', message: resolved.message };
          }
        }
      }
      let data: string;
      try {
        data = serializeMachineSettings({ record: next });
      } catch (error) {
        return { status: 'refused', message: errorMessage(error) };
      }
      const { epoch } = entry;
      try {
        const result = await this.#filesystem.writeFileChecked({
          path: machineSettingsPath({ typeId: input.typeId }),
          data,
          preconditions: [
            {
              path: machineSettingsPath({ typeId: input.typeId }),
              expected: entry.bytes ?? null,
            },
          ],
        });
        if (result.status === 'conflict') {
          const conflict = result.conflicts.find((row) => row.path === machineSettingsPath({ typeId: input.typeId }));
          if (!conflict) {
            throw new Error('Settings conflict did not contain the checked path.');
          }
          current = this.#take(entry, conflict.actual);
          entry.dirty = false;
          continue;
        }
        current = this.#take(entry, result.content);
        entry.dirty = epoch !== entry.epoch;
        if (current.status !== 'current') {
          return {
            status: 'refused',
            message: 'Checked writer returned invalid settings.',
          };
        }
        return { status: 'saved', record: current.record };
      } catch (error) {
        // A provider may have accepted bytes before its channel failed. Readback cannot prove settlement.
        if (object(error) && error['applicationState'] === 'known-not-applied') {
          return { status: 'refused', message: errorMessage(error) };
        }
        entry.uncertain = true;
        return { status: 'uncertain', message: errorMessage(error) };
      }
    }
    return {
      status: 'conflict',
      message: 'Machine settings kept changing. Review the latest values.',
      current,
    };
  }
}

const equalBytes = (left: Uint8Array<ArrayBuffer> | null, right: Uint8Array<ArrayBuffer> | null): boolean => {
  if (left === right) {
    return true;
  }
  if (left === null || right === null) {
    return false;
  }
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
};
