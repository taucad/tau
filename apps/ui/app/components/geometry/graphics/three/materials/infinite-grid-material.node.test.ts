// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { infiniteGridNodeMaterial } from '#components/geometry/graphics/three/materials/infinite-grid-material.node.js';
import { serialiseStrippedTslGraph } from '#components/geometry/graphics/three/utils/tsl-node-graph-snapshot.js';

const currentDirectory = fileURLToPath(new URL('.', import.meta.url));

describe('infiniteGridNodeMaterial TSL snapshots', () => {
  it('matches stable stripped material JSON snapshot', async () => {
    const material = infiniteGridNodeMaterial({
      smallSize: 2,
      largeSize: 50,
      axes: 'xzy',
      smallThickness: 1.25,
      largeThickness: 2,
      minGridDistance: 8,
      gridDistanceMultiplier: 18,
    });

    const serialised = serialiseStrippedTslGraph(material.toJSON());

    await expect(serialised).toMatchFileSnapshot(
      join(currentDirectory, '__shader-snapshots__', 'infinite-grid-node-material.json'),
    );
  });
});
