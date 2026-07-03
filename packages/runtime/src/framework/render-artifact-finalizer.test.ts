import { describe, expect, it } from 'vitest';
import { finalizeRenderOutput, RenderArtifactFinalizationError } from '#framework/render-artifact-finalizer.js';
import { createEmptyGltfGeometry } from '#utils/glb-writer.js';

describe('finalizeRenderOutput', () => {
  it('accepts canonical empty GLB geometry artifacts', () => {
    const nativeHandle = { kind: 'empty-render' };
    const result = finalizeRenderOutput({
      artifacts: [createEmptyGltfGeometry()],
      nativeHandle,
    });

    expect(result.geometry.format).toBe('gltf');
    if (result.geometry.format !== 'gltf') {
      throw new Error(`Expected glTF geometry, received ${result.geometry.format}`);
    }
    expect(result.geometry.content.byteLength).toBeGreaterThan(0);
    expect(result.nativeHandle).toBe(nativeHandle);
  });

  it('still rejects kernels that produce no public artifact', () => {
    expect(() => finalizeRenderOutput({ artifacts: [], nativeHandle: null })).toThrow(RenderArtifactFinalizationError);
  });
});
