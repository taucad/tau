// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStripedNodeMaterial } from '#components/geometry/graphics/three/materials/striped-material.node.js';
import { serialiseStrippedTslGraph } from '#components/geometry/graphics/three/utils/tsl-node-graph-snapshot.js';

const currentDirectory = fileURLToPath(new URL('.', import.meta.url));

describe('createStripedNodeMaterial TSL snapshots', () => {
  it('matches stable stripped material JSON snapshot', async () => {
    const material = createStripedNodeMaterial({
      stripeFrequency: 3,
      stripeWidth: 0.2,
      baseColor: 0xff_00_ff,
      stripeColor: 0x00_ff_00,
    });

    const serialised = serialiseStrippedTslGraph(material.toJSON());

    await expect(serialised).toMatchFileSnapshot(
      join(currentDirectory, '__shader-snapshots__', 'striped-node-material.json'),
    );
  });
});
