import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import {
  buildSectionCapStyleKey,
  buildSectionCapTopologySourceSetKey,
  buildSectionFillGeometryKey,
  collectSectionSourceRecords,
  ownerKeyForRecord,
  resolveSectionSourceTint,
} from '#components/geometry/graphics/three/react/section-contour-fill.js';
import { buildSectionCapBoundaryPositions } from '#components/geometry/graphics/three/utils/section-cap-boundary.js';
import { viewportRenderTiers } from '#components/geometry/graphics/three/utils/render-order.utils.js';
import {
  getOrCaptureModelMaterialAppearance,
  mixModelEmphasisTint,
} from '#components/geometry/graphics/three/materials/model-component-appearance.js';
import { setModelComponentOwner } from '#components/geometry/graphics/three/utils/model-component-owner.js';
import {
  createSegmentScratch,
  extractSectionContours,
} from '#components/geometry/graphics/three/utils/plane-mesh-contour.js';
import { mergeTriangulatedContours } from '#components/geometry/graphics/three/utils/earcut-contour.js';
import { sceneTag, sceneTagData } from '#components/geometry/graphics/three/utils/scene-tags.js';
import {
  configureSectionSourceOnlyMaterial,
  markSectionSourceOnlyObject,
} from '#components/geometry/graphics/three/utils/section-source-only.js';
import type { ModelInteractionContext } from '#machines/model-interaction.machine.js';
import type { SectionCapWorkerInputSource } from '#components/geometry/graphics/three/utils/section-cap-overlap-worker-protocol.js';
import type { CapMultiPolygon } from '#components/geometry/graphics/three/utils/section-cap-polygon-types.js';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const stageSource = readFileSync(join(currentDirectory, '..', 'stage.tsx'), 'utf8');
const sectionViewControlsSource = readFileSync(join(currentDirectory, 'section-view-controls.tsx'), 'utf8');
const sectionContourFillSource = readFileSync(join(currentDirectory, 'section-contour-fill.tsx'), 'utf8');

function createModelInteractionContext({
  unitId,
  hoveredComponentId,
  selectedComponentIds = [],
}: {
  readonly unitId: string;
  readonly hoveredComponentId?: string;
  readonly selectedComponentIds?: string[];
}): ModelInteractionContext {
  return {
    unitsById: {
      [unitId]: {
        manifest: undefined,
        hoveredComponentId,
        selectedComponentIds,
        focusedComponentId: undefined,
        hiddenComponentIds: [],
        isolatedComponentIds: [],
        opacityByComponentId: {},
      },
    },
    unitOrder: [unitId],
    revision: hoveredComponentId !== undefined || selectedComponentIds.length > 0 ? 1 : 0,
    displayRevision: 0,
    lastInteractionSource: 'viewer',
  };
}

function mergeNonIndexedGeometries(geometries: readonly THREE.BufferGeometry[]): THREE.BufferGeometry {
  let floatCount = 0;
  const positionArrays: Float32Array[] = [];

  for (const geometry of geometries) {
    const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    const position = nonIndexed.getAttribute('position') as THREE.BufferAttribute;
    const array = position.array as Float32Array;
    positionArrays.push(array);
    floatCount += array.length;
  }

  const positions = new Float32Array(floatCount);
  let offset = 0;
  for (const array of positionArrays) {
    positions.set(array, offset);
    offset += array.length;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return merged;
}

describe('SectionContourFills placement (Architecture C)', () => {
  it('renders contour fills outside SectionClippingGroup in stage.tsx', () => {
    expect(stageSource.includes('<SectionContourFills')).toBe(true);

    const clippingOpen = stageSource.indexOf('<SectionClippingGroup');
    expect(clippingOpen).toBeGreaterThanOrEqual(0);

    const clippingCloseToken = '</SectionClippingGroup>';
    const clippingClose = stageSource.indexOf(clippingCloseToken, clippingOpen);
    expect(clippingClose).toBeGreaterThan(clippingOpen);

    const contourIndex = stageSource.indexOf('<SectionContourFills');
    expect(contourIndex).toBeGreaterThan(clippingClose);

    const legacyStencilProxies = ['Section', 'Stencil', 'Proxies'].join('');
    const legacyCapPlane = ['Section', 'Cap', 'Plane'].join('');
    expect(stageSource.includes(legacyStencilProxies)).toBe(false);
    expect(stageSource.includes(legacyCapPlane)).toBe(false);
  });

  it('keeps clipped-cap contour extraction out of section-view controls', () => {
    expect(sectionViewControlsSource.includes('SectionContourFills')).toBe(false);
    expect(sectionViewControlsSource.includes('extractSectionContours')).toBe(false);
    expect(sectionViewControlsSource.includes('buildSectionCapBoundaryPositions')).toBe(false);
  });

  it('uses explicit render tiers and contour-specific materials for cap fills and outlines', () => {
    expect(viewportRenderTiers.sectionCapFill).toBeLessThan(viewportRenderTiers.sectionContourOutline);
    expect(sectionContourFillSource.includes('viewportRenderTiers.sectionCapFill')).toBe(true);
    expect(sectionContourFillSource.includes('viewportRenderTiers.sectionContourOutline')).toBe(true);
    expect(sectionContourFillSource.includes('createSectionContourOutlineMaterial')).toBe(true);
    expect(sectionContourFillSource.includes('setSectionContourOutlineMaterialColor')).toBe(true);
    expect(sectionContourFillSource.includes('createGltfFatLineMaterial({')).toBe(false);
    expect(sectionContourFillSource.includes('setGltfFatLineMaterialColor(')).toBe(false);
  });

  it('builds current base caps and sanitized cap-boundary outlines without stale exact-response gating', () => {
    expect(sectionContourFillSource.includes('buildCurrentSectionBaseCapGeometry')).toBe(true);
    expect(sectionContourFillSource.includes('buildSectionCapBoundaryPositions')).toBe(true);
    expect(sectionContourFillSource.includes('const baseBuffers = exactBuffers')).toBe(true);
    expect(sectionContourFillSource.includes('if (!exactResponse) {')).toBe(false);
    expect(sectionContourFillSource.includes('helper.fillMesh.visible)')).toBe(false);
  });
});

describe('SectionContourFills source records', () => {
  it('skips hidden meshes and opacity-zero materials while keeping transparent visible sources', () => {
    const root = new THREE.Group();

    const hiddenMesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ color: 0xff_00_00 }));
    hiddenMesh.visible = false;
    root.add(hiddenMesh);

    const transparentButVisible = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshBasicMaterial({ color: 0x00_ff_00, opacity: 0.5, transparent: true }),
    );
    root.add(transparentButVisible);

    const invisibleMaterial = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshBasicMaterial({ color: 0x00_00_ff, opacity: 0 }),
    );
    root.add(invisibleMaterial);

    const records = collectSectionSourceRecords(root);

    expect(records.map((record) => record.mesh)).toEqual([transparentButVisible]);
    expect(records[0]!.baseTintHex).toBe(0x00_ff_00);
  });

  it('splits multi-material geometry groups by source material color', () => {
    const root = new THREE.Group();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 2, 0, 0, 3, 0, 0, 2, 1, 0]), 3),
    );
    geometry.addGroup(0, 3, 0);
    geometry.addGroup(3, 3, 1);

    const mesh = new THREE.Mesh(geometry, [
      new THREE.MeshBasicMaterial({ color: 0xff_00_00 }),
      new THREE.MeshBasicMaterial({ color: 0x00_00_ff }),
    ]);
    root.add(mesh);

    const records = collectSectionSourceRecords(root);

    expect(records).toHaveLength(2);
    expect(records.map((record) => record.baseTintHex)).toEqual([0xff_00_00, 0x00_00_ff]);
    expect(records.map((record) => record.group?.materialIndex)).toEqual([0, 1]);
  });

  it('uses material-group source identity for overlap owners when a packed mesh shares one component owner', () => {
    const root = new THREE.Group();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 2, 0, 0, 3, 0, 0, 2, 1, 0]), 3),
    );
    geometry.addGroup(0, 3, 0);
    geometry.addGroup(3, 3, 1);

    const mesh = new THREE.Mesh(geometry, [
      new THREE.MeshBasicMaterial({ color: 0xff_00_00 }),
      new THREE.MeshBasicMaterial({ color: 0x00_00_ff }),
    ]);
    setModelComponentOwner(mesh, { unitId: 'unit:main', componentId: 'component:packed' });
    root.add(mesh);

    const records = collectSectionSourceRecords(root);

    expect(records).toHaveLength(2);
    expect(new Set(records.map((record) => ownerKeyForRecord(record))).size).toBe(2);
    expect(records.map((record) => ownerKeyForRecord(record))).toEqual(
      records.map((record) => `unit:main:component:packed:${record.key}`),
    );
  });

  it('carries unit-scoped component ownership from source mesh hierarchy', () => {
    const root = new THREE.Group();
    const parent = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ color: 0xaa_bb_cc }));
    setModelComponentOwner(parent, { unitId: 'unit:main', componentId: 'component:block' });
    parent.add(mesh);
    root.add(parent);

    const records = collectSectionSourceRecords(root);

    expect(records).toHaveLength(1);
    expect(records[0]!.owner).toEqual({ unitId: 'unit:main', componentId: 'component:block' });
    expect(records[0]!.baseTintHex).toBe(0xaa_bb_cc);
  });

  it('prefers section-source-only body aggregates over split face patches for the same owner', () => {
    const root = new THREE.Group();
    const unitId = 'unit:main';
    const componentId = 'component:zoo-solid-0';
    const firstFace = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ color: 0xff_00_00 }));
    const secondFace = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ color: 0x00_ff_00 }));
    const aggregateMaterial = new THREE.MeshBasicMaterial({ color: 0x00_00_ff, opacity: 0, transparent: true });
    configureSectionSourceOnlyMaterial(aggregateMaterial);
    const aggregate = new THREE.Mesh(new THREE.BoxGeometry(), aggregateMaterial);
    markSectionSourceOnlyObject(aggregate);

    setModelComponentOwner(firstFace, { unitId, componentId });
    setModelComponentOwner(secondFace, { unitId, componentId });
    setModelComponentOwner(aggregate, { unitId, componentId });
    root.add(firstFace, secondFace, aggregate);

    const records = collectSectionSourceRecords(root);

    expect(records).toHaveLength(1);
    expect(records[0]!.mesh).toBe(aggregate);
    expect(ownerKeyForRecord(records[0]!)).toBe(`${unitId}:${componentId}`);
  });

  it('skips section-view helpers from source ownership', () => {
    const root = new THREE.Group();
    const helperMesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    helperMesh.userData = sceneTagData(sceneTag.sectionViewHelper);
    root.add(helperMesh);

    expect(collectSectionSourceRecords(root)).toEqual([]);
  });

  it('keeps cache keys stable for camera-only frames and invalidates on plane or source transform changes', () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ color: 0xff_00_00 }));
    root.add(mesh);
    root.updateMatrixWorld(true);

    const record = collectSectionSourceRecords(root)[0]!;
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const sameFrameKey = buildSectionFillGeometryKey(record, plane);

    expect(buildSectionFillGeometryKey(record, plane)).toBe(sameFrameKey);

    const movedPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -1);
    expect(buildSectionFillGeometryKey(record, movedPlane)).not.toBe(sameFrameKey);

    mesh.position.set(1, 0, 0);
    mesh.updateMatrixWorld(true);
    expect(buildSectionFillGeometryKey(record, plane)).not.toBe(sameFrameKey);
  });

  it('keeps geometry keys independent from source tint changes', () => {
    const root = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({ color: 0xff_00_00 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    root.add(mesh);
    root.updateMatrixWorld(true);

    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const firstRecord = collectSectionSourceRecords(root)[0]!;
    const firstKey = buildSectionFillGeometryKey(firstRecord, plane);

    material.color.setHex(0x00_00_ff);
    const secondRecord = collectSectionSourceRecords(root)[0]!;

    expect(secondRecord.baseTintHex).toBe(0x00_00_ff);
    expect(buildSectionFillGeometryKey(secondRecord, plane)).toBe(firstKey);
  });

  it('uses captured base material tint instead of the live mutated material color when available', () => {
    const root = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({ color: 0xaa_44_22 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    root.add(mesh);
    root.updateMatrixWorld(true);

    getOrCaptureModelMaterialAppearance(material);
    material.color.setHex(0x11_22_33);

    const record = collectSectionSourceRecords(root)[0]!;

    expect(record.baseTintHex).toBe(0xaa_44_22);
  });

  it('changes resolved cap tint by component emphasis without changing contour geometry identity', () => {
    const unitId = 'unit:main';
    const componentId = 'component:block';
    const root = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({ color: 0x20_40_60 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    setModelComponentOwner(mesh, { unitId, componentId });
    root.add(mesh);
    root.updateMatrixWorld(true);

    const record = collectSectionSourceRecords(root)[0]!;
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const geometryKey = buildSectionFillGeometryKey(record, plane);
    const idleContext = createModelInteractionContext({ unitId });
    const hoveredContext = createModelInteractionContext({ unitId, hoveredComponentId: componentId });
    const selectedContext = createModelInteractionContext({
      unitId,
      hoveredComponentId: componentId,
      selectedComponentIds: [componentId],
    });

    expect(resolveSectionSourceTint(record, idleContext)).toBe(0x20_40_60);
    expect(resolveSectionSourceTint(record, hoveredContext)).toBe(mixModelEmphasisTint(0x20_40_60, 'hover'));
    expect(resolveSectionSourceTint(record, selectedContext)).toBe(mixModelEmphasisTint(0x20_40_60, 'selected'));
    expect(resolveSectionSourceTint(record, hoveredContext)).not.toBe(resolveSectionSourceTint(record, idleContext));
    expect(resolveSectionSourceTint(record, selectedContext)).not.toBe(
      resolveSectionSourceTint(record, hoveredContext),
    );
    expect(buildSectionFillGeometryKey(record, plane)).toBe(geometryKey);
  });

  it('keeps section cap topology keys stable while style keys change for hover tint', () => {
    const sourcePolygon: CapMultiPolygon = [
      [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ],
      ],
    ];
    const source = {
      sourceKey: 'source-a',
      ownerKey: 'owner-a',
      geometryKey: 'geometry-a',
      sourcePolygon,
      bbox: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
      area: 1,
      trueCut: true,
      meshWorldInverse: new THREE.Matrix4().elements,
    } satisfies SectionCapWorkerInputSource;

    const idleTopologyKey = buildSectionCapTopologySourceSetKey([source]);
    const hoverTopologyKey = buildSectionCapTopologySourceSetKey([source]);
    const idleStyleKey = buildSectionCapStyleKey([{ sourceKey: source.sourceKey, tintHex: 0x20_40_60 }], {
      stripeFrequency: 2,
      stripeWidth: 0.2,
    });
    const hoverStyleKey = buildSectionCapStyleKey([{ sourceKey: source.sourceKey, tintHex: 0x44_88_cc }], {
      stripeFrequency: 2,
      stripeWidth: 0.2,
    });

    expect(hoverTopologyKey).toBe(idleTopologyKey);
    expect(hoverStyleKey).not.toBe(idleStyleKey);
  });

  it('builds a shaded cap candidate for a one-mesh branched non-manifold source', () => {
    const root = new THREE.Group();
    const geometry = mergeNonIndexedGeometries([
      new THREE.BoxGeometry(2, 2, 2).translate(-1, 0, 0),
      new THREE.BoxGeometry(2, 2, 2).translate(1, 0, 0),
    ]);
    const material = new THREE.MeshBasicMaterial({ color: 0x9e_8c_75 });
    const mesh = new THREE.Mesh(geometry, material);
    root.add(mesh);
    root.updateMatrixWorld(true);

    const record = collectSectionSourceRecords(root)[0]!;
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const contours = extractSectionContours({
      geometry,
      bvh: new MeshBVH(geometry),
      worldPlane: plane,
      meshWorldMatrix: mesh.matrixWorld,
      segmentScratch: createSegmentScratch(512),
    });
    const cap = mergeTriangulatedContours(contours.closedContours, plane.normal);

    expect(record.baseTintHex).toBe(0x9e_8c_75);
    expect(contours.diagnostics).toContainEqual(expect.objectContaining({ kind: 'branched-component' }));
    expect(cap.positions.length).toBeGreaterThan(0);
    expect(cap.indices.length).toBeGreaterThan(0);
  });

  it('builds sanitized cap-boundary endpoint pairs for a normal closed cap with no open diagnostics', () => {
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const contours = extractSectionContours({
      geometry,
      bvh: new MeshBVH(geometry),
      worldPlane: plane,
      meshWorldMatrix: new THREE.Matrix4(),
      segmentScratch: createSegmentScratch(512),
    });

    const planeBasis = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const capBoundary = buildSectionCapBoundaryPositions({
      multiPolygon: [
        [
          [
            [-1, -1],
            [1, -1],
            [1, 1],
            [-1, 1],
          ],
        ],
      ],
      basis: {
        origin: new THREE.Vector3(),
        normal: planeBasis.normal,
        u: new THREE.Vector3(1, 0, 0),
        v: new THREE.Vector3(0, 1, 0),
        planeKey: 'test',
        normalizationOffset: new THREE.Vector2(),
        normalizationScale: 1,
      },
      meshWorldInverse: new THREE.Matrix4(),
    });

    expect(contours.closedContours).toHaveLength(1);
    expect(contours.openPolylines).toEqual([]);
    expect(capBoundary.stats.segmentCount).toBe(4);
    expect(capBoundary.positions.length).toBe(capBoundary.stats.segmentCount * 6);
    expect(capBoundary.stats.segmentCount).toBeLessThan(contours.closedContours[0]!.length);
  });
});
