// @vitest-environment jsdom
import { useLayoutEffect } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createActor, fromPromise } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import { mock } from 'vitest-mock-extended';
import type { GeometryComponentManifest } from '@taucad/types';
import type { ThreeCameraRig } from '@taucad/three/camera';
import { GraphicsProvider, useCameraRig } from '#hooks/use-graphics.js';
import { useViewSettingsSync } from '#hooks/use-view-settings-sync.js';
import { graphicsMachine } from '#machines/graphics.machine.js';
import type { editorMachine } from '#machines/editor.machine.js';
import { deriveModelInteractionUnitId } from '#machines/model-interaction.machine.js';

const componentId = 'component:Housing';
const unitId = deriveModelInteractionUnitId({ sourceFile: 'src/main.ts' });
type EditorSendEvent = Parameters<ActorRefFrom<typeof editorMachine>['send']>[0];
const capabilities: GeometryComponentManifest['capabilities'] = {
  canHide: true,
  canIsolate: true,
  canFocus: true,
  canAdjustOpacity: true,
  hasDrawings: false,
  hasPreciseTopology: false,
  exports: [{ fidelity: 'mesh', formats: ['glb'], available: true }],
};

function createManifest(): GeometryComponentManifest {
  return {
    schemaVersion: 1,
    sourceFile: 'src/main.ts',
    rootId: 'root',
    nodeOrder: ['root', componentId],
    capabilities,
    nodesById: {
      root: {
        id: 'root',
        name: 'Model',
        kind: 'model',
        selector: 'root',
        childIds: [componentId],
        depth: 0,
        path: ['Model'],
        meshNodeIndices: [],
        primitiveIndices: [],
        materialIndices: [],
        capabilities,
      },
      [componentId]: {
        id: componentId,
        name: 'Housing',
        kind: 'part',
        selector: 'node/0',
        parentId: 'root',
        childIds: [],
        depth: 1,
        path: ['Model', 'Housing'],
        meshNodeIndices: [0],
        primitiveIndices: [0],
        materialIndices: [0],
        capabilities,
      },
    },
  };
}

function SyncHarness({
  graphicsRef,
  editorRef,
  onRig,
  persistCameraView,
  enabled,
}: {
  readonly graphicsRef: ActorRefFrom<typeof graphicsMachine>;
  readonly editorRef: ActorRefFrom<typeof editorMachine>;
  readonly onRig?: (rig: ThreeCameraRig) => void;
  readonly persistCameraView?: boolean | 'pending';
  readonly enabled?: boolean;
}): React.JSX.Element {
  const cameraRig = useCameraRig();
  useViewSettingsSync({
    viewId: 'view-1',
    graphicsRef,
    cadRef: undefined,
    editorRef,
    persistCameraView,
    enabled,
  });
  useLayoutEffect(() => {
    onRig?.(cameraRig);
  }, [cameraRig, onRig]);
  return <div data-testid='sync-harness' />;
}

describe('useViewSettingsSync', () => {
  it('should not persist settings while a live preview owns the view', async () => {
    const graphicsRef = createActor(
      graphicsMachine.provide({ actors: { probeWebGpu: fromPromise(async () => false) } }),
      { input: {} },
    ).start();
    const editorSend = vi.fn<(event: EditorSendEvent) => void>();
    const editorRef = mock<ActorRefFrom<typeof editorMachine>>({ send: editorSend });

    render(
      <GraphicsProvider graphicsRef={graphicsRef}>
        <SyncHarness graphicsRef={graphicsRef} editorRef={editorRef} enabled={false} />
      </GraphicsProvider>,
    );
    act(() => {
      graphicsRef.send({ type: 'setGridVisibility', payload: false });
    });

    await waitFor(() => expect(graphicsRef.getSnapshot().context.enableGrid).toBe(false));
    expect(editorSend).not.toHaveBeenCalled();
    graphicsRef.stop();
  });

  it('should keep model display mutations out of per-view settings', async () => {
    const providedMachine = graphicsMachine.provide({
      actors: {
        probeWebGpu: fromPromise(async () => false),
      },
    });
    const graphicsRef = createActor(providedMachine, { input: {} });
    graphicsRef.start();
    const editorSend = vi.fn<(event: EditorSendEvent) => void>();
    const editorRef = mock<ActorRefFrom<typeof editorMachine>>({
      send: editorSend,
    });

    render(
      <GraphicsProvider graphicsRef={graphicsRef}>
        <SyncHarness graphicsRef={graphicsRef} editorRef={editorRef} />
      </GraphicsProvider>,
    );

    act(() => {
      graphicsRef.send({ type: 'loadModelComponentManifest', unitId, manifest: createManifest(), source: 'viewer' });
      graphicsRef.send({ type: 'setHoveredModelComponent', unitId, componentId, source: 'viewer' });
    });
    expect(editorSend).not.toHaveBeenCalled();

    act(() => {
      graphicsRef.send({ type: 'hideModelComponent', unitId, componentId, source: 'explorer' });
    });
    expect(editorSend).not.toHaveBeenCalled();

    act(() => {
      graphicsRef.send({ type: 'setGridVisibility', payload: false });
    });

    await waitFor(() => {
      expect(editorSend.mock.calls.at(-1)?.[0]).toMatchObject({
        type: 'updateViewSettings',
        viewId: 'view-1',
        settings: { schemaVersion: 10, enableGrid: false },
      });
    });
    expect(editorSend.mock.calls.at(-1)?.[0]).not.toHaveProperty('settings.componentDisplay');
    graphicsRef.stop();
  });

  it('persists canonical camera changes without writing viewport-only revisions', async () => {
    const graphicsRef = createActor(
      graphicsMachine.provide({ actors: { probeWebGpu: fromPromise(async () => false) } }),
      { input: {} },
    ).start();
    const editorSend = vi.fn<(event: EditorSendEvent) => void>();
    const editorRef = mock<ActorRefFrom<typeof editorMachine>>({ send: editorSend });
    let cameraRig: ThreeCameraRig | undefined;

    render(
      <GraphicsProvider graphicsRef={graphicsRef}>
        <SyncHarness
          graphicsRef={graphicsRef}
          editorRef={editorRef}
          onRig={(rig) => {
            cameraRig = rig;
          }}
        />
      </GraphicsProvider>,
    );

    expect(cameraRig).toBeDefined();
    act(() => {
      cameraRig!.actorRef.send({
        type: 'setView',
        target: [3, 4, 5],
        direction: [1, 0, 0],
        up: [0, 0, 1],
        verticalSpan: 12,
        perspectiveZoom: 1.75,
      });
    });

    await waitFor(() => {
      expect(editorSend.mock.calls.at(-1)?.[0]).toMatchObject({
        type: 'updateViewSettings',
        settings: {
          schemaVersion: 10,
          cameraView: {
            target: [3, 4, 5],
            direction: [1, 0, 0],
            up: [0, 0, 1],
            verticalSpan: 12,
            perspectiveZoom: 1.75,
          },
        },
      });
    });

    editorSend.mockClear();
    act(() => {
      cameraRig!.actorRef.send({ type: 'setViewport', viewport: { width: 1200, height: 800, pixelRatio: 2 } });
      cameraRig!.actorRef.send({ type: 'setBounds', bounds: { min: [-2, -2, -2], max: [2, 2, 2] } });
    });
    await act(async () => undefined);
    expect(editorSend).not.toHaveBeenCalled();
    graphicsRef.stop();
  });

  it('defers camera sync until a non-3D viewer can clear stale state', async () => {
    const graphicsRef = createActor(
      graphicsMachine.provide({ actors: { probeWebGpu: fromPromise(async () => false) } }),
      { input: {} },
    ).start();
    const editorSend = vi.fn<(event: EditorSendEvent) => void>();
    const editorRef = mock<ActorRefFrom<typeof editorMachine>>({ send: editorSend });
    const mounted = render(
      <GraphicsProvider graphicsRef={graphicsRef}>
        <SyncHarness graphicsRef={graphicsRef} editorRef={editorRef} persistCameraView='pending' />
      </GraphicsProvider>,
    );

    expect(editorSend).not.toHaveBeenCalled();
    mounted.rerender(
      <GraphicsProvider graphicsRef={graphicsRef}>
        <SyncHarness graphicsRef={graphicsRef} editorRef={editorRef} persistCameraView={false} />
      </GraphicsProvider>,
    );

    await waitFor(() => {
      expect(editorSend.mock.calls.at(-1)?.[0]).toMatchObject({
        type: 'updateViewSettings',
        settings: { schemaVersion: 10, cameraView: undefined },
      });
    });
    graphicsRef.stop();
  });
});
