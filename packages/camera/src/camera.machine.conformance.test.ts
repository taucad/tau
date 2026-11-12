/*
 * Conformance of `cameraMachine` to `specs/CameraAuthority.tla` (graphics event-driven state charter, G3;
 * formal-verification-policy FM-R13; xstate-policy MC-R6, MC-R27): forward replay of the TLC-exported covering suite on
 * the live camera actor, replay equality of every delivery it recorded, and the drift manifest.
 *
 * Refinement mapping (the spec's `cam`, the only field the camera owns):
 *
 * | Spec           | Camera                                                                                         |
 * | -------------- | ---------------------------------------------------------------------------------------------- |
 * | `cam.input`    | the `input` region's state                                                                     |
 * | `cam.revision` | `context.revision`                                                                             |
 * | `cam.source`   | `context.lastChange.source`                                                                    |
 * | `cam.pose`     | the id of the view's pose: everything in `context.view` but the viewport and the scene bounds. |
 * |                | A pose that changed takes the id the spec gives it (the revision, or the foreign pose's id);   |
 * |                | one that did not keeps its id.                                                                 |
 *
 * The spec's `PoseObserved` is a pose of a live gesture, so the harness holds a gesture before it sends the pose. A
 * pose with no held gesture is the spec's `PoseObserved` followed by `InteractionEnded` in one camera step; the
 * machine tests cover it.
 *
 * `RecordOwn`, `Landed` and `ForeignWrite` are the binding's and the store's steps. They send the camera nothing, and
 * the replay checks that the camera stayed where it was.
 */

import path from 'node:path';
import { readFileSync } from 'node:fs';

import { createCallbackLogic } from 'xstate';
import type { AnyEventObject } from 'xstate';
import { describe, expect, it } from 'vitest';
import {
  checkActionCorrespondence,
  driftManifestProblems,
  hashFiles,
  machineAlphabet,
  specOperators,
} from '@taucad/formal/drift';
import { readSpecGraph, suiteBehaviours } from '@taucad/formal/graph';
import type { CoveringSuite, SpecView } from '@taucad/formal/graph';
import { replayEquality, replaySuite } from '@taucad/formal/replay';
import type { ConformanceAdapter } from '@taucad/formal/replay';
import { StepClock } from '@taucad/xstate-testing/clock';
import { recordEmitted } from '@taucad/xstate-testing/fakes';
import { guardActors, recordTransitions } from '@taucad/xstate-testing/inspect';

import {
  cameraIgnoredEvents,
  cameraMachine,
  cameraPoseSettleMilliseconds,
  createCameraActor,
} from '#camera.machine.js';
import type { CameraDriverEvent, CameraDriverInput, CameraMachineEvent } from '#camera.machine.js';
import { createCameraView } from '#camera-domain.js';
import type { CameraView } from '#camera-domain.js';

const specs = path.resolve(import.meta.dirname, '../specs');
const graph = readSpecGraph(path.join(specs, 'CameraAuthority/graph.json'));
const suite = JSON.parse(readFileSync(path.join(specs, 'CameraAuthority/suite.json'), 'utf8')) as CoveringSuite;
const tla = readFileSync(path.join(specs, 'CameraAuthority.tla'), 'utf8');

const input = {
  initialView: createCameraView({
    frameId: 'test-root',
    requestedVerticalFieldOfView: 60,
    perspectiveZoom: 1,
    target: [0, 0, 0],
    direction: [1, -1, 0.7],
    up: [0, 0, 1],
    verticalSpan: 10,
    viewport: { width: 1280, height: 720, pixelRatio: 1 },
    bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
  }),
};

/* The spec's opening rig pose, and the pose of another party's k-th write (`ForeignPose(k)`). */
const rigPose = 0;
const foreignPose = (count: number): number => 100 + count;

const poseKey = ({ viewport: _viewport, bounds: _bounds, ...pose }: CameraView): string => JSON.stringify(pose);

const startHarness = () => {
  const clock = new StepClock();
  const guard = guardActors({ ignore: { camera: cameraIgnoredEvents } });
  const recorder = recordTransitions();
  const syncs: CameraDriverEvent[] = [];
  const driver = createCallbackLogic<CameraDriverEvent, CameraDriverInput>(({ receive }) => {
    receive((event) => {
      syncs.push(event);
    });
    return () => undefined;
  });
  const actor = createCameraActor({
    machine: cameraMachine.provide({ actors: { cameraDriver: driver } }),
    input,
    clock,
    inspect(event) {
      guard.inspect(event);
      recorder.inspect(event);
    },
  });
  const emitted = recordEmitted(actor);
  actor.start();
  return {
    actor,
    clock,
    emitted,
    recorder,
    syncs,
    /* The world around the camera: how many foreign writes happened, and the id of the camera's pose. */
    world: { foreignCount: 0, pose: rigPose, key: poseKey(actor.getSnapshot().context.view) },
  };
};

type Harness = ReturnType<typeof startHarness>;

/* The camera event for a spec step that carries a source, with a payload no earlier revision produced. */
const eventFor = (harness: Harness, label: string): CameraMachineEvent => {
  const { context } = harness.actor.getSnapshot();
  const next = context.revision + 1;
  const [action, source] = label.split(':');
  if (action === 'PoseObserved' && (source === 'input' || source === 'gizmo')) {
    // Oblique to every axis, so a later `setUpDirection` always finds its axis usable.
    return {
      type: 'poseObserved',
      target: [next, 0, 0],
      direction: [1, -1, 0.7],
      up: [0, 0, 1],
      verticalSpan: 10,
      source,
    };
  }
  const bounds = { min: [next, 0, 0], max: [next + 2, 2, 2] } as const;
  switch (source) {
    case 'fov': {
      return { type: 'setVerticalFieldOfView', verticalFieldOfView: 20 + next };
    }
    case 'up': {
      return { type: 'setUpDirection', axis: context.view.up[2] === 1 ? 'y' : 'z' };
    }
    case 'fit':
    case 'framing': {
      return { type: 'frameGeometry', bounds, margin: 0.1, source };
    }
    case 'focus': {
      return { type: 'frameBounds', bounds, margin: 0.1, source };
    }
    case 'viewport': {
      return { type: 'setViewport', viewport: { width: 640 + next, height: 480, pixelRatio: 1 } };
    }
    case 'bounds': {
      return { type: 'setBounds', bounds: { min: [-next - 1, -1, -1], max: [next + 1, 1, 1] } };
    }
    default: {
      throw new Error(`No camera event for the spec step ${label}.`);
    }
  }
};

const expectEmitted = (emitted: readonly AnyEventObject[], expected: readonly AnyEventObject[]): void => {
  if (JSON.stringify(emitted) !== JSON.stringify(expected)) {
    throw new Error(`Emitted ${JSON.stringify(emitted)}, expected ${JSON.stringify(expected)}.`);
  }
};

const applyStep = (harness: Harness, label: string): void => {
  const { actor, clock, emitted, syncs, world } = harness;
  const before = actor.getSnapshot();
  emitted.length = 0;
  syncs.length = 0;
  let adopted: number | undefined;
  const requestId = `request-${String(before.context.revision)}-${String(world.foreignCount)}`;
  const adoption = (): CameraMachineEvent => ({
    type: 'adoptPersistedPose',
    requestId,
    pose: {
      target: [foreignPose(world.foreignCount), 0, 0],
      direction: [1, -1, 0.7],
      up: [0, 0, 1],
      verticalSpan: 10,
    },
  });

  switch (label) {
    case 'InteractionEnded': {
      actor.send({ type: 'interactionEnded' });
      break;
    }
    case 'SettleElapsed': {
      clock.advance(cameraPoseSettleMilliseconds);
      break;
    }
    case 'EchoObserved': {
      actor.send({
        type: 'poseObserved',
        target: [-1, -1, -1],
        direction: [0, -1, 0],
        up: [0, 0, 1],
        verticalSpan: 99,
        source: 'input',
        echoRevision: before.context.revision,
      });
      expectEmitted(emitted, []);
      break;
    }
    case 'ForeignWrite': {
      world.foreignCount += 1;
      break;
    }
    case 'RecordOwn':
    case 'Landed': {
      break;
    }
    case 'AdoptApplied': {
      adopted = foreignPose(world.foreignCount);
      actor.send(adoption());
      expectEmitted(emitted, [
        { type: 'viewChanged', revision: before.context.revision + 1, source: 'persisted', verticalSpan: 10 },
        { type: 'adoptionApplied', requestId, revision: before.context.revision + 1 },
      ]);
      break;
    }
    case 'AdoptDropped':
    case 'AdoptDropped:resaved': {
      actor.send(adoption());
      expectEmitted(emitted, [
        { type: 'adoptionDropped', requestId, reason: before.matches({ input: 'dragging' }) ? 'dragging' : 'settling' },
      ]);
      break;
    }
    default: {
      if (label.startsWith('PoseObserved') && !before.matches({ gesture: 'held' })) {
        actor.send({ type: 'interactionStarted' });
      }
      actor.send(eventFor(harness, label));
    }
  }

  const after = actor.getSnapshot();
  // I1: a camera change is one revision, one driver synchronization and one `viewChanged`.
  const changes = after.context.revision - before.context.revision;
  if (syncs.length !== changes || emitted.filter((event) => event.type === 'viewChanged').length !== changes) {
    throw new Error(`${label} made ${String(changes)} revisions and ${String(syncs.length)} synchronizations.`);
  }
  const key = poseKey(after.context.view);
  if (key !== world.key) {
    // A pose that changed with no revision is a change the camera did not record (I1).
    if (changes === 0) {
      throw new Error(`${label} changed the pose with no revision.`);
    }
    world.key = key;
    world.pose = adopted ?? after.context.revision;
  }
};

/* Builds an adapter that keeps every harness it starts, so a later row can replay what each one recorded. */
const createAdapter = (harnesses: Harness[]): ConformanceAdapter<Harness> => ({
  start() {
    const harness = startHarness();
    harnesses.push(harness);
    return harness;
  },
  async apply(harness, action) {
    applyStep(harness, String(action[0]));
  },
  view(harness): SpecView {
    const snapshot = harness.actor.getSnapshot();
    const { input: phase } = snapshot.value as { input: string };
    return {
      cam: {
        input: phase,
        pose: harness.world.pose,
        revision: snapshot.context.revision,
        source: snapshot.context.lastChange.source,
      },
    };
  },
  stop(harness) {
    harness.actor.stop();
  },
});

const actionOf = (state: SpecView): readonly unknown[] => [state['act']];

/* One replay of the covering suite, shared by the rows that need it and run by whichever of them runs first. */
let replay: Promise<Readonly<{ divergences: readonly unknown[]; harnesses: Harness[] }>> | undefined;
const replayCoveringSuite = async () => {
  replay ??= (async () => {
    const harnesses: Harness[] = [];
    const divergences = await replaySuite(suiteBehaviours(graph, suite), createAdapter(harnesses), actionOf);
    return { divergences, harnesses };
  })();
  return replay;
};

type TransitionNode = Readonly<{
  id: string;
  states?: Readonly<Record<string, TransitionNode>>;
  transitions?: ReadonlyMap<string, ReadonlyArray<Readonly<{ meta?: Readonly<{ tla?: unknown }> }>>>;
}>;

/*
 * Every transition's static `meta.tla`, keyed `<state>.<eventType>#<candidate>`. `machineActions` of `@taucad/formal`
 * keeps one label per event, and `poseObserved` has two candidates: the echo and the pose.
 */
const cameraActions = (
  node: TransitionNode = cameraMachine.root as unknown as TransitionNode,
): Record<string, string> =>
  Object.fromEntries(
    [
      ...[...(node.transitions ?? [])].flatMap(([eventType, candidates]) =>
        candidates.map((candidate, index): [string, string] => {
          const label = candidate.meta?.tla;
          // An unlabelled transition is kept so the test below can refuse it (MC-R27).
          return [`${node.id}.${eventType}#${String(index)}`, typeof label === 'string' ? label : 'unlabelled'];
        }),
      ),
      ...Object.values(node.states ?? {}).flatMap((child) => Object.entries(cameraActions(child))),
    ].sort(([left], [right]) => (left < right ? -1 : 1)),
  );

describe('cameraMachine conforms to CameraAuthority.tla', () => {
  it('should replay the covering suite without divergence', async () => {
    const behaviours = suiteBehaviours(graph, suite);
    const labels = new Set(behaviours.flatMap((behaviour) => behaviour.map((state) => String(state['act']))));

    expect(behaviours).toHaveLength(46);
    // Every step label of the target model is replayed, in every input state the suite reaches it.
    expect([...labels].sort()).toEqual([
      'AdoptApplied',
      'AdoptDropped',
      'AdoptDropped:resaved',
      'Changed:bounds',
      'Changed:fit',
      'Changed:focus',
      'Changed:fov',
      'Changed:framing',
      'Changed:up',
      'Changed:viewport',
      'EchoObserved',
      'ForeignWrite',
      'Init',
      'InteractionEnded',
      'Landed',
      'PoseObserved:gizmo',
      'PoseObserved:input',
      'RecordOwn',
      'SettleElapsed',
    ]);
    const { divergences } = await replayCoveringSuite();

    expect(divergences).toEqual([]);
  });

  it('should reproduce every recorded delivery through the pure transition function', async () => {
    const { harnesses } = await replayCoveringSuite();

    expect(harnesses.length).toBeGreaterThan(0);
    for (const harness of harnesses) {
      const records = harness.recorder
        .records()
        .filter((record) => record.machineId === cameraMachine.id && record.event.type !== '@xstate.init');

      expect(replayEquality(cameraMachine, input, records)).toEqual([]);
    }
  });

  it('should name every camera action of the spec, and only actions the spec defines', () => {
    const labelled = cameraActions();
    // The render frame, the clip policy, the gesture and a caught defect change no spec variable: the spec does not model them (MC-R27).
    const unmodelled = Object.keys(labelled).filter((key) => labelled[key] === 'Unmodelled');
    const actions = Object.fromEntries(Object.entries(labelled).filter(([, action]) => action !== 'Unmodelled'));

    expect(Object.keys(labelled).filter((key) => labelled[key] === 'unlabelled')).toEqual([]);
    expect(unmodelled).toEqual([
      'camera.gesture.held.interactionEnded#0',
      'camera.gesture.released.interactionStarted#0',
      'camera.setClipPolicy#0',
      'camera.setRenderFrame#0',
      'camera.xstate.error.*#0',
    ]);
    expect(new Set(Object.values(actions))).toEqual(
      new Set(['PoseObserved', 'EchoObserved', 'InteractionEnded', 'SettleElapsed', 'Changed', 'Observe']),
    );
    expect(
      checkActionCorrespondence(actions, {
        operators: specOperators(tla),
        next: [
          'PoseObserved',
          'InteractionEnded',
          'SettleElapsed',
          'Changed',
          'Observe',
          'PendingApplied',
          'Captured',
          'Landed',
          'ForeignWrite',
          'EchoObserved',
          'QuietElapsed',
        ],
        // The as-built queue, capture and quiet window, and the store's and another party's writes.
        environment: ['PendingApplied', 'Captured', 'Landed', 'ForeignWrite', 'QuietElapsed'],
      }),
    ).toEqual([]);
  });

  it('should match the committed drift manifest', () => {
    expect(
      driftManifestProblems(path.join(specs, 'CameraAuthority/drift.json'), {
        alphabet: machineAlphabet([cameraMachine]),
        versions: { [cameraMachine.id]: cameraMachine.version },
        actions: cameraActions(),
        tables: hashFiles(specs, ['expected.json', 'CameraAuthority.target.cfg', 'CameraAuthority.export.cfg']),
        specs: hashFiles(specs, ['CameraAuthority.tla']),
      }),
    ).toEqual([]);
  });
});
