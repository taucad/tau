// @vitest-environment jsdom
/* oxlint-disable typescript/no-confusing-void-expression -- Testing Library waitFor callbacks are assertions. */
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor, createAsyncLogic } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import { mock } from 'vitest-mock-extended';
import { workbenchRecords } from '@taucad/workbench';
import type { WorkbenchView } from '@taucad/workbench';
import { GraphicsProvider } from '@taucad/viewer/hooks/use-graphics';
import { useViewSettingsSync } from '#hooks/use-view-settings-sync.js';
import type { ViewRecordPatch } from '#workbench-records/view-store.js';
import {
  graphicsMachine,
  selectGraphicsFramed,
  selectGraphicsFramingIdentity,
} from '@taucad/viewer/machines/graphics.machine';
import { cadMachine } from '#machines/cad.machine.js';
import { fromSafeAsync } from '@taucad/ui-core/lib/xstate.lib';
import { createMockRuntimeClient, createMockRuntimeDocument } from '@taucad/runtime-testing';
import type { KernelOptionsFactory } from '#types/runtime-client.alias.js';
import type { editorMachine } from '#machines/editor.machine.js';

/** The view's camera, as the graphics actor holds it. */
const getViewCameraSession = (graphicsRef: ActorRefFrom<typeof graphicsMachine>) => ({
  rig: { actorRef: graphicsRef.getSnapshot().context.cameraRef },
});

/** Whether the view's entry has had its first geometry framed. */
const isFramed = (graphicsRef: ActorRefFrom<typeof graphicsMachine>): boolean =>
  selectGraphicsFramed(graphicsRef.getSnapshot());

/**
 * The canvas measures a presentation `key`: a cube of half-size `half` about the origin. The first measurement of an
 * entry frames it; a new key that moved more than 10 % refits.
 */
const measure = (graphicsRef: ActorRefFrom<typeof graphicsMachine>, half = 2, key = `cube-${String(half)}`): void => {
  act(() => {
    graphicsRef.send({
      type: 'geometryBoundsMeasured',
      key,
      bounds: { min: [-half, -half, -half], max: [half, half, half] },
      radius: half * Math.sqrt(3),
      viewport: { width: 800, height: 600, pixelRatio: 1 },
    });
  });
};

const getCanvasState = () => ({ size: { width: 800, height: 600 } });

vi.mock('@react-three/fiber', () => ({
  useThree: <T,>(selector?: (state: { get: typeof getCanvasState }) => T) =>
    selector ? selector({ get: getCanvasState }) : getCanvasState(),
}));

const initial = (): WorkbenchView =>
  workbenchRecords.view.schema.parse({
    version: 1,
    entryPath: 'src/main.ts',
    camera: { kind: 'preset', preset: 'isometric' },
  });

function Harness({
  graphicsRef,
  cadRef,
  editorRef,
  record,
  recordLocalPatch,
  writeRecord,
  onRecordApplied,
}: {
  readonly graphicsRef: ActorRefFrom<typeof graphicsMachine>;
  readonly cadRef?: ActorRefFrom<typeof cadMachine>;
  readonly editorRef: ActorRefFrom<typeof editorMachine>;
  readonly record: WorkbenchView;
  readonly recordLocalPatch?: ViewRecordPatch;
  readonly writeRecord: (record: WorkbenchView) => Promise<boolean>;
  readonly onRecordApplied?: (record: WorkbenchView) => void;
}): React.JSX.Element {
  useViewSettingsSync({
    viewId: 'v-1234abcd',
    entryPath: 'src/main.ts',
    graphicsRef,
    cadRef,
    editorRef,
    record,
    recordLocalPatch,
    recordReady: true,
    writeRecord,
    onRecordApplied,
  });
  return <div data-testid='view-sync' />;
}

const graphics = () =>
  createActor(
    graphicsMachine.provide({
      actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) },
    }),
    { input: {} },
  ).start();

const cadFixtures = new WeakMap<ActorRefFrom<typeof cadMachine>, ReturnType<typeof createMockRuntimeDocument>>();

const cad = () => {
  const fixture = createMockRuntimeDocument();
  const actor = createActor(
    cadMachine.provide({
      actors: {
        connectKernelActor: fromSafeAsync(
          async (): Promise<{
            type: 'kernelConnected';
            client: ReturnType<typeof createMockRuntimeClient>;
            cleanups: Array<() => void>;
          }> => {
            const client = createMockRuntimeClient();
            vi.mocked(client.open).mockReturnValue(fixture.document);
            return { type: 'kernelConnected', client, cleanups: [] };
          },
        ),
      },
    }),
    {
      input: {
        shouldInitializeKernelOnStart: false,
        kernelOptionsFactory: async () => () => mock<ReturnType<KernelOptionsFactory>>(),
        fileSystemRoot: '/projects/test',
      },
    },
  ).start();
  cadFixtures.set(actor, fixture);
  return actor;
};

const editor = () =>
  mock<ActorRefFrom<typeof editorMachine>>({
    send: vi.fn(),
    getSnapshot: () =>
      mock<ReturnType<ActorRefFrom<typeof editorMachine>['getSnapshot']>>({
        context: { graphicsBackendPreferences: {} },
      }),
  });

describe('view record owner synchronization', () => {
  it.each([
    { instruction: 'look', camera: { kind: 'look', direction: [0, -1, 0] } },
    {
      instruction: 'front preset',
      camera: { kind: 'preset', preset: 'front' },
    },
  ] as const)('keeps a $instruction instruction through the first real geometry frame', async ({ camera }) => {
    const graphicsRef = graphics();
    const editorRef = editor();
    const record = workbenchRecords.view.schema.parse({
      ...initial(),
      camera,
    });
    const writeRecord = vi.fn(async (_next: WorkbenchView) => true);
    const view = render(
      <GraphicsProvider graphicsRef={graphicsRef}>
        <Harness graphicsRef={graphicsRef} editorRef={editorRef} record={record} writeRecord={writeRecord} />
      </GraphicsProvider>,
    );
    const session = getViewCameraSession(graphicsRef);
    await waitFor(() => {
      expect(session.rig.actorRef.getSnapshot().context.view.direction).toEqual([0, -1, 0]);
    });
    measure(graphicsRef);
    expect(isFramed(graphicsRef)).toBe(true);
    expect(session.rig.actorRef.getSnapshot().context.view.direction).toEqual([0, -1, 0]);
    expect(session.rig.actorRef.getSnapshot().context.view.verticalSpan).toBeGreaterThan(4);
    view.unmount();
    graphicsRef.stop();
  });
  it.each([
    { instruction: 'look', camera: { kind: 'look', direction: [0, -1, 0] } },
    {
      instruction: 'front preset',
      camera: { kind: 'preset', preset: 'front' },
    },
  ] as const)(
    'does not persist the first glTF frame over an adopted $instruction but persists a later orbit',
    async ({ camera }) => {
      const graphicsRef = graphics();
      const cadRef = cad();
      await vi.waitFor(() => {
        expect(cadRef.getSnapshot().value).not.toBe('connecting');
      });
      const editorRef = editor();
      const record = workbenchRecords.view.schema.parse({
        ...initial(),
        camera,
      });
      const writeRecord = vi.fn(async (_next: WorkbenchView) => true);
      const view = render(
        <GraphicsProvider graphicsRef={graphicsRef}>
          <Harness
            graphicsRef={graphicsRef}
            cadRef={cadRef}
            editorRef={editorRef}
            record={record}
            writeRecord={writeRecord}
          />
        </GraphicsProvider>,
      );
      const session = getViewCameraSession(graphicsRef);
      await waitFor(() => {
        expect(session.rig.actorRef.getSnapshot().context.view.direction).toEqual([0, -1, 0]);
      });
      act(() => {
        cadRef.send({ type: 'setEntryPath', entryPath: 'src/main.ts' });
      });
      await waitFor(() => {
        expect(cadRef.getSnapshot().context.defaultView).toBeDefined();
      });
      const fixture = cadFixtures.get(cadRef)!;
      act(() => {
        fixture.emitRendered(fixture.rendering);
      });
      await waitFor(() => {
        const { rendering } = cadRef.getSnapshot().context;
        expect(rendering?.success ? rendering.artifact.mimeType : undefined).toBe('model/gltf-binary');
      });
      measure(graphicsRef);
      expect(isFramed(graphicsRef)).toBe(true);
      expect(session.rig.actorRef.getSnapshot().context.view.direction).toEqual([0, -1, 0]);
      const firstFrame = session.rig.actorRef.getSnapshot().context.view;
      await new Promise((resolve) => {
        setTimeout(resolve, 350);
      });
      expect(
        writeRecord.mock.calls
          .map(([next]) => next.camera)
          .filter((next) => JSON.stringify(next) !== JSON.stringify(record.camera)),
      ).toEqual([]);
      writeRecord.mockClear();
      act(() =>
        session.rig.actorRef.send({
          type: 'poseObserved',
          source: 'input',
          target: [1, 2, 3],
          direction: [1, 0, 0],
          up: [0, 0, 1],
          verticalSpan: 5,
        }),
      );
      await waitFor(() => {
        expect(
          writeRecord.mock.calls.some(
            ([next]) => next.camera.kind === 'pose' && JSON.stringify(next.camera.target) === JSON.stringify([1, 2, 3]),
          ),
        ).toBe(true);
      });
      writeRecord.mockClear();
      act(() =>
        session.rig.actorRef.send({
          type: 'poseObserved',
          source: 'input',
          target: firstFrame.target,
          direction: firstFrame.direction,
          up: firstFrame.up,
          verticalSpan: firstFrame.verticalSpan,
          perspectiveZoom: firstFrame.perspectiveZoom,
        }),
      );
      await waitFor(() => {
        expect(
          writeRecord.mock.calls.some(
            ([next]) => next.camera.kind === 'pose' && next.camera.verticalSpan === firstFrame.verticalSpan,
          ),
        ).toBe(true);
      });
      view.unmount();
      cadRef.stop();
      graphicsRef.stop();
    },
  );
  it('waits for camera settle before acknowledging combined camera and section adoption', async () => {
    const graphicsRef = graphics();
    const editorRef = editor();
    const writeRecord = vi.fn(async (_next: WorkbenchView) => true);
    const onRecordApplied = vi.fn();
    const base = initial();
    const draw = (record: WorkbenchView) => (
      <GraphicsProvider graphicsRef={graphicsRef}>
        <Harness
          graphicsRef={graphicsRef}
          editorRef={editorRef}
          record={record}
          writeRecord={writeRecord}
          onRecordApplied={onRecordApplied}
        />
      </GraphicsProvider>
    );
    const { rerender, unmount } = render(draw(base));
    const rig = getViewCameraSession(graphicsRef).rig.actorRef;
    await waitFor(() => {
      expect(onRecordApplied).toHaveBeenCalledWith(base);
    });
    onRecordApplied.mockClear();
    act(() =>
      rig.send({
        type: 'poseObserved',
        source: 'input',
        target: [0, 0, 0],
        direction: [1, 0, 0],
        up: [0, 0, 1],
        verticalSpan: 5,
      }),
    );
    const changed = workbenchRecords.view.schema.parse({
      ...base,
      camera: { kind: 'preset', preset: 'front' },
      section: {
        active: true,
        cuts: [{ kind: 'plane', plane: 'xz', offset: 2, isFlipped: false }],
      },
    });
    rerender(draw(changed));
    expect(onRecordApplied).not.toHaveBeenCalledWith(changed);
    await waitFor(() => {
      expect(onRecordApplied).toHaveBeenCalledWith(changed);
    });
    expect(rig.getSnapshot().context.view.direction).toEqual([0, -1, 0]);
    unmount();
    graphicsRef.stop();
  });
  it('adopts a watched front view, display, grid, section and pinned measurements through live owners', async () => {
    const graphicsRef = graphics();
    const editorRef = editor();
    const writeRecord = vi.fn(async (_next: WorkbenchView) => true);
    const record = workbenchRecords.view.schema.parse({
      ...initial(),
      camera: { kind: 'preset', preset: 'front' },
      display: { ...initial().display, grid: false },
      grid: { unit: 'in' },
      section: {
        active: true,
        cuts: [{ kind: 'plane', plane: 'xz', offset: 2, isFlipped: false }],
      },
      measurements: [
        {
          id: 'm1',
          frameId: 'tau:root',
          startPoint: [0, 0, 0],
          endPoint: [1, 0, 0],
          distance: 1,
        },
      ],
    });
    render(
      <GraphicsProvider graphicsRef={graphicsRef}>
        <Harness graphicsRef={graphicsRef} editorRef={editorRef} record={record} writeRecord={writeRecord} />
      </GraphicsProvider>,
    );
    await waitFor(() => {
      const { context } = graphicsRef.getSnapshot();
      expect(context.enableGrid).toBe(false);
      expect(context.displayUnits.length.symbol).toBe('in');
      expect(context.isSectionViewActive).toBe(true);
      expect(context.sectionCuts).toMatchObject([{ kind: 'plane', plane: 'xz', offset: 2 }]);
      expect(context.measurements).toMatchObject([{ id: 'm1', isPinned: true }]);
      expect(getViewCameraSession(graphicsRef).rig.actorRef.getSnapshot().context.view.direction).toEqual([0, -1, 0]);
    });
    graphicsRef.stop();
  });

  it('writes the person-selected grid unit to the view record and never mirrors portable state to editor', async () => {
    const graphicsRef = graphics();
    const editorRef = editor();
    const writeRecord = vi.fn(async (_next: WorkbenchView) => true);
    const record = initial();
    const { unmount } = render(
      <GraphicsProvider graphicsRef={graphicsRef}>
        <Harness graphicsRef={graphicsRef} editorRef={editorRef} record={record} writeRecord={writeRecord} />
      </GraphicsProvider>,
    );
    await waitFor(() => expect(graphicsRef.getSnapshot().context.displayUnits.length.symbol).toBe('mm'));
    writeRecord.mockClear();
    act(() => graphicsRef.send({ type: 'setGridUnit', payload: { unit: 'ft' } }));
    await waitFor(() => expect(writeRecord).toHaveBeenCalledWith(expect.objectContaining({ grid: { unit: 'ft' } })));
    expect(editorRef.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'updateViewSettings' }));
    const persisted = writeRecord.mock.lastCall?.[0];
    expect(persisted).toBeDefined();
    unmount();
    graphicsRef.stop();
    const reloaded = graphics();
    const replay = render(
      <GraphicsProvider graphicsRef={reloaded}>
        <Harness graphicsRef={reloaded} editorRef={editorRef} record={persisted!} writeRecord={writeRecord} />
      </GraphicsProvider>,
    );
    await waitFor(() => expect(reloaded.getSnapshot().context.displayUnits.length.symbol).toBe('ft'));
    replay.unmount();
    reloaded.stop();
  });

  it('keeps a preset camera instruction through adoption instead of bouncing it into a pose write', async () => {
    const graphicsRef = graphics();
    const editorRef = editor();
    const writeRecord = vi.fn(async (_next: WorkbenchView) => true);
    const record = workbenchRecords.view.schema.parse({
      ...initial(),
      camera: { kind: 'look', direction: [0, -1, 0] },
    });
    render(
      <GraphicsProvider graphicsRef={graphicsRef}>
        <Harness graphicsRef={graphicsRef} editorRef={editorRef} record={record} writeRecord={writeRecord} />
      </GraphicsProvider>,
    );
    await waitFor(() =>
      expect(getViewCameraSession(graphicsRef).rig.actorRef.getSnapshot().context.view.direction).toEqual([0, -1, 0]),
    );
    await new Promise((resolve) => {
      setTimeout(resolve, 300);
    });
    expect(writeRecord.mock.calls.every(([next]) => next.camera.kind === 'look')).toBe(true);
    graphicsRef.stop();
  });

  it('does not reset a live orbit when a foreign grid-only view edit arrives', async () => {
    const graphicsRef = graphics();
    const editorRef = editor();
    const writeRecord = vi.fn(async (_next: WorkbenchView) => true);
    const front = workbenchRecords.view.schema.parse({
      ...initial(),
      camera: { kind: 'preset', preset: 'front' },
    });
    const renderHarness = (record: WorkbenchView) => (
      <GraphicsProvider graphicsRef={graphicsRef}>
        <Harness graphicsRef={graphicsRef} editorRef={editorRef} record={record} writeRecord={writeRecord} />
      </GraphicsProvider>
    );
    const { rerender, unmount } = render(renderHarness(front));
    const rig = getViewCameraSession(graphicsRef).rig.actorRef;
    await waitFor(() => expect(rig.getSnapshot().context.view.direction).toEqual([0, -1, 0]));
    act(() =>
      rig.send({
        type: 'poseObserved',
        source: 'input',
        target: [0, 0, 0],
        direction: [1, 0, 0],
        up: [0, 0, 1],
        verticalSpan: 5,
      }),
    );
    rerender(renderHarness({ ...front, grid: { unit: 'in' } }));
    expect(rig.getSnapshot().context.view.direction).toEqual([1, 0, 0]);
    await new Promise((resolve) => {
      setTimeout(resolve, 300);
    });
    expect(rig.getSnapshot().context.view.direction).toEqual([1, 0, 0]);
    unmount();
    graphicsRef.stop();
  });

  it('should keep the latest camera pose when an earlier local pose write echoes from the record', async () => {
    const graphicsRef = graphics();
    const editorRef = editor();
    const writeRecord = vi.fn(async (_next: WorkbenchView) => true);
    const record = initial();
    const draw = (next: WorkbenchView, recordLocalPatch?: ViewRecordPatch) => (
      <GraphicsProvider graphicsRef={graphicsRef}>
        <Harness
          graphicsRef={graphicsRef}
          editorRef={editorRef}
          record={next}
          recordLocalPatch={recordLocalPatch}
          writeRecord={writeRecord}
        />
      </GraphicsProvider>
    );
    const { rerender, unmount } = render(draw(record));
    const session = getViewCameraSession(graphicsRef);
    const rig = session.rig.actorRef;
    measure(graphicsRef);
    await waitFor(() => expect(rig.getSnapshot().context.view.direction[1]).toBeLessThan(-0.6));
    act(() =>
      rig.send({
        type: 'poseObserved',
        source: 'input',
        target: [0, 0, 0],
        direction: [1, 0, 0],
        up: [0, 0, 1],
        verticalSpan: 4,
      }),
    );
    await waitFor(() =>
      expect(
        writeRecord.mock.calls.some(([next]) => next.camera.kind === 'pose' && next.camera.verticalSpan === 4),
      ).toBe(true),
    );
    const echoed = writeRecord.mock.calls.find(
      ([next]) => next.camera.kind === 'pose' && next.camera.verticalSpan === 4,
    )![0];
    act(() =>
      rig.send({
        type: 'poseObserved',
        source: 'input',
        target: [0, 0, 0],
        direction: [1, 0, 0],
        up: [0, 0, 1],
        verticalSpan: 2,
      }),
    );
    rerender(draw({ ...echoed }, { camera: echoed.camera }));
    await new Promise((resolve) => {
      setTimeout(resolve, 350);
    });
    expect(rig.getSnapshot().context.view.verticalSpan).toBe(2);
    unmount();
    graphicsRef.stop();
  });

  it('persists the settled pose after the same camera gesture changes field of view', async () => {
    const graphicsRef = graphics();
    const editorRef = editor();
    const writeRecord = vi.fn(async (_next: WorkbenchView) => true);
    const record = initial();
    const { unmount } = render(
      <GraphicsProvider graphicsRef={graphicsRef}>
        <Harness graphicsRef={graphicsRef} editorRef={editorRef} record={record} writeRecord={writeRecord} />
      </GraphicsProvider>,
    );
    const session = getViewCameraSession(graphicsRef);
    const rig = session.rig.actorRef;
    measure(graphicsRef);
    await waitFor(() => expect(rig.getSnapshot().context.view.direction[1]).toBeLessThan(-0.6));
    act(() => {
      rig.send({
        type: 'poseObserved',
        source: 'input',
        target: [1, 2, 3],
        direction: [1, 0, 0],
        up: [0, 0, 1],
        verticalSpan: 4,
      });
      rig.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 38 });
    });
    await waitFor(() => expect(writeRecord.mock.calls.some(([next]) => next.fieldOfView === 38)).toBe(true));
    await waitFor(
      () =>
        expect(
          writeRecord.mock.calls.some(
            ([next]) => next.camera.kind === 'pose' && next.camera.verticalSpan === 4 && next.fieldOfView === 38,
          ),
        ).toBe(true),
      { timeout: 1000 },
    );
    unmount();
    graphicsRef.stop();
  });

  it('should keep newer live fields on a local receipt while applying unrelated foreign fields', async () => {
    const graphicsRef = graphics();
    const editorRef = editor();
    const writeRecord = vi.fn(async (_next: WorkbenchView) => true);
    const base = initial();
    const draw = (record: WorkbenchView, recordLocalPatch?: ViewRecordPatch) => (
      <GraphicsProvider graphicsRef={graphicsRef}>
        <Harness
          graphicsRef={graphicsRef}
          editorRef={editorRef}
          record={record}
          recordLocalPatch={recordLocalPatch}
          writeRecord={writeRecord}
        />
      </GraphicsProvider>
    );
    const { rerender, unmount } = render(draw(base));
    const rig = getViewCameraSession(graphicsRef).rig.actorRef;
    const cut = {
      kind: 'plane',
      plane: 'xz',
      offset: 2,
      isFlipped: false,
    } as const;
    const section = { active: true, cuts: [cut] };
    act(() => {
      graphicsRef.send({ type: 'setSurfaceVisibility', payload: false });
      graphicsRef.send({ type: 'setGridUnit', payload: { unit: 'ft' } });
      graphicsRef.send({ type: 'adoptSectionView', section });
      rig.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 45 });
    });
    act(() => {
      graphicsRef.send({ type: 'setSurfaceVisibility', payload: true });
      graphicsRef.send({ type: 'setGridUnit', payload: { unit: 'cm' } });
      graphicsRef.send({
        type: 'adoptSectionView',
        section: { active: false, cuts: [] },
      });
      rig.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 30 });
    });
    const receipt = workbenchRecords.view.schema.parse({
      ...base,
      camera: { kind: 'preset', preset: 'front' },
      fieldOfView: 45,
      display: { ...base.display, surfaces: false, lines: false },
      grid: { unit: 'ft' },
      section,
    });
    rerender(
      draw(receipt, {
        display: { surfaces: false },
        grid: { unit: 'ft' },
        fieldOfView: 45,
        section,
      }),
    );
    await waitFor(() => expect(rig.getSnapshot().context.view.direction).toEqual([0, -1, 0]));
    expect(graphicsRef.getSnapshot().context.enableSurfaces).toBe(true);
    expect(graphicsRef.getSnapshot().context.enableLines).toBe(false);
    expect(graphicsRef.getSnapshot().context.displayUnits.length.symbol).toBe('cm');
    expect(graphicsRef.getSnapshot().context.isSectionViewActive).toBe(false);
    expect(rig.getSnapshot().context.view.requestedVerticalFieldOfView).toBe(30);
    unmount();
    graphicsRef.stop();
  });

  it('should cancel pending foreign camera and section adoption when a newer local receipt owns those fields', async () => {
    const graphicsRef = graphics();
    const editorRef = editor();
    const writeRecord = vi.fn(async (_next: WorkbenchView) => true);
    const base = initial();
    const draw = (record: WorkbenchView, recordLocalPatch?: ViewRecordPatch) => (
      <GraphicsProvider graphicsRef={graphicsRef}>
        <Harness
          graphicsRef={graphicsRef}
          editorRef={editorRef}
          record={record}
          recordLocalPatch={recordLocalPatch}
          writeRecord={writeRecord}
        />
      </GraphicsProvider>
    );
    const { rerender, unmount } = render(draw(base));
    const rig = getViewCameraSession(graphicsRef).rig.actorRef;
    act(() => {
      rig.send({
        type: 'poseObserved',
        source: 'input',
        target: [0, 0, 0],
        direction: [1, 0, 0],
        up: [0, 0, 1],
        verticalSpan: 2,
      });
      graphicsRef.send({ type: 'setSectionViewActive', payload: true });
      graphicsRef.send({ type: 'setSectionViewActive', payload: false });
    });
    const foreign = workbenchRecords.view.schema.parse({
      ...base,
      camera: { kind: 'preset', preset: 'front' },
      section: {
        active: true,
        cuts: [{ kind: 'plane', plane: 'xz', offset: 2, isFlipped: false }],
      },
    });
    rerender(draw(foreign));
    const { view } = rig.getSnapshot().context;
    const local = workbenchRecords.view.schema.parse({
      ...foreign,
      camera: {
        kind: 'pose',
        frameId: view.frameId,
        target: view.target,
        direction: view.direction,
        up: view.up,
        verticalSpan: view.verticalSpan,
        perspectiveZoom: view.perspectiveZoom,
      },
      section: { active: false, cuts: [] },
    });
    rerender(draw(local, { camera: local.camera, section: local.section }));
    await new Promise((resolve) => {
      setTimeout(resolve, 350);
    });
    expect(rig.getSnapshot().context.view.direction).toEqual([1, 0, 0]);
    expect(graphicsRef.getSnapshot().context.isSectionViewActive).toBe(false);
    unmount();
    graphicsRef.stop();
  });

  it('keeps a deferred foreign camera instruction through a later grid edit', async () => {
    const graphicsRef = graphics();
    const editorRef = editor();
    const writeRecord = vi.fn(async (_next: WorkbenchView) => true);
    const initialRecord = initial();
    const draw = (record: WorkbenchView) => (
      <GraphicsProvider graphicsRef={graphicsRef}>
        <Harness graphicsRef={graphicsRef} editorRef={editorRef} record={record} writeRecord={writeRecord} />
      </GraphicsProvider>
    );
    const { rerender, unmount } = render(draw(initialRecord));
    const rig = getViewCameraSession(graphicsRef).rig.actorRef;
    await waitFor(() => expect(rig.getSnapshot().context.view.direction[1]).toBeLessThan(-0.6));
    act(() =>
      rig.send({
        type: 'poseObserved',
        source: 'input',
        target: [0, 0, 0],
        direction: [1, 0, 0],
        up: [0, 0, 1],
        verticalSpan: 5,
      }),
    );
    const front: WorkbenchView = {
      ...initialRecord,
      camera: { kind: 'preset', preset: 'front' },
    };
    rerender(draw(front));
    expect(rig.getSnapshot().context.view.direction).toEqual([1, 0, 0]);
    rerender(draw({ ...front, grid: { unit: 'in' } }));
    await waitFor(() => expect(graphicsRef.getSnapshot().context.displayUnits.length.symbol).toBe('in'));
    await waitFor(() => expect(rig.getSnapshot().context.view.direction).toEqual([0, -1, 0]), { timeout: 1000 });
    unmount();
    graphicsRef.stop();
  });

  it('adopts and persists a named projection camera without replacing the default camera', async () => {
    const graphicsRef = graphics();
    const editorRef = editor();
    const writeRecord = vi.fn(async (_next: WorkbenchView) => true);
    const base = workbenchRecords.view.schema.parse({
      ...initial(),
      camera: { kind: 'preset', preset: 'front' },
      kernelViews: [{ id: 'drawing', camera: { kind: 'preset', preset: 'right' } }],
    });
    const draw = (record: WorkbenchView) => (
      <GraphicsProvider graphicsRef={graphicsRef}>
        <Harness graphicsRef={graphicsRef} editorRef={editorRef} record={record} writeRecord={writeRecord} />
      </GraphicsProvider>
    );
    const pane = render(draw(base));
    const session = getViewCameraSession(graphicsRef);
    const rig = session.rig.actorRef;
    await waitFor(() => expect(rig.getSnapshot().context.view.direction).toEqual([0, -1, 0]));

    pane.rerender(draw({ ...base, selectedKernelView: 'drawing' }));
    await waitFor(() => expect(rig.getSnapshot().context.view.direction).toEqual([1, 0, 0]));
    measure(graphicsRef);
    writeRecord.mockClear();
    act(() =>
      rig.send({
        type: 'poseObserved',
        source: 'input',
        target: [1, 2, 3],
        direction: [0, 1, 0],
        up: [0, 0, 1],
        verticalSpan: 5,
      }),
    );
    await waitFor(() =>
      expect(
        writeRecord.mock.calls.some(
          ([next]) => next.kernelViews?.find((view) => view.id === 'drawing')?.camera?.kind === 'pose',
        ),
      ).toBe(true),
    );
    const saved = writeRecord.mock.calls.at(-1)?.[0];
    expect(saved?.camera).toEqual(base.camera);
    expect(saved?.kernelViews?.find((view) => view.id === 'drawing')?.camera).toMatchObject({
      kind: 'pose',
      target: [1, 2, 3],
    });
    pane.unmount();
    graphicsRef.stop();
  });
});

// ── Characterisation under fake timers (graphics event-driven state charter, G0.3) ─────────────────
/* These rows lock today's settle-window behaviour before the view binding moves into a machine (charter D14).
 * Rows named "today" describe behaviour a later package changes on purpose: G3 drops a foreign pose that arrives
 * during a drag (D15), and G6b stops saving an automatic refit (D20). Every other row is kept as written. */
describe('useViewSettingsSync settle-window characterisation', () => {
  const settle = 250;
  const advance = (ms: number): void => {
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  };
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
  const poseWrites = (writeRecord: ReturnType<typeof vi.fn<(next: WorkbenchView) => Promise<boolean>>>) =>
    writeRecord.mock.calls.map(([next]) => next.camera).filter((camera) => camera.kind === 'pose');

  const disposers: Array<() => void> = [];

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    for (const dispose of disposers.splice(0)) {
      dispose();
    }
    vi.useRealTimers();
  });

  function mount(record: WorkbenchView) {
    const graphicsRef = graphics();
    const editorRef = editor();
    const writeRecord = vi.fn(async (_next: WorkbenchView) => true);
    const draw = (next: WorkbenchView, recordLocalPatch?: ViewRecordPatch) => (
      <GraphicsProvider graphicsRef={graphicsRef}>
        <Harness
          graphicsRef={graphicsRef}
          editorRef={editorRef}
          record={next}
          recordLocalPatch={recordLocalPatch}
          writeRecord={writeRecord}
        />
      </GraphicsProvider>
    );
    const view = render(draw(record));
    disposers.push(() => {
      view.unmount();
      graphicsRef.stop();
    });
    const session = getViewCameraSession(graphicsRef);
    return {
      graphicsRef,
      writeRecord,
      session,
      rig: session.rig.actorRef,
      rerender: (next: WorkbenchView, recordLocalPatch?: ViewRecordPatch) => {
        view.rerender(draw(next, recordLocalPatch));
      },
    };
  }

  it('today waits for the drag to go quiet, then applies a foreign pose and loses the drag pose (G3 flips, D15)', () => {
    const base = initial();
    const harness = mount(base);
    measure(harness.graphicsRef);
    advance(settle * 4);
    harness.writeRecord.mockClear();
    const drag = (step: number) => {
      act(() => {
        harness.rig.send({ type: 'poseObserved', source: 'input', ...pose([1, 0, 0], 4 + step / 10) });
      });
    };
    drag(0);
    advance(50);
    const foreign = workbenchRecords.view.schema.parse({ ...base, camera: pose([0, 1, 0], 9) });
    harness.rerender(foreign);
    expect(harness.rig.getSnapshot().context.view.direction).toEqual([1, 0, 0]);
    for (let step = 1; step <= 10; step += 1) {
      advance(50);
      expect(harness.rig.getSnapshot().context.view.direction).toEqual([1, 0, 0]);
      drag(step);
    }
    advance(settle - 1);
    expect(harness.rig.getSnapshot().context.view.direction).toEqual([1, 0, 0]);
    advance(1);
    expect(harness.rig.getSnapshot().context.view).toMatchObject({ direction: [0, 1, 0], verticalSpan: 9 });
    advance(settle * 4);
    expect(harness.rig.getSnapshot().context.view.direction).toEqual([0, 1, 0]);
    expect(poseWrites(harness.writeRecord).filter((camera) => camera.direction[0] === 1)).toEqual([]);
  });

  it('should apply a foreign pose at once while the camera is idle', () => {
    const base = initial();
    const harness = mount(base);
    measure(harness.graphicsRef);
    advance(settle * 4);
    const foreign = workbenchRecords.view.schema.parse({ ...base, camera: pose([0, 1, 0], 9) });
    harness.rerender(foreign);
    expect(harness.rig.getSnapshot().context.view).toMatchObject({ direction: [0, 1, 0], verticalSpan: 9 });
  });

  it('should never write an adopted pose back over the foreign instruction it came from', () => {
    const base = initial();
    const harness = mount(base);
    measure(harness.graphicsRef);
    advance(settle * 4);
    harness.writeRecord.mockClear();
    const foreign = workbenchRecords.view.schema.parse({ ...base, camera: { kind: 'preset', preset: 'front' } });
    harness.rerender(foreign);
    expect(harness.rig.getSnapshot().context.view.direction).toEqual([0, -1, 0]);
    harness.writeRecord.mockClear();
    advance(settle * 4);
    /* The adoption moved the rig, so the settle callback ran and wrote; it kept the instruction, not the pose. */
    expect(harness.writeRecord).toHaveBeenCalled();
    expect(harness.writeRecord.mock.calls.map(([next]) => next.camera)).toEqual(
      harness.writeRecord.mock.calls.map(() => foreign.camera),
    );
  });

  it('should never apply an own echo while a newer local pose is live', () => {
    const base = initial();
    const harness = mount(base);
    measure(harness.graphicsRef);
    advance(settle * 4);
    act(() => {
      harness.rig.send({ type: 'poseObserved', source: 'input', ...pose([1, 0, 0], 4) });
    });
    advance(settle);
    const echoed = harness.writeRecord.mock.calls.findLast(
      ([next]) => next.camera.kind === 'pose' && next.camera.verticalSpan === 4,
    )?.[0];
    expect(echoed).toBeDefined();
    act(() => {
      harness.rig.send({ type: 'poseObserved', source: 'input', ...pose([1, 0, 0], 2) });
    });
    harness.rerender(echoed!, { camera: echoed!.camera });
    for (let elapsed = 0; elapsed < settle * 4; elapsed += 50) {
      advance(50);
      expect(harness.rig.getSnapshot().context.view.verticalSpan).toBe(2);
    }
  });

  it('should leave a live pose alone when a foreign grid-only edit arrives during a drag', () => {
    const base = workbenchRecords.view.schema.parse({ ...initial(), camera: pose([0, 1, 0], 9) });
    const harness = mount(base);
    measure(harness.graphicsRef);
    advance(settle * 4);
    act(() => {
      harness.rig.send({ type: 'poseObserved', source: 'input', ...pose([1, 0, 0], 4) });
    });
    harness.rerender({ ...base, grid: { unit: 'in' } });
    expect(harness.graphicsRef.getSnapshot().context.displayUnits.length.symbol).toBe('in');
    for (let elapsed = 0; elapsed < settle * 4; elapsed += 50) {
      advance(50);
      expect(harness.rig.getSnapshot().context.view).toMatchObject({ direction: [1, 0, 0], verticalSpan: 4 });
    }
    expect(poseWrites(harness.writeRecord).some((camera) => camera.verticalSpan === 4)).toBe(true);
  });

  describe('framing', () => {
    const smallBounds = 2;
    const largeBounds = 8;

    function mountFramed(record: WorkbenchView) {
      const graphicsRef = graphics();
      const editorRef = editor();
      const writeRecord = vi.fn(async (_next: WorkbenchView) => true);
      const view = render(
        <GraphicsProvider graphicsRef={graphicsRef}>
          <Harness graphicsRef={graphicsRef} editorRef={editorRef} record={record} writeRecord={writeRecord} />
        </GraphicsProvider>,
      );
      disposers.push(() => {
        view.unmount();
        graphicsRef.stop();
      });
      const session = getViewCameraSession(graphicsRef);
      return {
        graphicsRef,
        writeRecord,
        session,
        rig: session.rig.actorRef,
        frame: (_radius: number, half: number) => {
          measure(graphicsRef, half);
        },
      };
    }

    it('should never write the first automatic frame', () => {
      const harness = mountFramed(initial());
      advance(settle * 4);
      harness.frame(4, smallBounds);
      expect(isFramed(harness.graphicsRef)).toBe(true);
      expect(harness.rig.getSnapshot().context.lastChange.source).toBe('persisted');
      advance(settle * 4);
      expect(poseWrites(harness.writeRecord)).toEqual([]);
    });

    it('should never write the first automatic frame after a field of view change inside its settle window', () => {
      const harness = mountFramed(initial());
      advance(settle * 4);
      harness.frame(4, smallBounds);
      act(() => {
        harness.rig.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 30 });
      });
      expect(harness.rig.getSnapshot().context.lastChange.source).toBe('fov');
      advance(settle * 4);
      expect(poseWrites(harness.writeRecord)).toEqual([]);
    });

    it('should save a first drag that a viewport change follows inside the first settle window', () => {
      const harness = mountFramed(initial());
      advance(settle * 4);
      harness.frame(4, smallBounds);
      act(() => {
        harness.rig.send({ type: 'poseObserved', source: 'input', ...pose([1, 0, 0], 40) });
      });
      act(() => {
        harness.rig.send({
          type: 'setViewport',
          viewport: { ...harness.rig.getSnapshot().context.view.viewport, width: 640 },
        });
      });
      expect(harness.rig.getSnapshot().context.lastChange.source).toBe('viewport');
      advance(settle * 4);
      expect(poseWrites(harness.writeRecord).at(-1)).toMatchObject({ direction: [1, 0, 0], verticalSpan: 40 });
    });

    it('should never write the first automatic frame of an entry switched away from and back to', () => {
      const harness = mountFramed(initial());
      advance(settle * 4);
      harness.frame(4, smallBounds);
      act(() => {
        harness.rig.send({ type: 'poseObserved', source: 'input', ...pose([1, 0, 0], 40) });
      });
      advance(settle * 4);
      expect(poseWrites(harness.writeRecord).at(-1)).toMatchObject({ verticalSpan: 40 });
      harness.writeRecord.mockClear();
      act(() => {
        harness.graphicsRef.send({ type: 'entryChanged', identity: 'src/other.ts' });
        harness.graphicsRef.send({ type: 'entryChanged', identity: 'src/main.ts' });
      });
      measure(harness.graphicsRef, smallBounds, 'cube-returned');
      expect(isFramed(harness.graphicsRef)).toBe(true);
      expect(['framing', 'persisted']).toContain(harness.rig.getSnapshot().context.lastChange.source);
      advance(settle * 4);
      expect(poseWrites(harness.writeRecord)).toEqual([]);
    });

    it('should keep the entry on screen framed when a record for another entry arrives', () => {
      const graphicsRef = graphics();
      const editorRef = editor();
      const writeRecord = vi.fn(async (_next: WorkbenchView) => true);
      const record = initial();
      const draw = (next: WorkbenchView) => (
        <GraphicsProvider graphicsRef={graphicsRef}>
          <Harness graphicsRef={graphicsRef} editorRef={editorRef} record={next} writeRecord={writeRecord} />
        </GraphicsProvider>
      );
      const view = render(draw(record));
      disposers.push(() => {
        view.unmount();
        graphicsRef.stop();
      });
      advance(settle * 4);
      // The pane shows another entry than the record names, and framing has framed it.
      act(() => {
        graphicsRef.send({ type: 'entryChanged', identity: 'src/other.ts' });
      });
      measure(graphicsRef, smallBounds, 'cube-other');
      expect(isFramed(graphicsRef)).toBe(true);
      const camera = graphicsRef.getSnapshot().context.cameraRef;
      const shown = camera.getSnapshot().context.view;

      view.rerender(draw({ ...record, camera: { kind: 'preset', preset: 'front' } }));
      advance(settle * 4);
      expect(isFramed(graphicsRef)).toBe(true);
      expect(selectGraphicsFramingIdentity(graphicsRef.getSnapshot())).toBe('src/other.ts');
      // The record's camera waits for its own entry rather than turning the one on screen.
      expect(camera.getSnapshot().context.view.direction).toEqual(shown.direction);
      expect(poseWrites(writeRecord)).toEqual([]);

      // Once the pane shows the record's entry again, its first frame takes the record's side.
      act(() => {
        graphicsRef.send({ type: 'entryChanged', identity: 'src/main.ts' });
      });
      measure(graphicsRef, smallBounds, 'cube-main');
      advance(settle * 4);
      expect(camera.getSnapshot().context.view.direction).not.toEqual(shown.direction);
      expect(poseWrites(writeRecord)).toEqual([]);
    });

    it("should apply a waiting record's side over its entry's first frame, however late that frame comes", () => {
      const graphicsRef = graphics();
      const editorRef = editor();
      const writeRecord = vi.fn(async (_next: WorkbenchView) => true);
      const record = initial();
      const draw = (next: WorkbenchView) => (
        <GraphicsProvider graphicsRef={graphicsRef}>
          <Harness graphicsRef={graphicsRef} editorRef={editorRef} record={next} writeRecord={writeRecord} />
        </GraphicsProvider>
      );
      const view = render(draw(record));
      disposers.push(() => {
        view.unmount();
        graphicsRef.stop();
      });
      advance(settle * 4);
      // The pane shows another entry than the record names, and framing has framed it.
      act(() => {
        graphicsRef.send({ type: 'entryChanged', identity: 'src/other.ts' });
      });
      measure(graphicsRef, smallBounds, 'cube-other');
      expect(isFramed(graphicsRef)).toBe(true);
      const camera = graphicsRef.getSnapshot().context.cameraRef;
      const shown = camera.getSnapshot().context.view;

      view.rerender(draw({ ...record, camera: { kind: 'preset', preset: 'front' } }));
      advance(settle * 4);
      expect(isFramed(graphicsRef)).toBe(true);
      expect(selectGraphicsFramingIdentity(graphicsRef.getSnapshot())).toBe('src/other.ts');
      // The record's camera waits for its own entry rather than turning the one on screen.
      expect(camera.getSnapshot().context.view.direction).toEqual(shown.direction);
      expect(poseWrites(writeRecord)).toEqual([]);

      // Once the pane shows the record's entry again, its first frame takes the record's side.
      act(() => {
        graphicsRef.send({ type: 'entryChanged', identity: 'src/main.ts' });
      });
      // The build takes longer than the record's retry: the entry waits for its frame when the record is released.
      advance(settle * 4);
      measure(graphicsRef, smallBounds, 'cube-main');
      advance(settle * 4);
      expect(camera.getSnapshot().context.lastChange.source).toBe('persisted');
      expect(camera.getSnapshot().context.view.direction).not.toEqual(shown.direction);
      expect(poseWrites(writeRecord)).toEqual([]);
    });

    it('today saves an automatic refit after the bounds grow by more than 10 % (G6b flips, D20)', () => {
      const harness = mountFramed(initial());
      advance(settle * 4);
      harness.frame(4, smallBounds);
      advance(settle * 4);
      const firstFrame = harness.rig.getSnapshot().context.view;
      harness.frame(16, largeBounds);
      const refit = harness.rig.getSnapshot().context.view;
      expect(refit.verticalSpan).toBeGreaterThan(firstFrame.verticalSpan);
      advance(settle * 4);
      expect(poseWrites(harness.writeRecord).at(-1)).toMatchObject({ verticalSpan: refit.verticalSpan });
    });

    it('should save a Fit view the person commanded (kept by D20)', () => {
      const harness = mountFramed(initial());
      advance(settle * 4);
      harness.frame(4, smallBounds);
      advance(settle * 4);
      act(() => {
        harness.rig.send({ type: 'poseObserved', source: 'input', ...pose([1, 0, 0], 40) });
      });
      advance(settle * 4);
      harness.writeRecord.mockClear();
      act(() => {
        harness.graphicsRef.send({ type: 'fitView' });
      });
      const fitted = harness.rig.getSnapshot().context.view;
      expect(fitted.verticalSpan).toBeLessThan(40);
      advance(settle * 4);
      expect(poseWrites(harness.writeRecord).at(-1)).toMatchObject({ verticalSpan: fitted.verticalSpan });
    });
  });
});
