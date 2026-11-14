/**
 * The page's layout controller over a live project's `workbenchLayout` actor (app state orchestration plan § 4 A8b).
 *
 * The workbench and viewer Dockviews, the file tree and the arrange-workbench card still speak the
 * {@link WorkbenchLayoutController} contract the record host offered. Until A8c and A8d write the real adapters, this
 * shim speaks the layout actor's adapter protocol on their behalf: a registered `apply` is an adapter that attaches at
 * once, answers each `show` when its arrangement is on screen and takes every offered apply; a person's rearrangement
 * is `personEdited`; and the workbench's opener and file activation answer the layout's delivered pane intents. It
 * holds no timer and starts no actor; everything over time is the layout actor's.
 *
 * @module
 */
import type { ViewerNode, WorkbenchLaneNode, WorkbenchLayout, WorkbenchTab } from '@taucad/workbench';
import type { ActorRefFrom } from 'xstate';
import { Topic } from '@taucad/events';
import { isFeatureEnabled } from '#flags/feature-flags.js';
import { subscribeFeatureFlags } from '#flags/use-feature.js';
import type { editorMachine } from '#machines/editor.machine.js';
import {
  restorePreviousLayout,
  selectLatestLayout,
  syncLayoutFacts,
  viewIdsIn,
} from '#runtime/project-runtime.layout.js';
import type { ProjectLayoutHost, WorkbenchLayoutRef } from '#runtime/project-runtime.layout.js';
import { selectAppliedLayoutDigest, selectLayoutReady } from '#workbench-records/workbench-layout.machine.js';
import { intentOf } from '#workbench-records/pane-intents.js';
import type { LayoutAdapterId } from '#workbench-records/pane-intents.js';
import type {
  WorkbenchLayoutController,
  WorkbenchLayoutSnapshot,
} from '#routes/w.$workspace.$project/workbench-layout-controller.js';
import type { WorkbenchPanelId } from '#routes/w.$workspace.$project/project-workspace-context.panels.js';

type EditorRef = ActorRefFrom<typeof editorMachine>;

/**
 * The workbench's two ways to answer a pane intent: open a pane, and activate an open file's tab. Each answers at once
 * with the workbench node Dockview shows after it (its model changes synchronously; only its layout report is deferred),
 * `undefined` when it cannot read one, and the opener `false` when it refuses the pane (one the view does not offer).
 */
export type WorkbenchIntentTarget = Readonly<{
  openPanel: (panelId: WorkbenchPanelId) => WorkbenchLaneNode | false | undefined;
  activateFile?: (path: string) => WorkbenchLaneNode | undefined;
}>;

/** The controller, with the workbench's intent target the workspace connects. */
export type WorkbenchLayoutControllerShim = WorkbenchLayoutController &
  Readonly<{
    /** Connect the workbench's opener and file activation: delivered intents are applied through them. */
    connectIntents: (target: WorkbenchIntentTarget) => () => void;
  }>;

/** A delivered intent's target, as the layout names it. */
type DeliveredTarget =
  | Readonly<{ kind: 'pane'; adapter: LayoutAdapterId; pane: string }>
  | Readonly<{ kind: 'file'; path: string }>;

const tabsIn = (node: ViewerNode | WorkbenchLaneNode): readonly WorkbenchTab[] =>
  node.kind === 'group' ? node.tabs : node.children.flatMap(tabsIn);

/** The debug panes a session without debug mode does not show (the record host's refusal). */
const debugOnlyTabs = (layout: WorkbenchLayout): WorkbenchLayoutSnapshot['refused'] =>
  tabsIn(layout.workbench)
    .filter(
      (tab): tab is Extract<WorkbenchTab, { kind: 'pane' }> =>
        tab.kind === 'pane' && (tab.pane === 'kernel' || tab.pane === 'console'),
    )
    .map((tab) => ({ tab, reason: 'debug-only' }));

/** The editor's rollback slot now. */
const selectPreviousLayout = (editor: EditorRef) => editor.getSnapshot().context.previousLayout;

/** The editor's open files now. */
const selectOpenFilePaths = (editor: EditorRef): readonly string[] =>
  editor.getSnapshot().context.openFiles.map((file) => file.path);

/** Why the rollback slot cannot be restored, or `undefined` when it can. */
const restoreUnavailableOf = (previous: ReturnType<typeof selectPreviousLayout>): string | undefined => {
  if (previous === undefined) {
    return 'No previous layout is saved.';
  }
  const missing = viewIdsIn(previous.layout.viewer).find((id) => !previous.views[id]);
  return missing === undefined ? undefined : `The prior view ${missing} has no saved record.`;
};

/**
 * Build the controller over one live project's layout actor.
 *
 * @param options - The layout actor, its editor sibling and the runtime's layout host.
 * @returns The controller and the workbench's intent connection.
 */
export function createWorkbenchLayoutControllerShim(
  options: Readonly<{ layout: WorkbenchLayoutRef; editor: EditorRef; host: ProjectLayoutHost }>,
): WorkbenchLayoutControllerShim {
  const { layout, editor, host } = options;
  /* Plain notifications to the page's readers: the restore flag and its notices change here, not in an actor. */
  const changed = new Topic<void>({ name: 'workbenchLayoutControllerShim' });
  const notify = (): void => {
    changed.emit();
  };
  let restoring = false;
  let notice: Readonly<{ text: string; version: number }> | undefined;
  const announce = (text: string): void => {
    notice = { text, version: (notice?.version ?? 0) + 1 };
    notify();
  };

  let cached: Readonly<{ key: readonly unknown[]; snapshot: WorkbenchLayoutSnapshot | undefined }> | undefined;
  const snapshot = (): WorkbenchLayoutSnapshot | undefined => {
    const state = layout.getSnapshot();
    const latest = selectLatestLayout(state);
    const previous = selectPreviousLayout(editor);
    const debug = isFeatureEnabled('tauDebug');
    const applied = selectAppliedLayoutDigest(state);
    const refused = state.context.latest?.refused === true;
    const key = [latest?.revision, latest?.layout, refused, applied, previous, restoring, debug, notice] as const;
    if (cached?.key.every((value, index) => value === key[index])) {
      return cached.snapshot;
    }
    const restoreUnavailable = restoreUnavailableOf(previous);
    const next: WorkbenchLayoutSnapshot | undefined =
      latest === undefined || refused
        ? undefined
        : {
            layout: latest.layout,
            refused: debug ? [] : debugOnlyTabs(latest.layout),
            layoutDigest: latest.digest,
            appliedDigest: applied,
            ...(previous === undefined ? {} : { restoreTarget: JSON.stringify(previous) }),
            ...(restoreUnavailable === undefined ? {} : { restoreUnavailable }),
            restoring,
            ...(notice === undefined ? {} : { notice }),
          };
    cached = { key, snapshot: next };
    return next;
  };

  /* What each registered adapter shows: what it last applied, or what the person last arranged on it, or what
   * an intent opened on it. */
  const onScreen = new Map<LayoutAdapterId, string>();

  /* The workbench's intent target, and the deliveries that wait for it to connect. */
  let intentTarget: WorkbenchIntentTarget | undefined;
  const held = new Map<string, Readonly<{ deliveryId: number; target: DeliveredTarget }>>();
  /* The show the workbench is applying, if any: Dockview may hold an apply (a file it shows opens first), and a pane
   * opened on what it shows before then would be replaced by it, so deliveries wait for the apply to land. */
  let workbenchApplying: number | undefined;
  /* Whether the person changed the workbench while its apply was held: the apply lands over that edit (the I10 gap), and
   * what it lands is not then counted as an edit too, which would write it over the person's edit. */
  let editedWhileApplying = false;

  /**
   * Whether the layout will drop a delivery once it hears what the shell and editor say now. A delivery made inside the
   * layout's own step (an apply that lands at once releases what it held) reads the layout before the events sent in
   * that step, so what it has heard is compared with what is true: a route the shell has left (rule 6), or a lane the
   * editor has closed (rule 7). The lane is closing when the editor hides a lane the bridge last reported shown; a lane
   * the layout has just asked to open is not, since the editor shows it only after this step.
   */
  const droppedUnheard = (delivered: DeliveredTarget, routeKey: string): boolean => {
    const heard = layout.getSnapshot().context;
    if (heard.routeKey !== routeKey) {
      return true;
    }
    return (
      (heard.appliedLanes?.workbench ?? heard.workbenchOpen) &&
      !editor.getSnapshot().context.panelState.desktopLayout.workbenchOpen &&
      (delivered.kind === 'file' || delivered.pane === 'files')
    );
  };

  function deliverNow(
    delivery: Readonly<{
      intentId: string;
      deliveryId: number;
      target: DeliveredTarget;
    }>,
    target: WorkbenchIntentTarget,
  ): void {
    const { intentId, deliveryId } = delivery;
    const facts = host.facts();
    const unheard = droppedUnheard(delivery.target, facts.routeKey);
    // Rule 6: the layout hears the route the shell is on now, which drops what was queued under another.
    syncLayoutFacts(layout, facts);
    const { latest, arrangement, intents } = layout.getSnapshot().context;
    const entry = intentOf(intents, intentId);
    if (unheard || entry?.state !== 'delivered' || entry.deliveryId !== deliveryId || latest?.refused === true) {
      // A delivery dropped while it was held, or about to be, opens nothing; nor does one on a refused record, whose
      // workbench shows only what is on disk, as the record host did. The answer names the delivery and reaches the
      // layout after the route or lane change, so the dropped intent's late answer is taken and nothing is counted.
      layout.send({ type: 'intentUnavailable', intentId, deliveryId });
      return;
    }
    let answer: WorkbenchLaneNode | false | undefined = false;
    if (delivery.target.kind === 'pane') {
      answer = target.openPanel(delivery.target.pane as WorkbenchPanelId);
    } else if (target.activateFile !== undefined && selectOpenFilePaths(editor).includes(delivery.target.path)) {
      // A file the editor holds is shown; one it closed since is not reopened by its old intent.
      answer = target.activateFile(delivery.target.path);
    }
    const node = answer === false ? undefined : (answer ?? arrangement?.workbench);
    if (node !== undefined) {
      // Dockview reports this change later (its layout event is deferred): the report then matches what is on screen
      // and is not sent again as the person's edit.
      onScreen.set('workbench', JSON.stringify(node));
    }
    if (node === undefined || latest === undefined) {
      // The opener refused the pane, the file closed before its intent arrived, or the record could not be read at all
      // (the pane opens, but there is no record to hold it): nothing becomes an edit. A record that is missing is
      // not refused: the intent's node starts its arrangement.
      layout.send({ type: 'intentUnavailable', intentId, deliveryId });
      return;
    }
    layout.send({ type: 'intentApplied', intentId, deliveryId, node });
  }

  /** Deliver the held intents the workbench can take now, in the order they were held. */
  const deliverHeld = (): void => {
    const target = intentTarget;
    if (target === undefined || workbenchApplying !== undefined) {
      return;
    }
    for (const [intentId, delivery] of held) {
      if (delivery.target.kind === 'file' && target.activateFile === undefined) {
        continue;
      }
      held.delete(intentId);
      deliverNow({ intentId, ...delivery }, target);
    }
  };

  const register = <Node extends ViewerNode | WorkbenchLaneNode>(
    adapter: LayoutAdapterId,
    apply: (node: Node, applied: (shown?: Node) => void) => void,
  ): (() => void) => {
    let registered = true;
    onScreen.delete(adapter);
    // The route the adapter's deliveries are checked against.
    syncLayoutFacts(layout, host.facts());
    const subscriptions = [
      layout.on('show', (event) => {
        if (event.adapter !== adapter || !registered) {
          return;
        }
        if (event.layout === undefined) {
          // Rule 4: report what is on screen; an apply this adapter took has reported through its own show.
          layout.send({ type: 'adapterShown', adapter, showId: event.showId });
          return;
        }
        const node = (adapter === 'viewer' ? event.layout.viewer : event.layout.workbench) as Node;
        const shown = JSON.stringify(node);
        if (onScreen.get(adapter) === shown && !(adapter === 'workbench' && workbenchApplying !== undefined)) {
          // Already on screen (a change to the other adapter's tree or the lanes): not applied again. While an older
          // apply is still held, it is applied anyway, so the Dockview replaces the held node and does not land it later.
          layout.send({ type: 'adapterShown', adapter, showId: event.showId });
          return;
        }
        if (adapter === 'workbench') {
          workbenchApplying = event.showId;
          editedWhileApplying = false;
        }
        apply(node, (landed?: Node) => {
          if (registered) {
            const actual = landed === undefined ? shown : JSON.stringify(landed);
            onScreen.set(adapter, actual);
            if (landed !== undefined && actual !== shown && !(adapter === 'workbench' && editedWhileApplying)) {
              // It shows less than it was handed (a tab whose file did not open): that is the arrangement now, an edit
              // reported before the show, so the revision it was handed is not acknowledged (I12).
              layout.send(
                adapter === 'viewer'
                  ? { type: 'personEdited', adapter, node: landed as ViewerNode }
                  : { type: 'personEdited', adapter, node: landed as WorkbenchLaneNode },
              );
            }
            layout.send({ type: 'adapterShown', adapter, showId: event.showId });
          }
          // A newer apply replaces this one, and only the newest lands.
          if (adapter === 'workbench' && workbenchApplying === event.showId) {
            workbenchApplying = undefined;
            deliverHeld();
          }
        });
      }),
      layout.on('applyOffered', (event) => {
        if (registered) {
          layout.send({ type: 'applyTaken', adapter, applyId: event.applyId });
        }
      }),
      layout.on('deliverIntent', (event) => {
        if (event.adapter !== adapter || !registered) {
          return;
        }
        if (adapter === 'viewer') {
          // No viewer intent has a sender until A8d writes the viewer adapter.
          layout.send({ type: 'intentUnavailable', intentId: event.intentId, deliveryId: event.deliveryId });
          return;
        }
        const target = intentTarget;
        if (
          target === undefined ||
          (event.target.kind === 'file' && target.activateFile === undefined) ||
          workbenchApplying !== undefined
        ) {
          // Applied once the workbench's opener connects and what it was shown has landed.
          held.set(event.intentId, { deliveryId: event.deliveryId, target: event.target });
          return;
        }
        deliverNow(event, target);
      }),
    ];
    layout.send({ type: 'adapterAttaching', adapter });
    layout.send({ type: 'adapterAttached', adapter });
    return () => {
      if (!registered) {
        return;
      }
      registered = false;
      onScreen.delete(adapter);
      for (const subscription of subscriptions) {
        subscription.unsubscribe();
      }
      if (adapter === 'workbench') {
        // The layout queues its delivered intents again for the next attach (rule 4).
        held.clear();
        workbenchApplying = undefined;
      }
      layout.send({ type: 'adapterDetached', adapter });
    };
  };

  return {
    snapshot,
    subscribe: (listener) => {
      const unsubscribeChanged = changed.subscribe(listener);
      const layoutSubscription = layout.subscribe(listener);
      const editorSubscription = editor.subscribe(listener);
      const unsubscribeFlags = subscribeFeatureFlags(listener);
      return () => {
        unsubscribeChanged();
        layoutSubscription.unsubscribe();
        editorSubscription.unsubscribe();
        unsubscribeFlags();
      };
    },
    restorePreviousArrangement: async (expected) => {
      if (restoring) {
        return false;
      }
      restoring = true;
      notify();
      try {
        const written = await restorePreviousLayout({
          layout,
          editor,
          host,
          command: expected,
          restorable: () => restoreUnavailableOf(selectPreviousLayout(editor)) === undefined,
          onError: (error) => {
            announce(error instanceof Error ? error.message : 'View could not be restored.');
          },
        });
        if (written) {
          announce('Restore written.');
        }
        return written;
      } finally {
        restoring = false;
        notify();
      }
    },
    registerViewer: (apply) => register<ViewerNode>('viewer', apply),
    registerWorkbench: (apply) => register<WorkbenchLaneNode>('workbench', apply),
    personViewerChanged: (node) => {
      onScreen.set('viewer', JSON.stringify(node));
      layout.send({ type: 'personEdited', adapter: 'viewer', node });
    },
    personWorkbenchChanged: (node) => {
      const shown = JSON.stringify(node);
      if (onScreen.get('workbench') === shown) {
        // Dockview's deferred report of what an intent's answer already carried, or of what it was shown.
        return;
      }
      onScreen.set('workbench', shown);
      if (workbenchApplying !== undefined) {
        editedWhileApplying = true;
      }
      layout.send({ type: 'personEdited', adapter: 'workbench', node });
    },
    ready: () => selectLayoutReady(layout.getSnapshot()),
    connectIntents: (target) => {
      intentTarget = target;
      deliverHeld();
      return () => {
        if (intentTarget === target) {
          intentTarget = undefined;
        }
      };
    },
  };
}
