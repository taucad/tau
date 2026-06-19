import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  getSectionViewTestControlState,
  getSectionViewTestCapOverlapDiagnostics,
  getSectionViewTestCapPerformanceDiagnostics,
  getSectionViewTestHelperSummary,
  getSectionViewTestSelectorLabels,
} from '#components/geometry/graphics/three/react/section-view-test-bridge.js';
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

  it('should report selector atlas labels from the debug scene', () => {
    const scene = new THREE.Scene();
    const top = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial());
    const left = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial());
    top.geometry.userData['selectorLabel'] = 'Top';
    left.geometry.userData['selectorLabel'] = 'Left';
    scene.add(top, left, new THREE.Object3D());

    expect(getSectionViewTestSelectorLabels(scene).sort()).toEqual(['Left', 'Top']);
  });

  it('should report section helper LineSegments2 objects from the debug scene', () => {
    const scene = new THREE.Scene();
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial());
    fill.userData = sceneTagData(sceneTag.sectionViewHelper);
    fill.renderOrder = viewportRenderTiers.sectionCapFill;

    const borderGeometry = new THREE.BufferGeometry();
    borderGeometry.setAttribute('instanceStart', new THREE.BufferAttribute(new Float32Array(6), 3));
    const border = Object.assign(new THREE.Object3D(), {
      geometry: borderGeometry,
      material: new THREE.LineBasicMaterial({ depthTest: true, depthWrite: false }),
    });
    border.type = 'LineSegments2';
    border.renderOrder = viewportRenderTiers.sectionContourOutline;
    border.userData = sceneTagData(sceneTag.sectionViewHelper);
    const modelEdge = new THREE.Object3D();
    modelEdge.type = 'LineSegments2';
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
