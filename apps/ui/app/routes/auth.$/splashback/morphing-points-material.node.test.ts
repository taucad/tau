// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMorphingPointsNodeMaterial } from '#routes/auth.$/splashback/morphing-points-material.node.js';
import { serialiseStrippedTslGraph } from '#components/geometry/graphics/three/utils/tsl-node-graph-snapshot.js';

const currentDirectory = fileURLToPath(new URL('.', import.meta.url));

describe('createMorphingPointsNodeMaterial TSL snapshots', () => {
  it('matches stable stripped points node material snapshot', async () => {
    const { material } = createMorphingPointsNodeMaterial({
      color: '#3366ff',
      targetColor: '#ff6633',
      pointSize: 3,
      explosionStrength: 1.5,
      opacity: 0.9,
    });

    const serialised = serialiseStrippedTslGraph(material.toJSON());

    await expect(serialised).toMatchFileSnapshot(
      join(currentDirectory, '__shader-snapshots__', 'morphing-points-node-material.json'),
    );
  });
});
