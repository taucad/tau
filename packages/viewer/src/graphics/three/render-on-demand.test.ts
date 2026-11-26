import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { renderOnDemand } from '#graphics/three/render-on-demand.js';

/** A node renderer reduced to what Three's internal loop touches, with that loop's own `start` and `stop`. */
const createFakeRenderer = () => {
  const nodeFrame = {
    frameId: 0,
    update: vi.fn(() => {
      nodeFrame.frameId += 1;
    }),
  };
  const info = { autoReset: true, frame: 0, reset: vi.fn() };
  const animation = {
    // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- Three's own field holds `null` when stopped.
    _requestId: 1 as number | null,
    start: vi.fn(() => {
      animation._requestId = 2;
    }),
    stop: vi.fn(() => {
      animation._requestId = null;
    }),
  };
  const render = vi.fn();
  const setAnimationLoop = vi.fn(async () => undefined);
  const renderer = { _animation: animation, _nodes: { nodeFrame }, info, render, setAnimationLoop };
  return { renderer: renderer as unknown as WebGPURenderer, animation, nodeFrame, info, render, setAnimationLoop };
};

describe('renderOnDemand', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should stop the per-vsync loop that init started', () => {
    const fake = createFakeRenderer();
    renderOnDemand(fake.renderer);

    expect(fake.animation.stop).toHaveBeenCalledOnce();
    expect(fake.animation._requestId).toBeNull();
  });

  it('should advance the node frame and reset info once per task, however many passes render', async () => {
    const fake = createFakeRenderer();
    renderOnDemand(fake.renderer);
    const scene = new Scene();
    const camera = new PerspectiveCamera();

    fake.renderer.render(scene, camera);
    fake.renderer.render(scene, camera);
    fake.renderer.render(scene, camera);

    expect(fake.render).toHaveBeenCalledTimes(3);
    expect(fake.nodeFrame.update).toHaveBeenCalledOnce();
    expect(fake.info.reset).toHaveBeenCalledOnce();
    expect(fake.info.frame).toBe(1);

    await Promise.resolve();
    fake.renderer.render(scene, camera);
    expect(fake.nodeFrame.update).toHaveBeenCalledTimes(2);
    expect(fake.info.frame).toBe(2);
  });

  it('should leave info alone when the caller resets it by hand', () => {
    const fake = createFakeRenderer();
    fake.info.autoReset = false;
    renderOnDemand(fake.renderer);
    fake.renderer.render(new Scene(), new PerspectiveCamera());

    expect(fake.info.reset).not.toHaveBeenCalled();
    expect(fake.nodeFrame.update).toHaveBeenCalledOnce();
  });

  it('should run Three loop while an animation loop is set, and leave its bookkeeping to it', async () => {
    const fake = createFakeRenderer();
    renderOnDemand(fake.renderer);
    const frame = vi.fn();

    await fake.renderer.setAnimationLoop(frame);
    expect(fake.setAnimationLoop).toHaveBeenCalledWith(frame);
    expect(fake.animation.start).toHaveBeenCalledOnce();
    fake.renderer.render(new Scene(), new PerspectiveCamera());
    expect(fake.nodeFrame.update).not.toHaveBeenCalled();

    await fake.renderer.setAnimationLoop(frame);
    expect(fake.animation.start).toHaveBeenCalledOnce();

    await fake.renderer.setAnimationLoop(null);
    expect(fake.animation._requestId).toBeNull();
  });

  it('should match the loop in the installed Three, so an upgrade that changes it fails here', () => {
    // The fields above are Three's private ones. If this fails, re-read `Animation` in three.webgpu.js and update
    // render-on-demand.ts to do whatever per-frame bookkeeping the new loop does.
    const require = createRequire(import.meta.url);
    const source = readFileSync(require.resolve('three/webgpu'), 'utf8');
    const loop = /start\(\) \{\s*const update = \( time, xrFrame \) => \{([\s\S]*?)\n\t\t\};/u.exec(source)?.[1];

    expect(loop).toBeDefined();
    const statements = loop!
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    expect(statements).toEqual([
      'this._requestId = this._context.requestAnimationFrame( update );',
      'if ( this.info.autoReset === true ) this.info.reset();',
      'this.nodes.nodeFrame.update();',
      'this.info.frame = this.nodes.nodeFrame.frameId;',
      'this.renderer._inspector.begin();',
      'if ( this._animationLoop !== null ) this._animationLoop( time, xrFrame );',
      'this.renderer._inspector.finish();',
    ]);
    expect(source).toContain('this._animation = new Animation( this, this._nodes, this.info );');
  });
});
