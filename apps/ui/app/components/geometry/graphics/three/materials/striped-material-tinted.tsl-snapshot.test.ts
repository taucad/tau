// @vitest-environment node
import { describe, expect, it, afterEach } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createTintedStripedMaterial,
  disposeTintedStripedMaterialCache,
} from '#components/geometry/graphics/three/materials/striped-material-tinted.js';
import { serialiseStrippedTslGraph } from '#components/geometry/graphics/three/utils/tsl-node-graph-snapshot.js';

const currentDirectory = fileURLToPath(new URL('.', import.meta.url));

afterEach(() => {
  disposeTintedStripedMaterialCache();
});

describe('createTintedStripedMaterial TSL snapshots', () => {
  it('matches stable stripped tinted node material JSON snapshot', async () => {
    const material = createTintedStripedMaterial('webgpu', {
      tintColor: 0x44_aa_99,
      stripeFrequency: 2.7,
      stripeWidth: 0.18,
    });

    const serialised = serialiseStrippedTslGraph(material.toJSON());

    await expect(serialised).toMatchFileSnapshot(
      join(currentDirectory, '__shader-snapshots__', 'striped-node-material-tinted.json'),
    );
  });
});
