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
import type { cadMachine } from '#machines/cad.machine.js';
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

/** Minimal stand-in for the entry's CAD actor: the hook only reads its render timeout. */
function createRenderTimeoutCad(initialRenderTimeout: number): {
  ref: ActorRefFrom<typeof cadMachine>;
  setRenderTimeout: (next: number) => void;
} {
  let renderTimeout = initialRenderTimeout;
  const listeners = new Set<(snapshot: unknown) => void>();
  const actor = {
    getSnapshot: () => ({ context: { renderTimeout } }),
    subscribe: (listener: (snapshot: unknown) => void) => {
      listeners.add(listener);
      return { unsubscribe: () => listeners.delete(listener) };
    },
    send: vi.fn(),
  };
  return {
    ref: actor as unknown as ActorRefFrom<typeof cadMachine>,
    setRenderTimeout(next: number) {
      renderTimeout = next;
      for (const listener of listeners) {
        listener(actor.getSnapshot());
      }
    },
  };
}

function SyncHarness({
  graphicsRef,
  editorRef,
  onRig,
  persistCameraView,
  enabled,
  cadRef,
  entryPath,
}: {
  readonly graphicsRef: ActorRefFrom<typeof graphicsMachine>;
  readonly editorRef: ActorRefFrom<typeof editorMachine>;
  readonly onRig?: (rig: ThreeCameraRig) => void;
  readonly persistCameraView?: boolean | 'pending';
  readonly enabled?: boolean;
  readonly cadRef?: ActorRefFrom<typeof cadMachine>;
  readonly entryPath?: string;
}): React.JSX.Element {
  const cameraRig = useCameraRig();
  useViewSettingsSync({
    viewId: 'view-1',
    entryPath,
    graphicsRef,
    cadRef,
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
        settings: { schemaVersion: 11, enableGrid: false },
      });
    });
    expect(editorSend.mock.calls.at(-1)?.[0]).not.toHaveProperty('settings.componentDisplay');
    expect(editorSend.mock.calls.at(-1)?.[0]).not.toHaveProperty(`settings.${['environment', 'Preset'].join('')}`);
    graphicsRef.stop();
  });

  /* E2: the cut and its display preferences are durable, so revisit and reload restore the same
   * state. Translation is derived from the pivot on every assign and is never written. */
  it('writes a cut as sectionView and its toggles as sectionDisplay', async () => {
    const graphicsRef = createActor(
      graphicsMachine.provide({ actors: { probeWebGpu: fromPromise(async () => false) } }),
      { input: {} },
    ).start();
    const editorSend = vi.fn<(event: EditorSendEvent) => void>();
    const editorRef = mock<ActorRefFrom<typeof editorMachine>>({ send: editorSend });

    render(
      <GraphicsProvider graphicsRef={graphicsRef}>
        <SyncHarness graphicsRef={graphicsRef} editorRef={editorRef} />
      </GraphicsProvider>,
    );

    act(() => {
      graphicsRef.send({ type: 'sceneRadiusUpdated', radius: 0.1, centerMeters: [1, 2, 3] });
      graphicsRef.send({ type: 'setSectionViewActive', payload: true });
      graphicsRef.send({ type: 'selectSectionView', payload: 'xz' });
      graphicsRef.send({ type: 'setClippingLinesEnabled', payload: false });
    });

    await waitFor(() => {
      expect(editorSend.mock.calls.at(-1)?.[0]).toMatchObject({
        type: 'updateViewSettings',
        settings: {
          sectionView: { active: true, plane: 'xz', pivot: [1, 2, 3], direction: -1 },
          sectionDisplay: { clipLines: false, clipMesh: true, planeName: 'face' },
        },
      });
    });
    const lastCall = editorSend.mock.calls.at(-1)?.[0];
    expect(lastCall).not.toHaveProperty('settings.sectionView.translation');
    graphicsRef.stop();
  });

  /* E1: the render timeout is owned per file, so it is written to the entry's record and never into
   * the per-view one. The value observed at mount is the seed the spawn applied, not a person's edit. */
  it('writes a render timeout change to the per-entry record and never to the view record', async () => {
    const graphicsRef = createActor(
      graphicsMachine.provide({ actors: { probeWebGpu: fromPromise(async () => false) } }),
      { input: {} },
    ).start();
    const editorSend = vi.fn<(event: EditorSendEvent) => void>();
    const editorRef = mock<ActorRefFrom<typeof editorMachine>>({ send: editorSend });
    const cad = createRenderTimeoutCad(30_000);

    render(
      <GraphicsProvider graphicsRef={graphicsRef}>
        <SyncHarness graphicsRef={graphicsRef} editorRef={editorRef} cadRef={cad.ref} entryPath='src/main.ts' />
      </GraphicsProvider>,
    );

    expect(editorSend).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'setUnitSettings' }));

    act(() => {
      cad.setRenderTimeout(90_000);
    });

    await waitFor(() => {
      expect(editorSend).toHaveBeenCalledWith({
        type: 'setUnitSettings',
        entryPath: 'src/main.ts',
        settings: { renderTimeout: 90_000 },
      });
    });
    for (const [event] of editorSend.mock.calls) {
      if (event.type === 'updateViewSettings') {
        expect(event.settings).not.toHaveProperty('renderTimeout');
      }
    }
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
          schemaVersion: 11,
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

  it('persists the camera pose once it settles instead of once per frame', async () => {
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
    editorSend.mockClear();
    act(() => {
      // An orbit: the pose changes every frame.
      for (let frame = 0; frame < 10; frame++) {
        cameraRig!.actorRef.send({
          type: 'setView',
          target: [frame, 0, 0],
          direction: [1, 0, 0],
          up: [0, 0, 1],
          verticalSpan: 10 + frame,
          perspectiveZoom: 1,
        });
      }
    });

    // No editor event -- and therefore no editor-subscriber fan-out -- while the
    // camera is moving.
    expect(editorSend).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(editorSend).toHaveBeenCalledTimes(1);
    });
    expect(editorSend.mock.calls.at(-1)?.[0]).toMatchObject({
      type: 'updateViewSettings',
      settings: { cameraView: { target: [9, 0, 0], verticalSpan: 19 } },
    });
    graphicsRef.stop();
  });

  it('writes the last pose when the view goes away inside the settle window', () => {
    const graphicsRef = createActor(
      graphicsMachine.provide({ actors: { probeWebGpu: fromPromise(async () => false) } }),
      { input: {} },
    ).start();
    const editorSend = vi.fn<(event: EditorSendEvent) => void>();
    const editorRef = mock<ActorRefFrom<typeof editorMachine>>({ send: editorSend });
    let cameraRig: ThreeCameraRig | undefined;

    const view = render(
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

    editorSend.mockClear();
    act(() => {
      cameraRig!.actorRef.send({
        type: 'setView',
        target: [4, 0, 0],
        direction: [1, 0, 0],
        up: [0, 0, 1],
        verticalSpan: 14,
        perspectiveZoom: 1,
      });
    });
    // Closing the pane, switching file or navigating away all land here, and the settle timer that
    // would have written the pose is cancelled with the effect. Losing the orbit the user just made
    // is not an acceptable price for batching the writes.
    act(() => {
      view.unmount();
    });

    expect(editorSend.mock.calls.at(-1)?.[0]).toMatchObject({
      type: 'updateViewSettings',
      settings: { cameraView: { target: [4, 0, 0], verticalSpan: 14 } },
    });
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
        settings: { schemaVersion: 11, cameraView: undefined },
      });
    });
    graphicsRef.stop();
  });
});
