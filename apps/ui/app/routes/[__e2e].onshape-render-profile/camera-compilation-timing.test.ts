import { expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { MeshStandardMaterial } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { createCameraCompilationTiming } from '#routes/[__e2e].onshape-render-profile/camera-compilation-timing.js';

it('measures only synchronous builds and restores the backend without changing results or exceptions', () => {
  const renderer = mock<WebGPURenderer>();
  const backend = mock<WebGPURenderer['backend']>();
  renderer.backend = backend;
  const builder = mock<ReturnType<typeof backend.createNodeBuilder>>();
  builder.build.mockReturnValue(builder);
  const originalBuild = builder.build;
  backend.createNodeBuilder.mockReturnValue(builder);
  const original = backend.createNodeBuilder;
  const clock = vi.spyOn(performance, 'now');
  clock.mockReturnValueOnce(10).mockReturnValueOnce(13);
  const timing = createCameraCompilationTiming(renderer);
  const renderObject = mock<Parameters<typeof original>[0]>({ material: new MeshStandardMaterial() });
  const built = backend.createNodeBuilder(renderObject, renderer);
  try {
    expect(built.build()).toBe(builder);
    expect(timing.read()).toEqual({
      builds: 1,
      milliseconds: 3,
      materials: ['MeshStandardMaterial'],
      pipelineCalls: 0,
      pipelineMilliseconds: 0,
    });
    timing.reset();
    expect(timing.read()).toEqual({
      builds: 0,
      milliseconds: 0,
      materials: [],
      pipelineCalls: 0,
      pipelineMilliseconds: 0,
    });
    clock.mockReturnValueOnce(20).mockReturnValueOnce(25);
    const failure = new Error('node build failed');
    originalBuild.mockImplementationOnce(() => {
      throw failure;
    });
    expect(() => built.build()).toThrow(failure);
    expect(timing.read()).toEqual({
      builds: 1,
      milliseconds: 5,
      materials: ['MeshStandardMaterial'],
      pipelineCalls: 0,
      pipelineMilliseconds: 0,
    });
    timing.dispose();
    expect(backend.createNodeBuilder).toBe(original);
    expect(built.build()).toBe(builder);
    expect(timing.read()).toEqual({
      builds: 1,
      milliseconds: 5,
      materials: ['MeshStandardMaterial'],
      pipelineCalls: 0,
      pipelineMilliseconds: 0,
    });
  } finally {
    timing.dispose();
    clock.mockRestore();
  }
});

it.each([false, true])('preserves pipeline calls and failures with source capture=%s', (captureSources) => {
  const renderer = mock<WebGPURenderer>();
  const backend = mock<WebGPURenderer['backend'] & { createRenderPipeline: (...args: unknown[]) => void }>();
  renderer.backend = backend;
  const original = backend.createRenderPipeline;
  const timing = createCameraCompilationTiming(renderer, captureSources);
  const clock = vi.spyOn(performance, 'now').mockReturnValueOnce(10).mockReturnValueOnce(17);
  const object = mock<Parameters<typeof backend.createNodeBuilder>[0]>();
  const promises: Array<Promise<void>> = [];
  const wrapped = backend.createRenderPipeline;
  try {
    backend.createRenderPipeline(object, promises);
    expect(original).toHaveBeenCalledWith(object, promises);
    expect(timing.read()).toMatchObject({ pipelineCalls: 1, pipelineMilliseconds: 7 });
    timing.reset();
    expect(timing.read()).toMatchObject({ pipelineCalls: 0, pipelineMilliseconds: 0 });
    const failure = new Error('pipeline setup failed');
    original.mockImplementationOnce(() => {
      throw failure;
    });
    clock.mockReturnValueOnce(20).mockReturnValueOnce(25);
    expect(() => {
      backend.createRenderPipeline(object, promises);
    }).toThrow(failure);
    expect(timing.read()).toMatchObject({ pipelineCalls: 1, pipelineMilliseconds: 5 });
    timing.dispose();
    expect(backend.createRenderPipeline).toBe(original);
    wrapped(object, promises);
    expect(timing.read()).toMatchObject({ pipelineCalls: 1, pipelineMilliseconds: 5 });
  } finally {
    timing.dispose();
    clock.mockRestore();
  }
});
