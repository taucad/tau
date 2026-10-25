import { afterEach, expect, it, vi } from 'vitest';
import { scheduleCameraPreparation } from '#graphics/three/camera-preparation.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('should wait for a quiet presented frame and prepare only once', () => {
  vi.useFakeTimers();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const prepare = vi.fn(() => true);
  const owner = scheduleCameraPreparation(document.createElement('canvas'), prepare);
  try {
    vi.advanceTimersByTime(1000);
    expect(prepare).not.toHaveBeenCalled();
    owner.onFrame();
    vi.advanceTimersByTime(500);
    owner.onFrame();
    vi.advanceTimersByTime(500);
    expect(prepare).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(prepare).toHaveBeenCalledOnce();
    owner.onFrame();
    vi.advanceTimersByTime(1000);
    expect(prepare).toHaveBeenCalledOnce();
  } finally {
    owner.dispose();
  }
});

it('should cancel on input, hidden document and disposal, allowing a later eligible frame', () => {
  vi.useFakeTimers();
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const canvas = document.createElement('canvas');
  const prepare = vi.fn(() => false);
  const owner = scheduleCameraPreparation(canvas, prepare);
  try {
    for (const event of ['pointerdown', 'pointermove', 'wheel', 'keydown']) {
      owner.onFrame();
      canvas.dispatchEvent(new Event(event));
      vi.advanceTimersByTime(1000);
      expect(prepare).not.toHaveBeenCalled();
      document.dispatchEvent(new Event('pointerup'));
    }
    owner.onFrame();
    visibility.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(1000);
    expect(prepare).not.toHaveBeenCalled();
    visibility.mockReturnValue('visible');
    owner.onFrame();
    vi.advanceTimersByTime(750);
    expect(prepare).toHaveBeenCalledOnce();
    owner.onFrame();
    owner.dispose();
    vi.advanceTimersByTime(1000);
    owner.onFrame();
    vi.advanceTimersByTime(1000);
    expect(prepare).toHaveBeenCalledOnce();
  } finally {
    owner.dispose();
  }
});

it('should leave failed preparation demand-only without an uncaught timer or retry loop', () => {
  vi.useFakeTimers();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const failure = new Error('preparation failed');
  const prepare = vi.fn(() => {
    throw failure;
  });
  const owner = scheduleCameraPreparation(document.createElement('canvas'), prepare);
  try {
    owner.onFrame();
    expect(() => vi.advanceTimersByTime(750)).not.toThrow();
    owner.onFrame();
    vi.advanceTimersByTime(750);
    expect(prepare).toHaveBeenCalledOnce();
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('demand-rendered'), failure);
  } finally {
    owner.dispose();
  }
});

it('should defer while a pointer remains pressed even when another frame settles', () => {
  vi.useFakeTimers();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const canvas = document.createElement('canvas');
  const prepare = vi.fn(() => true);
  const owner = scheduleCameraPreparation(canvas, prepare);
  try {
    owner.onFrame();
    canvas.dispatchEvent(new Event('pointerdown'));
    owner.onFrame();
    vi.advanceTimersByTime(1000);
    expect(prepare).not.toHaveBeenCalled();
    document.dispatchEvent(new Event('pointerup'));
    owner.onFrame();
    vi.advanceTimersByTime(750);
    expect(prepare).toHaveBeenCalledOnce();
  } finally {
    owner.dispose();
  }
});
