/* oxlint-disable typescript/no-restricted-types -- Refused record bytes may be absent (null), as the store reports them. */
/**
 * The entries record session: a project runtime child that reads and writes the project's per-entry workbench settings
 * (`.tau/workbench/entries.json`) with no React (app state orchestration plan § 4 A9; inventory rows S24, S25; charter
 * D12, I13).
 *
 * It owns what `EntriesSyncHost` owned in a mounted component: one entries store with its record observation, the
 * record's issue, the applied-revision acknowledgements, and an entry applier per geometry unit. An applier applies its
 * entry's render timeout and component visibility to the unit's kernel and model-interaction actors, and writes a
 * person's change of either back to the record. The session registers its flush in the runtime's producer set when it
 * starts, so a leave, close or unload flush reaches it whether or not anything is mounted.
 *
 * `ProjectProvider` builds the session with its runtime, reads its snapshot and hands it a replaced file host, as it
 * does for the view records (A6b); the runtime's `entriesRecord` child starts and stops it.
 *
 * @module
 */
import { Topic } from '@taucad/events';
import { ObservationService } from '@taucad/fs-client/observation-service';
import type { ObservationLease } from '@taucad/fs-client/observation-service';
import { workbenchPaths, workbenchRecords } from '@taucad/workbench';
import type { WorkbenchEntries } from '@taucad/workbench';
import type { ActorOptions, ActorRefFrom, AnyActorLogic, Subscription } from 'xstate';
import { defaultOperationTimeout } from '@taucad/ui-core/constants/editor.constants';
import { digestBytes } from '@taucad/ui-core/utils/crypto.utils';
import {
  createSourceModelInteractionUnitId,
  serializeModelComponentDisplayState,
} from '@taucad/viewer/machines/model-interaction.machine';
import type { modelInteractionMachine } from '@taucad/viewer/machines/model-interaction.machine';
import type { cadMachine } from '#machines/cad.machine.js';
import { createWorkbenchEntriesStore } from '#workbench-records/entries-store.js';
import type { EntryPathChange, EntryRecordPatch } from '#workbench-records/entries-store.js';
import { confirmFlush } from '#workbench-records/record-health.js';
import type { RecordHealth } from '#workbench-records/record-health.js';
import { publishRecordIssue, readRecordIssues, recordIssueState } from '#workbench-records/record-issues.js';
import type { RecordIssue } from '#workbench-records/record-issues.js';
import type { ViewRecordHost } from '#workbench-records/view-record-session.js';

type Entry = WorkbenchEntries['entries'][string];
type CadRef = ActorRefFrom<typeof cadMachine>;
type ModelInteractionRef = ActorRefFrom<typeof modelInteractionMachine>;
type Components = NonNullable<Entry['components']>;
type Sha256 = `sha256:${string}`;

/** The entries store's debounce for a person's edits, in milliseconds. */
export const entriesRecordEditDebounce = 500;

/** What the project's host gives the session: the checked file ports and the record watch, as for the view records. */
export type EntriesRecordHost = ViewRecordHost;

/** What the session reports to the project. Each field keeps its identity until it changes. */
export type EntriesRecordSnapshot = Readonly<{
  /** The record as last read or written; an empty record once a read record is deleted. */
  entriesRecord: WorkbenchEntries | undefined;
  /** The digest of the record bytes each entry's owners applied, by entry path. */
  appliedEntryRevisions: ReadonlyMap<string, Sha256>;
}>;

/** The project the session follows: its geometry units and its model-interaction actor. */
export type EntriesRecordProject = Readonly<{
  getSnapshot: () => Readonly<{
    context: Readonly<{ geometryUnits: ReadonlyMap<string, CadRef>; modelInteractionRef: ModelInteractionRef }>;
  }>;
  subscribe: (listener: () => void) => Subscription;
}>;

/** The runtime's producer set, as far as the session uses it. */
export type EntriesRecordProducers = Readonly<{ register: (flush: () => Promise<void>) => () => void }>;

export type EntriesRecordSession = Readonly<{
  getSnapshot: () => EntriesRecordSnapshot;
  subscribe: (listener: () => void) => () => void;
  /** Carry a file rename, move or delete into the record; `false` while the session is not running. */
  changePaths: (change: EntryPathChange) => Promise<boolean>;
  /** The filesystem's connections were replaced: the session reopens its store, or only its watch, on `host`. */
  replaceHost: (host: EntriesRecordHost) => void;
  /**
   * Start the session over the project's actors and register its flush in the producer set. The runtime's
   * `entriesRecord` child calls this once, when the runtime starts.
   *
   * @returns The stop: it releases the watch, closes the store, clears the record's issue and the producer.
   */
  start: (input: Readonly<{ project: EntriesRecordProject; producers: EntriesRecordProducers }>) => () => void;
}>;

/*
 * The live session of each project, by its yield. A runtime outlives its mount by the lease grace (B3), so a keyed
 * remount builds a second runtime while the first still runs: the newer session takes the record, and the older one
 * yields at once (I13), as the host's unmount ran before the next host's mount.
 */
const liveSessions = new Map<string, () => void>();

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const emptyEntries = (): WorkbenchEntries => workbenchRecords.entries.schema.parse({ version: 1, entries: {} });
const noComponents: Components = { hidden: [], isolated: [], opacity: [] };

/** A unit's component display as an entry keeps it: sorted ids, and only the opacities that are not 1. */
const componentsOf = (
  unit: ReturnType<ModelInteractionRef['getSnapshot']>['context']['unitsById'][string] | undefined,
): Components => ({
  hidden: [...(unit?.hiddenComponentIds ?? [])].sort(),
  isolated: [...(unit?.isolatedComponentIds ?? [])].sort(),
  opacity: Object.entries(unit?.opacityByComponentId ?? {})
    .filter(([, opacity]) => opacity !== 1)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, opacity]) => ({ id, opacity })),
});

/**
 * The next map with `key` set to `value`, or removed when `value` is `undefined`; the same map when nothing changed.
 *
 * @param current - The map now.
 * @param key - The key to set.
 * @param value - Its value, or `undefined` to remove it.
 * @returns The next map.
 */
const withEntry = <V>(current: ReadonlyMap<string, V>, key: string, value: V | undefined): ReadonlyMap<string, V> => {
  if (value === undefined ? !current.has(key) : current.get(key) === value) {
    return current;
  }
  const next = new Map(current);
  if (value === undefined) {
    next.delete(key);
  } else {
    next.set(key, value);
  }
  return next;
};

/** One geometry unit's entry applier (row S24). */
export type EntryApplier = {
  readonly path: string;
  /** The unit's kernel actor; the session rebinds it when the project replaces the unit's actor. */
  cad: CadRef;
  /** The project's model-interaction actor. */
  model: ModelInteractionRef;
  /**
   * Apply the record's entry to the unit's actors. The first application sets both fields; a later one sets only a
   * field the entry changed and the person's own write did not carry.
   *
   * @param entry - The unit's entry in the record, if it has one.
   * @param localPatch - The fields the person's own write carried, when the record is that write.
   */
  apply: (entry: Entry | undefined, localPatch: EntryRecordPatch['fields'][string] | undefined) => void;
  /**
   * Compare the actors with what was last observed: a change that the entry does not hold is the person's, and goes
   * to `write`. The first call only records what the actors hold.
   *
   * @param entry - The unit's entry in the record, if it has one.
   * @param write - Writes the unit's next entry.
   */
  observe: (entry: Entry | undefined, write: (next: Entry) => void) => void;
};

/**
 * Build one geometry unit's applier: what it last applied and last observed of the unit's actors. It is the
 * `EntryOwner` of the entries host, without React.
 *
 * @param input - The entry path and the unit's actors.
 * @returns The applier.
 * @internal
 */
export function createEntryApplier(
  input: Readonly<{ path: string; cad: CadRef; model: ModelInteractionRef }>,
): EntryApplier {
  const { path } = input;
  const unitId = createSourceModelInteractionUnitId(path);
  /* The entry last applied; absent until the record is first present. */
  let applied: { entry: Entry | undefined } | undefined;
  /* The actors' values last observed while the record was ready; a change from these is a person's edit. */
  let observed: { operationTimeout: number; components: Components } | undefined;
  type Application = Readonly<{
    first: boolean;
    previous: Entry | undefined;
    entry: Entry | undefined;
    localPatch: EntryRecordPatch['fields'][string] | undefined;
  }>;
  /* The timeout is set first, then on a change the person's own write did not carry. */
  const applyTimeout = ({ first, previous, entry, localPatch }: Application): void => {
    const targetTimeout = entry?.renderTimeout ?? defaultOperationTimeout;
    if (
      (first ||
        (!Object.hasOwn(localPatch ?? {}, 'renderTimeout') && previous?.renderTimeout !== entry?.renderTimeout)) &&
      applier.cad.getSnapshot().context.operationTimeout !== targetTimeout
    ) {
      applier.cad.send({ type: 'setOperationTimeout', operationTimeout: targetTimeout });
    }
  };
  /* Each component field independently: a field keeps what the unit shows when the person's own write carried it, or
   * the entry did not change it. */
  const applyComponents = ({ first, previous, entry, localPatch }: Application): void => {
    const target = entry?.components ?? noComponents;
    const before = previous?.components ?? noComponents;
    if (!first && same(before, target)) {
      return;
    }
    const model = applier.model.getSnapshot().context;
    const live = componentsOf(model.unitsById[unitId]);
    const keepsLive = (field: keyof Components): boolean =>
      !first && (Object.hasOwn(localPatch?.components ?? {}, field) || same(before[field], target[field]));
    const merged: Components = {
      ...live,
      hidden: keepsLive('hidden') ? live.hidden : target.hidden,
      isolated: keepsLive('isolated') ? live.isolated : target.isolated,
      opacity: keepsLive('opacity') ? live.opacity : target.opacity,
    };
    if (same(live, merged)) {
      return;
    }
    const unitsById = { ...serializeModelComponentDisplayState(model)?.unitsById };
    unitsById[unitId] = {
      hiddenComponentIds: merged.hidden,
      isolatedComponentIds: merged.isolated,
      opacityByComponentId: Object.fromEntries(merged.opacity.map(({ id, opacity }) => [id, opacity])),
    };
    applier.model.send({ type: 'restoreComponentDisplay', componentDisplay: { schemaVersion: 1, unitsById } });
  };
  const applier: EntryApplier = {
    path,
    cad: input.cad,
    model: input.model,
    apply: (entry, localPatch) => {
      const previous = applied?.entry;
      const first = applied === undefined;
      applied = { entry };
      applyTimeout({ first, previous, entry, localPatch });
      applyComponents({ first, previous, entry, localPatch });
    },
    observe: (entry, write) => {
      const { operationTimeout } = applier.cad.getSnapshot().context;
      const components = componentsOf(applier.model.getSnapshot().context.unitsById[unitId]);
      const previous = observed;
      const next = { operationTimeout, components };
      if (same(previous, next)) {
        return;
      }
      observed = next;
      if (previous === undefined) {
        return;
      }
      const changedTimeout =
        previous.operationTimeout !== operationTimeout &&
        operationTimeout !== (entry?.renderTimeout ?? defaultOperationTimeout);
      const changedComponents =
        !same(previous.components, components) && !same(components, entry?.components ?? noComponents);
      if (!changedTimeout && !changedComponents) {
        return;
      }
      write({ ...entry, renderTimeout: operationTimeout, components });
    },
  };
  return applier;
}

/** A running applier and its subscriptions to the unit's actors. */
type BoundApplier = Readonly<{ applier: EntryApplier }> & { subscriptions: Subscription[] };

/** One opened store: its acknowledgements and generation belong to it, as the host's memo did. */
type OpenedStore = {
  readonly store: ReturnType<typeof createWorkbenchEntriesStore>;
  readonly files: EntriesRecordHost['files'];
  /** A publication, an error or a retired watch makes any acknowledgement still digesting stale. */
  generation: number;
  /** A read record was seen, so a later absence is a deletion. */
  seenRecord: boolean;
  readonly acknowledged: Set<string>;
  retired: boolean;
};

/** One record watch over one store. */
type OpenedObservation = Readonly<{
  observation: ObservationService<boolean>;
  watch: EntriesRecordHost['watch'];
  release: () => void;
}>;

/**
 * Build a project's entries record session, not started.
 *
 * @param input - The project, the file host its store opens on (replaceable later), and the actor options tests inject.
 * @returns The session.
 */
export function createEntriesRecordSession(
  input: Readonly<{ projectId: string; host: EntriesRecordHost }> &
    Pick<ActorOptions<AnyActorLogic>, 'clock' | 'inspect' | 'onRejectedEvent'>,
): EntriesRecordSession {
  const { projectId, clock, inspect, onRejectedEvent } = input;
  const root = `/projects/${projectId}`;
  const recordPath = workbenchPaths.entries;
  const absolutePath = `${root}/${recordPath}`;
  const actorOptions = {
    ...(clock === undefined ? {} : { clock }),
    ...(inspect === undefined ? {} : { inspect }),
    ...(onRejectedEvent === undefined ? {} : { onRejectedEvent }),
  };
  let { host } = input;
  const hostReplaced = new Topic<void>({ name: 'EntriesRecordSession.hostReplaced' });

  let snapshot: EntriesRecordSnapshot = { entriesRecord: undefined, appliedEntryRevisions: new Map() };
  const changes = new Topic<void>({ name: 'EntriesRecordSession.changes' });
  const update = (next: EntriesRecordSnapshot): void => {
    if (
      next.entriesRecord === snapshot.entriesRecord &&
      next.appliedEntryRevisions === snapshot.appliedEntryRevisions
    ) {
      return;
    }
    snapshot = next;
    changes.emit();
  };
  const setEntriesRecord = (record: WorkbenchEntries): void => {
    update({ ...snapshot, entriesRecord: record });
  };
  const setAppliedEntryRevision = (path: string, digest: Sha256 | undefined): void => {
    update({ ...snapshot, appliedEntryRevisions: withEntry(snapshot.appliedEntryRevisions, path, digest) });
  };

  /* The running session's path change, while it runs. */
  let changePaths: ((change: EntryPathChange) => Promise<boolean>) | undefined;

  const start: EntriesRecordSession['start'] = ({ project, producers }) => {
    if (changePaths !== undefined) {
      throw new Error('The entries record session is already running.');
    }
    /* An older runtime's session for this project yields before this one opens the record (I13). */
    liveSessions.get(projectId)?.();
    let stopped = false;
    let notice:
      | Readonly<{ code: 'INVALID_RECORD' | 'NEWER_RECORD'; message: string; bytes: Uint8Array<ArrayBuffer> | null }>
      | undefined;
    let health: RecordHealth | undefined;
    let observedError: string | undefined;
    /* What the store last published, and the person's fields its own write carried. */
    let published: { record: WorkbenchEntries | undefined; patch: EntryRecordPatch | undefined } | undefined;
    /* The digest of the bytes last published, while they are the record's and nothing newer superseded them. */
    let entriesDigest: { bytes: Uint8Array<ArrayBuffer>; digest: Sha256; generation: number } | undefined;
    let issue: RecordIssue | undefined;
    let issueKey: readonly unknown[] | undefined;
    const appliers = new Map<string, BoundApplier>();
    /* An applier's own sends are not a person's edit: what it observes is read once its apply has finished. */
    let applying = false;

    const clearApplied = (opened: OpenedStore): void => {
      for (const path of opened.acknowledged) {
        setAppliedEntryRevision(path, undefined);
      }
      opened.acknowledged.clear();
    };

    let current: OpenedStore;
    let watching: OpenedObservation;

    const ready = (): boolean => current.store.ready() && current.store.snapshot().refusal === undefined;

    /* The record's issue, from the codec's refusal, the store's health and the watch. */
    const publishIssue = (): void => {
      if (stopped) {
        return;
      }
      const sourceHealth: RecordHealth | undefined =
        observedError === undefined
          ? health
          : { ...(health ?? current.store.health()), read: 'unavailable', error: observedError };
      const state = recordIssueState(notice, sourceHealth);
      const key = [sourceHealth?.error, health?.writing, state, notice, observedError, watching, current];
      if (issueKey !== undefined && key.every((part, index) => part === issueKey?.[index])) {
        return;
      }
      issueKey = key;
      const { store } = current;
      const { observation } = watching;
      const errored = observedError !== undefined;
      issue =
        state === undefined
          ? undefined
          : {
              kind: 'entries',
              path: recordPath,
              state,
              message: notice?.message ?? sourceHealth?.error,
              bytes: notice?.bytes ?? null,
              writing: health?.writing ?? false,
              retryRead: async () => {
                if (errored) {
                  observation.refresh();
                  return false;
                }
                return store.retryRead();
              },
              retrySave: store.flush,
              reset: async (reviewed) => store.reset(emptyEntries(), reviewed),
              repair: async (record, reviewed) => store.reset(record, reviewed),
            };
      publishRecordIssue(projectId, recordPath, issue);
    };

    /* The entry's render timeout and component visibility reach the unit's actors (row S24). */
    const apply = ({ applier }: BoundApplier): void => {
      const record = snapshot.entriesRecord;
      if (record === undefined) {
        return;
      }
      const localPatch = published?.record === record ? published.patch?.fields[applier.path] : undefined;
      applier.apply(record.entries[applier.path], localPatch);
    };

    /* The bytes every owner applied are acknowledged, once their digest is the current publication's. */
    const acknowledge = ({ applier }: BoundApplier): void => {
      if (snapshot.entriesRecord === undefined || entriesDigest === undefined) {
        return;
      }
      const state = current.store.snapshot();
      if (entriesDigest.generation !== current.generation || state.bytes !== entriesDigest.bytes || state.refusal) {
        return;
      }
      current.acknowledged.add(applier.path);
      setAppliedEntryRevision(applier.path, entriesDigest.digest);
    };

    /* A person's change of a unit's timeout or component visibility is written to the record. */
    /* Whether the applier's actors are still the project's for its path. A rename or delete reaches the
     * model-interaction actor before the project's own observers hear of the moved units; an applier for a unit
     * that has gone reads nothing and writes nothing, as the host's owner unmounted in the same render. */
    const isCurrent = ({ applier }: BoundApplier): boolean => {
      const { geometryUnits, modelInteractionRef } = project.getSnapshot().context;
      return geometryUnits.get(applier.path) === applier.cad && modelInteractionRef === applier.model;
    };

    const observe = (bound: BoundApplier): void => {
      const { applier } = bound;
      if (applying || stopped || !ready() || !isCurrent(bound)) {
        return;
      }
      const { store } = current;
      applier.observe(snapshot.entriesRecord?.entries[applier.path], (next) => {
        void store.edit(applier.path, next);
      });
    };

    /* Each applier in turn applies, acknowledges, then observes, as the host's owners ran their effects. */
    const settle = (bound: BoundApplier): void => {
      if (!isCurrent(bound)) {
        return;
      }
      applying = true;
      try {
        apply(bound);
      } finally {
        applying = false;
      }
      acknowledge(bound);
      observe(bound);
    };
    const settleAll = (): void => {
      if (stopped) {
        return;
      }
      publishIssue();
      for (const applier of appliers.values()) {
        settle(applier);
      }
    };

    const openStore = (files: EntriesRecordHost['files']): OpenedStore => {
      const opened: OpenedStore = {
        files,
        generation: 0,
        seenRecord: false,
        acknowledged: new Set(),
        retired: false,
        store: createWorkbenchEntriesStore({
          root,
          files,
          editDebounce: entriesRecordEditDebounce,
          ...actorOptions,
          onHealth: (next) => {
            if (stopped || opened.retired) {
              return;
            }
            health = next;
            publishIssue();
          },
          onChange: (state, _source, locallyAuthored) => {
            if (stopped || opened.retired) {
              return;
            }
            const generation = ++opened.generation;
            published = { record: state.record, patch: locallyAuthored };
            clearApplied(opened);
            entriesDigest = undefined;
            notice = state.refusal ? { ...state.refusal, bytes: state.bytes } : undefined;
            if (state.record) {
              opened.seenRecord = true;
              setEntriesRecord(state.record);
            } else if (state.bytes === null && opened.seenRecord) {
              // A deleted record is authoritative: every model returns to default settings.
              setEntriesRecord(emptyEntries());
            }
            if (state.record && state.bytes && !state.refusal) {
              const { bytes } = state;
              const captureAppliedBytes = async (): Promise<void> => {
                const digest = await digestBytes(bytes);
                if (!stopped && !opened.retired && generation === opened.generation) {
                  entriesDigest = { bytes, digest, generation };
                  for (const applier of appliers.values()) {
                    acknowledge(applier);
                  }
                }
              };
              void captureAppliedBytes();
            }
            settleAll();
          },
          onError: () => {
            if (stopped || opened.retired) {
              return;
            }
            // The record's health carries the failure to the settings trigger.
            opened.generation++;
            published = undefined;
            clearApplied(opened);
            entriesDigest = undefined;
            settleAll();
          },
        }),
      };
      return opened;
    };

    const openObservation = (opened: OpenedStore, watch: EntriesRecordHost['watch']): OpenedObservation => {
      const { store } = opened;
      const observation = new ObservationService<boolean>({
        resource: absolutePath,
        watch: (invalidate, reset) =>
          watch(absolutePath, (event) => {
            if (event.type === 'reset') {
              reset();
            } else {
              invalidate();
            }
          }),
        invalidate: store.invalidateRead,
        read: async () => store.read(!store.ready()),
      });
      const lease: ObservationLease<boolean> = observation.acquire();
      const unsubscribe = lease.subscribe(() => {
        const { error } = lease.getSnapshot();
        if (error !== observedError) {
          observedError = error;
          publishIssue();
        }
      });
      return {
        observation,
        watch,
        // This watch's applications belong to its lease; retiring it advances the generation.
        release: () => {
          unsubscribe();
          lease.release();
          opened.generation++;
          clearApplied(opened);
          entriesDigest = undefined;
        },
      };
    };

    const retireStore = (opened: OpenedStore): void => {
      opened.retired = true;
      opened.store.dispose();
    };

    current = openStore(host.files);
    watching = openObservation(current, host.watch);

    /* Follow the project's geometry units: an applier per unit, rebound when its actors are replaced. */
    const syncAppliers = (): void => {
      const { geometryUnits, modelInteractionRef } = project.getSnapshot().context;
      for (const [path, bound] of appliers) {
        if (!geometryUnits.has(path)) {
          for (const subscription of bound.subscriptions) {
            subscription.unsubscribe();
          }
          appliers.delete(path);
        }
      }
      for (const [path, cad] of geometryUnits) {
        let bound = appliers.get(path);
        if (bound !== undefined && bound.applier.cad === cad && bound.applier.model === modelInteractionRef) {
          continue;
        }
        if (bound === undefined) {
          bound = { applier: createEntryApplier({ path, cad, model: modelInteractionRef }), subscriptions: [] };
          appliers.set(path, bound);
        } else {
          /* A replaced actor keeps the unit's applier, as a re-rendered owner kept its state. */
          for (const subscription of bound.subscriptions) {
            subscription.unsubscribe();
          }
          bound.applier.cad = cad;
          bound.applier.model = modelInteractionRef;
        }
        const observed = bound;
        const unitId = createSourceModelInteractionUnitId(path);
        /* Only a change of the slices an entry holds is observed, as the owner's selectors re-rendered on those. */
        let timeout = cad.getSnapshot().context.operationTimeout;
        let display = modelInteractionRef.getSnapshot().context.unitsById[unitId];
        bound.subscriptions = [
          cad.subscribe(({ context }) => {
            if (context.operationTimeout !== timeout) {
              timeout = context.operationTimeout;
              observe(observed);
            }
          }),
          modelInteractionRef.subscribe(({ context }) => {
            if (context.unitsById[unitId] !== display) {
              display = context.unitsById[unitId];
              observe(observed);
            }
          }),
        ];
        settle(bound);
      }
    };
    let units = project.getSnapshot().context;
    const projectSubscription = project.subscribe(() => {
      const next = project.getSnapshot().context;
      if (next.geometryUnits === units.geometryUnits && next.modelInteractionRef === units.modelInteractionRef) {
        return;
      }
      units = next;
      syncAppliers();
    });
    syncAppliers();

    const unsubscribeHost = hostReplaced.subscribe(() => {
      const next = host;
      if (next.files !== current.files) {
        watching.release();
        retireStore(current);
        current = openStore(next.files);
        watching = openObservation(current, next.watch);
      } else if (next.watch !== watching.watch) {
        watching.release();
        watching = openObservation(current, next.watch);
      }
      settleAll();
    });

    /* The child's flush is in the producer set from its start (D12, row S25). */
    const unregisterProducer = producers.register(async () =>
      confirmFlush(current.store.flush, 'Model display settings are not confirmed saved.'),
    );
    changePaths = async (change) => current.store.changePaths(change);
    publishIssue();

    const stop = (flushFirst: boolean): void => {
      if (stopped) {
        return;
      }
      stopped = true;
      changePaths = undefined;
      if (liveSessions.get(projectId) === yieldToSuccessor) {
        liveSessions.delete(projectId);
      }
      unregisterProducer();
      unsubscribeHost();
      projectSubscription.unsubscribe();
      for (const bound of appliers.values()) {
        for (const subscription of bound.subscriptions) {
          subscription.unsubscribe();
        }
      }
      appliers.clear();
      watching.release();
      const last = current;
      if (flushFirst) {
        /* A yielding session writes what it still owes before its store closes. */
        last.retired = true;
        const flushThenClose = async (): Promise<void> => {
          try {
            await last.store.flush();
          } finally {
            last.store.dispose();
          }
        };
        void flushThenClose();
      } else {
        retireStore(last);
      }
      /* Only this session's own issue is withdrawn: a successor's stays published. */
      if (issue !== undefined && readRecordIssues(projectId).includes(issue)) {
        publishRecordIssue(projectId, recordPath, undefined);
      }
    };
    function yieldToSuccessor(): void {
      stop(true);
    }
    liveSessions.set(projectId, yieldToSuccessor);

    return () => {
      stop(false);
    };
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => changes.subscribe(listener),
    changePaths: async (change) => (changePaths === undefined ? false : changePaths(change)),
    replaceHost: (next) => {
      if (next.files === host.files && next.watch === host.watch) {
        return;
      }
      host = next;
      hostReplaced.emit();
    },
    start,
  };
}
