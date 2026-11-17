/**
 * The CameraAuthority covering suite (`packages/camera/specs/CameraAuthority.tla`, target configuration) replayed
 * against the wired view record session (graphics event-driven state charter G6b, carried from G6a): a real graphics
 * actor with its camera and framing, the view record binding, and the view store over in-memory files. The camera's
 * own conformance (`camera.machine.conformance.test.ts`) replays the camera alone; this replay adds the binding's and
 * the store's steps, so the record the session writes is checked as well as the camera.
 *
 * Refinement mapping: `cam` as in the camera's replay (input region, revision counted from the first frame, last
 * change's source, the pose's id), `file` as the record's camera field (the id of the pose it holds and who wrote it)
 * and `intent` as the pose of the store's edit that has not been written. The spec's `file.source` and
 * `intent.source` are the binding's own bookkeeping and are not compared.
 *
 * The field of view is one of the nine inheritable leaves (graphics charter ruling of 2026-11-12, amending D20, I6 and
 * I7 for them; onboarding blueprint Finding 6): view commands write it and the binding seeds the camera from its
 * resolution, so no edit of the binding carries the camera's field of view. An edit is therefore identified by its
 * pose and the field of view the camera shows, which is the record's own until a person changes it on the camera:
 * after `Changed:fov` the binding's edit is the person's pose (the spec's `intent`), and the record keeps its field of
 * view. Every behaviour of the covering suite ends at its `Changed:fov`, so no `Landed` of that edit is compared.
 *
 * | Spec step                  | Harness                                                                      |
 * | -------------------------- | ---------------------------------------------------------------------------- |
 * | `PoseObserved`, `Changed`  | the camera event, as the camera's replay sends it                            |
 * | `SettleElapsed`            | the camera's clock passes `cameraPoseSettleMilliseconds`                     |
 * | `Landed`                   | the store's clock passes its edit debounce, and the write answers           |
 * | `ForeignWrite`             | another party writes a new pose to the file, unseen until its watch fires   |
 * | `RecordOwn`, `AdoptApplied`, `AdoptDropped` | the file's watch fires and the store publishes what it reads |
 *
 * The camera and the store run on separate clocks: the store's debounce is not the camera's settle window, and the spec
 * orders them independently.
 */
import path from 'node:path';
import { readFileSync } from 'node:fs';
import type { WatchEvent } from '@taucad/filesystem';
import { cameraPoseSettleMilliseconds } from '@taucad/camera/machine';
import type { CameraMachineEvent } from '@taucad/camera/machine';
import { readSpecGraph, suiteBehaviours } from '@taucad/formal/graph';
import type { CoveringSuite, SpecView } from '@taucad/formal/graph';
import { replaySuite } from '@taucad/formal/replay';
import type { ConformanceAdapter } from '@taucad/formal/replay';
import { workbenchPaths, workbenchRecords } from '@taucad/workbench';
import type { WorkbenchView } from '@taucad/workbench';
import { graphicsMachine } from '@taucad/viewer/machines/graphics.machine';
import { StepClock } from '@taucad/xstate-testing/clock';
import { describe, expect, it } from 'vitest';
import { createActor, createAsyncLogic } from 'xstate';
import {
  createViewRecordPorts,
  startViewRecordSession,
  viewRecordEditDebounce,
} from '#workbench-records/view-record-session.js';

const specs = path.resolve(import.meta.dirname, '../../../../packages/camera/specs');
const graph = readSpecGraph(path.join(specs, 'CameraAuthority/graph.json'));
const suite = JSON.parse(readFileSync(path.join(specs, 'CameraAuthority/suite.json'), 'utf8')) as CoveringSuite;

const projectId = 'conformance';
const viewId = 'view-1';
const recordPath = `/projects/${projectId}/${workbenchPaths.view(viewId)}`;
const rigPose = 0;
const foreignPose = (count: number): number => 100 + count;

/* Let the store's file ports answer: each read or write is a few promise turns. */
const settle = async (): Promise<void> => {
  for (let turn = 0; turn < 20; turn++) {
    // oxlint-disable-next-line no-await-in-loop -- each turn lets one port answer.
    await Promise.resolve();
  }
};

type PoseFields = Readonly<{
  frameId: string;
  target: readonly number[];
  direction: readonly number[];
  up: readonly number[];
  verticalSpan: number;
  perspectiveZoom: number;
}>;

/* A pose as the record holds it: the camera's pose subset and the field of view. */
const keyOf = (pose: PoseFields, fieldOfView: number): string =>
  JSON.stringify([
    pose.frameId,
    pose.target,
    pose.direction,
    pose.up,
    pose.verticalSpan,
    pose.perspectiveZoom,
    fieldOfView,
  ]);

const parse = (bytes: Uint8Array<ArrayBuffer>): WorkbenchView =>
  workbenchRecords.view.schema.parse(JSON.parse(new TextDecoder().decode(bytes)));

async function startHarness() {
  const cameraClock = new StepClock();
  const storeClock = new StepClock();
  let bytes = new TextEncoder().encode(
    workbenchRecords.view.serialize(workbenchRecords.view.schema.parse({ version: 1, entryPath: 'a.ts' })),
  );
  let writer: 'none' | 'self' | 'foreign' = 'none';
  const listeners = new Set<(event: WatchEvent) => void>();
  const ports = createViewRecordPorts({
    projectId,
    root: `/projects/${projectId}`,
    host: {
      files: {
        exists: async (candidate: string) => candidate === recordPath,
        readFile: async () => bytes,
        writeFileChecked: async ({
          data,
        }: {
          data: string;
        }): Promise<{ status: 'applied'; content: Uint8Array<ArrayBuffer> }> => {
          bytes = new TextEncoder().encode(data);
          writer = 'self';
          intent = undefined;
          return { status: 'applied', content: bytes };
        },
      },
      watch: (_path: string, listener: (event: WatchEvent) => void) => {
        listeners.add(listener);
        return {
          ready: Promise.resolve(),
          closed: new Promise<void>(() => {
            // The watch never closes in these rows.
          }),
          dispose: () => {
            listeners.delete(listener);
          },
        };
      },
    },
    setViewRecord: () => undefined,
    setViewEntryPath: () => undefined,
    setAppliedWorkbenchRevision: () => undefined,
  });
  const graphics = createActor(
    graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
    { input: {}, clock: cameraClock },
  ).start();
  /* The binding's edit that has not reached the file yet (the spec's `intent`): the camera of the store's last edit. */
  let intent: WorkbenchView['camera'] | undefined;
  const stop = startViewRecordSession({
    viewId,
    graphics,
    ports,
    clock: storeClock,
    inspect: (event) => {
      if (event.type === '@xstate.transition' && event.event.type === 'edit' && 'next' in event.event) {
        const next = event.event['next'] as WorkbenchView;
        intent = next.camera;
      }
    },
  });
  await settle();
  // The first frame: the spec's `Init`, the rig pose framed.
  graphics.send({ type: 'entryChanged', identity: 'a.ts' });
  graphics.send({
    type: 'geometryBoundsMeasured',
    key: 'k1',
    bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
    radius: Math.sqrt(3),
  });
  await settle();
  const { cameraRef: camera } = graphics.getSnapshot().context;
  const cameraKey = (): string => {
    const { view } = camera.getSnapshot().context;
    return keyOf(view, view.requestedVerticalFieldOfView);
  };
  const firstFrame = camera.getSnapshot().context.revision;
  const ids = new Map<string, number>([[cameraKey(), rigPose]]);
  return {
    graphics,
    camera,
    cameraClock,
    storeClock,
    firstFrame,
    ids,
    cameraKey,
    world: { foreignCount: 0, pose: rigPose, key: cameraKey() },
    intent: (): number => {
      if (intent?.kind !== 'pose') {
        return rigPose;
      }
      const id = ids.get(keyOf(intent, camera.getSnapshot().context.view.requestedVerticalFieldOfView));
      if (id === undefined) {
        throw new Error(`The binding edits a pose no step made: ${JSON.stringify(intent)}.`);
      }
      return id;
    },
    file: (): Readonly<{ pose: number; writer: string }> => {
      const record = parse(bytes);
      if (record.camera.kind !== 'pose') {
        return { pose: rigPose, writer };
      }
      const id = ids.get(keyOf(record.camera, record.fieldOfView));
      if (id === undefined) {
        throw new Error(`The record holds a pose no step made: ${JSON.stringify(record.camera)}.`);
      }
      return { pose: id, writer };
    },
    foreignWrite: (count: number): void => {
      const record = parse(bytes);
      const pose: Extract<WorkbenchView['camera'], { kind: 'pose' }> = {
        kind: 'pose',
        frameId: 'tau:root',
        target: [foreignPose(count), 0, 0],
        direction: [0, -1, 0],
        up: [0, 0, 1],
        verticalSpan: 10,
        perspectiveZoom: 1,
      };
      ids.set(keyOf(pose, record.fieldOfView), foreignPose(count));
      bytes = new TextEncoder().encode(workbenchRecords.view.serialize({ ...record, camera: pose }));
      writer = 'foreign';
    },
    notify: async (): Promise<void> => {
      for (const listener of listeners) {
        listener({ type: 'change', path: recordPath } as WatchEvent);
      }
      await settle();
    },
    stop: (): void => {
      stop();
      graphics.stop();
    },
  };
}

type Harness = Awaited<ReturnType<typeof startHarness>>;

/* The camera event for a spec step that carries a source, with a payload no earlier revision produced. */
const eventFor = (harness: Harness, label: string): CameraMachineEvent => {
  const { context } = harness.camera.getSnapshot();
  const next = context.revision + 1;
  const [action, source] = label.split(':');
  if (action === 'PoseObserved' && (source === 'input' || source === 'gizmo')) {
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

const applyStep = async (harness: Harness, label: string): Promise<void> => {
  const { camera, world } = harness;
  const before = camera.getSnapshot();
  let adopted: number | undefined;
  switch (label) {
    case 'InteractionEnded': {
      camera.send({ type: 'interactionEnded' });
      break;
    }
    case 'SettleElapsed': {
      harness.cameraClock.increment(cameraPoseSettleMilliseconds);
      break;
    }
    case 'EchoObserved': {
      camera.send({
        type: 'poseObserved',
        target: [-1, -1, -1],
        direction: [0, -1, 0],
        up: [0, 0, 1],
        verticalSpan: 99,
        source: 'input',
        echoRevision: before.context.revision,
      });
      break;
    }
    case 'Landed': {
      harness.storeClock.increment(viewRecordEditDebounce);
      await settle();
      break;
    }
    case 'ForeignWrite': {
      world.foreignCount += 1;
      harness.foreignWrite(world.foreignCount);
      break;
    }
    case 'RecordOwn':
    case 'AdoptDropped':
    case 'AdoptDropped:resaved': {
      await harness.notify();
      break;
    }
    case 'AdoptApplied': {
      adopted = foreignPose(world.foreignCount);
      await harness.notify();
      break;
    }
    default: {
      if (label.startsWith('PoseObserved') && !before.matches({ gesture: 'held' })) {
        camera.send({ type: 'interactionStarted' });
      }
      camera.send(eventFor(harness, label));
    }
  }
  await settle();

  const key = harness.cameraKey();
  if (key !== world.key) {
    world.key = key;
    world.pose = adopted ?? camera.getSnapshot().context.revision - harness.firstFrame;
    harness.ids.set(key, world.pose);
  }
};

/* One behaviour's adapter: `replaySuite` starts its harness synchronously, so the harness is started before. */
const adapterFor = (harness: Harness): ConformanceAdapter<Harness> => ({
  start: () => harness,
  apply: async (live, action) => applyStep(live, String(action[0])),
  project: (state: SpecView): SpecView => {
    const { file, intent } = state as { file: { pose: number; writer: string }; intent: { pose: number } };
    return { ...state, file: { pose: file.pose, writer: file.writer }, intent: intent.pose };
  },
  view: (live): SpecView => {
    const snapshot = live.camera.getSnapshot();
    const { input: phase } = snapshot.value as { input: string };
    return {
      cam: {
        input: phase,
        pose: live.world.pose,
        revision: snapshot.context.revision - live.firstFrame,
        // The first frame faces the record's preset, which framing labels `persisted`: the spec's opening rig frame.
        source: snapshot.context.revision === live.firstFrame ? 'framing' : snapshot.context.lastChange.source,
      },
      file: live.file(),
      intent: live.intent(),
    };
  },
  stop: (live) => {
    live.stop();
  },
});

describe('the wired view record session conforms to CameraAuthority.tla (target)', () => {
  it('should replay the covering suite through the binding and the store without divergence', async () => {
    const behaviours = suiteBehaviours(graph, suite);
    const harnesses: Harness[] = [];
    const divergences = [];
    for (const [index, behaviour] of behaviours.entries()) {
      // oxlint-disable-next-line no-await-in-loop -- one behaviour's actors stop before the next starts.
      const harness = await startHarness();
      harnesses.push(harness);
      // oxlint-disable-next-line no-await-in-loop -- each behaviour replays on its own actors.
      const found = await replaySuite([behaviour], adapterFor(harness), (state) => [state['act']]);
      divergences.push(...found.map((divergence) => ({ ...divergence, behaviour: index })));
    }

    expect(harnesses).toHaveLength(46);
    expect(divergences).toEqual([]);
  });
});
