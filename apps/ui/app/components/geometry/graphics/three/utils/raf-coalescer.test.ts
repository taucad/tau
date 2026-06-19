import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRafCoalescer } from '#components/geometry/graphics/three/utils/raf-coalescer.js';

describe('createRafCoalescer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should deliver only the latest value scheduled before the next frame', () => {
    let callback: FrameRequestCallback | undefined;
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((nextCallback) => {
      callback = nextCallback;
      return 1;
    });
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => undefined);
    const received = vi.fn();
    const coalescer = createRafCoalescer<number>(received);

    coalescer.schedule(1);
    coalescer.schedule(2);
    callback?.(0);

    expect(received).toHaveBeenCalledTimes(1);
    expect(received).toHaveBeenCalledWith(2);
  });

  it('should cancel a pending frame', () => {
    const cancel = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => undefined);
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(() => 42);
    const received = vi.fn();
    const coalescer = createRafCoalescer<number>(received);

    coalescer.schedule(1);
    coalescer.cancel();

    expect(cancel).toHaveBeenCalledWith(42);
    expect(received).not.toHaveBeenCalled();
  });
});
