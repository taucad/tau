import { expect, it } from 'vitest';
import {
  AlwaysDepth,
  DepthStencilFormat,
  DepthTexture,
  FloatType,
  RenderTarget,
  REVISION,
  UnsignedInt248Type,
} from 'three';
import { NodeMaterial, QuadMesh, WebGLBackend, WebGPUBackend, WebGPURenderer } from 'three/webgpu';
import { float, texture, vec4 } from 'three/tsl';

// Characterization, not a qualification gate: native's invalid binding is retained
// as an explicit blocker. Remove that expectation only with a verified upstream fix.
it.each(['webgpu', 'webgl2'] as const)('characterizes r184 depth/stencil sampling on %s', async (execution) => {
  expect(REVISION).toBe('184');
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Match the public Three renderer option.
  const renderer = new WebGPURenderer({ forceWebGL: execution === 'webgl2', antialias: false });
  await renderer.init();
  expect(renderer.backend).toBeInstanceOf(execution === 'webgpu' ? WebGPUBackend : WebGLBackend);
  // Installed Three declarations omit the native device surface.
  const observedBackend = renderer.backend as typeof renderer.backend & {
    device: {
      addEventListener: (type: 'uncapturederror', listener: (event: GPUUncapturedErrorEvent) => void) => void;
      removeEventListener: (type: 'uncapturederror', listener: (event: GPUUncapturedErrorEvent) => void) => void;
      queue: { onSubmittedWorkDone: () => Promise<void> };
    };
  };
  const device = execution === 'webgpu' ? observedBackend.device : undefined;
  const errors: string[] = [];
  const observe = (event: GPUUncapturedErrorEvent): void => {
    errors.push(event.error.message);
  };
  device?.addEventListener('uncapturederror', observe);
  const depth = new DepthTexture(16, 16, execution === 'webgpu' ? FloatType : UnsignedInt248Type);
  depth.format = DepthStencilFormat;
  const source = new RenderTarget(16, 16, { depthTexture: depth, stencilBuffer: true });
  const destination = new RenderTarget(16, 16, { depthBuffer: false });
  const write = new NodeMaterial();
  write.fragmentNode = vec4(1);
  write.depthNode = float(0.375);
  write.depthFunc = AlwaysDepth;
  const read = new NodeMaterial();
  read.fragmentNode = vec4(texture(depth).r, 0, 0, 1);
  read.depthTest = false;
  read.depthWrite = false;
  try {
    if (device) {
      expect(renderer.hasFeature('depth32float-stencil8')).toBe(true);
    }
    renderer.setRenderTarget(source);
    new QuadMesh(write).render(renderer);
    renderer.setRenderTarget(destination);
    new QuadMesh(read).render(renderer);
    const pixels = await renderer.readRenderTargetPixelsAsync(destination, 0, 0, 16, 16);
    await device?.queue.onSubmittedWorkDone();
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
    if (execution === 'webgpu') {
      expect(errors.some((message) => message.includes('Multiple aspects'))).toBe(true);
    } else {
      expect(errors).toEqual([]);
      expect((renderer.getContext() as WebGL2RenderingContext).getError()).toBe(0);
      expect(Math.abs(Number(pixels[0]) - 96)).toBeLessThanOrEqual(1);
    }
  } finally {
    device?.removeEventListener('uncapturederror', observe);
    source.dispose();
    destination.dispose();
    write.dispose();
    read.dispose();
    renderer.dispose();
  }
});
