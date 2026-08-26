import { describe, expect, it } from 'vitest';
import type { GeometryGltf, GeometrySvg } from '@taucad/types';
import { finalizeRenderOutput, RenderArtifactFinalizationError } from '#framework/render-artifact-finalizer.js';

const expectFinalizationError = ({
  operation,
  code,
  message,
}: {
  operation: () => void;
  code: string;
  message: string;
}): void => {
  try {
    operation();
    expect.fail('should have thrown a render artifact finalization error');
  } catch (error) {
    expect(error).toBeInstanceOf(RenderArtifactFinalizationError);
    expect((error as Error).message).toBe(message);
    expect((error as RenderArtifactFinalizationError).issues).toMatchObject([
      {
        code,
        message,
        severity: 'error',
        type: 'runtime',
      },
    ]);
  }
};

const createSvgArtifact = (): GeometrySvg => ({
  format: 'svg',
  content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0"/></svg>',
});

const createGltfArtifact = (): GeometryGltf => ({ format: 'gltf', content: new Uint8Array([0x67, 0x6c, 0x54, 0x46]) });

describe('finalizeRenderOutput', () => {
  it('accepts glTF geometry artifacts', () => {
    const nativeHandle = { kind: 'empty-render' };
    const result = finalizeRenderOutput({
      artifacts: [createGltfArtifact()],
      nativeHandle,
    });

    expect(result.geometry?.format).toBe('gltf');
    if (result.geometry?.format !== 'gltf') {
      throw new Error(`Expected glTF geometry, received ${result.geometry?.format}`);
    }
    expect(result.geometry.content.byteLength).toBeGreaterThan(0);
    expect(result.nativeHandle).toBe(nativeHandle);
  });

  it('still rejects kernels that produce no public artifact', () => {
    expect(() => finalizeRenderOutput({ artifacts: [], nativeHandle: null })).toThrow(RenderArtifactFinalizationError);
  });

  it('should still reject multiple public artifacts with the same format', () => {
    const svg = createSvgArtifact();

    expectFinalizationError({
      operation: () => finalizeRenderOutput({ artifacts: [svg, svg], nativeHandle: null }),
      code: 'MULTI_RENDER_ARTIFACT_UNSUPPORTED',
      message: 'Kernel render produced multiple public geometry artifacts.',
    });
  });

  it('should still reject mixed public artifact formats', () => {
    const svg = createSvgArtifact();

    expectFinalizationError({
      operation: () => finalizeRenderOutput({ artifacts: [createGltfArtifact(), svg], nativeHandle: null }),
      code: 'MIXED_RENDER_OUTPUT_UNSUPPORTED',
      message: 'Kernel render produced mixed public geometry formats.',
    });
  });
});
