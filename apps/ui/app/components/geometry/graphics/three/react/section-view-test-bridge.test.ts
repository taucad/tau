import React from 'react';
import { render } from '@testing-library/react';
import * as Fiber from '@react-three/fiber';
import * as FeatureHooks from '#flags/use-feature.js';
import * as ProjectHooks from '#hooks/use-project.js';
import * as CadHooks from '#hooks/use-cad.js';
import * as GraphicsHooks from '#hooks/use-graphics.js';
import { measurementCatalogGetterKey } from '#components/geometry/graphics/three/react/measure-tool.js';
import type { MeasurementCatalogObservation } from '#components/geometry/graphics/three/react/measure-tool.js';
import * as GizmoHooks from '#components/geometry/graphics/three/controls/viewport-gizmo-interaction-lock.js';
import type { fileManagerMachine } from '#machines/file-manager.machine.js';
import type { ActorRefFrom, SnapshotFrom } from 'xstate';
import type { GraphicsContext, PaneRenderingProvenance } from '#machines/graphics.machine.js';
import { createEmptyGlb, writeGlb, validateAdmittedAssemblyGlb } from '@taucad/geometry-core';
import { createThreeCameraRig } from '@taucad/three';
import type { SourceRevision } from '@taucad/runtime';
import type { AdmittedAssembly, PublishedPartVariant } from '@taucad/runtime/types';
import { sha256Bytes } from '@taucad/utils/hash';
import type { KinematicsPoseUnit } from '#components/geometry/graphics/three/react/kinematics-pose-composer.js';
import type { CadAssemblyDisplay, CadContext } from '#machines/cad.machine.js';
import type { FileContentService } from '@taucad/fs-client/file-content-service';
import { workbenchPaths, workbenchRecords } from '@taucad/workbench';
import { FileNotFoundError } from '@taucad/fs-client/file-content-errors';
import { digestBytes } from '#utils/crypto.utils.js';
import { contentDigest } from '@taucad/cache-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mock, mockDeep } from 'vitest-mock-extended';
import { clearRendererSpans, recordRendererSpan } from '#lib/renderer-telemetry.js';
import { WorkspacePathResolver } from '@taucad/fs-client/workspace-path-resolver';
import * as THREE from 'three';
import Info from 'three/src/renderers/common/Info.js';
import * as GltfMeshOwner from '#components/geometry/graphics/three/react/gltf-mesh.js';
import { setGltfAssemblyBounds } from '#components/geometry/graphics/three/use-geometry-bounds.js';
import type { KinematicsUnitState } from '#machines/kinematics.machine.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { applyFatLineSegments } from '#components/geometry/graphics/three/materials/gltf-edges.js';
import {
  SectionViewTestBridge,
  exportSectionViewTestPosedAssembly,
  readSectionViewTestDocument,
  readSectionViewTestDisplayedDocument,
  getSectionViewTestControlState,
  readSectionViewTestRenderDeviceIdentity,
  observeSectionViewTestBackendBindings,
  getSectionViewTestStockComponentHit,
  projectSectionViewTestDrawBounds,
  isSectionViewTestAssemblyCurrent,
  readSectionViewTestAssemblyBytes,
  readSectionViewTestAssemblyResourceTelemetry,
  getSectionViewTestCapOverlapDiagnostics,
  getSectionViewTestCapPerformanceDiagnostics,
  getSectionViewTestHelperSummary,
  getSectionViewTestTaggedResourceInventory,
  projectSectionViewTestHandle,
} from '#components/geometry/graphics/three/react/section-view-test-bridge.js';
import type { SectionViewTestBridgeApi } from '#components/geometry/graphics/three/react/section-view-test-bridge.js';
import { createSectionHandles } from '#components/geometry/graphics/three/controls/section-handles.js';
import { sectionCapOverlapDebugUserDataKey } from '#components/geometry/graphics/three/utils/section-cap-overlap-debug.js';
import {
  appendSectionCapPerformanceFrame,
  createSectionCapFramePerformance,
  sectionCapPerformanceDebugUserDataKey,
} from '#components/geometry/graphics/three/utils/section-cap-performance-debug.js';
import { viewportRenderTiers } from '#components/geometry/graphics/three/utils/render-order.utils.js';
import { resolveSectionPieces } from '#components/geometry/graphics/section-cuts.js';
import { sceneTag, sceneTagData } from '#components/geometry/graphics/three/utils/scene-tags.js';
import {
  createGltfSurfaceBatches,
  qualifyGltfSurfaceMaterial,
} from '#components/geometry/graphics/three/utils/gltf-surface-batches.js';
import {
  getModelComponentIdInHierarchy,
  setModelComponentInstanceSlots,
  setModelComponentOwner,
} from '#components/geometry/graphics/three/utils/model-component-owner.js';

describe('readSectionViewTestDocument', () => {
  const context = (): CadContext =>
    Object.assign(mock<CadContext>(), {
      document: mock<NonNullable<CadContext['document']>>({ id: 'actual-document' }),
      evaluation: { success: true, id: 'actual-evaluation', transient: false, views: [], exports: [], issues: [] },
      committedRendering: {
        success: true,
        view: 'model',
        hash: 'actual-key',
        requestId: 'actual-request',
        evaluationId: 'actual-evaluation',
        transient: false,
        issues: [],
        artifact: { mimeType: 'image/svg+xml', content: '<svg/>' },
        sourceRevision: {
          entry: 'main.ts',
          files: { 'main.ts': contentDigest({ value: `sha256:${'a'.repeat(64)}`, name: 'held source' }) },
        },
      },
    } satisfies Partial<CadContext>);
  it('should read actual held IDs and keep the same tuple parked without retaining or reviving its document', () => {
    const value = context();
    const { document } = value;
    const tuple = readSectionViewTestDocument(value);
    expect(tuple).toMatchObject({
      documentId: 'actual-document',
      evaluationId: 'actual-evaluation',
      requestId: 'actual-request',
      key: 'actual-key',
    });
    value.document = undefined;
    expect(readSectionViewTestDocument(value)).toEqual({
      evaluationId: 'actual-evaluation',
      requestId: 'actual-request',
      key: 'actual-key',
      sourceFiles: { 'main.ts': `sha256:${'a'.repeat(64)}` },
    });
    expect(document?.view).not.toHaveBeenCalled();
    expect(document?.on).not.toHaveBeenCalled();
    expect(document?.close).not.toHaveBeenCalled();
  });
  it('should deny a mismatched evaluation or transient picture even with the same held key', () => {
    const value = context();
    value.evaluation = { success: true, id: 'other-evaluation', transient: false, views: [], exports: [], issues: [] };
    expect(readSectionViewTestDocument(value)).toBeUndefined();
    const transient = context();
    if (!transient.committedRendering) {
      throw new Error('Expected held fixture');
    }
    transient.committedRendering = { ...transient.committedRendering, transient: true };
    expect(readSectionViewTestDocument(transient)).toBeUndefined();
  });
});

describe('readSectionViewTestDisplayedDocument', () => {
  const fixture = () => {
    const sourceRevision: SourceRevision = {
      entry: 'main.ts',
      files: {
        'main.ts': contentDigest({ value: `sha256:${'a'.repeat(64)}`, name: 'pane source' }),
      },
    };
    const pane: PaneRenderingProvenance = {
      documentId: 'actual-document',
      evaluationId: 'actual-evaluation',
      requestId: 'actual-pane-request',
      hash: 'same-output',
      sourceRevision,
      isCurrent: vi.fn(() => true),
    };
    const context: CadContext = Object.assign(mock<CadContext>(), {
      document: mock<NonNullable<CadContext['document']>>({ id: pane.documentId }),
      evaluation: {
        success: true,
        id: pane.evaluationId,
        transient: false,
        views: [],
        exports: [],
        issues: [],
        sourceRevision,
      },
      entryPath: sourceRevision.entry,
      latestRenderingOutcome: 'success',
      lastRequestedRenderId: 2,
      lastSettledRenderId: 2,
      committedRendering: {
        success: true,
        transient: false,
        view: 'model',
        requestId: 'actual-default-request',
        evaluationId: pane.evaluationId,
        hash: pane.hash,
        sourceRevision,
        issues: [],
        artifact: { mimeType: 'model/gltf-binary', content: createEmptyGlb() },
      },
    } satisfies Partial<CadContext>);
    const graphics: GraphicsContext = Object.assign(mock<GraphicsContext>(), {
      paneRendering: pane,
      artifact: { mimeType: 'model/gltf-binary', content: createEmptyGlb() },
      artifactSourceFile: sourceRevision.entry,
      artifactKey: pane.hash,
      gltfPresentation: {
        requestedKey: pane.hash,
        presentedKey: pane.hash,
        requestedRevision: 3,
        presentedRevision: 3,
        phase: 'presented',
      },
    } satisfies Partial<GraphicsContext>);
    return { context, graphics, pane };
  };
  it('should retain distinct actual pane and default request IDs even with the same output hash', () => {
    const { context, graphics, pane } = fixture();
    const displayed = readSectionViewTestDisplayedDocument(context, graphics);
    expect(displayed).toEqual({
      documentId: pane.documentId,
      evaluationId: pane.evaluationId,
      requestId: pane.requestId,
      key: pane.hash,
      sourceFiles: pane.sourceRevision.files,
    });
    expect(readSectionViewTestDocument(context)?.requestId).toBe('actual-default-request');
    expect(displayed?.requestId).not.toBe(readSectionViewTestDocument(context)?.requestId);
  });
  it('should deny a same-output record from another document, evaluation or source epoch', () => {
    const { context, graphics, pane } = fixture();
    graphics.paneRendering = { ...pane, documentId: 'other-document' };
    expect(readSectionViewTestDisplayedDocument(context, graphics)).toBeUndefined();
    graphics.paneRendering = { ...pane, evaluationId: 'other-evaluation' };
    expect(readSectionViewTestDisplayedDocument(context, graphics)).toBeUndefined();
    graphics.paneRendering = { ...pane, sourceRevision: { ...pane.sourceRevision, entry: 'other.ts' } };
    expect(readSectionViewTestDisplayedDocument(context, graphics)).toBeUndefined();
    graphics.paneRendering = pane;
    context.document = undefined;
    expect(readSectionViewTestDisplayedDocument(context, graphics)).toBeUndefined();
  });
  it('should deny changed or missing evaluation source closure with identical document, evaluation, request and output IDs', () => {
    const { context, graphics, pane } = fixture();
    const { evaluation } = context;
    expect(evaluation?.success).toBe(true);
    if (!evaluation?.success) {
      throw new Error('Expected the successful evaluation fixture.');
    }
    const changedSource: SourceRevision = {
      ...pane.sourceRevision,
      files: {
        'main.ts': contentDigest({ value: `sha256:${'b'.repeat(64)}`, name: 'changed pane source' }),
      },
    };
    context.evaluation = { ...evaluation, sourceRevision: changedSource };
    expect(readSectionViewTestDisplayedDocument(context, graphics)).toBeUndefined();
    context.evaluation = { ...evaluation, sourceRevision: { ...pane.sourceRevision, entry: 'other.ts' } };
    expect(readSectionViewTestDisplayedDocument(context, graphics)).toBeUndefined();
    context.evaluation = { ...evaluation, sourceRevision: undefined };
    expect(readSectionViewTestDisplayedDocument(context, graphics)).toBeUndefined();
    context.evaluation = {
      ...evaluation,
      sourceRevision: { ...pane.sourceRevision, files: { ...pane.sourceRevision.files } },
    };
    expect(readSectionViewTestDisplayedDocument(context, graphics)).toEqual({
      documentId: pane.documentId,
      evaluationId: pane.evaluationId,
      requestId: pane.requestId,
      key: pane.hash,
      sourceFiles: pane.sourceRevision.files,
    });
  });
  it('should deny released, failed, unsettled or replaced pictures while their hash remains visible', () => {
    const { context, graphics, pane } = fixture();
    graphics.paneRendering = { ...pane, isCurrent: () => false };
    expect(readSectionViewTestDisplayedDocument(context, graphics)).toBeUndefined();
    graphics.paneRendering = pane;
    context.latestRenderingOutcome = 'failure';
    expect(readSectionViewTestDisplayedDocument(context, graphics)).toBeUndefined();
    context.latestRenderingOutcome = 'success';
    context.lastSettledRenderId = 1;
    expect(readSectionViewTestDisplayedDocument(context, graphics)).toBeUndefined();
    context.lastSettledRenderId = 2;
    graphics.gltfPresentation = { ...graphics.gltfPresentation, presentedRevision: 2 };
    expect(readSectionViewTestDisplayedDocument(context, graphics)).toBeUndefined();
    graphics.gltfPresentation = { ...graphics.gltfPresentation, presentedRevision: 3 };
    graphics.artifactKey = 'replacement';
    expect(readSectionViewTestDisplayedDocument(context, graphics)).toBeUndefined();
    graphics.artifactKey = pane.hash;
    context.evaluation = { success: true, id: pane.evaluationId, transient: true, views: [], exports: [], issues: [] };
    expect(readSectionViewTestDisplayedDocument(context, graphics)).toBeUndefined();
    expect(context.document?.view).not.toHaveBeenCalled();
    expect(context.document?.on).not.toHaveBeenCalled();
    expect(context.document?.close).not.toHaveBeenCalled();
  });
});

describe('getSectionViewTestControlState', () => {
  it('counts only current mounted measurement and section resource views, including shared backing', () => {
    const scene = new THREE.Scene();
    const sibling = new THREE.Scene();
    const backing = new Float32Array(64);
    const material = new THREE.MeshBasicMaterial();
    const geometries: THREE.BufferGeometry[] = [];
    const makeHelper = (tag: (typeof sceneTag)['measurementUi' | 'sectionViewHelper'], offset: number) => {
      const root = new THREE.Group();
      root.userData = sceneTagData(tag);
      const geometry = new THREE.BufferGeometry();
      geometries.push(geometry);
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(backing.buffer, offset, 9), 3));
      root.add(new THREE.Mesh(geometry, material));
      return root;
    };
    const measurement = makeHelper(sceneTag.measurementUi, 0);
    const section = makeHelper(sceneTag.sectionViewHelper, 128);
    scene.add(measurement, section);
    sibling.add(makeHelper(sceneTag.measurementUi, 0));
    const current = () => true;
    expect(getSectionViewTestTaggedResourceInventory(scene, () => false)).toBeUndefined();
    const changed = vi.fn<() => boolean>().mockReturnValueOnce(true).mockReturnValueOnce(false);
    expect(getSectionViewTestTaggedResourceInventory(scene, changed)).toBeUndefined();
    expect(changed).toHaveBeenCalledTimes(2);
    const inventory = getSectionViewTestTaggedResourceInventory(scene, current);
    expect(inventory).toEqual({
      measurementUi: {
        objectCount: 2,
        geometryCount: 1,
        materialCount: 1,
        attributeHandleCount: 1,
        bufferCount: 1,
        backingBytes: 256,
        payloadBytes: 36,
      },
      sectionViewHelper: {
        objectCount: 2,
        geometryCount: 1,
        materialCount: 1,
        attributeHandleCount: 1,
        bufferCount: 1,
        backingBytes: 256,
        payloadBytes: 36,
      },
      union: {
        objectCount: 4,
        geometryCount: 2,
        materialCount: 1,
        attributeHandleCount: 2,
        bufferCount: 1,
        backingBytes: 256,
        payloadBytes: 72,
      },
    });
    scene.remove(measurement, section);
    expect(getSectionViewTestTaggedResourceInventory(scene, current)?.union.bufferCount).toBe(0);
    expect(getSectionViewTestTaggedResourceInventory(sibling, current)?.union.payloadBytes).toBe(36);
    for (const geometry of geometries) {
      geometry.dispose();
    }
    material.dispose();
  });

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

describe('committed assembly debug capture coherence (not admission)', () => {
  const displayA = {};
  const displayB = {};
  const current = {
    live: true,
    projectCurrent: true,
    cadActive: true,
    graphicsActive: true,
    selectedDisplay: displayA,
    capturedDisplay: displayA,
    capturedKey: 'root-a',
    presentedKey: 'root-a',
    outcome: 'success',
    requestedRenderId: 3,
    settledRenderId: 3,
    capturedRenderId: 3,
  } as const;

  it('qualifies only the same settled subject actually presented by this live project', () => {
    expect(isSectionViewTestAssemblyCurrent(current)).toBe(true);
    expect(isSectionViewTestAssemblyCurrent({ ...current, selectedDisplay: undefined })).toBe(false);
    expect(isSectionViewTestAssemblyCurrent({ ...current, selectedDisplay: displayB })).toBe(false);
    expect(isSectionViewTestAssemblyCurrent({ ...current, requestedRenderId: 4 })).toBe(false);
    expect(isSectionViewTestAssemblyCurrent({ ...current, settledRenderId: 2 })).toBe(false);
  });

  it('denies successful root B while viewport A is preparing or retains A after failure', () => {
    const selectedB = { ...current, selectedDisplay: displayB, capturedDisplay: displayB, capturedKey: 'root-b' };
    expect(isSectionViewTestAssemblyCurrent(selectedB)).toBe(false);
    expect(isSectionViewTestAssemblyCurrent({ ...selectedB, outcome: 'failure' })).toBe(false);
    expect(isSectionViewTestAssemblyCurrent({ ...selectedB, outcome: undefined })).toBe(false);
    expect(isSectionViewTestAssemblyCurrent({ ...selectedB, presentedKey: 'root-b' })).toBe(true);
  });

  it('revokes a captured subject on project replacement, teardown, or either actor close', () => {
    expect(isSectionViewTestAssemblyCurrent({ ...current, live: false })).toBe(false);
    expect(isSectionViewTestAssemblyCurrent({ ...current, projectCurrent: false })).toBe(false);
    expect(isSectionViewTestAssemblyCurrent({ ...current, cadActive: false })).toBe(false);
    expect(isSectionViewTestAssemblyCurrent({ ...current, graphicsActive: false })).toBe(false);
  });
});

describe('captured committed assembly binary read', () => {
  const parent = `.tau/artifacts/reusable-parts/${'a'.repeat(64)}/`;
  const path = `${parent}scene.json`;

  it('uses the captured rooted service, denying cross-parent paths before any read', async () => {
    const bytes = new Uint8Array([0, 255, 128, 10]);
    const paths = new WorkspacePathResolver('/projects/current');
    const read = vi.fn(async (key: string) => {
      paths.toWorkspaceRelativeKey('readRawBytes', key);
      return bytes;
    });
    const authority = { parent, fileSystemRoot: '/projects/current', isCurrent: () => true, readRawBytes: read };
    expect(await readSectionViewTestAssemblyBytes(path, authority)).toBe(bytes);
    expect(read).toHaveBeenCalledExactlyOnceWith(path);
    read.mockClear();
    await expect(
      readSectionViewTestAssemblyBytes('.tau/artifacts/reusable-parts/other/scene.json', authority),
    ).rejects.toThrow(/escapes/u);
    await expect(readSectionViewTestAssemblyBytes('../other', authority)).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
  });

  it('refuses both an already retired authority and retirement while its real binary read awaits', async () => {
    const read = vi.fn(async () => new Uint8Array([0, 255]));
    await expect(
      readSectionViewTestAssemblyBytes(path, {
        parent,
        fileSystemRoot: '/projects/current',
        isCurrent: () => false,
        readRawBytes: read,
      }),
    ).rejects.toThrow(/before/u);
    expect(read).not.toHaveBeenCalled();
    let live = true;
    let resolveRead: ((bytes: Uint8Array<ArrayBuffer>) => void) | undefined;
    const pending = readSectionViewTestAssemblyBytes(path, {
      parent,
      fileSystemRoot: '/projects/current',
      isCurrent: () => live,
      readRawBytes: async () =>
        new Promise<Uint8Array<ArrayBuffer>>((resolve) => {
          resolveRead = resolve;
        }),
    });
    live = false;
    resolveRead!(new Uint8Array([0, 255]));
    await expect(pending).rejects.toThrow(/during/u);
  });
});

describe('committed assembly bridge registration lifetime', () => {
  it('should retain the held reader, authored camera and backend frame authority but revoke real replacement and teardown', async () => {
    const bytes = new Uint8Array([0, 255, 128, 10]);
    const parent = `.tau/artifacts/reusable-parts/${'a'.repeat(64)}/`;
    const path = `${parent}scene.json`;
    const display = mockDeep<CadAssemblyDisplay>({
      root: { path, digest: contentDigest({ value: `sha256:${'a'.repeat(64)}` }), byteLength: bytes.byteLength },
    });
    const contentService = mock<FileContentService>();
    const files = mockDeep<SnapshotFrom<typeof fileManagerMachine>>({ status: 'active' });
    Object.assign(files.context, { rootDirectory: '/projects/current', contentService });
    files.matches.mockReturnValue(true);
    const fileManagerRef = mock<ActorRefFrom<typeof fileManagerMachine>>({ getSnapshot: () => files });
    const cadRef = mock<NonNullable<ReturnType<typeof CadHooks.useCad>>>();
    const cad = mockDeep<ReturnType<typeof cadRef.getSnapshot>>({ status: 'active' });
    Object.assign(cad.context, {
      entryPath: 'assembly.json',
      fileManagerRef,
      fileSystemRoot: '/projects/current',
      rendering: undefined,
      committedRendering: undefined,
      committedAssemblyDisplay: display,
      publishedAssemblyRoot: display.root,
      admittedAssembly: display.admitted,
      publishedAssembly: display.admitted.publication,
      publishedAssemblyEntryPath: 'assembly.json',
      lastRequestedRenderId: 2,
      lastSettledRenderId: 2,
      latestRenderingOutcome: 'success',
    });
    cadRef.getSnapshot.mockReturnValue(cad);
    const graphicsRef = mock<ReturnType<typeof GraphicsHooks.useGraphics>>();
    const graphics = mockDeep<ReturnType<typeof graphicsRef.getSnapshot>>({
      status: 'active',
      context: { paneRendering: undefined, gltfPresentation: { presentedKey: display.root.digest } },
    });
    graphicsRef.getSnapshot.mockReturnValue(graphics);
    const projectRef = mock<NonNullable<ReturnType<typeof ProjectHooks.useProject>>['projectRef']>();
    const projectSnapshot = mockDeep<ReturnType<typeof projectRef.getSnapshot>>({ status: 'active' });
    Object.assign(projectSnapshot.context, {
      projectId: 'current',
      fileManagerRef,
      fileSystemRoot: '/projects/current',
      geometryUnits: new Map([['assembly.json', cadRef]]),
      viewGraphics: new Map([['view', graphicsRef]]),
    });
    projectSnapshot.matches.mockReturnValue(true);
    projectRef.getSnapshot.mockReturnValue(projectSnapshot);
    const initialRecord = workbenchRecords.view.schema.parse({ version: 1, entryPath: 'assembly.json' });
    const viewPath = workbenchPaths.view('view');
    const viewBytes = new TextEncoder().encode(workbenchRecords.view.serialize(initialRecord));
    const appliedRevisions = new Map<string, `sha256:${string}`>();
    let readView = async (): Promise<Uint8Array<ArrayBuffer>> => viewBytes;
    const project = mock<NonNullable<ReturnType<typeof ProjectHooks.useProject>>>();
    Object.assign(project, {
      projectId: 'current',
      projectRef,
      viewRecords: new Map([['view', initialRecord]]),
      appliedWorkbenchRevisions: appliedRevisions,
    });
    const scope = globalThis as typeof globalThis & {
      __TAU_SECTION_VIEW_TEST__?: SectionViewTestBridgeApi;
      __TAU_SECTION_VIEW_TEST_BRIDGES__?: SectionViewTestBridgeApi[];
    };
    let view: ReturnType<typeof render> | undefined;
    let releaseRead: ((value: Uint8Array<ArrayBuffer>) => void) | undefined;
    let pendingRead: Promise<Uint8Array<ArrayBuffer>> | undefined;
    const rig = createThreeCameraRig({
      initialView: {
        frameId: 'tau:root',
        requestedVerticalFieldOfView: 60,
        perspectiveZoom: 1,
        target: [0, 0, 0],
        direction: [1, -1, 0.7],
        up: [0, 0, 1],
        verticalSpan: 1,
        viewport: { width: 100, height: 100, pixelRatio: 1 },
        bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
      },
    });
    rig.actorRef.start();
    const [body] = await Promise.allSettled([
      (async () => {
        const projectHook = vi.spyOn(ProjectHooks, 'useProject').mockReturnValue(project);
        vi.spyOn(FeatureHooks, 'useFeature').mockReturnValue(true);
        vi.spyOn(CadHooks, 'useCad').mockReturnValue(cadRef);
        vi.spyOn(GraphicsHooks, 'useGraphics').mockReturnValue(graphicsRef);
        vi.spyOn(GraphicsHooks, 'useCameraRig').mockReturnValue(rig);
        const framing = mock<ReturnType<typeof GraphicsHooks.useViewCameraFraming>>({ initialized: false });
        vi.spyOn(GraphicsHooks, 'useViewCameraFraming').mockReturnValue(framing);
        vi.spyOn(GraphicsHooks, 'useCameraConnectorRef').mockReturnValue({ current: vi.fn() });
        vi.spyOn(GraphicsHooks, 'useSetRenderFrame').mockReturnValue(vi.fn());
        vi.spyOn(GraphicsHooks, 'useModelInteractionRef').mockReturnValue(
          mock<ReturnType<typeof GraphicsHooks.useModelInteractionRef>>(),
        );
        vi.spyOn(GizmoHooks, 'useViewportGizmoInteractionLock').mockReturnValue(
          GizmoHooks.createViewportGizmoInteractionLock(),
        );
        const viewport = mock<Fiber.RootState>();
        viewport.scene = new THREE.Scene();
        viewport.camera = rig.activeCamera;
        const context = mock<
          WebGL2RenderingContext & {
            getExtension(name: 'WEBGL_debug_renderer_info'): WEBGL_debug_renderer_info;
          }
        >();
        const debug = mock<WEBGL_debug_renderer_info>();
        context.getExtension.mockReturnValue(debug);
        context.getParameter.mockReturnValue('fixture renderer');
        const renderer = mock<THREE.WebGLRenderer>();
        renderer.getContext.mockReturnValue(context);
        renderer.info = mockDeep<THREE.WebGLRenderer['info']>({ render: { frame: 4 } });
        viewport.gl = renderer;
        viewport.size = { width: 100, height: 100, top: 0, left: 0 };
        viewport.get.mockReturnValue(viewport);
        vi.spyOn(Fiber, 'useThree').mockReturnValue(viewport.get);
        vi.spyOn(Fiber, 'useFrame').mockImplementation(() => null);
        contentService.readRawBytes.mockImplementation(async (selectedPath) =>
          selectedPath === viewPath
            ? readView()
            : new Promise<Uint8Array<ArrayBuffer>>((resolve) => {
                releaseRead = resolve;
              }),
        );
        view = render(React.createElement(SectionViewTestBridge, { isGeometryFramed: true }));
        const bridge = scope.__TAU_SECTION_VIEW_TEST__!;
        expect(bridge.getTaggedResourceInventory()).toBeUndefined();
        const projectionCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
        projectionCamera.position.set(0, 0, 6);
        projectionCamera.updateMatrixWorld(true);
        const previousInverse = projectionCamera.matrixWorldInverse.clone();
        projectionCamera.position.set(1, 2, 8);
        projectionCamera.quaternion.setFromEuler(new THREE.Euler(0.1, -0.15, 0.05));
        const currentCamera = projectionCamera.clone();
        currentCamera.updateMatrixWorld(true);
        expect(projectionCamera.parent).toBeNull();
        expect(projectionCamera.matrixWorldInverse.equals(previousInverse)).toBe(true);
        expect(currentCamera.matrixWorldInverse.equals(previousInverse)).toBe(false);
        const projectionGeometry = new THREE.BoxGeometry(2, 1, 0.5);
        const projectionMaterial = new THREE.MeshBasicMaterial();
        const projectionMesh = new THREE.Mesh(projectionGeometry, projectionMaterial);
        projectionMesh.position.set(-0.3, 0.2, 0);
        setModelComponentOwner(projectionMesh, { unitId: 'projection-unit', componentId: 'projection-body' });
        viewport.scene.add(projectionMesh);
        projectionMesh.updateMatrixWorld(true);
        const projectionCanvas = document.createElement('canvas');
        vi.spyOn(projectionCanvas, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 100, 100));
        const heldCanvas = renderer.domElement;
        viewport.camera = projectionCamera;
        Object.assign(renderer, { domElement: projectionCanvas });
        try {
          const positions = projectionGeometry.getAttribute('position');
          const indices = projectionGeometry.index!;
          const centre = new THREE.Vector3();
          for (let vertex = 0; vertex < 3; vertex++) {
            centre.add(new THREE.Vector3().fromBufferAttribute(positions, indices.getX(vertex)));
          }
          centre
            .multiplyScalar(1 / 3)
            .applyMatrix4(projectionMesh.matrixWorld)
            .project(currentCamera);
          // Invoke the mounted bridge's actual projection before any getCamera read can update its matrices.
          const projected = bridge.projectModelComponent('projection-body');
          expect(projected).toHaveLength(12);
          expect(projected[0]!.x).toBeCloseTo(10 + ((centre.x + 1) / 2) * 100, 8);
          expect(projected[0]!.y).toBeCloseTo(20 + ((1 - centre.y) / 2) * 100, 8);
          // Product wide lines render endpoint attributes, never their extrusion template triangles.
          const edgeGeometry = new THREE.EdgesGeometry(projectionGeometry);
          const edgeMaterial = new THREE.LineBasicMaterial();
          const edgeSource = new THREE.LineSegments(edgeGeometry, edgeMaterial);
          let fatLine: THREE.Mesh | undefined;
          projectionMesh.add(edgeSource);
          try {
            applyFatLineSegments(
              { scene: projectionMesh },
              { backend: 'webgl', resolution: new THREE.Vector2(100, 100), preserveSourceNodes: true },
            );
            const expanded = edgeSource.children[0];
            if (!(expanded instanceof THREE.Mesh)) {
              throw new Error('Product edge conversion returned no actual wide-line mesh.');
            }
            fatLine = expanded;
            expect(fatLine.type).toBe('LineSegments2');
            expect(fatLine.material).toBeInstanceOf(LineMaterial);
            expect(edgeMaterial.visible).toBe(false);
            expect(fatLine.parent).toBe(edgeSource);
            expect(edgeSource.parent).toBe(projectionMesh);
            expect(getModelComponentIdInHierarchy(fatLine)).toBe('projection-body');
            viewport.scene.updateMatrixWorld(true);
            expect(fatLine.matrixWorld.equals(projectionMesh.matrixWorld)).toBe(true);
            const endpoints = edgeGeometry.getAttribute('position');
            const starts = fatLine.geometry.getAttribute('instanceStart');
            const ends = fatLine.geometry.getAttribute('instanceEnd');
            expect(starts.count).toBe(endpoints.count / 2);
            expect(new THREE.Vector3().fromBufferAttribute(starts, 0).toArray()).toEqual(
              new THREE.Vector3().fromBufferAttribute(endpoints, 0).toArray(),
            );
            expect(new THREE.Vector3().fromBufferAttribute(ends, 0).toArray()).toEqual(
              new THREE.Vector3().fromBufferAttribute(endpoints, 1).toArray(),
            );
            expect(bridge.projectModelComponent('projection-body')).toEqual(projected);
          } finally {
            projectionMesh.remove(edgeSource);
            fatLine?.geometry.dispose();
            if (fatLine) {
              for (const material of Array.isArray(fatLine.material) ? fatLine.material : [fatLine.material]) {
                material.dispose();
              }
            }
            edgeGeometry.dispose();
            edgeMaterial.dispose();
          }
        } finally {
          viewport.camera = rig.activeCamera;
          Object.assign(renderer, { domElement: heldCanvas });
          viewport.scene.remove(projectionMesh);
          projectionGeometry.dispose();
          projectionMaterial.dispose();
        }
        const originalCamera = bridge.getCamera();
        const { view: originalControls } = rig.actorRef.getSnapshot().context;
        expect(originalCamera.direction).toEqual(originalControls.direction);
        expect(originalCamera.up).toEqual(originalControls.up);
        expect(originalCamera.direction).not.toBe(originalControls.direction);
        expect(originalCamera.up).not.toBe(originalControls.up);
        bridge.setCamera({ position: [0.1, -0.2, 0.3], target: [0.01, 0.02, 0.03], fov: 60, zoom: 1 });
        const acceptedCamera = bridge.getCamera();
        const { view: acceptedControls } = rig.actorRef.getSnapshot().context;
        expect(acceptedCamera).toMatchObject({
          target: [0.01, 0.02, 0.03],
          requestedFov: 60,
          requestedPerspectiveZoom: 1,
          verticalSpan: acceptedControls.verticalSpan,
          direction: acceptedControls.direction,
          up: acceptedControls.up,
          position: rig.readState().position,
          quaternion: rig.activeCamera.quaternion.toArray(),
        });
        expect(acceptedCamera.direction).not.toEqual(originalCamera.direction);
        expect(originalCamera.direction).toEqual(originalControls.direction);
        rig.actorRef.send({
          type: 'setView',
          target: acceptedControls.target,
          direction: [-1, -1, 0.7],
          up: [0, 1, 0],
          verticalSpan: acceptedControls.verticalSpan,
        });
        expect(bridge.getCamera().direction).not.toEqual(acceptedCamera.direction);
        expect(bridge.getCamera().up).not.toEqual(acceptedCamera.up);
        expect(acceptedCamera.direction).toEqual(acceptedControls.direction);
        expect(acceptedCamera.up).toEqual(acceptedControls.up);
        Object.assign(graphics.context, {
          measureFilter: 'body',
          measureOperation: 'extent-x',
          measureCatalogRequest: 9,
          measureCatalogHasMore: true,
          measureMessage: 'Actual preparation refusal',
          measurements: [],
          measureCandidates: [{ id: 'body-candidate', label: 'Body' }],
        } satisfies Partial<GraphicsContext>);
        const catalogObservation = mock<MeasurementCatalogObservation>({
          requestId: 9,
          terminalBranch: 'prepare-undefined',
          prepareResult: 'undefined',
          catalogSize: 0,
        });
        const readCatalog = vi.fn(() => catalogObservation);
        viewport.scene.userData[measurementCatalogGetterKey] = readCatalog;
        expect(bridge.getMeasureState()).toMatchObject({
          catalogObservation,
          measureFilter: 'body',
          measureOperation: 'extent-x',
          measureCatalogRequest: 9,
          measureCatalogHasMore: true,
          measureMessage: 'Actual preparation refusal',
          candidates: [{ id: 'body-candidate', label: 'Body' }],
        });
        expect(readCatalog).toHaveBeenCalledOnce();
        delete viewport.scene.userData['measurementCatalogObservation'];
        expect(bridge.getMeasureState().catalogObservation).toBeUndefined();
        expect(bridge.isGeometryFramed()).toBe(false);
        framing.initialized = true;
        expect(bridge.isGeometryFramed()).toBe(true);
        expect(await bridge.isViewRecordApplied()).toBe(false);
        appliedRevisions.set(viewPath, `sha256:${'f'.repeat(64)}`);
        expect(await bridge.isViewRecordApplied()).toBe(false);
        appliedRevisions.set(viewPath, await digestBytes(viewBytes));
        expect(await bridge.isViewRecordApplied()).toBe(true);
        const replaced = Promise.withResolvers<Uint8Array<ArrayBuffer>>();
        readView = async () => replaced.promise;
        const beforeReplacement = bridge.isViewRecordApplied();
        projectSnapshot.context.geometryUnits.delete('assembly.json');
        replaced.resolve(viewBytes);
        expect(await beforeReplacement).toBe(false);
        projectSnapshot.context.geometryUnits.set('assembly.json', cadRef);
        appliedRevisions.delete(viewPath);
        const missing = Promise.withResolvers<Uint8Array<ArrayBuffer>>();
        readView = async () => missing.promise;
        projectHook.mockReturnValue({ ...project, viewRecords: new Map() });
        view.rerender(React.createElement(SectionViewTestBridge, { isGeometryFramed: true }));
        const absent = bridge.isViewRecordApplied();
        let settledAbsence = false;
        const absenceObserved = absent.then((value) => {
          settledAbsence = true;
          return value;
        });
        await Promise.resolve();
        expect(settledAbsence).toBe(false);
        missing.reject(new FileNotFoundError('Known missing view record', { path: viewPath }));
        expect(await absenceObserved).toBe(true);
        readView = async () => {
          throw new Error('View read denied');
        };
        await expect(bridge.isViewRecordApplied()).rejects.toThrow('View read denied');
        projectHook.mockReturnValue(project);
        readView = async () => viewBytes;
        view.rerender(React.createElement(SectionViewTestBridge, { isGeometryFramed: true }));
        contentService.readRawBytes.mockClear();
        // Frame sampling stays fresh without querying native context identity; default callers retain the name.
        const frameOnly = bridge.getRendererIdentity({ includeRendererName: false });
        expect(renderer.getContext).not.toHaveBeenCalled();
        expect(context.getExtension).not.toHaveBeenCalled();
        expect(context.getParameter).not.toHaveBeenCalled();
        expect(frameOnly).toEqual({ api: 'webgl', name: '', frame: 4 });
        renderer.info.render.frame = 5;
        expect(bridge.getRendererIdentity({ includeRendererName: false })).toEqual({
          api: 'webgl',
          name: '',
          frame: 5,
        });
        expect(renderer.getContext).not.toHaveBeenCalled();
        expect(context.getExtension).not.toHaveBeenCalled();
        expect(context.getParameter).not.toHaveBeenCalled();
        expect(bridge.getRendererIdentity()).toEqual({ api: 'webgl', name: 'fixture renderer', frame: 5 });
        expect(renderer.getContext).toHaveBeenCalledOnce();
        expect(context.getExtension).toHaveBeenCalledExactlyOnceWith('WEBGL_debug_renderer_info');
        expect(context.getParameter).toHaveBeenCalledExactlyOnceWith(debug.UNMASKED_RENDERER_WEBGL);
        // Exercise the real Common Info record: its frame is not a member of render.
        const {
          input: posedInput,
          document: posedDocument,
          bytes: stepBytes,
          ids: posedIds,
        } = await createPosedExportFixture();
        const poseDisplay = posedInput.source.display;
        Object.assign(posedDocument, { root: poseDisplay.root, admitted: poseDisplay.admitted });
        const unitId = 'file:assembly.json';
        const candidate = new THREE.Group();
        viewport.scene.add(candidate);
        setGltfAssemblyBounds(candidate, {
          bounds: posedInput.source.metadata.bounds,
          components: [],
          unitId,
          source: posedInput.source,
        });
        const capture = Object.assign(
          mock<NonNullable<ReturnType<typeof GltfMeshOwner.captureCommittedGltfDrawInventory>>>(),
          {
            display: poseDisplay,
            metadata: posedInput.source.metadata,
            key: poseDisplay.root.digest,
            unitId,
            poseRevision: posedInput.binding.poseRevision,
            presentationRevision: posedInput.binding.presentationRevision,
            candidateSceneId: candidate.uuid,
            isCurrent: () => true,
          },
        );
        const captureSpy = vi.spyOn(GltfMeshOwner, 'captureCommittedGltfDrawInventory').mockReturnValue(capture);
        const kinematics = mock<GraphicsContext['kinematicsRef']>();
        const unit = Object.assign(mock<KinematicsUnitState>(), posedInput.unit);
        const kinematicsSnapshot = Object.assign(mock<ReturnType<typeof kinematics.getSnapshot>>(), {
          status: 'active',
          context: { revision: capture.poseRevision, unitsById: { [unitId]: unit } },
        } satisfies Partial<ReturnType<typeof kinematics.getSnapshot>>);
        kinematics.getSnapshot.mockReturnValue(kinematicsSnapshot);
        const previousKernelClient = cad.context.kernelClient;
        const previousKinematics = graphics.context.kinematicsRef;
        const previousUnitId = graphics.context.modelInteractionUnitId;
        const beforePosePresentation = { ...graphics.context.gltfPresentation };
        const legacyInfo = renderer.info;
        const previousCanvas = renderer.domElement;
        const canvas = document.createElement('canvas');
        document.body.append(canvas);
        const commonInfo = new Info();
        Object.assign(commonInfo, { frame: 4 });
        expect('frame' in commonInfo.render).toBe(false);
        Object.assign(cad.context, {
          committedAssemblyDisplay: poseDisplay,
          publishedAssemblyRoot: poseDisplay.root,
          admittedAssembly: poseDisplay.admitted,
          publishedAssembly: poseDisplay.admitted.publication,
          kernelClient: mock<NonNullable<CadContext['kernelClient']>>(),
        } satisfies Partial<CadContext>);
        Object.assign(graphics.context, { modelInteractionUnitId: unitId, kinematicsRef: kinematics });
        Object.assign(graphics.context.gltfPresentation, {
          requestedKey: capture.key,
          presentedKey: capture.key,
          requestedRevision: capture.presentationRevision,
          presentedRevision: capture.presentationRevision,
        });
        Object.assign(renderer, { domElement: canvas });
        const nativeReply: Awaited<ReturnType<typeof posedDocument.exportPublished>> = {
          success: true,
          exportId: 'mounted-step',
          issues: [],
          files: [{ name: 'assembly', mimeType: 'application/step', bytes: stepBytes }],
        };
        try {
          posedDocument.exportPublished.mockResolvedValue(nativeReply);
          const legacyExport = await bridge.exportCurrentPosedAssembly();
          expect(legacyExport.canonicalIds).toEqual(posedIds);
          expect(legacyExport.bytes).toEqual([...stepBytes]);
          expect(posedDocument.exportPublished).toHaveBeenCalledOnce();
          posedDocument.exportPublished.mockClear();
          // eslint-disable-next-line @typescript-eslint/naming-convention -- isWebGPUBackend is Three.js's actual native backend flag.
          Object.assign(renderer, { info: commonInfo, backend: { isWebGPUBackend: true } });
          posedDocument.exportPublished.mockImplementationOnce(async () => {
            Object.assign(commonInfo, { frame: 6 });
            return nativeReply;
          });
          const commonExport = await bridge.exportCurrentPosedAssembly();
          expect(commonExport.canonicalIds).toEqual(posedIds);
          expect(commonExport.bytes).toEqual([...stepBytes]);
          expect(posedDocument.exportPublished).toHaveBeenCalledOnce();
          expect(bridge.getRendererIdentity({ includeRendererName: false })).toEqual({
            api: 'webgpu',
            name: '',
            frame: 6,
          });
          for (const invalidFrame of [0, Number.NaN, Number.POSITIVE_INFINITY]) {
            Object.assign(commonInfo, { frame: invalidFrame });
            posedDocument.exportPublished.mockClear();
            // oxlint-disable-next-line no-await-in-loop -- Each owner refusal observes the preceding actual Info mutation before the next case.
            await expect(bridge.exportCurrentPosedAssembly()).rejects.toThrow('coherent committed assembly');
            expect(posedDocument.exportPublished).not.toHaveBeenCalled();
          }
          Object.assign(commonInfo, { frame: 6 });
          for (const change of ['frame-regression', 'renderer-replacement', 'canvas-release', 'cad-retirement']) {
            const pendingExport = Promise.withResolvers<Awaited<ReturnType<typeof posedDocument.exportPublished>>>();
            posedDocument.exportPublished.mockClear();
            posedDocument.exportPublished.mockReturnValueOnce(pendingExport.promise);
            const refusal = expect(bridge.exportCurrentPosedAssembly()).rejects.toThrow(
              'subject changed during native export',
            );
            expect(posedDocument.exportPublished).toHaveBeenCalledOnce();
            switch (change) {
              case 'frame-regression': {
                Object.assign(commonInfo, { frame: 5 });
                break;
              }
              case 'renderer-replacement': {
                viewport.gl = mock<THREE.WebGLRenderer>();
                break;
              }
              case 'canvas-release': {
                canvas.remove();
                break;
              }
              case 'cad-retirement': {
                Object.assign(cad, { status: 'stopped' });
                break;
              }
              default: {
                throw new Error('Unknown held export owner change');
              }
            }
            pendingExport.resolve(nativeReply);
            // oxlint-disable-next-line no-await-in-loop -- Each held native export settles its changed owner before the next lifetime control.
            await refusal;
            Object.assign(commonInfo, { frame: 6 });
            viewport.gl = renderer;
            document.body.append(canvas);
            Object.assign(cad, { status: 'active' });
          }
        } finally {
          captureSpy.mockRestore();
          candidate.removeFromParent();
          canvas.remove();
          viewport.gl = renderer;
          Object.assign(renderer, { info: legacyInfo, domElement: previousCanvas });
          Reflect.deleteProperty(renderer, 'backend');
          Object.assign(cad, { status: 'active' });
          Object.assign(cad.context, {
            committedAssemblyDisplay: display,
            publishedAssemblyRoot: display.root,
            admittedAssembly: display.admitted,
            publishedAssembly: display.admitted.publication,
            kernelClient: previousKernelClient,
          });
          Object.assign(graphics.context, {
            kinematicsRef: previousKinematics,
            modelInteractionUnitId: previousUnitId,
          });
          Object.assign(graphics.context.gltfPresentation, beforePosePresentation);
        }
        const ordinary = mock<Extract<NonNullable<typeof cad.context.rendering>, { success: true }>>({
          success: true,
          hash: 'ordinary-source-hash',
        });
        const previousPresentation = { ...graphics.context.gltfPresentation };
        const previousTelemetry = cad.context.telemetryEntries;
        Object.assign(cad.context, {
          rendering: ordinary,
          committedRendering: ordinary,
          committedAssemblyDisplay: undefined,
          telemetryEntries: [],
        });
        Object.assign(graphics.context.gltfPresentation, {
          requestedKey: ordinary.hash,
          presentedKey: ordinary.hash,
          requestedRevision: 4,
          presentedRevision: 4,
        });
        expect(bridge.getCommittedAssembly().isCurrent()).toBe(false);
        expect(bridge.getCadActivity()).toEqual({
          telemetryEntries: [],
          lastRequestedRenderId: 2,
          lastSettledRenderId: 2,
        });
        const priorDocument = cad.context.document;
        const priorEvaluation = cad.context.evaluation;
        const priorArtifact = graphics.context.artifact;
        const priorArtifactKey = graphics.context.artifactKey;
        const priorArtifactSource = graphics.context.artifactSourceFile;
        const sourceRevision: SourceRevision = {
          entry: 'assembly.json',
          files: {
            'assembly.json': contentDigest({ value: `sha256:${'b'.repeat(64)}`, name: 'ordinary pane source' }),
          },
        };
        const paneArtifact: NonNullable<GraphicsContext['artifact']> = {
          mimeType: 'model/gltf-binary',
          content: createEmptyGlb(),
        };
        const defaultRendering: NonNullable<CadContext['committedRendering']> = {
          success: true,
          transient: false,
          view: 'model',
          evaluationId: 'pane-evaluation',
          requestId: 'default-request',
          hash: ordinary.hash,
          sourceRevision,
          issues: [],
          artifact: paneArtifact,
        };
        Object.assign(cad.context, {
          document: mock<NonNullable<CadContext['document']>>({ id: 'pane-document' }),
          evaluation: {
            success: true,
            transient: false,
            id: 'pane-evaluation',
            views: [],
            exports: [],
            issues: [],
            sourceRevision,
          },
          rendering: defaultRendering,
          committedRendering: defaultRendering,
        } satisfies Partial<CadContext>);
        const pane: PaneRenderingProvenance = {
          documentId: 'pane-document',
          evaluationId: 'pane-evaluation',
          requestId: 'actual-pane-request',
          hash: 'actual-pane-output',
          sourceRevision,
          isCurrent: () => true,
        };
        Object.assign(graphics.context, {
          paneRendering: pane,
          artifact: paneArtifact,
          artifactKey: pane.hash,
          artifactSourceFile: sourceRevision.entry,
        } satisfies Partial<GraphicsContext>);
        Object.assign(graphics.context.gltfPresentation, { requestedKey: pane.hash, presentedKey: pane.hash });
        expect(bridge.getCommittedAssembly().diagnostics.sourceGeometryHash).toBe(pane.hash);
        expect(bridge.getCadActivity()?.document).toMatchObject({ requestId: 'default-request', key: ordinary.hash });
        expect(bridge.getCadActivity()?.displayedDocument).toMatchObject({ requestId: pane.requestId, key: pane.hash });
        projectSnapshot.context.fileSystemRoot = '/foreign-pane';
        expect(bridge.getCadActivity()).toBeUndefined();
        projectSnapshot.context.fileSystemRoot = '/projects/current';
        Object.assign(graphics.context, {
          paneRendering: { ...pane, isCurrent: () => false },
        } satisfies Partial<GraphicsContext>);
        expect(bridge.getCadActivity()).toBeUndefined();
        expect(bridge.getCommittedAssembly().diagnostics.sourceGeometryHash).toBeUndefined();
        Object.assign(graphics.context, {
          paneRendering: { ...pane, documentId: 'wrong-document', hash: ordinary.hash },
        } satisfies Partial<GraphicsContext>);
        Object.assign(graphics.context.gltfPresentation, { requestedKey: ordinary.hash, presentedKey: ordinary.hash });
        graphics.context.artifactKey = ordinary.hash;
        expect(bridge.getCadActivity()).toBeUndefined();
        expect(bridge.getCommittedAssembly().diagnostics.sourceGeometryHash).toBeUndefined();
        Object.assign(cad.context, {
          document: priorDocument,
          evaluation: priorEvaluation,
          rendering: ordinary,
          committedRendering: ordinary,
        });
        Object.assign(graphics.context, {
          paneRendering: undefined,
          artifact: priorArtifact,
          artifactKey: priorArtifactKey,
          artifactSourceFile: priorArtifactSource,
        });
        await expect(bridge.getCommittedAssembly().readRawBytes(path)).rejects.toThrow('authority is unavailable');
        await expect(bridge.observeBackendBindings()).rejects.toThrow('coherent committed assembly');
        cad.context.lastSettledRenderId = 1;
        expect(bridge.getCadActivity()).toBeUndefined();
        cad.context.lastSettledRenderId = 2;
        cad.context.latestRenderingOutcome = 'failure';
        expect(bridge.getCadActivity()).toBeUndefined();
        cad.context.latestRenderingOutcome = 'success';
        cad.context.rendering = mock<NonNullable<typeof cad.context.rendering>>({ hash: 'transient-preview-hash' });
        expect(bridge.getCadActivity()).toBeUndefined();
        cad.context.rendering = ordinary;
        Object.assign(graphics.context.gltfPresentation, { requestedKey: 'stale-source-hash' });
        expect(bridge.getCadActivity()).toBeUndefined();
        Object.assign(graphics.context.gltfPresentation, { requestedKey: ordinary.hash });
        projectSnapshot.context.geometryUnits.delete('assembly.json');
        expect(bridge.getCadActivity()).toBeUndefined();
        projectSnapshot.context.geometryUnits.set('assembly.json', cadRef);
        projectSnapshot.context.viewGraphics.delete('view');
        expect(bridge.getCadActivity()).toBeUndefined();
        projectSnapshot.context.viewGraphics.set('view', graphicsRef);
        projectSnapshot.context.fileSystemRoot = '/foreign';
        expect(bridge.getCadActivity()).toBeUndefined();
        projectSnapshot.context.fileSystemRoot = '/projects/current';
        expect(bridge.getCadActivity()).toBeDefined();
        const ownedRef = mock<typeof cadRef>();
        const owned = mock<ReturnType<typeof cadRef.getSnapshot>>({ status: 'active' });
        owned.context = { ...cad.context };
        const retainedSpan = mock<(typeof cad.context.telemetryEntries)[number]>({ name: 'kernel.compute' });
        Object.assign(owned.context, {
          entryPath: 'main.ts',
          fileManagerRef,
          fileSystemRoot: '/projects/current',
          rendering: ordinary,
          committedRendering: ordinary,
          committedAssemblyDisplay: undefined,
          telemetryEntries: [retainedSpan],
          latestRenderingOutcome: 'success',
          lastRequestedRenderId: 3,
          lastSettledRenderId: 3,
        });
        let ownedState: 'idle' | 'parked' = 'idle';
        owned.matches.mockImplementation((state) => state === ownedState);
        ownedRef.getSnapshot.mockReturnValue(owned);
        Reflect.set(ownedRef, 'sessionId', 'owned-cad-session');
        projectSnapshot.context.geometryUnits.set('main.ts', ownedRef);
        const expectedOwned = {
          telemetryEntries: [retainedSpan],
          lastRequestedRenderId: 3,
          lastSettledRenderId: 3,
          owner: {
            entryPath: 'main.ts',
            actorSessionId: 'owned-cad-session',
            state: 'idle',
            fileSystemRoot: '/projects/current',
            committedKey: ordinary.hash,
          },
        };
        expect(bridge.getCadActivity({ entryPath: 'main.ts' })).toEqual(expectedOwned);
        ownedState = 'parked';
        expect(bridge.getCadActivity({ entryPath: 'main.ts' })).toEqual({
          ...expectedOwned,
          owner: { ...expectedOwned.owner, state: 'parked' },
        });
        expect(bridge.getCadActivity({ entryPath: 'missing.ts' })).toBeUndefined();
        owned.context.lastSettledRenderId = 2;
        expect(bridge.getCadActivity({ entryPath: 'main.ts' })).toBeUndefined();
        owned.context.lastSettledRenderId = 3;
        owned.context.latestRenderingOutcome = 'failure';
        expect(bridge.getCadActivity({ entryPath: 'main.ts' })).toBeUndefined();
        owned.context.latestRenderingOutcome = 'success';
        owned.context.rendering = { ...ordinary, hash: 'uncommitted-preview' };
        expect(bridge.getCadActivity({ entryPath: 'main.ts' })).toBeUndefined();
        owned.context.rendering = ordinary;
        owned.context.fileSystemRoot = '/foreign';
        expect(bridge.getCadActivity({ entryPath: 'main.ts' })).toBeUndefined();
        owned.context.fileSystemRoot = '/projects/current';
        owned.context.fileManagerRef = mock<typeof fileManagerRef>();
        expect(bridge.getCadActivity({ entryPath: 'main.ts' })).toBeUndefined();
        owned.context.fileManagerRef = fileManagerRef;
        projectSnapshot.context.geometryUnits.delete('main.ts');
        expect(bridge.getCadActivity({ entryPath: 'main.ts' })).toBeUndefined();
        projectSnapshot.context.geometryUnits.set('main.ts', ownedRef);
        expect(bridge.getCadActivity({ entryPath: 'main.ts' })).toBeDefined();
        expect(ownedRef.send).not.toHaveBeenCalled();
        Object.assign(cad.context, {
          rendering: undefined,
          committedRendering: undefined,
          committedAssemblyDisplay: display,
          telemetryEntries: previousTelemetry,
        });
        Object.assign(graphics.context.gltfPresentation, previousPresentation);
        const held = bridge.getCommittedAssembly();
        expect(held.isCurrent()).toBe(true);
        expect(bridge.isGeometryFramed()).toBe(true);
        pendingRead = held.readRawBytes(path);
        expect(contentService.readRawBytes).toHaveBeenCalledExactlyOnceWith(path);
        const nextRecord = workbenchRecords.view.schema.parse({
          ...initialRecord,
          display: { ...initialRecord.display, grid: !initialRecord.display.grid },
        });
        const recordProject = {
          ...project,
          viewRecords: new Map([['view', nextRecord]]),
          appliedEntryRevisions: new Map([['assembly.json', display.root.digest]]),
        };
        projectHook.mockReturnValue(recordProject);
        view.rerender(React.createElement(SectionViewTestBridge, { isGeometryFramed: true }));
        expect(scope.__TAU_SECTION_VIEW_TEST__).toBe(bridge);
        expect(held.isCurrent()).toBe(true);
        expect(bridge.getViewSettings()?.enableGrid).toBe(nextRecord.display.grid);
        view.rerender(React.createElement(SectionViewTestBridge, { isGeometryFramed: false }));
        expect(scope.__TAU_SECTION_VIEW_TEST__).toBe(bridge);
        expect(held.isCurrent()).toBe(true);
        expect(bridge.isGeometryFramed()).toBe(false);
        releaseRead!(bytes);
        await expect(pendingRead).resolves.toBe(bytes);
        const replacement = mockDeep<CadAssemblyDisplay>({
          root: { path, digest: contentDigest({ value: `sha256:${'b'.repeat(64)}` }), byteLength: bytes.byteLength },
        });
        cadRef.getSnapshot.mockReturnValue({
          ...cad,
          context: {
            ...cad.context,
            committedAssemblyDisplay: replacement,
            publishedAssemblyRoot: replacement.root,
            admittedAssembly: replacement.admitted,
            publishedAssembly: replacement.admitted.publication,
          },
        });
        graphicsRef.getSnapshot.mockReturnValue({
          ...graphics,
          context: {
            ...graphics.context,
            gltfPresentation: { ...graphics.context.gltfPresentation, presentedKey: replacement.root.digest },
          },
        });
        expect(held.isCurrent()).toBe(false);
        await expect(held.readRawBytes(path)).rejects.toThrow(/before/u);
        expect(contentService.readRawBytes).toHaveBeenCalledTimes(1);
        const replacedRoot = bridge.getCommittedAssembly();
        expect(replacedRoot.isCurrent()).toBe(true);
        const replacementProjectRef = mock<NonNullable<ReturnType<typeof ProjectHooks.useProject>>['projectRef']>({
          getSnapshot: () => projectSnapshot,
        });
        projectHook.mockReturnValue({ ...recordProject, projectRef: replacementProjectRef });
        view.rerender(React.createElement(SectionViewTestBridge, { isGeometryFramed: true }));
        expect(scope.__TAU_SECTION_VIEW_TEST__).not.toBe(bridge);
        expect(replacedRoot.isCurrent()).toBe(false);
        await expect(replacedRoot.readRawBytes(path)).rejects.toThrow(/before/u);
        expect(contentService.readRawBytes).toHaveBeenCalledTimes(1);
        const current = scope.__TAU_SECTION_VIEW_TEST__!.getCommittedAssembly();
        expect(current.isCurrent()).toBe(true);
        pendingRead = current.readRawBytes(path);
        view.unmount();
        expect(scope.__TAU_SECTION_VIEW_TEST__).toBeUndefined();
        expect(scope.__TAU_SECTION_VIEW_TEST_BRIDGES__).toBeUndefined();
        expect(bridge.getTaggedResourceInventory()).toBeUndefined();
        expect(current.isCurrent()).toBe(false);
        releaseRead!(bytes);
        await expect(pendingRead).rejects.toThrow(/during/u);
      })(),
    ]);
    const [cleanup] = await Promise.allSettled([Promise.resolve().then(() => view?.unmount())]);
    releaseRead?.(bytes);
    await Promise.allSettled(pendingRead ? [pendingRead] : []);
    rig.dispose();
    vi.restoreAllMocks();
    if (body.status === 'rejected') {
      const error: unknown = body.reason;
      throw error;
    }
    if (cleanup.status === 'rejected') {
      const error: unknown = cleanup.reason;
      throw error;
    }
  });
});

describe('projectSectionViewTestDrawBounds', () => {
  it('should project the named XZ warehouse cell through the actual top camera and reject a foreign cell', () => {
    const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.01, 100);
    camera.up.set(0, 0, 1);
    camera.position.set(1.98, 8, 1.98);
    camera.lookAt(1.98, 0, 1.98);
    const view = { width: 1920, height: 1080 };
    const cell = projectSectionViewTestDrawBounds(
      { min: [1.97, -0.006, 1.97], max: [1.99, 0.006, 1.99] },
      camera,
      view,
    );
    expect(cell.intersectsFrustum).toBe(true);
    expect(cell.finiteProjection).toBe(true);
    expect(cell.corners).toHaveLength(8);
    expect(Math.min(...cell.corners.map(({ x }) => x))).toBeLessThan(960);
    expect(Math.max(...cell.corners.map(({ x }) => x))).toBeGreaterThan(960);
    const foreign = projectSectionViewTestDrawBounds(
      { min: [55, -0.006, 1.97], max: [55.02, 0.006, 1.99] },
      camera,
      view,
    );
    expect(foreign.intersectsFrustum).toBe(false);
  });
  it('should deny nonfinite producer bounds or an unavailable viewport', () => {
    const camera = new THREE.PerspectiveCamera();
    expect(() =>
      projectSectionViewTestDrawBounds({ min: [0, 0, 0], max: [Infinity, 1, 1] }, camera, {
        width: 1920,
        height: 1080,
      }),
    ).toThrow(RangeError);
    expect(() =>
      projectSectionViewTestDrawBounds({ min: [0, 0, 0], max: [1, 1, 1] }, camera, { width: 0, height: 1080 }),
    ).toThrow('positive viewport');
  });
});

describe('readSectionViewTestAssemblyResourceTelemetry', () => {
  it('should exclude retired same-revision candidates, other viewports and unattributed records', () => {
    clearRendererSpans();
    try {
      const current = {
        viewportActorSessionId: 'viewport-current',
        candidateSceneId: 'scene-current',
        key: 'root-a',
        revision: 3,
        backend: 'webgl',
      };
      const attributesByRecord: Array<Record<string, string | number | boolean>> = [
        current,
        { ...current, viewportActorSessionId: 'viewport-retired' },
        { ...current, candidateSceneId: 'scene-retired' },
        {
          viewportActorSessionId: current.viewportActorSessionId,
          key: current.key,
          revision: current.revision,
          backend: current.backend,
        },
        { ...current, key: 'root-b' },
        { ...current, revision: 2 },
        { ...current, backend: 'webgpu' },
        { key: current.key, revision: current.revision, backend: current.backend },
      ];
      for (const attributes of attributesByRecord) {
        recordRendererSpan('renderer.presentation', { startTime: 1, duration: 2, attributes });
      }
      recordRendererSpan('renderer.long-animation-frame', { startTime: 1, duration: 2, attributes: current });
      const records = readSectionViewTestAssemblyResourceTelemetry({
        ...current,
        backend: 'webgl',
        isCurrent: () => true,
      });
      expect(records).toHaveLength(1);
      const spanId: unknown = expect.any(String);
      expect(records[0]?.detail).toEqual({ ...current, spanId });
    } finally {
      clearRendererSpans();
    }
  });

  it('should deny missing current subject and a viewport/key/revision change during the read', () => {
    clearRendererSpans();
    try {
      const authority = {
        viewportActorSessionId: 'viewport-current',
        candidateSceneId: 'scene-current',
        key: 'root-a',
        revision: 3,
        backend: 'webgl',
      } as const;
      recordRendererSpan('renderer.presentation', { startTime: 1, duration: 2, attributes: authority });
      const missing = vi.fn(() => false);
      expect(readSectionViewTestAssemblyResourceTelemetry({ ...authority, isCurrent: missing })).toEqual([]);
      expect(missing).toHaveBeenCalledTimes(1);
      const changed = vi.fn<() => boolean>().mockReturnValueOnce(true).mockReturnValueOnce(false);
      expect(readSectionViewTestAssemblyResourceTelemetry({ ...authority, isCurrent: changed })).toEqual([]);
      expect(changed).toHaveBeenCalledTimes(2);
    } finally {
      clearRendererSpans();
    }
  });
});

it('should read actual stock geometry through committed clipping and ignore hidden neighboring ownership', () => {
  const scene = new THREE.Group();
  const material = new THREE.MeshBasicMaterial();
  const left = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), material);
  const right = new THREE.Mesh(left.geometry, left.material);
  left.userData['tauComponentId'] = 'canonical-left';
  right.userData['tauComponentId'] = 'canonical-right';
  left.position.z = 2;
  right.position.z = -2;
  scene.add(left, right);
  scene.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 0, 8), new THREE.Vector3(0, 0, -1));
  try {
    expect(getSectionViewTestStockComponentHit(ray, [left, right])).toBe('canonical-left');
    const clipping = {
      enabled: true,
      pieces: resolveSectionPieces([{ id: 'cut', kind: 'plane', plane: 'xy', offset: 0, isFlipped: false }]),
    };
    expect(getSectionViewTestStockComponentHit(ray, [left, right], clipping)).toBe('canonical-right');
    expect(getSectionViewTestStockComponentHit(ray, [left, right], { ...clipping, enabled: false })).toBe(
      'canonical-left',
    );
    const fullyRemoved = {
      enabled: true,
      pieces: resolveSectionPieces([{ id: 'all', kind: 'plane', plane: 'xy', offset: -4, isFlipped: false }]),
    };
    expect(getSectionViewTestStockComponentHit(ray, [left, right], fullyRemoved)).toBeUndefined();
    expect(getSectionViewTestStockComponentHit(ray, [left, right])).toBe('canonical-left');
    left.visible = false;
    expect(getSectionViewTestStockComponentHit(ray, [left, right])).toBe('canonical-right');
    right.visible = false;
    expect(getSectionViewTestStockComponentHit(ray, [left, right])).toBeUndefined();
  } finally {
    left.geometry.dispose();
    material.dispose();
  }
});

it.each(['mesh', 'instance'])(
  'should retain stock %s triangle and slot queries with only ordinary surfaces presentation-batched',
  (kind) => {
    const scene = new THREE.Group();
    scene.position.set(5, 2, 0);
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const material = new THREE.MeshStandardMaterial();
    qualifyGltfSurfaceMaterial(material);
    const source =
      kind === 'instance' ? new THREE.InstancedMesh(geometry, material, 2) : new THREE.Mesh(geometry, material);
    const peer = new THREE.Mesh(geometry, material);
    source.position.x = 4;
    peer.position.x = 10;
    setModelComponentOwner(source, { unitId: 'actual-unit', componentId: 'canonical-target' });
    setModelComponentOwner(peer, { unitId: 'actual-unit', componentId: 'canonical-peer' });
    if (source instanceof THREE.InstancedMesh) {
      source.setMatrixAt(0, new THREE.Matrix4());
      source.setMatrixAt(1, new THREE.Matrix4().makeTranslation(3, 0, 0));
      setModelComponentInstanceSlots(source, [
        {
          owner: { unitId: 'actual-unit', componentId: 'canonical-target' },
          sourceObject: new THREE.Mesh(geometry, material),
        },
        {
          owner: { unitId: 'actual-unit', componentId: 'canonical-target-second-slot' },
          sourceObject: new THREE.Mesh(geometry, material),
        },
      ]);
    }
    scene.add(source, peer);
    scene.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(new THREE.Vector3(9, 2, 8), new THREE.Vector3(0, 0, -1));
    let batches = createGltfSurfaceBatches(scene, [source, peer]);
    try {
      expect(getSectionViewTestStockComponentHit(ray, [source, peer])).toBe('canonical-target');
      batches.sync();
      expect(batches.group.children).toHaveLength(kind === 'mesh' ? 1 : 0);
      expect(source.layers.mask).toBe(kind === 'mesh' ? 0 : 1);
      expect(peer.layers.mask).toBe(kind === 'mesh' ? 0 : 1);
      if (source instanceof THREE.InstancedMesh) {
        const secondSlotRay = new THREE.Raycaster(new THREE.Vector3(12, 2, 8), new THREE.Vector3(0, 0, -1));
        expect(getSectionViewTestStockComponentHit(secondSlotRay, [source, peer])).toBe('canonical-target-second-slot');
      }
      expect(getSectionViewTestStockComponentHit(ray, [source, peer])).toBe('canonical-target');
      source.visible = false;
      expect(getSectionViewTestStockComponentHit(ray, [source, peer])).toBeUndefined();
      source.visible = true;
      scene.visible = false;
      expect(getSectionViewTestStockComponentHit(ray, [source, peer])).toBeUndefined();
      scene.visible = true;
      const clipping = {
        enabled: true,
        pieces: resolveSectionPieces([{ id: 'actual-cut', kind: 'plane', plane: 'xy', offset: -2, isFlipped: false }]),
      };
      expect(getSectionViewTestStockComponentHit(ray, [source, peer], clipping)).toBeUndefined();
      expect(getSectionViewTestStockComponentHit(ray, [source, peer], { ...clipping, enabled: false })).toBe(
        'canonical-target',
      );
      batches.dispose();
      expect(source.layers.mask).toBe(1);
      expect(peer.layers.mask).toBe(1);
      source.layers.set(2);
      peer.layers.set(2);
      batches = createGltfSurfaceBatches(scene, [source, peer]);
      batches.sync();
      expect(source.layers.mask).toBe(kind === 'mesh' ? 0 : 4);
      expect(peer.layers.mask).toBe(kind === 'mesh' ? 0 : 4);
      expect(getSectionViewTestStockComponentHit(ray, [source, peer])).toBeUndefined();
      ray.layers.set(2);
      expect(getSectionViewTestStockComponentHit(ray, [source, peer])).toBe('canonical-target');
      batches.dispose();
      expect(source.layers.mask).toBe(4);
      expect(peer.layers.mask).toBe(4);
      if (source instanceof THREE.InstancedMesh) {
        source.dispose();
        expect(getSectionViewTestStockComponentHit(ray, [source, peer])).toBeUndefined();
      }
    } finally {
      batches.dispose();
      if (source instanceof THREE.InstancedMesh) {
        source.dispose();
      }
      geometry.dispose();
      material.dispose();
    }
  },
);

describe('explicit untimed backend observation', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // Query stubs qualify lifecycle/query ordering only; actual buffer/native driver proof is a browser gate.
  const fixture = () => {
    const vertex = mock<WebGLBuffer>();
    const element = mock<WebGLBuffer>();
    const prior = mock<WebGLBuffer>();
    let copyRead: WebGLBuffer | undefined = prior;
    const events: string[] = [];
    const gl = mock<WebGL2RenderingContext>({
      /* eslint-disable @typescript-eslint/naming-convention -- Native WebGL constants retain their standardized external names. */
      COPY_READ_BUFFER: 0x8f_36,
      COPY_READ_BUFFER_BINDING: 0x8f_36,
      MAX_VERTEX_ATTRIBS: 0x88_69,
      ELEMENT_ARRAY_BUFFER_BINDING: 0x88_95,
      VERTEX_ATTRIB_ARRAY_ENABLED: 0x86_22,
      VERTEX_ATTRIB_ARRAY_BUFFER_BINDING: 0x88_9f,
      VERTEX_ATTRIB_ARRAY_DIVISOR: 0x88_fe,
      BUFFER_SIZE: 0x87_64,
      /* eslint-enable @typescript-eslint/naming-convention -- Restore naming checks after the exact external fields. */
    });
    gl.getParameter.mockImplementation((name): unknown => {
      if (name === gl.COPY_READ_BUFFER_BINDING) {
        return copyRead ?? null;
      }
      if (name === gl.MAX_VERTEX_ATTRIBS) {
        return 2;
      }
      if (name === gl.ELEMENT_ARRAY_BUFFER_BINDING) {
        return element;
      }
      throw new Error('Unexpected query parameter.');
    });
    gl.getVertexAttrib.mockImplementation((slot, name): unknown => {
      events.push('query');
      if (name === gl.VERTEX_ATTRIB_ARRAY_ENABLED) {
        return slot === 0;
      }
      if (name === gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING) {
        return vertex;
      }
      if (name === gl.VERTEX_ATTRIB_ARRAY_DIVISOR) {
        return 1;
      }
      throw new Error('Unexpected attribute parameter.');
    });
    gl.isBuffer.mockImplementation((buffer) => buffer === vertex || buffer === element || buffer === prior);
    gl.isContextLost.mockReturnValue(false);
    gl.bindBuffer.mockImplementation((_target, buffer) => {
      copyRead = buffer ?? undefined;
    });
    gl.getBufferParameter.mockImplementation((): unknown => (copyRead === vertex ? 64 : 12));
    vi.stubGlobal('WebGL2RenderingContext', {
      [Symbol.hasInstance](value: unknown): boolean {
        return value === gl;
      },
    });
    const renderer = mock<THREE.WebGLRenderer>();
    renderer.getContext.mockReturnValue(gl);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    const group = new THREE.Group();
    const abort = new AbortController();
    const isCurrent = vi.fn(() => true);
    const invalidate = vi.fn();
    const input: Parameters<typeof observeSectionViewTestBackendBindings>[0] = {
      renderer,
      scene,
      camera,
      candidateSceneId: scene.uuid,
      objects: [mesh],
      backend: 'webgl',
      signal: abort.signal,
      isCurrent,
      invalidate,
    };
    const draw = (): void => {
      mesh.onAfterRender(renderer, scene, camera, geometry, material, group);
    };
    const finish = (): void => {
      Reflect.apply(scene.onAfterRender, scene, [renderer, scene, camera]);
    };
    return {
      input,
      mesh,
      scene,
      geometry,
      material,
      group,
      renderer,
      camera,
      gl,
      abort,
      events,
      prior,
      isCurrent,
      invalidate,
      draw,
      finish,
      bound: () => copyRead,
      dispose: () => {
        geometry.dispose();
        material.dispose();
      },
    };
  };

  it('should query actual bound-state stubs before forwarding callbacks and restore the owned callbacks and copy binding', async () => {
    const f = fixture();
    const original = vi.fn<THREE.Object3D['onAfterRender']>(function (this: THREE.Object3D) {
      f.events.push('original');
      expect(this).toBe(f.mesh);
      expect(f.bound()).toBe(f.prior);
    });
    f.mesh.onAfterRender = original;
    const originalScene = f.scene.onAfterRender;
    const operation = observeSectionViewTestBackendBindings(f.input);
    try {
      f.draw();
      f.draw();
      f.finish();
      const result = await operation;
      expect(result.samples).toHaveLength(2);
      expect(result.buffers.map((row) => row.bytes)).toEqual([64, 12]);
      expect(result.uniqueObservedBufferBytes).toBe(76);
      expect(result.completeResidentInventory).toBe(false);
      expect(result.uploadedBytes).toBeUndefined();
      expect(f.events.indexOf('query')).toBeLessThan(f.events.indexOf('original'));
      expect(original).toHaveBeenCalledTimes(2);
      expect(original).toHaveBeenNthCalledWith(1, f.renderer, f.scene, f.camera, f.geometry, f.material, f.group);
      expect(f.mesh.onAfterRender).toBe(original);
      expect(f.scene.onAfterRender).toBe(originalScene);
      expect(f.invalidate).toHaveBeenCalledOnce();
    } finally {
      f.abort.abort();
      await Promise.allSettled([operation]);
      f.dispose();
    }
  });

  it('should preserve an original callback error and restore all sibling callbacks', async () => {
    const f = fixture();
    const failure = new Error('Original draw callback failed.');
    const original = (): never => {
      throw failure;
    };
    f.mesh.onAfterRender = original;
    const originalScene = f.scene.onAfterRender;
    const operation = observeSectionViewTestBackendBindings(f.input);
    const observed = expect(operation).rejects.toBe(failure);
    try {
      expect(f.draw).toThrow(failure);
      await observed;
      expect(f.mesh.onAfterRender).toBe(original);
      expect(f.scene.onAfterRender).toBe(originalScene);
      expect(f.bound()).toBe(f.prior);
    } finally {
      f.abort.abort();
      await Promise.allSettled([operation, observed]);
      f.dispose();
    }
  });

  it('should preserve independently rebound callbacks and deny their observation', async () => {
    const f = fixture();
    const originalScene = f.scene.onAfterRender;
    const operation = observeSectionViewTestBackendBindings(f.input);
    const observed = expect(operation).rejects.toThrow('callback ownership changed');
    const replacement = vi.fn<THREE.Object3D['onAfterRender']>();
    try {
      f.draw();
      f.mesh.onAfterRender = replacement;
      f.finish();
      await observed;
      expect(f.mesh.onAfterRender).toBe(replacement);
      expect(f.scene.onAfterRender).toBe(originalScene);
    } finally {
      f.abort.abort();
      await Promise.allSettled([operation, observed]);
      f.dispose();
    }
  });

  it.each(['retired', 'abort'])('should restore callbacks and deny a %s candidate', async (mode) => {
    const f = fixture();
    const original = f.mesh.onAfterRender;
    const originalScene = f.scene.onAfterRender;
    const operation = observeSectionViewTestBackendBindings(f.input);
    const failure = new Error('Explicit viewport teardown.');
    const observed =
      mode === 'abort' ? expect(operation).rejects.toBe(failure) : expect(operation).rejects.toThrow('subject changed');
    try {
      f.draw();
      if (mode === 'abort') {
        f.abort.abort(failure);
      } else {
        f.isCurrent.mockReturnValue(false);
        f.finish();
      }
      await observed;
      expect(f.mesh.onAfterRender).toBe(original);
      expect(f.scene.onAfterRender).toBe(originalScene);
    } finally {
      f.abort.abort();
      await Promise.allSettled([operation, observed]);
      f.dispose();
    }
  });

  it('should time out an unobserved frame without leaving wrappers', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const original = f.mesh.onAfterRender;
    const originalScene = f.scene.onAfterRender;
    const operation = observeSectionViewTestBackendBindings(f.input);
    const observed = expect(operation).rejects.toThrow('frame timed out');
    try {
      await vi.advanceTimersByTimeAsync(10_000);
      await observed;
      expect(f.mesh.onAfterRender).toBe(original);
      expect(f.scene.onAfterRender).toBe(originalScene);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      f.abort.abort();
      await Promise.allSettled([operation, observed]);
      f.dispose();
    }
  });

  it('should reject stale and over-cap subjects before installing callbacks or scheduling a frame', async () => {
    const f = fixture();
    const original = f.mesh.onAfterRender;
    const originalScene = f.scene.onAfterRender;
    try {
      f.isCurrent.mockReturnValue(false);
      await expect(observeSectionViewTestBackendBindings(f.input)).rejects.toThrow('no longer current');
      f.isCurrent.mockReturnValue(true);
      const input = { ...f.input, objects: Array.from({ length: 4097 }, () => new THREE.Object3D()) };
      await expect(observeSectionViewTestBackendBindings(input)).rejects.toThrow('object cap');
      expect(f.mesh.onAfterRender).toBe(original);
      expect(f.scene.onAfterRender).toBe(originalScene);
      expect(f.invalidate).not.toHaveBeenCalled();
    } finally {
      f.abort.abort();
      f.dispose();
    }
  });

  it('should report only existing WebGPU records and explicit missing attributes without claiming generated wrappers', async () => {
    const f = fixture();
    const buffer = mock<GPUBuffer>({ size: 512, usage: 12 });
    const data = new WeakMap<
      THREE.BufferAttribute | THREE.InterleavedBuffer | THREE.InterleavedBufferAttribute,
      unknown
    >();
    data.set(f.geometry.attributes['position']!, { buffer });
    data.set(f.geometry.index!, { buffer });
    Object.defineProperty(f.renderer, 'backend', { value: { data }, configurable: true });
    vi.stubGlobal('GPUBuffer', {
      [Symbol.hasInstance](value: unknown): boolean {
        return value === buffer;
      },
    });
    const input: Parameters<typeof observeSectionViewTestBackendBindings>[0] = { ...f.input, backend: 'webgpu' };
    const operation = observeSectionViewTestBackendBindings(input);
    try {
      f.draw();
      f.finish();
      const result = await operation;
      expect(result.buffers).toEqual([{ ordinal: 0, bytes: 512, usage: 12 }]);
      expect(result.samples[0]?.missingRecords).toEqual(['normal', 'uv']);
      expect(result.samples[0]?.buffers.map(({ binding }) => binding)).toEqual(['index', 'position']);
      expect(result.completeResidentInventory).toBe(false);
      expect(result.uploadedBytes).toBeUndefined();
      expect(f.gl.getBufferParameter).not.toHaveBeenCalled();
    } finally {
      f.abort.abort();
      await Promise.allSettled([operation]);
      f.dispose();
    }
  });

  it('should preserve an original scene callback error and restore sibling callbacks', async () => {
    const f = fixture();
    const failure = new Error('Original scene callback failed.');
    const original = (): never => {
      throw failure;
    };
    f.scene.onAfterRender = original;
    const originalDraw = f.mesh.onAfterRender;
    const operation = observeSectionViewTestBackendBindings(f.input);
    const observed = expect(operation).rejects.toBe(failure);
    try {
      f.draw();
      expect(f.finish).toThrow(failure);
      await observed;
      expect(f.mesh.onAfterRender).toBe(originalDraw);
      expect(f.scene.onAfterRender).toBe(original);
    } finally {
      f.abort.abort();
      await Promise.allSettled([operation, observed]);
      f.dispose();
    }
  });

  it('should restore callbacks when invalidation itself fails', async () => {
    const f = fixture();
    const failure = new Error('Invalidation failed.');
    const original = f.mesh.onAfterRender;
    const originalScene = f.scene.onAfterRender;
    f.invalidate.mockImplementation(() => {
      throw failure;
    });
    const operation = observeSectionViewTestBackendBindings(f.input);
    try {
      await expect(operation).rejects.toBe(failure);
      expect(f.mesh.onAfterRender).toBe(original);
      expect(f.scene.onAfterRender).toBe(originalScene);
    } finally {
      f.abort.abort();
      await Promise.allSettled([operation]);
      f.dispose();
    }
  });

  it('should reject a changed current fence even when its post-restoration read throws', async () => {
    const f = fixture();
    const failure = new Error('Current authority read failed.');
    const operation = observeSectionViewTestBackendBindings(f.input);
    const observed = expect(operation).rejects.toBe(failure);
    try {
      f.draw();
      f.isCurrent.mockReturnValueOnce(true).mockImplementationOnce(() => {
        throw failure;
      });
      f.finish();
      await observed;
    } finally {
      f.abort.abort();
      await Promise.allSettled([operation, observed]);
      f.dispose();
    }
  });

  it('should forward the original callback and restore query state when a GPU query throws', async () => {
    const f = fixture();
    const failure = new Error('Actual query failed.');
    const original = vi.fn<THREE.Object3D['onAfterRender']>();
    f.mesh.onAfterRender = original;
    f.gl.getBufferParameter.mockImplementation(() => {
      throw failure;
    });
    const operation = observeSectionViewTestBackendBindings(f.input);
    const observed = expect(operation).rejects.toBe(failure);
    try {
      f.draw();
      await observed;
      expect(original).toHaveBeenCalledOnce();
      expect(f.bound()).toBe(f.prior);
      expect(f.mesh.onAfterRender).toBe(original);
    } finally {
      f.abort.abort();
      await Promise.allSettled([operation, observed]);
      f.dispose();
    }
  });
});

describe('readSectionViewTestRenderDeviceIdentity', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const createNativeViewport = () => {
    const canvas = document.createElement('canvas');
    const infoReads = vi.fn();
    class NativeDevice {
      public get adapterInfo() {
        infoReads();
        return { vendor: 'apple', architecture: 'metal', device: '', description: '', isFallbackAdapter: false };
      }
    }
    class NativeContext {
      // oxlint-disable-next-line typescript/parameter-properties -- UI erasableSyntaxOnly forbids constructor parameter properties in this native-context mock.
      public readonly canvas: HTMLCanvasElement;
      // oxlint-disable-next-line typescript/parameter-properties -- UI erasableSyntaxOnly forbids constructor parameter properties in this native-context mock.
      public device: NativeDevice | undefined;
      public constructor(canvas: HTMLCanvasElement, device: NativeDevice | undefined) {
        this.canvas = canvas;
        this.device = device;
      }
      public getConfiguration() {
        return this.device ? { device: this.device } : null;
      }
    }
    vi.stubGlobal('GPUDevice', NativeDevice);
    vi.stubGlobal('GPUCanvasContext', NativeContext);
    const device = new NativeDevice();
    const context = new NativeContext(canvas, device);
    const renderer = {
      domElement: canvas,
      backend: { device },
      hasInitialized() {
        return true;
      },
      getContext() {
        expect(this.backend.device).toBe(device);
        return context;
      },
    };
    return { canvas, device, context, renderer, infoReads, createNativeDevice: () => new NativeDevice() };
  };

  it('should perform no renderer or native reads without explicit opt-in', () => {
    const read = vi.fn(() => {
      throw new Error('Timed identity path must not inspect device storage.');
    });
    const renderer = new Proxy({}, { get: read });
    expect(readSectionViewTestRenderDeviceIdentity({ renderer, api: 'webgpu', frame: 4 })).toBeUndefined();
    expect(
      readSectionViewTestRenderDeviceIdentity({ renderer, api: 'webgpu', frame: 4, includeRenderDevice: false }),
    ).toBeUndefined();
    expect(read).not.toHaveBeenCalled();
  });

  it('should read only the actual configured device with native receivers and preserve redaction', () => {
    const { renderer, infoReads } = createNativeViewport();
    expect(
      readSectionViewTestRenderDeviceIdentity({ renderer, api: 'webgpu', frame: 4, includeRenderDevice: true }),
    ).toEqual({
      status: 'observed',
      source: 'mounted-webgpu-canvas-device',
      canvasMatches: true,
      configuredDeviceMatches: true,
      vendor: 'apple',
      architecture: 'metal',
      device: '',
      description: '',
      isFallbackAdapter: false,
      identityFieldsComplete: false,
    });
    expect(infoReads).toHaveBeenCalledTimes(1);
  });

  it('should refuse undrawn or uninitialized renderers before any context initialization', () => {
    const { renderer, infoReads } = createNativeViewport();
    const contextRead = vi.spyOn(renderer, 'getContext');
    expect(
      readSectionViewTestRenderDeviceIdentity({ renderer, api: 'webgpu', frame: 0, includeRenderDevice: true }),
    ).toEqual({ status: 'unavailable', reason: 'NO_OBSERVED_DRAW' });
    vi.spyOn(renderer, 'hasInitialized').mockReturnValue(false);
    expect(
      readSectionViewTestRenderDeviceIdentity({ renderer, api: 'webgpu', frame: 4, includeRenderDevice: true }),
    ).toEqual({ status: 'unavailable', reason: 'RENDERER_NOT_INITIALIZED' });
    expect(contextRead).not.toHaveBeenCalled();
    expect(infoReads).not.toHaveBeenCalled();
  });

  it('should deny canvas or configured-device mismatch without reading another device identity', () => {
    const { renderer, context, createNativeDevice, infoReads } = createNativeViewport();
    renderer.domElement = document.createElement('canvas');
    expect(
      readSectionViewTestRenderDeviceIdentity({ renderer, api: 'webgpu', frame: 4, includeRenderDevice: true }),
    ).toEqual({ status: 'unavailable', reason: 'CANVAS_MISMATCH' });
    renderer.domElement = context.canvas;
    context.device = createNativeDevice();
    expect(
      readSectionViewTestRenderDeviceIdentity({ renderer, api: 'webgpu', frame: 4, includeRenderDevice: true }),
    ).toEqual({ status: 'unavailable', reason: 'CONFIGURED_DEVICE_MISMATCH' });
    expect(infoReads).not.toHaveBeenCalled();
  });

  it('should refuse unsupported native context and null configuration', () => {
    const { renderer, context, infoReads } = createNativeViewport();
    vi.stubGlobal('GPUCanvasContext', undefined);
    expect(
      readSectionViewTestRenderDeviceIdentity({ renderer, api: 'webgpu', frame: 4, includeRenderDevice: true }),
    ).toEqual({ status: 'unavailable', reason: 'NATIVE_CONTEXT_UNSUPPORTED' });
    vi.stubGlobal('GPUCanvasContext', context.constructor);
    context.device = undefined;
    expect(
      readSectionViewTestRenderDeviceIdentity({ renderer, api: 'webgpu', frame: 4, includeRenderDevice: true }),
    ).toEqual({ status: 'unavailable', reason: 'CONFIGURED_DEVICE_MISMATCH' });
    expect(infoReads).not.toHaveBeenCalled();
  });

  it('should deny configured-device replacement during the native read', () => {
    const { renderer, context, device, createNativeDevice } = createNativeViewport();
    vi.spyOn(context, 'getConfiguration')
      .mockReturnValueOnce({ device })
      .mockReturnValueOnce({ device: createNativeDevice() });
    expect(
      readSectionViewTestRenderDeviceIdentity({ renderer, api: 'webgpu', frame: 4, includeRenderDevice: true }),
    ).toEqual({ status: 'unavailable', reason: 'DEVICE_CHANGED_DURING_READ' });
  });

  it('should report actual WebGL context identity without synthesizing hardware or fallback flags', () => {
    const canvas = document.createElement('canvas');
    class NativeContext {
      public readonly canvas = canvas;
      public lost = false;
      public isContextLost() {
        return this.lost;
      }
      public getExtension(name: string) {
        expect(name).toBe('WEBGL_debug_renderer_info');
        /* eslint-disable @typescript-eslint/naming-convention -- Native WebGL extension constants retain their specified API names. */
        return { UNMASKED_VENDOR_WEBGL: 1, UNMASKED_RENDERER_WEBGL: 2 };
        /* eslint-enable @typescript-eslint/naming-convention -- Native WebGL extension constants retain their specified API names. */
      }
      public getParameter(parameter: number) {
        expect(this.canvas).toBe(canvas);
        return parameter === 1 ? 'Google' : 'SwiftShader';
      }
    }
    vi.stubGlobal('WebGL2RenderingContext', NativeContext);
    const context = new NativeContext();
    const renderer = {
      domElement: canvas,
      getContext() {
        return context;
      },
    };
    const result = readSectionViewTestRenderDeviceIdentity({
      renderer,
      api: 'webgl',
      frame: 4,
      includeRenderDevice: true,
    });
    expect(result).toEqual({
      status: 'observed',
      source: 'mounted-webgl-context',
      canvasMatches: true,
      configuredDeviceMatches: undefined,
      vendor: 'Google',
      architecture: '',
      device: '',
      description: 'SwiftShader',
      isFallbackAdapter: undefined,
      identityFieldsComplete: true,
    });
    context.lost = true;
    expect(
      readSectionViewTestRenderDeviceIdentity({ renderer, api: 'webgl', frame: 4, includeRenderDevice: true }),
    ).toEqual({ status: 'unavailable', reason: 'CONTEXT_LOST' });
  });
});

/** Build the shared admitted native-slot fixture for helper and mounted bridge controls. */
async function createPosedExportFixture() {
  const glb = writeGlb({
    nodes: [
      {
        extras: { tauComponentId: 'component:native', tauComponentKind: 'part' },
        primitives: [{ mode: 4, positions: Float32Array.from([0, 0, 0, 0.01, 0, 0, 0, 0.01, 0]), material: {} }],
      },
    ],
  });
  const asset = {
    path: 'part.glb',
    digest: contentDigest({ value: `sha256:${await sha256Bytes(glb)}` }),
    byteLength: glb.byteLength,
  };
  const publication: AdmittedAssembly['publication'] = {
    schemaVersion: 1,
    parts: { native: { schemaVersion: 1, variants: { default: mock<PublishedPartVariant>({ glb: asset }) } } },
    occurrences: ['left', 'right'].map((id, index) => ({
      id,
      part: 'native',
      variant: 'default',
      transform: new THREE.Matrix4().makeTranslation(index * 0.25, 0, 0).toArray(),
    })),
  };
  const metadata = await validateAdmittedAssemblyGlb({ ...publication, readAsset: async () => glb });
  const components = metadata.components.filter(({ sourceComponentId }) => sourceComponentId !== undefined);
  const ids = components.map(({ component }) => component.id);
  const document = mock<CadAssemblyDisplay['document']>();
  const bytes = new TextEncoder().encode('ISO-10303-21;');
  document.exportPublished.mockResolvedValue({
    success: true,
    exportId: 'step',
    issues: [],
    files: [{ name: 'posed.step', mimeType: 'model/step', bytes }],
  });
  const root = {
    path: `.tau/artifacts/reusable-parts/${'a'.repeat(64)}/scene.json`,
    digest: contentDigest({ value: `sha256:${'a'.repeat(64)}` }),
    byteLength: 12,
  };
  const display: CadAssemblyDisplay = { root, document, admitted: mock<AdmittedAssembly>({ publication }) };
  const unit: KinematicsPoseUnit = {
    revision: 2,
    mechanism: {
      schemaVersion: 1,
      units: { length: 'm', angle: 'rad' },
      root: 'ground',
      links: { ground: { components: [] }, ...Object.fromEntries(ids.map((id) => [id, { components: [id] }])) },
      joints: {},
    },
    pose: {
      coordinates: {},
      linkTransforms: Object.fromEntries(
        ids.map((id, index) => [id, new THREE.Matrix4().makeTranslation(0, (index + 1) * 0.01, 0).toArray()]),
      ),
    },
  };
  const binding: Parameters<typeof exportSectionViewTestPosedAssembly>[0]['binding'] = {
    root,
    projectId: 'current-project',
    sourceEntryPath: root.path,
    key: root.digest,
    unitId: `file:${root.path}`,
    poseRevision: 3,
    presentationRevision: 4,
    candidateSceneId: 'actual-candidate',
    coordinateSystem: 'y-up',
  };
  const input: Parameters<typeof exportSectionViewTestPosedAssembly>[0] = {
    source: { display, metadata },
    unit,
    binding,
    isCurrent: () => true,
  };
  return { input, document, bytes, ids };
}

describe('debug-only complete current-pose published export', () => {
  it('should capture every genuine admitted native slot at its live solver placement and return copied STEP bytes', async () => {
    const { input, document, bytes, ids } = await createPosedExportFixture();
    const result = await exportSectionViewTestPosedAssembly(input);
    expect(result.canonicalIds).toEqual(ids);
    expect(result).toMatchObject({ ...input.binding, exportId: 'step', bytes: [...bytes] });
    expect(result.root).not.toBe(input.binding.root);
    expect(document.exportPublished).toHaveBeenCalledOnce();
    const request = document.exportPublished.mock.calls[0]?.[0];
    expect(request).toMatchObject({ format: 'step', exportOptions: { coordinateSystem: 'y-up' } });
    const placements = request?.publishedAssembly?.placements;
    expect(placements?.map(({ componentId }) => componentId)).toEqual(ids);
    expect(placements?.map(({ worldTransform }) => [worldTransform[12], worldTransform[13]])).toEqual([
      [0, 0.01],
      [0.25, 0.02],
    ]);
    bytes.fill(0);
    expect(result.bytes).toEqual([...new TextEncoder().encode('ISO-10303-21;')]);
  });

  it('should accept the actual extensionless assembly provider label with one bounded STEP artifact', async () => {
    const { input, document, bytes, ids } = await createPosedExportFixture();
    document.exportPublished.mockResolvedValue({
      success: true,
      exportId: 'step',
      issues: [],
      files: [{ name: 'assembly', mimeType: 'application/step', bytes }],
    });
    const result = await exportSectionViewTestPosedAssembly(input);
    expect(result.canonicalIds).toEqual(ids);
    expect(result).toMatchObject({ ...input.binding, exportId: 'step', bytes: [...bytes] });
    expect(document.exportPublished).toHaveBeenCalledOnce();
    expect(document.exportPublished.mock.calls[0]?.[0]).toMatchObject({
      format: 'step',
      publishedAssembly: { root: input.binding.root },
      exportOptions: { coordinateSystem: 'y-up' },
    });
  });

  it.each(['path', 'digest', 'byteLength'] satisfies Array<keyof CadAssemblyDisplay['root']>)(
    'should deny a replaced root %s before native export',
    async (field) => {
      const { input, document } = await createPosedExportFixture();
      const roots: Record<keyof CadAssemblyDisplay['root'], CadAssemblyDisplay['root']> = {
        path: { ...input.binding.root, path: 'other/scene.json' },
        digest: { ...input.binding.root, digest: contentDigest({ value: `sha256:${'b'.repeat(64)}` }) },
        byteLength: { ...input.binding.root, byteLength: 13 },
      };
      const root = roots[field];
      const binding = { ...input.binding, root };
      await expect(exportSectionViewTestPosedAssembly({ ...input, binding })).rejects.toThrow('current admitted');
      expect(document.exportPublished).not.toHaveBeenCalled();
    },
  );

  it.each(['duplicate', 'revoked'])(
    'should refuse %s native canonical metadata without publishing a partial pose',
    async (condition) => {
      const { input, document } = await createPosedExportFixture();
      const components = [...input.source.metadata.components];
      const native = components.find(({ sourceComponentId }) => sourceComponentId !== undefined);
      if (!native) {
        throw new Error('Genuine source metadata is absent.');
      }
      if (condition === 'duplicate') {
        components.push(native);
      } else {
        components[components.indexOf(native)] = { ...native, sourceComponentId: undefined };
      }
      const source = { ...input.source, metadata: { ...input.source.metadata, components } };
      await expect(exportSectionViewTestPosedAssembly({ ...input, source })).rejects.toThrow('unique actual');
      expect(document.exportPublished).not.toHaveBeenCalled();
    },
  );

  it('should refuse a genuinely missing live solver transform before native export', async () => {
    const { input, document } = await createPosedExportFixture();
    await expect(
      exportSectionViewTestPosedAssembly({ ...input, unit: { ...input.unit, pose: undefined } }),
    ).rejects.toThrow('complete admitted placement capture');
    expect(document.exportPublished).not.toHaveBeenCalled();
  });

  it('should refuse a revoked admitted occurrence definition without exporting an incomplete canonical set', async () => {
    const { input, document } = await createPosedExportFixture();
    const occurrences = input.source.metadata.occurrences.map((occurrence, index) =>
      index === 0 ? { ...occurrence, definition: undefined } : occurrence,
    );
    const source = { ...input.source, metadata: { ...input.source.metadata, occurrences } };
    await expect(exportSectionViewTestPosedAssembly({ ...input, source })).rejects.toThrow(
      'complete admitted placement capture',
    );
    expect(document.exportPublished).not.toHaveBeenCalled();
  });

  it('should preserve a genuine published export error and deny subsequent acquisition from its retired reader', async () => {
    const { input, document } = await createPosedExportFixture();
    let current = true;
    const retirement = new Error('Actual published owner retired.');
    document.exportPublished.mockImplementation(async () => {
      current = false;
      throw retirement;
    });
    await expect(exportSectionViewTestPosedAssembly({ ...input, isCurrent: () => current })).rejects.toBe(retirement);
    expect(document.exportPublished).toHaveBeenCalledOnce();
    await expect(exportSectionViewTestPosedAssembly({ ...input, isCurrent: () => current })).rejects.toThrow(
      'current admitted',
    );
    expect(document.exportPublished).toHaveBeenCalledOnce();
  });

  it('should discard successful bytes when the held current reader retires during the native await', async () => {
    const { input, document, bytes } = await createPosedExportFixture();
    let current = true;
    const pending = Promise.withResolvers<Awaited<ReturnType<typeof document.exportPublished>>>();
    document.exportPublished.mockReturnValue(pending.promise);
    const observed = Promise.allSettled([exportSectionViewTestPosedAssembly({ ...input, isCurrent: () => current })]);
    expect(document.exportPublished).toHaveBeenCalledOnce();
    current = false;
    pending.resolve({
      success: true,
      exportId: 'step',
      issues: [],
      files: [{ name: 'posed.step', mimeType: 'model/step', bytes }],
    });
    const [outcome] = await observed;
    expect(outcome.status).toBe('rejected');
    if (outcome.status !== 'rejected') {
      throw new Error('Retired reader delivered native bytes.');
    }
    expect(outcome.reason).toMatchObject({ message: 'Full posed export subject changed during native export.' });
    expect(document.exportPublished).toHaveBeenCalledOnce();
  });

  it('should refuse an empty genuine export reply without acquiring a replacement document', async () => {
    const { input, document } = await createPosedExportFixture();
    document.exportPublished.mockResolvedValue({ success: false, issues: [] });
    await expect(exportSectionViewTestPosedAssembly(input)).rejects.toThrow('one bounded actual STEP');
    expect(document.exportPublished).toHaveBeenCalledOnce();
  });

  it('should report only copied refusal fields without acquiring a replacement document or exposing its message', async () => {
    const { input, document } = await createPosedExportFixture();
    document.exportPublished.mockResolvedValue({
      success: false,
      issues: [
        {
          code: 'REPRESENTATION_UNSUPPORTED',
          severity: 'error',
          type: 'runtime',
          message: 'Private refusal fixture.',
        },
      ],
    });
    await expect(exportSectionViewTestPosedAssembly(input)).rejects.toMatchObject({
      name: 'Error',
      message: `Full posed export did not return one bounded actual STEP file: ${JSON.stringify({
        success: false,
        exportIdPresent: false,
        fileCount: 0,
        files: [],
        issues: [{ code: 'REPRESENTATION_UNSUPPORTED', severity: 'error', type: 'runtime' }],
      })}`,
    });
    expect(document.exportPublished).toHaveBeenCalledOnce();
  });

  it.each([
    {
      condition: 'missing route identity',
      exportId: '',
      name: 'posed.step',
      mimeType: 'model/step',
      byteLength: 13,
      multiple: false,
    },
    {
      condition: 'multiple files',
      exportId: 'step',
      name: 'posed.step',
      mimeType: 'model/step',
      byteLength: 13,
      multiple: true,
    },
    {
      condition: 'empty provider label',
      exportId: 'step',
      name: '',
      mimeType: 'model/step',
      byteLength: 13,
      multiple: false,
    },
    {
      condition: 'wrong MIME',
      exportId: 'step',
      name: 'posed.step',
      mimeType: 'model/gltf-binary',
      byteLength: 13,
      multiple: false,
    },
    {
      condition: 'empty bytes',
      exportId: 'step',
      name: 'posed.step',
      mimeType: 'model/step',
      byteLength: 0,
      multiple: false,
    },
    {
      condition: 'oversized bytes',
      exportId: 'step',
      name: 'posed.step',
      mimeType: 'model/step',
      byteLength: 67_108_865,
      multiple: false,
    },
  ])(
    'should retain the $condition denial and report actual file metadata without copying payload bytes',
    async (condition) => {
      const { input, document } = await createPosedExportFixture();
      const { exportId, name, mimeType, byteLength, multiple } = condition;
      const file = { name, mimeType, bytes: new Uint8Array(byteLength) };
      const outcome: Awaited<ReturnType<typeof document.exportPublished>> = {
        success: true,
        exportId,
        issues: [],
        files: multiple ? [file, file] : [file],
      };
      document.exportPublished.mockResolvedValue(outcome);
      const metadata = { name, mimeType, byteLength };
      await expect(exportSectionViewTestPosedAssembly(input)).rejects.toMatchObject({
        name: 'Error',
        message: `Full posed export did not return one bounded actual STEP file: ${JSON.stringify({
          success: true,
          exportIdPresent: Boolean(exportId),
          fileCount: multiple ? 2 : 1,
          files: multiple ? [metadata, metadata] : [metadata],
          issues: [],
        })}`,
      });
      expect(document.exportPublished).toHaveBeenCalledOnce();
    },
  );
});
