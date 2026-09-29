import { useSelector } from '@xstate/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { workbenchPaths, workbenchRecords } from '@taucad/workbench';
import type { WorkbenchView } from '@taucad/workbench';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useFlushOnClose } from '#hooks/use-flush-on-close.js';
import { createWorkbenchViewStore } from '#workbench-records/view-store.js';
import { digestBytes } from '#utils/crypto.utils.js';
import type { ActorRefFrom } from 'xstate';
import { useProject } from '#hooks/use-project.js';
import { useViewSettingsSync } from '#hooks/use-view-settings-sync.js';
import type { editorMachine } from '#machines/editor.machine.js';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import type { projectMachine } from '#machines/project.machine.js';

const storeMounts = new WeakMap<ReturnType<typeof createWorkbenchViewStore>, number>();

/**
 * The write side of every live view's durable settings (R6).
 *
 * One host per project, mounted beside `ProjectPersistenceGuard` rather than inside the viewer: the
 * owner of a durable field is the actor that holds it, and those actors outlive the pane that
 * happens to be showing them. A project whose panes are closed, whose window is unfocused or whose
 * panel is mid-drag still writes what its owners hold, and writes it exactly once.
 */
export function ViewSettingsSyncHost(): React.JSX.Element {
  const { projectRef, editorRef, viewGraphics } = useProject();

  return (
    <>
      {[...viewGraphics].map(([viewId, graphicsRef]) => (
        <ViewSettingsSyncEntry
          key={viewId}
          viewId={viewId}
          graphicsRef={graphicsRef}
          projectRef={projectRef}
          editorRef={editorRef}
        />
      ))}
    </>
  );
}

/** One live view: its graphics actor, the CAD actor of the entry it renders, and the editor store. */
function ViewSettingsSyncEntry({
  viewId,
  graphicsRef,
  projectRef,
  editorRef,
}: {
  readonly viewId: string;
  readonly graphicsRef: ActorRefFrom<typeof graphicsMachine>;
  readonly projectRef: ActorRefFrom<typeof projectMachine>;
  readonly editorRef: ActorRefFrom<typeof editorMachine>;
}): React.JSX.Element {
  /* The editor record is what names a view's entry; the pane only mirrors it. */
  const { projectId, viewRecords, viewEntryPaths, setViewRecord, setViewEntryPath, registerWorkbenchRecordProducer,
    setAppliedWorkbenchRevision } = useProject();
  const { parameterFiles, subscribeWorkbenchRecord } = useFileManager();
  const root = `/projects/${projectId}`;
  const [notice, setNotice] = useState<{ code: 'INVALID_RECORD' | 'NEWER_RECORD'; message: string }>();
  const [ioError, setIoError] = useState<string>();
  const [, recordTick] = useState(0);
  const recordGenerationRef = useRef(0);
  const recordPath = workbenchPaths.view(viewId);
  // oxlint-disable-next-line react/refs -- The store invokes these callbacks after render.
  const store = useMemo(() => createWorkbenchViewStore({
    root, viewId, files: parameterFiles, editDebounce: 500,
    onChange: (state) => {
      recordGenerationRef.current++;
      setAppliedWorkbenchRevision(recordPath, undefined);
      recordTick((value) => value + 1);
      if (state.refusal) { setNotice(state.refusal); return; }
      setNotice(undefined);
      setIoError(undefined);
      if (state.record) {
        setViewRecord(viewId, state.record);
        setViewEntryPath(viewId, state.record.entryPath);
      }
    },
    onError: (error) => { recordGenerationRef.current++; setAppliedWorkbenchRevision(recordPath, undefined);
      setIoError(error instanceof Error ? error.message : 'View record unavailable.'); },
  }), [parameterFiles, recordPath, root, setAppliedWorkbenchRevision, setViewEntryPath, setViewRecord, viewId]);
  useEffect(() => {
    const unsubscribe = subscribeWorkbenchRecord(workbenchPaths.view(viewId), () => { void store.read(); });
    void store.read(true);
    return () => { unsubscribe(); recordGenerationRef.current++;
      setAppliedWorkbenchRevision(recordPath, undefined); };
  }, [recordPath, setAppliedWorkbenchRevision, store, subscribeWorkbenchRecord, viewId]);
  useEffect(() => {
    storeMounts.set(store, (storeMounts.get(store) ?? 0) + 1);
    return () => {
      storeMounts.set(store, (storeMounts.get(store) ?? 1) - 1);
      queueMicrotask(() => { if (storeMounts.get(store) === 0) { store.dispose(); } });
    };
  }, [store]);
  useEffect(() => registerWorkbenchRecordProducer(async () => store.flush()), [registerWorkbenchRecordProducer, store]);
  useFlushOnClose(async () => {
    if (!(await store.flush())) { throw new Error(`View ${viewId} could not be saved.`); }
  }, { stage: 'producer' });
  const record = viewRecords.get(viewId);
  const writeRecord = useCallback(async (next: WorkbenchView) => store.edit(next), [store]);
  const onRecordApplied = useCallback((applied: WorkbenchView): void => {
    const state = store.snapshot();
    if (state.record !== applied || !state.bytes || state.refusal) { return; }
    const generation = recordGenerationRef.current;
    const { bytes } = state;
    async function acknowledgeAppliedBytes(): Promise<void> {
      const digest = await digestBytes(bytes);
      const current = store.snapshot();
      if (generation === recordGenerationRef.current && current.record === applied && current.bytes === bytes && !current.refusal) {
        setAppliedWorkbenchRevision(recordPath, digest);
      }
    }
    void acknowledgeAppliedBytes();
  }, [recordPath, setAppliedWorkbenchRevision, store]);
  const entryPath = record?.entryPath ?? viewEntryPaths.get(viewId);
  const cadRef = useSelector(projectRef, (state) =>
    entryPath === null || entryPath === undefined ? undefined : state.context.geometryUnits.get(entryPath),
  );

  useViewSettingsSync({ viewId, entryPath: entryPath ?? undefined, graphicsRef, cadRef, editorRef, record,
    writeRecord, onRecordApplied,
    recordReady: store.ready() && store.snapshot().refusal === undefined,
  });

  return <>{notice ? <div role='alert'>{notice.message}{notice.code === 'INVALID_RECORD' ? <button type='button' onClick={() => {
    const replacement = record ?? workbenchRecords.view.schema.parse({ version: 1, entryPath: entryPath ?? null });
    void store.reset(replacement);
  }}>Reset</button> : null}</div> : null}{ioError ? <div role='alert'>{ioError}</div> : null}</>;
}
