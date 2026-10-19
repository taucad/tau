import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import {
  getSectionViewTestControlState,
  getRenderedModelComponentSurfaceBounds,
  getRenderedModelComponentSurfacePoints,
  getSectionViewTestRenderedModelComponentState,
  getSectionViewTestCapStencilDiagnostics,
  getSectionViewTestHelperSummary,
  projectSectionViewTestHandle,
} from '#components/geometry/debug/section-view-test-bridge.js';
import { setModelComponentOwner } from '@taucad/viewer/graphics/three/utils/model-component-owner';
import { createSectionHandles } from '@taucad/viewer/graphics/three/controls/section-handles';
import { sectionCapStencilDebugUserDataKey } from '@taucad/viewer/graphics/three/utils/section-cap-stencil-debug';
import type { SectionCapStencilDiagnostics } from '@taucad/viewer/graphics/three/utils/section-cap-stencil-debug';
import { viewportRenderTiers } from '@taucad/viewer/graphics/three/utils/render-order.utils';
import { sceneTag, sceneTagData } from '@taucad/viewer/graphics/three/utils/scene-tags';

describe('getSectionViewTestControlState', () => {
  it('should report CameraControls enabled state and viewport gizmo lock state', () => {
    const state = getSectionViewTestControlState({
      controls: { enabled: false },
      interactionLock: { activeRef: { current: true } },
    });

    expect(state).toEqual({
      controlsEnabled: false,
      viewportGizmoLockActive: true,
    });
  });

  it('should default controls to enabled when no controls instance exists', () => {
    const state = getSectionViewTestControlState({
      controls: undefined,
      interactionLock: { activeRef: { current: false } },
    });

    expect(state).toEqual({
      controlsEnabled: true,
      viewportGizmoLockActive: false,
    });
  });

  it('should report section helper LineSegments2 objects from the debug scene', () => {
    const scene = new THREE.Scene();
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial());
    fill.userData = sceneTagData(sceneTag.sectionViewHelper);
    fill.renderOrder = viewportRenderTiers.sectionCapFill;

    const borderGeometry = new LineSegmentsGeometry();
    borderGeometry.setPositions([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]);
    const border = new LineSegments2(borderGeometry, new LineMaterial({ depthTest: true, depthWrite: false }));
    border.renderOrder = viewportRenderTiers.sectionContourOutline;
    border.userData = sceneTagData(sceneTag.sectionViewHelper);
    const modelEdge = new LineSegments2();
    scene.add(fill, border, modelEdge);

    const summary = getSectionViewTestHelperSummary(scene);

    expect(summary.sectionHelperMeshCount).toBe(1);
    expect(summary.sectionHelperLineSegments2Count).toBe(1);
    expect(summary.sectionHelperContourSegmentCount).toBe(2);
    expect(summary.sectionHelperRenderOrders.meshes).toEqual([viewportRenderTiers.sectionCapFill]);
    expect(summary.sectionHelperRenderOrders.lineSegments2).toEqual([viewportRenderTiers.sectionContourOutline]);
    expect(summary.sectionHelperMaterialStates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          objectType: 'LineSegments2',
          renderOrder: viewportRenderTiers.sectionContourOutline,
          transparent: false,
          depthTest: true,
          depthWrite: false,
        }),
      ]),
    );
  });

  it('should project a drawn handle of the selected cut by its kind and cut, and nothing for one not drawn', () => {
    const handles = createSectionHandles({ backend: 'webgl' });
    handles.update({
      cuts: [
        {
          id: 'selected',
          kind: 'plane',
          plane: 'xy',
          offset: 0.01,
          isFlipped: false,
        },
        {
          id: 'other',
          kind: 'plane',
          plane: 'yz',
          offset: 0,
          isFlipped: false,
        },
      ],
      selectedId: 'selected',
      bounds: { min: [-0.05, -0.05, -0.05], max: [0.05, 0.05, 0.05] },
      renderFrame: {
        anchorFrameId: 'tau:root',
        originMeters: [0, 0, 0],
        metersPerRenderUnit: 0.001,
      },
    });
    const scene = new THREE.Scene();
    scene.add(handles.root);
    const camera = new THREE.PerspectiveCamera(60, 1, 1, 1000);
    camera.up.set(0, 0, 1);
    camera.position.set(0, -200, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    handles.layout(camera, 200);
    const rect = { height: 200, left: 10, top: 20, width: 200 };
    const project = (kind: 'plane' | 'select', cutId: string) =>
      projectSectionViewTestHandle({
        target: { kind, cutId },
        camera,
        rect,
        scene,
      });
    // The push-pull arrow stands on the plane at the bounds centre: 10 render units up.
    const arrow = new THREE.Vector3(0, 0, 10).project(camera);

    expect(project('plane', 'selected')?.x).toBeCloseTo(110, 6);
    expect(project('plane', 'selected')?.y).toBeCloseTo(20 + ((1 - arrow.y) / 2) * 200, 6);
    expect(project('plane', 'selected')?.visible).toBe(true);
    expect(project('plane', 'other')).toBeUndefined();

    handles.dispose();
  });

  it('should report the latest stencil cap counts from the debug scene', () => {
    const scene = new THREE.Scene();
    const helperRoot = new THREE.Group();
    const published: SectionCapStencilDiagnostics = {
      sequence: 3,
      latest: {
        pieceCount: 1,
        drawnPieceCount: 1,
        crossingSourceCount: 2,
        overlapCandidateSourceCount: 1,
        outlineSourceCount: 2,
        loopSourceCount: 1,
        openChainDrawCount: 1,
        meshDrawCount: 6,
        polygonDrawCount: 5,
        submitMilliseconds: 0.5,
      },
      loops: [
        {
          sourceKey: 'unit:open-shell',
          closedLoopCount: 2,
          openChainCount: 1,
          pendingFaceCount: 0,
          lastSlice: undefined,
          failure: undefined,
        },
      ],
    };
    helperRoot.userData[sectionCapStencilDebugUserDataKey] = published;
    scene.add(helperRoot);

    expect(getSectionViewTestCapStencilDiagnostics(new THREE.Scene())).toBeUndefined();
    expect(getSectionViewTestCapStencilDiagnostics(scene)).toBe(published);
  });
});

describe('getSectionViewTestRenderedModelComponentState', () => {
  it('should distinguish visible surfaces from fat edges and retain aggregate ancestor visibility', () => {
    const scene = new THREE.Scene();
    const component = new THREE.Group();
    setModelComponentOwner(component, {
      unitId: 'unit:main',
      componentId: 'component:base',
    });
    const surface = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ opacity: 0.25 }));
    const edgeGeometry = new LineSegmentsGeometry();
    edgeGeometry.setPositions([0, 0, 0, 1, 0, 0]);
    const edge = new LineSegments2(edgeGeometry, new LineMaterial({ opacity: 1 }));
    const presentation = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ opacity: 0.75 }));
    presentation.userData = sceneTagData(sceneTag.gltfSurfacePresentation);
    component.add(surface, edge, presentation);
    scene.add(component);

    try {
      expect(edge).toBeInstanceOf(THREE.Mesh);
      expect(getSectionViewTestRenderedModelComponentState(scene, 'component:base')).toEqual({
        meshCount: 3,
        visibleMeshCount: 3,
        materialOpacities: [0.25, 1, 0.75],
        surfaceMaterialOpacities: [0.25],
        edgeMaterialOpacities: [1],
      });
      surface.material.opacity = 1;
      edge.material.opacity = 0.25;
      expect(getSectionViewTestRenderedModelComponentState(scene, 'component:base')).toMatchObject({
        surfaceMaterialOpacities: [1],
        edgeMaterialOpacities: [0.25],
      });
      component.visible = false;
      expect(getSectionViewTestRenderedModelComponentState(scene, 'component:base')).toEqual({
        meshCount: 3,
        visibleMeshCount: 0,
        materialOpacities: [],
        surfaceMaterialOpacities: [],
        edgeMaterialOpacities: [],
      });
      expect(getSectionViewTestRenderedModelComponentState(scene, 'component:other').meshCount).toBe(0);
    } finally {
      surface.geometry.dispose();
      surface.material.dispose();
      edge.geometry.dispose();
      edge.material.dispose();
      presentation.geometry.dispose();
      presentation.material.dispose();
    }
  });
});

describe('getRenderedModelComponentSurfaceBounds', () => {
  it('should measure transformed surface vertices in physical metres and ignore fat-line proxy geometry', () => {
    const scene = new THREE.Scene();
    const parent = new THREE.Group();
    parent.position.set(10, 20, 30);
    parent.rotation.z = Math.PI / 2;
    const surface = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 6), new THREE.MeshBasicMaterial());
    surface.position.set(5, 0, 0);
    const edgeGeometry = new LineSegmentsGeometry();
    edgeGeometry.setPositions([-100, 0, 0, 100, 0, 0]);
    const edge = new LineSegments2(edgeGeometry, new LineMaterial());
    setModelComponentOwner(parent, {
      unitId: 'unit:main',
      componentId: 'component:gear',
    });
    parent.add(surface, edge);
    scene.add(parent);
    try {
      const renderFrame = {
        anchorFrameId: 'tau:root',
        originMeters: [1, 2, 3],
        metersPerRenderUnit: 0.001,
      } as const;
      const bounds = getRenderedModelComponentSurfaceBounds(scene, 'component:gear', renderFrame);
      expect(bounds).toBeDefined();
      for (const [index, value] of [1.008, 2.024, 3.027].entries()) {
        expect(bounds?.min[index]).toBeCloseTo(value, 10);
      }
      for (const [index, value] of [1.012, 2.026, 3.033].entries()) {
        expect(bounds?.max[index]).toBeCloseTo(value, 10);
      }
      expect(getRenderedModelComponentSurfaceBounds(scene, 'component:absent', renderFrame)).toBeUndefined();
      const points = getRenderedModelComponentSurfacePoints(scene, 'component:gear', renderFrame);
      expect(points).toHaveLength(24);
      expect(
        points.some(
          ([x, y, z]) => Math.abs(x - 1.008) < 1e-10 && Math.abs(y - 2.026) < 1e-10 && Math.abs(z - 3.033) < 1e-10,
        ),
      ).toBe(true);
      parent.position.x += 4;
      const moved = getRenderedModelComponentSurfacePoints(scene, 'component:gear', renderFrame);
      for (const [index, point] of moved.entries()) {
        expect(point[0] - points[index]![0]).toBeCloseTo(0.004, 10);
        expect(point.slice(1)).toEqual(points[index]!.slice(1));
        // A real geometry/anchor displacement remains above the planetary acceptance threshold.
        expect(Math.hypot(...point.map((value, axis) => value - points[index]![axis]!))).toBeGreaterThan(1e-7);
      }
      expect(getRenderedModelComponentSurfacePoints(scene, 'component:absent', renderFrame)).toEqual([]);
    } finally {
      surface.geometry.dispose();
      surface.material.dispose();
      edge.geometry.dispose();
      edge.material.dispose();
    }
  });
});
