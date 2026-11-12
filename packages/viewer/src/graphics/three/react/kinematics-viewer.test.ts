import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import type { Actor, EventFrom, SnapshotFrom } from 'xstate';
import { BoxGeometry, Group, Mesh, Vector3 } from 'three';
import type { Object3D } from 'three';
import type { Mechanism } from '@taucad/kinematics';
import { useKinematicsViewer } from '#graphics/three/react/kinematics-viewer.js';
import { setModelComponentOwner } from '#graphics/three/utils/model-component-owner.js';
import { KeyboardProvider } from '@taucad/ui/components/keyboard';
import { getKinematicsUnitState, kinematicsMachine } from '#machines/kinematics.machine.js';

// Graphics, as far as the scene's ref callback reaches it: it runs the attached adapter with its kinematics child.
const hooks = vi.hoisted(() => {
  const state = {
    kinematics: undefined as Actor<typeof kinematicsMachine> | undefined,
    invalidate: vi.fn(),
    frame: undefined as (() => void) | undefined,
    adapter: undefined as { sceneId: string; actor: { stop: () => void } } | undefined,
    graphics: {
      getSnapshot: () => ({ context: { modelPointerClickSuppressionReasons: [] } }),
      send: vi.fn(),
    },
  };
  return state;
});

vi.mock('#hooks/use-graphics.jsx', async () => {
  const { useSelector } = await import('@xstate/react');
  return {
    useGraphics: () => hooks.graphics,
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

type ViewerProps = { scene: Object3D };

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

  /** Renders the viewer for a unit whose mechanism graphics loaded, and attaches its scene as React would. */
  const renderViewer = (presented: Mechanism = mechanism) => {
    kinematics.send({ type: 'loadMechanism', unitId, mechanism: presented });
    const initialProps: ViewerProps = { scene };
    const view = renderHook(
      (props: ViewerProps) => useKinematicsViewer({ unitId, scene: props.scene, getPickableMeshes: () => [] }),
      { initialProps, wrapper: KeyboardProvider },
    );
    act(() => {
      view.result.current.attachScene(scene);
    });
    return {
      ...view,
      unmount: () => {
        act(() => {
          view.result.current.attachScene(null);
        });
        view.unmount();
      },
    };
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
    hooks.adapter = undefined;
    hooks.graphics.send.mockReset();
    hooks.graphics.send.mockImplementation(
      (event: { type: string; sceneId: string; adapter?: Parameters<typeof createActor>[0] }) => {
        if (event.type === 'kinematicsSceneAttached' && hooks.adapter?.sceneId !== event.sceneId) {
          hooks.adapter?.actor.stop();
          const actor = createActor(event.adapter!, { input: { kinematics } });
          actor.start();
          hooks.adapter = { sceneId: event.sceneId, actor };
        } else if (event.type === 'kinematicsSceneDetached' && hooks.adapter?.sceneId === event.sceneId) {
          hooks.adapter.actor.stop();
          hooks.adapter = undefined;
        }
      },
    );
    hooks.invalidate.mockClear();
    hooks.frame = undefined;
  });

  afterEach(() => {
    cleanup();
    hooks.adapter?.actor.stop();
    kinematics.stop();
    Reflect.deleteProperty(document, 'visibilityState');
    document.body.replaceChildren();
  });

  describe('scene attach', () => {
    it('should hand graphics one adapter for the scene, and take it back when React detaches the scene', () => {
      const { result, rerender, unmount } = renderViewer();
      const attached = hooks.graphics.send.mock.calls.map(([event]) => (event as { type: string }).type);
      expect(attached).toEqual(['kinematicsSceneAttached']);

      // A re-render keeps the callback, so React does not detach and re-attach the scene.
      const attach = result.current.attachScene;
      rerender({ scene });
      expect(result.current.attachScene).toBe(attach);

      // An earlier presentation's scene reaching this callback is not this scene.
      act(() => {
        attach(new Group());
      });
      expect(hooks.graphics.send).toHaveBeenCalledTimes(1);

      unmount();
      expect(hooks.graphics.send).toHaveBeenLastCalledWith({
        type: 'kinematicsSceneDetached',
        sceneId: (hooks.graphics.send.mock.calls[0]![0] as { sceneId: string }).sceneId,
      });
      expect(hooks.adapter).toBeUndefined();
      // The mechanism and its coordinates are graphics' to clear, never the scene's.
      expect(unit().mechanism).toBe(mechanism);
    });

    it('should hand graphics a new adapter for a new scene', () => {
      const { result, rerender } = renderViewer();
      const first = hooks.adapter?.sceneId;
      const next = new Group();
      rerender({ scene: next });
      act(() => {
        result.current.attachScene(next);
      });
      expect(hooks.adapter?.sceneId).not.toBe(first);
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
    it('should request the first demand frame when play leaves the initial pose unchanged', () => {
      const animated: Mechanism = {
        ...mechanism,
        animations: [
          {
            id: 'turn',
            duration: 2,
            loop: 'repeat',
            keyframes: [
              { time: 0, coordinates: { hinge: 0 } },
              { time: 2, coordinates: { hinge: 1 } },
            ],
          },
        ],
      };
      renderViewer(animated);
      hooks.invalidate.mockClear();
      const before = arm.matrix.clone();
      send({ type: 'play', unitId });
      expect(arm.matrix.equals(before)).toBe(true);
      expect(hooks.invalidate).toHaveBeenCalled();
      renderFrame(1000);
      renderFrame(1016);
      expect(unit().playback.time).toBeCloseTo(0.016);
      send({ type: 'pause', unitId });
      hooks.invalidate.mockClear();
      send({ type: 'play', unitId });
      expect(hooks.invalidate).toHaveBeenCalled();
      renderFrame(9000);
      expect(unit().playback.time).toBeCloseTo(0.016);
    });

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
