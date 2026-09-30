// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { InspectorBase } from 'three/webgpu';
import type { WebGpuRenderer } from '#components/geometry/graphics/three/renderer.js';
import { createRenderFrameTimer } from '#components/geometry/graphics/three/render-frame-timing.js';

describe('render frame GPU timing', () => {
  it('should measure between queue markers, exclude marker work, release resources and restore profiling', async () => {
    const inspector = new InspectorBase();
    const renderer = mock<WebGpuRenderer>({
      hasFeature: vi.fn().mockReturnValue(true),
    });
    renderer.inspector = inspector;
    renderer.backend = mock<WebGpuRenderer['backend']>();
    const destroy = vi.fn();
    const unmap = vi.fn();
    const submit = vi.fn();
    const beginRenderPass = vi.fn((_options: { timestampWrites: { beginningOfPassWriteIndex: number } }) => ({
      end: vi.fn(),
    }));
    const device = {
      createTexture: () => ({ createView: () => ({}), destroy }),
      createQuerySet: () => ({ destroy }),
      createBuffer: () => ({
        destroy,
        unmap,
        mapAsync: async () => undefined,
        getMappedRange: () => new BigUint64Array([0n, 1_000_000n, 6_000_000n, 9_000_000n]).buffer,
      }),
      createCommandEncoder: () => ({
        beginRenderPass,
        resolveQuerySet: vi.fn(),
        copyBufferToBuffer: vi.fn(),
        finish: () => ({}),
      }),
      queue: { submit },
    };
    Reflect.set(renderer.backend, 'device', device);
    Reflect.set(renderer.backend, 'trackTimestamp', true);
    const timer = createRenderFrameTimer(renderer, true);
    try {
      timer.begin();
      expect(submit).toHaveBeenCalledTimes(1);
      timer.end();
      expect(submit).toHaveBeenCalledTimes(2);
      expect(beginRenderPass.mock.calls.map(([options]) => options.timestampWrites.beginningOfPassWriteIndex)).toEqual([
        0, 2,
      ]);
      expect(await timer.resolve()).toBe(5);
      expect(unmap).toHaveBeenCalledOnce();
      expect(Reflect.get(renderer.backend, 'trackTimestamp')).toBe(false);
    } finally {
      timer.dispose();
    }
    expect(destroy).toHaveBeenCalledTimes(4);
    expect(renderer.inspector).toBe(inspector);
    expect(Reflect.get(renderer.backend, 'trackTimestamp')).toBe(true);
  });
  it('should release partial allocations without changing profiling when allocation fails', () => {
    const renderer = mock<WebGpuRenderer>({ hasFeature: vi.fn().mockReturnValue(true) });
    const inspector = new InspectorBase();
    renderer.inspector = inspector;
    renderer.backend = mock<WebGpuRenderer['backend']>();
    const destroy = vi.fn();
    Reflect.set(renderer.backend, 'device', {
      createTexture: () => ({ createView: () => ({}), destroy }),
      createQuerySet: () => ({ destroy }),
      createBuffer: () => {
        throw new Error('allocation failed');
      },
    });
    expect(() => createRenderFrameTimer(renderer, true)).toThrow('allocation failed');
    expect(destroy).toHaveBeenCalledTimes(2);
    expect(renderer.inspector).toBe(inspector);
  });
});
