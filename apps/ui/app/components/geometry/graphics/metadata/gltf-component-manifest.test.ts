import { describe, expect, it, vi } from 'vitest';
import { tauCadTopologyExtension } from '@taucad/types/constants';
import { writeGlb } from '@taucad/geometry-core';
import type { TauCadPhysical } from '@taucad/geometry-core';
import { quantityFromPhysical } from '#components/geometry/cad/part-quantities.js';
import {
  buildGltfComponentManifest,
  buildGltfMeasurementFeatures,
  prepareGltfMetadata,
  listReachableGltfPrimitiveReferences,
} from '#components/geometry/graphics/metadata/gltf-component-manifest.js';

const positionAttribute = 'POSITION';
const unlitExtension = 'KHR_materials_unlit';
const duplicateDurableIdField = `persistent${'Id'}` as const;
const duplicateDurableKeyField = `persistent${'Key'}` as const;

function encodeJson(value: unknown): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(JSON.stringify(value));
}

describe('buildGltfComponentManifest', () => {
  it('carries authored physical evidence from real GLB bytes into the quantity projection', () => {
    const physical = {
      volume: {
        state: 'measured',
        valueMm3: 12_480,
        geometryDigest: `sha256:${'a'.repeat(64)}`,
        method: 'occt-solid-volume',
        validity: 'closed-solid',
      },
      density: {
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Unit-bearing physical field uses cm³ notation.
        valueGPerCm3: 1.55,
        provenance: 'authored-shape-config',
      },
    } satisfies TauCadPhysical;
    const bytes = writeGlb({
      nodes: [
        {
          name: 'physical-part',
          primitives: [
            {
              mode: 4,
              positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
              indices: new Uint32Array([0, 1, 2]),
              material: { pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] } },
            },
          ],
        },
      ],
      extensions: {
        [tauCadTopologyExtension]: {
          schemaVersion: 1,
          components: [
            { id: 'physical-part', name: 'physical-part', kind: 'part', selector: 'node/0', nodeIndex: 0, physical },
          ],
        },
      },
    });
    const component = buildGltfComponentManifest(bytes).nodesById['physical-part']!;
    expect(component.physical).toEqual(physical);
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Unit-bearing projected field uses cm³ notation.
    expect(quantityFromPhysical(component.physical)).toEqual({ volumeCm3: 12.48, densityGPerCm3: 1.55 });
  });

  it('does not turn an unlabelled density in imported topology into mass', () => {
    const bytes = encodeJson({
      nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [{ mode: 4 }] }],
      extensions: {
        [tauCadTopologyExtension]: {
          schemaVersion: 1,
          components: [
            {
              id: 'part',
              name: 'part',
              kind: 'part',
              selector: 'node/0',
              nodeIndex: 0,
              physical: {
                volume: {
                  state: 'measured',
                  valueMm3: 12_480,
                  geometryDigest: `sha256:${'a'.repeat(64)}`,
                  method: 'occt-solid-volume',
                  validity: 'closed-solid',
                },
                density: { value: 1.55, provenance: 'authored-shape-config' },
              },
            },
          ],
        },
      },
    });
    expect(quantityFromPhysical(buildGltfComponentManifest(bytes).nodesById['part']?.physical)).toEqual({
      measurement: 'failed',
    });
  });

  it('keeps instance-specific face groups and normalizes Replicad non-indexed line scalar spans', () => {
    const bytes = encodeJson({
      nodes: [{ mesh: 0 }, { mesh: 0 }],
      meshes: [
        {
          primitives: [
            { mode: 4, indices: 0, attributes: { [positionAttribute]: 1 }, extras: { tauFaceGroupUnit: 'indices-v1' } },
            { mode: 1, attributes: { [positionAttribute]: 2 }, extras: { tauEdgeGroupUnit: 'xyz-scalars-v1' } },
          ],
        },
      ],
      accessors: [
        { componentType: 5123, count: 6, type: 'SCALAR' },
        { componentType: 5126, count: 4, type: 'VEC3' },
        { componentType: 5126, count: 4, type: 'VEC3' },
      ],
      extensions: {
        [tauCadTopologyExtension]: {
          components: [
            {
              id: 'part-a',
              name: 'A',
              kind: 'part',
              selector: 'node/0',
              nodeIndex: 0,
              faceGroups: [{ start: 0, count: 6, faceId: 7 }],
              edgeGroups: [{ start: 0, count: 12, edgeId: 9 }],
            },
            {
              id: 'part-b',
              name: 'B',
              kind: 'part',
              selector: 'node/1',
              nodeIndex: 1,
              faceGroups: [{ start: 3, count: 3, faceId: 3 }],
              edgeGroups: [{ start: 6, count: 6, edgeId: 4 }],
            },
          ],
        },
      },
    });
    const manifest = buildGltfComponentManifest(bytes);
    const candidate = prepareGltfMetadata(bytes);
    const features = candidate.getMeasurementFeatures();
    expect(features).toEqual(buildGltfMeasurementFeatures(bytes, manifest));
    expect(candidate.getMeasurementFeatures()).toBe(features);

    expect(features.get('0/0/0')).toMatchObject({
      occurrenceId: 'part-a@node:0',
      kind: 'surface',
      faces: [{ id: 'face:7', start: 0, count: 6 }],
    });
    expect(features.get('0/0/1')).toMatchObject({
      occurrenceId: 'part-a@node:0',
      kind: 'line',
      edges: [{ id: 'edge:9', start: 0, count: 4 }],
    });
    expect(features.get('1/0/0')).toMatchObject({
      occurrenceId: 'part-b@node:1',
      kind: 'surface',
      faces: [{ id: 'face:3', start: 3, count: 3 }],
    });
    expect(features.get('1/0/1')).toMatchObject({
      occurrenceId: 'part-b@node:1',
      kind: 'line',
      edges: [{ id: 'edge:4', start: 2, count: 2 }],
    });
  });

  it('rejects unknown span units, overlapping groups, and indexed line scalar spans', () => {
    const base = {
      nodes: [{ mesh: 0 }],
      meshes: [
        {
          primitives: [
            { mode: 4, indices: 0, attributes: { [positionAttribute]: 1 }, extras: { tauFaceGroupUnit: 'indices-v1' } },
            { mode: 1, attributes: { [positionAttribute]: 2 }, extras: { tauEdgeGroupUnit: 'xyz-scalars-v1' } },
          ],
        },
      ],
      accessors: [
        { componentType: 5123, count: 6, type: 'SCALAR' },
        { componentType: 5126, count: 4, type: 'VEC3' },
        { componentType: 5126, count: 4, type: 'VEC3' },
      ],
      extensions: {
        [tauCadTopologyExtension]: {
          components: [
            {
              id: 'part',
              name: 'part',
              kind: 'part',
              nodeIndex: 0,
              selector: 'node/0',
              faceGroups: [
                { start: 0, count: 6, faceId: 1 },
                { start: 3, count: 3, faceId: 2 },
              ],
              edgeGroups: [{ start: 0, count: 12, edgeId: 1 }],
            },
          ],
        },
      },
    };
    const bytes = encodeJson(base);
    const manifest = buildGltfComponentManifest(bytes);
    expect(buildGltfMeasurementFeatures(bytes, manifest).has('0/0/0')).toBe(false);
    const indexedLine = encodeJson({
      ...base,
      meshes: [
        {
          primitives: [
            base.meshes[0]!.primitives[0],
            {
              ...base.meshes[0]!.primitives[1],
              indices: 0,
            },
          ],
        },
      ],
    });
    expect(buildGltfMeasurementFeatures(indexedLine, buildGltfComponentManifest(indexedLine)).has('0/0/1')).toBe(false);
    const unknownUnit = encodeJson({
      ...base,
      meshes: [
        {
          primitives: [
            base.meshes[0]!.primitives[0],
            {
              mode: 1,
              attributes: { [positionAttribute]: 2 },
            },
          ],
        },
      ],
    });
    expect(buildGltfMeasurementFeatures(unknownUnit, buildGltfComponentManifest(unknownUnit)).has('0/0/1')).toBe(false);
  });

  it('should enumerate active-scene primitive instances, including shared meshes', () => {
    const bytes = encodeJson({
      scene: 0,
      scenes: [{ nodes: [0, 1] }, { nodes: [3] }],
      nodes: [{ mesh: 0, children: [2] }, { mesh: 0 }, { mesh: 1 }, { mesh: 2 }],
      meshes: [{ primitives: [{}, {}] }, { primitives: [{}] }, { primitives: [{}] }],
    });

    expect(listReachableGltfPrimitiveReferences(bytes)).toEqual([
      { nodeIndex: 0, meshIndex: 0, primitiveIndex: 0 },
      { nodeIndex: 0, meshIndex: 0, primitiveIndex: 1 },
      { nodeIndex: 2, meshIndex: 1, primitiveIndex: 0 },
      { nodeIndex: 1, meshIndex: 0, primitiveIndex: 0 },
      { nodeIndex: 1, meshIndex: 0, primitiveIndex: 1 },
    ]);
  });

  it('should build a root-only manifest for an empty glTF scene', () => {
    const bytes = encodeJson({
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [] }],
      nodes: [],
      meshes: [],
      accessors: [],
      bufferViews: [],
      buffers: [{ byteLength: 0, uri: 'data:application/octet-stream;base64,' }],
      materials: [],
    });

    const manifest = buildGltfComponentManifest(bytes, { sourceFile: 'src/main.ts', geometryHash: 'empty-hash' });

    expect(manifest.rootId).toBe('root');
    expect(manifest.nodeOrder).toEqual(['root']);
    expect(manifest.nodesById['root']?.childIds).toEqual([]);
    expect(manifest.sourceFile).toBe('src/main.ts');
    expect(manifest.geometryHash).toBe('empty-hash');
  });

  it('should build a component tree from Tau topology extension data', () => {
    const bytes = encodeJson({
      nodes: [
        {
          name: 'gearbox_housing',
          mesh: 0,
          extras: {
            tauComponentId: 'component:gearbox_housing',
            tauComponentKind: 'part',
            tauComponentSelector: 'node/0',
          },
        },
      ],
      meshes: [
        {
          primitives: [
            {
              attributes: { [positionAttribute]: 0 },
              material: 0,
            },
          ],
        },
      ],
      accessors: [
        {
          componentType: 5126,
          count: 3,
          type: 'VEC3',
          min: [-1, -2, -3],
          max: [4, 5, 6],
        },
      ],
      bufferViews: [],
      materials: [{ name: 'gray' }],
      extensions: {
        [tauCadTopologyExtension]: {
          components: [
            {
              id: 'component:gearbox_housing',
              name: 'gearbox_housing',
              kind: 'part',
              selector: 'node/0',
              nodeIndex: 0,
              capabilities: {
                hasPreciseTopology: true,
                exports: [
                  { fidelity: 'mesh', formats: ['glb', 'stl'], available: true },
                  { fidelity: 'brep', formats: ['step'], available: true },
                ],
              },
            },
          ],
        },
      },
    });

    const manifest = buildGltfComponentManifest(bytes, { sourceFile: 'src/main.ts', geometryHash: 'hash-1' });
    const root = manifest.nodesById['root']!;
    const component = manifest.nodesById['component:gearbox_housing']!;

    expect(manifest.rootId).toBe('root');
    expect(root.childIds).toEqual(['component:gearbox_housing']);
    expect(manifest.extensionUsed).toBe(tauCadTopologyExtension);
    expect(component.name).toBe('gearbox_housing');
    expect(component.bounds).toMatchObject({
      min: [-1, -2, -3],
      max: [4, 5, 6],
      center: [1.5, 1.5, 1.5],
    });
    expect(component.bounds?.radius).toEqual(expect.any(Number));
    expect(component.capabilities.hasPreciseTopology).toBe(true);
    expect(component.reference).toMatchObject({
      scheme: 'tau-cad',
      filePath: 'src/main.ts',
      componentId: 'component:gearbox_housing',
      selector: 'node/0',
      geometryHash: 'hash-1',
    });
  });

  it('should build nested body and face components from primitive topology refs', () => {
    const bodyId = 'component:zoo-solid-0';
    const firstFaceId = 'component:zoo-solid-0:face-0';
    const secondFaceId = 'component:zoo-solid-0:face-1';
    const bytes = encodeJson({
      nodes: [{ name: 'Solid 1', mesh: 0 }],
      meshes: [
        {
          primitives: [
            { attributes: { [positionAttribute]: 0 }, material: 0 },
            { attributes: { [positionAttribute]: 1 }, material: 1 },
          ],
        },
      ],
      accessors: [
        { componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 1] },
        { componentType: 5126, count: 3, type: 'VEC3', min: [2, 0, 0], max: [3, 1, 1] },
      ],
      materials: [
        { name: 'gray', pbrMetallicRoughness: { baseColorFactor: [0.5, 0.5, 0.5, 1] } },
        { name: 'blue', pbrMetallicRoughness: { baseColorFactor: [0, 0, 1, 1] } },
      ],
      extensions: {
        [tauCadTopologyExtension]: {
          components: [
            {
              id: bodyId,
              name: 'Solid 1',
              kind: 'body',
              selector: 'kittycad/solid/0',
              childIds: [firstFaceId, secondFaceId],
              primitiveRefs: [
                { nodeIndex: 0, meshIndex: 0, primitiveIndex: 0 },
                { nodeIndex: 0, meshIndex: 0, primitiveIndex: 1 },
              ],
              capabilities: { hasPreciseTopology: true },
            },
            {
              id: firstFaceId,
              name: 'Face 1',
              kind: 'face',
              selector: 'kittycad/solid/0/face/0',
              parentId: bodyId,
              primitiveRefs: [{ nodeIndex: 0, meshIndex: 0, primitiveIndex: 0 }],
              sourceRefs: { edgeIndices: [0, 1, 2, 3] },
            },
            {
              id: secondFaceId,
              name: 'Face 2',
              kind: 'face',
              selector: 'kittycad/solid/0/face/1',
              parentId: bodyId,
              primitiveRefs: [{ nodeIndex: 0, meshIndex: 0, primitiveIndex: 1 }],
            },
          ],
        },
      },
    });

    const manifest = buildGltfComponentManifest(bytes);

    expect(manifest.nodesById['root']?.childIds).toEqual([bodyId]);
    expect(manifest.nodesById[bodyId]).toMatchObject({
      kind: 'body',
      childIds: [firstFaceId, secondFaceId],
      primitiveRefs: [
        { nodeIndex: 0, meshIndex: 0, primitiveIndex: 0 },
        { nodeIndex: 0, meshIndex: 0, primitiveIndex: 1 },
      ],
      bounds: { min: [0, 0, 0], max: [3, 1, 1], center: [1.5, 0.5, 0.5] },
    });
    expect(manifest.nodesById[firstFaceId]).toMatchObject({
      parentId: bodyId,
      kind: 'face',
      primitiveRefs: [{ nodeIndex: 0, meshIndex: 0, primitiveIndex: 0 }],
      materialIndices: [0],
      extras: { edgeIndices: [0, 1, 2, 3] },
    });
    expect(manifest.nodesById[secondFaceId]).toMatchObject({
      parentId: bodyId,
      kind: 'face',
      primitiveRefs: [{ nodeIndex: 0, meshIndex: 0, primitiveIndex: 1 }],
      materialIndices: [1],
      bounds: { min: [2, 0, 0], max: [3, 1, 1], center: [2.5, 0.5, 0.5] },
    });
  });

  it('places topology primitive references by their node instance, including a mirrored sibling', () => {
    const bytes = encodeJson({
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [
        { translation: [5, 0, 0], children: [1, 2] },
        { mesh: 0, translation: [2, 0, 0] },
        { mesh: 0, matrix: [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 20, 0, 0, 1] },
      ],
      meshes: [{ primitives: [{ attributes: { [positionAttribute]: 0 } }] }],
      accessors: [{ componentType: 5126, count: 3, type: 'VEC3', min: [1, 2, 3], max: [4, 5, 6] }],
      extensions: {
        [tauCadTopologyExtension]: {
          components: [
            { id: 'first', kind: 'part', primitiveRefs: [{ nodeIndex: 1, meshIndex: 0, primitiveIndex: 0 }] },
            { id: 'mirrored', kind: 'part', primitiveRefs: [{ nodeIndex: 2, meshIndex: 0, primitiveIndex: 0 }] },
          ],
        },
      },
    });

    const manifest = buildGltfComponentManifest(bytes);
    expect(manifest.nodesById['first']?.bounds).toMatchObject({
      min: [8, 2, 3],
      max: [11, 5, 6],
      center: [9.5, 3.5, 4.5],
    });
    expect(manifest.nodesById['mirrored']?.bounds).toMatchObject({
      min: [21, 2, 3],
      max: [24, 5, 6],
      center: [22.5, 3.5, 4.5],
    });
  });

  it('should create mesh-only fallback components for unannotated glTF nodes', () => {
    const bytes = encodeJson({
      nodes: [{ name: 'planet_gear', mesh: 0 }],
      meshes: [{ primitives: [{ attributes: { [positionAttribute]: 0 }, material: 0 }] }],
      accessors: [{ componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 1] }],
      materials: [{ name: 'blue' }],
    });

    const manifest = buildGltfComponentManifest(bytes, { sourceFile: 'src/main.ts' });
    const root = manifest.nodesById['root']!;
    const componentId = root.childIds[0]!;
    const component = manifest.nodesById[componentId]!;

    expect(component.id).toBe('component:node-0');
    expect(component.kind).toBe('part');
    expect(component.capabilities.exports).toEqual([
      { fidelity: 'mesh', formats: ['glb', 'stl'], available: true },
      {
        fidelity: 'brep',
        formats: ['step', 'stp', 'brep', 'dxf'],
        available: false,
        reason: 'Precise topology is not available for this component.',
      },
    ]);
  });

  it.each([false, true])(
    'should place shared-mesh occurrence bounds through nested transforms with topology=%s',
    (withTopology) => {
      const bytes = encodeJson({
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [
          { name: 'Assembly', translation: [10, 20, 30], children: [1, 2] },
          {
            name: 'Left bolt',
            mesh: 0,
            translation: [1, 2, 3],
            rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2],
            scale: [2, 3, 4],
          },
          { name: 'Right bolt', mesh: 0, matrix: [0, 2, 0, 0, -3, 0, 0, 0, 0, 0, 4, 0, -5, 0, 0, 1] },
        ],
        meshes: [{ name: 'Bolt prototype', primitives: [{ attributes: { [positionAttribute]: 0 } }] }],
        accessors: [{ componentType: 5126, count: 8, type: 'VEC3', min: [0, 0, 0], max: [1, 2, 3] }],
        ...(withTopology
          ? {
              extensions: {
                [tauCadTopologyExtension]: {
                  components: [
                    { id: 'left', name: 'Left bolt', nodeIndex: 1, meshIndex: 0, primitiveIndices: [0], kind: 'part' },
                    {
                      id: 'right',
                      name: 'Right bolt',
                      primitiveRefs: [{ nodeIndex: 2, meshIndex: 0, primitiveIndex: 0 }],
                      kind: 'part',
                    },
                  ],
                },
              },
            }
          : {}),
      });
      const manifest = buildGltfComponentManifest(bytes);
      const left = manifest.nodesById[withTopology ? 'left' : 'component:node-1']!;
      const right = manifest.nodesById[withTopology ? 'right' : 'component:node-2']!;
      expect(left.name).toBe('Left bolt');
      expect(right.name).toBe('Right bolt');
      expect(left.primitiveRefs).toEqual([{ nodeIndex: 1, meshIndex: 0, primitiveIndex: 0 }]);
      expect(right.primitiveRefs).toEqual([{ nodeIndex: 2, meshIndex: 0, primitiveIndex: 0 }]);
      for (const [actual, expected] of [
        [left.bounds!.min, [5, 22, 33]],
        [left.bounds!.max, [11, 24, 45]],
        [left.bounds!.center, [8, 23, 39]],
        [right.bounds!.min, [-1, 20, 30]],
        [right.bounds!.max, [5, 22, 42]],
      ]) {
        for (const axis of [0, 1, 2]) {
          expect(actual![axis]).toBeCloseTo(expected![axis]!, 12);
        }
      }
      expect(left.bounds!.radius).toBeCloseTo(Math.sqrt(46), 12);
      if (!withTopology) {
        const parentBounds = manifest.nodesById['component:node-0']!.bounds!;
        for (const axis of [0, 1, 2]) {
          expect(parentBounds.min[axis]).toBeCloseTo([-1, 20, 30][axis]!, 12);
          expect(parentBounds.max[axis]).toBeCloseTo([11, 24, 45][axis]!, 12);
        }
      }
    },
  );

  it('should preserve standard glTF hierarchy including named meshless parents', () => {
    const bytes = encodeJson({
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [
        { name: 'Assembly', children: [1] },
        { name: 'Roof Frame', mesh: 0 },
      ],
      meshes: [{ primitives: [{ attributes: { [positionAttribute]: 0 }, material: 0 }] }],
      accessors: [{ componentType: 5126, count: 3, type: 'VEC3', min: [1, 2, 3], max: [4, 5, 6] }],
      materials: [
        {
          name: 'roof paint',
          pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1] },
        },
      ],
    });

    const manifest = buildGltfComponentManifest(bytes, { sourceFile: 'main.scad' });
    const assembly = manifest.nodesById['component:node-0']!;
    const roof = manifest.nodesById['component:node-1']!;

    expect(manifest.nodesById['root']?.childIds).toEqual(['component:node-0']);
    expect(manifest.nodeOrder).toEqual(['root', 'component:node-0', 'component:node-1']);
    expect(assembly).toMatchObject({
      name: 'Assembly',
      parentId: 'root',
      childIds: ['component:node-1'],
      depth: 1,
      path: ['Model', 'Assembly'],
      primitiveRefs: [],
      materialIndices: [0],
      bounds: { min: [1, 2, 3], max: [4, 5, 6], center: [2.5, 3.5, 4.5] },
      appearance: { color: '#ff0000', colors: ['#ff0000'], materialNames: ['roof paint'] },
    });
    expect(roof).toMatchObject({
      parentId: 'component:node-0',
      childIds: [],
      depth: 2,
      path: ['Model', 'Assembly', 'Roof Frame'],
      primitiveRefs: [{ nodeIndex: 1, meshIndex: 0, primitiveIndex: 0 }],
    });
  });

  it('places fallback mesh bounds through nested translation and negative nonuniform scale', () => {
    const bytes = encodeJson({
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [
        { name: 'Assembly', translation: [10, 20, 30], children: [1] },
        { name: 'Part', mesh: 0, translation: [2, 3, 4], scale: [-1, 2, 1] },
      ],
      meshes: [{ primitives: [{ attributes: { [positionAttribute]: 0 } }] }],
      accessors: [{ componentType: 5126, count: 3, type: 'VEC3', min: [1, 2, 3], max: [4, 5, 6] }],
    });

    const manifest = buildGltfComponentManifest(bytes);
    const bounds = { min: [8, 27, 37], max: [11, 33, 40], center: [9.5, 30, 38.5] };
    expect(manifest.nodesById['component:node-1']?.bounds).toMatchObject(bounds);
    expect(manifest.nodesById['component:node-0']?.bounds).toMatchObject(bounds);
  });

  it('should keep parent direct primitives distinct while aggregating descendant bounds and appearance', () => {
    const bytes = encodeJson({
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [
        { name: 'Parent', mesh: 0, children: [1] },
        { name: 'Child', mesh: 1 },
      ],
      meshes: [
        { primitives: [{ attributes: { [positionAttribute]: 0 }, material: 0 }] },
        { primitives: [{ attributes: { [positionAttribute]: 1 }, material: 1 }] },
      ],
      accessors: [
        { componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 1] },
        { componentType: 5126, count: 3, type: 'VEC3', min: [5, 0, 0], max: [6, 1, 1] },
      ],
      materials: [
        { name: 'red', pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1] } },
        { name: 'blue', pbrMetallicRoughness: { baseColorFactor: [0, 0, 1, 1] } },
      ],
    });

    const manifest = buildGltfComponentManifest(bytes);
    expect(manifest.nodesById['component:node-0']).toMatchObject({
      childIds: ['component:node-1'],
      primitiveRefs: [{ nodeIndex: 0, meshIndex: 0, primitiveIndex: 0 }],
      materialIndices: [0, 1],
      bounds: { min: [0, 0, 0], max: [6, 1, 1], center: [3, 0.5, 0.5] },
      appearance: { color: '#ff0000', colors: ['#ff0000', '#0000ff'], materialNames: ['red', 'blue'] },
    });
    expect(manifest.nodesById['component:node-1']?.primitiveRefs).toEqual([
      { nodeIndex: 1, meshIndex: 1, primitiveIndex: 0 },
    ]);
  });

  it('should expose component appearance from GLTF material base colors', () => {
    const bytes = encodeJson({
      nodes: [{ name: 'sun_gear', mesh: 0 }],
      meshes: [
        {
          primitives: [
            { attributes: { [positionAttribute]: 0 }, material: 0 },
            { attributes: { [positionAttribute]: 0 }, material: 1 },
          ],
        },
      ],
      accessors: [{ componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 1] }],
      materials: [
        {
          name: 'red paint',
          pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1] },
        },
        {
          name: 'blue paint',
          pbrMetallicRoughness: { baseColorFactor: [0, 0, 1, 1] },
        },
      ],
    });

    const manifest = buildGltfComponentManifest(bytes, { sourceFile: 'src/main.ts' });
    const component = manifest.nodesById['component:node-0']!;

    expect(component.appearance).toEqual({
      color: '#ff0000',
      colors: ['#ff0000', '#0000ff'],
      materialNames: ['red paint', 'blue paint'],
      materials: [
        { materialIndex: 0, name: 'red paint', color: '#ff0000' },
        { materialIndex: 1, name: 'blue paint', color: '#0000ff' },
      ],
    });
  });

  it('should preserve explicit PBR factors while excluding native line materials from surface metadata', () => {
    const manifest = buildGltfComponentManifest(
      encodeJson({
        nodes: [{ name: 'Carrier', mesh: 0 }],
        meshes: [{ primitives: [{ material: 0 }, { material: 1, mode: 1 }] }],
        materials: [
          {
            pbrMetallicRoughness: {
              baseColorFactor: [0.021219010376003555, 0.1119324278369056, 0.24620132670783548, 1],
              metallicFactor: 0.65,
              roughnessFactor: 0.32,
            },
          },
          {
            name: 'BRep edges',
            pbrMetallicRoughness: { baseColorFactor: [0, 0, 0, 1], metallicFactor: 0, roughnessFactor: 1 },
            extensions: { [unlitExtension]: {} },
          },
        ],
      }),
    );
    const appearance = manifest.nodesById['component:node-0']?.appearance;

    expect(appearance).toEqual({
      color: '#285e88',
      colors: ['#285e88', '#000000'],
      materialNames: ['BRep edges'],
      materials: [{ materialIndex: 0, color: '#285e88', metalness: 0.65, roughness: 0.32 }],
    });
  });

  it.each([false, true])('should aggregate mixed descendant surface factors with topology=%s', (withTopology) => {
    const manifest = buildGltfComponentManifest(
      encodeJson({
        nodes: [
          { name: 'Assembly', children: [1, 2] },
          { name: 'Left', mesh: 0 },
          { name: 'Right', mesh: 1 },
        ],
        meshes: [{ primitives: [{ material: 0 }] }, { primitives: [{ material: 1 }] }],
        materials: [
          { pbrMetallicRoughness: { metallicFactor: 0.2, roughnessFactor: 0.35 } },
          { pbrMetallicRoughness: { metallicFactor: 0.8, roughnessFactor: 0.35 } },
        ],
        ...(withTopology
          ? {
              extensions: {
                [tauCadTopologyExtension]: {
                  components: [
                    { id: 'assembly', nodeIndex: 0, childIds: ['left', 'right'] },
                    { id: 'left', nodeIndex: 1, parentId: 'assembly' },
                    { id: 'right', nodeIndex: 2, parentId: 'assembly' },
                  ],
                },
              },
            }
          : {}),
      }),
    );

    const expected = [
      { materialIndex: 0, metalness: 0.2, roughness: 0.35 },
      { materialIndex: 1, metalness: 0.8, roughness: 0.35 },
    ];
    const assembly = manifest.nodesById[withTopology ? 'assembly' : 'component:node-0'];
    expect(assembly?.appearance?.materials).toEqual(expected);
    expect(manifest.nodesById[manifest.rootId]?.appearance?.materials).toEqual(expected);
  });

  it('should distinguish omitted factors, explicit defaults and unavailable factors', () => {
    const manifest = buildGltfComponentManifest(
      encodeJson({
        nodes: [{ mesh: 0 }],
        meshes: [{ primitives: [{ material: 0 }, { material: 1 }, {}, { material: 2 }, { material: 99 }] }],
        materials: [
          {},
          { pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 1, roughnessFactor: 1 } },
          { pbrMetallicRoughness: { baseColorFactor: [2, 0, 0, 1], metallicFactor: -1, roughnessFactor: 2 } },
        ],
      }),
    );

    expect(manifest.nodesById['component:node-0']?.appearance?.materials).toEqual([
      { materialIndex: 0 },
      { materialIndex: 1, color: '#ffffff', metalness: 1, roughness: 1 },
      {},
      { materialIndex: 2, color: 'unavailable', metalness: 'unavailable', roughness: 'unavailable' },
      { materialIndex: 99, color: 'unavailable', metalness: 'unavailable', roughness: 'unavailable' },
    ]);
  });

  it('should retain an unlit surface marker without treating line-only components as PBR surfaces', () => {
    const manifest = buildGltfComponentManifest(
      encodeJson({
        nodes: [{ mesh: 0 }, { mesh: 1 }],
        meshes: [{ primitives: [{ material: 0 }] }, { primitives: [{ material: 0, mode: 1 }] }],
        materials: [{ extensions: { [unlitExtension]: {} } }],
      }),
    );

    expect(manifest.nodesById['component:node-0']?.appearance?.materials).toEqual([
      { materialIndex: 0, extensions: { [unlitExtension]: {} }, isUnlit: true },
    ]);
    expect(manifest.nodesById['component:node-1']?.appearance?.materials).toBeUndefined();
  });

  it('should preserve duplicate source names and distinct texture and extension descriptors per material index', () => {
    const textureTransformExtension = 'KHR_texture_transform';
    const clearcoatExtension = 'KHR_materials_clearcoat';
    const transmissionExtension = 'KHR_materials_transmission';
    const manifest = buildGltfComponentManifest(
      encodeJson({
        nodes: [{ name: 'Part', mesh: 0 }],
        meshes: [{ primitives: [{ material: 0 }, { material: 1 }, { material: 2 }, { material: 3, mode: 0 }] }],
        materials: [
          {
            name: 'woven',
            pbrMetallicRoughness: {
              baseColorTexture: {
                index: 2,
                texCoord: 1,
                extensions: { [textureTransformExtension]: { offset: [0.2, 0.3] } },
              },
              metallicRoughnessTexture: { index: 3 },
              metallicFactor: 0.4,
            },
            normalTexture: { index: 4, scale: 0.8 },
            extensions: { [clearcoatExtension]: { clearcoatFactor: 0.7 } },
          },
          {
            name: 'woven',
            pbrMetallicRoughness: { baseColorTexture: { index: 5 } },
            occlusionTexture: { index: 6, strength: 0.5 },
            emissiveTexture: { index: 7 },
            extensions: { [transmissionExtension]: { transmissionFactor: 0.6 } },
          },
          { name: '', pbrMetallicRoughness: { roughnessFactor: 0.9 } },
          { name: 'point only', emissiveTexture: { index: 8 } },
        ],
      }),
    );
    const materials = manifest.nodesById['component:node-0']?.appearance?.materials;

    expect(materials).toEqual([
      {
        materialIndex: 0,
        name: 'woven',
        metalness: 0.4,
        textures: {
          baseColor: { index: 2, texCoord: 1, extensions: { [textureTransformExtension]: { offset: [0.2, 0.3] } } },
          metallicRoughness: { index: 3 },
          normal: { index: 4, scale: 0.8 },
        },
        extensions: { [clearcoatExtension]: { clearcoatFactor: 0.7 } },
      },
      {
        materialIndex: 1,
        name: 'woven',
        textures: { baseColor: { index: 5 }, occlusion: { index: 6, strength: 0.5 }, emissive: { index: 7 } },
        extensions: { [transmissionExtension]: { transmissionFactor: 0.6 } },
      },
      { materialIndex: 2, roughness: 0.9 },
    ]);
    expect(manifest.nodesById['component:node-0']?.appearance?.materialNames).toEqual(['woven', 'point only']);
  });

  it('should create separate fallback components for each named node in a multi-node glTF', () => {
    const bytes = encodeJson({
      nodes: [
        { name: 'Housing', mesh: 0 },
        { name: 'Sun Gear', mesh: 1 },
        { name: 'Planet Gear 1', mesh: 2 },
      ],
      meshes: [
        { primitives: [{ attributes: { [positionAttribute]: 0 }, material: 0 }] },
        { primitives: [{ attributes: { [positionAttribute]: 1 }, material: 1 }] },
        { primitives: [{ attributes: { [positionAttribute]: 2 }, material: 2 }] },
      ],
      accessors: [
        { componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 1] },
        { componentType: 5126, count: 3, type: 'VEC3', min: [2, 0, 0], max: [3, 1, 1] },
        { componentType: 5126, count: 3, type: 'VEC3', min: [4, 0, 0], max: [5, 1, 1] },
      ],
      materials: [{ name: 'gray' }, { name: 'gold' }, { name: 'blue' }],
    });

    const manifest = buildGltfComponentManifest(bytes, { sourceFile: 'main.ts', geometryHash: 'assembly-hash' });
    const root = manifest.nodesById['root']!;

    expect(root.childIds).toEqual(['component:node-0', 'component:node-1', 'component:node-2']);
    expect(manifest.nodeOrder).toEqual(['root', ...root.childIds]);
    expect(manifest.nodesById['component:node-0']?.name).toBe('Housing');
    expect(manifest.nodesById['component:node-1']?.reference).toMatchObject({
      filePath: 'main.ts',
      componentId: 'component:node-1',
      selector: 'node/1',
      geometryHash: 'assembly-hash',
      label: 'Sun Gear',
    });
    expect(manifest.nodesById['component:node-2']?.bounds).toMatchObject({
      min: [4, 0, 0],
      max: [5, 1, 1],
      center: [4.5, 0.5, 0.5],
    });
  });

  it('should prefer topology id over tauComponentId and generated fallback ids', () => {
    const bytes = encodeJson({
      nodes: [
        {
          name: 'From node',
          mesh: 0,
          extras: { tauComponentId: 'component:from-node-extra' },
        },
      ],
      meshes: [{ primitives: [{ attributes: { [positionAttribute]: 0 }, material: 0 }] }],
      accessors: [{ componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 1] }],
      materials: [{ name: 'gray' }],
      extensions: {
        [tauCadTopologyExtension]: {
          components: [{ id: 'component:from-topology', nodeIndex: 0, name: 'From topology' }],
        },
      },
    });

    const manifest = buildGltfComponentManifest(bytes);

    expect(manifest.nodesById['root']?.childIds).toEqual(['component:from-topology']);
    expect(manifest.nodesById['component:from-topology']?.name).toBe('From topology');
  });

  it('should fallback to tauComponentId before generated ids', () => {
    const bytes = encodeJson({
      nodes: [{ name: 'From node', mesh: 0, extras: { tauComponentId: 'component:from-node-extra' } }],
      meshes: [{ primitives: [{ attributes: { [positionAttribute]: 0 }, material: 0 }] }],
      accessors: [{ componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 1] }],
      materials: [{ name: 'gray' }],
    });

    const manifest = buildGltfComponentManifest(bytes);

    expect(manifest.nodesById['root']?.childIds).toEqual(['component:from-node-extra']);
  });

  it('should create generated fallback component ids from node payload addresses', () => {
    const bytes = encodeJson({
      nodes: [
        { name: 'Shape', mesh: 0, extras: { tauComponentSelector: 'selector/shared' } },
        { name: 'Shape', mesh: 0, extras: { tauComponentSelector: 'selector/shared' } },
      ],
      meshes: [{ primitives: [{ attributes: { [positionAttribute]: 0 }, material: 0 }] }],
      accessors: [{ componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 1] }],
      materials: [{ name: 'gray' }],
    });

    const manifest = buildGltfComponentManifest(bytes);

    expect(manifest.nodesById['root']?.childIds).toEqual(['component:node-0', 'component:node-1']);
  });

  it('should not expose duplicate persistent identity fields in parser nodes', () => {
    const bytes = encodeJson({
      nodes: [{ name: 'Shape', mesh: 0 }],
      meshes: [{ primitives: [{ attributes: { [positionAttribute]: 0 }, material: 0 }] }],
      accessors: [{ componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 1] }],
      materials: [{ name: 'gray' }],
    });

    const manifest = buildGltfComponentManifest(bytes, { sourceFile: 'src/main.ts' });
    const component = manifest.nodesById[manifest.nodesById['root']!.childIds[0]!]!;

    expect(component).not.toHaveProperty(duplicateDurableIdField);
    expect(component).not.toHaveProperty(duplicateDurableKeyField);
    expect(component.reference).not.toHaveProperty(duplicateDurableIdField);
    expect(component.reference).not.toHaveProperty(duplicateDurableKeyField);
  });
  describe('mechanism', () => {
    const hinge = {
      schemaVersion: 1,
      units: { length: 'm', angle: 'deg' },
      root: 'base',
      links: { base: { components: ['component:base'] }, lid: { components: ['component:lid'] } },
      joints: { hinge: { type: 'revolute', parent: 'base', child: 'lid', origin: [0, 0.02, 0], axis: [1, 0, 0] } },
    };
    const hingedGltf = (mechanism: unknown): Uint8Array<ArrayBuffer> =>
      encodeJson({
        nodes: [
          { name: 'Base', mesh: 0 },
          { name: 'Lid', mesh: 0 },
        ],
        meshes: [{ primitives: [{}] }],
        extensions: {
          [tauCadTopologyExtension]: {
            components: [
              { id: 'component:base', name: 'Base', kind: 'part', selector: 'node/0', nodeIndex: 0 },
              { id: 'component:lid', name: 'Lid', kind: 'part', selector: 'node/1', nodeIndex: 1 },
            ],
            mechanism,
          },
        },
      });

    it('should attach the admitted topology mechanism to the manifest', () => {
      const manifest = buildGltfComponentManifest(hingedGltf(hinge));

      expect(manifest.nodeOrder).toEqual(['root', 'component:base', 'component:lid']);
      expect(manifest.mechanism).toMatchObject(hinge);
    });

    it('should drop an invalid topology mechanism with a warning and keep the components', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      try {
        const manifest = buildGltfComponentManifest(hingedGltf({ ...hinge, units: { length: 'cm', angle: 'deg' } }));

        expect(manifest.nodeOrder).toEqual(['root', 'component:base', 'component:lid']);
        expect(manifest.mechanism).toBeUndefined();
        expect(warn).toHaveBeenCalledWith(
          expect.stringMatching(/^Ignoring the TAU_cad_topology mechanism: \/units/),
          expect.arrayContaining([expect.objectContaining({ code: 'INVALID_UNIT' })]),
        );
      } finally {
        warn.mockRestore();
      }
    });

    it('should drop a mechanism whose links name components the payload does not declare', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      try {
        const manifest = buildGltfComponentManifest(
          hingedGltf({ ...hinge, links: { ...hinge.links, lid: { components: ['component:missing'] } } }),
        );

        expect(manifest.nodeOrder).toEqual(['root', 'component:base', 'component:lid']);
        expect(manifest.mechanism).toBeUndefined();
        expect(warn).toHaveBeenCalledWith(expect.stringMatching(/undeclared components component:missing$/));
      } finally {
        warn.mockRestore();
      }
    });
  });
});
