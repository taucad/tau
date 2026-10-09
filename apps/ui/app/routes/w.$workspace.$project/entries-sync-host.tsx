/* oxlint-disable typescript/no-restricted-types -- Refused record bytes may be absent (null), as the store reports them. */
import { useObservation } from '@taucad/fs-client/react/use-observation';
import { ObservationService } from '@taucad/fs-client/observation-service';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from '@xstate/react';
import { workbenchPaths, workbenchRecords } from '@taucad/workbench';
import type { WorkbenchEntries } from '@taucad/workbench';
import type { ActorRefFrom } from 'xstate';
import { defaultOperationTimeout } from '#constants/editor.constants.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useFlushOnClose } from '#hooks/use-flush-on-close.js';
import { useProject } from '#hooks/use-project.js';
import {
  createSourceModelInteractionUnitId,
  serializeModelComponentDisplayState,
} from '#machines/model-interaction.machine.js';
import type { modelInteractionMachine } from '#machines/model-interaction.machine.js';
import type { cadMachine } from '#machines/cad.machine.js';
import { createWorkbenchEntriesStore } from '#workbench-records/entries-store.js';
import type { EntryRecordPatch } from '#workbench-records/entries-store.js';
import { confirmFlush } from '#workbench-records/record-health.js';
import type { RecordHealth } from '#workbench-records/record-health.js';
import { recordIssueState, usePublishRecordIssue } from '#workbench-records/record-issues.js';
import type { RecordIssue } from '#workbench-records/record-issues.js';
import { digestBytes } from '#utils/crypto.utils.js';

type Entry = WorkbenchEntries['entries'][string];
const storeMounts = new WeakMap<ReturnType<typeof createWorkbenchEntriesStore>, number>();
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const emptyEntries = (): WorkbenchEntries => workbenchRecords.entries.schema.parse({ version: 1, entries: {} });

/** One project-lifetime reader and writer for shared per-file workbench settings. */
export function EntriesSyncHost(): React.JSX.Element {
  const { parameterFiles, watchRecordFile } = useFileManager();
  const {
    projectId,
    geometryUnits,
    modelInteractionRef,
    entriesRecord,
    setEntriesRecord,
    registerWorkbenchRecordProducer,
    registerEntryPathChange,
    setAppliedEntryRevision,
  } = useProject();
  const root = `/projects/${projectId}`;
  const [notice, setNotice] =
    useState<
      Readonly<{ code: 'INVALID_RECORD' | 'NEWER_RECORD'; message: string; bytes: Uint8Array<ArrayBuffer> | null }>
    >();
  const [health, setHealth] = useState<RecordHealth>();
  const [published, setPublished] = useState<{
    record: WorkbenchEntries | undefined;
    patch: EntryRecordPatch | undefined;
  }>();
  const [entriesDigest, setEntriesDigest] = useState<{
    bytes: Uint8Array<ArrayBuffer>;
    digest: `sha256:${string}`;
    generation: number;
  }>();
  const { store, clearApplied, advanceGeneration, currentGeneration, acknowledge } = useMemo(() => {
    let generation = 0;
    const seen = { record: false };
    const acknowledged = new Set<string>();
    const clearApplied = (): void => {
      for (const path of acknowledged) {
        setAppliedEntryRevision(path, undefined);
      }
      acknowledged.clear();
    };
    return {
      store: createWorkbenchEntriesStore({
        root,
        files: parameterFiles,
        editDebounce: 500,
        onHealth: setHealth,
        onChange: (state, _source, locallyAuthored) => {
          const currentGeneration = ++generation;
          setPublished({ record: state.record, patch: locallyAuthored });
          clearApplied();
          setEntriesDigest(undefined);
          setNotice(state.refusal ? { ...state.refusal, bytes: state.bytes } : undefined);
          if (state.record) {
            seen.record = true;
            setEntriesRecord(state.record);
          } else if (state.bytes === null && seen.record) {
            // A deleted record is authoritative: every model returns to default settings.
            setEntriesRecord(emptyEntries());
          }
          if (state.record && state.bytes && !state.refusal) {
            const { bytes } = state;
            const captureAppliedBytes = async (): Promise<void> => {
              const digest = await digestBytes(bytes);
              if (currentGeneration === generation) {
                setEntriesDigest({ bytes, digest, generation: currentGeneration });
              }
            };
            void captureAppliedBytes();
          }
        },
        onError: () => {
          // The record's health carries the failure to the settings trigger.
          generation++;
          setPublished(undefined);
          clearApplied();
          setEntriesDigest(undefined);
        },
      }),
      clearApplied,
      advanceGeneration: () => {
        generation++;
      },
      currentGeneration: () => generation,
      acknowledge: (path: string) => {
        acknowledged.add(path);
      },
    };
  }, [parameterFiles, root, setAppliedEntryRevision, setEntriesRecord]);
  const observation = useMemo(
    () =>
      new ObservationService({
        resource: `${root}/${workbenchPaths.entries}`,
        watch: (invalidate, reset) =>
          watchRecordFile(`${root}/${workbenchPaths.entries}`, (event) => {
            if (event.type === 'reset') {
              reset();
            } else {
              invalidate();
            }
          }),
        invalidate: store.invalidateRead,
        read: async () => store.read(!store.ready()),
      }),
    [root, store, watchRecordFile],
  );
  useEffect(() => {
    // This source's applications belong to its lease; retiring it advances the generation.
    const lease = observation.acquire();
    return () => {
      lease.release();
      advanceGeneration();
      clearApplied();
      setEntriesDigest(undefined);
    };
  }, [advanceGeneration, clearApplied, observation]);
  useEffect(() => {
    storeMounts.set(store, (storeMounts.get(store) ?? 0) + 1);
    return () => {
      storeMounts.set(store, (storeMounts.get(store) ?? 1) - 1);
      queueMicrotask(() => {
        if (storeMounts.get(store) === 0) {
          store.dispose();
        }
      });
    };
  }, [store]);
  useEffect(() => registerWorkbenchRecordProducer(async () => store.flush()), [registerWorkbenchRecordProducer, store]);
  useEffect(() => registerEntryPathChange(store.changePaths), [registerEntryPathChange, store]);
  useFlushOnClose(async () => confirmFlush(store.flush, 'Model display settings are not confirmed saved.'), {
    stage: 'producer',
  });
  const observed = useObservation(observation);
  const sourceHealth: RecordHealth | undefined = observed.error
    ? { ...(health ?? store.health()), read: 'unavailable', error: observed.error }
    : health;
  const issueState = recordIssueState(notice, sourceHealth);
  const issue = useMemo((): RecordIssue | undefined => {
    if (!issueState) {
      return undefined;
    }
    return {
      kind: 'entries',
      path: workbenchPaths.entries,
      state: issueState,
      message: notice?.message ?? sourceHealth?.error,
      bytes: notice?.bytes ?? null,
      writing: health?.writing ?? false,
      retryRead: async () => {
        if (observed.error) {
          observation.refresh();
          return false;
        }
        return store.retryRead();
      },
      retrySave: store.flush,
      reset: async (reviewed) => store.reset(emptyEntries(), reviewed),
      repair: async (record, reviewed) => store.reset(record, reviewed),
    };
  }, [sourceHealth?.error, health?.writing, issueState, notice, observed.error, observation, store]);
  usePublishRecordIssue(projectId, workbenchPaths.entries, issue);
  const write = useCallback(async (path: string, next: Entry) => store.edit(path, next), [store]);
  const ready = store.ready() && store.snapshot().refusal === undefined;
  const onEntryApplied = useCallback(
    (path: string, digest: `sha256:${string}`): void => {
      const state = store.snapshot();
      if (
        !entriesDigest ||
        entriesDigest.generation !== currentGeneration() ||
        entriesDigest.digest !== digest ||
        state.bytes !== entriesDigest.bytes ||
        state.refusal
      ) {
        return;
      }
      acknowledge(path);
      setAppliedEntryRevision(path, digest);
    },
    [acknowledge, currentGeneration, entriesDigest, setAppliedEntryRevision, store],
  );
  return (
    <>
      {[...geometryUnits].map(([path, cadRef]) => (
        <EntryOwner
          key={path}
          path={path}
          cadRef={cadRef}
          modelInteractionRef={modelInteractionRef}
          entry={entriesRecord?.entries[path]}
          localPatch={
            published?.record === entriesRecord && published?.patch?.path === path ? published.patch.fields : undefined
          }
          recordPresent={entriesRecord !== undefined}
          ready={ready}
          write={write}
          digest={entriesDigest?.digest}
          onApplied={onEntryApplied}
        />
      ))}
    </>
  );
}

/** The entry's live owner boundary, exported for a focused behavior regression.
 * @internal
 */
export function EntryOwner({
  path,
  cadRef,
  modelInteractionRef,
  entry,
  localPatch,
  recordPresent,
  ready,
  write,
  digest,
  onApplied,
}: Readonly<{
  path: string;
  cadRef: ActorRefFrom<typeof cadMachine>;
  modelInteractionRef: ActorRefFrom<typeof modelInteractionMachine>;
  entry: Entry | undefined;
  localPatch?: EntryRecordPatch['fields'];
  recordPresent: boolean;
  ready: boolean;
  write: (path: string, next: Entry) => Promise<boolean>;
  digest?: `sha256:${string}`;
  onApplied?: (path: string, digest: `sha256:${string}`) => void;
}>): React.JSX.Element | null {
  const operationTimeout = useSelector(cadRef, (state) => state.context.operationTimeout);
  const unitId = createSourceModelInteractionUnitId(path);
  const componentUnit = useSelector(modelInteractionRef, (state) => state.context.unitsById[unitId]);
  const components = useMemo(
    () => ({
      hidden: [...(componentUnit?.hiddenComponentIds ?? [])].sort(),
      isolated: [...(componentUnit?.isolatedComponentIds ?? [])].sort(),
      opacity: Object.entries(componentUnit?.opacityByComponentId ?? {})
        .filter(([, opacity]) => opacity !== 1)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, opacity]) => ({ id, opacity })),
    }),
    [componentUnit],
  );
  const [observed, setObserved] = useState<{ operationTimeout: number; components: Entry['components'] }>();
  const appliedEntryRef = useRef<{ entry: Entry | undefined } | undefined>(undefined);
  useEffect(() => {
    if (!recordPresent) {
      return;
    }
    const previous = appliedEntryRef.current?.entry;
    const first = appliedEntryRef.current === undefined;
    appliedEntryRef.current = { entry };
    const targetTimeout = entry?.renderTimeout ?? defaultOperationTimeout;
    if (
      (first ||
        (!Object.hasOwn(localPatch ?? {}, 'renderTimeout') && previous?.renderTimeout !== entry?.renderTimeout)) &&
      cadRef.getSnapshot().context.operationTimeout !== targetTimeout
    ) {
      cadRef.send({ type: 'setOperationTimeout', operationTimeout: targetTimeout });
    }
    const defaults = { hidden: [], isolated: [], opacity: [] };
    const target = entry?.components ?? defaults;
    const before = previous?.components ?? defaults;
    if (!first && same(before, target)) {
      return;
    }
    const snapshot = modelInteractionRef.getSnapshot().context;
    const live = snapshot.unitsById[unitId];
    const current = {
      hidden: [...(live?.hiddenComponentIds ?? [])].sort(),
      isolated: [...(live?.isolatedComponentIds ?? [])].sort(),
      opacity: Object.entries(live?.opacityByComponentId ?? {})
        .filter(([, opacity]) => opacity !== 1)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, opacity]) => ({ id, opacity })),
    };
    const merged = {
      ...current,
      hidden:
        first || (!Object.hasOwn(localPatch?.components ?? {}, 'hidden') && !same(before.hidden, target.hidden))
          ? target.hidden
          : current.hidden,
      isolated:
        first || (!Object.hasOwn(localPatch?.components ?? {}, 'isolated') && !same(before.isolated, target.isolated))
          ? target.isolated
          : current.isolated,
      opacity:
        first || (!Object.hasOwn(localPatch?.components ?? {}, 'opacity') && !same(before.opacity, target.opacity))
          ? target.opacity
          : current.opacity,
    };
    if (same(current, merged)) {
      return;
    }
    const unitsById = { ...serializeModelComponentDisplayState(snapshot)?.unitsById };
    unitsById[unitId] = {
      hiddenComponentIds: merged.hidden,
      isolatedComponentIds: merged.isolated,
      opacityByComponentId: Object.fromEntries(merged.opacity.map(({ id, opacity }) => [id, opacity])),
    };
    modelInteractionRef.send({ type: 'restoreComponentDisplay', componentDisplay: { schemaVersion: 1, unitsById } });
  }, [cadRef, entry, localPatch, modelInteractionRef, recordPresent, unitId]);
  useEffect(() => {
    if (recordPresent && digest) {
      onApplied?.(path, digest);
    }
  }, [digest, onApplied, path, recordPresent]);
  useEffect(() => {
    if (!ready) {
      return;
    }
    const previous = observed;
    const next = { operationTimeout, components };
    if (same(previous, next)) {
      return;
    }
    // oxlint-disable-next-line react/set-state-in-effect -- Snapshot the external owner state before comparing human edits.
    setObserved(next);
    if (!previous) {
      return;
    }
    const changedTimeout =
      previous.operationTimeout !== operationTimeout &&
      operationTimeout !== (entry?.renderTimeout ?? defaultOperationTimeout);
    const changedComponents =
      !same(previous.components, components) &&
      !same(components, entry?.components ?? { hidden: [], isolated: [], opacity: [] });
    if (!changedTimeout && !changedComponents) {
      return;
    }
    void write(path, { ...entry, renderTimeout: operationTimeout, components });
  }, [components, entry, observed, path, ready, operationTimeout, write]);
  return null;
}
