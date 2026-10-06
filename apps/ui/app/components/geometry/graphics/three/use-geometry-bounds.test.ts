import { act, renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createActor } from 'xstate';
import type { Actor } from 'xstate';
import type { Mechanism } from '@taucad/kinematics';
import { fromThreeRenderBounds } from '@taucad/three/spatial';
import type { RenderFrame } from '@taucad/spatial';
import { useGeometryBounds, setGltfAssemblyBounds } from '#components/geometry/graphics/three/use-geometry-bounds.js';
import { createCanonicalGltfToTauMatrix } from '#components/geometry/graphics/three/gltf-world.js';
import { useCameraFraming } from '#components/geometry/graphics/three/use-camera-framing.js';
import { createEdgePrototypeGeometry } from '#components/geometry/graphics/three/utils/gltf-edge-batches.js';
import { sceneTag } from '#components/geometry/graphics/three/utils/scene-tags.js';
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
  camera: {
    actorRef: {
      send: vi.fn(),
      getSnapshot: () => ({
        context: {
          view: {
            target: [0, 0, 0],
            up: [0, 0, 1],
            verticalSpan: 2,
            viewport: { width: 800, height: 600, pixelRatio: 1 },
          },
        },
      }),
    },
  },
  framing: { initialized: false, preserveOrientationOnFirstFrame: false },
  fitListener: undefined as (() => void) | undefined,
  geometryKey: 'geometry-key',
}));

const getCanvasState = () => ({ size: { width: 800, height: 600 } });

vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: () => void) => {
    mocks.frame = callback;
  },
  useThree: <T>(selector?: (state: { invalidate: () => void; get: typeof getCanvasState }) => T) =>
    selector ? selector({ invalidate: mocks.invalidate, get: getCanvasState }) : getCanvasState(),
}));

vi.mock('#hooks/use-graphics.js', () => ({
  useGraphics: () => ({
    send: mocks.send,
    on: (_type: string, listener: () => void) => {
      mocks.fitListener = listener;
      return { unsubscribe: vi.fn() };
    },
  }),
  useGraphicsSelector: () => mocks.geometryKey,
  useCameraRig: () => mocks.camera,
  useViewCameraFraming: () => mocks.framing,
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
    mocks.camera.actorRef.send.mockClear();
    mocks.framing.initialized = false;
    mocks.geometryKey = 'geometry-key';
    mocks.renderFrame = { anchorFrameId: 'tau:root', originMeters: [0, 0, 0], metersPerRenderUnit: 1 };
    mocks.kinematics = createActor(kinematicsMachine, { input: {} }).start();
  });

  afterEach(() => {
    mocks.kinematics?.stop();
  });

  it('should measure a settled scene once rather than poll for convergence', () => {
    const { innerRef, outerRef } = createSceneReferences(10);
    const bounds = vi.spyOn(THREE.Box3.prototype, 'setFromObject');
    renderHook(() => useGeometryBounds(innerRef, outerRef));
    act(() => mocks.frame?.());
    act(() => mocks.frame?.());
    expect(bounds).toHaveBeenCalledOnce();
    bounds.mockRestore();
  });

  it('excludes real edge quads and nested presentation surfaces from physical bounds', () => {
    const { innerRef, outerRef } = createSceneReferences(0.015);
    const canonical = innerRef.current!.children[0]!;
    canonical.scale.set(0.005, 0.0025, 0.001);
    const expected = new THREE.Box3().setFromObject(innerRef.current!);
    const presentation = new THREE.Group();
    presentation.userData[sceneTag.gltfSurfacePresentation] = true;
    const edge = new THREE.Mesh(
      createEdgePrototypeGeometry(new Float32Array([0, 0, 0, 0.03, 0, 0]), 2),
      new THREE.MeshBasicMaterial(),
    );
    presentation.add(edge, new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100)));
    innerRef.current!.add(presentation);
    expect(new THREE.Box3().setFromObject(innerRef.current!).equals(expected)).toBe(false);
    const updatePresentation = vi.spyOn(presentation, 'updateWorldMatrix');
    const originalParent = presentation.parent;
    const { result } = renderHook(() => useGeometryBounds(innerRef, outerRef));
    expect(result.current.geometryBounds.equals(expected)).toBe(true);
    expect(updatePresentation).not.toHaveBeenCalled();
    expect(presentation.parent).toBe(originalParent);
    act(() => mocks.frame?.());
    act(() => mocks.frame?.());
    expect(updatePresentation).not.toHaveBeenCalled();
  });

  it('retains default instanced object bounds under rotation, scale and a physical render frame', () => {
    const { innerRef, outerRef } = createSceneReferences(0);
    innerRef.current!.clear();
    const instances = new THREE.InstancedMesh(new THREE.BoxGeometry(2, 4, 6), new THREE.MeshBasicMaterial(), 2);
    instances.setMatrixAt(0, new THREE.Matrix4().makeTranslation(10, 0, 0));
    instances.setMatrixAt(1, new THREE.Matrix4().makeTranslation(-5, 3, 0));
    instances.position.set(7, 11, 13);
    instances.rotation.z = Math.PI / 2;
    instances.scale.set(2, 3, 4);
    innerRef.current!.add(instances);
    const presentation = new THREE.Mesh(createEdgePrototypeGeometry(new Float32Array([0, 0, 0, 1, 0, 0]), 1));
    presentation.userData[sceneTag.gltfSurfacePresentation] = true;
    innerRef.current!.add(presentation);
    mocks.renderFrame = { anchorFrameId: 'tau:root', originMeters: [10, 20, 30], metersPerRenderUnit: 2 };
    outerRef.current!.matrixAutoUpdate = false;
    outerRef.current!.matrix.makeScale(0.5, 0.5, 0.5).setPosition(-5, -10, -15);
    innerRef.current!.updateWorldMatrix(true, false);
    const expected = fromThreeRenderBounds({
      renderFrame: mocks.renderFrame,
      bounds: new THREE.Box3().setFromObject(instances),
    });
    const { result } = renderHook(() => useGeometryBounds(innerRef, outerRef));
    expect(result.current.geometryBounds.min.toArray()).toEqual(expected.min);
    expect(result.current.geometryBounds.max.toArray()).toEqual(expected.max);
    const bounds = vi.spyOn(instances, 'updateWorldMatrix');
    act(() => mocks.frame?.());
    expect(bounds).not.toHaveBeenCalled();
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

  it('keeps admitted unresident bounds through the existing glTF adapter and render-frame inversion', () => {
    const { innerRef, outerRef } = createSceneReferences(10);
    const inner = innerRef.current!;
    inner.matrixAutoUpdate = false;
    inner.matrix.copy(createCanonicalGltfToTauMatrix());
    mocks.renderFrame = { anchorFrameId: 'tau:root', originMeters: [10, 0, 0], metersPerRenderUnit: 2 };
    outerRef.current!.matrixAutoUpdate = false;
    outerRef.current!.matrix.makeScale(0.5, 0.5, 0.5).setPosition(-5, 0, 0);
    setGltfAssemblyBounds(inner, {
      unitId: 'file:assembly.json',
      bounds: { min: [9, -2, -3], max: [22, 8, 10] },
      components: [
        { memberIds: ['resident'], bounds: { min: [9, -2, -3], max: [11, 2, 3] } },
        { memberIds: ['unresident'], bounds: { min: [20, 4, 6], max: [22, 8, 10] } },
      ],
    });
    const { result } = renderHook(() => useGeometryBounds(innerRef, outerRef));
    act(() => mocks.frame?.());
    expect(result.current.geometryBounds.min.toArray()).toEqual([9, -10, -2]);
    expect(result.current.geometryBounds.max.toArray()).toEqual([22, 3, 8]);
    expect(inner.children).toHaveLength(1);
    expect(result.current.geometryCenter.toArray()).toEqual([15.5, -3.5, 3]);
  });

  it('includes a settled kinematic displacement of an unresident component without reconstructing geometry', () => {
    const unitId = 'file:assembly.json';
    const kinematics = mocks.kinematics!;
    const mechanism: Mechanism = {
      schemaVersion: 1,
      units: { length: 'm', angle: 'rad' },
      root: 'base',
      links: { base: { components: ['resident'] }, moving: { components: ['unresident'] } },
      joints: { slide: { type: 'prismatic', parent: 'base', child: 'moving', origin: [0, 0, 0], axis: [1, 0, 0] } },
    };
    kinematics.send({ type: 'loadMechanism', unitId, mechanism });
    const { innerRef, outerRef } = createSceneReferences(10);
    setGltfAssemblyBounds(innerRef.current!, {
      unitId,
      bounds: { min: [9, -2, -3], max: [22, 8, 10] },
      components: [
        { memberIds: ['resident'], bounds: { min: [9, -2, -3], max: [11, 2, 3] } },
        { memberIds: ['unresident'], bounds: { min: [20, 4, 6], max: [22, 8, 10] } },
      ],
    });
    const { result } = renderHook(() => useGeometryBounds(innerRef, outerRef));
    act(() => mocks.frame?.());
    act(() => mocks.frame?.());
    expect(result.current.geometryBounds.max.x).toBe(22);
    act(() => {
      kinematics.send({ type: 'setCoordinate', unitId, id: 'slide', value: 20 });
    });
    act(() => mocks.frame?.());
    expect(result.current.geometryBounds.min.x).toBe(9);
    expect(result.current.geometryBounds.max.x).toBe(42);
    expect(innerRef.current!.children).toHaveLength(1);
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
    const presentation = new THREE.Mesh(createEdgePrototypeGeometry(new Float32Array([0, 0, 0, 1, 0, 0]), 1));
    presentation.userData[sceneTag.gltfSurfacePresentation] = true;
    innerRef.current!.add(presentation);
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

  it('should refresh settled drag bounds without moving the camera and still allow Fit view', () => {
    const unitId = 'file:main.ts';
    const kinematics = mocks.kinematics!;
    kinematics.send({
      type: 'loadMechanism',
      unitId,
      mechanism: {
        schemaVersion: 1,
        units: { length: 'm', angle: 'rad' },
        root: 'base',
        links: { base: { components: ['component:base'] }, arm: { components: ['component:arm'] } },
        joints: { hinge: { type: 'revolute', parent: 'base', child: 'arm', origin: [0, 0, 0], axis: [0, 0, 1] } },
      },
    });
    const { innerRef, outerRef } = createSceneReferences(10);
    const hook = renderHook(() => {
      const bounds = useGeometryBounds(innerRef, outerRef);
      useCameraFraming(bounds);
      return bounds;
    });
    act(() => mocks.frame?.());
    act(() => mocks.frame?.());
    expect(mocks.camera.actorRef.send).toHaveBeenCalledWith({ type: 'frame', margin: 0.1 });
    mocks.camera.actorRef.send.mockClear();

    act(() => {
      kinematics.send({ type: 'setDragEnabled', unitId, enabled: true });
      kinematics.send({ type: 'dragStart', unitId, componentId: 'component:arm', point: [1, 0, 0] });
      kinematics.send({ type: 'dragMove', unitId, target: [0, 1, 0] });
    });
    // The pose composer moves the scene before bounds are measured on release.
    innerRef.current!.children[0]!.position.x = 20;
    act(() => {
      kinematics.send({ type: 'dragEnd', unitId });
    });
    act(() => mocks.frame?.());
    act(() => mocks.frame?.());

    expect(hook.result.current.geometryCenter.toArray()).toEqual([20, 0, 0]);
    expect(mocks.camera.actorRef.send).toHaveBeenCalledOnce();
    expect(mocks.camera.actorRef.send).toHaveBeenCalledWith({
      type: 'setBounds',
      bounds: { min: [19, -2, -3], max: [21, 2, 3] },
    });

    act(() => mocks.fitListener?.());
    expect(mocks.camera.actorRef.send).toHaveBeenLastCalledWith({ type: 'frame', margin: 0.1 });
    mocks.camera.actorRef.send.mockClear();

    mocks.geometryKey = 'replacement-geometry';
    innerRef.current!.children[0]!.position.x = 30;
    hook.rerender();
    act(() => mocks.frame?.());
    expect(mocks.camera.actorRef.send).toHaveBeenLastCalledWith({ type: 'frame', margin: 0.1 });
  });
});
