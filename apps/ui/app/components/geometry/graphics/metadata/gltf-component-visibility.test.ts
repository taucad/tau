import { describe, expect, it } from 'vitest';
import type {
  GeometryComponentCapabilities,
  GeometryComponentManifest,
  GeometryComponentNode,
  GeometryComponentPrimitiveRef,
} from '@taucad/types';
import { filterVisibleGltfPrimitives } from '#components/geometry/graphics/metadata/gltf-component-visibility.js';

const capabilities: GeometryComponentCapabilities = {
  canHide: true,
  canIsolate: true,
  canFocus: true,
  canAdjustOpacity: true,
  hasDrawings: false,
  hasPreciseTopology: true,
  exports: [],
};

const component = (id: string, options: Partial<GeometryComponentNode> = {}): GeometryComponentNode => ({
  id,
  name: id,
  kind: 'part',
  selector: id,
  childIds: [],
  depth: 1,
  path: ['Model', id],
  meshNodeIndices: [],
  primitiveIndices: [],
  materialIndices: [],
  capabilities,
  ...options,
});

const surfaceA = { nodeIndex: 0, meshIndex: 0, primitiveIndex: 0 } as const;
const lineA = { nodeIndex: 0, meshIndex: 0, primitiveIndex: 1 } as const;
const surfaceB = { nodeIndex: 1, meshIndex: 0, primitiveIndex: 0 } as const;
const unowned = { nodeIndex: 9, meshIndex: 9, primitiveIndex: 0 } as const;

const manifest: GeometryComponentManifest = {
  schemaVersion: 1,
  rootId: 'root',
  nodeOrder: ['root', 'assembly', 'face-a', 'instance-b'],
  capabilities,
  nodesById: {
    root: component('root', { kind: 'model', childIds: ['assembly', 'instance-b'], depth: 0, path: ['Model'] }),
    assembly: component('assembly', { parentId: 'root', childIds: ['face-a'], meshNodeIndices: [0] }),
    'face-a': component('face-a', {
      kind: 'face',
      parentId: 'assembly',
      depth: 2,
      path: ['Model', 'assembly', 'face-a'],
      primitiveRefs: [surfaceA],
    }),
    'instance-b': component('instance-b', {
      parentId: 'root',
      meshNodeIndices: [1],
      primitiveRefs: [surfaceB],
    }),
  },
};

const filter = (
  hiddenComponentIds: readonly string[],
  isolatedComponentIds: readonly string[],
  primitives: readonly GeometryComponentPrimitiveRef[] = [surfaceA, lineA, surfaceB],
): GeometryComponentPrimitiveRef[] =>
  filterVisibleGltfPrimitives({ primitives, manifest, hiddenComponentIds, isolatedComponentIds });

describe('filterVisibleGltfPrimitives', () => {
  it('should share viewer ancestor hide and isolation semantics', () => {
    expect(filter(['assembly'], [])).toEqual([surfaceB]);
    expect(filter([], ['assembly'])).toEqual([surfaceA, lineA]);
    expect(filter([], ['face-a'])).toEqual([surfaceA, lineA]);
  });

  it('should disambiguate shared mesh instances by source node', () => {
    expect(filter(['instance-b'], [])).toEqual([surfaceA, lineA]);
    expect(filter(['face-a'], [])).toEqual([lineA, surfaceB]);
  });

  it('should apply node ownership to authored lines absent from face topology', () => {
    expect(filter(['assembly'], [], [lineA])).toEqual([]);
    expect(filter([], ['assembly'], [lineA])).toEqual([lineA]);
  });

  it('should retain primitives with no semantic owner', () => {
    expect(filter(['assembly'], [], [unowned])).toEqual([unowned]);
  });
});
