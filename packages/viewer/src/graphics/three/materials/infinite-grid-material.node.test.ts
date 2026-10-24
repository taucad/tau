// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NormalBlending } from 'three';
import { infiniteGridNodeMaterial } from '#graphics/three/materials/infinite-grid-material.node.js';
import { serialiseStrippedTslGraph } from '#graphics/three/utils/tsl-node-graph-snapshot.js';

const currentDirectory = fileURLToPath(new URL('.', import.meta.url));

describe('infiniteGridNodeMaterial TSL snapshots', () => {
  it('should blend into retained color without a viewport-copy output graph', () => {
    const material = infiniteGridNodeMaterial();
    try {
      expect(material.outputNode).toBeNull();
      expect(material.blending).toBe(NormalBlending);
      expect(material.depthTest).toBe(true);
      expect(material.depthWrite).toBe(false);
    } finally {
      material.dispose();
    }
  });
  it('matches stable stripped material JSON snapshot', async () => {
    const material = infiniteGridNodeMaterial({
      smallSize: 2,
      largeSize: 50,
      axes: 'xzy',
      smallThickness: 1.25,
      largeThickness: 2,
      gridDistance: 80,
      planeOffset: -12,
      smallPhase: [0.25, 0.75],
      largePhase: [0.125, 0.625],
    });

    const serialised = serialiseStrippedTslGraph(material.toJSON());

    await expect(serialised).toMatchFileSnapshot(
      join(currentDirectory, '__shader-snapshots__', 'infinite-grid-node-material.json'),
    );
  });
});
