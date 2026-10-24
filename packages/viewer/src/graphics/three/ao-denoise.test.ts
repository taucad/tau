// @vitest-environment node
import { it, expect } from 'vitest';
import { DataTexture, PerspectiveCamera } from 'three';
import { NodeMaterial } from 'three/webgpu';
import { texture, sample, screenUV, vec4 } from 'three/tsl';
import { createAoDenoise } from '#graphics/three/ao-denoise.js';
import { serialiseStrippedTslGraph } from '#graphics/three/utils/tsl-node-graph-snapshot.js';

it.each(['denoise', 'upsample'] as const)('should preserve the deterministic depth and normal %s graph', (stage) => {
  const input = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  const material = new NodeMaterial();
  try {
    const filter = createAoDenoise({
      texture: texture(input),
      depth: sample((uv) => texture(input).sample(uv)),
      normal: sample(() => vec4(0, 0, 1, 1)),
      camera: new PerspectiveCamera(),
    });
    material.fragmentNode =
      stage === 'denoise' ? filter.visibility(screenUV) : filter.upsample(texture(input), screenUV);
    expect(serialiseStrippedTslGraph(material.toJSON())).toMatchSnapshot();
  } finally {
    material.dispose();
    input.dispose();
  }
});
