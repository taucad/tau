// @vitest-environment node
import { createHash } from 'node:crypto';
import { FXAAEffect } from 'postprocessing';
import { DataTexture } from 'three';
import { texture } from 'three/tsl';
import { NodeMaterial } from 'three/webgpu';
import { expect, it } from 'vitest';
import { createViewportFxaa } from '#graphics/three/fxaa.js';
import { serialiseStrippedTslGraph } from '#graphics/three/utils/tsl-node-graph-snapshot.js';

it('should guard the exact classic FXAA source and quality contract paired with the node port', () => {
  const effect = new FXAAEffect();
  try {
    expect(createHash('sha256').update(effect.getFragmentShader()).digest('hex')).toBe(
      'b6ddc9692edf7c10244521bcf82fd1ff17e4aaa9032e17e1d84228b99cdbc6f0',
    );
    /* eslint-disable @typescript-eslint/naming-convention -- Exact upstream GLSL preprocessor define names. */
    expect(Object.fromEntries(effect.defines)).toEqual({
      EDGE_THRESHOLD_MIN: '0.0312',
      EDGE_THRESHOLD_MAX: '0.125',
      SUBPIXEL_QUALITY: '0.75',
      SAMPLES: '12',
    });
    /* eslint-enable @typescript-eslint/naming-convention -- End upstream preprocessor names. */
  } finally {
    effect.dispose();
  }
});

it('should preserve the resource-free FXAA graph for a caller-owned color input', () => {
  const input = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  const material = new NodeMaterial();
  try {
    material.fragmentNode = createViewportFxaa(texture(input));
    expect(serialiseStrippedTslGraph(material.toJSON())).toMatchSnapshot();
  } finally {
    material.dispose();
    input.dispose();
  }
});
