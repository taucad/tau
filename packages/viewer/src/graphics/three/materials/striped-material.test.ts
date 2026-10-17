// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  createVertexColoredStripedMaterial,
  createVertexColoredStripedMaterialForBackend,
  setVertexColoredStripedMaterialStripes,
} from '#graphics/three/materials/striped-material.js';
import { serialiseStrippedTslGraph } from '#graphics/three/utils/tsl-node-graph-snapshot.js';

const currentDirectory = fileURLToPath(new URL('.', import.meta.url));

describe('section cap stripes', () => {
  it('should read the plane coordinates and colours per vertex, after the clipping chunks', () => {
    const material = createVertexColoredStripedMaterial({ stripeFrequency: 3, stripeWidth: 0.5 });
    for (const name of ['aPlaneUv', 'aCapBaseColor', 'aCapStripeColor', 'aCapStripeAxis']) {
      expect(material.vertexShader).toContain(
        `attribute ${name === 'aPlaneUv' || name === 'aCapStripeAxis' ? 'vec2' : 'vec3'} ${name};`,
      );
    }
    // The section clip composes after these anchors, the surface bias replaces the log-depth chunk.
    for (const chunk of ['#include <clipping_planes_vertex>', '#include <logdepthbuf_vertex>']) {
      expect(material.vertexShader.split(chunk)).toHaveLength(2);
    }
    for (const chunk of ['#include <clipping_planes_fragment>', '#include <logdepthbuf_fragment>']) {
      expect(material.fragmentShader.split(chunk)).toHaveLength(2);
    }
    expect(material.fragmentShader).toContain('fwidth(pattern)');
    expect(material.uniforms['uStripeFrequency']!.value).toBe(3);
  });

  it('should restripe in place on both backends, without a new program or pipeline', () => {
    for (const backend of ['webgl', 'webgpu'] as const) {
      const material = createVertexColoredStripedMaterialForBackend(backend);
      expect(material instanceof MeshBasicNodeMaterial).toBe(backend === 'webgpu');
      const { version } = material;
      setVertexColoredStripedMaterialStripes(material, { stripeFrequency: 5, stripeWidth: 0.1 });
      expect(material.version).toBe(version);
      if (material instanceof THREE.ShaderMaterial) {
        expect(material.uniforms['uStripeWidth']!.value).toBe(0.1);
      }
    }
    expect(() => {
      setVertexColoredStripedMaterialStripes(new MeshBasicNodeMaterial(), { stripeFrequency: 1, stripeWidth: 1 });
    }).toThrow('Not a section-cap node material.');
  });

  it('matches stable stripped section cap node material JSON snapshot', async () => {
    const material = createVertexColoredStripedMaterialForBackend('webgpu');
    await expect(serialiseStrippedTslGraph(material.toJSON())).toMatchFileSnapshot(
      join(currentDirectory, '__shader-snapshots__', 'section-cap-stripes-node-material.json'),
    );
  });
});
