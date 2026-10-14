import { describe, expect, it } from 'vitest';
import type { GeometryComponentManifest, GeometryComponentNode } from '@taucad/types';
import { buildGeometryComponentReference } from '#graphics/metadata/geometry-component-reference.js';

const capabilities: GeometryComponentManifest['capabilities'] = {
  canHide: true,
  canIsolate: true,
  canFocus: true,
  canAdjustOpacity: true,
  hasDrawings: false,
  hasPreciseTopology: false,
  exports: [{ fidelity: 'mesh', formats: ['glb'], available: true }],
};

const node: GeometryComponentNode = {
  id: 'component:first',
  name: 'Planetary housing',
  kind: 'part',
  selector: 'node/0',
  parentId: 'root',
  childIds: [],
  depth: 1,
  path: ['Model', 'Planetary housing'],
  meshNodeIndices: [0],
  primitiveIndices: [0],
  materialIndices: [0],
  capabilities,
};

const createManifest = (sourceFile?: string, geometryHash?: string): GeometryComponentManifest => ({
  schemaVersion: 1,
  sourceFile,
  geometryHash,
  rootId: 'root',
  nodeOrder: ['root', node.id],
  capabilities,
  nodesById: {
    root: {
      id: 'root',
      name: 'Model',
      kind: 'model',
      selector: 'root',
      childIds: [node.id],
      depth: 0,
      path: ['Model'],
      meshNodeIndices: [],
      primitiveIndices: [],
      materialIndices: [],
      capabilities,
    },
    [node.id]: node,
  },
});

describe('buildGeometryComponentReference', () => {
  it('should build a reference from the manifest when the node carries none', () => {
    expect(buildGeometryComponentReference(createManifest('src/main.ts', 'hash-1'), node)).toEqual({
      scheme: 'tau-cad',
      filePath: 'src/main.ts',
      componentId: 'component:first',
      selector: 'node/0',
      geometryHash: 'hash-1',
      label: 'Planetary housing',
      kind: 'part',
    });
  });

  it('should return no reference when the geometry has no source file', () => {
    expect(buildGeometryComponentReference(createManifest(), node)).toBeUndefined();
  });

  it('should prefer the reference the kernel attached to the node', () => {
    const reference = {
      scheme: 'tau-cad',
      filePath: 'parts/housing.ts',
      componentId: 'housing',
      selector: 'node/7',
      label: 'Housing',
      kind: 'part',
    } as const;
    expect(buildGeometryComponentReference(createManifest('src/main.ts'), { ...node, reference })).toBe(reference);
  });
});
