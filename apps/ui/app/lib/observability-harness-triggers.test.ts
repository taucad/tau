import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startObservabilityMemoryPressure } from '#lib/observability-harness-triggers.js';

vi.mock('#lib/memory-kill-signal.js', () => ({ recordMemoryBreadcrumb: vi.fn() }));

const refuseWasm = (): void => {
  vi.spyOn(WebAssembly, 'Memory').mockImplementation(function () {
    throw new RangeError('Out of memory');
  });
};

/** A 2D context that accepts paints, as Safari's does until the process dies. */
const fakeContext = {
  fillStyle: '',
  fillRect: vi.fn(),
  getImageData: vi.fn(),
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('observability memory pressure', () => {
  it('should escalate to canvas backing stores when WebAssembly memory is refused, as iOS Safari does', () => {
    refuseWasm();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      fakeContext as unknown as CanvasRenderingContext2D,
    );
    const status = vi.fn();

    const stop = startObservabilityMemoryPressure(status);
    vi.advanceTimersByTime(250);
    expect(status).toHaveBeenLastCalledWith(
      'WebAssembly memory refused at 0 MiB (Out of memory); escalating to canvas backing stores.',
    );

    vi.advanceTimersByTime(500);
    expect(status).toHaveBeenLastCalledWith(
      'Memory pressure running: 32 MiB allocated with canvas backing stores. Stop to release it.',
    );
    expect(fakeContext.fillRect).toHaveBeenCalledWith(0, 0, 2048, 2048);
    expect(status.mock.calls.flat().join('\n')).not.toContain('without a tab kill');
    stop();
  });

  it('should report a refusal only once the canvas allocator refuses too', () => {
    refuseWasm();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const status = vi.fn();

    startObservabilityMemoryPressure(status);
    vi.advanceTimersByTime(500);
    expect(status).toHaveBeenLastCalledWith('Allocation refused without a tab kill: Canvas backing store refused');

    status.mockClear();
    vi.advanceTimersByTime(1000);
    expect(status).not.toHaveBeenCalled();
  });

  it('should free every canvas backing store and stop allocating when stopped', () => {
    refuseWasm();
    const created: HTMLCanvasElement[] = [];
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
      created.push(this);
      return fakeContext as unknown as CanvasRenderingContext2D;
    });
    const status = vi.fn();

    const stop = startObservabilityMemoryPressure(status);
    vi.advanceTimersByTime(750);
    expect(created).toHaveLength(2);

    stop();
    expect(created.map((canvas) => [canvas.width, canvas.height])).toEqual([
      [0, 0],
      [0, 0],
    ]);
    status.mockClear();
    vi.advanceTimersByTime(1000);
    expect(status).not.toHaveBeenCalled();
  });
});
