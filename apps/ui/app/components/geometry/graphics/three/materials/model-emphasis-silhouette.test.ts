// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataTexture } from 'three';
import {
  silhouetteAlpha,
  silhouetteEdgeStrength,
  silhouetteHoverAlpha,
  silhouetteSelectedAlpha,
  silhouetteTapDistance,
  silhouetteTapOffsets,
} from '#components/geometry/graphics/three/materials/model-emphasis-silhouette.js';
import {
  createWebGlSilhouetteMaterial,
  setWebGlSilhouetteMaskSize,
} from '#components/geometry/graphics/three/materials/model-emphasis-silhouette.material.js';
import {
  createWebGpuSilhouetteMaterial,
  setWebGpuSilhouetteMaskSize,
} from '#components/geometry/graphics/three/materials/model-emphasis-silhouette.node.js';
import { serialiseStrippedTslGraph } from '#components/geometry/graphics/three/utils/tsl-node-graph-snapshot.js';

const currentDirectory = fileURLToPath(new URL('.', import.meta.url));
const maskTexture = (): DataTexture => new DataTexture(new Uint8Array(4), 1, 1);

describe('emphasis silhouette semantics', () => {
  it('draws the outline only where mask coverage changes', () => {
    const inside: [number, number] = [1, 0];
    expect(silhouetteEdgeStrength(inside, [inside, inside, inside, inside])).toEqual([0, 0]);
    expect(silhouetteAlpha([0, 0])).toBe(0);

    // Boundary pixel: one neighbour outside the hovered coverage.
    expect(silhouetteEdgeStrength(inside, [inside, [0, 0], inside, inside])).toEqual([1, 0]);
    // The pixel just outside sees the same edge, so the line straddles the boundary.
    expect(silhouetteEdgeStrength([0, 0], [inside, [0, 0], [0, 0], [0, 0]])).toEqual([1, 0]);
    expect(silhouetteAlpha([1, 0])).toBe(silhouetteHoverAlpha);
    expect(silhouetteAlpha([0, 1])).toBe(silhouetteSelectedAlpha);
    expect(silhouetteAlpha([1, 1])).toBe(silhouetteSelectedAlpha);
    expect(silhouetteHoverAlpha).toBeLessThan(silhouetteSelectedAlpha);
    expect(silhouetteTapOffsets).toHaveLength(4);
  });

  it('samples both backends at the shared tap distance in texel units', () => {
    const webgl = createWebGlSilhouetteMaterial(maskTexture());
    setWebGlSilhouetteMaskSize(webgl, { width: 200, height: 100, pixelRatio: 2 });
    expect(silhouetteTapDistance(2)).toBe(2);
    expect(webgl.uniforms.texelSize.value.x).toBeCloseTo(2 / 200);
    expect(webgl.uniforms.texelSize.value.y).toBeCloseTo(2 / 100);
    expect(webgl.fragmentShader.match(/texture2D\(maskTexture, vUv \+ texelSize/g)).toHaveLength(
      silhouetteTapOffsets.length,
    );
    expect([webgl.transparent, webgl.depthTest, webgl.depthWrite]).toEqual([true, false, false]);

    const webgpu = createWebGpuSilhouetteMaterial(maskTexture());
    setWebGpuSilhouetteMaskSize(webgpu, { width: 200, height: 100, pixelRatio: 1 });
    expect(silhouetteTapDistance(1)).toBe(1);
    expect(webgpu.silhouetteTexelSize.value.x).toBeCloseTo(1 / 200);
    expect(webgpu.silhouetteTexelSize.value.y).toBeCloseTo(1 / 100);
    expect([webgpu.transparent, webgpu.depthTest, webgpu.depthWrite]).toEqual([true, false, false]);
  });

  it('matches stable stripped silhouette node material JSON snapshot', async () => {
    const material = createWebGpuSilhouetteMaterial(maskTexture());
    await expect(serialiseStrippedTslGraph(material.toJSON())).toMatchFileSnapshot(
      join(currentDirectory, '__shader-snapshots__', 'model-emphasis-silhouette-node-material.json'),
    );
  });
});
