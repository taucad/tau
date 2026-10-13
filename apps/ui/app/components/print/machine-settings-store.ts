/* oxlint-disable promise/prefer-await-to-then -- Install captured queue promises synchronously so optimistic B cannot overtake A. */
/* oxlint-disable no-await-in-loop -- Refreshes coalesce and acquire one trailing generation at a time. */
import { replaceEqualDeep } from '@tanstack/react-query';
import { Topic } from '@taucad/events';
import type { WatchEvent } from '@taucad/filesystem';
import { ObservationService } from '@taucad/fs-client/observation-service';
import type { ObservationRead, ObservationWatch, ObservationSnapshot } from '@taucad/fs-client/observation-service';
import type {
  MachineSettingsService,
  MachineSettingsSnapshot,
  MachineSettingsSave,
  MachineSettingsRecord,
  MachineTypeId,
  MachineSettingsEdit,
} from '@taucad/types';
import { serializeMachineSettings } from '@taucad/runtime/machine/settings';
import { randomUuid } from '@taucad/utils/id';

export type SettingsProjection = Readonly<{
  file: MachineSettingsSnapshot | Readonly<{ status: 'loading' }>;
  draft?: MachineSettingsRecord;
  starting?: MachineSettingsRecord;
  pending: number;
  observation?: Pick<ObservationSnapshot<never>, 'status' | 'error'>;
  failure?: Readonly<{
    profileId: string;
    operationId: string;
    revision: number;
    result: Exclude<MachineSettingsSave, { status: 'saved' }>;
  }>;
}>;
type Transition = {
  input: MachineSettingsEdit;
  revision: number;
  profileId: string;
};
type Entry = {
  deferred: Transition[];
  state: SettingsProjection;
  revision: number;
  topic: Topic<void>;
  queue: Promise<void>;
  observation: ObservationService<MachineSettingsSnapshot>;
  unsubscribe: () => void;
};
const initial: SettingsProjection = { file: { status: 'loading' }, pending: 0 };
const freeze = <Value>(value: Value): Value => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      freeze(child);
    }
  }
  return value;
};
const emptyRecord = (typeId: MachineTypeId): MachineSettingsRecord => ({
  version: 1,
  typeId,
  activeProfile: 'default',
  profiles: { default: { name: 'Default', configurations: {} } },
});

/** Root-owned projections only: acquisition, parsing and mutation arbitration stay on the worker. */
export class MachineSettingsStore {
  readonly #service: Promise<MachineSettingsService> | (() => Promise<MachineSettingsService>);
  #opened?: Promise<MachineSettingsService>;
  readonly #observe: (typeId: MachineTypeId, onEvent: (event: WatchEvent) => void) => ObservationWatch;
  readonly #disposeService: () => void;
  readonly #entries = new Map<MachineTypeId, Entry>();
  #disposed = false;
  public constructor(
    service: Promise<MachineSettingsService> | (() => Promise<MachineSettingsService>),
    observe: (typeId: MachineTypeId, onEvent: (event: WatchEvent) => void) => ObservationWatch,
    dispose: () => void,
  ) {
    this.#service = service;
    this.#observe = observe;
    this.#disposeService = dispose;
  }
  public get(typeId: MachineTypeId): SettingsProjection {
    return this.#entry(typeId).state;
  }
  public subscribe(typeId: MachineTypeId, handler: () => void): () => void {
    const entry = this.#entry(typeId);
    const off = entry.topic.subscribe(handler);
    const lease = entry.observation.acquire();
    return () => {
      off();
      lease.release();
    };
  }
  public record(typeId: MachineTypeId): MachineSettingsRecord | undefined {
    const { file, draft, starting } = this.get(typeId);
    return (
      draft ??
      (file.status === 'current'
        ? file.record
        : file.status === 'absent'
          ? (starting ?? emptyRecord(typeId))
          : undefined)
    );
  }
  /** Publish virtual qualified starting profiles. Browsing never persists them. */
  public startingProfiles(typeId: MachineTypeId, profiles: MachineSettingsRecord['profiles']): void {
    const entry = this.#entry(typeId);
    if (entry.state.file.status !== 'absent' || entry.state.pending > 0 || entry.state.failure) {
      return;
    }
    const starting: MachineSettingsRecord = {
      version: 1,
      typeId,
      activeProfile: 'default',
      profiles,
    };
    serializeMachineSettings({ record: starting });
    this.#publish(entry, { ...entry.state, starting });
  }
  public async refresh(typeId: MachineTypeId): Promise<void> {
    const entry = this.#entry(typeId);
    const lease = entry.observation.activeLeaseCount === 0 ? entry.observation.acquire() : undefined;
    try {
      entry.observation.refresh();
      await this.#settled(entry);
    } finally {
      lease?.release();
    }
  }
  public update(typeId: MachineTypeId, edit: (record: MachineSettingsRecord) => MachineSettingsRecord): void {
    const started = performance.now();
    try {
      const entry = this.#entry(typeId);
      const base = this.record(typeId);
      if (
        !base ||
        Boolean(entry.state.failure) ||
        entry.state.observation?.status === 'closed' ||
        entry.state.observation?.status === 'error'
      ) {
        return;
      }
      if (entry.state.pending + entry.deferred.length >= 32) {
        throw new Error('Wait for pending profile changes to finish.');
      }
      const next = freeze(edit(base));
      serializeMachineSettings({ record: next });
      if (JSON.stringify(base) === JSON.stringify(next) && entry.state.file.status !== 'absent') {
        return;
      }
      const operationId = randomUuid();
      const revision = ++entry.revision;
      const profileId = base.activeProfile;
      const create = entry.state.file.status === 'absent' && entry.state.pending === 0;
      this.#publish(entry, {
        ...entry.state,
        draft: next,
        pending: entry.state.pending + 1,
      });
      const transition = {
        operationId,
        typeId,
        base: create ? null : base,
        next,
      };
      this.#enqueue(entry, { input: transition, revision, profileId });
    } finally {
      performance.clearMeasures('tau.machine-settings.update');
      performance.measure('tau.machine-settings.update', { start: started, end: performance.now() });
    }
  }
  /** Check the original operation; this never writes or clears uncertainty based on file contents. */
  public async checkSave(typeId: MachineTypeId): Promise<void> {
    const entry = this.#entry(typeId);
    const { failure } = entry.state;
    if (failure?.result.status !== 'uncertain') {
      return;
    }
    const run = entry.queue.then(async () => {
      if (entry.state.failure !== failure) {
        return;
      }
      const service = await this.#ready();
      const result = await service.machineSettingsSettlement(failure.operationId);
      if (result.status === 'saved') {
        // The original receipt may predate an external edit; reuse the root's current snapshot.
        const file = await service.readMachineSettings(typeId);
        const deferred = entry.deferred.splice(0);
        this.#publish(entry, {
          ...entry.state,
          file,
          ...(entry.revision === failure.revision ? { draft: undefined } : {}),
          failure: undefined,
          pending: deferred.length,
        });
        for (const transition of deferred) {
          this.#enqueue(entry, transition);
        }
      } else {
        this.#publish(entry, { ...entry.state, failure: { ...failure, result } });
      }
    });
    entry.queue = run.catch((error: unknown) => {
      this.#readFailure(entry, error);
    });
    await run;
  }
  /** Explicitly discard a conflicting draft in favor of the current saved record. */
  public async useLatest(typeId: MachineTypeId): Promise<void> {
    const entry = this.#entry(typeId);
    if (entry.state.failure?.result.status === 'uncertain') {
      return;
    }
    await this.#drain(entry);
    entry.deferred.length = 0;
    this.#publish(entry, {
      ...entry.state,
      failure: undefined,
      draft: undefined,
    });
    await this.refresh(typeId);
  }
  /** Job preparation waits for captured writes and refuses unresolved saves. */
  public async flush(typeId: MachineTypeId): Promise<void> {
    const entry = this.#entry(typeId);
    await this.#drain(entry);
    if (entry.state.failure) {
      throw new Error(entry.state.failure.result.message);
    }
  }
  public dispose(): void {
    this.#disposed = true;
    for (const entry of this.#entries.values()) {
      entry.unsubscribe();
      entry.observation.dispose();
      entry.topic.dispose();
    }
    Promise.allSettled([...this.#entries.values()].map(async (entry) => this.#drain(entry)))
      .then(this.#disposeService)
      .catch(console.error);
  }
  async #drain(entry: Entry): Promise<void> {
    let queue: Promise<void>;
    do {
      ({ queue } = entry);
      await queue;
      if (!this.#disposed && entry.observation.activeLeaseCount > 0) {
        await this.#settled(entry).catch(() => undefined);
      }
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- Settlement can append captured edits while the queue is awaited.
    } while (queue !== entry.queue);
  }
  async #settled(entry: Entry): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      let off = (): void => undefined;
      const check = (): void => {
        const snapshot = entry.observation.getSnapshot();
        if (snapshot.status === 'registering' || snapshot.status === 'pending') {
          return;
        }
        off();
        if (snapshot.status === 'ready') {
          resolve();
        } else {
          reject(new Error(snapshot.error ?? 'Settings observation closed.'));
        }
      };
      off = entry.observation.subscribe(check);
      check();
    });
  }
  async #read(typeId: MachineTypeId, entry: Entry, fence: ObservationRead): Promise<MachineSettingsSnapshot> {
    const current = (): void => {
      if (this.#disposed || !fence.isCurrent()) {
        throw new Error('Settings acquisition superseded.');
      }
    };
    for (;;) {
      current();
      const { queue } = entry;
      await queue;
      current();
      if (queue !== entry.queue) {
        continue;
      }
      const service = await this.#ready();
      current();
      const file = await service.readMachineSettings(typeId);
      current();
      if (queue !== entry.queue) {
        continue;
      }
      return file;
    }
  }
  async #ready(): Promise<MachineSettingsService> {
    this.#opened ??= typeof this.#service === 'function' ? this.#service() : this.#service;
    return this.#opened;
  }
  #entry(typeId: MachineTypeId): Entry {
    const existing = this.#entries.get(typeId);
    if (existing) {
      return existing;
    }
    if (this.#disposed) {
      throw new Error('Machine settings project closed.');
    }
    if (this.#entries.size >= 32) {
      const clean = [...this.#entries].find(
        ([, entry]) => entry.observation.activeLeaseCount === 0 && entry.state.pending === 0 && !entry.state.failure,
      );
      if (!clean) {
        throw new Error('Too many pending machine preference types.');
      }
      clean[1].unsubscribe();
      clean[1].observation.dispose();
      clean[1].topic.dispose();
      this.#entries.delete(clean[0]);
    }
    const observation = new ObservationService<MachineSettingsSnapshot>({
      resource: typeId,
      watch: (invalidate, reset) =>
        this.#observe(typeId, (event) => {
          if (event.type === 'reset') {
            reset();
          } else {
            invalidate();
          }
        }),
      read: async (fence) => this.#read(typeId, entry, fence),
      publish: (file) => {
        const { state } = entry;
        this.#publish(entry, {
          ...state,
          file,
          observation: { status: 'ready' },
          ...(state.pending === 0 && !state.failure ? { draft: undefined } : {}),
        });
      },
    });
    const entry: Entry = {
      deferred: [],
      state: { ...initial, starting: emptyRecord(typeId) },
      revision: 0,
      topic: new Topic({ name: 'MachineSettingsProjection' }),
      queue: Promise.resolve(),
      observation,
      unsubscribe: () => undefined,
    };
    this.#entries.set(typeId, entry);
    entry.unsubscribe = observation.subscribe(() => {
      if (observation.activeLeaseCount === 0 || this.#disposed) {
        return;
      }
      const snapshot = observation.getSnapshot();
      if (snapshot.status === 'error' || snapshot.status === 'closed') {
        const error =
          snapshot.error === 'Observation connection closed.' ? 'Settings observation closed.' : snapshot.error;
        this.#readFailure(entry, error ?? 'Settings observation closed.', snapshot.status);
      } else {
        this.#publish(entry, {
          ...entry.state,
          ...(snapshot.status === 'ready' && snapshot.value !== undefined && entry.state.file.status === 'unavailable'
            ? { file: snapshot.value }
            : {}),
          observation: {
            status: snapshot.status,
            ...(snapshot.status !== 'ready' && entry.state.observation?.error
              ? { error: entry.state.observation.error }
              : {}),
          },
        });
      }
    });
    return entry;
  }
  #publish(entry: Entry, state: SettingsProjection): void {
    const started = performance.now();
    try {
      if (JSON.stringify(entry.state) === JSON.stringify(state)) {
        return;
      }
      entry.state = freeze(replaceEqualDeep(entry.state, state));
      if (!this.#disposed) {
        entry.topic.emit();
      }
    } finally {
      performance.clearMeasures('tau.machine-settings.publish');
      performance.measure('tau.machine-settings.publish', { start: started, end: performance.now() });
    }
  }
  #readFailure(entry: Entry, error: unknown, status: 'closed' | 'error' = 'error'): void {
    this.#publish(entry, {
      ...entry.state,
      observation: {
        status,
        error: error instanceof Error ? error.message : String(error),
      },
      file: {
        status: 'unavailable',
        code: 'SETTINGS_UNAVAILABLE',
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
  #enqueue(entry: Entry, transition: Transition): void {
    const { input, revision, profileId } = transition;
    const run = entry.queue
      .then(async () => {
        // Keep later captured edits until the original uncertain operation settles.
        if (entry.state.failure) {
          entry.deferred.push(transition);
          return;
        }
        let result: MachineSettingsSave;
        try {
          const service = await this.#ready();
          result = await service.editMachineSettings(input);
        } catch (error) {
          result = {
            status: 'uncertain',
            message: error instanceof Error ? error.message : String(error),
          };
        }
        if (result.status === 'saved') {
          this.#publish(entry, {
            ...entry.state,
            file: { status: 'current', record: result.record },
            ...(entry.revision === revision ? { draft: undefined } : {}),
          });
        } else {
          this.#publish(entry, {
            ...entry.state,
            failure: {
              profileId,
              operationId: input.operationId,
              revision,
              result,
            },
          });
        }
      })
      .finally(() => {
        this.#publish(entry, {
          ...entry.state,
          pending: Math.max(0, entry.state.pending - 1),
        });
      });
    entry.queue = run.catch((error: unknown) => {
      this.#readFailure(entry, error);
    });
  }
}
