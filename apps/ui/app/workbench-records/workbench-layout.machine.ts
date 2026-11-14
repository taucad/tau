/**
 * `workbenchLayout`: one per live project. It owns the layout record session and applies the record to the workbench
 * and viewer Dockview adapters, keeps the person's arrangement over the record (I10), accounts for every pane intent
 * (I11), acknowledges a revision only once it is on screen (I12), holds one record session for the file (I13) and
 * settles restore commands against the arrangement they expected (I14). App state orchestration charter D2, D4, D11,
 * D13, D23; package A8a. It conforms to `specs/layout-apply/LayoutApply.tla`, whose README states the rules it keeps.
 * A8b makes it a child of the project runtime; A8c and A8d write the real adapters. Until then it is unwired.
 *
 * ```text
 * workbenchLayout (parallel)
 * ├── record     reading ──recordPublished──▶ ready         the record session: the `layoutRecord` child
 * ├── workbench  detached ──adapterAttaching──▶ attaching ──adapterAttached──▶ attached; adapterDetached ──▶ detached
 * ├── viewer     detached ──adapterAttaching──▶ attaching ──adapterAttached──▶ attached; adapterDetached ──▶ detached
 * ├── intents    idle ⇄ waiting                            waiting while an intent is open
 * └── restore    idle ──restore──▶ restoring ──recordRestoreAnswered──▶ idle
 * ```
 *
 * **The record child.** `layoutRecord` is a callback actor that holds the layout store
 * (`createWorkbenchLayoutStore`, the existing `workbench-layout-controller` contract) in its closure (D4): the store's
 * `recordSync` actor, its file ports and its timers never reach context (MC-R5). It reports each publication with
 * whether a local edit was still owed when it was published, and answers the edits, restores and flushes the machine
 * sends it. It lives as long as the machine, so the file has one record session however often an adapter mounts (I13,
 * rule 9).
 *
 * **The adapters are ports.** The machine talks to each adapter by emitted events and hears it by public events, so a
 * `DockviewApi` never reaches context (D4). An adapter reports `adapterAttaching` when it mounts, `adapterAttached` once
 * Dockview is ready and `adapterDetached` when it unmounts. While attached it:
 *
 * - answers each `show` with `adapterShown` once that arrangement (or, for a show with no layout, the one it holds) is
 *   on screen. An apply, and any change event it causes, is never reported as a person's edit (environment assumption
 *   A of the README);
 * - takes an offered apply with `applyTaken` when it can apply it (not mid-gesture), and applies the `show` that
 *   answers it synchronously;
 * - reports the person's rearrangement with `personEdited`;
 * - answers each `deliverIntent` with `intentApplied` (its arrangement after the intent) or `intentUnavailable`, before
 *   it detaches.
 *
 * **Rules (LayoutApply README, Rules for A8a).**
 *
 * 1. A person's edit, an applied intent and an applied restore each count one edit and are written to the record.
 * 2. An apply carries the edit count at its publication's arrival and lands only while its publication is the latest
 *    and the count is unchanged; otherwise it is discarded at once. A newer publication supersedes it.
 * 3. A publication whose bytes the arrangement already holds is not applied, whatever its origin: applying it changes
 *    nothing (D18), and it may be acknowledged.
 * 4. A revision is acknowledged only after every adapter of the device is attached and has reported its latest `show`,
 *    with no apply in flight and the arrangement holding the revision's bytes. Any detach makes the applied revision
 *    unknown; when the last adapter detaches an apply in flight is dropped and computed again on the next attach. As
 *    built (D14), the workbench Dockview stays mounted, and so attached, while its lane is hidden; on a device with
 *    lane flags the lanes on screen must also be the revision's (`lanesApplied`), the hidden lane included.
 * 5. A restore `{restoreId, expected}` may be sent any number of times. It is asked only while the arrangement holds
 *    the record bytes `expected` names and no edit is owed, and settles `applied` only if the record took it and the
 *    arrangement has not moved when the record answers; otherwise it is refused and the arrangement is not changed by
 *    it. The store checks eligibility before its write, not atomically with it, so a restore refused because the
 *    arrangement moved may still be in the record: its echo and the record's rebase are then applied as publications,
 *    and the arrangement converges on the record. One restore runs at a time.
 * 6. A route key change drops every open intent with `routeChanged`, in the same step. An adapter may still answer an
 *    intent dropped while it was delivered: the intent stays dropped, and the node it reports is counted as a person's
 *    edit, since that is what the adapter shows. A re-sent intent or restore id is answered again by its first outcome.
 * 7. On a desktop a workbench intent opens the workbench lane. On a phone a pane intent settles at once by setting the
 *    phone's tab (`mobileTabRequested`), and a file intent sets the tab and waits for the workbench, as
 *    `project-workspace-context.tsx` does today. Closing the lane drops the open file intents and the Files pane with
 *    `workbenchClosed`, as today's close clears them; any other pane intent survives it (A0.3 row 1c, D14). An intent for an adapter the device lacks is dropped `unavailable`.
 * 8. A publication that arrives while the record says a local edit is owed is fenced at arrival and never applied, even
 *    after the edit is written; the record's rebase of the edit comes back as a later publication. The record's word
 *    (`owed`) is current, since edits reach it synchronously, so its own echo of a written edit, which it publishes
 *    before the edit's answer, is not fenced. An edit stays owed until the record answers it written, or publishes
 *    with nothing owed.
 * 9. The record session is a child of this actor, which outlives any mount (I13).
 *
 * Before the record's first read nothing is shown: the first publication becomes the arrangement and seeds every
 * attached adapter, person edits are ignored (as the host ignores them today) and intents wait.
 *
 * A project runtime's layout starts before its editor has loaded its lanes (`awaitsLanes`, A8b): until the editor
 * reports them with `lanesSeeded`, intents wait unrouted and undelivered, and nothing is acknowledged, since the editor
 * takes no panel change before it is ready and its lanes so far are defaults.
 *
 * Context holds no durable fact of its own: the arrangement, the publications and the acknowledgement are rebuilt from
 * the record's next read by a new actor (MC-R5).
 *
 * @module
 */
/* oxlint-disable typescript/no-restricted-types -- Refused record bytes may be absent (null), as the store reports them. */
/* oxlint-disable eslint/max-params -- A transition's helpers take its context, view and enqueuer beside their own arguments. */
import { createActor, createCallbackLogic, setup, types } from 'xstate';
import type {
  Actor,
  ActorOptions,
  ActorRefFrom,
  AnyActorLogic,
  AnyActorRef,
  CallbackActorLogic,
  EnqueueObject,
  SnapshotFrom,
  StateValue,
} from 'xstate';
import type { ViewerNode, WorkbenchLaneNode, WorkbenchLayout } from '@taucad/workbench';
import { workbenchPaths } from '@taucad/workbench';
import type { WatchEvent } from '@taucad/filesystem';
import { ObservationService } from '@taucad/fs-client/observation-service';
import type { ObservationWatch } from '@taucad/fs-client/observation-service';
import { publishRecordIssue, recordIssueState } from '#workbench-records/record-issues.js';
import { eventSchemas } from '@taucad/ui-core/lib/xstate.lib';
import { createWorkbenchLayoutStore } from '#routes/w.$workspace.$project/workbench-layout-controller.js';
import type { RecordHealth } from '#workbench-records/record-health.js';
import type { RecordRefusal } from '#workbench-records/record-sync-policy.js';
import { layoutPolicy } from '#workbench-records/layout-policy.js';
import {
  intentAdapter,
  intentOf,
  isOpen,
  lateAnswered,
  ownValue,
  openIntents,
  outcomeOf,
  queued,
  retired,
  settleWhere,
  withState,
} from '#workbench-records/pane-intents.js';
import type {
  LayoutAdapterId,
  PaneIntent,
  PaneIntentEntry,
  PaneIntentOutcome,
  PaneIntentOutcomes,
  PaneIntents,
  PaneIntentTarget,
} from '#workbench-records/pane-intents.js';

/** The device the layout is shown on: a phone has no lane, and its workbench shows only on the editor tab. */
export type WorkbenchLayoutDevice = 'desktop' | 'phone';

/** A layout digest as the record reports it. */
export type LayoutDigest = `sha256:${string}` | 'missing';

/** Input of {@link workbenchLayoutMachine}. */
export type WorkbenchLayoutInput = Readonly<{
  device: WorkbenchLayoutDevice;
  /** The adapters this device has; the phone shell's viewer-only form passes `['viewer']`. */
  adapters: readonly LayoutAdapterId[];
  /** The route key intents are queued under (rule 6). */
  routeKey: string;
  /** Whether the workbench lane is open when the actor starts. */
  workbenchOpen: boolean;
  /**
   * The editor's chat and workbench lane flags when the actor starts. Given, rule 4 also waits for the lanes on screen
   * to match the revision's (`lanesApplied`), as the record host's acknowledgement did (A8b, D14). Omitted, the device
   * has no lane flags to check.
   */
  lanes?: WorkbenchLayout['lanes'];
  /**
   * The editor is still loading its lanes, so `workbenchOpen` and `lanes` are its defaults, not what will show. Until
   * `lanesSeeded` reports them, intents wait without opening the lane, showing a phone tab or reaching an adapter, and
   * nothing is acknowledged (A8b): the editor takes no panel change before it is ready.
   */
  awaitsLanes?: boolean;
}>;

/** The public event alphabet of {@link workbenchLayoutMachine}. */
export type WorkbenchLayoutEvent =
  /** The record child: a publication, and whether a local edit was still owed when it was published (rule 8). */
  | Readonly<{
      type: 'recordPublished';
      layout: WorkbenchLayout | undefined;
      digest: LayoutDigest;
      origin: 'own' | 'foreign';
      refusal: RecordRefusal | undefined;
      owed: boolean;
    }>
  /** The record child: the edit sent at `editCount` is answered (`ok` when the file holds it). */
  | Readonly<{ type: 'recordEditAnswered'; editCount: number; ok: boolean }>
  /** The record child: the restore's checked write is answered. */
  | Readonly<{ type: 'recordRestoreAnswered'; restoreId: string; ok: boolean }>
  /** The record child: a flush is answered (`ok` once nothing is owed). */
  | Readonly<{ type: 'recordFlushAnswered'; requestId: string; ok: boolean }>
  /** The record child: the record's read and write health changed. */
  | Readonly<{ type: 'recordHealthChanged'; health: RecordHealth }>
  /** The record child: the record failed (its health carries the detail). */
  | Readonly<{ type: 'recordFailed'; message: string }>
  /** The file changed on disk (its watch fired): the record reads it again. */
  | Readonly<{ type: 'recordInvalidated' }>
  /** Settle the record's pending write; answered with the emitted `flushed`. */
  | Readonly<{ type: 'flush'; requestId: string }>
  /** An adapter mounted and waits for Dockview. */
  | Readonly<{ type: 'adapterAttaching'; adapter: LayoutAdapterId }>
  /** An adapter's Dockview is ready. */
  | Readonly<{ type: 'adapterAttached'; adapter: LayoutAdapterId }>
  /** An adapter unmounted. */
  | Readonly<{ type: 'adapterDetached'; adapter: LayoutAdapterId }>
  /** An adapter shows the arrangement of `show` `showId`. */
  | Readonly<{ type: 'adapterShown'; adapter: LayoutAdapterId; showId: number }>
  /** An adapter takes the offered apply `applyId`. */
  | Readonly<{ type: 'applyTaken'; adapter: LayoutAdapterId; applyId: number }>
  /** The person rearranged an adapter's panes. */
  | Readonly<{ type: 'personEdited'; adapter: 'viewer'; node: ViewerNode }>
  | Readonly<{ type: 'personEdited'; adapter: 'workbench'; node: WorkbenchLaneNode }>
  /** The person opened or closed the chat or workbench lane: an edit of the record's lane flags. */
  | Readonly<{ type: 'lanesEdited'; lanes: WorkbenchLayout['lanes'] }>
  /** The workbench lane opened or closed (the editor's panel state). */
  | Readonly<{ type: 'workbenchLaneChanged'; open: boolean }>
  /** The chat and workbench lane flags now on screen (the editor's panel state): rule 4 waits for them (A8b, D14). */
  | Readonly<{ type: 'lanesApplied'; lanes: WorkbenchLayout['lanes'] }>
  /**
   * The lanes the editor loaded, once it is ready (`awaitsLanes`): what is on screen and whether the workbench lane is
   * open. A baseline, not a lane change: it drops no intent (rule 7) and is not an edit (rule 1).
   */
  | Readonly<{ type: 'lanesSeeded'; lanes: WorkbenchLayout['lanes'] }>
  /** The shell the layout is shown on changed (the phone breakpoint): intents follow it from the next one (rule 7). */
  | Readonly<{ type: 'deviceChanged'; device: WorkbenchLayoutDevice }>
  /** The route key changed. */
  | Readonly<{ type: 'routeChanged'; routeKey: string }>
  /** A pane intent. */
  | (Readonly<{ type: 'intent' }> & PaneIntent)
  /** The adapter applied delivery `deliveryId` of an intent and shows `node`. */
  | Readonly<{ type: 'intentApplied'; intentId: string; deliveryId: number; node: ViewerNode | WorkbenchLaneNode }>
  /** The intent's target cannot open. */
  /**
   * The intent's target cannot open. With the `deliveryId` it answers, an adapter that opened nothing for a delivery
   * dropped meanwhile gives its one late answer (rules 6 and 7).
   */
  | Readonly<{ type: 'intentUnavailable'; intentId: string; deliveryId?: number }>
  /** A restore command: write `layout` over the record bytes `expected` names. */
  | Readonly<{ type: 'restore'; restoreId: string; expected: LayoutDigest; layout: WorkbenchLayout }>;

/** Events the machine emits: to the adapters, to the phone's tab port, and to its owner. */
export type WorkbenchLayoutEmitted =
  /** Show `layout` (the adapter's part of it); with no layout, report what the adapter holds. */
  | Readonly<{ type: 'show'; adapter: LayoutAdapterId; showId: number; layout: WorkbenchLayout | undefined }>
  /** An apply is ready for the attached adapters to take. */
  | Readonly<{ type: 'applyOffered'; applyId: number }>
  /** Apply an intent. */
  | Readonly<{
      type: 'deliverIntent';
      adapter: LayoutAdapterId;
      intentId: string;
      deliveryId: number;
      target: PaneIntentTarget;
    }>
  /** The phone's tab port: show the tab of `target` (a file shows the editor tab). */
  | Readonly<{ type: 'mobileTabRequested'; intentId: string; target: PaneIntentTarget }>
  /** Open the workbench lane for a workbench intent (desktop). */
  | Readonly<{ type: 'workbenchOpenRequested'; intentId: string }>
  /**
   * The arrangement changed by an apply or a restore, not by a person: lanes follow `layout.lanes`. `baseline` marks the
   * record's first arrangement, whose lanes are the device's baseline rather than a change of them.
   */
  | Readonly<{ type: 'arranged'; layout: WorkbenchLayout; baseline: boolean }>
  /** The applied revision changed: the acknowledged digest, or `undefined` while unknown. */
  | Readonly<{ type: 'appliedRevisionChanged'; digest: LayoutDigest | undefined }>
  /** An intent settled. */
  | (Readonly<{ type: 'intentSettled'; intentId: string }> & PaneIntentOutcome)
  /** A restore settled. */
  | Readonly<{ type: 'restoreSettled'; restoreId: string; outcome: 'applied' | 'refused' }>
  /** A flush was answered. */
  | Readonly<{ type: 'flushed'; requestId: string; ok: boolean }>;

/** Events the record child takes. */
export type LayoutRecordCommand =
  | Readonly<{ type: 'edit'; editCount: number; layout: WorkbenchLayout }>
  | Readonly<{ type: 'restore'; restoreId: string; expected: LayoutDigest; layout: WorkbenchLayout }>
  | Readonly<{ type: 'flush'; requestId: string }>
  | Readonly<{ type: 'invalidate' }>;

/** The `LayoutApply.tla` action a transition refines (MC-R27); `Unmodelled` is outside the spec. */
export type WorkbenchLayoutAction =
  | 'Published'
  | 'ApplyLanded'
  | 'Acknowledged'
  | 'PersonEdited'
  | 'AdapterAttaching'
  | 'AdapterAttached'
  | 'AdapterDetached'
  | 'IntentSent'
  | 'IntentApplied'
  | 'IntentDropped'
  | 'RouteKeyChanged'
  | 'WorkbenchClosed'
  | 'RestoreAsked'
  | 'RestoreSettled'
  | 'EditWritten'
  | 'Unmodelled';

/** A publication the machine holds: the latest one. */
type Publication = Readonly<{
  revision: number;
  layout: WorkbenchLayout | undefined;
  digest: LayoutDigest;
  refused: boolean;
  /** Whether the record published its own write or a change it read (the previous layout follows a foreign one). */
  origin: 'own' | 'foreign';
  /** The edit count when it arrived (rule 2). */
  editCount: number;
  /** It arrived while a local edit was owed (rule 8): it is never applied. */
  held: boolean;
  /** Its apply landed, was discarded, or is not needed (rule 3). */
  done: boolean;
}>;

/** The apply in flight: offered to the attached adapters until one takes it. */
type PendingApply = Readonly<{ applyId: number; revision: number; layout: WorkbenchLayout; editCount: number }>;

/** A restore whose checked write is in flight. */
type Restoring = Readonly<{
  restoreId: string;
  layout: WorkbenchLayout;
  /** The arrangement's moves, the edit count and the latest revision when it was asked. */
  moves: number;
  editCount: number;
  revision: number;
}>;

/** State owned by one layout actor. */
type LayoutContext = Readonly<{
  device: WorkbenchLayoutDevice;
  adapters: readonly LayoutAdapterId[];
  routeKey: string;
  workbenchOpen: boolean;
  /** What the attached adapters show (the model's `shown`); `undefined` until the record's first read. */
  arrangement: WorkbenchLayout | undefined;
  /** The digest of the record bytes the arrangement holds, while it holds a publication's bytes. */
  arrangementDigest: LayoutDigest | undefined;
  /** How often the arrangement changed: a restore settles only if it has not moved since it was asked. */
  moves: number;
  /** Local changes counted (rule 1). */
  editCount: number;
  /** A local change is not yet written to the record (rule 8). */
  unwritten: boolean;
  latest: Publication | undefined;
  revisions: number;
  pending: PendingApply | undefined;
  applies: number;
  /** The acknowledged revision; `undefined` while unknown (I12). */
  acknowledged: number | undefined;
  /** Per adapter, the `show` it has not yet reported. */
  awaiting: Readonly<Partial<Record<LayoutAdapterId, number | undefined>>>;
  shows: number;
  /** The open intents, and the dropped ones a late answer may still reach. */
  intents: PaneIntents;
  /** The outcomes of the intents retired from `intents` (I11: a re-sent id is answered from them). */
  outcomes: PaneIntentOutcomes;
  deliveries: number;
  restores: Readonly<Record<string, 'applied' | 'refused'>>;
  restoring: Restoring | undefined;
  refusal: RecordRefusal | undefined;
  health: RecordHealth | undefined;
  recordError: string | undefined;
  /** The first defect the root `onError` caught; later ones are usually its consequences (MC-R12, D23). */
  fault: string | undefined;
  /** Whether rule 4 waits for the lanes on screen (the input gave them). */
  checksLanes: boolean;
  /** The lane flags on screen, as last reported. */
  appliedLanes: WorkbenchLayout['lanes'] | undefined;
  /** Whether the editor's lanes are known (`lanesSeeded`, when the input awaits them): until then intents wait. */
  lanesKnown: boolean;
  /** The intents whose rule 7 step waits for the lanes it depends on ({@link routable}), in the order they were sent. */
  unrouted: readonly string[];
}>;

type LayoutEnqueue = EnqueueObject<WorkbenchLayoutEvent, WorkbenchLayoutEmitted>;
type AdapterState = 'detached' | 'attaching' | 'attached';
type Adapters = Readonly<Record<LayoutAdapterId, AdapterState>>;
/** What a step reads of the state value, with the region a transition is taking already applied. */
type View = Readonly<{ ready: boolean; adapters: Adapters }>;
type Children = Readonly<Record<string, AnyActorRef | undefined>>;

const adapterIds = ['workbench', 'viewer'] as const satisfies readonly LayoutAdapterId[];

const emptyLayout = (): WorkbenchLayout => ({
  version: 1,
  lanes: { chat: true, workbench: true },
  viewer: { kind: 'group', tabs: [] },
  workbench: { kind: 'group', tabs: [] },
});

/** Two arrangements are the same when the record would hold the same bytes for them. */
export const sameLayout = (left: WorkbenchLayout | undefined, right: WorkbenchLayout | undefined): boolean =>
  left === undefined || right === undefined
    ? left === right
    : layoutPolicy.serialize(left) === layoutPolicy.serialize(right);

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const regionOf = (value: StateValue, region: string): string | undefined =>
  typeof value === 'object' ? (value as Record<string, string | undefined>)[region] : undefined;

const viewOf = (value: StateValue, change: Partial<Adapters> = {}, ready?: boolean): View => ({
  ready: ready ?? regionOf(value, 'record') === 'ready',
  adapters: {
    workbench: change.workbench ?? ((regionOf(value, 'workbench') ?? 'detached') as AdapterState),
    viewer: change.viewer ?? ((regionOf(value, 'viewer') ?? 'detached') as AdapterState),
  },
});

const attachedIn = (context: LayoutContext, view: View): LayoutAdapterId[] =>
  context.adapters.filter((adapter) => view.adapters[adapter] === 'attached');

/**
 * `{ to, meta }` (MC-R27), typed as its transition function.
 * ponytail: alpha.59's `setup` types omit the `{ to, meta }` form the runtime takes; drop the cast when xstate types it.
 */
const refines = <F>(tla: WorkbenchLayoutAction, to: F): F =>
  // oxlint-disable-next-line typescript/consistent-type-assertions -- see above.
  ({ meta: { tla }, to }) as unknown as F;

/** The acknowledged digest, while the acknowledged revision is the latest; otherwise unknown. */
const appliedDigestOf = (context: LayoutContext): LayoutDigest | undefined =>
  context.acknowledged !== undefined && context.acknowledged === context.latest?.revision
    ? context.latest.digest
    : undefined;

/**
 * The record's first read failed for good (its retries stopped): there is no record to wait for, so intents are routed
 * and delivered as after a read, and the adapters answer them without an arrangement to join (nothing is acknowledged
 * without a publication, rule 4).
 */
const unreadable = (context: LayoutContext): boolean =>
  context.latest === undefined && context.health?.read === 'unavailable';

/** Whether intents may reach their adapters: after the first read (or once it stopped retrying) and the seeded lanes. */
const deliverable = (context: LayoutContext, view: View): boolean =>
  (view.ready || unreadable(context)) && context.lanesKnown;

/** Rule 2: the apply in flight may still land. */
const isCurrent = (context: LayoutContext, pending: PendingApply): boolean =>
  pending.revision === context.latest?.revision && pending.editCount === context.editCount;

/** Show `layout` on each of `adapters`; each owes a report (rule 4). */
const show = (
  context: LayoutContext,
  adapters: readonly LayoutAdapterId[],
  layout: WorkbenchLayout | undefined,
  enq: LayoutEnqueue,
): LayoutContext => {
  let { shows } = context;
  const awaiting = { ...context.awaiting };
  for (const adapter of adapters) {
    shows += 1;
    awaiting[adapter] = shows;
    enq.emit({ type: 'show', adapter, showId: shows, layout });
  }
  return { ...context, shows, awaiting };
};

/** Rule 4 on a device with lane flags: the lanes on screen are the revision's (the record host's check, D14). */
const lanesShown = (context: LayoutContext, layout: WorkbenchLayout): boolean =>
  !context.checksLanes ||
  (context.lanesKnown &&
    context.appliedLanes?.chat === layout.lanes.chat &&
    context.appliedLanes.workbench === layout.lanes.workbench);

/** Rule 4's conditions on the arrangement, with every adapter's report still to check. */
const acknowledgeable = (context: LayoutContext, view: View): boolean =>
  context.adapters.every((adapter) => view.adapters[adapter] === 'attached') &&
  context.pending === undefined &&
  context.latest !== undefined &&
  !context.latest.refused &&
  context.latest.layout !== undefined &&
  context.latest.digest !== 'missing' &&
  context.recordError === undefined &&
  context.acknowledged !== context.latest.revision &&
  sameLayout(context.arrangement, context.latest.layout) &&
  lanesShown(context, context.latest.layout);

const reported = (context: LayoutContext): boolean =>
  context.adapters.every((adapter) => context.awaiting[adapter] === undefined);

/**
 * What follows every step (rules 2 to 4 and 7): an apply that can no longer land is discarded, the latest
 * publication's apply is computed when an adapter can take it, open intents go to their attached adapters, and when
 * the arrangement holds the latest revision with every report in, the adapters are asked to confirm it.
 */
const settle = (context: LayoutContext, view: View, enq: LayoutEnqueue): LayoutContext => {
  let next = context;
  const attached = attachedIn(next, view);
  if (next.pending !== undefined && !isCurrent(next, next.pending)) {
    // Rule 2: an edit was counted, or a newer publication arrived. Discarded.
    next = { ...next, pending: undefined };
  } else if (next.pending !== undefined && attached.length === 0 && next.latest !== undefined) {
    // Rule 4: no adapter can take it. The latest publication's apply is computed again on the next attach.
    next = { ...next, pending: undefined, latest: { ...next.latest, done: false } };
  }
  const { latest } = next;
  if (view.ready && latest !== undefined && !latest.done && next.pending === undefined) {
    if (latest.refused || latest.layout === undefined || latest.held || latest.editCount !== next.editCount) {
      // Nothing to show, fenced (rule 8) or edited over since it arrived (rule 2): never applied.
      next = { ...next, latest: { ...latest, done: true } };
    } else if (sameLayout(next.arrangement, latest.layout)) {
      // Rule 3: the arrangement already holds these bytes.
      next = { ...next, latest: { ...latest, done: true }, arrangementDigest: latest.digest };
    } else if (attached.length > 0) {
      const applyId = next.applies + 1;
      next = {
        ...next,
        applies: applyId,
        pending: { applyId, revision: latest.revision, layout: latest.layout, editCount: latest.editCount },
        latest: { ...latest, done: true },
      };
      enq.emit({ type: 'applyOffered', applyId });
    }
  }
  next = routeWaiting(next, view, enq);
  if (deliverable(next, view)) {
    next = deliver(next, attached, enq);
  }
  if (acknowledgeable(next, view) && reported(next)) {
    next = show(next, next.adapters, undefined, enq);
  }
  return next;
};

/** Hand each queued intent to its attached adapter (rule 7). */
const deliver = (context: LayoutContext, attached: readonly LayoutAdapterId[], enq: LayoutEnqueue): LayoutContext => {
  let { intents, deliveries } = context;
  for (const entry of openIntents(intents)) {
    const adapter = intentAdapter(entry.target);
    if (entry.state !== 'queued' || !attached.includes(adapter)) {
      continue;
    }
    deliveries += 1;
    intents = withState(intents, entry.intentId, { state: 'delivered', deliveryId: deliveries });
    enq.emit({
      type: 'deliverIntent',
      adapter,
      intentId: entry.intentId,
      deliveryId: deliveries,
      target: entry.target,
    });
  }
  return { ...context, intents, deliveries };
};

/** Report each settled intent. */
const reportIntents = (settled: readonly PaneIntentEntry[], enq: LayoutEnqueue): void => {
  for (const entry of settled) {
    const outcome = outcomeOf(entry);
    if (outcome !== undefined) {
      enq.emit({ type: 'intentSettled', intentId: entry.intentId, ...outcome });
    }
  }
};

/** Hold `intents`, retiring each settled entry no late answer can reach to its outcome. */
const withIntents = (context: LayoutContext, intents: PaneIntents): LayoutContext => {
  const next = retired(intents, context.outcomes);
  return { ...context, intents: next.intents, outcomes: next.outcomes };
};

/**
 * Rule 7 for one queued intent on the device now: a phone shows its tab (a pane intent settles there, a file intent
 * waits for the workbench), an intent for an adapter the device lacks is dropped, and on a desktop a workbench intent
 * opens the lane.
 */
const routed = (context: LayoutContext, intent: PaneIntent, enq: LayoutEnqueue): LayoutContext => {
  const adapter = intentAdapter(intent.target);
  const workbenchPane = intent.target.kind === 'pane' && intent.target.adapter === 'workbench';
  const workbenchFile = intent.target.kind === 'file' && context.adapters.includes(adapter);
  if (context.device === 'phone' && (workbenchPane || workbenchFile)) {
    // Rule 7 on a phone: the tab port shows the pane, or the editor tab for a file, which then waits for the workbench.
    enq.emit({ type: 'mobileTabRequested', intentId: intent.intentId, target: intent.target });
    if (!workbenchPane) {
      return context;
    }
    const settled = settleWhere(context.intents, (entry) => entry.intentId === intent.intentId, { state: 'applied' });
    reportIntents(settled.settled, enq);
    return withIntents(context, settled.intents);
  }
  if (!context.adapters.includes(adapter)) {
    const settled = settleWhere(context.intents, (entry) => entry.intentId === intent.intentId, {
      state: 'dropped',
      reason: 'unavailable',
    });
    reportIntents(settled.settled, enq);
    return withIntents(context, settled.intents);
  }
  if (adapter === 'workbench' && !context.workbenchOpen) {
    // Rule 7 on a desktop: a workbench intent opens the lane.
    enq.emit({ type: 'workbenchOpenRequested', intentId: intent.intentId });
    return { ...context, workbenchOpen: true };
  }
  return context;
};

/**
 * Whether rule 7 can route an intent now. A phone's tab waits for an editor that takes it; on a desktop whose lanes the
 * record holds, the lane also waits for the record's first read, whose lanes are shown first, so the lane an intent
 * opens is not closed again by them.
 */
const routable = (context: LayoutContext, view: View): boolean =>
  context.lanesKnown && (context.device === 'phone' || view.ready || unreadable(context) || !context.checksLanes);

/** Route the intents that waited, once they can be: in the order they were sent, each once. */
const routeWaiting = (context: LayoutContext, view: View, enq: LayoutEnqueue): LayoutContext => {
  if (context.unrouted.length === 0 || !routable(context, view)) {
    return context;
  }
  let next: LayoutContext = { ...context, unrouted: [] };
  for (const intentId of context.unrouted) {
    const entry = intentOf(next.intents, intentId);
    if (entry !== undefined && isOpen(entry)) {
      next = routed(next, entry, enq);
    }
  }
  return next;
};

/** Rule 1: a local change of the arrangement counts one edit and is written to the record. */
const counted = (
  context: LayoutContext,
  arrangement: WorkbenchLayout,
  children: Children,
  enq: LayoutEnqueue,
  written = false,
): LayoutContext => {
  const editCount = context.editCount + 1;
  const record = children['layoutRecord'];
  if (!written && record !== undefined) {
    enq.sendTo(record, { type: 'edit', editCount, layout: arrangement } satisfies LayoutRecordCommand);
  }
  return {
    ...context,
    arrangement,
    arrangementDigest: undefined,
    moves: context.moves + 1,
    editCount,
    unwritten: written ? context.unwritten : true,
  };
};

/** An adapter's part of an arrangement replaced by `node`. */
const withPart = (
  arrangement: WorkbenchLayout | undefined,
  adapter: LayoutAdapterId,
  node: ViewerNode | WorkbenchLaneNode,
): WorkbenchLayout => {
  const base = arrangement ?? emptyLayout();
  return adapter === 'viewer'
    ? { ...base, viewer: node as ViewerNode }
    : { ...base, workbench: node as WorkbenchLaneNode };
};

/** Emit `appliedRevisionChanged` when the step moved the applied revision. */
const finished = (before: LayoutContext, after: LayoutContext, enq: LayoutEnqueue): LayoutContext => {
  const digest = appliedDigestOf(after);
  if (digest !== appliedDigestOf(before)) {
    enq.emit({ type: 'appliedRevisionChanged', digest });
  }
  return after;
};

/** Rule 7: what a lane close drops. Today's close clears the held Files pane and user-file intents only. */
const droppedOnClose = (entry: PaneIntentEntry): boolean =>
  entry.target.kind === 'file' || (entry.target.adapter === 'workbench' && entry.target.pane === 'files');

/** The intents region's state for a context. */
const intentsTarget = (context: LayoutContext): '.idle' | '.waiting' =>
  openIntents(context.intents).length > 0 ? '.waiting' : '.idle';

type Step<Event extends WorkbenchLayoutEvent['type']> = Readonly<{
  context: LayoutContext;
  event: Extract<WorkbenchLayoutEvent, { type: Event }>;
  value: StateValue;
  children: Children;
}>;

/** A publication (`Published`), with rules 2, 3 and 8. The first one becomes the arrangement and seeds the adapters. */
const published = ({ context, event, value }: Step<'recordPublished'>, enq: LayoutEnqueue): LayoutContext => {
  const revision = context.revisions + 1;
  const refused = event.refusal !== undefined;
  // Rule 8: the record says whether a local edit is owed. Edits reach it synchronously, so its word is current, and its
  // own echo of a written edit (published before the edit's answer) is not fenced.
  const held = event.owed;
  let next: LayoutContext = {
    ...context,
    revisions: revision,
    latest: {
      revision,
      layout: refused ? undefined : event.layout,
      digest: event.digest,
      refused,
      origin: event.origin,
      editCount: context.editCount,
      held,
      done: false,
    },
    unwritten: event.owed,
    refusal: event.refusal,
    recordError: undefined,
  };
  const view = viewOf(value, {}, true);
  if (context.arrangement === undefined && !refused && event.layout !== undefined) {
    // The first read is the arrangement; every attached adapter is seeded with it. On a device with lane flags its
    // lanes are shown with it (`arranged`), so its workbench lane is the baseline: not a close (rule 7).
    next = {
      ...next,
      arrangement: event.layout,
      arrangementDigest: event.digest,
      moves: next.moves + 1,
      latest: { ...next.latest!, done: true },
      workbenchOpen: next.checksLanes ? event.layout.lanes.workbench : next.workbenchOpen,
    };
    next = show(next, attachedIn(next, view), event.layout, enq);
    enq.emit({ type: 'arranged', layout: event.layout, baseline: true });
  } else if (
    context.restoring !== undefined &&
    event.origin === 'own' &&
    sameLayout(event.layout, context.restoring.layout)
  ) {
    // The restore's own write: it settles when the record answers (rule 5), and is not applied as a publication.
    next = { ...next, latest: { ...next.latest!, done: true } };
  }
  return settle(next, view, enq);
};

/** Rule 4: an adapter left; the applied revision is unknown, and its delivered intents wait for the next attach. */
const left = (context: LayoutContext, adapter: LayoutAdapterId, view: View, enq: LayoutEnqueue): LayoutContext => {
  const requeued = settleWhere(
    context.intents,
    (entry) => entry.state === 'delivered' && intentAdapter(entry.target) === adapter,
    { state: 'queued' },
  ).intents;
  // A late answer to a dropped intent can no longer come from the mount that left.
  let intents = requeued;
  for (const entry of Object.values(requeued)) {
    if (entry.state === 'dropped' && entry.late !== undefined && intentAdapter(entry.target) === adapter) {
      intents = lateAnswered(intents, entry.intentId);
    }
  }
  const awaiting = { ...context.awaiting, [adapter]: undefined };
  return settle({ ...withIntents(context, intents), awaiting, acknowledged: undefined }, view, enq);
};

/** Rule 5: a restore settles against the arrangement it was asked over. */
const restoreSettled = (
  context: LayoutContext,
  restoreId: string,
  outcome: 'applied' | 'refused',
  enq: LayoutEnqueue,
): LayoutContext => {
  enq.emit({ type: 'restoreSettled', restoreId, outcome });
  const restoring = context.restoring?.restoreId === restoreId ? undefined : context.restoring;
  return { ...context, restores: { ...context.restores, [restoreId]: outcome }, restoring };
};

const notProvided = (): never => {
  throw new Error('workbenchLayout: the layoutRecord child was not provided; createWorkbenchLayoutActor provides it.');
};

/* The default record child refuses to start: the factory provides the store-backed one. */
const layoutRecord: CallbackActorLogic<LayoutRecordCommand> = createCallbackLogic<LayoutRecordCommand>(() =>
  notProvided(),
);

/* An adapter region: `detached → attaching → attached`, for one adapter of the device (rule 4). */
const adapterRegion = (adapter: LayoutAdapterId) => {
  const mine = (event: { adapter: LayoutAdapterId }): boolean => event.adapter === adapter;
  const attaching = refines('AdapterAttaching', ({ context, event }: Step<'adapterAttaching'>) =>
    // Another adapter's event, an adapter the device lacks, or a re-delivery: nothing to do.
    mine(event) && context.adapters.includes(adapter) ? { target: 'attaching' } : {},
  );
  const attached = refines(
    'AdapterAttached',
    ({ context, event, value }: Step<'adapterAttached'>, enq: LayoutEnqueue) => {
      if (!mine(event)) {
        return {};
      }
      const view = viewOf(value, { [adapter]: 'attached' });
      // Seed the adapter with the arrangement (an attach never changes it).
      const seeded = context.arrangement === undefined ? context : show(context, [adapter], context.arrangement, enq);
      const settled = settle(seeded, view, enq);
      if (settled.pending !== undefined && settled.pending.applyId === context.pending?.applyId) {
        // An apply still in flight was offered before this adapter attached: it is offered again, so this adapter can
        // take it even if every adapter that heard the first offer leaves.
        enq.emit({ type: 'applyOffered', applyId: settled.pending.applyId });
      }
      return { target: 'attached', context: finished(context, settled, enq) };
    },
  );
  const detached = refines(
    'AdapterDetached',
    ({ context, event, value }: Step<'adapterDetached'>, enq: LayoutEnqueue) => {
      if (!mine(event)) {
        return {};
      }
      const view = viewOf(value, { [adapter]: 'detached' });
      return { target: 'detached', context: finished(context, left(context, adapter, view, enq), enq) };
    },
  );
  return {
    initial: 'detached',
    states: {
      detached: {
        on: {
          adapterAttaching: attaching,
          // Before it mounted, or a re-delivery after it left: stale.
          adapterAttached: refines('AdapterAttached', () => ({})),
          adapterDetached: refines('AdapterDetached', () => ({})),
        },
      },
      attaching: {
        on: {
          // A re-delivery of its own mount; another adapter's mount changes nothing here.
          adapterAttaching: refines('AdapterAttaching', () => ({})),
          adapterAttached: attached,
          adapterDetached: detached,
        },
      },
      attached: {
        on: {
          adapterAttaching: refines('AdapterAttaching', () => ({})),
          adapterAttached: refines('AdapterAttached', () => ({})),
          adapterDetached: detached,
        },
      },
    },
  } as const;
};

const workbenchLayoutDefinition = setup({
  schemas: {
    context: types<LayoutContext>(),
    events: eventSchemas<WorkbenchLayoutEvent>(),
    emitted: eventSchemas<WorkbenchLayoutEmitted>(),
    input: types<WorkbenchLayoutInput>(),
    transitionMeta: types<{ tla: WorkbenchLayoutAction }>(),
  },
  actors: { layoutRecord },
}).createMachine({
  id: 'workbenchLayout',
  version: '3',
  // A defect is recorded and the layout keeps answering; the first is kept, since later ones are usually its
  // consequences (MC-R12, D23).
  onError: refines('Unmodelled', ({ context, event }) => ({
    context: { fault: context.fault ?? messageOf(event.error) },
  })),
  context: ({ input }): LayoutContext => ({
    device: input.device,
    adapters: adapterIds.filter((adapter) => input.adapters.includes(adapter)),
    routeKey: input.routeKey,
    workbenchOpen: input.workbenchOpen,
    arrangement: undefined,
    arrangementDigest: undefined,
    moves: 0,
    editCount: 0,
    unwritten: false,
    latest: undefined,
    revisions: 0,
    pending: undefined,
    applies: 0,
    acknowledged: undefined,
    awaiting: {},
    shows: 0,
    intents: {},
    outcomes: {},
    deliveries: 0,
    restores: {},
    restoring: undefined,
    refusal: undefined,
    health: undefined,
    recordError: undefined,
    fault: undefined,
    checksLanes: input.lanes !== undefined,
    appliedLanes: input.lanes,
    lanesKnown: input.awaitsLanes !== true,
    unrouted: [],
  }),
  type: 'parallel',
  // Rule 9: one record session for the file, for the actor's whole life.
  invoke: {
    id: 'layoutRecord',
    src: 'layoutRecord',
    onError: refines('Unmodelled', ({ context, event }) => ({
      context: { fault: context.fault ?? messageOf(event.error) },
    })),
  },
  on: {
    personEdited: refines(
      'PersonEdited',
      ({ context, event, value, children }: Step<'personEdited'>, enq: LayoutEnqueue) => {
        const view = viewOf(value);
        if (!view.ready || view.adapters[event.adapter] !== 'attached') {
          // Before the first read the record has no arrangement to edit (the host ignores these today); an adapter that is
          // not attached shows nothing the person could have moved.
          return {};
        }
        const arrangement = withPart(context.arrangement, event.adapter, event.node);
        if (sameLayout(arrangement, context.arrangement)) {
          // An adapter echoing what it was shown (environment assumption A).
          return {};
        }
        return { context: finished(context, settle(counted(context, arrangement, children, enq), view, enq), enq) };
      },
    ),
    lanesEdited: refines(
      'PersonEdited',
      ({ context, event, value, children }: Step<'lanesEdited'>, enq: LayoutEnqueue) => {
        const view = viewOf(value);
        const arrangement =
          context.arrangement === undefined ? undefined : { ...context.arrangement, lanes: event.lanes };
        if (!view.ready || arrangement === undefined || sameLayout(arrangement, context.arrangement)) {
          // No arrangement yet, or the lanes the record already holds.
          return {};
        }
        return { context: finished(context, settle(counted(context, arrangement, children, enq), view, enq), enq) };
      },
    ),
    applyTaken: refines('ApplyLanded', ({ context, event, value }: Step<'applyTaken'>, enq: LayoutEnqueue) => {
      const view = viewOf(value);
      const { pending } = context;
      if (
        pending === undefined ||
        pending.applyId !== event.applyId ||
        view.adapters[event.adapter] !== 'attached' ||
        !isCurrent(context, pending)
      ) {
        // Rule 2: a discarded or superseded apply, or one an adapter that left took. It never lands.
        return {};
      }
      const landed: LayoutContext = {
        ...context,
        pending: undefined,
        arrangement: pending.layout,
        arrangementDigest: context.latest?.digest,
        moves: context.moves + 1,
      };
      enq.emit({ type: 'arranged', layout: pending.layout, baseline: false });
      return {
        context: finished(context, settle(show(landed, attachedIn(landed, view), pending.layout, enq), view, enq), enq),
      };
    }),
    adapterShown: refines('Acknowledged', ({ context, event, value }: Step<'adapterShown'>, enq: LayoutEnqueue) => {
      const view = viewOf(value);
      if (view.adapters[event.adapter] !== 'attached' || context.awaiting[event.adapter] !== event.showId) {
        // A report of an older show, or from an adapter that left: the latest show is still owed.
        return {};
      }
      const awaiting = { ...context.awaiting, [event.adapter]: undefined };
      const next: LayoutContext = { ...context, awaiting };
      const acknowledged =
        acknowledgeable(next, view) && reported(next) ? { ...next, acknowledged: next.latest!.revision } : next;
      return { context: finished(context, acknowledged, enq) };
    }),
    recordEditAnswered: refines(
      'EditWritten',
      ({ context, event, value }: Step<'recordEditAnswered'>, enq: LayoutEnqueue) =>
        event.editCount !== context.editCount || !context.unwritten || !event.ok
          ? // An older edit's answer: a later change is still owed. Or a publication already showed nothing owed, or the
            // write failed and the edit is still owed.
            {}
          : { context: finished(context, settle({ ...context, unwritten: false }, viewOf(value), enq), enq) },
    ),
    recordFlushAnswered: refines('Unmodelled', ({ event }: Step<'recordFlushAnswered'>, enq: LayoutEnqueue) => {
      enq.emit({ type: 'flushed', requestId: event.requestId, ok: event.ok });
      return {};
    }),
    flush: refines('Unmodelled', ({ event, children }: Step<'flush'>, enq: LayoutEnqueue) => {
      const record = children['layoutRecord'];
      if (record === undefined) {
        // The record child stopped with the actor: nothing is owed by a session that no longer runs.
        enq.emit({ type: 'flushed', requestId: event.requestId, ok: false });
      } else {
        enq.sendTo(record, { type: 'flush', requestId: event.requestId } satisfies LayoutRecordCommand);
      }
      return {};
    }),
    recordInvalidated: refines('Unmodelled', ({ children }: Step<'recordInvalidated'>, enq: LayoutEnqueue) => {
      const record = children['layoutRecord'];
      if (record !== undefined) {
        enq.sendTo(record, { type: 'invalidate' } satisfies LayoutRecordCommand);
      }
      return {};
    }),
    lanesApplied: refines('Unmodelled', ({ context, event, value }: Step<'lanesApplied'>, enq: LayoutEnqueue) => {
      if (context.appliedLanes?.chat === event.lanes.chat && context.appliedLanes.workbench === event.lanes.workbench) {
        // The lanes already reported.
        return {};
      }
      // Rule 4 may now hold: the adapters are asked to confirm what they show.
      const next: LayoutContext = {
        ...context,
        appliedLanes: { chat: event.lanes.chat, workbench: event.lanes.workbench },
      };
      return { context: finished(context, settle(next, viewOf(value), enq), enq) };
    }),
    deviceChanged: refines('Unmodelled', ({ context, event }: Step<'deviceChanged'>) =>
      event.device === context.device ? {} : { context: { device: event.device } },
    ),
    recordHealthChanged: refines(
      'Unmodelled',
      ({ context, event, value }: Step<'recordHealthChanged'>, enq: LayoutEnqueue) => {
        const next: LayoutContext = { ...context, health: event.health };
        // A first read that stopped retrying releases the intents that waited for it.
        return { context: unreadable(next) ? finished(context, settle(next, viewOf(value), enq), enq) : next };
      },
    ),
    recordFailed: refines('Unmodelled', ({ context, event }: Step<'recordFailed'>, enq: LayoutEnqueue) => ({
      // The record's health carries the failure; nothing on screen is known to match the record.
      context: finished(context, { ...context, recordError: event.message, acknowledged: undefined }, enq),
    })),
  },
  states: {
    record: {
      initial: 'reading',
      states: {
        reading: {
          on: {
            recordPublished: refines('Published', (step: Step<'recordPublished'>, enq: LayoutEnqueue) => ({
              target: 'ready',
              context: finished(step.context, published(step, enq), enq),
            })),
          },
        },
        ready: {
          on: {
            recordPublished: refines('Published', (step: Step<'recordPublished'>, enq: LayoutEnqueue) => ({
              context: finished(step.context, published(step, enq), enq),
            })),
          },
        },
      },
    },
    workbench: adapterRegion('workbench'),
    viewer: adapterRegion('viewer'),
    intents: {
      initial: 'idle',
      on: {
        intent: refines('IntentSent', ({ context, event, value }: Step<'intent'>, enq: LayoutEnqueue) => {
          const outcome = ownValue(context.outcomes, event.intentId);
          if (outcome !== undefined) {
            // A re-sent id: answered again by its first outcome, never applied twice (I11).
            enq.emit({ type: 'intentSettled', intentId: event.intentId, ...outcome });
            return {};
          }
          const sent = intentOf(context.intents, event.intentId);
          if (sent !== undefined) {
            // A re-sent id still open, or dropped with a late answer owed: answered by its outcome once it has one.
            reportIntents([sent], enq);
            return {};
          }
          const intent: PaneIntent = { intentId: event.intentId, source: event.source, target: event.target };
          const view = viewOf(value);
          const next: LayoutContext = { ...context, intents: queued(context.intents, intent) };
          // Until the lanes it depends on are known, the intent waits: the step that makes it routable routes it (A8b).
          const settled = settle(
            routable(next, view)
              ? routed(next, intent, enq)
              : { ...next, unrouted: [...next.unrouted, intent.intentId] },
            view,
            enq,
          );
          return { target: intentsTarget(settled), context: finished(context, settled, enq) };
        }),
        intentApplied: refines(
          'IntentApplied',
          ({ context, event, value, children }: Step<'intentApplied'>, enq: LayoutEnqueue) => {
            const entry = intentOf(context.intents, event.intentId);
            const view = viewOf(value);
            if (
              entry?.state === 'dropped' &&
              entry.late === event.deliveryId &&
              view.adapters[intentAdapter(entry.target)] === 'attached'
            ) {
              // The one late answer for an intent dropped while it was delivered (rules 6 and 7): the adapter shows the
              // pane, so its node is the arrangement, counted as a person's edit is. The intent stays dropped (I11).
              const answered = withIntents(context, lateAnswered(context.intents, entry.intentId));
              const arrangement = withPart(answered.arrangement, intentAdapter(entry.target), event.node);
              return sameLayout(arrangement, answered.arrangement)
                ? { context: answered }
                : { context: finished(context, settle(counted(answered, arrangement, children, enq), view, enq), enq) };
            }
            if (
              entry?.state !== 'delivered' ||
              entry.deliveryId !== event.deliveryId ||
              view.adapters[intentAdapter(entry.target)] !== 'attached'
            ) {
              // A stale answer: to an older delivery, from an adapter that left, or for an applied intent.
              return {};
            }
            const settled = settleWhere(context.intents, (open) => open.intentId === entry.intentId, {
              state: 'applied',
            });
            reportIntents(settled.settled, enq);
            const applied = withIntents(context, settled.intents);
            const arrangement = withPart(applied.arrangement, intentAdapter(entry.target), event.node);
            const next = sameLayout(arrangement, applied.arrangement)
              ? applied
              : counted(applied, arrangement, children, enq);
            const done = settle(next, view, enq);
            return { target: intentsTarget(done), context: finished(context, done, enq) };
          },
        ),
        intentUnavailable: refines(
          'IntentDropped',
          ({ context, event, value }: Step<'intentUnavailable'>, enq: LayoutEnqueue) => {
            const entry = intentOf(context.intents, event.intentId);
            if (entry?.state === 'dropped' && entry.late !== undefined && entry.late === event.deliveryId) {
              // The late answer of a delivery dropped meanwhile: the adapter opened nothing, so nothing is counted, and
              // no later answer to it is taken (I11).
              return { context: withIntents(context, lateAnswered(context.intents, entry.intentId)) };
            }
            if (
              entry === undefined ||
              !isOpen(entry) ||
              (event.deliveryId !== undefined && (entry.state !== 'delivered' || entry.deliveryId !== event.deliveryId))
            ) {
              // Settled already, never sent, or an answer to another delivery: nothing to drop.
              return {};
            }
            const settled = settleWhere(context.intents, (open) => open.intentId === entry.intentId, {
              state: 'dropped',
              reason: 'unavailable',
            });
            reportIntents(settled.settled, enq);
            // An answer that names the delivery is that delivery's own: no late answer to it is still owed, so the
            // entry retires. A drop that names none keeps the delivery's late answer open.
            const intents =
              entry.state === 'delivered' && event.deliveryId !== undefined
                ? lateAnswered(settled.intents, entry.intentId)
                : settled.intents;
            const done = settle(withIntents(context, intents), viewOf(value), enq);
            return { target: intentsTarget(done), context: finished(context, done, enq) };
          },
        ),
        routeChanged: refines('RouteKeyChanged', ({ context, event }: Step<'routeChanged'>, enq: LayoutEnqueue) => {
          if (event.routeKey === context.routeKey) {
            // A re-delivery of the route the intents are queued under.
            return {};
          }
          // Rule 6: every open intent is dropped in this step.
          const settled = settleWhere(context.intents, () => true, { state: 'dropped', reason: 'routeChanged' });
          reportIntents(settled.settled, enq);
          return {
            target: '.idle',
            context: { ...withIntents(context, settled.intents), unrouted: [], routeKey: event.routeKey },
          };
        }),
        workbenchLaneChanged: refines(
          'WorkbenchClosed',
          ({ context, event }: Step<'workbenchLaneChanged'>, enq: LayoutEnqueue) => {
            if (event.open === context.workbenchOpen) {
              // The lane already is as reported.
              return {};
            }
            if (event.open) {
              return { context: { workbenchOpen: true } };
            }
            // Rule 7: a closed lane drops the open file intents and the Files pane, as today's close clears the held
            // Files and user-file intents; any other pane intent survives it (A0.3 row 1c).
            const settled = settleWhere(context.intents, droppedOnClose, {
              state: 'dropped',
              reason: 'workbenchClosed',
            });
            reportIntents(settled.settled, enq);
            const next: LayoutContext = { ...withIntents(context, settled.intents), workbenchOpen: false };
            return { target: intentsTarget(next), context: next };
          },
        ),
        lanesSeeded: refines('Unmodelled', ({ context, event, value }: Step<'lanesSeeded'>, enq: LayoutEnqueue) => {
          if (context.lanesKnown) {
            // Seeded already, or never awaited: later lane changes arrive as lane reports.
            return {};
          }
          // The lanes the editor loaded are on screen, and the workbench lane is as they say. The intents that waited
          // for them are routed once they can be (rule 7), in the order they were sent, and may then reach their
          // adapters.
          const next: LayoutContext = {
            ...context,
            lanesKnown: true,
            workbenchOpen: event.lanes.workbench,
            appliedLanes: { chat: event.lanes.chat, workbench: event.lanes.workbench },
          };
          const done = settle(next, viewOf(value), enq);
          return { target: intentsTarget(done), context: finished(context, done, enq) };
        }),
      },
      states: { idle: {}, waiting: {} },
    },
    restore: {
      initial: 'idle',
      states: {
        idle: {
          on: {
            restore: refines(
              'RestoreAsked',
              ({ context, event, value, children }: Step<'restore'>, enq: LayoutEnqueue) => {
                const outcome = ownValue(context.restores, event.restoreId);
                if (outcome !== undefined) {
                  // A repeated id: answered again by its first outcome, never asked twice (I14).
                  enq.emit({ type: 'restoreSettled', restoreId: event.restoreId, outcome });
                  return {};
                }
                const record = children['layoutRecord'];
                const view = viewOf(value);
                if (
                  !view.ready ||
                  record === undefined ||
                  context.unwritten ||
                  context.pending !== undefined ||
                  context.arrangementDigest !== event.expected
                ) {
                  // Rule 5: the arrangement is not the one the command expects, or an edit is owed (as `store.restore`).
                  return { context: restoreSettled(context, event.restoreId, 'refused', enq) };
                }
                enq.sendTo(record, {
                  type: 'restore',
                  restoreId: event.restoreId,
                  expected: event.expected,
                  layout: event.layout,
                } satisfies LayoutRecordCommand);
                return {
                  target: 'restoring',
                  context: {
                    restoring: {
                      restoreId: event.restoreId,
                      layout: event.layout,
                      moves: context.moves,
                      editCount: context.editCount,
                      revision: context.revisions,
                    },
                  },
                };
              },
            ),
            // An answer for a restore that already settled.
            recordRestoreAnswered: refines('RestoreSettled', () => ({})),
          },
        },
        restoring: {
          on: {
            restore: refines('RestoreAsked', ({ context, event }: Step<'restore'>, enq: LayoutEnqueue) => {
              const outcome = ownValue(context.restores, event.restoreId);
              if (outcome !== undefined) {
                // A repeated id: answered again by its first outcome.
                enq.emit({ type: 'restoreSettled', restoreId: event.restoreId, outcome });
                return {};
              }
              return context.restoring?.restoreId === event.restoreId
                ? // The same restore again: its outcome is on its way.
                  {}
                : // One restore at a time.
                  { context: restoreSettled(context, event.restoreId, 'refused', enq) };
            }),
            recordRestoreAnswered: refines(
              'RestoreSettled',
              ({ context, event, value, children }: Step<'recordRestoreAnswered'>, enq: LayoutEnqueue) => {
                const { restoring } = context;
                if (restoring === undefined || restoring.restoreId !== event.restoreId) {
                  // Another restore's answer: stale.
                  return {};
                }
                const view = viewOf(value);
                const { latest } = context;
                // Nothing was owed when the restore was asked; with no edit since, nothing is owed now, whatever the
                // record said of the publications during its write (it compares them with the arrangement before it).
                const untouched = context.editCount === restoring.editCount;
                const overtaken =
                  latest !== undefined &&
                  latest.revision > restoring.revision &&
                  !sameLayout(latest.layout, restoring.layout);
                if (!event.ok || context.moves !== restoring.moves || overtaken) {
                  // The record refused it, the arrangement moved while the write was in flight, or a newer publication
                  // than the restore's own reached the record: refused (I14, StaleRestoreRefused) and not imposed. The record may still hold
                  // the restore (an edit after the store's last eligibility check), so the latest publication is
                  // applied as any is (rules 2, 3 and 8), and any rebase follows it: the arrangement converges on the
                  // record.
                  const reopened: LayoutContext =
                    latest === undefined || latest.revision <= restoring.revision
                      ? context
                      : {
                          ...context,
                          latest: { ...latest, done: false, held: untouched ? false : latest.held },
                          unwritten: untouched ? false : context.unwritten,
                        };
                  const settledMoved = restoreSettled(reopened, restoring.restoreId, 'refused', enq);
                  return { target: 'idle', context: finished(context, settle(settledMoved, view, enq), enq) };
                }
                const settled = restoreSettled(
                  untouched ? { ...context, unwritten: false } : context,
                  restoring.restoreId,
                  'applied',
                  enq,
                );
                // Written already: counted (rule 1) without a second write. The record's echo names the bytes.
                const restored = counted(settled, restoring.layout, children, enq, true);
                const echo = sameLayout(context.latest?.layout, restoring.layout) ? context.latest?.digest : undefined;
                enq.emit({ type: 'arranged', layout: restoring.layout, baseline: false });
                const shown = show(
                  { ...restored, arrangementDigest: echo },
                  attachedIn(restored, view),
                  restoring.layout,
                  enq,
                );
                return { target: 'idle', context: finished(context, settle(shown, view, enq), enq) };
              },
            ),
          },
        },
      },
    },
  },
});

/**
 * The `[state, eventType]` pairs {@link workbenchLayoutMachine} leaves unanswered (MC-R17): none. Every state takes every
 * event; a stale answer or a re-delivery returns `{}` after its check.
 */
export const workbenchLayoutIgnoredEvents: ReadonlyArray<readonly [state: string, eventType: string]> = [];

/** Every {@link WorkbenchLayoutEvent} type, in the union's order. */
export const workbenchLayoutEventTypes = [
  'recordPublished',
  'recordEditAnswered',
  'recordRestoreAnswered',
  'recordFlushAnswered',
  'recordHealthChanged',
  'recordFailed',
  'recordInvalidated',
  'flush',
  'adapterAttaching',
  'adapterAttached',
  'adapterDetached',
  'adapterShown',
  'applyTaken',
  'personEdited',
  'lanesEdited',
  'workbenchLaneChanged',
  'lanesApplied',
  'lanesSeeded',
  'deviceChanged',
  'routeChanged',
  'intent',
  'intentApplied',
  'intentUnavailable',
  'restore',
] as const satisfies ReadonlyArray<WorkbenchLayoutEvent['type']>;

type WorkbenchLayoutMachineDefinition = typeof workbenchLayoutDefinition;

/** The type of {@link workbenchLayoutMachine}, named so declarations reference it rather than inline it. */
// oxlint-disable-next-line typescript/no-empty-interface, typescript/no-empty-object-type, typescript/consistent-type-definitions -- an interface, not a type alias: declarations reference an interface by name and would expand an alias (K-17)
export interface WorkbenchLayoutMachine extends WorkbenchLayoutMachineDefinition {}

/** One live project's workbench layout. */
export const workbenchLayoutMachine: WorkbenchLayoutMachine = workbenchLayoutDefinition;

/** A layout actor's snapshot. */
export type WorkbenchLayoutSnapshot = SnapshotFrom<WorkbenchLayoutMachine>;

/** What the selectors read: an actor's and a spawned ref's snapshots both carry it. */
export type WorkbenchLayoutView = Pick<WorkbenchLayoutSnapshot, 'context' | 'value'>;

/** A layout actor. */
export type WorkbenchLayoutActor = Actor<WorkbenchLayoutMachine>;

/** The acknowledged layout digest, or `undefined` while the applied revision is unknown (I12). */
export const selectAppliedLayoutDigest = (snapshot: WorkbenchLayoutView): LayoutDigest | undefined =>
  appliedDigestOf(snapshot.context);

/** The arrangement the adapters show, or `undefined` before the record's first read. */
export const selectArrangement = (snapshot: WorkbenchLayoutView): WorkbenchLayout | undefined =>
  snapshot.context.arrangement;

/** The digest of the record bytes the arrangement holds: what a restore command names as `expected`. */
export const selectArrangementDigest = (snapshot: WorkbenchLayoutView): LayoutDigest | undefined =>
  snapshot.context.arrangementDigest;

/** Whether the record's first read has published. */
export const selectLayoutReady = (snapshot: WorkbenchLayoutView): boolean => snapshot.value.record === 'ready';

/**
 * Whether the record's first read has settled: it was read, or it stopped retrying (A8d, M2). Until then an adapter has
 * not been shown what the record arranges, so its empty state would offer a choice the record is about to make.
 */
export const selectLayoutReadSettled = (snapshot: WorkbenchLayoutView): boolean =>
  selectLayoutReady(snapshot) || unreadable(snapshot.context);

/** An intent's outcome, once it settled. */
export const selectIntentOutcome = (snapshot: WorkbenchLayoutView, intentId: string): PaneIntentOutcome | undefined => {
  const entry = intentOf(snapshot.context.intents, intentId);
  return ownValue(snapshot.context.outcomes, intentId) ?? (entry === undefined ? undefined : outcomeOf(entry));
};

/** A restore's outcome, once it settled. */
export const selectRestoreOutcome = (
  snapshot: WorkbenchLayoutView,
  restoreId: string,
): 'applied' | 'refused' | undefined => ownValue(snapshot.context.restores, restoreId);

/** The refusal the record holds, if any. */
export const selectLayoutRefusal = (snapshot: WorkbenchLayoutView): RecordRefusal | undefined =>
  snapshot.context.refusal;

/** The record's health, once the record child reported it. */
export const selectLayoutHealth = (snapshot: WorkbenchLayoutView): RecordHealth | undefined => snapshot.context.health;

/** The first defect the root `onError` caught (D23). */
export const selectLayoutFault = (snapshot: WorkbenchLayoutView): string | undefined => snapshot.context.fault;

/** The record's file ports, as the layout store takes them. */
export type WorkbenchLayoutFiles = Parameters<typeof createWorkbenchLayoutStore>[0]['files'];

/** A watch on one record file, as the project's file manager opens it. */
export type LayoutRecordWatch = (absolutePath: string, listener: (event: WatchEvent) => void) => ObservationWatch;

/**
 * The record session of a live project (A8b): the file's watch, which the filesystem replaces with its connections, and
 * the project the record's issue is published for. Given, the record child follows the file on disk and publishes the
 * record's issue (refused, newer, unconfirmed or unreadable) with its recoveries, as `WorkbenchRecordHost` did.
 */
export type LayoutRecordSession = Readonly<{
  projectId: string;
  /** The watch port now. */
  watch: () => LayoutRecordWatch;
  /** Hear of a replaced watch port: the session reopens its watch on it. */
  onWatchReplaced: (listener: () => void) => () => void;
}>;

/* What a reviewed reset writes when no arrangement was ever read (the record host's fallback). */
const resetFallbackLayout = (): WorkbenchLayout => emptyLayout();

/**
 * The store-backed record child: the layout store over the project's file ports, in this callback's closure (D4).
 *
 * @param options - The project root, the record's files and the store's edit debounce and actor options.
 * @returns The `layoutRecord` logic.
 */
export const createLayoutRecordLogic = (
  options: Readonly<{
    root: string;
    files: WorkbenchLayoutFiles;
    editDebounce?: number;
    /** A live project's record session: the watch and the record's issue (A8b). */
    session?: LayoutRecordSession;
  }> &
    Pick<ActorOptions<AnyActorLogic>, 'clock'>,
): CallbackActorLogic<LayoutRecordCommand> =>
  createCallbackLogic<LayoutRecordCommand>(({ sendBack, receive }) => {
    let stopped = false;
    const answer = (event: WorkbenchLayoutEvent): void => {
      if (!stopped) {
        sendBack(event);
      }
    };
    /* The record's issue: the codec's refusal, the store's health and the watch's error (the record host's). */
    let refusal: (RecordRefusal & Readonly<{ bytes: Uint8Array<ArrayBuffer> | null }>) | undefined;
    let health: RecordHealth | undefined;
    let observedError: string | undefined;
    /* The last arrangement read: a reviewed reset writes it. */
    let lastRead: WorkbenchLayout | undefined;
    let observation: ObservationService<boolean> | undefined;
    /* The record's health with the watch's error folded in, as the record host combined them: a watch that fails reads
     * nothing, so the record is unavailable until it recovers. */
    const sourceHealthOf = (): RecordHealth | undefined =>
      observedError === undefined
        ? health
        : { ...(health ?? store.health()), read: 'unavailable', error: observedError };
    const publishIssue = (): void => {
      const { session } = options;
      if (session === undefined || stopped) {
        return;
      }
      const sourceHealth = sourceHealthOf();
      const state = recordIssueState(refusal, sourceHealth);
      const current = observation;
      publishRecordIssue(
        session.projectId,
        workbenchPaths.layout,
        state === undefined
          ? undefined
          : {
              kind: 'layout',
              path: workbenchPaths.layout,
              state,
              message: refusal?.message ?? sourceHealth?.error,
              bytes: refusal?.bytes ?? null,
              writing: health?.writing ?? false,
              retryRead: async () => {
                if (observedError !== undefined && current !== undefined) {
                  current.refresh();
                  return false;
                }
                return store.retryRead();
              },
              retrySave: async () => store.flush(),
              reset: async (reviewed) => store.reset(lastRead ?? resetFallbackLayout(), reviewed),
            },
      );
    };
    /* Edits since a restore was asked make it ineligible (rule 5): the arrangement moved under it. */
    let edits = 0;
    const store = createWorkbenchLayoutStore({
      root: options.root,
      files: options.files,
      ...(options.editDebounce === undefined ? {} : { editDebounce: options.editDebounce }),
      ...(options.clock === undefined ? {} : { clock: options.clock }),
      onChange: (state, source) => {
        refusal = state.refusal === undefined ? undefined : { ...state.refusal, bytes: state.bytes };
        if (state.refusal === undefined && state.layout !== undefined) {
          lastRead = state.layout;
        }
        publishIssue();
        // Rule 8: owed when the store's intended arrangement is not what it published.
        const owed = !sameLayout(store.intendedLayout(), state.layout);
        answer({
          type: 'recordPublished',
          layout: state.layout,
          digest: state.digest,
          origin: source === 'write' ? 'own' : 'foreign',
          refusal: state.refusal,
          owed,
        });
      },
      onError: (error) => {
        answer({ type: 'recordFailed', message: messageOf(error) });
      },
      onHealth: (next) => {
        health = next;
        publishIssue();
        answer({ type: 'recordHealthChanged', health: sourceHealthOf() ?? next });
      },
    });
    /* Each command's answer is sent back unless the child stopped; a command that rejects answers `ok: false`. */
    const answerWhen = async (
      work: Promise<boolean>,
      toEvent: (ok: boolean) => WorkbenchLayoutEvent,
    ): Promise<void> => {
      let ok = false;
      try {
        ok = await work;
      } catch {
        ok = false;
      }
      answer(toEvent(ok));
    };
    const track = (work: Promise<boolean>, toEvent: (ok: boolean) => WorkbenchLayoutEvent): void => {
      void answerWhen(work, toEvent);
    };
    receive((command) => {
      switch (command.type) {
        case 'edit': {
          edits += 1;
          track(store.edit(command.layout), (ok) => ({
            type: 'recordEditAnswered',
            editCount: command.editCount,
            ok,
          }));
          return;
        }
        case 'restore': {
          const editsAsked = edits;
          track(
            store.restore(command.layout, command.expected, () => edits === editsAsked),
            (ok) => ({
              type: 'recordRestoreAnswered',
              restoreId: command.restoreId,
              ok,
            }),
          );
          return;
        }
        case 'flush': {
          track(store.flush(), (ok) => ({ type: 'recordFlushAnswered', requestId: command.requestId, ok }));
          return;
        }
        case 'invalidate': {
          store.invalidateRead();
          void store.read();
        }
      }
    });
    const { session } = options;
    if (session === undefined) {
      void store.read(true);
      return () => {
        stopped = true;
        store.dispose();
      };
    }
    /* A live project's record follows the file on disk (rule 9: one store, whichever watch reports it). The watch's
     * first answer reads it, and each change or reset reads it again, as the record host's observation did. */
    const path = `${options.root}/${workbenchPaths.layout}`;
    const openWatch = (): (() => void) => {
      const watch = session.watch();
      const opened = new ObservationService<boolean>({
        resource: path,
        watch: (invalidate, reset) =>
          watch(path, (event) => {
            if (event.type === 'reset') {
              reset();
            } else {
              invalidate();
            }
          }),
        invalidate: store.invalidateRead,
        read: async () => store.read(!store.ready()),
      });
      observation = opened;
      const lease = opened.acquire();
      const unsubscribe = lease.subscribe(() => {
        const { error } = lease.getSnapshot();
        if (error !== observedError) {
          observedError = error;
          publishIssue();
          // The layout hears it too: a first read the watch never makes releases the intents that wait for it.
          answer({ type: 'recordHealthChanged', health: sourceHealthOf() ?? store.health() });
        }
      });
      return () => {
        unsubscribe();
        lease.release();
      };
    };
    let closeWatch = openWatch();
    const stopFollowing = session.onWatchReplaced(() => {
      closeWatch();
      closeWatch = openWatch();
    });
    return () => {
      stopFollowing();
      closeWatch();
      stopped = true;
      publishRecordIssue(session.projectId, workbenchPaths.layout, undefined);
      // A debounced edit is written before the store closes (the record host's dispose dropped one, A0.3).
      const flushThenClose = async (): Promise<void> => {
        try {
          await store.flush();
        } finally {
          store.dispose();
        }
      };
      void flushThenClose();
    };
  });

/**
 * An unstarted layout actor whose record child is the layout store over `files` (MC-R4, MC-R24).
 *
 * @param options - The machine's input, the record's root and files, and the actor options tests inject.
 * @returns The actor. Its owner starts it once.
 */
export function createWorkbenchLayoutActor(
  options: Readonly<{
    input: WorkbenchLayoutInput;
    root: string;
    files: WorkbenchLayoutFiles;
    editDebounce?: number;
    session?: LayoutRecordSession;
  }> &
    Pick<ActorOptions<AnyActorLogic>, 'clock' | 'inspect' | 'onRejectedEvent'>,
): WorkbenchLayoutActor {
  const { input, root, files, editDebounce, session, clock, inspect, onRejectedEvent } = options;
  const machine = workbenchLayoutMachine.provide({
    actors: {
      layoutRecord: createLayoutRecordLogic({
        root,
        files,
        editDebounce,
        clock,
        ...(session === undefined ? {} : { session }),
      }),
    },
  });
  // An explicit `undefined` would replace xstate's own default, so only what was given is passed on.
  return createActor(machine, {
    input,
    ...(clock === undefined ? {} : { clock }),
    ...(inspect === undefined ? {} : { inspect }),
    ...(onRejectedEvent === undefined ? {} : { onRejectedEvent }),
  });
}

let flushRequests = 0;

/**
 * Settle the layout record's pending write: the producer the runtime registers (A8b). Resolves `true` once nothing is
 * owed, and `false` when the actor is stopped or the record cannot write.
 *
 * @param actor - A started layout actor.
 * @returns Whether the record holds every local change.
 */
export async function flushWorkbenchLayout(actor: ActorRefFrom<WorkbenchLayoutMachine>): Promise<boolean> {
  if (actor.getSnapshot().status !== 'active') {
    return false;
  }
  flushRequests += 1;
  const requestId = `flush-${flushRequests}`;
  return new Promise<boolean>((resolve) => {
    const answered = actor.on('flushed', (event) => {
      if (event.requestId === requestId) {
        answered.unsubscribe();
        stoppedWatch.unsubscribe();
        resolve(event.ok);
      }
    });
    const stoppedWatch = actor.subscribe({
      complete: () => {
        answered.unsubscribe();
        resolve(false);
      },
      error: () => {
        answered.unsubscribe();
        resolve(false);
      },
    });
    actor.send({ type: 'flush', requestId });
  });
}
