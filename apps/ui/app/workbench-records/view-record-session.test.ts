/**
 * A view's record session against a real graphics actor (with its camera and framing children) and a real view store
 * over in-memory files, on one `StepClock` (graphics event-driven state charter G6b). These rows hold the wiring the
 * binding's machine rows cannot: the camera's own quiet window, graphics' section quiet gate, framing's entry, and the
 * store's own-write attribution together.
 *
 * Two rows flip G0.3's `today` rows deliberately (D14), as G6a's machine rows did: a foreign pose that arrives during a
 * drag is dropped and the drag's pose is saved (D15), and an automatic refit is not saved (D20).
 */
import type { WatchEvent } from '@taucad/filesystem';
import { cameraPoseSettleMilliseconds } from '@taucad/camera/machine';
import { workbenchPaths, workbenchRecords } from '@taucad/workbench';
import type { WorkbenchView } from '@taucad/workbench';
import { graphicsMachine, sectionSettleDelay } from '@taucad/viewer/machines/graphics.machine';
import type { GraphicsEvent } from '@taucad/viewer/machines/graphics.machine';
import { StepClock } from '@taucad/xstate-testing/clock';
import { afterEach, describe, expect, it } from 'vitest';
import { createActor, createAsyncLogic } from 'xstate';
import { readRecordIssues } from '#workbench-records/record-issues.js';
import {
  createViewRecordPorts,
  startViewRecordSession,
  viewRecordEditDebounce,
} from '#workbench-records/view-record-session.js';

const projectId = 'session-test';
const viewId = 'view-1';
const path = `/projects/${projectId}/${workbenchPaths.view(viewId)}`;
const encode = (record: WorkbenchView): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(workbenchRecords.view.serialize(record));
const view = (fields: Record<string, unknown> = {}): WorkbenchView =>
  workbenchRecords.view.schema.parse({ version: 1, entryPath: 'a.ts', ...fields });
const pose = (direction: [number, number, number], verticalSpan: number) =>
  ({
    kind: 'pose',
    frameId: 'tau:root',
    target: [0, 0, 0],
    direction,
    up: [0, 0, 1],
    verticalSpan,
    perspectiveZoom: 1,
  }) as const;
const measured = (key: string, half = 1): Extract<GraphicsEvent, { type: 'geometryBoundsMeasured' }> => ({
  type: 'geometryBoundsMeasured',
  key,
  bounds: { min: [-half, -half, -half], max: [half, half, half] },
  radius: half * Math.sqrt(3),
});

const stops: Array<() => void> = [];
afterEach(() => {
  for (const stop of stops.splice(0)) {
    stop();
  }
});

/** Let the store's file ports answer: each read or write is a few promise turns. */
const settle = async (): Promise<void> => {
  for (let turn = 0; turn < 20; turn++) {
    // oxlint-disable-next-line no-await-in-loop -- each turn lets one port answer.
    await Promise.resolve();
  }
};

async function mount(initial: WorkbenchView = view()) {
  const clock = new StepClock();
  let bytes: Uint8Array<ArrayBuffer> | undefined = encode(initial);
  const writes: WorkbenchView[] = [];
  const listeners = new Set<(event: WatchEvent) => void>();
  const files = {
    exists: async (candidate: string) => candidate === path && bytes !== undefined,
    readFile: async () => {
      if (bytes === undefined) {
        throw new Error('missing');
      }
      return bytes;
    },
    writeFileChecked: async ({
      data,
    }: {
      data: string;
    }): Promise<{ status: 'applied'; content: Uint8Array<ArrayBuffer> }> => {
      bytes = new TextEncoder().encode(data);
      writes.push(workbenchRecords.view.schema.parse(JSON.parse(data)));
      return { status: 'applied', content: bytes };
    },
  };
  const watch = (_path: string, listener: (event: WatchEvent) => void) => {
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
  };
  const records = new Map<string, WorkbenchView | undefined>();
  const ports = createViewRecordPorts({
    projectId,
    root: `/projects/${projectId}`,
    host: { files, watch },
    setViewRecord: (id, record) => records.set(id, record),
    setViewEntryPath: () => undefined,
    setAppliedWorkbenchRevision: () => undefined,
  });
  const graphics = createActor(
    graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
    {
      input: initial.camera.kind === 'pose' ? { camera: { cameraView: initial.camera } } : {},
      clock,
    },
  ).start();
  const stop = startViewRecordSession({ viewId, graphics, ports, clock });
  stops.push(() => {
    stop();
    graphics.stop();
  });
  await settle();
  const { cameraRef: camera } = graphics.getSnapshot().context;
  const harness = {
    clock,
    graphics,
    camera,
    ports,
    writes,
    records,
    stop,
    file: (): WorkbenchView | undefined =>
      bytes === undefined ? undefined : workbenchRecords.view.schema.parse(JSON.parse(new TextDecoder().decode(bytes))),
    /** Another window writes the record; the watch reports it. */
    foreign: async (next: WorkbenchView): Promise<void> => {
      bytes = encode(next);
      for (const listener of listeners) {
        listener({ type: 'change', path } as WatchEvent);
      }
      await settle();
    },
    /** The pane names the entry and its geometry is measured: the first frame. */
    frame: async (entry = 'a.ts', key = 'k1'): Promise<void> => {
      graphics.send({ type: 'entryChanged', identity: entry });
      graphics.send(measured(key));
      await settle();
    },
    drag: (direction: [number, number, number], verticalSpan: number): void => {
      camera.send({ type: 'interactionStarted' });
      camera.send({ type: 'poseObserved', source: 'input', ...pose(direction, verticalSpan) });
    },
    release: (): void => {
      camera.send({ type: 'interactionEnded' });
    },
    /** Past the camera's settle window and the store's edit debounce, then the write answers. */
    quiet: async (): Promise<void> => {
      clock.increment(cameraPoseSettleMilliseconds);
      clock.increment(viewRecordEditDebounce);
      await settle();
      clock.increment(viewRecordEditDebounce);
      await settle();
    },
    direction: (): readonly number[] => camera.getSnapshot().context.view.direction,
  };
  return harness;
}

describe('view record session', () => {
  it('should adopt a foreign pose at once while the camera is idle, and never write it back (I6, I8)', async () => {
    const harness = await mount();
    await harness.frame();
    await harness.quiet();
    const written = harness.writes.length;
    await harness.foreign(view({ camera: pose([0, 1, 0], 9) }));
    expect(harness.direction()).toEqual([0, 1, 0]);
    await harness.quiet();
    expect(harness.writes.length).toBe(written);
  });

  it('should drop a foreign pose that arrives during a drag and save the drag pose (D15, flips G0.3 today)', async () => {
    const harness = await mount();
    await harness.frame();
    harness.drag([1, 0, 0], 4);
    await harness.foreign(view({ camera: pose([0, 1, 0], 9) }));
    // The person's drag wins: the camera keeps the drag's pose.
    expect(harness.direction()).toEqual([1, 0, 0]);
    harness.release();
    await harness.quiet();
    expect(harness.file()?.camera).toMatchObject({ kind: 'pose', direction: [1, 0, 0], verticalSpan: 4 });
  });

  it('should not save the first frame or an automatic refit (D20, flips G0.3 today), and save a Fit view', async () => {
    const harness = await mount();
    await harness.frame();
    harness.graphics.send(measured('k2', 3));
    await harness.quiet();
    expect(harness.writes.filter((record) => record.camera.kind === 'pose')).toEqual([]);
    harness.graphics.send({ type: 'fitView' });
    await harness.quiet();
    expect(harness.file()?.camera.kind).toBe('pose');
  });

  it('should neither write back a foreign up direction nor start the camera settling', async () => {
    const harness = await mount();
    await harness.frame();
    await harness.quiet();
    const written = harness.writes.length;
    await harness.foreign(view({ upDirection: 'y' }));
    expect(harness.graphics.getSnapshot().context.upDirection).toBe('y');
    expect(harness.camera.getSnapshot().matches({ input: 'idle' })).toBe(true);
    await harness.quiet();
    expect(harness.writes.length).toBe(written);
  });

  it('should hold a foreign section while cuts are edited and adopt it when they settle', async () => {
    const harness = await mount();
    await harness.frame();
    harness.graphics.send({ type: 'setSectionViewActive', payload: true });
    const [cut] = harness.graphics.getSnapshot().context.sectionCuts;
    harness.graphics.send({ type: 'updateSectionCut', payload: { id: cut!.id, patch: { offset: 0.5 } } });
    const foreignSection = { active: true, cuts: [{ kind: 'plane', plane: 'xy', offset: 0.25, isFlipped: false }] };
    await harness.foreign(view({ section: foreignSection }));
    expect(harness.graphics.getSnapshot().context.sectionCuts).toHaveLength(1);
    expect(harness.graphics.getSnapshot().context.sectionCuts[0]).toMatchObject({ offset: 0.5 });
    harness.clock.increment(sectionSettleDelay);
    await settle();
    expect(harness.graphics.getSnapshot().context.sectionCuts[0]).toMatchObject({ plane: 'xy', offset: 0.25 });
  });

  it("should save the person's settled section cuts", async () => {
    const harness = await mount();
    await harness.frame();
    harness.graphics.send({ type: 'setSectionViewActive', payload: true });
    await harness.quiet();
    expect(harness.file()?.section.active).toBe(true);
  });

  it('should keep a record for another entry off the shown entry and apply it over its first frame, measured at once', async () => {
    const harness = await mount();
    await harness.frame('a.ts');
    await harness.quiet();
    const shown = harness.direction();
    await harness.foreign(view({ entryPath: 'b.ts', camera: pose([0, 1, 0], 9) }));
    // CodeRabbit (taucad/tau#1857): the entry on screen keeps its camera.
    expect(harness.direction()).toEqual(shown);
    const written = harness.writes.length;
    // The pane names the new entry and its geometry is measured in the same turn.
    await harness.frame('b.ts', 'k-b');
    expect(harness.direction()).toEqual([0, 1, 0]);
    await harness.quiet();
    expect(harness.writes.slice(written).filter((record) => record.camera.kind === 'pose')).toEqual([]);
  });

  it('should write what is owed when the session stops', async () => {
    const harness = await mount();
    await harness.frame();
    harness.graphics.send({ type: 'setGridVisibility', payload: false });
    harness.stop();
    await settle();
    expect(harness.file()?.display.grid).toBe(false);
  });

  it('should reopen its store on replaced file ports and keep following foreign edits', async () => {
    const harness = await mount();
    await harness.frame();
    harness.ports.replaceHost({ ...harness.ports.host(), files: { ...harness.ports.host().files } });
    await settle();
    await harness.foreign(view({ display: { ...view().display, axes: false } }));
    expect(harness.graphics.getSnapshot().context.enableAxes).toBe(false);
    expect(readRecordIssues(projectId)).toEqual([]);
  });
});
