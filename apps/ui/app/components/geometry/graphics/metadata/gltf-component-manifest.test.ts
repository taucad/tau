import { describe, expect, it } from 'vitest';
import { tauCadTopologyExtension } from '@taucad/types/constants';
import { buildGltfComponentManifest } from '#components/geometry/graphics/metadata/gltf-component-manifest.js';

const positionAttribute = 'POSITION';
const duplicateDurableIdField = `persistent${'Id'}` as const;
const duplicateDurableKeyField = `persistent${'Key'}` as const;

function encodeJson(value: unknown): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(JSON.stringify(value));
}

describe('buildGltfComponentManifest', () => {
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
        formats: ['step', 'stp', 'iges', 'igs', 'brep', 'dxf'],
        available: false,
        reason: 'Precise topology is not available for this component.',
      },
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
    });
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
});
