// @vitest-environment jsdom
import { useLayoutEffect } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createActor, createAsyncLogic } from 'xstate';
import type { Actor, ActorRefFrom } from 'xstate';
import { mock } from 'vitest-mock-extended';
import type { GeometryComponentManifest } from '@taucad/types';
import type { ThreeCameraRig } from '@taucad/three/camera';
import { GraphicsProvider, useCameraRig } from '#hooks/use-graphics.js';
import {
  acquireViewCameraSession,
  getViewCameraSession,
  notifyViewCameraSession,
} from '#services/graphics-camera-registry.js';
import { useViewSettingsSync } from '#hooks/use-view-settings-sync.js';
import { graphicsMachine } from '#machines/graphics.machine.js';
import type { cadMachine } from '#machines/cad.machine.js';
import type { editorMachine } from '#machines/editor.machine.js';
import { deriveModelInteractionUnitId } from '#machines/model-interaction.machine.js';
import { toSnapshotCallback } from '#lib/xstate-test.utils.js';
import type { SnapshotListener } from '#lib/xstate-test.utils.js';

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

/** Minimal stand-in for the entry's CAD actor: the hook reads its render timeout and its format. */
function createEntryCad(initial: { renderTimeout?: number; format?: 'gltf' | 'svg' }): {
  ref: ActorRefFrom<typeof cadMachine>;
  setRenderTimeout: (next: number) => void;
  setFormat: (next: 'gltf' | 'svg') => void;
} {
  let renderTimeout = initial.renderTimeout ?? 30_000;
  let geometry = initial.format === undefined ? undefined : { format: initial.format };
  const listeners = new Set<(snapshot: unknown) => void>();
  const actor = {
    getSnapshot: () => ({ context: { renderTimeout, geometry } }),
    subscribe: (listener: SnapshotListener<unknown>) => {
      const callback = toSnapshotCallback(listener);
      listeners.add(callback);
      return { unsubscribe: () => listeners.delete(callback) };
    },
    send: vi.fn(),
  };
  const emit = (): void => {
    for (const listener of listeners) {
      listener(actor.getSnapshot());
    }
  };
  return {
    ref: actor as unknown as ActorRefFrom<typeof cadMachine>,
    setRenderTimeout(next: number) {
      renderTimeout = next;
      emit();
    },
    setFormat(next: 'gltf' | 'svg') {
      geometry = { format: next };
      emit();
    },
  };
}

/** Stands in for the canvas: framing the first geometry is what consumes the camera seed. */
function markSeedConsumed(graphicsRef: ActorRefFrom<typeof graphicsMachine>): void {
  const session = getViewCameraSession(graphicsRef);
  expect(session).toBeDefined();
  session!.framing.initialized = true;
}

/** A graphics actor with the WebGPU probe stubbed out, started, ready for events. */
function createGraphicsActor(): Actor<typeof graphicsMachine> {
  return createActor(
    graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
    {
      input: {},
    },
  ).start();
}

function SyncHarness({
  graphicsRef,
  editorRef,
  onRig,
  cadRef,
  entryPath,
}: {
  readonly graphicsRef: ActorRefFrom<typeof graphicsMachine>;
  readonly editorRef: ActorRefFrom<typeof editorMachine>;
  readonly onRig?: (rig: ThreeCameraRig) => void;
  readonly cadRef?: ActorRefFrom<typeof cadMachine>;
  readonly entryPath?: string;
}): React.JSX.Element {
  const cameraRig = useCameraRig();
  useViewSettingsSync({ viewId: 'view-1', entryPath, graphicsRef, cadRef, editorRef });
  useLayoutEffect(() => {
    onRig?.(cameraRig);
  }, [cameraRig, onRig]);
  return <div data-testid='sync-harness' />;
}

/** The hook with no camera session at all: the view is live, its pane is not mounted. */
function PaneLessHarness({
  graphicsRef,
  editorRef,
}: {
  readonly graphicsRef: ActorRefFrom<typeof graphicsMachine>;
  readonly editorRef: ActorRefFrom<typeof editorMachine>;
}): React.JSX.Element {
  useViewSettingsSync({ viewId: 'view-1', entryPath: undefined, graphicsRef, cadRef: undefined, editorRef });
  return <div data-testid='pane-less-harness' />;
}

describe('useViewSettingsSync', () => {
  it('should keep model display mutations out of per-view settings', async () => {
    const graphicsRef = createGraphicsActor();
    const editorSend = vi.fn<(event: EditorSendEvent) => void>();
    const editorRef = mock<ActorRefFrom<typeof editorMachine>>({ send: editorSend });

    render(
      <GraphicsProvider graphicsRef={graphicsRef}>
        <SyncHarness graphicsRef={graphicsRef} editorRef={editorRef} />
      </GraphicsProvider>,
    );

    // The mount publishes what the owners hold; everything below is about what a mutation adds.
    await waitFor(() => {
      expect(editorSend).toHaveBeenCalledTimes(1);
    });
    editorSend.mockClear();

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

  /* R6: there is no first-emission skip. A setting the person changes before any geometry arrives is
   * theirs, and the camera keys -- the only ones a premature publish could damage -- are withheld
   * until the seed has been consumed rather than the whole record being withheld with them. */
  it('writes a change made before the first geometry reaches the store, without touching the pose', async () => {
    const graphicsRef = createGraphicsActor();
    const editorSend = vi.fn<(event: EditorSendEvent) => void>();
    const editorRef = mock<ActorRefFrom<typeof editorMachine>>({ send: editorSend });

    render(
      <GraphicsProvider graphicsRef={graphicsRef}>
        <SyncHarness graphicsRef={graphicsRef} editorRef={editorRef} cadRef={createEntryCad({}).ref} />
      </GraphicsProvider>,
    );

    act(() => {
      graphicsRef.send({ type: 'setGridVisibility', payload: false });
    });

    await waitFor(() => {
      expect(editorSend.mock.calls.at(-1)?.[0]).toMatchObject({
        type: 'updateViewSettings',
        settings: { enableGrid: false },
      });
    });
    for (const [event] of editorSend.mock.calls) {
      expect(event).not.toHaveProperty('settings.cameraView');
    }
    graphicsRef.stop();
  });

  /* A live view whose pane is closed still has owners, and they still write. */
  it('writes a view with no mounted pane and leaves its camera keys alone', async () => {
    const graphicsRef = createGraphicsActor();
    const editorSend = vi.fn<(event: EditorSendEvent) => void>();
    const editorRef = mock<ActorRefFrom<typeof editorMachine>>({ send: editorSend });

    render(<PaneLessHarness graphicsRef={graphicsRef} editorRef={editorRef} />);

    act(() => {
      graphicsRef.send({ type: 'setGridVisibility', payload: false });
    });

    await waitFor(() => {
      expect(editorSend.mock.calls.at(-1)?.[0]).toMatchObject({
        type: 'updateViewSettings',
        settings: { enableGrid: false },
      });
    });
    expect(getViewCameraSession(graphicsRef)).toBeUndefined();
    for (const [event] of editorSend.mock.calls) {
      expect(event).not.toHaveProperty('settings.cameraView');
      expect(event).not.toHaveProperty('settings.cameraFovAngle');
    }
    graphicsRef.stop();
  });

  /* The pane opens after the project does, so the host's first render sees no session at all. The
   * camera keys have to start being written when one appears -- a reader that caches the first
   * `undefined` writes a record with no pose in it for the life of the actor. */
  it('starts writing the camera keys when a pane opens after the host has mounted', async () => {
    const graphicsRef = createGraphicsActor();
    const editorSend = vi.fn<(event: EditorSendEvent) => void>();
    const editorRef = mock<ActorRefFrom<typeof editorMachine>>({ send: editorSend });

    render(<PaneLessHarness graphicsRef={graphicsRef} editorRef={editorRef} />);
    expect(getViewCameraSession(graphicsRef)).toBeUndefined();

    const session = acquireViewCameraSession(graphicsRef, { camera: { cameraFovAngle: 42 } });
    act(() => {
      notifyViewCameraSession(session);
    });
    markSeedConsumed(graphicsRef);
    act(() => {
      session.rig.actorRef.send({
        type: 'setView',
        target: [3, 4, 5],
        direction: [1, 0, 0],
        up: [0, 0, 1],
        verticalSpan: 12,
        perspectiveZoom: 1,
      });
    });

    await waitFor(() => {
      expect(editorSend.mock.calls.at(-1)?.[0]).toMatchObject({
        type: 'updateViewSettings',
        settings: { cameraFovAngle: 42, cameraView: { target: [3, 4, 5], verticalSpan: 12 } },
      });
    });
    graphicsRef.stop();
  });

  /* E2: the cut and its display preferences are durable, so revisit and reload restore the same
   * state. Translation is derived from the pivot on every assign and is never written. */
  it('writes a cut as sectionView and its toggles as sectionDisplay', async () => {
    const graphicsRef = createGraphicsActor();
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

  /* Dragging the plane rebuilds the pivot on every pointer move, so a reference comparison sends an
   * editor event per frame -- and re-renders every editor subscriber with it. */
  it('does not write a section drag that lands on the cut already stored', async () => {
    const graphicsRef = createGraphicsActor();
    const editorSend = vi.fn<(event: EditorSendEvent) => void>();
    const editorRef = mock<ActorRefFrom<typeof editorMachine>>({ send: editorSend });

    render(
      <GraphicsProvider graphicsRef={graphicsRef}>
        <SyncHarness graphicsRef={graphicsRef} editorRef={editorRef} />
      </GraphicsProvider>,
    );

    act(() => {
      graphicsRef.send({ type: 'setSectionViewActive', payload: true });
      graphicsRef.send({ type: 'selectSectionView', payload: 'xz' });
      graphicsRef.send({ type: 'setSectionViewTranslation', payload: 0.25 });
    });
    await waitFor(() => {
      expect(editorSend.mock.calls.at(-1)?.[0]).toMatchObject({
        type: 'updateViewSettings',
        settings: { sectionView: { plane: 'xz' } },
      });
    });

    editorSend.mockClear();
    act(() => {
      // Ten frames of a drag that never leaves the position it is already at.
      for (let frame = 0; frame < 10; frame++) {
        graphicsRef.send({ type: 'setSectionViewTranslation', payload: 0.25 });
      }
    });
    await act(async () => undefined);
    expect(editorSend).not.toHaveBeenCalled();
    graphicsRef.stop();
  });

  /* E1: the render timeout is owned per file, so it is written to the entry's record and never into
   * the per-view one. The value observed at mount is the seed the spawn applied, not a person's edit. */
  it('writes a render timeout change to the per-entry record and never to the view record', async () => {
    const graphicsRef = createGraphicsActor();
    const editorSend = vi.fn<(event: EditorSendEvent) => void>();
    const editorRef = mock<ActorRefFrom<typeof editorMachine>>({ send: editorSend });
    const cad = createEntryCad({ renderTimeout: 30_000 });

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

  /* A file switch hands the same view another entry's unit. That unit's first reading is its own
   * seed, so comparing it with the previous entry's value would write one file's timeout into the
   * next file's record -- and a unit an agent tool spawned unseeded would overwrite a real one. */
  it("does not carry one entry's render timeout into the next entry's record", async () => {
    const graphicsRef = createGraphicsActor();
    const editorSend = vi.fn<(event: EditorSendEvent) => void>();
    const editorRef = mock<ActorRefFrom<typeof editorMachine>>({ send: editorSend });
    const first = createEntryCad({ renderTimeout: 60_000 });
    const second = createEntryCad({ renderTimeout: 10_000 });

    const view = render(
      <GraphicsProvider graphicsRef={graphicsRef}>
        <SyncHarness graphicsRef={graphicsRef} editorRef={editorRef} cadRef={first.ref} entryPath='src/other.ts' />
      </GraphicsProvider>,
    );

    act(() => {
      first.setRenderTimeout(60_000);
    });
    view.rerender(
      <GraphicsProvider graphicsRef={graphicsRef}>
        <SyncHarness graphicsRef={graphicsRef} editorRef={editorRef} cadRef={second.ref} entryPath='src/part.ts' />
      </GraphicsProvider>,
    );
    await act(async () => undefined);

    expect(editorSend).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'setUnitSettings' }));
    graphicsRef.stop();
  });

  it('persists canonical camera changes without writing viewport-only revisions', async () => {
    const graphicsRef = createGraphicsActor();
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
    markSeedConsumed(graphicsRef);
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

  /* Law 2: the seed is the record until the canvas has framed the first geometry. Writing the rig's
   * opening pose before that is how a restored view lost the pose the person left it in. */
  it('leaves the persisted pose alone until the seed has been consumed', async () => {
    const graphicsRef = createGraphicsActor();
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

    act(() => {
      cameraRig!.actorRef.send({
        type: 'setView',
        target: [3, 4, 5],
        direction: [1, 0, 0],
        up: [0, 0, 1],
        verticalSpan: 12,
        perspectiveZoom: 1,
      });
    });
    await act(async () => undefined);
    await waitFor(() => {
      expect(editorSend).toHaveBeenCalled();
    });

    for (const [event] of editorSend.mock.calls) {
      expect(event).not.toHaveProperty('settings.cameraView');
    }
    graphicsRef.stop();
  });

  it('persists the camera pose once it settles instead of once per frame', async () => {
    const graphicsRef = createGraphicsActor();
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
    markSeedConsumed(graphicsRef);
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
    const graphicsRef = createGraphicsActor();
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

    markSeedConsumed(graphicsRef);
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

  it('clears a stale pose once the entry turns out not to be rendering glTF', async () => {
    const graphicsRef = createGraphicsActor();
    const editorSend = vi.fn<(event: EditorSendEvent) => void>();
    const editorRef = mock<ActorRefFrom<typeof editorMachine>>({ send: editorSend });
    const cad = createEntryCad({});

    render(
      <GraphicsProvider graphicsRef={graphicsRef}>
        <SyncHarness graphicsRef={graphicsRef} editorRef={editorRef} cadRef={cad.ref} entryPath='src/plan.ts' />
      </GraphicsProvider>,
    );

    for (const [event] of editorSend.mock.calls) {
      expect(event).not.toHaveProperty('settings.cameraView');
    }

    act(() => {
      cad.setFormat('svg');
    });

    await waitFor(() => {
      expect(editorSend.mock.calls.at(-1)?.[0]).toMatchObject({
        type: 'updateViewSettings',
        settings: { schemaVersion: 11, cameraView: undefined },
      });
    });
    graphicsRef.stop();
  });
});
