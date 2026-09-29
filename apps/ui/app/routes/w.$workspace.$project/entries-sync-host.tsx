import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from '@xstate/react';
import { workbenchPaths, workbenchRecords } from '@taucad/workbench';
import type { WorkbenchEntries } from '@taucad/workbench';
import type { ActorRefFrom } from 'xstate';
import { defaultRenderTimeout } from '#constants/editor.constants.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useFlushOnClose } from '#hooks/use-flush-on-close.js';
import { useProject } from '#hooks/use-project.js';
import { createSourceModelInteractionUnitId, serializeModelComponentDisplayState } from '#machines/model-interaction.machine.js';
import type { modelInteractionMachine } from '#machines/model-interaction.machine.js';
import type { cadMachine } from '#machines/cad.machine.js';
import { createWorkbenchEntriesStore } from '#workbench-records/entries-store.js';
import { digestBytes } from '#utils/crypto.utils.js';

type Entry = WorkbenchEntries['entries'][string];
const storeMounts = new WeakMap<ReturnType<typeof createWorkbenchEntriesStore>, number>();
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** One project-lifetime reader and writer for shared per-file workbench settings. */
export function EntriesSyncHost(): React.JSX.Element {
  const { parameterFiles, subscribeWorkbenchRecord } = useFileManager();
  const { projectId, geometryUnits, modelInteractionRef, entriesRecord, setEntriesRecord, registerWorkbenchRecordProducer,
    registerEntryPathChange, setAppliedEntryRevision } = useProject();
  const root = `/projects/${projectId}`;
  const [notice, setNotice] = useState<{ code: 'INVALID_RECORD' | 'NEWER_RECORD'; message: string }>();
  const [ioError, setIoError] = useState<string>();
  const [, tick] = useState(0);
  const generationRef = useRef(0);
  const acknowledgedRef = useRef(new Set<string>());
  const [entriesDigest, setEntriesDigest] = useState<{ bytes: Uint8Array<ArrayBuffer>; digest: `sha256:${string}`; generation: number }>();
  const clearApplied = useCallback((): void => {
    for (const path of acknowledgedRef.current) { setAppliedEntryRevision(path, undefined); }
    acknowledgedRef.current.clear();
  }, [setAppliedEntryRevision]);
  // oxlint-disable-next-line react/refs -- Store callbacks run after render.
  const store = useMemo(() => createWorkbenchEntriesStore({ root, files: parameterFiles, editDebounce: 500,
    onChange: (state) => {
      const generation = ++generationRef.current;
      setIoError(undefined);
      clearApplied();
      setEntriesDigest(undefined);
      tick((value) => value + 1);
      setNotice(state.refusal);
      if (state.record) { setEntriesRecord(state.record); }
      if (state.record && state.bytes && !state.refusal) {
        const { bytes } = state;
        const captureAppliedBytes = async (): Promise<void> => {
          const digest = await digestBytes(bytes);
          if (generation === generationRef.current) { setEntriesDigest({ bytes, digest, generation }); }
        };
        void captureAppliedBytes();
      }
    },
    onError: (error) =>{ generationRef.current++; clearApplied(); setEntriesDigest(undefined);
      setIoError(error instanceof Error ? error.message : 'Entry settings unavailable.'); },
  }), [clearApplied, parameterFiles, root, setEntriesRecord]);
  useEffect(() => {
    const unsubscribe = subscribeWorkbenchRecord(workbenchPaths.entries, () => { void store.read(); });
    void store.read(true);
    return () => { unsubscribe(); generationRef.current++; clearApplied(); setEntriesDigest(undefined); };
  }, [clearApplied, store, subscribeWorkbenchRecord]);
  useEffect(() => {
    storeMounts.set(store, (storeMounts.get(store) ?? 0) + 1);
    return () => {
      storeMounts.set(store, (storeMounts.get(store) ?? 1) - 1);
      queueMicrotask(() => { if (storeMounts.get(store) === 0) { store.dispose(); } });
    };
  }, [store]);
  useEffect(() => registerWorkbenchRecordProducer( async () => store.flush()), [registerWorkbenchRecordProducer, store]);
  useEffect(() => registerEntryPathChange(store.changePaths), [registerEntryPathChange, store]);
  useFlushOnClose(async () => {
    if (!(await store.flush())) { throw new Error('Entry settings could not be saved.'); }
  }, { stage: 'producer' });
  const write = useCallback( async (path: string, next: Entry) => store.edit(path, next), [store]);
  const ready = store.ready() && store.snapshot().refusal === undefined;
  const onEntryApplied = useCallback((path: string, digest: `sha256:${string}`): void => {
    const state = store.snapshot();
    if (!entriesDigest || entriesDigest.generation !== generationRef.current || entriesDigest.digest !== digest ||
      state.bytes !== entriesDigest.bytes || state.refusal) { return; }
    acknowledgedRef.current.add(path);
    setAppliedEntryRevision(path, digest);
  }, [entriesDigest, setAppliedEntryRevision, store]);
  return <>
    {[...geometryUnits].map(([path, cadRef]) => <EntryOwner key={path} path={path} cadRef={cadRef}
      modelInteractionRef={modelInteractionRef} entry={entriesRecord?.entries[path]} recordPresent={entriesRecord !== undefined}
      ready={ready} write={write} digest={entriesDigest?.digest} onApplied={onEntryApplied} />)}
    {notice ? <div role='alert'>{notice.message}{notice.code === 'INVALID_RECORD' ? <button type='button' onClick={() => {
      void store.reset(entriesRecord ?? workbenchRecords.entries.schema.parse({ version: 1, entries: {} }));
    }}>Reset</button> : null}</div> : null}
    {ioError ? <div role='alert'>{ioError}</div> : null}
  </>;
}

/** The entry's live owner boundary, exported for a focused behavior regression.
 * @internal
 */
export function EntryOwner({ path, cadRef, modelInteractionRef, entry, recordPresent, ready, write, digest, onApplied }: Readonly<{
  path: string;
  cadRef: ActorRefFrom<typeof cadMachine>;
  modelInteractionRef: ActorRefFrom<typeof modelInteractionMachine>;
  entry: Entry | undefined;
  recordPresent: boolean;
  ready: boolean;
  write: (path: string, next: Entry) => Promise<boolean>;
  digest?: `sha256:${string}`;
  onApplied?: (path: string, digest: `sha256:${string}`) => void;
// oxlint-disable-next-line typescript/no-restricted-types -- This React owner renders no DOM.
}>): React.JSX.Element | null {
  const renderTimeout = useSelector(cadRef, (state) => state.context.renderTimeout);
  const unitId = createSourceModelInteractionUnitId(path);
  const componentUnit = useSelector(modelInteractionRef, (state) => state.context.unitsById[unitId]);
  const components = useMemo(() => ({
    hidden: [...(componentUnit?.hiddenComponentIds ?? [])].sort(),
    isolated: [...(componentUnit?.isolatedComponentIds ?? [])].sort(),
    opacity: Object.entries(componentUnit?.opacityByComponentId ?? {}).filter(([, opacity]) => opacity !== 1)
      .sort(([a], [b]) => a.localeCompare(b)).map(([id, opacity]) => ({ id, opacity })),
  }), [componentUnit]);
  const [observed, setObserved] = useState<{ renderTimeout: number; components: Entry['components'] }>();
  const appliedEntryRef = useRef<{ entry: Entry | undefined } | undefined>(undefined);
  useEffect(() => {
    if (!recordPresent) { return; }
    const previous = appliedEntryRef.current?.entry;
    const first = appliedEntryRef.current === undefined;
    appliedEntryRef.current = { entry };
    const targetTimeout = entry?.renderTimeout ?? defaultRenderTimeout;
    if ((first || previous?.renderTimeout !== entry?.renderTimeout) && cadRef.getSnapshot().context.renderTimeout !== targetTimeout) {
      cadRef.send({ type: 'setRenderTimeout', renderTimeout: targetTimeout });
    }
    const defaults = { hidden: [], isolated: [], opacity: [] };
    const target = entry?.components ?? defaults;
    const before = previous?.components ?? defaults;
    if (!first && same(before, target)) { return; }
    const snapshot = modelInteractionRef.getSnapshot().context;
    const live = snapshot.unitsById[unitId];
    const current = {
      hidden: [...(live?.hiddenComponentIds ?? [])].sort(),
      isolated: [...(live?.isolatedComponentIds ?? [])].sort(),
      opacity: Object.entries(live?.opacityByComponentId ?? {}).filter(([, opacity]) => opacity !== 1)
        .sort(([a], [b]) => a.localeCompare(b)).map(([id, opacity]) => ({ id, opacity })),
    };
    const merged = { ...current,
      hidden: first || !same(before.hidden, target.hidden) ? target.hidden : current.hidden,
      isolated: first || !same(before.isolated, target.isolated) ? target.isolated : current.isolated,
      opacity: first || !same(before.opacity, target.opacity) ? target.opacity : current.opacity,
    };
    if (same(current, merged)) { return; }
    const unitsById = { ...serializeModelComponentDisplayState(snapshot)?.unitsById };
    unitsById[unitId] = {
      hiddenComponentIds: merged.hidden,
      isolatedComponentIds: merged.isolated,
      opacityByComponentId: Object.fromEntries(merged.opacity.map(({ id, opacity }) => [id, opacity])),
    };
    modelInteractionRef.send({ type: 'restoreComponentDisplay', componentDisplay: { schemaVersion: 1, unitsById } });
  }, [cadRef, entry, modelInteractionRef, recordPresent, unitId]);
  useEffect(() => {
    if (recordPresent && digest) { onApplied?.(path, digest); }
  }, [digest, onApplied, path, recordPresent]);
  useEffect(() => {
    if (!ready) { return; }
    const previous = observed;
    const next = { renderTimeout, components };
    if (same(previous, next)) { return; }
    // oxlint-disable-next-line react/set-state-in-effect -- Snapshot the external owner state before comparing human edits.
    setObserved(next);
    if (!previous) { return; }
    const changedTimeout = previous.renderTimeout !== renderTimeout && renderTimeout !== (entry?.renderTimeout ?? defaultRenderTimeout);
    const changedComponents = !same(previous.components, components) && !same(components, entry?.components ?? { hidden: [], isolated: [], opacity: [] });
    if (!changedTimeout && !changedComponents) { return; }
    void write(path, { ...entry, renderTimeout, components });
  }, [components, entry, observed, path, ready, renderTimeout, write]);
  return null;
}
