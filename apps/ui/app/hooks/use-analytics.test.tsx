import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

const mockStartSessionRecording = vi.fn();
const mockPostHog = { startSessionRecording: mockStartSessionRecording };

vi.mock('posthog-js/react', () => ({
  usePostHog: () => mockPostHog,
}));

describe('DeferredSessionRecording', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockStartSessionRecording.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('should call startSessionRecording via requestIdleCallback', async () => {
    const idleCallbacks: IdleRequestCallback[] = [];
    vi.stubGlobal(
      'requestIdleCallback',
      vi.fn((callback: IdleRequestCallback) => {
        idleCallbacks.push(callback);
        return 1;
      }),
    );
    vi.stubGlobal('cancelIdleCallback', vi.fn());

    const { DeferredSessionRecording } = await import('#providers/web-analytics-provider.js');
    render(<DeferredSessionRecording />);

    expect(mockStartSessionRecording).not.toHaveBeenCalled();

    for (const callback of idleCallbacks) {
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- mock IdleDeadline for test
      callback({} as IdleDeadline);
    }

    expect(mockStartSessionRecording).toHaveBeenCalledOnce();
  });

  it('should use setTimeout fallback when requestIdleCallback is unavailable', async () => {
    const { DeferredSessionRecording } = await import('#providers/web-analytics-provider.js');
    render(<DeferredSessionRecording />);

    expect(mockStartSessionRecording).not.toHaveBeenCalled();

    vi.runAllTimers();

    expect(mockStartSessionRecording).toHaveBeenCalledOnce();
  });
});
