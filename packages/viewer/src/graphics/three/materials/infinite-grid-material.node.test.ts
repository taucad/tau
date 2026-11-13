// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NormalBlending } from 'three';
import { gltfEdgeLineWidth } from '#graphics/three/materials/gltf-edges.js';
import { gltfSurfacePolygonOffset } from '#graphics/three/materials/gltf-surface-depth-bias.js';
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
  it('should sit behind a coplanar part face on the reversed-depth viewport', () => {
    const material = infiniteGridNodeMaterial();
    try {
      // The deepest surface bias the viewport applies, at a pixel ratio of 6 (reversed depth: negative is farther).
      const surfaceFactor = -(gltfEdgeLineWidth * 0.5 * 6 + 0.5);
      expect(material.polygonOffset).toBe(true);
      expect(material.polygonOffsetFactor).toBeLessThan(surfaceFactor);
      expect(material.polygonOffsetUnits).toBeLessThan(gltfSurfacePolygonOffset.webgpu.polygonOffsetUnits);
    } finally {
      material.dispose();
    }
  });
  it('should centre the proxy on the view target uniform, not the camera position', () => {
    const source = readFileSync(join(currentDirectory, 'infinite-grid-material.node.ts'), 'utf8');

    expect(source).not.toContain('cameraPosition');
    expect(source).toContain('add(uGridCenter, mul(positionLocal.xy, uGridDistance))');
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
