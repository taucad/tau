import { act } from '@testing-library/react';
import { createRoot, events as createPointerEvents, extend } from '@react-three/fiber';
import type { ReconcilerRoot } from '@react-three/fiber';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createActor } from 'xstate';
import type { Actor } from 'xstate';
import type { Mechanism } from '@taucad/kinematics';
import { MeasureTool } from '#components/geometry/graphics/three/react/measure-tool.js';
import { kinematicsMachine } from '#machines/kinematics.machine.js';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  kinematics: undefined as Actor<typeof kinematicsMachine> | undefined,
  renderFrame: {
    anchorFrameId: 'tau:root',
    originMeters: [0, 0, 0] as [number, number, number],
    metersPerRenderUnit: 1,
  },
  graphicsSnapshot: {
    context: {
      gltfPresentation: { presentedKey: 'geometry' },
      geometryKey: 'geometry',
      pickableMeshesVersion: 0,
      measurements: [],
      currentMeasurementStart: undefined,
      measureSnapDistance: 12,
      measureMode: 'auto',
      measureFilter: 'auto',
      measureOperation: 'point-distance',
      measureFrame: 'tau:root',
      measureSnapEnabled: true,
      measureCandidates: [],
      measureActiveCandidateId: undefined,
      measureChosenCandidateId: undefined,
      measureLockedTargetId: undefined,
      measureCommitRequest: 0,
      measureCatalogRequest: 0,
      committedSectionCuts: [],
      displayUnits: { length: { metersPerUnit: 1, symbol: 'm' } },
      hoveredMeasurementId: undefined,
      isMeasureActive: true,
      cameraInteractionHadMovement: false,
    },
  },
}));

const graphicsActorMock = {
  send: mocks.send,
  getSnapshot: () => mocks.graphicsSnapshot,
  subscribe: () => ({ unsubscribe: vi.fn() }),
};

vi.mock('#hooks/use-graphics.js', () => ({
  useGraphics: () => graphicsActorMock,
  useGraphicsSelector: <T,>(selector: (snapshot: typeof mocks.graphicsSnapshot) => T): T =>
    selector(mocks.graphicsSnapshot),
  useModelInteractionSelector: <T,>(selector: (snapshot: { context: { displayRevision: number } }) => T): T =>
    selector({ context: { displayRevision: 0 } }),
  useRenderFrame: () => mocks.renderFrame,
  useKinematicsRef: () => mocks.kinematics,
}));

vi.mock('#components/geometry/graphics/three/use-section-view.js', () => ({
  resolveSectionViewRaycastClip: () => undefined,
}));

const mechanism: Mechanism = {
  schemaVersion: 1,
  units: { length: 'm', angle: 'rad' },
  root: 'base',
  links: { base: { components: ['component:base'] }, arm: { components: ['component:arm'] } },
  joints: { hinge: { type: 'revolute', parent: 'base', child: 'arm', origin: [0, 0, 0], axis: [0, 0, 1] } },
};

function createStubWebGlRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const renderer = Object.create(THREE.WebGLRenderer.prototype) as THREE.WebGLRenderer;
  Object.defineProperties(renderer, {
    dispose: { value: vi.fn() },
    domElement: { value: canvas },
    render: { value: vi.fn() },
    setPixelRatio: { value: vi.fn() },
    setSize: { value: vi.fn() },
    outputColorSpace: { value: '', writable: true },
    toneMapping: { value: 0, writable: true },
    toneMappingExposure: { value: 1, writable: true },
  });
  return renderer;
}

describe('MeasureTool', () => {
  let canvas: HTMLCanvasElement;
  let root: ReconcilerRoot<HTMLCanvasElement>;

  /** A primary press over the centre of the viewport, where the box sits. */
  const pressCentre = (): void => {
    act(() => {
      canvas.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 400, clientY: 300 }));
    });
  };

  beforeAll(() => {
    extend(THREE as unknown as Parameters<typeof extend>[0]);
  });

  beforeEach(async () => {
    mocks.kinematics = createActor(kinematicsMachine, { input: {} }).start();
    mocks.send.mockClear();
    canvas = document.createElement('canvas');
    canvas.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 800, height: 600 });
    document.body.append(canvas);
    const camera = new THREE.PerspectiveCamera(75, 800 / 600, 0.1, 1000);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    root = createRoot(canvas);
    await act(async () => {
      await root.configure({
        camera,
        events: createPointerEvents,
        frameloop: 'never',
        gl: createStubWebGlRenderer(canvas),
        size: { height: 600, left: 0, top: 0, width: 800 },
      });
      root.render(
        <>
          <primitive object={new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial())} />
          <MeasureTool />
        </>,
      );
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    mocks.kinematics?.stop();
    canvas.remove();
  });

  it('cancels a pending selection when the model pose changes', () => {
    pressCentre();
    act(() => {
      mocks.kinematics!.send({ type: 'loadMechanism', unitId: 'file:main.ts', mechanism });
    });
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'measurementPoseChanged' }));
    expect(mocks.send).toHaveBeenCalledWith({ type: 'cancelCurrentMeasurement' });
  });
});
