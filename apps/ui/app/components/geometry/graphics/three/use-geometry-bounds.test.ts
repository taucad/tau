import { act, renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createActor } from 'xstate';
import type { Actor } from 'xstate';
import type { Mechanism } from '@taucad/kinematics';
import type { RenderFrame } from '@taucad/spatial';
import { useGeometryBounds } from '#components/geometry/graphics/three/use-geometry-bounds.js';
import { kinematicsMachine } from '#machines/kinematics.machine.js';

const mocks = vi.hoisted(() => ({
  frame: undefined as (() => void) | undefined,
  send: vi.fn(),
  invalidate: vi.fn(),
  kinematics: undefined as Actor<typeof kinematicsMachine> | undefined,
  renderFrame: {
    anchorFrameId: 'tau:root',
    originMeters: [0, 0, 0],
    metersPerRenderUnit: 1,
  } satisfies RenderFrame,
}));

vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: () => void) => {
    mocks.frame = callback;
  },
  useThree: <T>(selector: (state: { invalidate: () => void }) => T) => selector({ invalidate: mocks.invalidate }),
}));

vi.mock('#hooks/use-graphics.js', () => ({
  useGraphics: () => ({ send: mocks.send }),
  useGraphicsSelector: () => 'geometry-key',
  useRenderFrame: () => mocks.renderFrame,
  useKinematicsRef: () => mocks.kinematics,
}));

const createSceneReferences = (x: number) => {
  const outer = new THREE.Group();
  const inner = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 6), new THREE.MeshBasicMaterial());
  mesh.position.x = x;
  inner.add(mesh);
  outer.add(inner);

  const innerRef = createRef<THREE.Group>();
  const outerRef = createRef<THREE.Group>();
  innerRef.current = inner;
  outerRef.current = outer;
  return { innerRef, outerRef };
};

describe('useGeometryBounds', () => {
  beforeEach(() => {
    mocks.frame = undefined;
    mocks.send.mockClear();
    mocks.invalidate.mockClear();
    mocks.renderFrame = { anchorFrameId: 'tau:root', originMeters: [0, 0, 0], metersPerRenderUnit: 1 };
    mocks.kinematics = createActor(kinematicsMachine, { input: {} }).start();
  });

  afterEach(() => {
    mocks.kinematics?.stop();
  });

  it('returns a cloned bounds snapshot with its center and sphere', () => {
    const { innerRef, outerRef } = createSceneReferences(10);
    const { result } = renderHook(() => useGeometryBounds(innerRef, outerRef));

    act(() => mocks.frame?.());

    expect(result.current.geometryCenter.toArray()).toEqual([10, 0, 0]);
    expect(result.current.geometryBounds.min.toArray()).toEqual([9, -2, -3]);
    expect(result.current.geometryBounds.max.toArray()).toEqual([11, 2, 3]);
    expect(result.current.geometryRadius).toBeCloseTo(Math.sqrt(14), 10);
    const event = mocks.send.mock.calls.at(-1)?.[0] as unknown as {
      readonly type: string;
      readonly radius: number;
      readonly centerMeters: [number, number, number];
    };
    expect(event.type).toBe('sceneRadiusUpdated');
    expect(event.radius).toBeCloseTo(Math.sqrt(14), 10);
    expect(event.centerMeters).toEqual([10, 0, 0]);
  });

  it('inverts render-local bounds into physical metres', () => {
    const { innerRef, outerRef } = createSceneReferences(10);
    mocks.renderFrame = { anchorFrameId: 'tau:root', originMeters: [10, 0, 0], metersPerRenderUnit: 2 };
    outerRef.current!.matrixAutoUpdate = false;
    outerRef.current!.matrix.makeScale(0.5, 0.5, 0.5).setPosition(-5, 0, 0);
    const { result } = renderHook(() => useGeometryBounds(innerRef, outerRef));

    act(() => mocks.frame?.());

    expect(result.current.geometryCenter.toArray()).toEqual([10, 0, 0]);
    expect(result.current.geometryBounds.min.toArray()).toEqual([9, -2, -3]);
    expect(result.current.geometryBounds.max.toArray()).toEqual([11, 2, 3]);
    expect(result.current.geometryRadius).toBeCloseTo(Math.sqrt(14), 10);
  });

  it('measures again once a kinematic pose settles, but not while a clip still moves it', () => {
    const unitId = 'file:main.ts';
    const mechanism: Mechanism = {
      schemaVersion: 1,
      units: { length: 'm', angle: 'rad' },
      root: 'base',
      links: { base: { components: ['component:base'] }, arm: { components: ['component:arm'] } },
      joints: { hinge: { type: 'revolute', parent: 'base', child: 'arm', origin: [0, 0, 0], axis: [0, 0, 1] } },
    };
    const kinematics = mocks.kinematics!;
    kinematics.send({ type: 'loadMechanism', unitId, mechanism });
    const { innerRef, outerRef } = createSceneReferences(10);
    const { result } = renderHook(() => useGeometryBounds(innerRef, outerRef));
    act(() => mocks.frame?.());
    act(() => mocks.frame?.());
    expect(result.current.geometryCenter.toArray()).toEqual([10, 0, 0]);

    // The pose composer moves the part; no new geometry key arrives.
    innerRef.current!.children[0]!.position.x = 20;
    act(() => {
      kinematics.send({ type: 'play', unitId });
      kinematics.send({ type: 'tick', unitId, elapsed: 0.5 });
    });
    act(() => mocks.frame?.());
    expect(result.current.geometryCenter.toArray()).toEqual([10, 0, 0]);
    expect(mocks.invalidate).not.toHaveBeenCalled();

    act(() => {
      kinematics.send({ type: 'pause', unitId });
    });
    expect(mocks.invalidate).toHaveBeenCalledTimes(1);
    act(() => mocks.frame?.());
    expect(result.current.geometryCenter.toArray()).toEqual([20, 0, 0]);
  });
});
