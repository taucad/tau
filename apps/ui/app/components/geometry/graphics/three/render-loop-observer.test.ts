import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRenderLoopObserver } from '#components/geometry/graphics/three/render-loop-observer.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('render-loop submission observer', () => {
  it('should publish a fresh submission rate, become idle without frames, and restart without averaging idle', () => {
    vi.useFakeTimers();
    const publish = vi.fn();
    const observer = createRenderLoopObserver(publish);
    for (let index = 0; index < 25; index++) {
      observer.record(performance.now());
      vi.advanceTimersByTime(10);
    }
    expect(publish.mock.lastCall?.[0].status).toBe('active');
    expect(publish.mock.lastCall?.[0].fps).toBe(100);
    vi.advanceTimersByTime(500);
    expect(publish).toHaveBeenLastCalledWith({ status: 'idle' });
    for (let index = 0; index < 10; index++) {
      observer.record(performance.now());
      vi.advanceTimersByTime(25);
    }
    expect(publish.mock.lastCall?.[0].status).toBe('active');
    expect(publish.mock.lastCall?.[0].fps).toBe(40);
    observer.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('should include trailing stalls in each publication window and publish zero before becoming idle', () => {
    vi.useFakeTimers();
    const publish = vi.fn();
    const observer = createRenderLoopObserver(publish);
    observer.record(performance.now());
    vi.advanceTimersByTime(8);
    observer.record(performance.now());
    vi.advanceTimersByTime(242);
    expect(publish).toHaveBeenLastCalledWith({ status: 'active', fps: 8 });
    vi.advanceTimersByTime(250);
    expect(publish).toHaveBeenLastCalledWith({ status: 'active', fps: 0 });
    vi.advanceTimersByTime(250);
    expect(publish).toHaveBeenLastCalledWith({ status: 'idle' });
    observer.dispose();
  });

  it('should retain raw extra resize submissions and full capture wall time without claiming presented frames', () => {
    vi.useFakeTimers();
    const observer = createRenderLoopObserver(vi.fn());
    observer.startCapture(0);
    observer.record(20);
    observer.withResizeSubmission(() => {
      observer.record(21);
    });
    observer.record(40);
    const capture = observer.finishCapture(1000);
    expect(capture).toEqual({
      startedAt: 0,
      endedAt: 1000,
      samples: [
        { at: 20, source: 'demand' },
        { at: 21, source: 'resize-prepaint' },
        { at: 40, source: 'demand' },
      ],
      interrupted: false,
      metric: 'render-loop-submissions',
    });
    observer.dispose();
  });

  it('should clear stale active status when hidden and stop all publishing after disposal', () => {
    vi.useFakeTimers();
    const publish = vi.fn();
    const observer = createRenderLoopObserver(publish);
    observer.startCapture(0);
    observer.record(0);
    observer.record(8);
    observer.setHidden(true);
    expect(publish).toHaveBeenLastCalledWith({ status: 'hidden' });
    observer.record(16);
    observer.setHidden(false);
    expect(publish).toHaveBeenLastCalledWith({ status: 'idle' });
    expect(observer.finishCapture(100).interrupted).toBe(true);
    observer.dispose();
    publish.mockClear();
    observer.record(200);
    vi.advanceTimersByTime(1000);
    expect(publish).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
