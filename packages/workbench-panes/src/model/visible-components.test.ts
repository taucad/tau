import { describe, expect, it } from 'vitest';
import type { GeometryComponentNode } from '@taucad/types';
import { getVisibleModelComponents } from '#model/visible-components.js';
import { createManifest, createNode } from '#model/model.test-utils.jsx';

describe('Model component projection', () => {
  it('should retain traversal order and matching ancestors without unrelated descendants', () => {
    const parent = createNode('assembly', 'Nozzle');
    const child = createNode('tube', 'Cooling tube');
    const sibling = createNode('wall', 'Hot wall');
    parent.childIds = [child.id, sibling.id];
    child.parentId = parent.id;
    child.depth = 2;
    sibling.parentId = parent.id;
    sibling.depth = 2;
    const manifest = createManifest([parent, child, sibling]);
    manifest.nodesById['root']!.childIds = [parent.id];
    expect(getVisibleModelComponents(manifest, '').map((node) => node.id)).toEqual(['assembly', 'tube', 'wall']);
    expect(getVisibleModelComponents(manifest, 'cooling').map((node) => node.id)).toEqual(['assembly', 'tube']);
    expect(getVisibleModelComponents(manifest, 'nozzle').map((node) => node.id)).toEqual(['assembly']);
    expect(getVisibleModelComponents(manifest, 'absent')).toEqual([]);
  });

  it('should leave face components out of the tree', () => {
    const body = createNode('body', 'Solid 1');
    const face: GeometryComponentNode = { ...createNode('face', 'Face 1'), kind: 'face', parentId: body.id, depth: 2 };
    body.childIds = [face.id];
    const manifest = createManifest([body, face]);
    manifest.nodesById['root']!.childIds = [body.id];
    expect(getVisibleModelComponents(manifest, '').map((node) => node.id)).toEqual(['body']);
    expect(getVisibleModelComponents(manifest, 'face')).toEqual([]);
  });
});
