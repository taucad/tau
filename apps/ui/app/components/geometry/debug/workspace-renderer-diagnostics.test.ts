import { expect, it, vi } from 'vitest';
import type { Vector2 } from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { getWorkspaceRendererIdentity } from '#components/geometry/debug/workspace-renderer-diagnostics.js';

it('should report the WebGL2 backend of a node renderer and actual buffer', () => {
  const canvas = document.createElement('canvas');
  canvas.width = 5120;
  canvas.height = 2880;
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Three constructor option.
  const renderer = new WebGPURenderer({ canvas, forceWebGL: true });
  Object.assign(renderer.info, { frame: 12 });
  Object.assign(renderer.info.render, { calls: 30 });
  vi.spyOn(renderer, 'getSize').mockImplementation((target: Vector2) => target.set(2560, 1440));
  vi.spyOn(renderer, 'getPixelRatio').mockReturnValue(2);
  expect(getWorkspaceRendererIdentity(renderer)).toMatchObject({
    api: 'webgl',
    effectiveBackend: 'webgl2-node',
    drawingBuffer: { width: 5120, height: 2880 },
    cssSize: { width: 2560, height: 1440 },
    pixelRatio: 2,
    frame: 12,
  });
  canvas.width = 2560;
  canvas.height = 1440;
  expect(getWorkspaceRendererIdentity(renderer).drawingBuffer).toEqual({ width: 2560, height: 1440 });
});

it('should distinguish native WebGPU from the forced node WebGL2 backend', () => {
  const renderer = new WebGPURenderer({ canvas: document.createElement('canvas') });
  expect(getWorkspaceRendererIdentity(renderer)).toMatchObject({ api: 'webgpu', effectiveBackend: 'webgpu-native' });
});
