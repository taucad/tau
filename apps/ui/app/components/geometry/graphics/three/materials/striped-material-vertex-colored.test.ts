// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  createVertexColoredSectionCapMaterial,
  disposeVertexColoredSectionCapMaterialCache,
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
