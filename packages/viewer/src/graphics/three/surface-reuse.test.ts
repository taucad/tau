import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { DepthTexture, HalfFloatType, RenderTarget } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { createSurfaceReuse } from '#graphics/three/surface-reuse.js';

describe('surface reuse ownership', () => {
  it('should retire every attachment user before initialization and retry a failed preparation', () => {
    const scene = new RenderTarget(1, 1, { type: HalfFloatType });
    const composed = new RenderTarget(1, 1);
    composed.depthTexture = new DepthTexture(1, 1);
    const renderer = mock<WebGPURenderer>();
    const reuse = createSurfaceReuse({ renderer, scene, composed });
    const events: string[] = [];
    for (const [name, target] of [
      ['scene', scene],
      ['composed', composed],
      ['reuse', reuse.target],
    ] as const) {
      target.addEventListener('dispose', () => events.push(`retire-${name}`));
    }
    renderer.initRenderTarget.mockImplementation(() => events.push('initialize'));
    try {
      expect(reuse.target.texture).toBe(scene.texture);
      expect(reuse.target.depthTexture).toBe(composed.depthTexture);
      reuse.prepare(5120, 2880);
      expect(events).toEqual([
        'retire-scene',
        'retire-composed',
        'retire-reuse',
        'initialize',
        'initialize',
        'initialize',
      ]);
      events.length = 0;
      reuse.prepare(5120, 2880);
      expect(events).toEqual([]);
      renderer.initRenderTarget.mockImplementationOnce(() => {
        throw new Error('allocation failed');
      });
      expect(() => {
        reuse.prepare(2560, 1440);
      }).toThrow('allocation failed');
      events.length = 0;
      reuse.prepare(2560, 1440);
      expect(events).toEqual(['initialize', 'initialize', 'initialize']);
      expect([reuse.target.width, reuse.target.height]).toEqual([2560, 1440]);
    } finally {
      reuse.target.dispose();
      scene.dispose();
      composed.dispose();
    }
  });

  it.each(['compose', 'filter'] as const)('should restore target and depth clear state after %s fails', (failure) => {
    const scene = new RenderTarget();
    const composed = new RenderTarget();
    const destination = new RenderTarget();
    let current: ReturnType<WebGPURenderer['getRenderTarget']> = destination;
    const renderer = mock<WebGPURenderer>({
      autoClearDepth: true,
      autoClearStencil: true,
      getRenderTarget: () => current,
      setRenderTarget: (target) => {
        current = target;
      },
    });
    const reuse = createSurfaceReuse({ renderer, scene, composed });
    const compose = vi.fn(() => {
      expect(current).toBe(composed);
      if (failure === 'compose') {
        throw new Error('compose failed');
      }
    });
    const filter = vi.fn(() => {
      expect(current).toBe(reuse.target);
      expect(renderer.autoClearDepth).toBe(false);
      expect(renderer.autoClearStencil).toBe(false);
      throw new Error('filter failed');
    });
    try {
      expect(() => {
        reuse.render(compose, filter);
      }).toThrow(`${failure} failed`);
      expect(current).toBe(destination);
      expect(renderer.autoClearDepth).toBe(true);
      expect(renderer.autoClearStencil).toBe(true);
      if (failure === 'compose') {
        expect(filter).not.toHaveBeenCalled();
      }
      reuse.render(
        () => undefined,
        () => undefined,
      );
      expect(current).toBe(destination);
    } finally {
      reuse.target.dispose();
      scene.dispose();
      composed.dispose();
      destination.dispose();
    }
  });

  it('should isolate simultaneous owners and release only the retiring framebuffer view', () => {
    const scenes = [new RenderTarget(), new RenderTarget()];
    const composed = [new RenderTarget(), new RenderTarget()];
    const owners = scenes.map((scene, index) =>
      createSurfaceReuse({ renderer: mock<WebGPURenderer>(), scene, composed: composed[index]! }),
    );
    const survivorDispose = vi.spyOn(owners[1]!.target, 'dispose');
    const sceneDispose = vi.spyOn(scenes[0]!, 'dispose');
    const composedDispose = vi.spyOn(composed[0]!, 'dispose');
    try {
      expect(owners[0]!.target.texture).not.toBe(owners[1]!.target.texture);
      owners[0]!.target.dispose();
      expect(survivorDispose).not.toHaveBeenCalled();
      expect(sceneDispose).not.toHaveBeenCalled();
      expect(composedDispose).not.toHaveBeenCalled();
      owners[1]!.prepare(5120, 2880);
      expect(owners[1]!.target.width).toBe(5120);
    } finally {
      for (const owner of owners) {
        owner.target.dispose();
      }
      for (const target of [...scenes, ...composed]) {
        target.dispose();
      }
    }
  });
});
