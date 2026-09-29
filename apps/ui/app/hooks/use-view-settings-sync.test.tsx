// @vitest-environment jsdom
/* oxlint-disable typescript/no-confusing-void-expression -- Testing Library waitFor callbacks are assertions. */
import { act, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createActor, createAsyncLogic } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import { mock } from 'vitest-mock-extended';
import { workbenchRecords } from '@taucad/workbench';
import type { WorkbenchView } from '@taucad/workbench';
import { GraphicsProvider } from '#hooks/use-graphics.js';
import { useViewSettingsSync } from '#hooks/use-view-settings-sync.js';
import { graphicsMachine } from '#machines/graphics.machine.js';
import { cadMachine } from '#machines/cad.machine.js';
import { fromSafeAsync } from '#lib/xstate.lib.js';
import { createMockRuntimeClient } from '@taucad/runtime-testing';
import type { KernelOptionsFactory } from '#types/runtime-client.alias.js';
import type { editorMachine } from '#machines/editor.machine.js';
import { getViewCameraSession } from '#services/graphics-camera-registry.js';
import { useCameraFraming } from '#components/geometry/graphics/three/use-camera-framing.js';
import { Box3, Vector3 } from 'three';

vi.mock('@react-three/fiber', () => ({ useThree: () => ({ size: { width: 800, height: 600 } }) }));

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
  writeRecord,
  onRecordApplied,
}: {
  readonly graphicsRef: ActorRefFrom<typeof graphicsMachine>;
  readonly cadRef?: ActorRefFrom<typeof cadMachine>;
  readonly editorRef: ActorRefFrom<typeof editorMachine>;
  readonly record: WorkbenchView;
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

const cad = () =>
  createActor(
    cadMachine.provide({
      actors: {
        connectKernelActor: fromSafeAsync(
          async (): Promise<{
            type: 'kernelConnected';
            client: ReturnType<typeof createMockRuntimeClient>;
            cleanups: Array<() => void>;
          }> => ({ type: 'kernelConnected', client: createMockRuntimeClient(), cleanups: [] }),
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

const editor = () =>
  mock<ActorRefFrom<typeof editorMachine>>({
    send: vi.fn(),
    // oxlint-disable-next-line typescript/consistent-type-assertions -- Only the selected context field is used by this actor fixture.
    getSnapshot: () =>
      ({ context: { graphicsBackendPreferences: {} } }) as ReturnType<
        ActorRefFrom<typeof editorMachine>['getSnapshot']
      >,
  });

describe('view record owner synchronization', () => {
  it.each([
    { instruction: 'look', camera: { kind: 'look', direction: [0, -1, 0] } },
    { instruction: 'front preset', camera: { kind: 'preset', preset: 'front' } },
  ] as const)('keeps a $instruction instruction through the first real geometry frame', async ({ camera }) => {
    const graphicsRef = graphics();
    const editorRef = editor();
    const record = workbenchRecords.view.schema.parse({ ...initial(), camera });
    const writeRecord = vi.fn(async (_next: WorkbenchView) => true);
    const bounds = new Box3(new Vector3(-2, -2, -2), new Vector3(2, 2, 2));
    function Frame({ radius }: { readonly radius: number }): React.JSX.Element {
      useCameraFraming({ geometryRadius: radius, geometryBounds: bounds });
      return <div />;
    }
    const draw = (radius: number) => (
      <GraphicsProvider graphicsRef={graphicsRef}>
        <Harness graphicsRef={graphicsRef} editorRef={editorRef} record={record} writeRecord={writeRecord} />
        <Frame radius={radius} />
      </GraphicsProvider>
    );
    const view = render(draw(0));
    const session = getViewCameraSession(graphicsRef)!;
    await waitFor(() => {
      expect(session.rig.actorRef.getSnapshot().context.view.direction).toEqual([0, -1, 0]);
    });
    view.rerender(draw(4));
    expect(session.framing.initialized).toBe(true);
    expect(session.rig.actorRef.getSnapshot().context.view.direction).toEqual([0, -1, 0]);
    expect(session.rig.actorRef.getSnapshot().context.view.verticalSpan).toBeGreaterThan(4);
    view.unmount();
    graphicsRef.stop();
  });
  it.each([
    { instruction: 'look', camera: { kind: 'look', direction: [0, -1, 0] } },
    { instruction: 'front preset', camera: { kind: 'preset', preset: 'front' } },
  ] as const)(
    'does not persist the first glTF frame over an adopted $instruction but persists a later orbit',
    async ({ camera }) => {
      const graphicsRef = graphics();
      const cadRef = cad();
      await vi.waitFor(() => {
        expect(cadRef.getSnapshot().value).not.toBe('connecting');
      });
      const editorRef = editor();
      const record = workbenchRecords.view.schema.parse({ ...initial(), camera });
      const writeRecord = vi.fn(async (_next: WorkbenchView) => true);
      const bounds = new Box3(new Vector3(-2, -2, -2), new Vector3(2, 2, 2));
      function Frame({ radius }: { readonly radius: number }): React.JSX.Element {
        useCameraFraming({ geometryRadius: radius, geometryBounds: bounds });
        return <div />;
      }
      const draw = (radius: number) => (
        <GraphicsProvider graphicsRef={graphicsRef}>
          <Harness
            graphicsRef={graphicsRef}
            cadRef={cadRef}
            editorRef={editorRef}
            record={record}
            writeRecord={writeRecord}
          />
          <Frame radius={radius} />
        </GraphicsProvider>
      );
      const view = render(draw(0));
      const session = getViewCameraSession(graphicsRef)!;
      await waitFor(() => {
        expect(session.rig.actorRef.getSnapshot().context.view.direction).toEqual([0, -1, 0]);
      });
      act(() => {
        cadRef.send({ type: 'setEntryPath', entryPath: 'src/main.ts' });
        cadRef.send({
          type: 'geometryComputed',
          geometry: { format: 'gltf', content: new Uint8Array(0), hash: 'test' },
          issues: [],
        });
      });
      await waitFor(() => {
        expect(cadRef.getSnapshot().context.geometry?.format).toBe('gltf');
      });
      view.rerender(draw(4));
      expect(session.framing.initialized).toBe(true);
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
          type: 'setView',
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
          type: 'setView',
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
    const rig = getViewCameraSession(graphicsRef)!.rig.actorRef;
    await waitFor(() => {
      expect(onRecordApplied).toHaveBeenCalledWith(base);
    });
    onRecordApplied.mockClear();
    act(() => rig.send({ type: 'setView', target: [0, 0, 0], direction: [1, 0, 0], up: [0, 0, 1], verticalSpan: 5 }));
    const changed = workbenchRecords.view.schema.parse({
      ...base,
      camera: { kind: 'preset', preset: 'front' },
      section: { active: true, cuts: [{ kind: 'plane', plane: 'xz', offset: 2, isFlipped: false }] },
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
      section: { active: true, cuts: [{ kind: 'plane', plane: 'xz', offset: 2, isFlipped: false }] },
      measurements: [{ id: 'm1', frameId: 'tau:root', startPoint: [0, 0, 0], endPoint: [1, 0, 0], distance: 1 }],
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
      expect(getViewCameraSession(graphicsRef)?.rig.actorRef.getSnapshot().context.view.direction).toEqual([0, -1, 0]);
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
      expect(getViewCameraSession(graphicsRef)?.rig.actorRef.getSnapshot().context.view.direction).toEqual([0, -1, 0]),
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
    const front = workbenchRecords.view.schema.parse({ ...initial(), camera: { kind: 'preset', preset: 'front' } });
    const renderHarness = (record: WorkbenchView) => (
      <GraphicsProvider graphicsRef={graphicsRef}>
        <Harness graphicsRef={graphicsRef} editorRef={editorRef} record={record} writeRecord={writeRecord} />
      </GraphicsProvider>
    );
    const { rerender, unmount } = render(renderHarness(front));
    const rig = getViewCameraSession(graphicsRef)!.rig.actorRef;
    await waitFor(() => expect(rig.getSnapshot().context.view.direction).toEqual([0, -1, 0]));
    act(() => rig.send({ type: 'setView', target: [0, 0, 0], direction: [1, 0, 0], up: [0, 0, 1], verticalSpan: 5 }));
    rerender(renderHarness({ ...front, grid: { unit: 'in' } }));
    expect(rig.getSnapshot().context.view.direction).toEqual([1, 0, 0]);
    await new Promise((resolve) => {
      setTimeout(resolve, 300);
    });
    expect(rig.getSnapshot().context.view.direction).toEqual([1, 0, 0]);
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
    const rig = getViewCameraSession(graphicsRef)!.rig.actorRef;
    await waitFor(() => expect(rig.getSnapshot().context.view.direction[1]).toBeLessThan(-0.6));
    act(() => rig.send({ type: 'setView', target: [0, 0, 0], direction: [1, 0, 0], up: [0, 0, 1], verticalSpan: 5 }));
    const front: WorkbenchView = { ...initialRecord, camera: { kind: 'preset', preset: 'front' } };
    rerender(draw(front));
    expect(rig.getSnapshot().context.view.direction).toEqual([1, 0, 0]);
    rerender(draw({ ...front, grid: { unit: 'in' } }));
    await waitFor(() => expect(graphicsRef.getSnapshot().context.displayUnits.length.symbol).toBe('in'));
    await waitFor(() => expect(rig.getSnapshot().context.view.direction).toEqual([0, -1, 0]), { timeout: 1000 });
    unmount();
    graphicsRef.stop();
  });
});
