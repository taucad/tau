import { describe, expect, it } from 'vitest';
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
});
