import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import type { Actor, EventFrom, SnapshotFrom } from 'xstate';
import { BoxGeometry, Group, Mesh, Vector3 } from 'three';
import type { Object3D } from 'three';
import type { Mechanism } from '@taucad/kinematics';
import type { GeometryComponentManifest } from '@taucad/types';
import { useKinematicsViewer } from '#components/geometry/graphics/three/react/kinematics-viewer.js';
import { setModelComponentOwner } from '#components/geometry/graphics/three/utils/model-component-owner.js';
import { KeyboardProvider } from '#hooks/use-keyboard.js';
import { getKinematicsUnitState, kinematicsMachine } from '#machines/kinematics.machine.js';

const hooks = vi.hoisted(() => ({
  kinematics: undefined as Actor<typeof kinematicsMachine> | undefined,
  invalidate: vi.fn(),
  frame: undefined as (() => void) | undefined,
}));

vi.mock('#hooks/use-graphics.js', async () => {
  const { useSelector } = await import('@xstate/react');
  return {
    useGraphics: () => ({
      getSnapshot: () => ({ context: { modelPointerClickSuppressionReasons: [] } }),
      send: vi.fn(),
    }),
    useKinematicsRef: () => hooks.kinematics,
    useKinematicsSelector: <T>(selector: (snapshot: SnapshotFrom<typeof kinematicsMachine>) => T) =>
      useSelector(hooks.kinematics!, selector),
    useRenderFrame: () => ({ anchorFrameId: 'tau:root', originMeters: [0, 0, 0], metersPerRenderUnit: 1 }),
  };
});

vi.mock('@react-three/fiber', () => ({
  useFrame(callback: () => void) {
    hooks.frame = callback;
  },
  useThree: <T>(selector: (state: { invalidate: () => void; get: () => undefined }) => T) =>
    selector({ invalidate: hooks.invalidate, get: () => undefined }),
}));

const unitId = 'file:main.ts';

// The base at the origin and the arm 4 units along +X, hinged about Z at the origin.
const mechanism: Mechanism = {
  schemaVersion: 1,
  units: { length: 'm', angle: 'rad' },
  root: 'base',
  links: { base: { components: ['component:base'] }, arm: { components: ['component:arm'] } },
  joints: { hinge: { type: 'revolute', parent: 'base', child: 'arm', origin: [0, 0, 0], axis: [0, 0, 1] } },
};

const createManifest = (presented?: Mechanism): GeometryComponentManifest => ({
  schemaVersion: 1,
  rootId: 'component:root',
  nodeOrder: [],
  nodesById: {},
  capabilities: {
    canHide: true,
    canIsolate: true,
    canFocus: true,
    canAdjustOpacity: true,
    hasDrawings: false,
    hasPreciseTopology: false,
    exports: [],
  },
  mechanism: presented,
});

type ViewerProps = { manifest: GeometryComponentManifest | undefined };

const worldPosition = (object: Object3D): number[] =>
  new Vector3()
    .setFromMatrixPosition(object.matrixWorld)
    .toArray()
    .map((value) => Math.round(value * 1e6) / 1e6 + 0);

const setVisibility = (state: DocumentVisibilityState): void => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
};

describe('useKinematicsViewer', () => {
  let scene: Group;
  let arm: Mesh;
  let kinematics: Actor<typeof kinematicsMachine>;

  const unit = () => getKinematicsUnitState(kinematics.getSnapshot().context, unitId);
  const send = (event: EventFrom<typeof kinematicsMachine>): void => {
    act(() => {
      kinematics.send(event);
    });
  };

  /** Runs one render-loop frame at `at` milliseconds of wall-clock time. */
  const renderFrame = (at: number): void => {
    const clock = vi.spyOn(performance, 'now').mockReturnValue(at);
    act(() => {
      hooks.frame!();
    });
    clock.mockRestore();
  };

  const renderViewer = (manifest: GeometryComponentManifest | undefined = createManifest(mechanism)) => {
    const initialProps: ViewerProps = { manifest };
    return renderHook(
      (props: ViewerProps) =>
        useKinematicsViewer({
          unitId,
          scene,
          manifest: props.manifest,
          getPickableMeshes: () => [],
        }),
      { initialProps, wrapper: KeyboardProvider },
    );
  };

  beforeEach(() => {
    const base = new Mesh(new BoxGeometry(2, 2, 2));
    setModelComponentOwner(base, { unitId, componentId: 'component:base' });
    arm = new Mesh(new BoxGeometry(2, 2, 2));
    arm.position.set(4, 0, 0);
    setModelComponentOwner(arm, { unitId, componentId: 'component:arm' });
    scene = new Group();
    scene.add(base, arm);
    scene.updateMatrixWorld(true);

    kinematics = createActor(kinematicsMachine, { input: {} }).start();
    hooks.kinematics = kinematics;
    hooks.invalidate.mockClear();
    hooks.frame = undefined;
  });

  afterEach(() => {
    cleanup();
    kinematics.stop();
    Reflect.deleteProperty(document, 'visibilityState');
    document.body.replaceChildren();
  });

  describe('mechanism', () => {
    it('should load each presented mechanism and clear it when a presentation drops it', () => {
      const { rerender } = renderViewer(createManifest(mechanism));
      expect(unit().mechanism).toBe(mechanism);

      const rebuilt: Mechanism = { ...mechanism };
      rerender({ manifest: createManifest(rebuilt) });
      expect(unit().mechanism).toBe(rebuilt);

      // No manifest yet (a presentation still loading) leaves the loaded mechanism alone.
      rerender({ manifest: undefined });
      expect(unit().mechanism).toBe(rebuilt);

      rerender({ manifest: createManifest() });
      expect(unit().mechanism).toBeUndefined();
    });

    it('should clear the mechanism when the viewer unmounts', () => {
      const { unmount } = renderViewer();
      expect(unit().mechanism).toBe(mechanism);

      unmount();

      expect(unit().mechanism).toBeUndefined();
    });
  });

  describe('pose', () => {
    it('should pose the scene and request one frame per pose revision, and nothing for other changes', () => {
      renderViewer();
      hooks.invalidate.mockClear();

      send({ type: 'setCoordinate', unitId, id: 'hinge', value: Math.PI / 2 });

      expect(worldPosition(arm)).toEqual([0, 4, 0]);
      expect(hooks.invalidate).toHaveBeenCalledTimes(1);

      send({ type: 'setDragEnabled', unitId, enabled: true });

      expect(hooks.invalidate).toHaveBeenCalledTimes(1);
    });

    it('should return the scene to its as-built placement when the viewer unmounts', () => {
      const { unmount } = renderViewer();
      send({ type: 'setCoordinate', unitId, id: 'hinge', value: Math.PI / 2 });
      expect(arm.matrixAutoUpdate).toBe(false);

      unmount();

      expect(worldPosition(arm)).toEqual([4, 0, 0]);
      expect(arm.matrixAutoUpdate).toBe(true);
    });
  });

  describe('playback clock', () => {
    it('should neither tick nor request frames while the unit is not playing', () => {
      renderViewer();
      hooks.invalidate.mockClear();

      renderFrame(1000);
      renderFrame(1016);

      expect(unit().playback.time).toBe(0);
      expect(hooks.invalidate).not.toHaveBeenCalled();
    });

    it('should advance playback by the wall-clock time between frames and request the next frame', () => {
      renderViewer();
      send({ type: 'play', unitId });
      hooks.invalidate.mockClear();

      // The first frame only starts the clock.
      renderFrame(1000);
      expect(unit().playback.time).toBe(0);
      expect(hooks.invalidate).toHaveBeenCalled();

      renderFrame(1016);
      expect(unit().playback.time).toBeCloseTo(0.016);
    });

    it('should cap one tick at 100 ms so a stalled frame does not jump the clip', () => {
      renderViewer();
      send({ type: 'play', unitId });

      renderFrame(1000);
      renderFrame(6000);

      expect(unit().playback.time).toBeCloseTo(0.1);
    });

    it('should stop the clock while the document is hidden and restart it without a jump', () => {
      renderViewer();
      send({ type: 'play', unitId });
      renderFrame(1000);
      renderFrame(1016);

      setVisibility('hidden');
      hooks.invalidate.mockClear();
      renderFrame(1032);
      expect(unit().playback.time).toBeCloseTo(0.016);
      expect(hooks.invalidate).not.toHaveBeenCalled();

      setVisibility('visible');
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      // The returning tab asks for one frame, which restarts the clock rather than replaying the hidden time.
      expect(hooks.invalidate).toHaveBeenCalledTimes(1);
      renderFrame(9000);
      expect(unit().playback.time).toBeCloseTo(0.016);
      renderFrame(9016);
      expect(unit().playback.time).toBeCloseTo(0.032);
    });
  });
});
