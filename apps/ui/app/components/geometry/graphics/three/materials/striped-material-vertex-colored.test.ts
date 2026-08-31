// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  createVertexColoredSectionCapMaterial,
  disposeVertexColoredSectionCapMaterialCache,
  markVertexColoredSectionCapMaterialInUse,
} from '#components/geometry/graphics/three/materials/striped-material-vertex-colored.js';
import { createVertexColoredStripedMaterial } from '#components/geometry/graphics/three/materials/striped-material.js';
import { getSectionCapDepthBias } from '#components/geometry/graphics/three/materials/section-cap-depth-state.js';
import { serialiseStrippedTslGraph } from '#components/geometry/graphics/three/utils/tsl-node-graph-snapshot.js';

const currentDirectory = fileURLToPath(new URL('.', import.meta.url));

afterEach(() => {
  disposeVertexColoredSectionCapMaterialCache();
});

describe('createVertexColoredSectionCapMaterial', () => {
  it('should reuse cached materials for stable backend and stripe settings', () => {
    const first = createVertexColoredSectionCapMaterial('webgl', {
      stripeFrequency: 2,
      stripeWidth: 0.2,
      stripeAngle: Math.PI / 4,
    });
    const second = createVertexColoredSectionCapMaterial('webgl', {
      stripeFrequency: 2,
      stripeWidth: 0.2,
      stripeAngle: Math.PI / 2,
    });

    expect(second).toBe(first);
  });

  it('should not evict an in-use material even when it is the LRU-oldest', () => {
    // Oldest entry, but pinned in-use (bound to a live mesh).
    const pinned = createVertexColoredSectionCapMaterial('webgl', { stripeFrequency: 0, stripeWidth: 0 });
    markVertexColoredSectionCapMaterialInUse('webgl', { stripeFrequency: 0, stripeWidth: 0 }, true);
    const disposePinned = vi.spyOn(pinned, 'dispose');

    // Second-oldest, unpinned: the eviction victim once the cache overflows.
    const stale = createVertexColoredSectionCapMaterial('webgl', { stripeFrequency: 1, stripeWidth: 1 });
    const disposeStale = vi.spyOn(stale, 'dispose');

    // Fill to exactly capacity (16 total: pinned + stale + 14 fillers). No
    // eviction yet — the guard only fires once an insert would exceed capacity.
    for (let index = 2; index <= 15; index++) {
      createVertexColoredSectionCapMaterial('webgl', { stripeFrequency: index, stripeWidth: index });
    }

    // This 17th distinct key overflows and must evict the oldest *evictable*
    // entry (stale), skipping the pinned one.
    createVertexColoredSectionCapMaterial('webgl', { stripeFrequency: 99, stripeWidth: 99 });

    expect(disposePinned).not.toHaveBeenCalled();
    expect(disposeStale).toHaveBeenCalledTimes(1);
  });

  it('keeps a shared material pinned until every live mesh releases it', () => {
    const properties = { stripeFrequency: 0, stripeWidth: 0 };
    const shared = createVertexColoredSectionCapMaterial('webgl', properties);
    markVertexColoredSectionCapMaterialInUse('webgl', properties, true);
    markVertexColoredSectionCapMaterialInUse('webgl', properties, true);
    markVertexColoredSectionCapMaterialInUse('webgl', properties, false);
    const disposeShared = vi.spyOn(shared, 'dispose');

    for (let index = 1; index <= 16; index++) {
      createVertexColoredSectionCapMaterial('webgl', { stripeFrequency: index, stripeWidth: index });
    }

    expect(disposeShared).not.toHaveBeenCalled();
  });

  it('should create opaque depth-owned WebGL cap materials with vertex-color attributes', () => {
    const material = createVertexColoredStripedMaterial({ stripeFrequency: 2, stripeWidth: 0.2 });
    const bias = getSectionCapDepthBias('webgl');

    expect(material.transparent).toBe(false);
    expect(material.depthTest).toBe(true);
    expect(material.depthWrite).toBe(true);
    expect(material.polygonOffsetFactor).toBe(bias.polygonOffsetFactor);
    expect(material.vertexShader).toContain('attribute vec3 aCapBaseColor');
    expect(material.vertexShader).toContain('attribute vec3 aCapStripeColor');
    expect(material.vertexShader).toContain('attribute float aCapPatternStrength');
    expect(material.vertexShader).toContain('attribute vec2 aCapStripeAxis');
    expect(material.fragmentShader).toContain('dot(vSurfacePos, vCapStripeAxis)');
    expect(material.fragmentShader).toContain('mix(vCapBaseColor, stripedColor');
    expect(material.fragmentShader).not.toContain('uniform float uStripeAngle');
    expect(material.fragmentShader).toContain('#include <colorspace_fragment>');
  });

  it('should create opaque depth-owned WebGPU cap materials', () => {
    const material = createVertexColoredSectionCapMaterial('webgpu', {
      stripeFrequency: 2,
      stripeWidth: 0.2,
    });
    const bias = getSectionCapDepthBias('webgpu');

    expect(material).toBeInstanceOf(MeshBasicNodeMaterial);
    expect(material.transparent).toBe(false);
    expect(material.depthTest).toBe(true);
    expect(material.depthWrite).toBe(true);
    expect(material.polygonOffsetFactor).toBe(bias.polygonOffsetFactor);
  });

  it('should match the stable stripped vertex-colored WebGPU node material graph', async () => {
    const material = createVertexColoredSectionCapMaterial('webgpu', {
      stripeFrequency: 2.7,
      stripeWidth: 0.18,
    });
    const serialised = serialiseStrippedTslGraph(material.toJSON());

    await expect(serialised).toMatchFileSnapshot(
      join(currentDirectory, '__shader-snapshots__', 'striped-node-material-vertex-colored.json'),
    );
  });
});
