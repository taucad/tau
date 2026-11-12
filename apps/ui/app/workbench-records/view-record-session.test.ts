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
import type { ViewResolutionLevels } from '#workbench-records/view-record-binding-changes.js';
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

async function mount(
  initial: WorkbenchView = view(),
  initialLevels: ViewResolutionLevels = {},
  options: Readonly<{ missing?: boolean }> = {},
) {
  const clock = new StepClock();
  /* The levels above the view, as `deviceViewLevels` gives them: read now, and a change heard by every session. */
  let levels = initialLevels;
  const levelListeners = new Set<() => void>();
  /* `missing`: the view's file does not exist yet (`initial` only seeds the graphics actor). */
  let bytes: Uint8Array<ArrayBuffer> | undefined = options.missing === true ? undefined : encode(initial);
  const writes: WorkbenchView[] = [];
  const listeners = new Set<(event: WatchEvent) => void>();
  /* The connection's writes fail, as a replaced worker's do. */
  let failWrites: PromiseWithResolvers<void> | undefined;
  const applied = new Map<string, string | undefined>();
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
      if (failWrites !== undefined) {
        await failWrites.promise;
      }
      bytes = new TextEncoder().encode(data);
      writes.push(workbenchRecords.view.schema.parse(JSON.parse(data)));
      return { status: 'applied', content: bytes };
    },
  };
  /* Each registered watch's close: the filesystem ends it, as a worker restart does. */
  const closes: Array<() => void> = [];
  const watch = (_path: string, listener: (event: WatchEvent) => void) => {
    listeners.add(listener);
    const closed = Promise.withResolvers<void>();
    closes.push(() => {
      listeners.delete(listener);
      closed.resolve();
    });
    return {
      ready: Promise.resolve(),
      closed: closed.promise,
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
    levels: {
      read: () => levels,
      subscribe: (listener) => {
        levelListeners.add(listener);
        return () => levelListeners.delete(listener);
      },
    },
    setViewRecord: (id, record) => records.set(id, record),
    setViewEntryPath: () => undefined,
    setAppliedWorkbenchRevision: (recordPath, digest) => applied.set(recordPath, digest),
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
    closes,
    applied,
    /** Holds the connection's writes, and returns what fails them. */
    failWrites: (): (() => void) => {
      const held = Promise.withResolvers<void>();
      failWrites = held;
      return () => {
        held.reject(new Error('The connection is gone.'));
      };
    },
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
    /** The person's defaults or this device's exceptions change, in this tab or another. */
    setLevels: (next: ViewResolutionLevels): void => {
      levels = next;
      for (const listener of levelListeners) {
        listener();
      }
    },
    /** What graphics shows for the seven display flags, in the record's order. */
    display: (): boolean[] => {
      const { context } = graphics.getSnapshot();
      return [
        context.enableSurfaces,
        context.enableLines,
        context.enableGizmo,
        context.enableGrid,
        context.enableAxes,
        context.enableMatcap,
        context.enablePostProcessing,
      ];
    },
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
    // The drag's pose is written before the foreign record lands, so no queued edit of the drag remains to merge.
    await harness.quiet();
    expect(harness.file()?.camera).toMatchObject({ kind: 'pose', direction: [1, 0, 0] });
    await harness.foreign(view({ camera: pose([0, 1, 0], 9) }));
    // The person's drag wins: the camera keeps the drag's pose, while the file holds the other window's.
    expect(harness.direction()).toEqual([1, 0, 0]);
    expect(harness.file()?.camera).toMatchObject({ kind: 'pose', direction: [0, 1, 0] });
    harness.release();
    await harness.quiet();
    // The dropped adoption re-saves the drag's pose over the foreign one.
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

  it('should keep the section gate shut after a flush that is not a close, while the cuts are still edited', async () => {
    const harness = await mount();
    await harness.frame();
    harness.graphics.send({ type: 'setSectionViewActive', payload: true });
    await harness.quiet();
    const [cut] = harness.graphics.getSnapshot().context.sectionCuts;
    harness.graphics.send({ type: 'updateSectionCut', payload: { id: cut!.id, patch: { offset: 0.5 } } });
    await harness.ports.flush();
    const foreignSection = { active: true, cuts: [{ kind: 'plane', plane: 'xy', offset: 0.25, isFlipped: false }] };
    await harness.foreign(view({ section: foreignSection }));
    expect(harness.graphics.getSnapshot().context.sectionCuts[0]).toMatchObject({ offset: 0.5 });
    harness.clock.increment(sectionSettleDelay);
    await settle();
    expect(harness.graphics.getSnapshot().context.sectionCuts[0]).toMatchObject({ plane: 'xy', offset: 0.25 });
  });

  it("should keep the new store's applied revision when the replaced store's last flush fails", async () => {
    const harness = await mount();
    await harness.frame();
    // A person's pose is owed (the display flags are a view command's to write, not the session's).
    harness.drag([1, 0, 0], 4);
    harness.release();
    harness.clock.increment(cameraPoseSettleMilliseconds);
    await settle();
    const failOldWrite = harness.failWrites();
    let checkout = encode(view({ display: { ...view().display, axes: false } }));
    harness.ports.replaceHost({
      files: {
        exists: async () => true,
        readFile: async () => checkout,
        writeFileChecked: async ({ data }: { data: string }) => {
          checkout = new TextEncoder().encode(data);
          return { status: 'applied', content: checkout };
        },
      },
      watch: () => ({
        ready: Promise.resolve(),
        closed: new Promise<void>(() => {
          // The checkout's watch stays open in this row.
        }),
        dispose: () => undefined,
      }),
    });
    for (let turn = 0; turn < 5; turn++) {
      // oxlint-disable-next-line no-await-in-loop -- the digest answers on a later task.
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
      // oxlint-disable-next-line no-await-in-loop -- each turn lets one port answer.
      await settle();
    }
    expect(harness.graphics.getSnapshot().context.enableAxes).toBe(false);
    expect(harness.applied.get(workbenchPaths.view(viewId))).toEqual(expect.any(String));
    // The replaced store's last write fails after the new store's record was acknowledged.
    failOldWrite();
    for (let turn = 0; turn < 5; turn++) {
      // oxlint-disable-next-line no-await-in-loop -- the failure answers on a later task.
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    }
    expect(harness.applied.get(workbenchPaths.view(viewId))).toEqual(expect.any(String));
  });

  it('should save a section still inside the quiet gate when the session stops or the window closes', async () => {
    const harness = await mount();
    await harness.frame();
    harness.graphics.send({ type: 'setSectionViewActive', payload: true });
    await harness.quiet();
    const [cut] = harness.graphics.getSnapshot().context.sectionCuts;
    harness.graphics.send({ type: 'updateSectionCut', payload: { id: cut!.id, patch: { offset: 0.5 } } });
    await harness.ports.flush();
    expect(harness.file()?.section.cuts[0]).toMatchObject({ offset: 0.5 });
    harness.graphics.send({ type: 'updateSectionCut', payload: { id: cut!.id, patch: { offset: 0.75 } } });
    harness.stop();
    await settle();
    expect(harness.file()?.section.cuts[0]).toMatchObject({ offset: 0.75 });
  });

  it('should write what is owed when the session stops', async () => {
    const harness = await mount();
    await harness.frame();
    harness.drag([1, 0, 0], 4);
    harness.release();
    harness.clock.increment(cameraPoseSettleMilliseconds);
    await settle();
    harness.stop();
    await settle();
    expect(harness.file()?.camera).toMatchObject({ kind: 'pose', direction: [1, 0, 0], verticalSpan: 4 });
  });

  it('should re-register a closed watch on retry and adopt later foreign edits', async () => {
    const harness = await mount();
    await harness.frame();
    harness.closes[0]!();
    await settle();
    const [issue] = readRecordIssues(projectId);
    expect(issue?.state).toBe('unavailable');
    await issue!.retryRead();
    await settle();
    expect(harness.closes).toHaveLength(2);
    expect(readRecordIssues(projectId)).toEqual([]);
    await harness.foreign(view({ display: { ...view().display, grid: false } }));
    expect(harness.graphics.getSnapshot().context.enableGrid).toBe(false);
  });

  it('should read, follow and write the new files when the host replaces them (a checkout switch)', async () => {
    const harness = await mount();
    await harness.frame();
    let checkout = encode(view({ display: { ...view().display, axes: false } }));
    const written: string[] = [];
    const listeners = new Set<(event: WatchEvent) => void>();
    harness.ports.replaceHost({
      files: {
        exists: async () => true,
        readFile: async () => checkout,
        writeFileChecked: async ({ data }: { data: string }) => {
          checkout = new TextEncoder().encode(data);
          written.push(data);
          return { status: 'applied', content: checkout };
        },
      },
      watch: (_path, listener) => {
        listeners.add(listener);
        return {
          ready: Promise.resolve(),
          closed: new Promise<void>(() => {
            // The checkout's watch stays open in this row.
          }),
          dispose: () => {
            listeners.delete(listener);
          },
        };
      },
    });
    await settle();
    expect(harness.graphics.getSnapshot().context.enableAxes).toBe(false);
    checkout = encode(view({ display: { ...view().display, axes: false, grid: false } }));
    for (const listener of listeners) {
      listener({ type: 'change', path } as WatchEvent);
    }
    await settle();
    expect(harness.graphics.getSnapshot().context.enableGrid).toBe(false);
    const before = harness.writes.length;
    harness.graphics.send({ type: 'setSectionViewActive', payload: true });
    await harness.ports.flush();
    expect(written).toHaveLength(1);
    expect(harness.writes).toHaveLength(before);
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

/*
 * The ten inheritable leaves on the live path (onboarding blueprint, Finding 6; graphics charter ruling of 2026-11-12):
 * they flow one way, from the record resolved over the person's defaults and this device's exceptions to the owners,
 * and only view commands write them. Carried from the deleted `useViewSettingsSync` rows of PR 4 of the onboarding
 * plan.
 */
describe('view record session: inheritable leaves flow one way (onboarding WP3)', () => {
  const tenLeaves = (record: WorkbenchView | undefined): string =>
    JSON.stringify([record?.fieldOfView, record?.upDirection, record?.display, record?.grid]);
  const fieldOfView = (harness: Awaited<ReturnType<typeof mount>>): number =>
    harness.camera.getSnapshot().context.view.requestedVerticalFieldOfView;

  it('should reach an open view that does not set the leaf when a personal default changes, and not one that does (V4, V7, V9)', async () => {
    const inherits = await mount(view());
    await inherits.frame();
    const sets = await mount(view({ display: { ...view().display, axes: false } }));
    await sets.frame();
    const person = { person: { 'display.grid': false, 'display.axes': true, 'grid.unit': 'in' } } as const;
    inherits.setLevels(person);
    sets.setLevels(person);
    // In the same turn, as a toggle from the menu reaches its owner.
    expect(inherits.graphics.getSnapshot().context.enableGrid).toBe(false);
    expect(inherits.graphics.getSnapshot().context.displayUnits.length.symbol).toBe('in');
    expect(sets.graphics.getSnapshot().context.enableGrid).toBe(false);
    expect(sets.graphics.getSnapshot().context.enableAxes).toBe(false);
    // An exception keeps the view's own format value over the person's default (V7).
    inherits.setLevels({ ...person, exceptions: ['display.grid'] });
    expect(inherits.graphics.getSnapshot().context.enableGrid).toBe(true);
    expect(inherits.graphics.getSnapshot().context.displayUnits.length.symbol).toBe('in');
  });

  it("should show the person's defaults in a view whose file is missing, and follow a change of them, writing nothing", async () => {
    const harness = await mount(
      view(),
      { person: { 'display.grid': false, 'grid.unit': 'in', fieldOfView: 30 } },
      {
        missing: true,
      },
    );
    await harness.frame();
    expect(harness.graphics.getSnapshot().context.enableGrid).toBe(false);
    expect(harness.graphics.getSnapshot().context.displayUnits.length.symbol).toBe('in');
    expect(fieldOfView(harness)).toBe(30);
    harness.setLevels({ person: { 'display.grid': true, 'display.axes': false } });
    expect(harness.graphics.getSnapshot().context.enableGrid).toBe(true);
    expect(harness.graphics.getSnapshot().context.enableAxes).toBe(false);
    expect(harness.graphics.getSnapshot().context.displayUnits.length.symbol).toBe(view().grid.unit);
    expect(fieldOfView(harness)).toBe(view().fieldOfView);
    await harness.quiet();
    expect(harness.file()).toBeUndefined();
  });

  it('should seed a personal field of view through the camera without writing it, and keep the record field of view on a later pose (V6)', async () => {
    const harness = await mount(view());
    await harness.frame();
    harness.setLevels({ person: { fieldOfView: 30 } });
    expect(fieldOfView(harness)).toBe(30);
    await harness.quiet();
    expect(harness.writes).toEqual([]);
    harness.drag([1, 0, 0], 4);
    harness.release();
    await harness.quiet();
    expect(harness.file()?.camera).toMatchObject({ kind: 'pose', direction: [1, 0, 0], verticalSpan: 4 });
    expect(harness.file()?.fieldOfView).toBe(view().fieldOfView);
  });

  it('should persist the settled pose after the same gesture changes the field of view, and keep the record field of view (V6)', async () => {
    const record = view();
    const harness = await mount(record);
    await harness.frame();
    harness.drag([1, 0, 0], 4);
    harness.camera.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 38 });
    harness.release();
    await harness.quiet();
    expect(harness.file()?.camera).toMatchObject({ kind: 'pose', verticalSpan: 4 });
    expect(harness.writes.length).toBeGreaterThan(0);
    expect(harness.writes.every((next) => next.fieldOfView === record.fieldOfView)).toBe(true);
  });

  it('should write no inheritable leaf while a camera move and a section change persist and a personal default changes (V6)', async () => {
    const record = view({ display: { ...view().display, postProcessing: true }, grid: { unit: 'cm' } });
    const harness = await mount(record);
    await harness.frame();
    harness.drag([1, 0, 0], 5);
    harness.graphics.send({ type: 'setSectionViewActive', payload: true });
    // This tab changes a default, then another tab does (the section store's change reaches every session).
    harness.setLevels({ person: { 'display.grid': false, fieldOfView: 0 } });
    harness.setLevels({ person: { 'display.grid': false, 'display.surfaces': false } });
    harness.release();
    await harness.quiet();
    harness.clock.increment(sectionSettleDelay);
    await harness.quiet();
    expect(harness.file()?.camera.kind).toBe('pose');
    expect(harness.file()?.section.active).toBe(true);
    expect(harness.writes.length).toBeGreaterThan(0);
    for (const next of harness.writes) {
      expect(tenLeaves(next)).toBe(tenLeaves(record));
    }
    // The live owners show the resolution, which no write copied into the file.
    expect(harness.graphics.getSnapshot().context.enableGrid).toBe(false);
    expect(harness.graphics.getSnapshot().context.enableSurfaces).toBe(false);
    expect(fieldOfView(harness)).toBe(record.fieldOfView);
  });

  it('should write no grid unit from the live owner, and show a unit a view command wrote, here and after a reload (V13)', async () => {
    const harness = await mount(view({ grid: { unit: 'mm' } }));
    await harness.frame();
    harness.graphics.send({ type: 'setGridUnit', payload: { unit: 'ft' } });
    await harness.quiet();
    expect(harness.writes).toEqual([]);
    // `setViewField(view, 'grid.unit', 'ft')` writes the record through its own checked store: a publication here.
    await harness.foreign(view({ grid: { unit: 'ft' } }));
    expect(harness.graphics.getSnapshot().context.displayUnits.length.symbol).toBe('ft');
    const reloaded = await mount(harness.file());
    expect(reloaded.graphics.getSnapshot().context.displayUnits.length.symbol).toBe('ft');
  });

  it.each([
    [
      'post-processing on, every other leaf at its format value',
      { display: { ...view().display, postProcessing: true } },
    ],
    ['post-processing off, every other leaf at its format value', {}],
    [
      'every leaf away from its format value',
      {
        fieldOfView: 0,
        upDirection: 'y',
        display: {
          surfaces: false,
          lines: false,
          gizmo: false,
          grid: false,
          axes: false,
          matcap: true,
          postProcessing: true,
        },
        grid: { unit: 'in' },
      },
    ],
  ])(
    'should render an existing view file as it is written, and write nothing on opening, with no personal default (V11): %s',
    async (_name, fields) => {
      const record = view(fields);
      const harness = await mount(record);
      await harness.frame();
      const { context } = harness.graphics.getSnapshot();
      expect(harness.display()).toEqual(Object.values(record.display));
      expect(context.displayUnits.length.symbol).toBe(record.grid.unit);
      expect(context.upDirection).toBe(record.upDirection);
      expect(fieldOfView(harness)).toBe(record.fieldOfView);
      await harness.quiet();
      // Opening the view writes no view file.
      expect(harness.writes).toEqual([]);
      expect(workbenchRecords.view.serialize(harness.file()!)).toBe(workbenchRecords.view.serialize(record));
    },
  );
});
