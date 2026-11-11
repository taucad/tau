/**
 * The view-record binding against a real camera on a `StepClock`, with scripted graphics and framing owners that record
 * what the binding sends them. The first eight rows are G0.3's settle-window rows from `use-view-settings-sync.test.tsx`
 * re-homed (graphics event-driven state charter, G6); that file stays until the wiring lane (G6b) deletes the hook. Two
 * of them flip deliberately: a foreign pose mid-drag is dropped and the drag's pose saved (D15), and an automatic refit
 * is not saved (D20, D14's named change).
 *
 * Path table (the shortest path to each state), kept current with `pathTable`:
 *
 * 1. `{camera: awaitingFrame, section: settled}`: initial
 * 2. `{camera: awaitingFrame, section: editing}`: `sectionEdited`
 * 3. `{camera: framed, section: settled}`: `cameraChanged`
 * 4. `{camera: framed, section: editing}`: `sectionEdited`, `cameraChanged`
 */
import { createCameraView } from '@taucad/camera';
import type { CameraBounds } from '@taucad/camera';
import { cameraIgnoredEvents, createCameraActor } from '@taucad/camera/machine';
import type { CameraMachineEvent, CameraPose } from '@taucad/camera/machine';
import { workbenchRecords } from '@taucad/workbench';
import type { WorkbenchView } from '@taucad/workbench';
import type { PersistedSectionView } from '@taucad/viewer/graphics/graphics-settings';
import { StepClock } from '@taucad/xstate-testing/clock';
import { createFakeCallbackActors } from '@taucad/xstate-testing/fakes';
import { guardActors } from '@taucad/xstate-testing/inspect';
import { pathTable, unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';
import { afterEach, describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import type { AnyMachineSnapshot } from 'xstate';
import { ownersOf } from '#workbench-records/view-record-binding-changes.js';
import type { ViewGraphicsAdoption } from '#workbench-records/view-record-binding-changes.js';
import { createViewRecordBindingActor } from '#workbench-records/view-record-binding.js';
import {
  viewRecordBindingEventTypes,
  viewRecordBindingIgnoredEvents,
  viewRecordBindingMachine,
} from '#workbench-records/view-record-binding.machine.js';
import type {
  ViewBindingCameraRef,
  ViewBindingFramingEvent,
  ViewBindingFramingRef,
  ViewBindingGraphicsRef,
  ViewRecordBindingEvent,
  ViewRecordBindingInput,
} from '#workbench-records/view-record-binding.machine.js';

const settle = 250;
const box = (half: number): CameraBounds => ({ min: [-half, -half, -half], max: [half, half, half] });
const initial = (): WorkbenchView =>
  workbenchRecords.view.schema.parse({
    version: 1,
    entryPath: 'src/main.ts',
    camera: { kind: 'preset', preset: 'isometric' },
  });
const pose = (direction: [number, number, number], verticalSpan: number) =>
  ({
    kind: 'pose',
    frameId: 'binding-test',
    target: [0, 0, 0],
    direction,
    up: [0, 0, 1],
    verticalSpan,
    perspectiveZoom: 1,
  }) as const;
const posed = (record: WorkbenchView, camera: ReturnType<typeof pose>): WorkbenchView =>
  workbenchRecords.view.schema.parse({ ...record, camera });
const cameraPose = (direction: [number, number, number], verticalSpan: number): CameraPose => ({
  target: [0, 0, 0],
  direction,
  up: [0, 0, 1],
  verticalSpan,
});

/* One guard per test over every actor the test starts (MC-R23). */
let current: { test: string | undefined; guard: ReturnType<typeof guardActors> } | undefined;
const testGuard = (): ReturnType<typeof guardActors> => {
  const test = expect.getState().currentTestName;
  if (current === undefined || current.test !== test || test === undefined) {
    current = {
      test,
      guard: guardActors({
        ignore: { viewRecordBinding: viewRecordBindingIgnoredEvents, camera: cameraIgnoredEvents },
      }),
    };
  }
  return current.guard;
};

/**
 * The binding with a real camera and scripted graphics and framing. The host glue is what G6b wires: the camera's
 * revisions become `cameraChanged`, and its adoption answers are forwarded.
 */
function mount(options: Readonly<{ record?: WorkbenchView; framed?: boolean }> = {}) {
  const clock = new StepClock();
  const guard = testGuard();
  const camera = createCameraActor({
    input: {
      initialView: createCameraView({
        frameId: 'binding-test',
        requestedVerticalFieldOfView: 45,
        perspectiveZoom: 1,
        target: [0, 0, 0],
        direction: [1, -1, 1],
        up: [0, 0, 1],
        verticalSpan: 10,
        bounds: box(1),
        viewport: { width: 800, height: 600, pixelRatio: 2 },
      }),
    },
    clock,
    inspect: guard.inspect,
  }).start();
  const fakes = createFakeCallbackActors();
  const graphics = createActor(fakes.actor('graphics'), { inspect: guard.inspect }).start();
  const framing = createActor(fakes.actor('framing'), { inspect: guard.inspect }).start();
  const record = options.record ?? initial();
  const edits: WorkbenchView[] = [];
  const binding = createViewRecordBindingActor({
    input: {
      graphics: graphics as unknown as ViewBindingGraphicsRef,
      camera: camera as unknown as ViewBindingCameraRef,
      framing: framing as unknown as ViewBindingFramingRef,
      entryPath: 'src/main.ts',
      owners: ownersOf(record),
    },
    edit: async (next) => {
      edits.push(next);
      return true;
    },
    clock,
    inspect: guard.inspect,
  });
  binding.start();
  let { revision } = camera.getSnapshot().context;
  camera.subscribe(({ context }) => {
    if (context.revision === revision) {
      return;
    }
    ({ revision } = context);
    const { frameId, target, direction, up, verticalSpan, perspectiveZoom, requestedVerticalFieldOfView } =
      context.view;
    binding.send({
      type: 'cameraChanged',
      change: context.lastChange,
      pose: { frameId, target, direction, up, verticalSpan, perspectiveZoom },
      verticalFieldOfView: requestedVerticalFieldOfView,
    });
  });
  const answers: string[] = [];
  camera.on('adoptionApplied', (event) => {
    answers.push(`applied:${event.requestId}`);
    binding.send(event);
  });
  camera.on('adoptionDropped', (event) => {
    answers.push(`dropped:${event.requestId}`);
    binding.send(event);
  });
  const applied: WorkbenchView[] = [];
  binding.on('recordApplied', ({ record: appliedRecord }) => {
    applied.push(appliedRecord);
  });
  const sent = (owner: 'graphics' | 'framing') =>
    fakes.deliveries.filter(({ name }) => name === owner).map(({ event }) => event);
  const publish = (next: WorkbenchView, origin: 'own' | 'foreign' = 'foreign', patch?: Record<string, unknown>) => {
    binding.send({ type: 'recordPublished', record: next, origin, patch });
  };
  if (options.framed ?? true) {
    camera.send({ type: 'frameGeometry', bounds: box(2), margin: 0.1, source: 'framing' });
  }
  publish(record);
  const view = () => camera.getSnapshot().context.view;
  const drag = (direction: [number, number, number], verticalSpan: number) => {
    camera.send({ type: 'poseObserved', source: 'input', ...cameraPose(direction, verticalSpan) });
  };
  const poseEdits = () => edits.map((next) => next.camera).filter((cameraField) => cameraField.kind === 'pose');
  return {
    binding,
    camera,
    clock,
    edits,
    poseEdits,
    applied,
    answers,
    graphicsSent: () => sent('graphics') as ViewGraphicsAdoption[],
    framingSent: () => sent('framing') as ViewBindingFramingEvent[],
    publish,
    view,
    drag,
    release: () => {
      camera.send({ type: 'interactionEnded' });
    },
    press: () => {
      camera.send({ type: 'interactionStarted' });
    },
    send: (event: CameraMachineEvent) => {
      camera.send(event);
    },
    guard,
  };
}

const samples: Record<ViewRecordBindingEvent['type'], readonly ViewRecordBindingEvent[]> = {
  recordPublished: [
    { type: 'recordPublished', record: initial(), origin: 'foreign', patch: undefined },
    { type: 'recordPublished', record: initial(), origin: 'own', patch: { camera: initial().camera } },
  ],
  ownersChanged: [{ type: 'ownersChanged', owners: { gridUnit: 'in' } }],
  sectionEdited: [{ type: 'sectionEdited' }],
  sectionSettled: [{ type: 'sectionSettled', section: { active: false, cuts: [] } }],
  cameraChanged: [
    {
      type: 'cameraChanged',
      change: { source: 'framing', revision: 1 },
      pose: { ...pose([0, 0, 1], 4) },
      verticalFieldOfView: 45,
    },
  ],
  adoptionApplied: [{ type: 'adoptionApplied', requestId: 'view-binding-1', revision: 2 }],
  adoptionDropped: [{ type: 'adoptionDropped', requestId: 'view-binding-1', reason: 'dragging' }],
};
const scripted = createFakeCallbackActors();
const pathOptions = {
  input: {
    graphics: createActor(scripted.actor('graphics')) as unknown as ViewBindingGraphicsRef,
    camera: createActor(scripted.actor('camera')) as unknown as ViewBindingCameraRef,
    framing: createActor(scripted.actor('framing')) as unknown as ViewBindingFramingRef,
    entryPath: 'src/main.ts',
    owners: ownersOf(initial()),
  } satisfies ViewRecordBindingInput,
  events: Object.values(samples).flat(),
  limit: 200,
  serializeState: (snapshot: AnyMachineSnapshot) => JSON.stringify(snapshot.value),
};

describe('view record binding', () => {
  afterEach(() => {
    // No dead letter, unanswered event or fault in any actor a row started.
    expect(current?.guard.take() ?? []).toEqual([]);
  });

  describe('re-homed from the use-view-settings-sync settle-window rows', () => {
    it('should drop a foreign pose that arrives mid-drag and save the drag pose over it (D15; today row flipped)', () => {
      const harness = mount();
      harness.press();
      harness.drag([1, 0, 0], 4);
      harness.edits.length = 0;
      const foreign = posed(initial(), pose([0, 1, 0], 9));
      harness.publish(foreign);
      expect(harness.view().direction).toEqual([1, 0, 0]);
      for (let step = 1; step <= 10; step += 1) {
        harness.clock.advance(50);
        harness.drag([1, 0, 0], 4 + step / 10);
        expect(harness.view().direction).toEqual([1, 0, 0]);
      }
      harness.release();
      harness.clock.advance(settle * 4);
      expect(harness.view()).toMatchObject({ direction: [1, 0, 0], verticalSpan: 5 });
      // The drop re-saved the pose the person held, and every later write is the person's: the foreign pose never is.
      expect(harness.poseEdits().at(0)).toMatchObject({ direction: [1, 0, 0], verticalSpan: 4 });
      expect(harness.poseEdits().at(-1)).toMatchObject({ direction: [1, 0, 0], verticalSpan: 5 });
      expect(harness.poseEdits().some((camera) => camera.direction[1] === 1)).toBe(false);
    });

    it('should apply a foreign pose at once while the camera is idle', () => {
      const harness = mount();
      harness.clock.advance(settle * 4);
      harness.publish(posed(initial(), pose([0, 1, 0], 9)));
      expect(harness.view()).toMatchObject({ direction: [0, 1, 0], verticalSpan: 9 });
      expect(harness.camera.getSnapshot().context.lastChange.source).toBe('persisted');
    });

    it('should never write an adopted pose back over the foreign instruction it came from', () => {
      const harness = mount();
      harness.clock.advance(settle * 4);
      const foreign = workbenchRecords.view.schema.parse({ ...initial(), camera: { kind: 'preset', preset: 'front' } });
      harness.publish(foreign);
      expect(harness.view().direction).toEqual([0, -1, 0]);
      harness.clock.advance(settle * 4);
      expect(harness.edits).toEqual([]);
      // A later owner edit keeps the instruction, not the pose the camera made of it.
      harness.binding.send({ type: 'ownersChanged', owners: { gridUnit: 'in' } });
      expect(harness.edits.map((next) => next.camera)).toEqual([foreign.camera]);
    });

    it('should never apply an own echo while a newer local pose is live', () => {
      const harness = mount();
      harness.drag([1, 0, 0], 4);
      const echoed = harness.edits.at(-1)!;
      expect(echoed.camera).toMatchObject({ kind: 'pose', verticalSpan: 4 });
      harness.drag([1, 0, 0], 2);
      harness.publish(echoed, 'own', { camera: echoed.camera });
      for (let elapsed = 0; elapsed < settle * 4; elapsed += 50) {
        harness.clock.advance(50);
        expect(harness.view().verticalSpan).toBe(2);
      }
      expect(harness.camera.getSnapshot().context.lastChange.source).toBe('input');
    });

    it('should leave a live pose alone when a foreign grid-only edit arrives during a drag', () => {
      const base = posed(initial(), pose([0, 1, 0], 9));
      const harness = mount({ record: base });
      harness.press();
      harness.drag([1, 0, 0], 4);
      const asked = harness.answers.length;
      harness.publish({ ...base, grid: { unit: 'in' } });
      expect(harness.graphicsSent()).toContainEqual({ type: 'setGridUnit', payload: { unit: 'in' } });
      // A grid-only record asks the camera for nothing.
      expect(harness.answers).toHaveLength(asked);
      for (let elapsed = 0; elapsed < settle * 4; elapsed += 50) {
        harness.clock.advance(50);
        expect(harness.view()).toMatchObject({ direction: [1, 0, 0], verticalSpan: 4 });
      }
      expect(harness.poseEdits().some((camera) => camera.verticalSpan === 4)).toBe(true);
    });

    it('should never write the first automatic frame', () => {
      const harness = mount({ framed: false });
      harness.send({ type: 'frameGeometry', bounds: box(2), margin: 0.1, source: 'framing' });
      harness.clock.advance(settle * 4);
      expect(harness.binding.getSnapshot().value).toMatchObject({ camera: 'framed' });
      expect(harness.edits).toEqual([]);
    });

    it('should not save an automatic refit after the bounds grow (D20; today row flipped)', () => {
      const harness = mount();
      harness.clock.advance(settle * 4);
      const firstFrame = harness.view();
      harness.send({ type: 'frameGeometry', bounds: box(8), margin: 0.1, source: 'framing' });
      expect(harness.view().verticalSpan).toBeGreaterThan(firstFrame.verticalSpan);
      harness.clock.advance(settle * 4);
      expect(harness.edits).toEqual([]);
    });

    it('should save a Fit view the person commanded (kept by D20)', () => {
      const harness = mount();
      harness.drag([1, 0, 0], 40);
      harness.clock.advance(settle * 4);
      harness.edits.length = 0;
      harness.send({ type: 'frameGeometry', bounds: box(2), margin: 0.1, source: 'fit' });
      const fitted = harness.view();
      expect(fitted.verticalSpan).toBeLessThan(40);
      expect(harness.poseEdits().at(-1)).toMatchObject({ verticalSpan: fitted.verticalSpan });
    });
  });

  describe('acknowledgement', () => {
    it('should acknowledge a combined camera and section adoption once, after both owners adopted it', () => {
      const harness = mount();
      harness.clock.advance(settle * 4);
      expect(harness.applied).toEqual([initial()]);
      harness.applied.length = 0;
      const sentBefore = harness.graphicsSent().length;
      harness.binding.send({ type: 'sectionEdited' });
      const changed = workbenchRecords.view.schema.parse({
        ...initial(),
        camera: { kind: 'preset', preset: 'front' },
        section: { active: true, cuts: [{ kind: 'plane', plane: 'xz', offset: 2, isFlipped: false }] },
      });
      harness.publish(changed);
      // The camera applied at once; the section waits for the person to stop editing cuts.
      expect(harness.view().direction).toEqual([0, -1, 0]);
      expect(harness.applied).toEqual([]);
      expect(
        harness
          .graphicsSent()
          .slice(sentBefore)
          .some(({ type }) => type === 'adoptSectionView'),
      ).toBe(false);
      harness.binding.send({ type: 'sectionSettled', section: { active: false, cuts: [] } });
      expect(harness.graphicsSent().at(-1)).toEqual({ type: 'adoptSectionView', section: changed.section });
      expect(harness.applied).toEqual([changed]);
      // The person's cuts gave way to the foreign section, so nothing is written for it.
      expect(harness.edits).toEqual([]);
      harness.publish(changed);
      expect(harness.applied).toEqual([changed, changed]);
    });

    it('should hand a record pose to framing before the first frame and acknowledge on the camera answer', () => {
      const saved = posed(initial(), pose([0, 1, 0], 9));
      const harness = mount({ framed: false, record: saved });
      expect(harness.framingSent()).toEqual([
        {
          type: 'entryChanged',
          identity: 'src/main.ts',
          pendingPose: { requestId: 'view-binding-1', pose: { ...cameraPose([0, 1, 0], 9), perspectiveZoom: 1 } },
        },
      ]);
      // The other record fields went to the camera at once, in their own adoption.
      expect(harness.applied).toEqual([]);
      // What G5's framing actor does after the first frame.
      harness.send({ type: 'frameGeometry', bounds: box(2), margin: 0.1, source: 'framing' });
      harness.send({ type: 'adoptPersistedPose', requestId: 'view-binding-1', pose: cameraPose([0, 1, 0], 9) });
      expect(harness.view()).toMatchObject({ direction: [0, 1, 0], verticalSpan: 9 });
      expect(harness.applied).toEqual([saved]);
      expect(harness.edits).toEqual([]);
    });
  });

  describe('review round 1 rows', () => {
    it('should carry a waiting foreign section in an edit made while cuts are edited', () => {
      const harness = mount();
      harness.binding.send({ type: 'sectionEdited' });
      const section: PersistedSectionView = {
        active: true,
        cuts: [{ kind: 'plane', plane: 'xz', offset: 2, isFlipped: false }],
      };
      harness.publish(workbenchRecords.view.schema.parse({ ...initial(), section }));
      harness.binding.send({ type: 'ownersChanged', owners: { gridUnit: 'in' } });
      expect(harness.edits.at(-1)).toMatchObject({ section, grid: { unit: 'in' } });
    });

    it('should keep waiting for a pose framing holds when a later record changes only the field of view', () => {
      const harness = mount({ framed: false, record: posed(initial(), pose([0, 1, 0], 9)) });
      harness.clock.advance(settle * 4);
      const later = workbenchRecords.view.schema.parse({ ...posed(initial(), pose([0, 1, 0], 9)), fieldOfView: 30 });
      harness.publish(later);
      expect(harness.applied).toEqual([]);
      harness.send({ type: 'frameGeometry', bounds: box(2), margin: 0.1, source: 'framing' });
      harness.send({ type: 'adoptPersistedPose', requestId: 'view-binding-1', pose: cameraPose([0, 1, 0], 9) });
      expect(harness.applied).toEqual([later]);
    });

    it('should send a later record pose to framing while the first frame is still to come, even after a drag', () => {
      const harness = mount({ framed: false, record: posed(initial(), pose([0, 1, 0], 9)) });
      harness.drag([1, 0, 0], 4);
      harness.clock.advance(settle * 4);
      harness.publish(posed(initial(), pose([1, 1, 0], 6)));
      expect(harness.binding.getSnapshot().value).toMatchObject({ camera: 'awaitingFrame' });
      expect(harness.framingSent().at(-1)).toMatchObject({
        type: 'entryChanged',
        pendingPose: { pose: { direction: [1, 1, 0], verticalSpan: 6 } },
      });
    });

    it('should keep the person settings and pose across a file that went missing and came back', () => {
      const harness = mount();
      harness.binding.send({ type: 'recordPublished', record: undefined, origin: 'foreign', patch: undefined });
      harness.binding.send({ type: 'ownersChanged', owners: { gridUnit: 'in' } });
      harness.drag([1, 0, 0], 4);
      // The edits recreate the file over the last record.
      expect(harness.edits.at(-1)).toMatchObject({ grid: { unit: 'in' }, camera: { direction: [1, 0, 0] } });
      const sent = harness.graphicsSent().length;
      harness.clock.advance(settle * 4);
      harness.publish(harness.edits.at(-1)!, 'own', { grid: { unit: 'in' } });
      expect(harness.graphicsSent()).toHaveLength(sent);
      expect(harness.view().direction).toEqual([1, 0, 0]);
    });

    it('should not ask the camera to adopt a pose it would refuse, so acknowledgement is not stuck', () => {
      const harness = mount();
      harness.clock.advance(settle * 4);
      harness.applied.length = 0;
      const refused = workbenchRecords.view.schema.parse({
        ...initial(),
        camera: { ...pose([0, 0, 1], 9), up: [0, 0, 1] },
      });
      harness.publish(refused);
      expect(harness.applied).toEqual([refused]);
      const gridOnly = workbenchRecords.view.schema.parse({ ...refused, grid: { unit: 'in' } });
      harness.publish(gridOnly);
      expect(harness.applied).toEqual([refused, gridOnly]);
    });
  });

  describe('review round 2 rows', () => {
    it('should still adopt a waiting foreign section when an own write carries it', () => {
      const harness = mount();
      harness.binding.send({ type: 'sectionEdited' });
      const section: PersistedSectionView = {
        active: true,
        cuts: [{ kind: 'plane', plane: 'xz', offset: 2, isFlipped: false }],
      };
      const foreign = workbenchRecords.view.schema.parse({ ...initial(), section });
      harness.publish(foreign);
      harness.binding.send({ type: 'ownersChanged', owners: { gridUnit: 'in' } });
      // The edit made while the section waited lands as own, carrying the foreign section in its patch.
      harness.publish(harness.edits.at(-1)!, 'own', { section, grid: { unit: 'in' } });
      const sent = harness.graphicsSent().length;
      const edits = harness.edits.length;
      harness.binding.send({ type: 'sectionSettled', section: { active: false, cuts: [] } });
      expect(harness.graphicsSent().slice(sent)).toEqual([{ type: 'adoptSectionView', section }]);
      expect(harness.edits).toHaveLength(edits);
    });

    it('should not acknowledge a record whose pose the camera dropped', () => {
      const harness = mount();
      harness.applied.length = 0;
      harness.press();
      harness.drag([1, 0, 0], 4);
      const foreign = posed(initial(), pose([0, 1, 0], 9));
      harness.publish(foreign);
      expect(harness.answers.at(-1)).toMatch(/^dropped:/u);
      harness.release();
      harness.clock.advance(settle * 4);
      expect(harness.applied).toEqual([]);
    });
  });

  describe('review round 3 rows', () => {
    it('should write no pose before the first frame, so the record pose framing holds is the one on file', () => {
      const saved = posed(initial(), pose([0, 1, 0], 9));
      const harness = mount({ framed: false, record: saved });
      harness.drag([1, 0, 0], 4);
      harness.clock.advance(settle * 4);
      expect(harness.poseEdits()).toEqual([]);
      harness.send({ type: 'frameGeometry', bounds: box(2), margin: 0.1, source: 'framing' });
      harness.send({ type: 'adoptPersistedPose', requestId: 'view-binding-1', pose: cameraPose([0, 1, 0], 9) });
      expect(harness.view()).toMatchObject({ direction: [0, 1, 0], verticalSpan: 9 });
      expect(harness.poseEdits()).toEqual([]);
      expect(harness.applied).toEqual([saved]);
    });

    it('should not acknowledge a dropped record when it is published again unchanged', () => {
      const harness = mount();
      harness.applied.length = 0;
      harness.press();
      harness.drag([1, 0, 0], 4);
      const foreign = posed(initial(), pose([0, 1, 0], 9));
      harness.publish(foreign);
      harness.publish(structuredClone(foreign));
      expect(harness.applied).toEqual([]);
    });

    it('should drop a waiting foreign section when its record goes missing', () => {
      const harness = mount();
      harness.binding.send({ type: 'sectionEdited' });
      const section: PersistedSectionView = {
        active: true,
        cuts: [{ kind: 'plane', plane: 'xz', offset: 2, isFlipped: false }],
      };
      harness.publish(workbenchRecords.view.schema.parse({ ...initial(), section }));
      harness.binding.send({ type: 'recordPublished', record: undefined, origin: 'foreign', patch: undefined });
      const sent = harness.graphicsSent().length;
      const mine: PersistedSectionView = {
        active: true,
        cuts: [{ kind: 'plane', plane: 'xy', offset: 1, isFlipped: false }],
      };
      harness.binding.send({ type: 'sectionSettled', section: mine });
      expect(harness.graphicsSent()).toHaveLength(sent);
      expect(harness.edits.at(-1)?.section).toEqual(mine);
    });
  });

  describe('review round 4 rows', () => {
    it('should save a person field of view set before the first frame', () => {
      const harness = mount({ framed: false });
      harness.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 20 });
      expect(harness.edits.at(-1)).toMatchObject({ fieldOfView: 20, camera: initial().camera });
      harness.send({ type: 'frameGeometry', bounds: box(2), margin: 0.1, source: 'framing' });
      harness.binding.send({ type: 'ownersChanged', owners: { gridUnit: 'in' } });
      expect(harness.edits.at(-1)).toMatchObject({ fieldOfView: 20, grid: { unit: 'in' } });
    });

    it('should not acknowledge a later record that keeps a camera the view dropped', () => {
      const harness = mount();
      harness.press();
      harness.drag([1, 0, 0], 4);
      harness.release();
      // An automatic refit: the camera's pose is machine-made, so the drop below re-saves nothing.
      harness.send({ type: 'frameGeometry', bounds: box(8), margin: 0.1, source: 'framing' });
      harness.applied.length = 0;
      const dropped = posed(initial(), pose([0, 1, 0], 9));
      harness.publish(dropped);
      harness.publish(workbenchRecords.view.schema.parse({ ...dropped, grid: { unit: 'in' } }));
      expect(harness.applied).toEqual([]);
      expect(harness.graphicsSent().at(-1)).toEqual({ type: 'setGridUnit', payload: { unit: 'in' } });
    });
  });

  describe('camera rule', () => {
    it('should re-save on adoptionDropped only when a person made the pose', () => {
      const person = mount();
      person.press();
      person.drag([1, 0, 0], 4);
      person.release();
      person.edits.length = 0;
      person.publish(posed(initial(), pose([0, 1, 0], 9)));
      expect(person.camera.getSnapshot().value).toMatchObject({ input: 'settling' });
      expect(person.poseEdits()).toEqual([expect.objectContaining({ direction: [1, 0, 0], verticalSpan: 4 })]);

      const machine = mount();
      machine.press();
      machine.drag([1, 0, 0], 4);
      machine.release();
      // An automatic refit inside the settle window: the camera's pose is now machine-made.
      machine.send({ type: 'frameGeometry', bounds: box(8), margin: 0.1, source: 'framing' });
      machine.edits.length = 0;
      machine.publish(posed(initial(), pose([0, 1, 0], 9)));
      expect(machine.camera.getSnapshot().value).toMatchObject({ input: 'settling' });
      expect(machine.edits).toEqual([]);
    });

    it('should keep the drag pose captured with its change when a viewport change follows it', () => {
      const harness = mount();
      harness.press();
      harness.drag([1, 0, 0], 4);
      harness.send({ type: 'setViewport', viewport: { width: 400, height: 300, pixelRatio: 2 } });
      harness.release();
      harness.edits.length = 0;
      harness.publish(posed(initial(), pose([0, 1, 0], 9)));
      // `viewport` keeps the pose, so the pose a person made is still the one re-saved.
      expect(harness.poseEdits()).toEqual([expect.objectContaining({ direction: [1, 0, 0], verticalSpan: 4 })]);
    });

    it('should adopt foreign field of view and up direction through the camera adoption, not person commands', () => {
      const harness = mount();
      harness.clock.advance(settle * 4);
      harness.publish(workbenchRecords.view.schema.parse({ ...initial(), fieldOfView: 30, upDirection: 'y' }));
      expect(harness.camera.getSnapshot().context.lastChange.source).toBe('persisted');
      expect(harness.camera.getSnapshot().context.view.requestedVerticalFieldOfView).toBe(30);
      expect(harness.graphicsSent()).toContainEqual({ type: 'setUpDirection', payload: 'y' });
      expect(harness.edits).toEqual([]);
    });

    it('should write the person field of view with the pose', () => {
      const harness = mount();
      harness.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 20 });
      expect(harness.edits.at(-1)).toMatchObject({ fieldOfView: 20, camera: { kind: 'pose' } });
    });
  });

  describe('owners', () => {
    it('should never adopt an own publication (I6)', () => {
      const harness = mount();
      const before = harness.graphicsSent().length;
      harness.publish(workbenchRecords.view.schema.parse({ ...initial(), grid: { unit: 'in' } }), 'own', {
        grid: { unit: 'in' },
      });
      expect(harness.graphicsSent()).toHaveLength(before);
    });

    it('should edit the record when a person changes a setting, and not for an echo of the value held', () => {
      const harness = mount();
      harness.binding.send({ type: 'ownersChanged', owners: { gridUnit: 'in' } });
      expect(harness.edits.map((next) => next.grid.unit)).toEqual(['in']);
      harness.binding.send({ type: 'ownersChanged', owners: { gridUnit: 'in' } });
      expect(harness.edits).toHaveLength(1);
    });

    it('should keep a person setting not yet published when a foreign record changes another field', () => {
      const harness = mount();
      harness.binding.send({ type: 'ownersChanged', owners: { display: { ...initial().display, grid: false } } });
      harness.publish(workbenchRecords.view.schema.parse({ ...initial(), grid: { unit: 'in' } }));
      harness.binding.send({ type: 'ownersChanged', owners: { gridUnit: 'cm' } });
      expect(harness.edits.at(-1)).toMatchObject({ display: { grid: false }, grid: { unit: 'cm' } });
    });

    it('should not edit before the first record is published', () => {
      const scriptedOwners = createFakeCallbackActors();
      const edits: WorkbenchView[] = [];
      const binding = createViewRecordBindingActor({
        input: {
          graphics: createActor(scriptedOwners.actor('graphics')).start() as unknown as ViewBindingGraphicsRef,
          camera: createActor(scriptedOwners.actor('camera')).start() as unknown as ViewBindingCameraRef,
          framing: createActor(scriptedOwners.actor('framing')).start() as unknown as ViewBindingFramingRef,
          entryPath: 'src/main.ts',
          owners: ownersOf(initial()),
        },
        edit: async (next) => {
          edits.push(next);
          return true;
        },
        inspect: testGuard().inspect,
      }).start();
      binding.send({ type: 'ownersChanged', owners: { gridUnit: 'in' } });
      expect(edits).toEqual([]);
      binding.send({ type: 'recordPublished', record: initial(), origin: 'foreign', patch: undefined });
      binding.send({ type: 'ownersChanged', owners: { gridUnit: 'cm' } });
      expect(edits.map((next) => next.grid.unit)).toEqual(['cm']);
    });

    it('should keep a foreign section waiting while cuts are edited, until an own section supersedes it', () => {
      const harness = mount();
      const sentBefore = harness.graphicsSent().length;
      harness.binding.send({ type: 'sectionEdited' });
      const section: PersistedSectionView = {
        active: true,
        cuts: [{ kind: 'plane', plane: 'xz', offset: 2, isFlipped: false }],
      };
      harness.publish(workbenchRecords.view.schema.parse({ ...initial(), section }));
      const mine: PersistedSectionView = {
        active: true,
        cuts: [{ kind: 'plane', plane: 'xy', offset: 1, isFlipped: false }],
      };
      harness.publish(workbenchRecords.view.schema.parse({ ...initial(), section: mine }), 'own', { section: mine });
      harness.binding.send({ type: 'sectionSettled', section: mine });
      expect(
        harness
          .graphicsSent()
          .slice(sentBefore)
          .some(({ type }) => type === 'adoptSectionView'),
      ).toBe(false);
    });

    it('should write the settled section the person left', () => {
      const harness = mount();
      harness.binding.send({ type: 'sectionEdited' });
      const mine: PersistedSectionView = {
        active: true,
        cuts: [{ kind: 'plane', plane: 'xy', offset: 1, isFlipped: false }],
      };
      harness.binding.send({ type: 'sectionSettled', section: mine });
      expect(harness.edits.map((next) => next.section)).toEqual([mine]);
    });
  });

  describe('totality', () => {
    it('should list every public event type', () => {
      expect([...viewRecordBindingEventTypes].sort()).toEqual(Object.keys(samples).sort());
    });

    it('should reach every state, in the path table above', () => {
      expect(
        pathTable(viewRecordBindingMachine, pathOptions).map(({ state, events }) => [
          JSON.stringify(state),
          events.map(({ type }) => type),
        ]),
      ).toEqual([
        ['{"camera":"awaitingFrame","section":"settled"}', []],
        ['{"camera":"awaitingFrame","section":"editing"}', ['sectionEdited']],
        ['{"camera":"framed","section":"settled"}', ['cameraChanged']],
        ['{"camera":"framed","section":"editing"}', ['sectionEdited', 'cameraChanged']],
      ]);
      expect(unreachedStates(viewRecordBindingMachine, pathOptions)).toEqual([]);
    });

    it('should answer every sampled event in every state', () => {
      expect(
        unansweredEvents(viewRecordBindingMachine, { ...pathOptions, ignore: viewRecordBindingIgnoredEvents }),
      ).toEqual([]);
    });
  });
});
