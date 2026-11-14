/**
 * The workbench adapter (app state orchestration plan § 4 A8c; inventory rows Y6 and Y7; charter D4, I1, I10, I12).
 *
 * A callback actor that holds the workbench's `DockviewApi` from Dockview's `onReady` to the ref cleanup of the
 * Dockview that made it. Everything the workbench's effects and refs did over time is in its closure:
 *
 * - **Places files.** It diffs the editor's open files against the panels whenever the editor changes (the reconciler),
 *   keeps each file's pending placement (a drop, or a placeholder the person opened a file from) until its panel is
 *   added, and turns a panel the person closed or activated into the editor's `closeFile` or `setActiveFile`.
 * - **Applies the arrangement.** It registers the workbench's apply with the layout controller. An apply whose files
 *   are not all open asks the editor to open them and is held until they are, and lands without the tab of a file
 *   that failed to open or that the person closed meanwhile. A materialisation the editor dropped without an answer
 *   (a chat switch while the file was materialising, A8b's carried risk) is asked again, so the apply still lands.
 * - **Reports the person's edits.** A Dockview layout change that is not an apply is the person's rearrangement.
 * - **Answers pane intents.** It connects the workbench's opener and file activation to the workspace.
 * - **Navigates.** A file opened with a line is revealed there.
 *
 * Its host spawns it on `dockReady` and stops it on `dockReleased`: the project's `workbenchLayout` on a page with a
 * layout, the editor on a layout-less one (share and preview). The Dockview operations it calls arrive as ports, so
 * this module stays free of React and of Dockview's runtime: a host that imports it does not reach the workbench.
 *
 * @module
 */
import { createCallbackLogic } from 'xstate';
import type { CallbackActorLogic, EventObject } from 'xstate';
import type { DockviewApi, DockviewDidDropEvent, DockviewGroupPanel, IDockviewPanel } from 'dockview-react';
import type { WorkbenchLaneNode } from '@taucad/workbench';
import type { OpenFile } from '@taucad/ui-core/types/editor.types';
import type { WorkbenchLayoutController } from '#routes/w.$workspace.$project/workbench-layout-controller.js';
import type { WorkbenchIntentTarget } from '#routes/w.$workspace.$project/workbench-layout-controller.shim.js';
import type { WorkbenchPanelId } from '#routes/w.$workspace.$project/project-workspace-context.panels.js';

/** What the adapter reads of the editor's snapshot. */
type EditorSnapshot = Readonly<{
  context: Readonly<{
    openFiles: OpenFile[];
    activePaneId: string | undefined;
    fileSidebars: Readonly<Record<string, number>>;
    pendingOpenFile?: Readonly<{ path: string }>;
  }>;
  matches(value: Readonly<{ ready: Readonly<{ operation: 'materializingOpenFile' }> }>): boolean;
}>;

type Subscription = Readonly<{ unsubscribe: () => void }>;

/** The editor's `fileOpened` and `fileOpenFailed`, as the adapter reads them. */
type EditorFileEvent = Readonly<{ path: string; lineNumber?: number; column?: number; source?: string }>;

/**
 * The editor as its workbench adapter uses it: the editor actor, described by shape so the editor machine (a host of
 * the adapter) and this module do not type each other in a cycle.
 */
export type WorkbenchAdapterEditor = Readonly<{
  getSnapshot(): EditorSnapshot;
  subscribe(listener: (snapshot: EditorSnapshot) => void): Subscription;
  on(type: 'fileOpened' | 'fileOpenFailed', handler: (event: EditorFileEvent) => void): Subscription;
  send(
    event:
      | Readonly<{ type: 'openFile'; path: string; source: 'user' | 'record'; readOnly?: boolean }>
      | Readonly<{ type: 'setActiveFile'; path: string }>
      | Readonly<{ type: 'closeFile'; path: string }>,
  ): void;
}>;

/** Where a file the person dropped or opened from a placeholder is placed once its panel is added. */
export type PendingFilePlacement = {
  readonly position?: DockviewDidDropEvent['position'];
  readonly group: DockviewGroupPanel | undefined;
  readonly index?: number;
  readonly placeholderId?: string;
  readonly paneState?: Readonly<{ filesOpen?: boolean; filesWidth?: number; viewId?: string }>;
};

/** A file the record names, with its pane and the width of its Files sidecar. */
export type RecordFiles = Readonly<Record<string, Readonly<{ paneId: string; filesWidth: number | undefined }>>>;

/**
 * The workbench's Dockview operations, as the route module defines them. They take the `DockviewApi` the adapter holds
 * and keep no state of their own.
 */
export type WorkbenchDockOperations = Readonly<{
  /** Diff the editor's open files against the panels; returns the person's file still waiting for its panel. */
  reconcile: (
    input: Readonly<{
      api: DockviewApi;
      openFiles: OpenFile[];
      activePaneId: string | undefined;
      isMobile: boolean;
      pendingUserFilePath: string | undefined;
      pendingFilePlacements: Map<string, PendingFilePlacement>;
    }>,
  ) => string | undefined;
  /** The file a panel shows, if it is a file panel. */
  filePathOf: (panel: Readonly<{ params: unknown }>) => string | undefined;
  /** A closed panel's consequences: its file closes, and the last closed panel closes the workbench. */
  panelRemoved: (
    input: Readonly<{
      panel: Readonly<{ params: unknown }>;
      remainingPanelCount: number;
      isRestoringLayout: boolean;
      closeFile: (path: string) => void;
      closeWorkbench: () => void;
    }>,
  ) => void;
  /** Open a pane: Files, or a utility. */
  openPanel: (api: DockviewApi, panelId: WorkbenchPanelId) => void;
  /** Whether this view offers the pane (a debug pane needs debug mode as well). */
  isPanelOffered: (panelId: WorkbenchPanelId) => boolean;
  /** Place an external drop's files and open them. */
  drop: (
    input: Readonly<{
      event: DockviewDidDropEvent;
      pendingFilePlacements: Map<string, PendingFilePlacement>;
      openFile: (path: string) => void;
    }>,
  ) => void;
  /** The id of the open launcher, which a record never carries. */
  launcherId: (api: DockviewApi) => string | undefined;
  /** What the Dockview shows, as a workbench node; throws while a drag holds an unsupported group. */
  shownNode: (api: DockviewApi) => WorkbenchLaneNode;
  /** Show a record's node, reusing the panels already open. */
  showNode: (
    api: DockviewApi,
    node: WorkbenchLaneNode,
    options: Readonly<{ files: RecordFiles; launcherId: string | undefined }>,
  ) => void;
}>;

/** What a workbench adapter is given beside its `DockviewApi`. */
export type WorkbenchAdapterPorts = Readonly<{
  editor: WorkbenchAdapterEditor;
  projectId: string;
  /** `shared` views (share and preview) write no layout and report no edit. */
  profile: 'editor' | 'shared';
  isMobile: boolean;
  /** The page's layout controller; the no-op controller on a page without a layout. */
  controller: Pick<WorkbenchLayoutController, 'registerWorkbench' | 'personWorkbenchChanged'>;
  /** Connect the workbench's opener and file activation to the workspace. */
  connectWorkbench: (
    opener: WorkbenchIntentTarget['openPanel'],
    activateFile?: WorkbenchIntentTarget['activateFile'],
  ) => () => void;
  setWorkbenchOpen: (open: boolean) => void;
  /** Reveal a line in an editor pane. */
  navigate: (
    navigation: Readonly<{ projectId: string; path: string; paneId: string | undefined; line: number; column: number }>,
  ) => void;
  dock: WorkbenchDockOperations;
  /** Connect the desktop Browser's tabs, which must not follow a record's apply; absent where there is no Browser. */
  connectBrowser: ((api: DockviewApi, isRestoring: () => boolean) => () => void) | undefined;
}>;

/** A workbench adapter's input. The `DockviewApi` lives only here and in the closure built from it (D4). */
export type WorkbenchAdapterInput = Readonly<{ api: DockviewApi; ports: WorkbenchAdapterPorts }>;

/** What the workbench's own handlers tell its adapter. */
export type WorkbenchAdapterEvent =
  /** The person opened a file from the Dockview: its panel takes `placement` when given. */
  | Readonly<{ type: 'openFile'; path: string; readOnly?: boolean; placement?: PendingFilePlacement }>
  /** Something was dropped on the workbench from outside it. */
  | Readonly<{ type: 'dropped'; event: DockviewDidDropEvent }>;

/** The Dockview hands its adapter to a host (`onReady`, through its ref callback). */
export type WorkbenchDockReady = Readonly<{
  type: 'dockReady';
  adapter: 'workbench';
  /** This Dockview's mount: a release names it, so a late release never stops a newer mount's adapter. */
  dockId: string;
  api: DockviewApi;
  ports: WorkbenchAdapterPorts;
}>;

/** The Dockview that made `dockId` is gone (its ref cleanup): its adapter stops. */
export type WorkbenchDockReleased = Readonly<{ type: 'dockReleased'; adapter: 'workbench'; dockId: string }>;

/** The child id a host spawns a Dockview's adapter under. */
export const dockAdapterId = (adapter: string, dockId: string): string => `${adapter}Adapter:${dockId}`;

/** The ids of a host's children that are `adapter`'s adapters: a new mount replaces them. */
export const dockAdapterIdsOf = (children: Readonly<Record<string, unknown>>, adapter: string): string[] =>
  Object.keys(children).filter((id) => id.startsWith(`${adapter}Adapter:`));

/** The adapter a host runs for the Dockview mount `dockId`, read when a handler of that Dockview needs it. */
export const selectDockAdapter = (
  host: Readonly<{ getSnapshot: () => { children: Readonly<Record<string, unknown>> } }>,
  dockId: string,
): Readonly<{ send: (event: WorkbenchAdapterEvent) => void }> | undefined =>
  host.getSnapshot().children[dockAdapterId('workbench', dockId)] as
    | Readonly<{ send: (event: WorkbenchAdapterEvent) => void }>
    | undefined;

/** The file paths a workbench node's tabs show. */
export const workbenchFilePaths = (node: WorkbenchLaneNode): string[] =>
  node.kind === 'group'
    ? node.tabs.filter((tab) => tab.kind === 'file').map((tab) => tab.path)
    : node.children.flatMap(workbenchFilePaths);

/**
 * A workbench node without the tabs of the file at `path`. Only a group that held the file changes: its active tab
 * stays active, and only a removed active tab leaves the group to Dockview's choice.
 */
export const withoutFileTab = (node: WorkbenchLaneNode, path: string): WorkbenchLaneNode => {
  if (node.kind !== 'group') {
    return { ...node, children: node.children.map((child) => withoutFileTab(child, path)) };
  }
  const removed = (index: number): boolean => {
    const tab = node.tabs[index];
    return tab?.kind === 'file' && tab.path === path;
  };
  const tabs = node.tabs.filter((_tab, index) => !removed(index));
  if (tabs.length === node.tabs.length) {
    return node;
  }
  const { active, ...rest } = node;
  if (active === undefined || removed(active)) {
    return { ...rest, tabs };
  }
  const shift = node.tabs.slice(0, active).filter((_tab, index) => removed(index)).length;
  return { ...rest, tabs, active: active - shift };
};

/** The file the editor is materialising now, if any. */
const materialisingPath = (snapshot: EditorSnapshot): string | undefined =>
  snapshot.matches({ ready: { operation: 'materializingOpenFile' } })
    ? snapshot.context.pendingOpenFile?.path
    : undefined;

/** A held record apply: the node it shows once its files are open, and whom it answers then. */
type HeldApply = {
  node: WorkbenchLaneNode;
  /** The layout's answer, and the node it handed over: a landing without a tab reports what it shows instead. */
  answer: Readonly<{ applied: (shown?: WorkbenchLaneNode) => void; requested: WorkbenchLaneNode }> | undefined;
  /** The held files the editor was seen materialising: one it then drops without an answer is asked again. */
  materialising: Set<string>;
};

/**
 * Start the adapter on a ready Dockview. It returns its teardown: every subscription it made is released, its apply is
 * unregistered and its opener disconnected.
 */
function runWorkbenchAdapter(
  input: WorkbenchAdapterInput,
  receive: (listener: (event: WorkbenchAdapterEvent) => void) => void,
): () => void {
  const { api, ports } = input;
  const { editor, dock, profile } = ports;
  const writesLayout = profile !== 'shared';
  const disposers: Array<() => void> = [];

  /* Whether the Dockview is showing a record: its panel changes are the apply's, not the person's. */
  let isRestoring = false;
  /* What the last apply showed: Dockview reports its own apply later, and that report is not the person's edit. */
  let adoptedProjection: string | undefined;
  /* The person's file waiting for its panel, which is then made active. */
  let pendingUserFilePath: string | undefined;
  const pendingFilePlacements = new Map<string, PendingFilePlacement>();
  let held: HeldApply | undefined;
  let previousOpenPaths: ReadonlySet<string> = new Set(editor.getSnapshot().context.openFiles.map((file) => file.path));
  let reconciled: Readonly<{ openFiles: OpenFile[]; activePaneId: string | undefined }> | undefined;

  const shownNode = (): WorkbenchLaneNode | undefined => {
    try {
      return dock.shownNode(api);
    } catch {
      // Dockview can hold a temporary unsupported group mid-drag: the layout falls back to its arrangement.
      return undefined;
    }
  };

  const reconcile = (snapshot: EditorSnapshot): void => {
    const { openFiles, activePaneId } = snapshot.context;
    reconciled = { openFiles, activePaneId };
    pendingUserFilePath = dock.reconcile({
      api,
      openFiles,
      activePaneId,
      isMobile: ports.isMobile,
      pendingUserFilePath,
      pendingFilePlacements,
    });
  };

  /** Show a record's node once its files are open; until then ask the editor for them and hold it. */
  const applyRecordNode = (
    node: WorkbenchLaneNode,
    answer?: Readonly<{ applied: (shown?: WorkbenchLaneNode) => void; requested: WorkbenchLaneNode }>,
  ): void => {
    held = { node, answer: answer ?? held?.answer, materialising: held?.materialising ?? new Set() };
    const device = editor.getSnapshot().context;
    const files: RecordFiles = Object.fromEntries(
      device.openFiles.map((file) => [file.path, { paneId: file.paneId, filesWidth: device.fileSidebars[file.path] }]),
    );
    const missing = workbenchFilePaths(node).filter((path) => files[path] === undefined);
    if (missing.length > 0) {
      for (const path of missing) {
        editor.send({ type: 'openFile', path, source: 'record' });
      }
      return;
    }
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const landed = held.answer;
    let shown: WorkbenchLaneNode | undefined;
    isRestoring = true;
    try {
      // Pruned in the operation, not in the record: a web session's next edit writes the pruned layout back, dropping a
      // desktop Browser tab. That is intended, since Browser tabs are window-local.
      dock.showNode(api, node, { files, launcherId: dock.launcherId(api) });
      shown = dock.shownNode(api);
      adoptedProjection = JSON.stringify(shown);
      held = undefined;
    } finally {
      isRestoring = false;
      active?.focus({ preventScroll: true });
    }
    // Answered once the restore is over: what the answer opens (a held pane or file intent) is not taken for it. An
    // apply that lost a tab reports what the Dockview shows, so the arrangement the layout records is the one on screen.
    landed?.applied(landed.requested === node ? undefined : shown);
    // The editor may have moved while the Dockview showed the record (a panel the record dropped closes its file): the
    // reconciler, which waits out a restore, catches up now.
    const after = editor.getSnapshot();
    if (reconciled?.openFiles !== after.context.openFiles || reconciled.activePaneId !== after.context.activePaneId) {
      reconcile(after);
    }
  };

  /** The held apply after the editor moved: closed files leave it, dropped materialisations are asked again. */
  const followHeldApply = (snapshot: EditorSnapshot): void => {
    const open = new Set(snapshot.context.openFiles.map((file) => file.path));
    const before = previousOpenPaths;
    previousOpenPaths = open;
    if (held === undefined || isRestoring) {
      // While the Dockview shows a record, its own panel changes reach the editor: the apply is landing already.
      return;
    }
    // A tab the person closed before the rest of the held apply's files opened is no longer wanted: the apply lands
    // without it, as without a file that failed to open, rather than waiting for it forever.
    let { node } = held;
    for (const path of workbenchFilePaths(node)) {
      if (before.has(path) && !open.has(path)) {
        node = withoutFileTab(node, path);
      }
    }
    held.node = node;
    const materialising = materialisingPath(snapshot);
    const dropped: string[] = [];
    for (const path of workbenchFilePaths(node)) {
      if (path === materialising) {
        held.materialising.add(path);
      } else if (held.materialising.delete(path) && !open.has(path)) {
        // The editor left this file's materialisation with neither `fileOpened` nor `fileOpenFailed` (a chat switch
        // cancels it): nothing would answer the apply, and the layout would hold every pane intent behind it.
        dropped.push(path);
      }
    }
    if (workbenchFilePaths(node).every((path) => open.has(path))) {
      applyRecordNode(node);
      return;
    }
    for (const path of dropped) {
      editor.send({ type: 'openFile', path, source: 'record' });
    }
  };

  if (ports.connectBrowser !== undefined) {
    disposers.push(ports.connectBrowser(api, () => isRestoring));
  }

  // Only a person-edited semantic projection writes layout.json.
  if (writesLayout) {
    const layoutChange = api.onDidLayoutChange(() => {
      if (isRestoring) {
        return;
      }
      try {
        const node = dock.shownNode(api);
        if (JSON.stringify(node) === adoptedProjection) {
          return;
        }
        adoptedProjection = undefined;
        ports.controller.personWorkbenchChanged(node);
      } catch {
        // Dockview can emit while a drag has a temporary unsupported intermediate group.
      }
    });
    disposers.push(() => {
      layoutChange.dispose();
    });
    // Registered before the opener connects below: an intent delivered at attach waits until the opener connects,
    // and then opens on what the attach showed.
    disposers.push(
      ports.controller.registerWorkbench((node, applied) => {
        applyRecordNode(node, { applied, requested: node });
      }),
    );
  }

  // The reconciler: the editor is the one source of the open tabs and the active one, and the Dockview converges on it.
  // It is idempotent, so a change it causes (a removed panel closing its file) finds the panels already in step.
  const editorSubscription = editor.subscribe((snapshot) => {
    if (writesLayout) {
      followHeldApply(snapshot);
    }
    const { openFiles, activePaneId } = snapshot.context;
    if (isRestoring || (reconciled?.openFiles === openFiles && reconciled.activePaneId === activePaneId)) {
      return;
    }
    reconcile(snapshot);
  });
  disposers.push(() => {
    editorSubscription.unsubscribe();
  });
  reconcile(editor.getSnapshot());

  // A file opened with a line is revealed there; a record's own opens carry none.
  const opened = editor.on('fileOpened', (event) => {
    if (event.source !== 'record' && event.lineNumber) {
      ports.navigate({
        projectId: ports.projectId,
        path: event.path,
        paneId: editor.getSnapshot().context.activePaneId,
        line: event.lineNumber,
        column: event.column ?? 1,
      });
    }
  });
  const failed = editor.on('fileOpenFailed', (event) => {
    if (pendingFilePlacements.get(event.path)?.placeholderId) {
      pendingFilePlacements.delete(event.path);
    }
    // A record apply held for this file would wait for it forever, and the layout holds every pane intent until the
    // apply lands: it lands now without the file's tab.
    if (held !== undefined && workbenchFilePaths(held.node).includes(event.path)) {
      held.materialising.delete(event.path);
      applyRecordNode(withoutFileTab(held.node, event.path));
    }
  });
  disposers.push(() => {
    opened.unsubscribe();
    failed.unsubscribe();
  });

  // The person's own changes reach the editor: the reconciler then finds the panels already in step.
  const activeChange = api.onDidActivePanelChange((event) => {
    const path = event.panel === undefined ? undefined : dock.filePathOf(event.panel);
    if (path !== undefined) {
      editor.send({ type: 'setActiveFile', path });
    }
  });
  const removal = api.onDidRemovePanel((panel: IDockviewPanel) => {
    for (const [path, placement] of pendingFilePlacements) {
      if (placement.placeholderId === panel.id) {
        pendingFilePlacements.delete(path);
      }
    }
    dock.panelRemoved({
      panel,
      remainingPanelCount: api.panels.length,
      isRestoringLayout: isRestoring,
      closeFile: (path) => {
        editor.send({ type: 'closeFile', path });
      },
      closeWorkbench: () => {
        ports.setWorkbenchOpen(false);
      },
    });
  });
  disposers.push(() => {
    activeChange.dispose();
    removal.dispose();
  });

  const openFile = (path: string, readOnly: boolean | undefined): void => {
    editor.send({ type: 'openFile', path, source: 'user', readOnly: profile === 'shared' || readOnly });
  };
  receive((event) => {
    if (event.type === 'dropped') {
      dock.drop({
        event: event.event,
        pendingFilePlacements,
        openFile: (path) => {
          openFile(path, undefined);
        },
      });
      return;
    }
    if (event.placement !== undefined) {
      pendingFilePlacements.set(event.path, event.placement);
    }
    openFile(event.path, event.readOnly);
  });

  // The workbench's answers to pane intents. Each returns what the Dockview shows after it (its model changes
  // synchronously, and only its layout report is deferred), so an intent's answer carries the pane it opened.
  disposers.push(
    ports.connectWorkbench(
      (panelId) => {
        // A pane this view does not offer is refused: its intent is unavailable, not applied.
        if (!dock.isPanelOffered(panelId)) {
          return false;
        }
        pendingUserFilePath = undefined;
        dock.openPanel(api, panelId);
        return shownNode();
      },
      (path) => {
        pendingUserFilePath = path;
        if (isRestoring) {
          return undefined;
        }
        // Connection can follow the first reconcile: consume the retained person's intent against the current state.
        reconcile(editor.getSnapshot());
        return shownNode();
      },
    ),
  );

  return () => {
    for (const dispose of disposers.toReversed()) {
      dispose();
    }
  };
}

/** The workbench adapter's logic. A host spawns it with the Dockview's `dockReady` and stops it on `dockReleased`. */
export const workbenchAdapterLogic: CallbackActorLogic<WorkbenchAdapterEvent, WorkbenchAdapterInput> =
  createCallbackLogic<WorkbenchAdapterEvent, WorkbenchAdapterInput>(({ input, receive }) =>
    runWorkbenchAdapter(input, receive),
  );

/** Narrow a host's event to a workbench dock event. */
export const isWorkbenchDockEvent = (event: EventObject): event is WorkbenchDockReady | WorkbenchDockReleased =>
  (event.type === 'dockReady' || event.type === 'dockReleased') &&
  (event as Partial<WorkbenchDockReady>).adapter === 'workbench';
