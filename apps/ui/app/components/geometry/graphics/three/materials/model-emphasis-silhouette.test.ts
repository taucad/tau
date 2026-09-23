// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataTexture } from 'three';
import {
  silhouetteAlpha,
  silhouetteEdgeStrength,
  silhouetteHiddenAlphaScale,
  silhouetteHoverAlpha,
  silhouetteSelectedAlpha,
  silhouetteTapDistance,
  silhouetteTapOffsets,
  silhouetteVisibility,
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
const visible: [number, number] = [1, 1];
const hidden: [number, number] = [0, 0];

describe('emphasis silhouette semantics', () => {
  it('draws the outline only where mask coverage changes', () => {
    const inside: [number, number] = [1, 0];
    expect(silhouetteEdgeStrength(inside, [inside, inside, inside, inside])).toEqual([0, 0]);
    expect(silhouetteAlpha([0, 0], visible)).toBe(0);

    // Boundary pixel: one neighbour outside the hovered coverage.
    expect(silhouetteEdgeStrength(inside, [inside, [0, 0], inside, inside])).toEqual([1, 0]);
    // The pixel just outside sees the same edge, so the line straddles the boundary.
    expect(silhouetteEdgeStrength([0, 0], [inside, [0, 0], [0, 0], [0, 0]])).toEqual([1, 0]);
    expect(silhouetteAlpha([1, 0], visible)).toBe(silhouetteHoverAlpha);
    expect(silhouetteAlpha([0, 1], visible)).toBe(silhouetteSelectedAlpha);
    expect(silhouetteAlpha([1, 1], visible)).toBe(silhouetteSelectedAlpha);
    expect(silhouetteHoverAlpha).toBeLessThan(silhouetteSelectedAlpha);
    expect(silhouetteTapOffsets).toHaveLength(4);
  });

  it('keeps the middle of the line solid where multisampled coverage is fractional', () => {
    // The pixel the boundary crosses resolves to part coverage, with a tap on either side of it.
    // Measured against the centre alone that pixel reads half strength and the line goes hollow.
    const straddling: [number, number] = [0.5, 0];
    expect(silhouetteEdgeStrength(straddling, [[1, 0], [0, 0], straddling, straddling])).toEqual([1, 0]);
    // The outer rows still fade with the resolved fraction, which is the antialiasing.
    expect(silhouetteEdgeStrength([0, 0], [straddling, [0, 0], [0, 0], [0, 0]])).toEqual([0.5, 0]);
  });

  it('dims the boundary only where the part is hidden behind the frame', () => {
    // Same edge, two visibilities: the hidden one keeps the colour at a fraction of the strength.
    expect(silhouetteAlpha([0, 1], hidden)).toBe(silhouetteSelectedAlpha * silhouetteHiddenAlphaScale);
    expect(silhouetteAlpha([1, 0], hidden)).toBe(silhouetteHoverAlpha * silhouetteHiddenAlphaScale);
    expect(silhouetteHiddenAlphaScale).toBeGreaterThan(0);
    expect(silhouetteHiddenAlphaScale).toBeLessThan(1);

    // An edge pixel straddles the boundary, so the covered side decides for the whole line.
    expect(silhouetteVisibility(hidden, [hidden, [0, 1], hidden, hidden])).toEqual([0, 1]);
    expect(silhouetteVisibility(hidden, [hidden, hidden, hidden, hidden])).toEqual(hidden);
    expect(silhouetteAlpha([0, 1], silhouetteVisibility(hidden, [hidden, [0, 1], hidden, hidden]))).toBe(
      silhouetteSelectedAlpha,
    );
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
    // Coverage decides where the line goes (RG); visibility decides how strong it is (BA).
    expect(webgl.fragmentShader).toContain('vec2 edge = high - low;');
    expect(webgl.fragmentShader).toContain('max(visible, tap.ba)');
    expect(webgl.uniforms.hiddenAlphaScale.value).toBe(silhouetteHiddenAlphaScale);

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
