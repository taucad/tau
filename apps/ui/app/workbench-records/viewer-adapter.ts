/**
 * The viewer Dockview's adapter to a live project's layout (app state orchestration charter D4, D11, I1, I10 to I14;
 * plan § 4 A8d; inventory rows Y8 and Y9).
 *
 * A callback actor holds the viewer's `DockviewApi` in its closure from Dockview's `onReady` to the dock's ref cleanup,
 * on desktop and on the phone shell. It:
 *
 * - applies what the layout shows on the viewer and reports the person's rearrangement (through the layout port the
 *   page's controller offers, which speaks the layout actor's adapter protocol);
 * - answers the layout's viewer pane intents, which is how the project's `viewerFileRequested` opens a viewer;
 * - keeps each viewer panel's entry, title and record in step with the view records;
 * - derives graphics and geometry demand from what the arrangement shows: a visible viewer panel demands its entry's
 *   geometry, an editor panel keeps its graphics owner while hidden, and a removed panel gives both up.
 *
 * Every value the page's React tree owns (the view records, the commands that write them, whether the model may be
 * shown) reaches it through one fed port, {@link ViewerAdapterFacts}; the page feeds it as a value and sends nothing.
 *
 * @module
 */
import { createCallbackLogic } from 'xstate';
import { Topic } from '@taucad/events';
import type { ActorRefFrom, CallbackActorLogic } from 'xstate';
import type { DockviewApi } from 'dockview-react';
import type { ViewerNode, WorkbenchEntries, WorkbenchView } from '@taucad/workbench';
import type { Evaluation } from '@taucad/runtime';
import { defaultGraphicsSettings } from '@taucad/viewer/graphics/graphics-settings';
import { graphicsSettingsForView, newViewRecord } from '@taucad/workbench-panes/records/view-record';
import type { projectMachine } from '#machines/project.machine.js';
import type { cadMachine } from '#machines/cad.machine.js';
import { fromDockview, mintViewRecordId, toDockview } from '#workbench-records/converters.js';
import { setLocalInstanceChoice } from '#workbench-records/local-instance.js';
import { readViewLevels } from '#workbench-records/view-levels.js';
import { resolvedViewFields } from '#workbench-records/view-record-binding-changes.js';
import { viewTabTitle } from '#workbench-records/view-titles.js';
import type { ObservablePort } from '#runtime/project-runtime.js';

/** Params passed to each viewer panel via Dockview. */
export type ViewerPanelParameters = {
  viewId: string;
  entryPath: string | undefined;
};

/** Whether a panel's params are a viewer panel's. */
export const isViewerPanelParameters = (parameters: unknown): parameters is ViewerPanelParameters =>
  typeof (parameters as Partial<ViewerPanelParameters> | undefined)?.viewId === 'string';

/** Projection suffixes distinguish panels for one file only when a build offers a choice. */
export function viewerPanelTitle(
  record: WorkbenchView,
  siblingCount: number,
  evaluation: Evaluation | undefined,
): string {
  const title = viewTabTitle(record);
  if (siblingCount < 2 || !evaluation?.success || evaluation.views.length < 2) {
    return title;
  }
  const id = record.selectedKernelView ?? evaluation.views[0]?.id;
  const offer = evaluation.views.find((view) => view.id === id);
  return id ? `${title} · ${offer?.title ?? id}` : title;
}

/** Adopt the record and return only view IDs genuinely removed from the arrangement. */
export function adoptViewerRecordNode(api: DockviewApi, node: ViewerNode): string[] {
  const ids = (current: ViewerNode): string[] =>
    current.kind === 'group' ? current.tabs.map((tab) => tab.view) : current.children.flatMap(ids);
  const desired = new Set(ids(node));
  const existing = api.panels.flatMap((panel) =>
    isViewerPanelParameters(panel.params) ? [{ id: panel.id, title: panel.title, params: panel.params }] : [],
  );
  const dimensions = { width: Math.max(1, api.width), height: Math.max(1, api.height) };
  const projection = toDockview('viewer', node, { dimensions });
  // Dockview reuses panel instances but replaces their metadata from the serialized projection.
  for (const prior of existing) {
    if (!desired.has(prior.id)) {
      continue;
    }
    const panel = projection.panels[prior.id];
    if (panel) {
      projection.panels[prior.id] = { ...panel, title: prior.title, params: prior.params };
    }
  }
  api.fromJSON(projection, { reuseExistingPanels: true });
  return existing.filter(({ id }) => !desired.has(id)).map(({ id }) => id);
}

/** A restored view whose record has not loaded yet keeps the entry its durable record names. */
export const keepDurableEntry =
  (entryPath: string) =>
  (current: WorkbenchView | undefined): WorkbenchView =>
    current?.entryPath ? current : { ...(current ?? newViewRecord(entryPath)), entryPath };

/**
 * Bind a panel that has no entry path. A panel adopted from the layout record carries only its view id, so its loaded
 * record wins; a panel seeded before the project loaded takes the main entry.
 */
export function bindViewerPanelEntry(
  panel: DockviewApi['panels'][number],
  {
    record,
    mainEntryPath,
    persistMainEntry,
  }: Readonly<{
    record: WorkbenchView | undefined;
    mainEntryPath: string | undefined;
    persistMainEntry: ((entryPath: string) => void) | undefined;
  }>,
): string | undefined {
  if (record?.entryPath) {
    panel.api.setTitle(viewTabTitle(record));
    panel.api.updateParameters({ entryPath: record.entryPath });
    return record.entryPath;
  }
  if (!mainEntryPath) {
    return undefined;
  }
  panel.api.setTitle(mainEntryPath.split('/').pop() ?? mainEntryPath);
  panel.api.updateParameters({ entryPath: mainEntryPath });
  persistMainEntry?.(mainEntryPath);
  return mainEntryPath;
}

/** Give an empty dock a group, so its watermark has somewhere to show. */
export function ensureViewerGroup(api: DockviewApi): void {
  if (api.groups.length === 0) {
    api.addGroup();
  }
}

/** The view a new view is made from: the active viewer's id and record. */
export type ViewSource = Readonly<{ viewId: string; record: WorkbenchView }>;

/**
 * The view a new view is made from: the active viewer panel's record. With no viewer panel tracked as active yet, the
 * dock's active panel counts when it is a viewer, as it does for the active viewer's settings.
 *
 * @param panel - The active viewer panel, or the dock's active panel.
 * @param viewRecords - The project's view records.
 * @returns The source, when the panel is a viewer with a record.
 */
export const viewSourceOf = (
  panel: Readonly<{ id: string; params?: unknown }> | undefined,
  viewRecords: ReadonlyMap<string, WorkbenchView>,
): ViewSource | undefined => {
  if (panel === undefined || !isViewerPanelParameters(panel.params)) {
    return undefined;
  }
  const record = viewRecords.get(panel.id);
  return record ? { viewId: panel.id, record } : undefined;
};

type ProjectRef = ActorRefFrom<typeof projectMachine>;
type CadRef = ActorRefFrom<typeof cadMachine>;

/**
 * The layout as the viewer adapter speaks to it: the page's controller over the project's layout actor (A8b's shim),
 * which turns these into the actor's adapter protocol.
 */
export type ViewerAdapterLayoutPort = Readonly<{
  /** Attach: `apply` lands each arrangement the layout shows and calls `applied` once it is on screen. */
  registerViewer: (apply: (node: ViewerNode, applied: () => void) => void) => () => void;
  /** The person rearranged the viewer. */
  personViewerChanged: (node: ViewerNode) => void;
  /** Connect the opener a delivered viewer intent applies through; it answers with the viewer it then shows. */
  connectViewerIntents: (open: (entryPath: string) => ViewerNode | undefined) => () => void;
  /** Ask the layout to show an entry in the viewer, as a pane intent. */
  requestViewerFile: (entryPath: string) => void;
}>;

/** What the page's React tree owns and the adapter reads: fed as a value on every commit that changes it. */
export type ViewerAdapterFacts = Readonly<{
  /** The project machine is ready and the model may be shown: demand is admitted only then. */
  admitsDemand: boolean;
  mainEntryPath: string | undefined;
  viewRecords: ReadonlyMap<string, WorkbenchView>;
  entriesRecord: WorkbenchEntries | undefined;
  /** The project's geometry units, by entry: a panel's title reads its build's offers. */
  geometryUnits: ReadonlyMap<string, CadRef>;
  viewCommands: Readonly<{
    edit: (viewId: string, change: (current: WorkbenchView | undefined) => WorkbenchView) => Promise<boolean>;
    remove: (viewId: string) => Promise<boolean>;
  }>;
  setViewEntryPath: (viewId: string, path: string | null | undefined) => void;
  /** Write a new view's record, made from `source` (V8). */
  createViewRecord: (viewId: string, entryPath: string, source: ViewSource | undefined) => void;
  /** The project's layout, on a page that has one (the editor profile of a live project). */
  layout: ViewerAdapterLayoutPort | undefined;
}>;

/** The facts port the page feeds: a value it replaces, which the adapter follows. */
export type ViewerAdapterFactsPort = ObservablePort<ViewerAdapterFacts> &
  Readonly<{ set: (next: ViewerAdapterFacts) => void }>;

/**
 * Build the facts port a viewer dock feeds its adapter through.
 *
 * @param initial - The facts at the dock's first render.
 * @returns The port; `set` replaces the value and tells the adapter, and sends nothing itself.
 */
export function createViewerAdapterFactsPort(initial: ViewerAdapterFacts): ViewerAdapterFactsPort {
  let current = initial;
  const changes = new Topic<void>({ name: 'viewer-adapter-facts' });
  return {
    get: () => current,
    subscribe: (listener) => changes.subscribe(listener),
    set: (next) => {
      if (next === current) {
        return;
      }
      current = next;
      changes.emit();
    },
  };
}

/** What the adapter is spawned with. */
export type ViewerAdapterInput = Readonly<{
  api: DockviewApi;
  profile: 'editor' | 'shared';
  projectId: string;
  project: Pick<ProjectRef, 'send' | 'on'>;
  facts: ObservablePort<ViewerAdapterFacts>;
}>;

/** The adapter takes no events: everything reaches it through Dockview, the project, the layout port and the facts. */
export type ViewerAdapterEvent = Readonly<{ type: 'never' }>;

type Disposable = Readonly<{ dispose: () => void }>;
type Panel = DockviewApi['panels'][number];

/**
 * The viewer adapter's logic.
 *
 * @returns Callback logic over {@link ViewerAdapterInput}.
 */
export const createViewerAdapterLogic = (): CallbackActorLogic<ViewerAdapterEvent, ViewerAdapterInput> =>
  createCallbackLogic<ViewerAdapterEvent, ViewerAdapterInput>(({ input }) => {
    const { api, profile, projectId, project, facts } = input;
    const isEditor = profile === 'editor';
    const disposables: Disposable[] = [];
    const listen = (disposable: Disposable): void => {
      disposables.push(disposable);
    };
    /* Whether the adapter is changing Dockview itself: a removal then is not the person's. */
    let isApplying = false;
    /* What the adapter last put on screen, so Dockview's deferred report of it is not the person's edit. */
    let adopted: string | undefined;
    /* The last viewer panel that was active: a new view is made from it (V8). */
    let activeViewerId: string | undefined;
    /* Demand (Y9): graphics owners created, geometry units created, and the entry each visible panel demands. */
    const admittedGraphics = new Set<string>();
    const admittedGeometry = new Map<string, string>();
    const visibleGeometryDemand = new Map<string, string>();
    const visibilitySubscriptions = new Map<string, Disposable>();

    const shownNode = (): ViewerNode => fromDockview('viewer', api.toJSON());

    // ── The layout: applies, the person's edits and viewer intents ─────────────────────────────

    /** Land an arrangement the layout shows; the views it no longer holds lose their records. */
    const apply = (node: ViewerNode, applied: () => void): void => {
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
      isApplying = true;
      try {
        const removed = adoptViewerRecordNode(api, node);
        adopted = JSON.stringify(shownNode());
        for (const viewId of removed) {
          void facts.get().viewCommands.remove(viewId);
        }
        applied();
      } finally {
        isApplying = false;
        active?.focus({ preventScroll: true });
      }
    };

    /** A viewer intent: activate the entry's panel, or open one made from the active view. */
    const openEntry = (entryPath: string): ViewerNode | undefined => {
      const existing = api.panels.find(
        (panel) => isViewerPanelParameters(panel.params) && panel.params.entryPath === entryPath,
      );
      if (existing) {
        existing.api.setActive();
      } else {
        const current = facts.get();
        const source = viewSourceOf(
          api.panels.find((panel) => panel.id === activeViewerId) ?? api.activePanel,
          current.viewRecords,
        );
        const viewId = mintViewRecordId();
        api.addPanel({
          id: viewId,
          component: 'viewer',
          title: entryPath.split('/').pop() ?? entryPath,
          params: { viewId, entryPath },
        });
        current.createViewRecord(viewId, entryPath, source);
      }
      try {
        const node = shownNode();
        adopted = JSON.stringify(node);
        return node;
      } catch {
        return undefined;
      }
    };

    let layout: ViewerAdapterLayoutPort | undefined;
    let detachLayout: (() => void) | undefined;
    const connectLayout = (next: ViewerAdapterLayoutPort | undefined): void => {
      if (next === layout) {
        return;
      }
      detachLayout?.();
      detachLayout = undefined;
      layout = next;
      if (layout === undefined || !isEditor) {
        return;
      }
      // The opener first: the layout delivers waiting viewer intents as soon as the viewer attaches.
      const disconnect = layout.connectViewerIntents(openEntry);
      const unregister = layout.registerViewer(apply);
      detachLayout = () => {
        disconnect();
        unregister();
      };
    };

    if (isEditor) {
      // A person-edited semantic lane is the only layout write from Dockview.
      listen(
        api.onDidLayoutChange(() => {
          if (isApplying || layout === undefined) {
            return;
          }
          try {
            const node = shownNode();
            if (JSON.stringify(node) === adopted) {
              return;
            }
            adopted = undefined;
            layout.personViewerChanged(node);
          } catch {
            // Dockview can emit while a drag has a temporary unsupported intermediate group.
          }
        }),
      );
    }

    // ── Demand, derived from what the arrangement shows (Y8, Y9) ───────────────────────────────

    const releaseDemand = (viewId: string): void => {
      if (visibleGeometryDemand.delete(viewId)) {
        project.send({ type: 'setViewerGeometryDemand', viewId });
      }
    };

    const admit = (panel: Panel): void => {
      const current = facts.get();
      if (!current.admitsDemand || !isViewerPanelParameters(panel.params)) {
        return;
      }
      const viewId = panel.id;
      const visible = panel.api.isVisible;
      // Editor tabs need their record owner even when graphics rendering is hidden.
      if ((isEditor || visible) && !admittedGraphics.has(viewId)) {
        const settings = current.viewRecords.get(viewId);
        // The live owner starts from what the view resolves to on this device, never from the file alone.
        const validatedSettings = settings
          ? graphicsSettingsForView(settings, resolvedViewFields(settings, readViewLevels(projectId, viewId)))
          : defaultGraphicsSettings;
        admittedGraphics.add(viewId);
        project.send({ type: 'createViewGraphics', viewId, settings: validatedSettings });
      }
      if (!visible) {
        releaseDemand(viewId);
        return;
      }
      const entryPath =
        panel.params.entryPath ??
        bindViewerPanelEntry(panel, {
          record: current.viewRecords.get(viewId),
          mainEntryPath: current.mainEntryPath,
          persistMainEntry: isEditor
            ? (path) => {
                void facts.get().viewCommands.edit(viewId, keepDurableEntry(path));
              }
            : undefined,
        });
      current.setViewEntryPath(viewId, entryPath ?? null);
      if (entryPath && admittedGeometry.get(viewId) !== entryPath) {
        admittedGeometry.set(viewId, entryPath);
        project.send({
          type: 'createGeometryUnit',
          entryPath,
          operationTimeout: current.entriesRecord?.entries[entryPath]?.renderTimeout,
        });
      }
      if (entryPath && visibleGeometryDemand.get(viewId) !== entryPath) {
        visibleGeometryDemand.set(viewId, entryPath);
        project.send({ type: 'setViewerGeometryDemand', viewId, entryPath });
      }
    };

    const watch = (panel: Panel): void => {
      if (!isViewerPanelParameters(panel.params) || visibilitySubscriptions.has(panel.id)) {
        return;
      }
      visibilitySubscriptions.set(
        panel.id,
        panel.api.onDidVisibilityChange(() => {
          admit(panel);
        }),
      );
      admit(panel);
    };

    /** Keep each viewer panel's entry and title in step with its record (the view records changed). */
    const followRecords = (): void => {
      if (!isEditor) {
        return;
      }
      const { viewRecords, geometryUnits, setViewEntryPath } = facts.get();
      const counts = new Map<string, number>();
      for (const panel of api.panels) {
        const entryPath = viewRecords.get(panel.id)?.entryPath;
        if (entryPath !== undefined && entryPath !== null) {
          counts.set(entryPath, (counts.get(entryPath) ?? 0) + 1);
        }
      }
      for (const panel of api.panels) {
        const record = viewRecords.get(panel.id);
        if (!isViewerPanelParameters(panel.params) || !record) {
          continue;
        }
        const nextPath = record.entryPath ?? undefined;
        if (panel.params.entryPath !== nextPath) {
          panel.api.updateParameters({ entryPath: nextPath });
        }
        setViewEntryPath(panel.id, record.entryPath);
        const evaluation = geometryUnits.get(record.entryPath ?? '')?.getSnapshot().context.evaluation;
        const title = viewerPanelTitle(record, counts.get(record.entryPath ?? '') ?? 0, evaluation);
        if (panel.title !== title) {
          panel.api.setTitle(title);
        }
      }
    };

    listen(
      api.onDidActivePanelChange(({ panel }) => {
        if (panel && isViewerPanelParameters(panel.params)) {
          activeViewerId = panel.id;
        }
      }),
    );
    listen(api.onDidAddPanel(watch));
    listen(
      api.onDidRemovePanel((panel) => {
        if (isViewerPanelParameters(panel.params)) {
          const viewId = panel.id;
          setLocalInstanceChoice(viewId, undefined);
          const current = facts.get();
          current.setViewEntryPath(viewId, undefined);
          project.send({ type: 'destroyViewGraphics', viewId });
          if (!isApplying && isEditor) {
            void current.viewCommands.remove(viewId);
          }
        }
        visibilitySubscriptions.get(panel.id)?.dispose();
        visibilitySubscriptions.delete(panel.id);
        admittedGraphics.delete(panel.id);
        admittedGeometry.delete(panel.id);
        releaseDemand(panel.id);
        if (activeViewerId === panel.id) {
          activeViewerId = undefined;
        }
        if (api.panels.length === 0) {
          // Dockview is still removing the panel: the group is given back once it has finished.
          queueMicrotask(() => {
            ensureViewerGroup(api);
          });
        }
      }),
    );

    // Requests to show a file in the viewer (file tree, editor tab menus) become viewer intents on a page with a
    // layout; a page without one opens the panel at once.
    const requests = project.on('viewerFileRequested', ({ entryPath }) => {
      const current = facts.get().layout;
      if (current !== undefined && isEditor) {
        current.requestViewerFile(entryPath);
        return;
      }
      openEntry(entryPath);
    });

    let previous = facts.get();
    const onFacts = (): void => {
      const current = facts.get();
      connectLayout(current.layout);
      if (current.viewRecords !== previous.viewRecords || current.geometryUnits !== previous.geometryUnits) {
        followRecords();
      }
      previous = current;
      // Admission is idempotent: a fact that changed admits what it now allows.
      for (const panel of api.panels) {
        admit(panel);
      }
    };
    const unsubscribeFacts = facts.subscribe(onFacts);
    connectLayout(previous.layout);
    followRecords();
    for (const panel of api.panels) {
      watch(panel);
    }

    return () => {
      unsubscribeFacts();
      requests.unsubscribe();
      detachLayout?.();
      for (const disposable of [...disposables, ...visibilitySubscriptions.values()]) {
        disposable.dispose();
      }
      visibilitySubscriptions.clear();
      // The dock is going: every entry its visible panels demanded is given up.
      for (const viewId of visibleGeometryDemand.keys()) {
        project.send({ type: 'setViewerGeometryDemand', viewId });
      }
      visibleGeometryDemand.clear();
    };
  });
