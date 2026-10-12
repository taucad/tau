/* oxlint-disable eslint/no-await-in-loop -- Restore must create required view files in order before layout adoption. */
/* oxlint-disable react/refs -- Store callbacks and Restore read refs only after commit. */
/* oxlint-disable typescript/no-restricted-types -- Refused record bytes may be absent (null), as the store reports them. */
import { useObservation } from '@taucad/fs-client/react/use-observation';
import { ObservationService } from '@taucad/fs-client/observation-service';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Topic } from '@taucad/events';
import { useSelector } from '@xstate/react';
import type { ViewerNode, WorkbenchLaneNode, WorkbenchLayout, WorkbenchTab, WorkbenchView } from '@taucad/workbench';
import { workbenchPaths } from '@taucad/workbench';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useProject } from '#hooks/use-project.js';
import { useFeature } from '#flags/use-feature.js';
import { useFlushOnClose } from '#hooks/use-flush-on-close.js';
import { useProjectWorkspace } from '#routes/w.$workspace.$project/project-workspace-context.js';
import { createWorkbenchLayoutStore } from '#routes/w.$workspace.$project/workbench-layout-controller.js';
import type {
  WorkbenchLayoutController,
  WorkbenchLayoutSnapshot,
} from '#routes/w.$workspace.$project/workbench-layout-controller.js';
import { ensureViewFile } from '#workbench-records/view-actions.js';
import { confirmFlush } from '#workbench-records/record-health.js';
import type { RecordHealth } from '#workbench-records/record-health.js';
import { recordIssueState, usePublishRecordIssue } from '#workbench-records/record-issues.js';
import type { RecordIssue } from '#workbench-records/record-issues.js';
import type { PreviousWorkbenchLayout } from '#types/editor.types.js';

const storeMounts = new WeakMap<ReturnType<typeof createWorkbenchLayoutStore>, number>();

const emptyViewer: ViewerNode = { kind: 'group', tabs: [] };
const emptyWorkbench: WorkbenchLaneNode = { kind: 'group', tabs: [] };
const fallbackLayout = (): WorkbenchLayout => ({
  version: 1,
  lanes: { chat: true, workbench: true },
  viewer: emptyViewer,
  workbench: emptyWorkbench,
});

const tabsIn = (node: ViewerNode | WorkbenchLaneNode): readonly WorkbenchTab[] =>
  node.kind === 'group' ? node.tabs : node.children.flatMap(tabsIn);
const viewIdsIn = (node: ViewerNode): string[] =>
  tabsIn(node)
    .filter((tab): tab is Extract<WorkbenchTab, { kind: 'view' }> => tab.kind === 'view')
    .map((tab) => tab.view);

/** Watches the live root and applies valid arrangements through the registered Dockview owners. */
export function WorkbenchRecordHost(): React.JSX.Element {
  const { parameterFiles, workbenchFiles, watchRecordFile, contentService } = useFileManager();
  const { projectId, editorRef, registerWorkbenchRecordProducer, viewRecords, setAppliedWorkbenchRevision } =
    useProject();
  const root = `/projects/${projectId}`;
  const desktopLayout = useSelector(editorRef, (state) => state.context.panelState.desktopLayout);
  const { registerLayoutController } = useProjectWorkspace();
  const isTauDebugEnabled = useFeature('tauDebug');
  const debugRef = useRef(isTauDebugEnabled);
  useEffect(() => {
    debugRef.current = isTauDebugEnabled;
  }, [isTauDebugEnabled]);
  const [status, setStatus] = useState('');
  const [statusVersion, setStatusVersion] = useState(0);
  const announce = useCallback((message: string): void => {
    setStatus(message);
    setStatusVersion((version) => version + 1);
  }, []);
  const [refusal, setRefusal] =
    useState<
      Readonly<{ code: 'INVALID_RECORD' | 'NEWER_RECORD'; message: string; bytes: Uint8Array<ArrayBuffer> | null }>
    >();
  const [health, setHealth] = useState<RecordHealth>();
  const snapshotRef = useRef<WorkbenchLayoutSnapshot | undefined>(undefined);
  const changes = useMemo(() => new Topic<void>({ name: 'WorkbenchRecordHost.changes' }), []);
  const restoringRef = useRef(false);
  const restoreAvailability = useCallback((): Pick<
    WorkbenchLayoutSnapshot,
    'restoreTarget' | 'restoreUnavailable' | 'restoring'
  > => {
    const previous = editorRef.getSnapshot().context.previousLayout;
    const missing = previous && viewIdsIn(previous.layout.viewer).find((id) => !previous.views[id]);
    return {
      restoreTarget: previous ? JSON.stringify(previous) : undefined,
      restoreUnavailable: previous
        ? missing
          ? `The prior view ${missing} has no saved record.`
          : undefined
        : 'No previous layout is saved.',
      restoring: restoringRef.current,
    };
  }, [editorRef]);
  const refreshRestore = useCallback((): void => {
    if (snapshotRef.current) {
      snapshotRef.current = { ...snapshotRef.current, ...restoreAvailability() };
      changes.emit();
    }
  }, [changes, restoreAvailability]);
  useEffect(() => {
    let previous = editorRef.getSnapshot().context.previousLayout;
    const subscription = editorRef.subscribe((state) => {
      if (state.context.previousLayout !== previous) {
        previous = state.context.previousLayout;
        refreshRestore();
      }
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [editorRef, refreshRestore]);
  const viewerRef = useRef<((node: ViewerNode, applied: () => void) => void) | undefined>(undefined);
  const workbenchRef = useRef<((node: WorkbenchLaneNode, applied: () => void) => void) | undefined>(undefined);
  const applicationRef = useRef({ epoch: 0, viewer: false, workbench: false });
  const appliedViewerRef = useRef<ViewerNode | undefined>(undefined);
  const appliedWorkbenchRef = useRef<WorkbenchLaneNode | undefined>(undefined);
  const personViewerRef = useRef<ViewerNode | undefined>(undefined);
  const personWorkbenchRef = useRef<WorkbenchLaneNode | undefined>(undefined);
  const acknowledge = useCallback(
    (epoch: number): void => {
      const application = applicationRef.current;
      const snapshot = snapshotRef.current;
      if (
        application.epoch !== epoch ||
        !application.viewer ||
        !application.workbench ||
        !snapshot ||
        snapshot.layoutDigest === 'missing'
      ) {
        return;
      }
      const lanes = editorRef.getSnapshot().context.panelState.desktopLayout;
      if (lanes.chatOpen !== snapshot.layout.lanes.chat || lanes.workbenchOpen !== snapshot.layout.lanes.workbench) {
        return;
      }
      setAppliedWorkbenchRevision(workbenchPaths.layout, snapshot.layoutDigest);
    },
    [editorRef, setAppliedWorkbenchRevision],
  );
  const appliedRef = useRef<WorkbenchLayout | undefined>(undefined);
  const rememberedViewsRef = useRef(new Map<string, WorkbenchView>());
  useEffect(() => {
    for (const [id, record] of viewRecords) {
      rememberedViewsRef.current.set(id, record);
    }
  }, [viewRecords]);
  const rollback = useCallback(
    (layout: WorkbenchLayout): PreviousWorkbenchLayout => ({
      layout,
      views: Object.fromEntries(
        viewIdsIn(layout.viewer).flatMap((id) => {
          const record = rememberedViewsRef.current.get(id);
          return record ? [[id, record] as const] : [];
        }),
      ),
    }),
    [],
  );
  const store = useMemo(
    () =>
      createWorkbenchLayoutStore({
        root,
        editDebounce: 500,
        files: parameterFiles,
        onHealth: setHealth,
        onChange: (state, source, locallyAuthored) => {
          const epoch = ++applicationRef.current.epoch;
          applicationRef.current.viewer = false;
          applicationRef.current.workbench = false;
          setAppliedWorkbenchRevision(workbenchPaths.layout, undefined);
          if (state.refusal) {
            appliedViewerRef.current = undefined;
            appliedWorkbenchRef.current = undefined;
            setRefusal({ ...state.refusal, bytes: state.bytes });
            snapshotRef.current = undefined;
            changes.emit();
            return;
          }
          setRefusal(undefined);
          if (!state.layout) {
            appliedViewerRef.current = undefined;
            appliedWorkbenchRef.current = undefined;
            snapshotRef.current = undefined;
            changes.emit();
            return;
          }
          const previous = appliedRef.current;
          const next = state.layout;
          const refused: WorkbenchLayoutSnapshot['refused'] = debugRef.current
            ? []
            : tabsIn(next.workbench)
                .filter(
                  (tab): tab is Extract<WorkbenchTab, { kind: 'pane' }> =>
                    tab.kind === 'pane' && (tab.pane === 'kernel' || tab.pane === 'console'),
                )
                .map((tab) => ({ tab, reason: 'debug-only' }));
          snapshotRef.current = {
            layout: next,
            refused,
            layoutDigest: state.digest,
            ...restoreAvailability(),
          };
          changes.emit();
          if (source === 'read' && previous && JSON.stringify(previous) !== JSON.stringify(next)) {
            editorRef.send({
              type: 'setPreviousLayout',
              layout: rollback(previous),
            });
          }
          appliedRef.current = next;
          const viewer = viewerRef.current;
          const workbench = workbenchRef.current;
          const sameNode = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);
          if (personViewerRef.current && sameNode(personViewerRef.current, next.viewer)) {
            personViewerRef.current = undefined;
          }
          if (personWorkbenchRef.current && sameNode(personWorkbenchRef.current, next.workbench)) {
            personWorkbenchRef.current = undefined;
          }
          const staleViewer =
            personViewerRef.current &&
            (Boolean(locallyAuthored?.viewer) || (previous && sameNode(previous.viewer, next.viewer)));
          if (viewer && !staleViewer) {
            if (appliedViewerRef.current && sameNode(appliedViewerRef.current, next.viewer)) {
              applicationRef.current.viewer = true;
            } else {
              viewer(next.viewer, () => {
                if (applicationRef.current.epoch !== epoch || viewerRef.current !== viewer) {
                  return;
                }
                appliedViewerRef.current = next.viewer;
                applicationRef.current.viewer = true;
                acknowledge(epoch);
              });
            }
          }
          const staleWorkbench =
            personWorkbenchRef.current &&
            (Boolean(locallyAuthored?.workbench) || (previous && sameNode(previous.workbench, next.workbench)));
          if (workbench && !staleWorkbench) {
            if (appliedWorkbenchRef.current && sameNode(appliedWorkbenchRef.current, next.workbench)) {
              applicationRef.current.workbench = true;
            } else {
              workbench(next.workbench, () => {
                if (applicationRef.current.epoch !== epoch || workbenchRef.current !== workbench) {
                  return;
                }
                appliedWorkbenchRef.current = next.workbench;
                applicationRef.current.workbench = true;
                acknowledge(epoch);
              });
            }
          }
          const { desktopLayout } = editorRef.getSnapshot().context.panelState;
          const intendedLanes = store.intendedLayout()?.lanes;
          const chatOpen =
            locallyAuthored?.lanes?.chat !== undefined && intendedLanes?.chat !== next.lanes.chat
              ? desktopLayout.chatOpen
              : next.lanes.chat;
          const workbenchOpen =
            locallyAuthored?.lanes?.workbench !== undefined && intendedLanes?.workbench !== next.lanes.workbench
              ? desktopLayout.workbenchOpen
              : next.lanes.workbench;
          if (desktopLayout.chatOpen !== chatOpen || desktopLayout.workbenchOpen !== workbenchOpen) {
            editorRef.send({
              type: 'setPanelState',
              panelState: {
                desktopLayout: {
                  chatOpen,
                  workbenchOpen,
                },
              },
            });
          }
          acknowledge(epoch);
          announce('Workbench arrangement updated.');
        },
        onError: () => {
          // The record's health carries the failure to the settings trigger.
          appliedViewerRef.current = undefined;
          appliedWorkbenchRef.current = undefined;
          applicationRef.current.epoch++;
          applicationRef.current.viewer = false;
          applicationRef.current.workbench = false;
          setAppliedWorkbenchRevision(workbenchPaths.layout, undefined);
        },
      }),
    [
      acknowledge,
      announce,
      changes,
      editorRef,
      parameterFiles,
      restoreAvailability,
      rollback,
      root,
      setAppliedWorkbenchRevision,
    ],
  );
  const firstReadRef = useRef<{ store: typeof store; promise: Promise<boolean> } | undefined>(undefined);
  const firstRead = useCallback(async (): Promise<boolean> => {
    const existing = firstReadRef.current;
    if (existing?.store === store) {
      return existing.promise;
    }
    const readOnce = async (): Promise<boolean> => {
      try {
        const read = await store.read(true);
        if (read) {
          return true;
        }
        if (store.ready()) {
          return true;
        }
        const replacement = firstReadRef.current;
        if (replacement?.store === store && replacement.promise !== promise) {
          return await replacement.promise;
        }
        return false;
      } finally {
        const { current } = firstReadRef;
        if (current?.store === store && current.promise === promise) {
          firstReadRef.current = undefined;
        }
      }
    };
    const promise = readOnce();
    firstReadRef.current = { store, promise };
    return promise;
  }, [store]);

  const observation = useMemo(
    () =>
      new ObservationService({
        resource: `${root}/${workbenchPaths.layout}`,
        watch: (invalidate, reset) =>
          watchRecordFile(`${root}/${workbenchPaths.layout}`, (event) => {
            if (event.type === 'reset') {
              reset();
            } else {
              invalidate();
            }
          }),
        invalidate: store.invalidateRead,
        // Until the content service binds, every read joins the first read of this store.
        read: async () => (contentService && store.ready() ? store.read() : firstRead()),
      }),
    [contentService, firstRead, root, store, watchRecordFile],
  );
  useEffect(() => {
    firstReadRef.current = undefined;
    // This source's applications belong to its lease; retiring it starts a new epoch.
    const lease = observation.acquire();
    return () => {
      lease.release();
      applicationRef.current.epoch++;
      applicationRef.current.viewer = false;
      applicationRef.current.workbench = false;
      setAppliedWorkbenchRevision(workbenchPaths.layout, undefined);
    };
  }, [observation, setAppliedWorkbenchRevision]);
  const observed = useObservation(observation);
  const sourceHealth: RecordHealth | undefined = observed.error
    ? { ...(health ?? store.health()), read: 'unavailable', error: observed.error }
    : health;
  const issueState = recordIssueState(refusal, sourceHealth);
  const issue = useMemo((): RecordIssue | undefined => {
    if (!issueState) {
      return undefined;
    }
    return {
      kind: 'layout',
      path: workbenchPaths.layout,
      state: issueState,
      message: refusal?.message ?? sourceHealth?.error,
      bytes: refusal?.bytes ?? null,
      writing: health?.writing ?? false,
      retryRead: async () => {
        if (observed.error) {
          observation.refresh();
          return false;
        }
        return store.retryRead();
      },
      retrySave: async () => store.flush(),
      reset: async (reviewed) => store.reset(appliedRef.current ?? fallbackLayout(), reviewed),
    };
  }, [sourceHealth?.error, health?.writing, issueState, observed.error, observation, refusal, store]);
  usePublishRecordIssue(projectId, workbenchPaths.layout, issue);
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
  useFlushOnClose(async () => confirmFlush(store.flush, 'Pane layout is not confirmed saved.'), { stage: 'producer' });
  useEffect(() => {
    const current = store.intendedLayout();
    if (
      !current ||
      (current.lanes.chat === desktopLayout.chatOpen && current.lanes.workbench === desktopLayout.workbenchOpen)
    ) {
      return;
    }
    void store.edit({
      ...current,
      lanes: {
        chat: desktopLayout.chatOpen,
        workbench: desktopLayout.workbenchOpen,
      },
    });
  }, [desktopLayout.chatOpen, desktopLayout.workbenchOpen, store]);

  const controller = useMemo<WorkbenchLayoutController>(
    () => ({
      snapshot: () => snapshotRef.current,
      subscribe: (listener) => changes.subscribe(listener),
      restorePreviousArrangement: async (expected) => {
        const previous = editorRef.getSnapshot().context.previousLayout;
        const current = store.snapshot().layout;
        const eligible = (): boolean =>
          JSON.stringify(editorRef.getSnapshot().context.previousLayout) === expected.target &&
          store.snapshot().digest === expected.layoutDigest &&
          !restoreAvailability().restoreUnavailable &&
          expected.eligible();
        if (restoringRef.current || !previous || !current || !eligible()) {
          return false;
        }
        restoringRef.current = true;
        refreshRestore();
        let saved = false;
        try {
          // Read before seed recreation; never bind a stale result to the newest layout.
          if (!(await store.read()) || !eligible()) {
            return false;
          }
          for (const viewId of viewIdsIn(previous.layout.viewer)) {
            if (!eligible()) {
              return false;
            }
            const seed = previous.views[viewId];
            if (
              !seed ||
              !(await ensureViewFile({
                root,
                viewId,
                files: { ...parameterFiles, ...workbenchFiles },
                seed,
                eligible,
                onError: (error) => {
                  announce(error instanceof Error ? error.message : 'View could not be restored.');
                },
              }))
            ) {
              return false;
            }
          }
          const restored = await store.restore(previous.layout, expected.layoutDigest, eligible);
          saved = restored;
          if (restored && JSON.stringify(editorRef.getSnapshot().context.previousLayout) === expected.target) {
            editorRef.send({ type: 'setPreviousLayout', layout: rollback(current) });
            announce('Restore written.');
          }
          return restored;
        } finally {
          if (!saved) {
            await store.read(true);
          }
          restoringRef.current = false;
          refreshRestore();
        }
      },
      registerViewer: (apply) => {
        viewerRef.current = apply;
        applicationRef.current.viewer = false;
        setAppliedWorkbenchRevision(workbenchPaths.layout, undefined);
        const current = store.snapshot().layout;
        if (current) {
          const { epoch } = applicationRef.current;
          apply(current.viewer, () => {
            if (applicationRef.current.epoch !== epoch || viewerRef.current !== apply) {
              return;
            }
            applicationRef.current.viewer = true;
            appliedViewerRef.current = current.viewer;
            acknowledge(epoch);
          });
        }
        return () => {
          if (viewerRef.current === apply) {
            viewerRef.current = undefined;
            appliedViewerRef.current = undefined;
            applicationRef.current.viewer = false;
            setAppliedWorkbenchRevision(workbenchPaths.layout, undefined);
          }
        };
      },
      registerWorkbench: (apply) => {
        workbenchRef.current = apply;
        applicationRef.current.workbench = false;
        setAppliedWorkbenchRevision(workbenchPaths.layout, undefined);
        const current = store.snapshot().layout;
        if (current) {
          const { epoch } = applicationRef.current;
          apply(current.workbench, () => {
            if (applicationRef.current.epoch !== epoch || workbenchRef.current !== apply) {
              return;
            }
            applicationRef.current.workbench = true;
            appliedWorkbenchRef.current = current.workbench;
            acknowledge(epoch);
          });
        }
        return () => {
          if (workbenchRef.current === apply) {
            workbenchRef.current = undefined;
            appliedWorkbenchRef.current = undefined;
            applicationRef.current.workbench = false;
            setAppliedWorkbenchRevision(workbenchPaths.layout, undefined);
          }
        };
      },
      personViewerChanged: (node) => {
        if (!store.ready()) {
          return;
        }
        personViewerRef.current = node;
        appliedViewerRef.current = node;
        const next = {
          ...(store.intendedLayout() ?? fallbackLayout()),
          viewer: node,
        };
        void store.edit(next);
      },
      personWorkbenchChanged: (node) => {
        if (!store.ready()) {
          if (typeof node === 'function') {
            const change = node;
            const applyAfterFirstRead = async (): Promise<void> => {
              if (!(await firstRead())) {
                return;
              }
              const current = store.intendedLayout() ?? fallbackLayout();
              const workbench = change(current.workbench);
              personWorkbenchRef.current = workbench;
              await store.edit({ ...current, workbench });
            };
            void applyAfterFirstRead();
          }
          return;
        }
        const current = store.intendedLayout() ?? fallbackLayout();
        const next = {
          ...current,
          workbench: typeof node === 'function' ? node(current.workbench) : node,
        };
        personWorkbenchRef.current = next.workbench;
        if (typeof node !== 'function') {
          appliedWorkbenchRef.current = node;
        }
        void store.edit(next);
      },
    }),
    [
      acknowledge,
      announce,
      changes,
      editorRef,
      firstRead,
      parameterFiles,
      refreshRestore,
      restoreAvailability,
      rollback,
      root,
      setAppliedWorkbenchRevision,
      store,
      workbenchFiles,
    ],
  );

  useEffect(() => {
    const { current } = snapshotRef;
    if (!current) {
      return;
    }
    const refused: WorkbenchLayoutSnapshot['refused'] = isTauDebugEnabled
      ? []
      : tabsIn(current.layout.workbench)
          .filter(
            (tab): tab is Extract<WorkbenchTab, { kind: 'pane' }> =>
              tab.kind === 'pane' && (tab.pane === 'kernel' || tab.pane === 'console'),
          )
          .map((tab) => ({ tab, reason: 'debug-only' }));
    snapshotRef.current = { ...current, refused };
    changes.emit();
  }, [changes, isTauDebugEnabled]);

  useLayoutEffect(() => registerLayoutController(controller), [controller, registerLayoutController]);
  return (
    <div role='status' aria-live='polite' className='sr-only'>
      <span key={statusVersion}>{status}</span>
    </div>
  );
}
