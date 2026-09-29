/* oxlint-disable eslint/no-await-in-loop -- Restore must create required view files in order before layout adoption. */
/* oxlint-disable react/refs -- Store callbacks and Restore read refs only after commit. */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from '@xstate/react';
import type { ViewerNode, WorkbenchLaneNode, WorkbenchLayout, WorkbenchTab, WorkbenchView } from '@taucad/workbench';
import { workbenchPaths } from '@taucad/workbench';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useProject } from '#hooks/use-project.js';
import { useFeature } from '#flags/use-feature.js';
import { useFlushOnClose } from '#hooks/use-flush-on-close.js';
import { useProjectWorkspace } from '#routes/w.$workspace.$project/project-workspace-context.js';
import { createWorkbenchLayoutStore } from '#routes/w.$workspace.$project/workbench-layout-controller.js';
import type { WorkbenchLayoutController, WorkbenchLayoutSnapshot } from '#routes/w.$workspace.$project/workbench-layout-controller.js';
import { editViewFile } from '#workbench-records/view-actions.js';
import type { PreviousWorkbenchLayout } from '#types/editor.types.js';

const storeMounts = new WeakMap<ReturnType<typeof createWorkbenchLayoutStore>, number>();

const emptyViewer: ViewerNode = { kind: 'group', tabs: [] };
const emptyWorkbench: WorkbenchLaneNode = { kind: 'group', tabs: [] };
const fallbackLayout = (): WorkbenchLayout => ({
  version: 1, lanes: { chat: true, workbench: true }, viewer: emptyViewer, workbench: emptyWorkbench,
});

const tabsIn = (node: ViewerNode | WorkbenchLaneNode): readonly WorkbenchTab[] =>
  node.kind === 'group' ? node.tabs : node.children.flatMap(tabsIn);
const viewIdsIn = (node: ViewerNode): string[] => tabsIn(node)
  .filter((tab): tab is Extract<WorkbenchTab, { kind: 'view' }> => tab.kind === 'view')
  .map((tab) => tab.view);

/** Watches the live root and applies valid arrangements through the registered Dockview owners. */
export function WorkbenchRecordHost(): React.JSX.Element {
  const { parameterFiles, workbenchFiles, contentService, subscribeWorkbenchRecord } = useFileManager();
  const { projectId, editorRef, registerWorkbenchRecordProducer, viewRecords, setAppliedWorkbenchRevision } = useProject();
  const root = `/projects/${projectId}`;
  const desktopLayout = useSelector(editorRef, (state) => state.context.panelState.desktopLayout);
  const { registerLayoutController } = useProjectWorkspace();
  const isTauDebugEnabled = useFeature('tauDebug');
  const debugRef = useRef(isTauDebugEnabled);
  useEffect(() => { debugRef.current = isTauDebugEnabled; }, [isTauDebugEnabled]);
  const [status, setStatus] = useState('');
  const [statusVersion, setStatusVersion] = useState(0);
  const announce = useCallback((message: string): void => {
    setStatus(message);
    setStatusVersion((version) => version + 1);
  }, []);
  const [refusal, setRefusal] = useState<{ code: 'INVALID_RECORD' | 'NEWER_RECORD'; message: string }>();
  const snapshotRef = useRef<WorkbenchLayoutSnapshot | undefined>(undefined);
  const listenersRef = useRef(new Set<() => void>());
  const viewerRef = useRef<((node: ViewerNode, applied: () => void) => void) | undefined>(undefined);
  const workbenchRef = useRef<((node: WorkbenchLaneNode, applied: () => void) => void) | undefined>(undefined);
  const applicationRef = useRef({ epoch: 0, viewer: false, workbench: false });
  const acknowledge = useCallback((epoch: number): void => {
    const application = applicationRef.current;
    const snapshot = snapshotRef.current;
    if (application.epoch !== epoch || !application.viewer || !application.workbench ||
      !snapshot || snapshot.layoutDigest === 'missing') { return; }
    const lanes = editorRef.getSnapshot().context.panelState.desktopLayout;
    if (lanes.chatOpen !== snapshot.layout.lanes.chat || lanes.workbenchOpen !== snapshot.layout.lanes.workbench) { return; }
    setAppliedWorkbenchRevision(workbenchPaths.layout, snapshot.layoutDigest);
  }, [editorRef, setAppliedWorkbenchRevision]);
  const appliedRef = useRef<WorkbenchLayout | undefined>(undefined);
  const rememberedViewsRef = useRef(new Map<string, WorkbenchView>());
  useEffect(() => { for (const [id, record] of viewRecords) { rememberedViewsRef.current.set(id, record); } }, [viewRecords]);
  const rollback = useCallback((layout: WorkbenchLayout): PreviousWorkbenchLayout => ({
    layout,
    views: Object.fromEntries(viewIdsIn(layout.viewer).flatMap((id) => {
      const record = rememberedViewsRef.current.get(id);
      return record ? [[id, record] as const] : [];
    })),
  }), []);
  const store = useMemo(() => createWorkbenchLayoutStore({
    root, editDebounce: 500,
    files: parameterFiles,
    onChange: (state, source) => {
      const epoch = ++applicationRef.current.epoch;
      applicationRef.current.viewer = false;
      applicationRef.current.workbench = false;
      setAppliedWorkbenchRevision(workbenchPaths.layout, undefined);
      if (state.refusal) {
        setRefusal(state.refusal);
        announce(state.refusal.message);
        snapshotRef.current = undefined;
        for (const listener of listenersRef.current) { listener(); }
        return;
      }
      setRefusal(undefined);
      if (!state.layout) {
        snapshotRef.current = undefined;
        for (const listener of listenersRef.current) { listener(); }
        return;
      }
      const previous = appliedRef.current;
      const next = state.layout;
      const refused: WorkbenchLayoutSnapshot['refused'] = debugRef.current ? [] : tabsIn(next.workbench)
        .filter((tab): tab is Extract<WorkbenchTab, { kind: 'pane' }> => tab.kind === 'pane' && (tab.pane === 'kernel' || tab.pane === 'console'))
        .map((tab) => ({ tab, reason: 'debug-only' }));
      snapshotRef.current = { layout: next, refused, layoutDigest: state.digest };
      for (const listener of listenersRef.current) { listener(); }
      if (source === 'read' && previous && JSON.stringify(previous) !== JSON.stringify(next)) {
        editorRef.send({ type: 'setPreviousLayout', layout: rollback(previous) });
      }
      appliedRef.current = next;
      const viewer = viewerRef.current;
      const workbench = workbenchRef.current;
      viewer?.(next.viewer, () => { if (applicationRef.current.epoch !== epoch || viewerRef.current !== viewer) { return; }
        applicationRef.current.viewer = true; acknowledge(epoch); });
      workbench?.(next.workbench, () => { if (applicationRef.current.epoch !== epoch || workbenchRef.current !== workbench) { return; }
        applicationRef.current.workbench = true; acknowledge(epoch); });
      const { desktopLayout } = editorRef.getSnapshot().context.panelState;
      if (desktopLayout.chatOpen !== next.lanes.chat || desktopLayout.workbenchOpen !== next.lanes.workbench) {
        editorRef.send({ type: 'setPanelState', panelState: { desktopLayout: {
          chatOpen: next.lanes.chat, workbenchOpen: next.lanes.workbench,
        } } });
      }
      acknowledge(epoch);
      announce('Workbench arrangement updated.');
    },
    onError: (error) => {
      applicationRef.current.epoch++;
      applicationRef.current.viewer = false;
      applicationRef.current.workbench = false;
      setAppliedWorkbenchRevision(workbenchPaths.layout, undefined);
      announce(error instanceof Error ? error.message : 'Workbench record could not be read.');
    },
  }), [acknowledge, announce, editorRef, parameterFiles, rollback, root, setAppliedWorkbenchRevision]);
  const firstReadRef = useRef<{ store: typeof store; promise: Promise<boolean> } | undefined>(undefined);
  const firstRead = useCallback(async (): Promise<boolean> => {
    const existing = firstReadRef.current;
    if (existing?.store === store) { return existing.promise; }
    const readOnce = async (): Promise<boolean> => {
      try {
        const read = await store.read(true);
        if (read) { return true; }
        if (store.ready()) { return true; }
        const replacement = firstReadRef.current;
        if (replacement?.store === store && replacement.promise !== promise) { return await replacement.promise; }
        return false;
      }
      finally {
        const { current } = firstReadRef;
        if (current?.store === store && current.promise === promise) { firstReadRef.current = undefined; }
      }
    };
    const promise = readOnce();
    firstReadRef.current = { store, promise };
    return promise;
  }, [store]);

  useEffect(() => {
    firstReadRef.current = undefined;
    const unsubscribe = subscribeWorkbenchRecord(workbenchPaths.layout, () => { void store.read(); });
    void (contentService && store.ready() ? store.read(true) : firstRead());
    return () => { unsubscribe(); applicationRef.current.epoch++;
      applicationRef.current.viewer = false; applicationRef.current.workbench = false;
      setAppliedWorkbenchRevision(workbenchPaths.layout, undefined); };
  }, [contentService, firstRead, setAppliedWorkbenchRevision, store, subscribeWorkbenchRecord]);
  useEffect(() => {
    storeMounts.set(store, (storeMounts.get(store) ?? 0) + 1);
    return () => {
      storeMounts.set(store, (storeMounts.get(store) ?? 1) - 1);
      queueMicrotask(() => { if (storeMounts.get(store) === 0) { store.dispose(); } });
    };
  }, [store]);
  useEffect(() => registerWorkbenchRecordProducer( async () => store.flush()), [registerWorkbenchRecordProducer, store]);
  useFlushOnClose(async () => {
    if (!(await store.flush())) { throw new Error('Workbench arrangement could not be saved.'); }
  }, { stage: 'producer' });
  useEffect(() => {
    const current = store.intendedLayout();
    if (!current || (current.lanes.chat === desktopLayout.chatOpen && current.lanes.workbench === desktopLayout.workbenchOpen)) { return; }
    void store.edit({ ...current, lanes: { chat: desktopLayout.chatOpen, workbench: desktopLayout.workbenchOpen } });
  }, [desktopLayout.chatOpen, desktopLayout.workbenchOpen, store]);

  const controller = useMemo<WorkbenchLayoutController>(() => ({
    snapshot: () => snapshotRef.current,
    subscribe: (listener) => { listenersRef.current.add(listener); return () => { listenersRef.current.delete(listener); }; },
    restorePreviousArrangement: async () => {
      const previous = editorRef.getSnapshot().context.previousLayout;
      const current = store.snapshot().layout;
      if (!previous || !current) { return false; }
      for (const viewId of viewIdsIn(previous.layout.viewer)) {
        const seed = previous.views[viewId];
        if (!seed) { announce(`The prior view ${viewId} cannot be restored without its original file.`); return false; }
        if (!(await editViewFile({ root, viewId, files: { ...parameterFiles, ...workbenchFiles },
          change: (existing) => existing ?? seed,
          onError: (error) => { announce(error instanceof Error ? error.message : 'View could not be restored.'); },
        }))) { return false; }
      }
      const restored = await store.edit(previous.layout);
      if (restored) { editorRef.send({ type: 'setPreviousLayout', layout: rollback(current) }); }
      return restored;
    },
    registerViewer: (apply) => {
      viewerRef.current = apply;
      applicationRef.current.viewer = false;
      setAppliedWorkbenchRevision(workbenchPaths.layout, undefined);
      const current = store.snapshot().layout;
      if (current) { const { epoch } = applicationRef.current; apply(current.viewer, () => {
        if (applicationRef.current.epoch !== epoch || viewerRef.current !== apply) { return; }
        applicationRef.current.viewer = true; acknowledge(epoch);
      }); }
      return () => { if (viewerRef.current === apply) { viewerRef.current = undefined; applicationRef.current.viewer = false; setAppliedWorkbenchRevision(workbenchPaths.layout, undefined); } };
    },
    registerWorkbench: (apply) => {
      workbenchRef.current = apply;
      applicationRef.current.workbench = false;
      setAppliedWorkbenchRevision(workbenchPaths.layout, undefined);
      const current = store.snapshot().layout;
      if (current) { const { epoch } = applicationRef.current; apply(current.workbench, () => {
        if (applicationRef.current.epoch !== epoch || workbenchRef.current !== apply) { return; }
        applicationRef.current.workbench = true; acknowledge(epoch);
      }); }
      return () => { if (workbenchRef.current === apply) { workbenchRef.current = undefined; applicationRef.current.workbench = false;
        setAppliedWorkbenchRevision(workbenchPaths.layout, undefined); } };
    },
    personViewerChanged: (node) => {
      if (!store.ready()) { return; }
      const next = { ...(store.intendedLayout() ?? fallbackLayout()), viewer: node };
      void store.edit(next);
    },
    personWorkbenchChanged: (node) => {
      if (!store.ready()) {
        if (typeof node === 'function') {
          const change = node;
          const applyAfterFirstRead = async (): Promise<void> => {
            if (!(await firstRead())) { return; }
            const current = store.intendedLayout() ?? fallbackLayout();
            await store.edit({ ...current, workbench: change(current.workbench) });
          };
          void applyAfterFirstRead();
        }
        return;
      }
      const current = store.intendedLayout() ?? fallbackLayout();
      const next = { ...current, workbench: typeof node === 'function' ? node(current.workbench) : node };
      void store.edit(next);
    },
  }), [acknowledge, announce, editorRef, firstRead, parameterFiles, root, setAppliedWorkbenchRevision, store, workbenchFiles]);

  useEffect(() => {
    const {current} = snapshotRef;
    if (!current) { return; }
    const refused: WorkbenchLayoutSnapshot['refused'] = isTauDebugEnabled ? [] : tabsIn(current.layout.workbench)
      .filter((tab): tab is Extract<WorkbenchTab, { kind: 'pane' }> => tab.kind === 'pane' && (tab.pane === 'kernel' || tab.pane === 'console'))
      .map((tab) => ({ tab, reason: 'debug-only' }));
    snapshotRef.current = { ...current, refused };
    for (const listener of listenersRef.current) { listener(); }
  }, [isTauDebugEnabled]);

  useLayoutEffect(() => registerLayoutController(controller), [controller, registerLayoutController]);
  return <>
    <div role='status' aria-live='polite' className='sr-only'><span key={statusVersion}>{status}</span></div>
    {refusal ? <div role='alert'>{refusal.message}{refusal.code === 'INVALID_RECORD' ? <button type='button' onClick={() => {
      void store.reset(appliedRef.current ?? fallbackLayout());
    }}>Reset</button> : null}</div> : null}
  </>;
}
