import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import {
  getSectionViewTestControlState,
  getSectionViewTestRenderedModelComponentState,
  getSectionViewTestCapOverlapDiagnostics,
  getSectionViewTestCapPerformanceDiagnostics,
  getSectionViewTestHelperSummary,
  projectSectionViewTestHandle,
} from '#components/geometry/graphics/three/react/section-view-test-bridge.js';
import { setModelComponentOwner } from '#components/geometry/graphics/three/utils/model-component-owner.js';
import { createSectionHandles } from '#components/geometry/graphics/three/controls/section-handles.js';
import { sectionCapOverlapDebugUserDataKey } from '#components/geometry/graphics/three/utils/section-cap-overlap-debug.js';
import {
  appendSectionCapPerformanceFrame,
  createSectionCapFramePerformance,
  sectionCapPerformanceDebugUserDataKey,
} from '#components/geometry/graphics/three/utils/section-cap-performance-debug.js';
import { viewportRenderTiers } from '#components/geometry/graphics/three/utils/render-order.utils.js';
import { sceneTag, sceneTagData } from '#components/geometry/graphics/three/utils/scene-tags.js';

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
        { id: 'selected', kind: 'plane', plane: 'xy', offset: 0.01, isFlipped: false },
        { id: 'other', kind: 'plane', plane: 'yz', offset: 0, isFlipped: false },
      ],
      selectedId: 'selected',
      bounds: { min: [-0.05, -0.05, -0.05], max: [0.05, 0.05, 0.05] },
      renderFrame: { anchorFrameId: 'tau:root', originMeters: [0, 0, 0], metersPerRenderUnit: 0.001 },
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
      projectSectionViewTestHandle({ target: { kind, cutId }, camera, rect, scene });
    // The push-pull arrow stands on the plane at the bounds centre: 10 render units up.
    const arrow = new THREE.Vector3(0, 0, 10).project(camera);

    expect(project('plane', 'selected')?.x).toBeCloseTo(110, 6);
    expect(project('plane', 'selected')?.y).toBeCloseTo(20 + ((1 - arrow.y) / 2) * 200, 6);
    expect(project('plane', 'selected')?.visible).toBe(true);
    expect(project('plane', 'other')).toBeUndefined();

    handles.dispose();
  });

  it('should report exact-only section cap overlap diagnostics from the debug scene', () => {
    const scene = new THREE.Scene();
    const helperRoot = new THREE.Group();
    helperRoot.userData[sectionCapOverlapDebugUserDataKey] = {
      sourceCount: 3,
      sourcePairCount: 3,
      broadphaseCandidatePairCount: 2,
      exactIntersectionPairCount: 2,
      positiveAreaPairCount: 1,
      renderedOverlapArea: 0.25,
      splitFailed: false,
      diagnostics: [],
    };
    scene.add(helperRoot);

    const diagnostics = getSectionViewTestCapOverlapDiagnostics(scene);

    expect(diagnostics?.exactIntersectionPairCount).toBe(diagnostics?.broadphaseCandidatePairCount);
    expect(diagnostics?.renderedOverlapArea).toBe(0.25);
    expect(Object.keys(diagnostics ?? {}).sort()).toEqual([
      'broadphaseCandidatePairCount',
      'diagnostics',
      'exactIntersectionPairCount',
      'positiveAreaPairCount',
      'renderedOverlapArea',
      'sourceCount',
      'sourcePairCount',
      'splitFailed',
    ]);
  });

  it('should report section cap performance diagnostics from the debug scene', () => {
    const scene = new THREE.Scene();
    const helperRoot = new THREE.Group();
    const frame = createSectionCapFramePerformance(1, 100);
    frame.timings.frameTotal = 12;
    frame.counters.sourceCount = 2;
    frame.counters.baseFillVertexCount = 12;
    frame.counters.baseBoundarySegmentCount = 4;
    frame.counters.exactDiagnosticPendingFrameCount = 1;
    frame.baseCapTopologyKey = 'base:topology';
    frame.baseCapFrameTopologyKey = 'base:topology';
    frame.baseCapIsCurrent = true;
    frame.exactDiagnosticIsCurrent = false;
    helperRoot.userData[sectionCapPerformanceDebugUserDataKey] = appendSectionCapPerformanceFrame(undefined, frame);
    scene.add(helperRoot);

    const diagnostics = getSectionViewTestCapPerformanceDiagnostics(scene);

    expect(diagnostics?.latestFrame.sequence).toBe(1);
    expect(diagnostics?.latestFrame.counters.sourceCount).toBe(2);
    expect(diagnostics?.latestFrame.counters.baseFillVertexCount).toBe(12);
    expect(diagnostics?.latestFrame.counters.baseBoundarySegmentCount).toBe(4);
    expect(diagnostics?.latestFrame.baseCapIsCurrent).toBe(true);
    expect(diagnostics?.latestFrame.exactDiagnosticIsCurrent).toBe(false);
    expect(diagnostics?.aggregates.frameTotal.max).toBe(12);
    expect(Object.keys(diagnostics?.latestFrame.timings ?? {}).sort()).toContain('overlapClassify');
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
