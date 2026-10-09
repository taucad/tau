/* oxlint-disable typescript/no-restricted-types -- Refused record bytes may be absent (null), as the store reports them. */
import { useObservation } from '@taucad/fs-client/react/use-observation';
import { ObservationService } from '@taucad/fs-client/observation-service';
import { useSelector } from '@xstate/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { workbenchPaths, workbenchRecords } from '@taucad/workbench';
import type { WorkbenchView } from '@taucad/workbench';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useFlushOnClose } from '#hooks/use-flush-on-close.js';
import { createWorkbenchViewStore } from '#workbench-records/view-store.js';
import type { ViewRecordPatch } from '#workbench-records/view-store.js';
import { confirmFlush } from '#workbench-records/record-health.js';
import type { RecordHealth } from '#workbench-records/record-health.js';
import { recordIssueState, usePublishRecordIssue } from '#workbench-records/record-issues.js';
import type { RecordIssue } from '#workbench-records/record-issues.js';
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
}): null {
  /* The editor record is what names a view's entry; the pane only mirrors it. */
  const {
    projectId,
    viewRecords,
    viewEntryPaths,
    setViewRecord,
    setViewEntryPath,
    registerWorkbenchRecordProducer,
    setAppliedWorkbenchRevision,
  } = useProject();
  const { parameterFiles, watchRecordFile } = useFileManager();
  const root = `/projects/${projectId}`;
  const [notice, setNotice] =
    useState<
      Readonly<{ code: 'INVALID_RECORD' | 'NEWER_RECORD'; message: string; bytes: Uint8Array<ArrayBuffer> | null }>
    >();
  const [health, setHealth] = useState<RecordHealth>();
  const [, recordTick] = useState(0);
  const [localRecordReceipt, setLocalRecordReceipt] = useState<{
    record: WorkbenchView;
    patch: ViewRecordPatch;
  }>();
  const recordPath = workbenchPaths.view(viewId);
  const { store, advanceGeneration, currentGeneration } = useMemo(() => {
    let generation = 0;
    return {
      store: createWorkbenchViewStore({
        root,
        viewId,
        files: parameterFiles,
        editDebounce: 500,
        onHealth: setHealth,
        onChange: (state, _source, locallyAuthored) => {
          generation++;
          setLocalRecordReceipt(
            state.record && locallyAuthored ? { record: state.record, patch: locallyAuthored } : undefined,
          );
          setAppliedWorkbenchRevision(recordPath, undefined);
          recordTick((value) => value + 1);
          if (state.refusal) {
            setNotice({ ...state.refusal, bytes: state.bytes });
            return;
          }
          setNotice(undefined);
          if (state.record) {
            setViewRecord(viewId, state.record);
            setViewEntryPath(viewId, state.record.entryPath);
          }
        },
        onError: () => {
          // The record's health carries the failure to the settings trigger.
          generation++;
          setLocalRecordReceipt(undefined);
          setAppliedWorkbenchRevision(recordPath, undefined);
        },
      }),
      advanceGeneration: () => {
        generation++;
      },
      currentGeneration: () => generation,
    };
  }, [parameterFiles, recordPath, root, setAppliedWorkbenchRevision, setViewEntryPath, setViewRecord, viewId]);
  const observation = useMemo(
    () =>
      new ObservationService({
        resource: `${root}/${workbenchPaths.view(viewId)}`,
        watch: (invalidate, reset) =>
          watchRecordFile(`${root}/${workbenchPaths.view(viewId)}`, (event) => {
            if (event.type === 'reset') {
              reset();
            } else {
              invalidate();
            }
          }),
        invalidate: store.invalidateRead,
        read: async () => store.read(!store.ready()),
      }),
    [root, store, watchRecordFile, viewId],
  );
  useEffect(() => {
    // This source's applications belong to its lease; retiring it advances the generation.
    const lease = observation.acquire();
    return () => {
      lease.release();
      advanceGeneration();
      setAppliedWorkbenchRevision(recordPath, undefined);
    };
  }, [advanceGeneration, observation, recordPath, setAppliedWorkbenchRevision]);
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
  useFlushOnClose(
    async () =>
      confirmFlush(store.flush, `View settings for ${viewEntryPaths.get(viewId) ?? viewId} are not confirmed saved.`),
    { stage: 'producer' },
  );
  const record = viewRecords.get(viewId);
  const writeRecord = useCallback(async (next: WorkbenchView) => store.edit(next), [store]);
  const onRecordApplied = useCallback(
    (applied: WorkbenchView): void => {
      const state = store.snapshot();
      if (state.record !== applied || !state.bytes || state.refusal) {
        return;
      }
      const generation = currentGeneration();
      const { bytes } = state;
      async function acknowledgeAppliedBytes(): Promise<void> {
        const digest = await digestBytes(bytes);
        const current = store.snapshot();
        if (
          generation === currentGeneration() &&
          current.record === applied &&
          current.bytes === bytes &&
          !current.refusal
        ) {
          setAppliedWorkbenchRevision(recordPath, digest);
        }
      }
      void acknowledgeAppliedBytes();
    },
    [currentGeneration, recordPath, setAppliedWorkbenchRevision, store],
  );
  const entryPath = record?.entryPath ?? viewEntryPaths.get(viewId);
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
      kind: 'view',
      path: recordPath,
      entry: entryPath ?? undefined,
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
      reset: async (reviewed) =>
        store.reset(
          record ?? workbenchRecords.view.schema.parse({ version: 1, entryPath: entryPath ?? null }),
          reviewed,
        ),
    };
  }, [
    entryPath,
    sourceHealth?.error,
    health?.writing,
    issueState,
    notice,
    observed.error,
    observation,
    record,
    recordPath,
    store,
  ]);
  usePublishRecordIssue(projectId, recordPath, issue);
  const cadRef = useSelector(projectRef, (state) =>
    entryPath === null || entryPath === undefined ? undefined : state.context.geometryUnits.get(entryPath),
  );

  useViewSettingsSync({
    viewId,
    entryPath: entryPath ?? undefined,
    graphicsRef,
    cadRef,
    editorRef,
    record,
    recordLocalPatch: localRecordReceipt && localRecordReceipt.record === record ? localRecordReceipt.patch : undefined,
    writeRecord,
    onRecordApplied,
    recordReady: store.ready() && store.snapshot().refusal === undefined,
  });

  return null;
}
