/**
 * The project runtime's workbench layout (app state orchestration charter D2, D11, D13, I10 to I14; plan § 4 A8b; B1;
 * inventory rows Y1 to Y5).
 *
 * Every live project that writes view records has one `workbenchLayout` actor, a child of its runtime, so the layout
 * record session lives as long as the runtime and not as long as a mount (I13): a remount no longer disposes a store
 * whose edit is still debounced, and a live project whose workbench is not mounted still follows foreign layout
 * changes and is flushed by a leave, close or unload flush (B1). This module holds what the runtime builds around it:
 *
 * - **The layout host** ({@link createProjectLayoutHost}): the layout logic over the project's record ports, the view
 *   record ports wrapped so the runtime remembers every view record it has seen (a rollback keeps the views its
 *   arrangement shows), and the shell's facts (route key and device), which the workspace provider feeds as plain
 *   values and every intent is sent under.
 * - **The bridge** ({@link createLayoutBridgeLogic}): a callback child that is the layout actor's sibling of the
 *   editor. The editor's person file opens and part reveals reach the layout as pane intents; the editor's lane flags
 *   reach it as lane reports; what the layout asks for (open the lane, show a phone tab, follow an applied
 *   arrangement's lanes) reaches the editor; and a foreign arrangement saves the one it replaced as the editor's
 *   previous layout, as `WorkbenchRecordHost` did.
 * - **Restore** ({@link restorePreviousLayout}): the arrange-workbench card's command, recreating the saved views'
 *   records before the layout's restore is asked.
 *
 * @module
 */
import { createCallbackLogic } from 'xstate';
import type { ActorOptions, ActorRefFrom, AnyActorLogic, CallbackActorLogic } from 'xstate';
import type { WorkbenchLayout, WorkbenchLaneNode, WorkbenchTab, WorkbenchView, ViewerNode } from '@taucad/workbench';
import type { PreviousWorkbenchLayout } from '@taucad/ui-core/types/editor.types';
import type { editorMachine } from '#machines/editor.machine.js';
import { holdUnheardFileReveal, holdUnheardReveal } from '#routes/w.$workspace.$project/workbench-reveal.js';
import { mobilePanelByWorkbenchPanel } from '#routes/w.$workspace.$project/project-workspace-context.panels.js';
import type { WorkbenchPanelId } from '#routes/w.$workspace.$project/project-workspace-context.panels.js';
import { ensureViewFile } from '#workbench-records/view-actions.js';
import type { ViewRecordHost, ViewRecordPortsHandle } from '#workbench-records/view-record-session.js';
import type { PaneIntent, PaneIntentSource } from '#workbench-records/pane-intents.js';
import {
  createLayoutRecordLogic,
  sameLayout,
  workbenchLayoutMachine,
} from '#workbench-records/workbench-layout.machine.js';
import type {
  LayoutDigest,
  WorkbenchLayoutDevice,
  WorkbenchLayoutInput,
  WorkbenchLayoutMachine,
  WorkbenchLayoutView,
} from '#workbench-records/workbench-layout.machine.js';

/** A live project's layout actor, as a child of its runtime. */
export type WorkbenchLayoutRef = ActorRefFrom<WorkbenchLayoutMachine>;

type EditorRef = ActorRefFrom<typeof editorMachine>;

/** The edit debounce the record host used: a person's rearrangement is written half a second after it settles. */
export const layoutEditDebounceMilliseconds = 500;

/**
 * What the shell knows that a project runtime does not: the route key intents are queued under and whether the phone
 * shell shows the layout. The workspace provider feeds them as values (it sends nothing); each intent is sent under
 * the facts current when it is sent, and an adapter compares the route key before it applies one (rule 6).
 */
export type ProjectLayoutFacts = Readonly<{ routeKey: string; device: WorkbenchLayoutDevice }>;

/** The checked files a restore writes view records through. */
export type RestoreFiles = Parameters<typeof ensureViewFile>[0]['files'];

/** The layout host a runtime builds for a project that writes view records. */
export type ProjectLayoutHost = Readonly<{
  /** The layout logic, its record child over the project's record ports. */
  logic: WorkbenchLayoutMachine;
  /** The view record ports the view sessions report through, remembering each view record for rollbacks. */
  viewRecordPorts: ViewRecordPortsHandle;
  /** The project's root directory. */
  root: string;
  /** The machine's input; the runtime adds the editor's lanes. */
  input: Omit<WorkbenchLayoutInput, 'workbenchOpen' | 'lanes'>;
  /** Every view record this runtime has seen, by id. */
  rememberedViews: () => ReadonlyMap<string, WorkbenchView>;
  /** The checked files a restore recreates view records through, once the shell has handed them over. */
  files: () => RestoreFiles | undefined;
  /** Hand over the checked files (the page's file manager owns the delete a view record's fence needs). */
  setFiles: (files: RestoreFiles | undefined) => void;
  /** The shell's facts now. */
  facts: () => ProjectLayoutFacts;
  /** Feed the shell's facts (a value; nothing is sent until the next intent or delivery). */
  setFacts: (facts: ProjectLayoutFacts) => void;
}>;

/** Before any shell has reported: no route, and the device the viewport says. */
const initialFacts = (): ProjectLayoutFacts => ({
  routeKey: '',
  device:
    typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(max-width: 767px)').matches
      ? 'phone'
      : 'desktop',
});

/**
 * Build a project's layout host.
 *
 * @param options - The project, its view record ports and the clock the record child's debounce runs on.
 * @returns The host. The runtime spawns {@link ProjectLayoutHost.logic} and runs {@link createLayoutBridgeLogic}.
 */
export function createProjectLayoutHost(
  options: Readonly<{ projectId: string; ports: ViewRecordPortsHandle }> & Pick<ActorOptions<AnyActorLogic>, 'clock'>,
): ProjectLayoutHost {
  const { projectId, ports, clock } = options;
  const remembered = new Map<string, WorkbenchView>();
  const viewRecordPorts: ViewRecordPortsHandle = {
    ...ports,
    setViewRecord: (viewId, record) => {
      if (record !== undefined) {
        remembered.set(viewId, record);
      }
      ports.setViewRecord(viewId, record);
    },
  };
  /* One store for the actor's life (rule 9) over whatever connections the filesystem has now. */
  const files = {
    exists: async (path: string) => ports.host().files.exists(path),
    readFile: async (path: string) => ports.host().files.readFile(path),
    writeFileChecked: async (input: Parameters<ViewRecordHost['files']['writeFileChecked']>[0]) =>
      ports.host().files.writeFileChecked(input),
  };
  let facts = initialFacts();
  let restoreFiles: RestoreFiles | undefined;
  return {
    logic: workbenchLayoutMachine.provide({
      actors: {
        layoutRecord: createLayoutRecordLogic({
          root: ports.root,
          files,
          editDebounce: layoutEditDebounceMilliseconds,
          ...(clock === undefined ? {} : { clock }),
          session: { projectId, watch: () => ports.host().watch, onWatchReplaced: ports.onHostReplaced },
        }),
      },
    }),
    viewRecordPorts,
    root: ports.root,
    input: { device: facts.device, adapters: ['workbench', 'viewer'], routeKey: facts.routeKey },
    rememberedViews: () => remembered,
    files: () => restoreFiles,
    setFiles: (next) => {
      restoreFiles = next;
    },
    facts: () => facts,
    setFacts: (next) => {
      facts = next;
    },
  };
}

/** The layout's latest publication, if any: what the record holds. */
export const selectLatestLayout = (
  snapshot: WorkbenchLayoutView,
):
  | Readonly<{ revision: number; layout: WorkbenchLayout; digest: LayoutDigest; origin: 'own' | 'foreign' }>
  | undefined => {
  const { latest } = snapshot.context;
  return latest?.layout === undefined
    ? undefined
    : { revision: latest.revision, layout: latest.layout, digest: latest.digest, origin: latest.origin };
};

/** The device and route key the layout's intents are queued under. */
const selectLayoutFacts = (snapshot: WorkbenchLayoutView): ProjectLayoutFacts => ({
  routeKey: snapshot.context.routeKey,
  device: snapshot.context.device,
});

/**
 * Bring the layout's route key and device up to the shell's facts before an intent is sent or applied: a route key
 * that moved drops every open intent (rule 6), and a device change routes the next intent to the phone's tab or the
 * desktop lane (rule 7).
 *
 * @param layout - The layout actor.
 * @param facts - The shell's facts now.
 */
export function syncLayoutFacts(layout: WorkbenchLayoutRef, facts: ProjectLayoutFacts): void {
  const current = selectLayoutFacts(layout.getSnapshot());
  if (current.device !== facts.device) {
    layout.send({ type: 'deviceChanged', device: facts.device });
  }
  if (current.routeKey !== facts.routeKey) {
    layout.send({ type: 'routeChanged', routeKey: facts.routeKey });
  }
}

let intents = 0;

/**
 * Send a pane intent under the shell's facts now.
 *
 * @param layout - The layout actor.
 * @param facts - The shell's facts now.
 * @param intent - The intent, without its id.
 * @returns The intent's id.
 */
export function sendPaneIntent(
  layout: WorkbenchLayoutRef,
  facts: ProjectLayoutFacts,
  intent: Omit<PaneIntent, 'intentId'>,
): string {
  syncLayoutFacts(layout, facts);
  intents += 1;
  const intentId = `${intent.source}-${String(intents)}`;
  layout.send({ type: 'intent', intentId, source: intent.source, target: intent.target });
  return intentId;
}

const tabsIn = (node: ViewerNode | WorkbenchLaneNode): readonly WorkbenchTab[] =>
  node.kind === 'group' ? node.tabs : node.children.flatMap(tabsIn);

/** The view ids an arrangement's viewer shows. */
export const viewIdsIn = (node: ViewerNode): string[] =>
  tabsIn(node)
    .filter((tab): tab is Extract<WorkbenchTab, { kind: 'view' }> => tab.kind === 'view')
    .map((tab) => tab.view);

/**
 * The editor's rollback slot for an arrangement: the arrangement with the view records its viewer shows.
 *
 * @param layout - The arrangement replaced.
 * @param views - The view records remembered.
 * @returns The previous layout the editor keeps.
 */
export const rollbackOf = (
  layout: WorkbenchLayout,
  views: ReadonlyMap<string, WorkbenchView>,
): PreviousWorkbenchLayout => ({
  layout,
  views: Object.fromEntries(
    viewIdsIn(layout.viewer).flatMap((id) => {
      const record = views.get(id);
      return record ? [[id, record] as const] : [];
    }),
  ),
});

/** Whether the editor takes panel changes: before `ready` it ignores `setPanelState`, and its lanes are not yet loaded. */
const selectEditorReady = (snapshot: ReturnType<EditorRef['getSnapshot']>): boolean => snapshot.matches('ready');

const sameLanes = (left: WorkbenchLayout['lanes'], right: WorkbenchLayout['lanes']): boolean =>
  left.chat === right.chat && left.workbench === right.workbench;

/** The editor's lane flags now. */
const selectEditorLanes = (snapshot: ReturnType<EditorRef['getSnapshot']>): WorkbenchLayout['lanes'] => {
  const { desktopLayout } = snapshot.context.panelState;
  return { chat: desktopLayout.chatOpen, workbench: desktopLayout.workbenchOpen };
};

/**
 * What the focused workspace does with the editor's open and reveal events: its handlers, which the provider hands the
 * runtime as values (it subscribes to nothing). A runtime with no workspace mounted, a live project that is not
 * focused, has none, as today.
 */
export type ProjectShellHandlers = Readonly<{
  /** A reveal asks for a pane (the editor's sibling, A8b). */
  openPanel: (panelId: WorkbenchPanelId, source: PaneIntentSource) => void;
  /** The editor opened a file, from `source`. */
  fileOpened: (path: string, source: string | undefined) => void;
}>;

/** The workspace's handlers now: the provider sets them while it is mounted. */
export type ProjectShellPort = Readonly<{
  get: () => ProjectShellHandlers | undefined;
  set: (handlers: ProjectShellHandlers) => void;
  /** Clear the handlers, if they are still `handlers`. */
  release: (handlers: ProjectShellHandlers) => void;
}>;

/**
 * A runtime's shell port.
 *
 * @returns The port, holding no handlers.
 */
export const createProjectShellPort = (): ProjectShellPort => {
  let current: ProjectShellHandlers | undefined;
  return {
    get: () => current,
    set: (handlers) => {
      current = handlers;
    },
    release: (handlers) => {
      if (current === handlers) {
        current = undefined;
      }
    },
  };
};

/** Input of the bridge: the two siblings it joins. */
export type LayoutBridgeInput = Readonly<{ editor: EditorRef; layout: WorkbenchLayoutRef | undefined }>;

/**
 * The bridge between a project's editor, its layout and the focused workspace (A8b). The editor's open and reveal
 * events reach the workspace's handlers; with a layout, the editor's lanes reach the layout and what the layout asks
 * for reaches the editor. It holds no timer.
 *
 * @param options - The runtime's shell port and, for a project with a layout, its layout host.
 * @returns The bridge's callback logic.
 */
export const createLayoutBridgeLogic = (
  options: Readonly<{
    shell: ProjectShellPort;
    host: Pick<ProjectLayoutHost, 'rememberedViews' | 'facts'> | undefined;
  }>,
): CallbackActorLogic<{ type: 'never' }, LayoutBridgeInput> =>
  createCallbackLogic<{ type: 'never' }, LayoutBridgeInput>(({ input: { editor, layout } }) => {
    const { shell } = options;
    const editorSubscriptions = [
      editor.on('fileOpened', (event) => {
        shell.get()?.fileOpened(event.path, event.source);
      }),
      // A pane a reveal opens mounts after the emit: the reveal is held for its first subscriber.
      editor.on('fileRevealRequested', (event) => {
        holdUnheardFileReveal(editor, event);
      }),
      editor.on('modelComponentRevealRequested', (event) => {
        holdUnheardReveal(editor, 'model', event);
        shell.get()?.openPanel('model', 'editor');
      }),
      editor.on('kinematicsRevealRequested', (event) => {
        holdUnheardReveal(editor, 'kinematics', event);
        shell.get()?.openPanel('kinematics', 'editor');
      }),
    ];
    const { host } = options;
    if (layout === undefined || host === undefined) {
      return () => {
        for (const subscription of editorSubscriptions) {
          subscription.unsubscribe();
        }
      };
    }
    /* Open the desktop lane, as the workspace's `setWorkbenchOpen(true)` does. */
    const showWorkbench = (): void => {
      editor.send({
        type: 'setPanelState',
        panelState: { desktopLayout: { workbenchOpen: true, compactAuxiliary: 'workbench' } },
      });
    };
    /* The lanes last reported to the layout; `undefined` until the editor is ready and they are seeded. */
    let lanes: WorkbenchLayout['lanes'] | undefined;
    /* Show `shown` lanes on the editor, unless it shows them already. */
    const showLanes = (shown: WorkbenchLayout['lanes']): void => {
      if (!sameLanes(selectEditorLanes(editor.getSnapshot()), shown)) {
        editor.send({
          type: 'setPanelState',
          panelState: { desktopLayout: { chatOpen: shown.chat, workbenchOpen: shown.workbench } },
        });
      }
    };
    const subscriptions = [
      // What the layout asks of the editor.
      layout.on('workbenchOpenRequested', () => {
        showWorkbench();
      }),
      layout.on('mobileTabRequested', ({ target }) => {
        editor.send({
          type: 'setPanelState',
          panelState: {
            mobileActiveTab:
              target.kind === 'file' ? 'editor' : mobilePanelByWorkbenchPanel[target.pane as WorkbenchPanelId],
          },
        });
      }),
      // An applied arrangement brings its lanes; a lane the person changed since is theirs (rule 8 fences it).
      layout.on('arranged', ({ layout: arrangement, baseline }) => {
        if (lanes === undefined) {
          // The editor would ignore them before it is ready: the seed shows the arrangement's lanes then.
          return;
        }
        if (baseline) {
          // The record's first arrangement: the layout holds its lanes as the baseline, so showing them is neither a
          // closed lane (rule 7) nor a person's edit (rule 1), only lanes on screen (rule 4).
          lanes = arrangement.lanes;
          showLanes(arrangement.lanes);
          layout.send({ type: 'lanesApplied', lanes: arrangement.lanes });
          return;
        }
        showLanes(arrangement.lanes);
      }),
    ];
    /* The editor's lanes once it is ready. An arrangement read before then brought lanes the editor ignored, so they
     * are shown now, ahead of anything the seed asks of the editor; and the lanes on screen are the layout's baseline
     * (`lanesSeeded`): not a closed lane (rule 7) nor a person's edit (rule 1), and the intents that waited for them
     * are routed. */
    const seed = (snapshot: ReturnType<EditorRef['getSnapshot']>): void => {
      const shown = layout.getSnapshot().context.arrangement?.lanes ?? selectEditorLanes(snapshot);
      lanes = shown;
      showLanes(shown);
      // The intents that waited are routed by the seed: the layout first hears the shell's route and device now, so one
      // queued under a route the shell has left is dropped (rule 6), not shown on the phone's tab or opened.
      syncLayoutFacts(layout, host.facts());
      layout.send({ type: 'lanesSeeded', lanes: shown });
    };
    /* After the seed, the editor's lanes: what is on screen (rule 4), a closed lane (rule 7) and a person's lane edit
     * (rule 1). */
    const follow = (snapshot: ReturnType<EditorRef['getSnapshot']>): void => {
      if (lanes === undefined) {
        if (selectEditorReady(snapshot)) {
          seed(snapshot);
        }
        return;
      }
      const next = selectEditorLanes(snapshot);
      if (sameLanes(next, lanes)) {
        return;
      }
      const workbenchChanged = next.workbench !== lanes.workbench;
      lanes = next;
      if (workbenchChanged) {
        layout.send({ type: 'workbenchLaneChanged', open: next.workbench });
      }
      layout.send({ type: 'lanesApplied', lanes: next });
      const { arrangement } = layout.getSnapshot().context;
      if (arrangement !== undefined && !sameLanes(arrangement.lanes, next)) {
        layout.send({ type: 'lanesEdited', lanes: next });
      }
    };
    const editorSubscription = editor.subscribe(follow);
    follow(editor.getSnapshot());
    /* A foreign publication that changes the record saves the arrangement it replaced as the editor's previous layout. */
    let previous = selectLatestLayout(layout.getSnapshot());
    const layoutSubscription = layout.subscribe((snapshot) => {
      const latest = selectLatestLayout(snapshot);
      if (latest === undefined || latest.revision === previous?.revision) {
        return;
      }
      const replaced = previous;
      previous = latest;
      if (replaced !== undefined && latest.origin === 'foreign' && !sameLayout(replaced.layout, latest.layout)) {
        editor.send({ type: 'setPreviousLayout', layout: rollbackOf(replaced.layout, host.rememberedViews()) });
      }
    });
    return () => {
      for (const subscription of [...editorSubscriptions, ...subscriptions]) {
        subscription.unsubscribe();
      }
      editorSubscription.unsubscribe();
      layoutSubscription.unsubscribe();
    };
  });

/** What a restore command names: the record bytes and the rollback slot the card read, and its own eligibility. */
export type RestoreCommand = Readonly<{ layoutDigest: string; target: string; eligible: () => boolean }>;

let restores = 0;

/**
 * The arrange-workbench card's Restore (rows Y1, I14): the saved views' records are recreated, then the layout's restore
 * is asked over the record bytes the card read. On success the arrangement it replaced becomes the rollback slot.
 *
 * @param options - The layout and editor, the record's files and root, the remembered views and the command.
 * @returns Whether the restore was written.
 */
export async function restorePreviousLayout(
  options: Readonly<{
    layout: WorkbenchLayoutRef;
    editor: EditorRef;
    host: Pick<ProjectLayoutHost, 'files' | 'root' | 'rememberedViews'>;
    command: RestoreCommand;
    /** Whether the slot can be restored now (every view it shows has a saved record). */
    restorable: () => boolean;
    onError: (error: unknown) => void;
  }>,
): Promise<boolean> {
  const { layout, editor, host, command } = options;
  const previous = editor.getSnapshot().context.previousLayout;
  const current = selectLatestLayout(layout.getSnapshot());
  const eligible = (): boolean =>
    JSON.stringify(editor.getSnapshot().context.previousLayout) === command.target &&
    selectLatestLayout(layout.getSnapshot())?.digest === command.layoutDigest &&
    options.restorable() &&
    command.eligible();
  const files = host.files();
  if (previous === undefined || current === undefined || !eligible()) {
    return false;
  }
  if (files === undefined) {
    options.onError(new Error('View files are not available yet.'));
    return false;
  }
  for (const viewId of viewIdsIn(previous.layout.viewer)) {
    const seed = previous.views[viewId];
    if (
      !eligible() ||
      seed === undefined ||
      // oxlint-disable-next-line no-await-in-loop -- one view at a time: the first that fails or turns ineligible stops the restore.
      !(await ensureViewFile({
        root: host.root,
        viewId,
        files,
        seed,
        eligible,
        onError: options.onError,
      }))
    ) {
      return false;
    }
  }
  if (!eligible()) {
    return false;
  }
  restores += 1;
  const restoreId = `restore-${String(restores)}`;
  const outcome = await new Promise<'applied' | 'refused'>((resolve) => {
    const settled = layout.on('restoreSettled', (event) => {
      if (event.restoreId === restoreId) {
        settled.unsubscribe();
        stopped.unsubscribe();
        resolve(event.outcome);
      }
    });
    // A layout that stops before it answers wrote nothing this restore can count on.
    const stopped = layout.subscribe({
      complete: () => {
        settled.unsubscribe();
        resolve('refused');
      },
      error: () => {
        settled.unsubscribe();
        resolve('refused');
      },
    });
    layout.send({
      type: 'restore',
      restoreId,
      expected: command.layoutDigest as LayoutDigest,
      layout: previous.layout,
    });
  });
  if (outcome !== 'applied') {
    return false;
  }
  if (JSON.stringify(editor.getSnapshot().context.previousLayout) === command.target) {
    editor.send({ type: 'setPreviousLayout', layout: rollbackOf(current.layout, host.rememberedViews()) });
  }
  return true;
}
