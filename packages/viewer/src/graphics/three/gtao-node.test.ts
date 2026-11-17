// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataTexture, PerspectiveCamera, REVISION, RedFormat, RenderTarget } from 'three';
import { NodeMaterial } from 'three/webgpu';
import { sample, texture, vec4 } from 'three/tsl';
import { gtao } from '#graphics/three/gtao-node.js';

const createInputs = (): { depth: DataTexture; node: ReturnType<typeof gtao> } => {
  const depth = new DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  const node = gtao(
    sample((uv) => texture(depth).sample(uv)),
    sample(() => vec4(0, 0, 1, 1)),
    new PerspectiveCamera(),
  );
  return { depth, node };
};

describe('gtao', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should stay pinned to the three release it copies', () => {
    // The gtao-node.ts module copies three r184's GTAONode. Upgrading three means deleting it and returning to three's own
    // `ao()` node (Tau Brain research/three-upgrade-tech-debt.md § 2), not editing this version.
    expect(REVISION).toBe('184');
  });

  it('should expose the smooth falloff with the r184 defaults for every other uniform', () => {
    const { depth, node } = createInputs();
    try {
      expect(node.falloffEnd.value).toBe(22);
      expect(node.falloffRange.value).toBe(0.8);
      expect(node.radius.value).toBe(0.25);
      expect(node.thickness.value).toBe(1);
      expect(node.distanceExponent.value).toBe(1);
      expect(node.distanceFallOff.value).toBe(1);
      expect(node.scale.value).toBe(1);
      expect(node.samples.value).toBe(16);
      expect(node.resolutionScale).toBe(1);
      expect(node.useTemporalFiltering).toBe(false);
      expect(node.getTextureNode().value.format).toBe(RedFormat);
    } finally {
      node.dispose();
      depth.dispose();
    }
  });

  it('should scale its AO target by the resolution scale', () => {
    const { depth, node } = createInputs();
    try {
      node.resolutionScale = 0.5;
      node.setSize(301, 200);
      expect(node.resolution.value.toArray()).toEqual([151, 100]);
      expect(node.getTextureNode().value.image).toMatchObject({ width: 151, height: 100 });
    } finally {
      node.dispose();
      depth.dispose();
    }
  });

  it('should release its target, material and noise texture once, and keep caller-owned inputs alive', () => {
    const { depth, node } = createInputs();
    const textureDispose = vi.spyOn(DataTexture.prototype, 'dispose');
    const targetDispose = vi.spyOn(RenderTarget.prototype, 'dispose');
    const materialDispose = vi.spyOn(NodeMaterial.prototype, 'dispose');
    node.dispose();
    try {
      // Three r184's GTAONode.dispose leaks the 5x5 magic-square noise texture; this copy releases it.
      expect(textureDispose).toHaveBeenCalledOnce();
      expect(textureDispose.mock.contexts[0]).not.toBe(depth);
      expect((textureDispose.mock.contexts[0] as DataTexture).image).toMatchObject({ width: 5, height: 5 });
      expect(targetDispose).toHaveBeenCalledOnce();
      expect(materialDispose).toHaveBeenCalledOnce();
    } finally {
      depth.dispose();
    }
  });
});
