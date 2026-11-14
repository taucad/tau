/* oxlint-disable typescript/no-restricted-types -- Checked filesystem absence uses null. */
/**
 * `workbenchLayout` (app state orchestration charter A8a) against a scripted record child and scripted adapters that
 * record what the machine emits, and, for the record session's own rows, against the real layout store over in-memory
 * files on a `StepClock`.
 *
 * One machine row per A0.3 row (`project-workspace-context.test.tsx`, `workbench-record-host.test.tsx`,
 * `chat-workbench-dockview.test.tsx`, `chat-viewer-dockview.restored.test.tsx`), named by its A0.3 item. A0.3's two
 * entries-session rows (5b) belong to the entries session (A9), not this machine.
 *
 * Path table (the shortest path to each state), kept current with `pathTable`:
 *
 * 1. initial: `reading`, both adapters `detached`, intents `idle`, restore `idle`
 * 2. `intent`: intents `waiting`
 * 3. `adapterAttaching{workbench}`, 4. `adapterAttaching{viewer}`
 * 5. `recordPublished`: `ready`
 * ...the rest as the table row asserts.
 */
import type { WorkbenchLaneNode, WorkbenchLayout, ViewerNode } from '@taucad/workbench';
import { workbenchRecords } from '@taucad/workbench';
import type { CheckedFileWriteResult } from '@taucad/types';
import { StepClock, flush } from '@taucad/xstate-testing/clock';
import { guardActors } from '@taucad/xstate-testing/inspect';
import { unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';
import { describe, expect, it } from 'vitest';
import { createActor, createCallbackLogic } from 'xstate';
import type { AnyMachineSnapshot } from 'xstate';
import {
  createWorkbenchLayoutActor,
  flushWorkbenchLayout,
  selectAppliedLayoutDigest,
  selectArrangement,
  selectArrangementDigest,
  selectIntentOutcome,
  selectLayoutFault,
  selectRestoreOutcome,
  workbenchLayoutEventTypes,
  workbenchLayoutIgnoredEvents,
  workbenchLayoutMachine,
} from '#workbench-records/workbench-layout.machine.js';
import type {
  LayoutDigest,
  LayoutRecordCommand,
  WorkbenchLayoutEmitted,
  WorkbenchLayoutEvent,
  WorkbenchLayoutInput,
} from '#workbench-records/workbench-layout.machine.js';
import type { LayoutAdapterId, PaneIntentTarget } from '#workbench-records/pane-intents.js';

const viewer = (...views: string[]): ViewerNode => ({
  kind: 'group',
  tabs: views.map((view) => ({ kind: 'view', view })),
});
const panes = (...ids: Array<'parameters' | 'model' | 'export' | 'details' | 'share'>): WorkbenchLaneNode => ({
  kind: 'group',
  tabs: ids.map((pane) => ({ kind: 'pane', pane })),
});
const layout = (views: readonly string[], workbench: WorkbenchLaneNode = panes('parameters')): WorkbenchLayout => ({
  version: 1,
  lanes: { chat: true, workbench: true },
  viewer: viewer(...views),
  workbench,
});
const stored = layout(['front']);
const foreign = layout(['iso']);
const digestOf = (record: WorkbenchLayout): LayoutDigest =>
  `sha256:${workbenchRecords.layout.serialize(record).length.toString(16)}-${record.viewer.kind === 'group' ? record.viewer.tabs.map((tab) => tab.view).join('.') : 'split'}-${record.workbench.kind === 'group' ? record.workbench.tabs.length : 0}`;

const modelPane: PaneIntentTarget = { kind: 'pane', adapter: 'workbench', pane: 'model' };
const sourceFile: PaneIntentTarget = { kind: 'file', path: 'main.ts' };

/* One guard per test over every actor the test starts (MC-R23). */
const testGuard = () => guardActors({ ignore: { workbenchLayout: workbenchLayoutIgnoredEvents } });

/** The machine with a scripted record child and adapters that record what the machine emits. */
function mount(input: Partial<WorkbenchLayoutInput> = {}) {
  const guard = testGuard();
  const record = {
    send: undefined as ((event: WorkbenchLayoutEvent) => void) | undefined,
    commands: [] as LayoutRecordCommand[],
    starts: 0,
    stops: 0,
  };
  const layoutRecord = createCallbackLogic<LayoutRecordCommand>(({ sendBack, receive }) => {
    record.starts += 1;
    record.send = sendBack;
    receive((command) => {
      record.commands.push(command);
    });
    return () => {
      record.stops += 1;
    };
  });
  const actor = createActor(workbenchLayoutMachine.provide({ actors: { layoutRecord } }), {
    input: {
      device: input.device ?? 'desktop',
      adapters: input.adapters ?? ['workbench', 'viewer'],
      routeKey: input.routeKey ?? 'route-1',
      workbenchOpen: input.workbenchOpen ?? true,
      ...(input.lanes === undefined ? {} : { lanes: input.lanes }),
      ...(input.awaitsLanes === undefined ? {} : { awaitsLanes: input.awaitsLanes }),
    },
    inspect: guard.inspect,
  });
  const emitted: WorkbenchLayoutEmitted[] = [];
  actor.on('*', (event) => {
    emitted.push(event as WorkbenchLayoutEmitted);
  });
  actor.start();
  const of = <Type extends WorkbenchLayoutEmitted['type']>(type: Type) =>
    emitted.filter((event): event is Extract<WorkbenchLayoutEmitted, { type: Type }> => event.type === type);
  const harness = {
    actor,
    guard,
    record,
    emitted,
    of,
    context: () => actor.getSnapshot().context,
    publish(
      next: WorkbenchLayout | undefined,
      options: Readonly<{ origin?: 'own' | 'foreign'; owed?: boolean; refused?: boolean }> = {},
    ) {
      record.send!({
        type: 'recordPublished',
        layout: next,
        digest: next === undefined ? 'missing' : digestOf(next),
        origin: options.origin ?? 'foreign',
        refusal: options.refused ? { code: 'INVALID_RECORD', message: 'invalid' } : undefined,
        owed: options.owed ?? false,
      });
    },
    attaching(adapter: LayoutAdapterId) {
      actor.send({ type: 'adapterAttaching', adapter });
    },
    attach(adapter: LayoutAdapterId) {
      actor.send({ type: 'adapterAttaching', adapter });
      actor.send({ type: 'adapterAttached', adapter });
    },
    detach(adapter: LayoutAdapterId) {
      actor.send({ type: 'adapterDetached', adapter });
    },
    /** The adapter reports every show it was sent, in order. */
    report(adapter: LayoutAdapterId) {
      for (const shown of of('show').filter((event) => event.adapter === adapter)) {
        actor.send({ type: 'adapterShown', adapter, showId: shown.showId });
      }
    },
    reportAll() {
      harness.report('workbench');
      harness.report('viewer');
    },
    /** The adapter takes the latest offered apply. */
    take(adapter: LayoutAdapterId = 'viewer') {
      const offer = of('applyOffered').at(-1);
      if (offer !== undefined) {
        actor.send({ type: 'applyTaken', adapter, applyId: offer.applyId });
      }
    },
    editViewer(...views: string[]) {
      actor.send({ type: 'personEdited', adapter: 'viewer', node: viewer(...views) });
    },
    editWorkbench(node: WorkbenchLaneNode) {
      actor.send({ type: 'personEdited', adapter: 'workbench', node });
    },
    /** The record writes the latest edit. */
    written() {
      const edit = record.commands.findLast((command) => command.type === 'edit');
      if (edit?.type === 'edit') {
        record.send!({ type: 'recordEditAnswered', editCount: edit.editCount, ok: true });
      }
    },
    intent(intentId: string, target: PaneIntentTarget, source: 'person' | 'route' | 'agent' | 'editor' = 'person') {
      actor.send({ type: 'intent', intentId, source, target });
    },
    /** The adapter applies the intent it was last delivered. */
    applyIntent(intentId: string, node: ViewerNode | WorkbenchLaneNode) {
      const delivery = of('deliverIntent').findLast((event) => event.intentId === intentId);
      actor.send({ type: 'intentApplied', intentId, deliveryId: delivery?.deliveryId ?? -1, node });
    },
    deliveries: (intentId: string) => of('deliverIntent').filter((event) => event.intentId === intentId),
    applied: () => selectAppliedLayoutDigest(actor.getSnapshot()),
    shown: () => selectArrangement(actor.getSnapshot()),
  };
  return harness;
}

/** A ready layout with both adapters attached and the first read acknowledged. */
function ready(input: Partial<WorkbenchLayoutInput> = {}) {
  const harness = mount(input);
  harness.publish(stored);
  for (const adapter of harness.context().adapters) {
    harness.attach(adapter);
  }
  harness.reportAll();
  return harness;
}

describe('workbenchLayout', () => {
  describe('A0.3 item 1: pane intents', () => {
    it('1a: should apply a pane intent once when the workbench attaches after it, and not replay it on reattach', () => {
      const harness = mount();
      harness.publish(stored);
      harness.attach('viewer');
      harness.intent('share', { kind: 'pane', adapter: 'workbench', pane: 'share' });
      expect(harness.deliveries('share')).toEqual([]);

      harness.attach('workbench');
      expect(harness.deliveries('share')).toHaveLength(1);
      harness.applyIntent('share', panes('parameters', 'share'));
      expect(selectIntentOutcome(harness.actor.getSnapshot(), 'share')).toEqual({ outcome: 'applied' });

      harness.detach('workbench');
      harness.attach('workbench');
      expect(harness.deliveries('share')).toHaveLength(1);
      expect(harness.of('intentSettled')).toEqual([{ type: 'intentSettled', intentId: 'share', outcome: 'applied' }]);
    });

    it('1b: should drop a queued intent when the route key changes, before and after the first read', () => {
      const before = mount();
      before.intent('early', modelPane);
      before.actor.send({ type: 'routeChanged', routeKey: 'route-2' });
      before.publish(stored);
      before.attach('workbench');
      expect(before.deliveries('early')).toEqual([]);
      expect(selectIntentOutcome(before.actor.getSnapshot(), 'early')).toEqual({
        outcome: 'dropped',
        reason: 'routeChanged',
      });

      const after = ready();
      after.detach('workbench');
      after.intent('late', modelPane);
      after.actor.send({ type: 'routeChanged', routeKey: 'route-2' });
      after.attach('workbench');
      expect(after.deliveries('late')).toEqual([]);
      expect(selectIntentOutcome(after.actor.getSnapshot(), 'late')).toEqual({
        outcome: 'dropped',
        reason: 'routeChanged',
      });
    });

    it('1c: should keep a pane intent across a workbench close and apply it once on the next attach (D14)', () => {
      const harness = ready();
      harness.detach('workbench');
      harness.intent('model', modelPane);
      harness.intent('file', sourceFile);
      harness.actor.send({ type: 'workbenchLaneChanged', open: false });
      expect(selectIntentOutcome(harness.actor.getSnapshot(), 'file')).toEqual({
        outcome: 'dropped',
        reason: 'workbenchClosed',
      });
      expect(selectIntentOutcome(harness.actor.getSnapshot(), 'model')).toBeUndefined();

      harness.actor.send({ type: 'workbenchLaneChanged', open: true });
      harness.attach('workbench');
      harness.applyIntent('model', panes('parameters', 'model'));
      harness.detach('workbench');
      harness.attach('workbench');
      expect(harness.deliveries('model')).toHaveLength(1);
      expect(harness.deliveries('file')).toEqual([]);
      expect(selectIntentOutcome(harness.actor.getSnapshot(), 'model')).toEqual({ outcome: 'applied' });
    });

    it('should drop a queued Files pane intent on a workbench close, as the host clears it today (rule 7)', () => {
      const harness = ready();
      harness.detach('workbench');
      harness.intent('files', { kind: 'pane', adapter: 'workbench', pane: 'files' });
      harness.actor.send({ type: 'workbenchLaneChanged', open: false });
      expect(selectIntentOutcome(harness.actor.getSnapshot(), 'files')).toEqual({
        outcome: 'dropped',
        reason: 'workbenchClosed',
      });
    });

    it('should fold a late answer for a delivered intent the route dropped into the arrangement as an edit', () => {
      const harness = ready();
      harness.intent('model', modelPane);
      expect(harness.deliveries('model')).toHaveLength(1);
      harness.actor.send({ type: 'routeChanged', routeKey: 'route-2' });
      const edits = harness.context().editCount;
      harness.applyIntent('model', panes('parameters', 'model'));
      expect(selectIntentOutcome(harness.actor.getSnapshot(), 'model')).toEqual({
        outcome: 'dropped',
        reason: 'routeChanged',
      });
      expect(harness.shown()?.workbench).toEqual(panes('parameters', 'model'));
      expect(harness.context().editCount).toBe(edits + 1);
      harness.written();
      // A newer record change is applied; the same late answer again must not revert it.
      const newer = layout(['front'], panes('parameters', 'export'));
      harness.publish(newer);
      harness.take('workbench');
      expect(harness.shown()).toEqual(newer);
      harness.applyIntent('model', panes('parameters', 'model'));
      expect(harness.shown()).toEqual(newer);
      expect(harness.context().editCount).toBe(edits + 1);
    });

    it('should not take a late answer to a dropped intent from a mount that has since left', () => {
      const harness = ready();
      harness.intent('model', modelPane);
      harness.actor.send({ type: 'routeChanged', routeKey: 'route-2' });
      harness.detach('workbench');
      harness.attach('workbench');
      harness.reportAll();
      const edits = harness.context().editCount;
      harness.applyIntent('model', panes('parameters', 'model'));
      expect(harness.context().editCount).toBe(edits);
      expect(harness.shown()).toEqual(stored);
    });

    it('should treat ids that name inherited object properties as new ids', () => {
      const harness = ready();
      harness.intent('constructor', modelPane);
      expect(harness.deliveries('constructor')).toHaveLength(1);
      harness.actor.send({ type: 'restore', restoreId: 'toString', expected: digestOf(stored), layout: foreign });
      expect(harness.record.commands.filter((command) => command.type === 'restore')).toHaveLength(1);
      expect(selectRestoreOutcome(harness.actor.getSnapshot(), 'toString')).toBeUndefined();
    });

    it('should deliver intents in the order they were sent, whatever their ids', () => {
      const harness = ready();
      harness.detach('workbench');
      harness.intent('2', modelPane);
      harness.intent('1', { kind: 'pane', adapter: 'workbench', pane: 'share' });
      harness.attach('workbench');
      expect(harness.of('deliverIntent').map((event) => event.intentId)).toEqual(['2', '1']);
    });

    it('should open the workbench lane for a workbench intent on a desktop', () => {
      const harness = ready({ workbenchOpen: false });
      harness.intent('model', modelPane);
      expect(harness.of('workbenchOpenRequested')).toEqual([{ type: 'workbenchOpenRequested', intentId: 'model' }]);
      expect(harness.context().workbenchOpen).toBe(true);
    });

    it('should apply an intent id at most once, whatever is re-sent or re-answered (I11)', () => {
      const harness = ready();
      harness.intent('model', modelPane);
      harness.applyIntent('model', panes('parameters', 'model'));
      harness.applyIntent('model', panes('parameters', 'model', 'export'));
      harness.intent('model', modelPane);
      expect(harness.deliveries('model')).toHaveLength(1);
      // The re-sent id is answered again by its first outcome.
      expect(harness.of('intentSettled')).toEqual([
        { type: 'intentSettled', intentId: 'model', outcome: 'applied' },
        { type: 'intentSettled', intentId: 'model', outcome: 'applied' },
      ]);
      expect(harness.shown()?.workbench).toEqual(panes('parameters', 'model'));
    });

    it('should queue a delivered intent again when its adapter detaches before answering', () => {
      const harness = ready();
      harness.intent('model', modelPane);
      harness.detach('workbench');
      const stale = harness.deliveries('model')[0]!;
      harness.actor.send({
        type: 'intentApplied',
        intentId: 'model',
        deliveryId: stale.deliveryId,
        node: panes('parameters', 'model'),
      });
      expect(selectIntentOutcome(harness.actor.getSnapshot(), 'model')).toBeUndefined();

      harness.attach('workbench');
      expect(harness.deliveries('model')).toHaveLength(2);
      harness.applyIntent('model', panes('parameters', 'model'));
      expect(selectIntentOutcome(harness.actor.getSnapshot(), 'model')).toEqual({ outcome: 'applied' });
    });

    it('should drop an intent whose target cannot open with `unavailable`', () => {
      const harness = ready();
      harness.detach('workbench');
      harness.intent('file', sourceFile);
      harness.actor.send({ type: 'intentUnavailable', intentId: 'file' });
      harness.attach('workbench');
      expect(harness.deliveries('file')).toEqual([]);
      expect(selectIntentOutcome(harness.actor.getSnapshot(), 'file')).toEqual({
        outcome: 'dropped',
        reason: 'unavailable',
      });
    });

    it('should count an applied intent as an edit and write it (rule 1)', () => {
      const harness = ready();
      harness.intent('model', modelPane);
      harness.applyIntent('model', panes('parameters', 'model'));
      expect(harness.record.commands.filter((command) => command.type === 'edit')).toEqual([
        { type: 'edit', editCount: 1, layout: layout(['front'], panes('parameters', 'model')) },
      ]);
      expect(harness.context().unwritten).toBe(true);
    });

    it('should wait for the first read before delivering an intent', () => {
      const harness = mount();
      harness.attach('workbench');
      harness.attach('viewer');
      harness.intent('model', modelPane);
      expect(harness.deliveries('model')).toEqual([]);
      harness.publish(stored);
      expect(harness.deliveries('model')).toHaveLength(1);
    });
  });

  describe('A0.3 item 2: attach and acknowledgement (I12)', () => {
    it('2: should read unknown while detached and acknowledge a publication that arrived detached once attached', () => {
      const harness = ready();
      expect(harness.applied()).toBe(digestOf(stored));

      harness.detach('viewer');
      expect(harness.applied()).toBeUndefined();
      expect(harness.of('appliedRevisionChanged').at(-1)).toEqual({
        type: 'appliedRevisionChanged',
        digest: undefined,
      });
      harness.detach('workbench');
      harness.publish(foreign);
      expect(harness.applied()).toBeUndefined();
      expect(harness.of('applyOffered')).toEqual([]);

      harness.attach('viewer');
      harness.take('viewer');
      expect(harness.shown()).toEqual(foreign);
      harness.report('viewer');
      expect(harness.applied()).toBeUndefined();
      harness.attach('workbench');
      harness.report('workbench');
      expect(harness.applied()).toBe(digestOf(foreign));
    });

    it('2: should seed each adapter with the arrangement when it attaches again', () => {
      const harness = ready();
      harness.detach('workbench');
      harness.attach('workbench');
      expect(harness.of('show').findLast((event) => event.adapter === 'workbench')?.layout).toEqual(stored);
      harness.detach('viewer');
      harness.attach('viewer');
      expect(harness.of('show').findLast((event) => event.adapter === 'viewer')?.layout).toEqual(stored);
    });

    it('should acknowledge only after the adapter reports the show (I12)', () => {
      const harness = mount();
      harness.publish(stored);
      harness.attach('workbench');
      harness.attach('viewer');
      expect(harness.applied()).toBeUndefined();
      harness.report('workbench');
      expect(harness.applied()).toBeUndefined();
      harness.report('viewer');
      expect(harness.applied()).toBe(digestOf(stored));
    });

    it('should ignore a report of an older show, and one from an adapter that left', () => {
      const harness = mount();
      harness.publish(stored);
      harness.attach('workbench');
      harness.attach('viewer');
      harness.report('workbench');
      harness.publish(foreign);
      harness.take('viewer');
      const oldShow = harness.of('show').find((event) => event.adapter === 'viewer')!;
      harness.actor.send({ type: 'adapterShown', adapter: 'viewer', showId: oldShow.showId });
      harness.report('workbench');
      expect(harness.applied()).toBeUndefined();
      harness.report('viewer');
      expect(harness.applied()).toBe(digestOf(foreign));
    });

    it('should acknowledge nothing while the workbench lane is closed on a desktop (rule 4, D14)', () => {
      const harness = mount({ workbenchOpen: false });
      harness.publish(stored);
      harness.attach('viewer');
      harness.report('viewer');
      expect(harness.applied()).toBeUndefined();
    });

    it('should offer an apply in flight again to an adapter that attaches after it was offered', () => {
      const harness = ready();
      harness.actor.send({ type: 'workbenchLaneChanged', open: false });
      harness.detach('workbench');
      harness.publish(foreign);
      expect(harness.of('applyOffered')).toHaveLength(1);
      harness.actor.send({ type: 'workbenchLaneChanged', open: true });
      harness.attach('workbench');
      expect(harness.of('applyOffered')).toHaveLength(2);
      harness.detach('viewer');
      harness.take('workbench');
      expect(harness.shown()).toEqual(foreign);
    });

    it('should drop an apply in flight when the last adapter detaches and compute it again on attach (rule 4)', () => {
      const harness = ready();
      harness.publish(foreign);
      expect(harness.of('applyOffered')).toHaveLength(1);
      harness.detach('workbench');
      harness.detach('viewer');
      harness.take('viewer');
      expect(harness.shown()).toEqual(stored);

      harness.attach('viewer');
      expect(harness.of('applyOffered')).toHaveLength(2);
      harness.take('viewer');
      expect(harness.shown()).toEqual(foreign);
    });

    it('should not acknowledge a deleted record the store still shows as its last layout', () => {
      const harness = ready();
      harness.editViewer('front', 'top');
      harness.written();
      harness.record.send!({
        type: 'recordPublished',
        layout: harness.shown(),
        digest: 'missing',
        origin: 'foreign',
        refusal: undefined,
        owed: false,
      });
      harness.reportAll();
      expect(harness.applied()).toBeUndefined();
    });

    it('should not acknowledge again after the record failed until a new publication', () => {
      const harness = ready();
      expect(harness.applied()).toBe(digestOf(stored));
      harness.record.send!({ type: 'recordFailed', message: 'disk' });
      expect(harness.applied()).toBeUndefined();
      harness.intent('front', { kind: 'pane', adapter: 'viewer', pane: 'front' });
      harness.reportAll();
      expect(harness.applied()).toBeUndefined();
      harness.publish(stored);
      harness.reportAll();
      expect(harness.applied()).toBe(digestOf(stored));
    });

    it('should not acknowledge a refused record', () => {
      const harness = ready();
      harness.publish(undefined, { refused: true });
      harness.reportAll();
      expect(harness.applied()).toBeUndefined();
      expect(harness.shown()).toEqual(stored);
      expect(harness.context().refusal).toEqual({ code: 'INVALID_RECORD', message: 'invalid' });
    });
  });

  describe('A0.3 item 3: the person wins (I10)', () => {
    it('3 (host): should not show a foreign arrangement over an unwritten person edit (rule 8)', () => {
      const harness = ready();
      harness.editViewer('front', 'top');
      harness.publish(foreign, { owed: true });
      harness.take('viewer');
      expect(harness.shown()?.viewer).toEqual(viewer('front', 'top'));

      // Fenced at arrival: still not shown once the edit is written.
      harness.written();
      harness.take('viewer');
      expect(harness.shown()?.viewer).toEqual(viewer('front', 'top'));
      expect(harness.of('applyOffered')).toEqual([]);
    });

    it('3 (adapter): should not land an apply computed before the person edit (rule 2)', () => {
      const harness = ready();
      harness.publish(foreign);
      expect(harness.of('applyOffered')).toHaveLength(1);
      harness.editViewer('front', 'top');
      harness.take('viewer');
      expect(harness.shown()?.viewer).toEqual(viewer('front', 'top'));
    });

    it('should keep an edit owed when the record answers its write failed', () => {
      const harness = ready();
      harness.editViewer('front', 'top');
      const edit = harness.record.commands.findLast((command) => command.type === 'edit');
      harness.record.send!({
        type: 'recordEditAnswered',
        editCount: edit?.type === 'edit' ? edit.editCount : -1,
        ok: false,
      });
      expect(harness.context().unwritten).toBe(true);
    });

    it('should apply the record rebase of the edit once it comes back as a later publication', () => {
      const harness = ready();
      harness.editViewer('front', 'top');
      const rebased = layout(['iso', 'top']);
      harness.publish(foreign, { owed: true });
      harness.written();
      harness.publish(rebased, { origin: 'own' });
      harness.take('viewer');
      expect(harness.shown()).toEqual(rebased);
      harness.reportAll();
      expect(harness.applied()).toBe(digestOf(rebased));
    });

    it('should not re-apply an own publication of what the arrangement holds (rule 3, D18)', () => {
      const harness = ready();
      harness.editViewer('front', 'top');
      harness.written();
      const edited = layout(['front', 'top']);
      harness.publish(edited, { origin: 'own' });
      expect(harness.of('applyOffered')).toEqual([]);
      expect(harness.context().editCount).toBe(1);
      harness.reportAll();
      expect(harness.applied()).toBe(digestOf(edited));
    });

    it('should treat foreign bytes equal to the arrangement as harmless (D18)', () => {
      const harness = ready();
      const before = harness.context();
      harness.publish(stored);
      expect(harness.of('applyOffered')).toEqual([]);
      expect(harness.context().editCount).toBe(before.editCount);
      expect(harness.shown()).toEqual(stored);
    });

    it('should supersede an apply in flight with a newer publication (rule 2)', () => {
      const harness = ready();
      harness.publish(foreign);
      const newer = layout(['top']);
      harness.publish(newer);
      const [first] = harness.of('applyOffered');
      harness.actor.send({ type: 'applyTaken', adapter: 'viewer', applyId: first!.applyId });
      expect(harness.shown()).toEqual(stored);
      harness.take('viewer');
      expect(harness.shown()).toEqual(newer);
    });

    it('should ignore a person edit before the first read and from an adapter that is not attached', () => {
      const harness = mount();
      harness.attach('viewer');
      harness.editViewer('top');
      harness.publish(stored);
      harness.detach('viewer');
      harness.editViewer('top');
      expect(harness.context().editCount).toBe(0);
      expect(harness.shown()).toEqual(stored);
    });

    it('should edit the lane flags as a person edit', () => {
      const harness = ready();
      harness.actor.send({ type: 'lanesEdited', lanes: { chat: false, workbench: true } });
      expect(harness.shown()?.lanes).toEqual({ chat: false, workbench: true });
      expect(harness.record.commands.at(-1)).toMatchObject({ type: 'edit', editCount: 1 });
    });
  });

  describe('A0.3 item 4: restore (I14)', () => {
    const previous = layout(['front', 'back']);

    it('4: should write, show and acknowledge a restore', () => {
      const harness = ready();
      harness.actor.send({ type: 'restore', restoreId: 'r1', expected: digestOf(stored), layout: previous });
      expect(harness.record.commands.at(-1)).toEqual({
        type: 'restore',
        restoreId: 'r1',
        expected: digestOf(stored),
        layout: previous,
      });
      harness.publish(previous, { origin: 'own' });
      expect(harness.shown()).toEqual(stored);
      harness.record.send!({ type: 'recordRestoreAnswered', restoreId: 'r1', ok: true });
      expect(selectRestoreOutcome(harness.actor.getSnapshot(), 'r1')).toBe('applied');
      expect(harness.shown()).toEqual(previous);
      expect(selectArrangementDigest(harness.actor.getSnapshot())).toBe(digestOf(previous));
      harness.reportAll();
      expect(harness.applied()).toBe(digestOf(previous));
    });

    it('4: should refuse a repeated restore command and apply the refreshed one', () => {
      const harness = ready();
      harness.actor.send({ type: 'restore', restoreId: 'r1', expected: digestOf(stored), layout: previous });
      harness.record.send!({ type: 'recordRestoreAnswered', restoreId: 'r1', ok: true });
      harness.publish(previous, { origin: 'own' });
      // The card sends its command again: the arrangement moved, so it is refused and nothing changes.
      harness.actor.send({ type: 'restore', restoreId: 'r2', expected: digestOf(stored), layout: previous });
      expect(selectRestoreOutcome(harness.actor.getSnapshot(), 'r2')).toBe('refused');
      expect(harness.shown()).toEqual(previous);
      // The same id again: its outcome stands, and is answered again.
      harness.actor.send({ type: 'restore', restoreId: 'r1', expected: digestOf(previous), layout: stored });
      expect(harness.of('restoreSettled').at(-1)).toEqual({
        type: 'restoreSettled',
        restoreId: 'r1',
        outcome: 'applied',
      });
      expect(harness.record.commands.filter((command) => command.type === 'restore')).toHaveLength(1);
      // Refreshed: the command now expects what is shown.
      harness.actor.send({ type: 'restore', restoreId: 'r3', expected: digestOf(previous), layout: stored });
      harness.record.send!({ type: 'recordRestoreAnswered', restoreId: 'r3', ok: true });
      expect(selectRestoreOutcome(harness.actor.getSnapshot(), 'r3')).toBe('applied');
      expect(harness.shown()).toEqual(stored);
    });

    it('4: should refuse a restore while an edit is owed, and once it is written over a moved arrangement', () => {
      const harness = ready();
      harness.editViewer('front', 'top');
      harness.actor.send({ type: 'restore', restoreId: 'owed', expected: digestOf(stored), layout: previous });
      expect(selectRestoreOutcome(harness.actor.getSnapshot(), 'owed')).toBe('refused');
      harness.written();
      harness.actor.send({ type: 'restore', restoreId: 'written', expected: digestOf(stored), layout: previous });
      expect(selectRestoreOutcome(harness.actor.getSnapshot(), 'written')).toBe('refused');
      expect(harness.shown()?.viewer).toEqual(viewer('front', 'top'));
      expect(harness.record.commands.filter((command) => command.type === 'restore')).toEqual([]);
    });

    it('should refuse a restore whose arrangement moved while its write was in flight', () => {
      const harness = ready();
      harness.actor.send({ type: 'restore', restoreId: 'r1', expected: digestOf(stored), layout: previous });
      harness.editViewer('front', 'top');
      harness.record.send!({ type: 'recordRestoreAnswered', restoreId: 'r1', ok: true });
      expect(selectRestoreOutcome(harness.actor.getSnapshot(), 'r1')).toBe('refused');
      expect(harness.shown()?.viewer).toEqual(viewer('front', 'top'));
    });

    it('should converge on the record when a restore refused for a move was written anyway', () => {
      const harness = ready();
      harness.actor.send({ type: 'restore', restoreId: 'r1', expected: digestOf(stored), layout: previous });
      harness.publish(previous, { origin: 'own' });
      harness.editViewer('front', 'top');
      harness.record.send!({ type: 'recordRestoreAnswered', restoreId: 'r1', ok: true });
      expect(selectRestoreOutcome(harness.actor.getSnapshot(), 'r1')).toBe('refused');
      expect(harness.shown()?.viewer).toEqual(viewer('front', 'top'));
      // The store wrote the restore before the edit reached it; it rebases the edit onto the restored bytes.
      const rebased = { ...previous, viewer: viewer('front', 'top') };
      harness.publish(rebased, { origin: 'own' });
      harness.reportAll();
      expect(harness.shown()).toEqual(rebased);
      expect(harness.applied()).toBe(digestOf(rebased));
    });

    it('should refuse a restore the record refused, and a second one while one runs', () => {
      const harness = ready();
      harness.actor.send({ type: 'restore', restoreId: 'r1', expected: digestOf(stored), layout: previous });
      harness.actor.send({ type: 'restore', restoreId: 'r2', expected: digestOf(stored), layout: previous });
      expect(selectRestoreOutcome(harness.actor.getSnapshot(), 'r2')).toBe('refused');
      harness.record.send!({ type: 'recordRestoreAnswered', restoreId: 'r1', ok: false });
      expect(selectRestoreOutcome(harness.actor.getSnapshot(), 'r1')).toBe('refused');
      expect(harness.shown()).toEqual(stored);
    });
  });

  describe('A0.3 item 5a: one record session (I13)', () => {
    it('5a: should keep one record session across adapter remounts', () => {
      const harness = ready();
      for (let cycle = 0; cycle < 3; cycle++) {
        harness.detach('workbench');
        harness.detach('viewer');
        harness.attach('viewer');
        harness.attach('workbench');
      }
      expect(harness.record.starts).toBe(1);
      expect(harness.record.stops).toBe(0);
      harness.actor.stop();
      expect(harness.record.stops).toBe(1);
    });
  });

  describe('A0.3 item 6: the phone', () => {
    it('6: should settle a workbench pane intent on a phone by setting the tab alone', () => {
      const harness = ready({ device: 'phone' });
      harness.detach('workbench');
      harness.intent('model', modelPane);
      expect(harness.of('mobileTabRequested')).toEqual([
        { type: 'mobileTabRequested', intentId: 'model', target: modelPane },
      ]);
      expect(selectIntentOutcome(harness.actor.getSnapshot(), 'model')).toEqual({ outcome: 'applied' });
      expect(harness.deliveries('model')).toEqual([]);
      expect(harness.of('workbenchOpenRequested')).toEqual([]);
    });

    it('should settle a workbench pane intent through the tab port on the viewer-only phone shell', () => {
      const harness = ready({ device: 'phone', adapters: ['viewer'] });
      harness.intent('model', modelPane);
      expect(selectIntentOutcome(harness.actor.getSnapshot(), 'model')).toEqual({ outcome: 'applied' });
      harness.intent('file', sourceFile);
      expect(selectIntentOutcome(harness.actor.getSnapshot(), 'file')).toEqual({
        outcome: 'dropped',
        reason: 'unavailable',
      });
      expect(harness.applied()).toBe(digestOf(stored));
    });

    it('should deliver a viewer pane intent to the viewer on a phone, not settle it through the tab', () => {
      const harness = mount({ device: 'phone' });
      harness.publish(stored);
      harness.attach('viewer');
      harness.intent('iso', { kind: 'pane', adapter: 'viewer', pane: 'iso' });
      expect(harness.of('mobileTabRequested')).toEqual([]);
      expect(harness.deliveries('iso')).toHaveLength(1);
      harness.applyIntent('iso', viewer('front', 'iso'));
      expect(selectIntentOutcome(harness.actor.getSnapshot(), 'iso')).toEqual({ outcome: 'applied' });
    });

    it('should switch to the editor tab for a file and apply it once the workbench attaches', () => {
      const harness = ready({ device: 'phone' });
      harness.detach('workbench');
      harness.intent('file', sourceFile);
      expect(harness.of('mobileTabRequested')).toEqual([
        { type: 'mobileTabRequested', intentId: 'file', target: sourceFile },
      ]);
      harness.attach('workbench');
      harness.applyIntent('file', panes('parameters', 'details'));
      expect(selectIntentOutcome(harness.actor.getSnapshot(), 'file')).toEqual({ outcome: 'applied' });
    });

    it('should acknowledge on a phone only while the workbench shows', () => {
      const harness = ready({ device: 'phone' });
      harness.detach('workbench');
      harness.publish(foreign);
      harness.take('viewer');
      harness.report('viewer');
      expect(harness.applied()).toBeUndefined();
      harness.attach('workbench');
      harness.report('workbench');
      expect(harness.applied()).toBe(digestOf(foreign));
    });
  });

  /* A8b review: a project runtime's layout starts before its editor has loaded its lanes, and the editor takes no panel
   * change until it is ready. The intents wait for the lanes the editor loads (`lanesSeeded`), which are a baseline:
   * neither a lane close (rule 7) nor an edit (rule 1). */
  describe('the lanes the editor loads', () => {
    const defaults = { chat: true, workbench: true } as const;
    const filesPane: PaneIntentTarget = { kind: 'pane', adapter: 'workbench', pane: 'files' };

    it('should open the lane the editor loaded closed for an intent sent before it loaded, and drop nothing', () => {
      const harness = mount({ lanes: defaults, awaitsLanes: true });
      harness.publish(stored);
      harness.attach('workbench');
      harness.attach('viewer');
      harness.intent('files', filesPane);
      // The lanes are the editor's defaults: the intent neither opens the lane nor reaches the workbench yet.
      expect(harness.of('workbenchOpenRequested')).toEqual([]);
      expect(harness.deliveries('files')).toEqual([]);
      harness.actor.send({ type: 'lanesSeeded', lanes: { chat: true, workbench: false } });
      expect(harness.of('workbenchOpenRequested')).toEqual([{ type: 'workbenchOpenRequested', intentId: 'files' }]);
      expect(harness.deliveries('files')).toHaveLength(1);
      expect(harness.of('intentSettled')).toEqual([]);
      expect(harness.record.commands.filter((command) => command.type === 'edit')).toEqual([]);
    });

    it('should open the lane the first read closes for an intent the seeded lanes left waiting for it', () => {
      const closed = { ...stored, lanes: { chat: true, workbench: false } };
      const harness = mount({ lanes: defaults, awaitsLanes: true });
      harness.actor.send({ type: 'lanesSeeded', lanes: defaults });
      harness.intent('files', filesPane);
      // The record's lanes are shown with its first read: the lane is not opened before them, or they would close it.
      expect(harness.of('workbenchOpenRequested')).toEqual([]);
      harness.publish(closed);
      expect(harness.context().workbenchOpen).toBe(true);
      expect(harness.of('workbenchOpenRequested')).toEqual([{ type: 'workbenchOpenRequested', intentId: 'files' }]);
      expect(selectIntentOutcome(harness.actor.getSnapshot(), 'files')).toBeUndefined();
    });

    it('should not settle a phone pane intent before the editor can show its tab', () => {
      const harness = mount({ device: 'phone', lanes: defaults, awaitsLanes: true });
      harness.intent('model', modelPane);
      expect(harness.of('mobileTabRequested')).toEqual([]);
      expect(selectIntentOutcome(harness.actor.getSnapshot(), 'model')).toBeUndefined();
      harness.actor.send({ type: 'lanesSeeded', lanes: defaults });
      expect(harness.of('mobileTabRequested')).toEqual([
        { type: 'mobileTabRequested', intentId: 'model', target: modelPane },
      ]);
      expect(selectIntentOutcome(harness.actor.getSnapshot(), 'model')).toEqual({ outcome: 'applied' });
    });

    it('should acknowledge nothing before the lanes are seeded', () => {
      const harness = mount({ lanes: defaults, awaitsLanes: true });
      harness.publish(stored);
      harness.attach('workbench');
      harness.attach('viewer');
      harness.reportAll();
      expect(harness.applied()).toBeUndefined();
      harness.actor.send({ type: 'lanesSeeded', lanes: defaults });
      harness.reportAll();
      expect(harness.applied()).toBe(digestOf(stored));
    });
  });

  /* A8b review: a live project's runtime holds its layout for its whole life, so a settled intent keeps its outcome
   * only (I11), not its entry. */
  it('should retire a settled intent to its outcome and still answer its re-sent id from it', () => {
    const harness = ready();
    harness.intent('model', modelPane);
    harness.applyIntent('model', panes('parameters', 'model'));
    expect(harness.context().intents).toEqual({});
    harness.intent('model', modelPane);
    expect(harness.deliveries('model')).toHaveLength(1);
    expect(harness.of('intentSettled')).toEqual([
      { type: 'intentSettled', intentId: 'model', outcome: 'applied' },
      { type: 'intentSettled', intentId: 'model', outcome: 'applied' },
    ]);
  });

  describe('attach cycles with a queued intent and a pending apply', () => {
    it('should keep both across a detach and reattach, and settle each once', () => {
      const harness = ready();
      harness.detach('workbench');
      harness.intent('model', modelPane);
      harness.publish(foreign);
      harness.detach('viewer');
      expect(harness.applied()).toBeUndefined();
      harness.attach('viewer');
      harness.attach('workbench');
      harness.take('workbench');
      harness.applyIntent('model', panes('parameters', 'model'));
      expect(harness.deliveries('model')).toHaveLength(1);
      expect(harness.shown()).toEqual(layout(['iso'], panes('parameters', 'model')));
      expect(harness.context().editCount).toBe(1);
    });
  });

  describe('fault (D23)', () => {
    it('should keep the first fault and keep answering', () => {
      const harness = ready();
      const before = harness.context();
      harness.actor.send({
        type: 'xstate.error.execution',
        error: new Error('first'),
      } as unknown as WorkbenchLayoutEvent);
      harness.actor.send({
        type: 'xstate.error.execution',
        error: new Error('second'),
      } as unknown as WorkbenchLayoutEvent);
      expect(selectLayoutFault(harness.actor.getSnapshot())).toBe('first');
      harness.editViewer('front', 'top');
      expect(harness.context().editCount).toBe(before.editCount + 1);
      harness.guard.take('fault');
    });
  });
});

/* The record session against the real layout store over in-memory files. */
const encoder = new TextEncoder();

function memoryFiles(initial: WorkbenchLayout = stored) {
  let bytes: Uint8Array<ArrayBuffer> | null = encoder.encode(workbenchRecords.layout.serialize(initial));
  const gates: Array<() => void> = [];
  let hold = false;
  let holdReply = false;
  const writes: string[] = [];
  return {
    /** Another writer replaces the file. */
    replace(next: WorkbenchLayout) {
      bytes = encoder.encode(workbenchRecords.layout.serialize(next));
    },
    files: {
      exists: async () => bytes !== null,
      readFile: async () => bytes!,
      writeFileChecked: async ({
        data,
        preconditions,
      }: {
        path: string;
        data: string;
        preconditions: ReadonlyArray<{ path: string; expected: Uint8Array<ArrayBuffer> | null }>;
      }): Promise<CheckedFileWriteResult> => {
        if (hold) {
          await new Promise<void>((resolve) => {
            gates.push(resolve);
          });
        }
        const expected = preconditions[0]?.expected ?? null;
        const current = bytes;
        const same =
          expected === null || current === null
            ? expected === current
            : expected.length === current.length && expected.every((value, index) => value === current[index]);
        if (!same) {
          return { status: 'conflict', conflicts: [{ path: preconditions[0]!.path, actual: bytes }] };
        }
        writes.push(data);
        bytes = encoder.encode(data);
        const content = bytes;
        if (holdReply) {
          await new Promise<void>((resolve) => {
            gates.push(resolve);
          });
        }
        return { status: 'applied', content };
      },
    },
    writes,
    /** Writes land at once, but their replies wait for `releaseWrites`. */
    holdReplies: () => {
      holdReply = true;
    },
    holdWrites: () => {
      hold = true;
    },
    releaseWrites: () => {
      hold = false;
      holdReply = false;
      for (const release of gates.splice(0)) {
        release();
      }
    },
  };
}

async function storeBacked() {
  const guard = testGuard();
  const clock = new StepClock();
  const files = memoryFiles();
  const actor = createWorkbenchLayoutActor({
    input: { device: 'desktop', adapters: ['workbench', 'viewer'], routeKey: 'route-1', workbenchOpen: true },
    root: '/projects/p1',
    files: files.files,
    editDebounce: 500,
    clock,
    inspect: guard.inspect,
  });
  const shows: Array<Extract<WorkbenchLayoutEmitted, { type: 'show' }>> = [];
  actor.on('show', (event) => {
    shows.push(event);
  });
  actor.start();
  await flush();
  return { actor, clock, files, shows };
}

describe('workbenchLayout record session (the store-backed child)', () => {
  it('should publish the first read as the arrangement', async () => {
    const { actor } = await storeBacked();
    expect(selectArrangement(actor.getSnapshot())).toEqual(stored);
    expect(actor.getSnapshot().matches({ record: 'ready' })).toBe(true);
    actor.stop();
  });

  it('should settle a flush with a write in flight once the write lands', async () => {
    const { actor, clock, files } = await storeBacked();
    actor.send({ type: 'adapterAttaching', adapter: 'viewer' });
    actor.send({ type: 'adapterAttached', adapter: 'viewer' });
    actor.send({ type: 'personEdited', adapter: 'viewer', node: viewer('front', 'top') });
    files.holdWrites();
    clock.advance(500);
    await flush();
    let settled: boolean | undefined;
    const settle = async (): Promise<void> => {
      settled = await flushWorkbenchLayout(actor);
    };
    const flushing = settle();
    await flush();
    expect(settled).toBeUndefined();
    files.releaseWrites();
    await flush();
    await flushing;
    expect(settled).toBe(true);
    expect(files.writes).toHaveLength(1);
    expect(actor.getSnapshot().context.unwritten).toBe(false);
    actor.stop();
  });

  it('should settle a flush with nothing owed at once, and a debounced edit by writing it', async () => {
    const { actor, files } = await storeBacked();
    expect(await flushWorkbenchLayout(actor)).toBe(true);
    actor.send({ type: 'adapterAttaching', adapter: 'viewer' });
    actor.send({ type: 'adapterAttached', adapter: 'viewer' });
    actor.send({ type: 'personEdited', adapter: 'viewer', node: viewer('front', 'top') });
    expect(await flushWorkbenchLayout(actor)).toBe(true);
    expect(files.writes).toHaveLength(1);
    actor.stop();
    expect(await flushWorkbenchLayout(actor)).toBe(false);
  });

  it('should show the record rebase of an edit over a foreign write, the own echo arriving before the answer', async () => {
    const { actor, clock, files, shows } = await storeBacked();
    for (const adapter of ['workbench', 'viewer'] as const) {
      actor.send({ type: 'adapterAttaching', adapter });
      actor.send({ type: 'adapterAttached', adapter });
    }
    actor.send({ type: 'personEdited', adapter: 'viewer', node: viewer('front', 'top') });
    files.replace(layout(['front'], panes('parameters', 'export')));
    actor.send({ type: 'recordInvalidated' });
    await flush();
    clock.advance(500);
    await flush();
    expect(await flushWorkbenchLayout(actor)).toBe(true);
    await flush();
    // The rebase is a publication the arrangement does not hold yet: the viewer takes its apply.
    const { pending } = actor.getSnapshot().context;
    expect(pending).toBeDefined();
    actor.send({ type: 'applyTaken', adapter: 'viewer', applyId: pending!.applyId });
    for (const event of shows) {
      actor.send({ type: 'adapterShown', adapter: event.adapter, showId: event.showId });
    }
    const merged = layout(['front', 'top'], panes('parameters', 'export'));
    expect(files.writes.at(-1)).toBe(workbenchRecords.layout.serialize(merged));
    expect(selectArrangement(actor.getSnapshot())).toEqual(merged);
    expect(selectAppliedLayoutDigest(actor.getSnapshot())).toMatch(/^sha256:/u);
    actor.stop();
  });

  it('should restore over the digest of a written edit', async () => {
    const { actor, shows } = await storeBacked();
    for (const adapter of ['workbench', 'viewer'] as const) {
      actor.send({ type: 'adapterAttaching', adapter });
      actor.send({ type: 'adapterAttached', adapter });
    }
    actor.send({ type: 'personEdited', adapter: 'viewer', node: viewer('front', 'top') });
    expect(await flushWorkbenchLayout(actor)).toBe(true);
    await flush();
    const digest = selectArrangementDigest(actor.getSnapshot());
    expect(digest).toBe(actor.getSnapshot().context.latest?.digest);
    actor.send({ type: 'restore', restoreId: 'r1', expected: digest!, layout: stored });
    await flush();
    expect(selectRestoreOutcome(actor.getSnapshot(), 'r1')).toBe('applied');
    expect(selectArrangement(actor.getSnapshot())).toEqual(stored);
    for (const event of shows) {
      actor.send({ type: 'adapterShown', adapter: event.adapter, showId: event.showId });
    }
    expect(selectAppliedLayoutDigest(actor.getSnapshot())).toBe(selectArrangementDigest(actor.getSnapshot()));
    actor.stop();
  });

  it('should refuse a restore a foreign write overtook before its reply, and converge on the record', async () => {
    const { actor, files, shows } = await storeBacked();
    for (const adapter of ['workbench', 'viewer'] as const) {
      actor.send({ type: 'adapterAttaching', adapter });
      actor.send({ type: 'adapterAttached', adapter });
    }
    const offers: number[] = [];
    actor.on('applyOffered', (event) => {
      offers.push(event.applyId);
    });
    files.holdReplies();
    actor.send({
      type: 'restore',
      restoreId: 'r1',
      expected: selectArrangementDigest(actor.getSnapshot())!,
      layout: foreign,
    });
    await flush();
    // Another writer replaces the file after the restore landed, and the watch read completes before its reply.
    const other = layout(['top']);
    files.replace(other);
    actor.send({ type: 'recordInvalidated' });
    await flush();
    files.releaseWrites();
    await flush();
    await flush();
    expect(selectRestoreOutcome(actor.getSnapshot(), 'r1')).toBe('refused');
    expect(actor.getSnapshot().context.unwritten).toBe(false);
    actor.send({ type: 'applyTaken', adapter: 'viewer', applyId: offers.at(-1)! });
    for (const event of shows) {
      actor.send({ type: 'adapterShown', adapter: event.adapter, showId: event.showId });
    }
    expect(selectArrangement(actor.getSnapshot())).toEqual(other);
    expect(selectAppliedLayoutDigest(actor.getSnapshot())).toMatch(/^sha256:/u);
    actor.stop();
  });

  it('should apply a foreign write that made a restore conflict, and restore over it afterwards', async () => {
    const { actor, files, shows } = await storeBacked();
    for (const adapter of ['workbench', 'viewer'] as const) {
      actor.send({ type: 'adapterAttaching', adapter });
      actor.send({ type: 'adapterAttached', adapter });
    }
    const offers: number[] = [];
    actor.on('applyOffered', (event) => {
      offers.push(event.applyId);
    });
    files.holdWrites();
    actor.send({
      type: 'restore',
      restoreId: 'r1',
      expected: selectArrangementDigest(actor.getSnapshot())!,
      layout: foreign,
    });
    await flush();
    const other = layout(['top']);
    files.replace(other);
    actor.send({ type: 'recordInvalidated' });
    await flush();
    files.releaseWrites();
    await flush();
    await flush();
    expect(selectRestoreOutcome(actor.getSnapshot(), 'r1')).toBe('refused');
    expect(actor.getSnapshot().context.unwritten).toBe(false);
    actor.send({ type: 'applyTaken', adapter: 'viewer', applyId: offers.at(-1)! });
    for (const event of shows) {
      actor.send({ type: 'adapterShown', adapter: event.adapter, showId: event.showId });
    }
    expect(selectArrangement(actor.getSnapshot())).toEqual(other);
    actor.send({
      type: 'restore',
      restoreId: 'r2',
      expected: selectArrangementDigest(actor.getSnapshot())!,
      layout: stored,
    });
    await flush();
    expect(selectRestoreOutcome(actor.getSnapshot(), 'r2')).toBe('applied');
    actor.stop();
  });

  it('should acknowledge the own echo of a written edit without applying it', async () => {
    const { actor, files, shows } = await storeBacked();
    for (const adapter of ['workbench', 'viewer'] as const) {
      actor.send({ type: 'adapterAttaching', adapter });
      actor.send({ type: 'adapterAttached', adapter });
    }
    actor.send({ type: 'personEdited', adapter: 'viewer', node: viewer('front', 'top') });
    expect(await flushWorkbenchLayout(actor)).toBe(true);
    await flush();
    expect(files.writes).toHaveLength(1);
    for (const event of shows) {
      actor.send({ type: 'adapterShown', adapter: event.adapter, showId: event.showId });
    }
    expect(selectAppliedLayoutDigest(actor.getSnapshot())).toMatch(/^sha256:/u);
    expect(selectArrangement(actor.getSnapshot())?.viewer).toEqual(viewer('front', 'top'));
    actor.stop();
  });
});

describe('totality', () => {
  const sample = layout(['front']);
  const samples: Record<WorkbenchLayoutEvent['type'], WorkbenchLayoutEvent> = {
    recordPublished: {
      type: 'recordPublished',
      layout: sample,
      digest: 'sha256:x',
      origin: 'foreign',
      refusal: undefined,
      owed: false,
    },
    recordEditAnswered: { type: 'recordEditAnswered', editCount: 1, ok: true },
    recordRestoreAnswered: { type: 'recordRestoreAnswered', restoreId: 'r1', ok: true },
    recordFlushAnswered: { type: 'recordFlushAnswered', requestId: 'f1', ok: true },
    recordHealthChanged: {
      type: 'recordHealthChanged',
      health: { read: 'ok', unconfirmed: false, writing: false, error: undefined },
    },
    recordFailed: { type: 'recordFailed', message: 'failed' },
    recordInvalidated: { type: 'recordInvalidated' },
    flush: { type: 'flush', requestId: 'f1' },
    adapterAttaching: { type: 'adapterAttaching', adapter: 'viewer' },
    adapterAttached: { type: 'adapterAttached', adapter: 'viewer' },
    adapterDetached: { type: 'adapterDetached', adapter: 'viewer' },
    adapterShown: { type: 'adapterShown', adapter: 'viewer', showId: 1 },
    applyTaken: { type: 'applyTaken', adapter: 'viewer', applyId: 1 },
    personEdited: { type: 'personEdited', adapter: 'viewer', node: viewer('top') },
    lanesEdited: { type: 'lanesEdited', lanes: { chat: false, workbench: true } },
    workbenchLaneChanged: { type: 'workbenchLaneChanged', open: false },
    lanesApplied: { type: 'lanesApplied', lanes: { chat: true, workbench: true } },
    lanesSeeded: { type: 'lanesSeeded', lanes: { chat: true, workbench: false } },
    deviceChanged: { type: 'deviceChanged', device: 'phone' },
    routeChanged: { type: 'routeChanged', routeKey: 'route-2' },
    intent: { type: 'intent', intentId: 'i1', source: 'person', target: modelPane },
    intentApplied: { type: 'intentApplied', intentId: 'i1', deliveryId: 1, node: panes('model') },
    intentUnavailable: { type: 'intentUnavailable', intentId: 'i1' },
    restore: { type: 'restore', restoreId: 'r1', expected: 'sha256:x', layout: sample },
  };
  const events = [
    ...Object.values(samples),
    { type: 'adapterAttaching', adapter: 'workbench' },
    { type: 'adapterAttached', adapter: 'workbench' },
    { type: 'adapterDetached', adapter: 'workbench' },
  ] as WorkbenchLayoutEvent[];
  const pathOptions = {
    input: { device: 'desktop', adapters: ['workbench', 'viewer'], routeKey: 'route-1', workbenchOpen: true },
    events,
    limit: 10_000,
    serializeState: (snapshot: AnyMachineSnapshot) => JSON.stringify(snapshot.value),
  };

  it('should list every public event type', () => {
    expect([...workbenchLayoutEventTypes].sort()).toEqual(Object.keys(samples).sort());
  });

  it('should reach every state', () => {
    expect(unreachedStates(workbenchLayoutMachine, pathOptions)).toEqual([]);
  });

  it('should answer every sampled event in every state', () => {
    expect(unansweredEvents(workbenchLayoutMachine, { ...pathOptions, ignore: workbenchLayoutIgnoredEvents })).toEqual(
      [],
    );
  });
});
