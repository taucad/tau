import { describe, expect, it, vi } from 'vitest';
import { WebGPURenderer } from 'three/webgpu';
import { claimCanvasRenderer } from '#graphics/three/canvas-renderer-ownership.js';

function makeRenderer(canvas: HTMLCanvasElement) {
  const renderer = new WebGPURenderer({ canvas });
  const nativeExtension = { loseContext: vi.fn(), restoreContext: vi.fn() };
  const get = vi.fn<(name: string) => typeof nativeExtension>(() => nativeExtension);
  const extensions = { get };
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Three's backend capability flag.
  Object.assign(renderer.backend, { isWebGLBackend: true, extensions });
  const cleanup = vi.spyOn(renderer, 'dispose').mockImplementation(() => {
    extensions.get('WEBGL_lose_context').loseContext();
  });
  const reset = vi.fn();
  Object.assign(renderer, { resetState: reset });
  return { renderer, nativeExtension, extensions, get, cleanup, reset };
}

function disposeRenderer(renderer: WebGPURenderer): unknown {
  const dispose: () => unknown = renderer.dispose.bind(renderer);
  return dispose();
}

describe('canvas renderer ownership', () => {
  it('does not reset an obsolete predecessor when the newest renderer attaches', () => {
    const canvas = document.createElement('canvas');
    const previous = makeRenderer(canvas);
    claimCanvasRenderer(canvas, vi.fn())(previous.renderer);
    const current = makeRenderer(canvas);
    claimCanvasRenderer(canvas, vi.fn())(current.renderer);
    expect(previous.reset).not.toHaveBeenCalled();
    expect(current.reset).not.toHaveBeenCalled();
    previous.renderer.dispose();
    expect(previous.nativeExtension.loseContext).not.toHaveBeenCalled();
    expect(current.reset).toHaveBeenCalledOnce();
    current.renderer.dispose();
    expect(current.nativeExtension.loseContext).toHaveBeenCalledOnce();
  });

  it('resets the live renderer behind a still-pending successor when an older factory settles', () => {
    const canvas = document.createElement('canvas');
    const oldest = makeRenderer(canvas);
    const attachOldest = claimCanvasRenderer(canvas, vi.fn());
    const live = makeRenderer(canvas);
    const invalidate = vi.fn();
    claimCanvasRenderer(canvas, invalidate)(live.renderer);
    const pendingB = claimCanvasRenderer(canvas, vi.fn());
    const pendingC = claimCanvasRenderer(canvas, vi.fn());
    pendingB.cancel();
    live.reset.mockClear();
    invalidate.mockClear();
    attachOldest(oldest.renderer);
    oldest.renderer.dispose();
    expect(oldest.cleanup).toHaveBeenCalledOnce();
    expect(oldest.nativeExtension.loseContext).not.toHaveBeenCalled();
    expect(live.reset).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenCalledTimes(2);
    pendingC.cancel();
    live.renderer.dispose();
    expect(live.nativeExtension.loseContext).toHaveBeenCalledOnce();
  });

  it('restores a live owner across two cancelled successors before an older factory settles', () => {
    const canvas = document.createElement('canvas');
    const oldest = makeRenderer(canvas);
    const attachOldest = claimCanvasRenderer(canvas, vi.fn());
    const live = makeRenderer(canvas);
    const invalidate = vi.fn();
    claimCanvasRenderer(canvas, invalidate)(live.renderer);
    const pendingB = claimCanvasRenderer(canvas, vi.fn());
    const pendingC = claimCanvasRenderer(canvas, vi.fn());
    pendingB.cancel();
    pendingC.cancel();
    live.reset.mockClear();
    invalidate.mockClear();
    attachOldest(oldest.renderer);
    oldest.renderer.dispose();
    expect(oldest.cleanup).toHaveBeenCalledOnce();
    expect(oldest.nativeExtension.loseContext).not.toHaveBeenCalled();
    expect(live.reset).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenCalledTimes(2);
    live.renderer.dispose();
    expect(live.cleanup).toHaveBeenCalledOnce();
    expect(live.nativeExtension.loseContext).toHaveBeenCalledOnce();
  });

  it('releases the final owner and retains the original extension lookup', () => {
    const canvas = document.createElement('canvas');
    const current = makeRenderer(canvas);
    claimCanvasRenderer(canvas, vi.fn())(current.renderer);
    current.renderer.dispose();
    expect(current.cleanup).toHaveBeenCalledOnce();
    expect(current.nativeExtension.loseContext).toHaveBeenCalledOnce();
    expect(current.extensions.get).toBe(current.get);
    current.renderer.dispose();
    expect(current.cleanup).toHaveBeenCalledOnce();
  });

  it.each(['success', 'throw', 'resolve', 'reject'] as const)(
    'restores the retiring fallback lookup after %s without destroying its successor',
    async (outcome) => {
      const canvas = document.createElement('canvas');
      const old = makeRenderer(canvas);
      const attachOld = claimCanvasRenderer(canvas, vi.fn());
      const survivor = makeRenderer(canvas);
      const invalidate = vi.fn();
      claimCanvasRenderer(canvas, invalidate)(survivor.renderer);
      const failure = new Error('disposal failure');
      old.cleanup.mockImplementation((): void | Promise<void> => {
        old.extensions.get('WEBGL_lose_context').loseContext();
        if (outcome === 'throw') {
          throw failure;
        }
        if (outcome === 'reject') {
          return Promise.reject(failure);
        }
        if (outcome === 'resolve') {
          return Promise.resolve();
        }
      });
      attachOld(old.renderer);
      expect(survivor.reset).toHaveBeenCalledOnce();
      if (outcome === 'throw') {
        expect(() => {
          old.renderer.dispose();
        }).toThrow(failure);
      } else if (outcome === 'reject') {
        await expect(Promise.resolve(disposeRenderer(old.renderer))).rejects.toThrow(failure);
      } else {
        await Promise.resolve(disposeRenderer(old.renderer));
      }
      expect(old.cleanup).toHaveBeenCalledOnce();
      expect(old.nativeExtension.loseContext).not.toHaveBeenCalled();
      expect(old.extensions.get).toBe(old.get);
      expect(survivor.reset).toHaveBeenCalledTimes(2);
      expect(invalidate).toHaveBeenCalledTimes(2);
      survivor.renderer.dispose();
      expect(survivor.nativeExtension.loseContext).toHaveBeenCalledOnce();
    },
  );

  it('preserves the resolved value and exact cached disposal promise', async () => {
    const canvas = document.createElement('canvas');
    const current = makeRenderer(canvas);
    const value = { released: true };
    const pending = Promise.withResolvers<typeof value>();
    current.cleanup.mockImplementation(async () => pending.promise);
    claimCanvasRenderer(canvas, vi.fn())(current.renderer);
    const disposal = disposeRenderer(current.renderer);
    expect(disposeRenderer(current.renderer)).toBe(disposal);
    pending.resolve(value);
    await expect(disposal).resolves.toBe(value);
    expect(disposeRenderer(current.renderer)).toBe(disposal);
    expect(current.cleanup).toHaveBeenCalledOnce();
    expect(current.extensions.get).toBe(current.get);
  });

  it('restores a newer survivor after delayed rejection while preserving rejection identity', async () => {
    const canvas = document.createElement('canvas');
    const old = makeRenderer(canvas);
    const pending = Promise.withResolvers<void>();
    old.cleanup.mockImplementation(async () => pending.promise);
    claimCanvasRenderer(canvas, vi.fn())(old.renderer);
    const disposal = disposeRenderer(old.renderer);
    const failure = new Error('delayed disposal failure');
    const rejection = expect(disposal).rejects.toBe(failure);
    const survivor = makeRenderer(canvas);
    const invalidate = vi.fn();
    claimCanvasRenderer(canvas, invalidate)(survivor.renderer);
    expect(survivor.reset).not.toHaveBeenCalled();
    pending.reject(failure);
    await rejection;
    expect(disposeRenderer(old.renderer)).toBe(disposal);
    expect(old.cleanup).toHaveBeenCalledOnce();
    expect(old.extensions.get).toBe(old.get);
    expect(old.nativeExtension.loseContext).not.toHaveBeenCalled();
    expect(survivor.reset).toHaveBeenCalledOnce();
    expect(invalidate).toHaveBeenCalledOnce();
    survivor.renderer.dispose();
    expect(survivor.nativeExtension.loseContext).toHaveBeenCalledOnce();
  });

  it('checks ownership when asynchronous backend cleanup actually requests context loss', async () => {
    const canvas = document.createElement('canvas');
    const old = makeRenderer(canvas);
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    old.cleanup.mockImplementation(async () => {
      await pending;
      old.extensions.get('WEBGL_lose_context').loseContext();
    });
    claimCanvasRenderer(canvas, vi.fn())(old.renderer);
    const disposal = disposeRenderer(old.renderer);
    expect(disposeRenderer(old.renderer)).toBe(disposal);
    expect(old.cleanup).toHaveBeenCalledOnce();
    const survivor = makeRenderer(canvas);
    claimCanvasRenderer(canvas, vi.fn())(survivor.renderer);
    release!();
    await Promise.resolve(disposal);
    expect(old.nativeExtension.loseContext).not.toHaveBeenCalled();
    expect(old.extensions.get).toBe(old.get);
    expect(survivor.reset).toHaveBeenCalledOnce();
    survivor.renderer.dispose();
    expect(survivor.nativeExtension.loseContext).toHaveBeenCalledOnce();
  });

  it('restores the preceding live owner when successor construction fails', () => {
    const canvas = document.createElement('canvas');
    const old = makeRenderer(canvas);
    claimCanvasRenderer(canvas, vi.fn())(old.renderer);
    const pending = claimCanvasRenderer(canvas, vi.fn());
    pending.cancel();
    expect(old.reset).toHaveBeenCalledOnce();
    old.renderer.dispose();
    expect(old.nativeExtension.loseContext).toHaveBeenCalledOnce();
  });
});
