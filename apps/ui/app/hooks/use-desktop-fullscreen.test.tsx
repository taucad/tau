// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDesktopFullscreen } from '#hooks/use-desktop-fullscreen.js';

/** The build target `@taucad/*` libraries resolve; the app's own reads still follow `TAU_TARGET`. */
const buildTarget = vi.hoisted(() => ({ desktop: false }));
vi.mock('@taucad/ui-core/lib/build-target', () => ({
  get isDesktopTarget() {
    return buildTarget.desktop;
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  buildTarget.desktop = false;
});

describe('useDesktopFullscreen', () => {
  it('should read an early native snapshot, follow transitions and unsubscribe on unmount', () => {
    vi.stubEnv('TAU_TARGET', 'desktop');
    buildTarget.desktop = true;
    let isFullscreen = true;
    const events = new EventTarget();
    const unsubscribe = vi.fn();
    vi.stubGlobal('tau', {
      window: {
        isFullscreen: () => isFullscreen,
        onFullscreenChange: (listener: () => void) => {
          events.addEventListener('change', listener);
          return () => {
            events.removeEventListener('change', listener);
            unsubscribe();
          };
        },
      },
    });
    const { result, unmount } = renderHook(useDesktopFullscreen);
    expect(result.current).toBe(true);
    act(() => {
      isFullscreen = false;
      events.dispatchEvent(new Event('change'));
    });
    expect(result.current).toBe(false);
    act(() => {
      isFullscreen = true;
      events.dispatchEvent(new Event('change'));
    });
    expect(result.current).toBe(true);
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('should leave browser chrome unchanged even when a native-looking global exists', () => {
    vi.stubEnv('TAU_TARGET', 'browser');
    buildTarget.desktop = false;
    const subscribe = vi.fn();
    vi.stubGlobal('tau', { window: { isFullscreen: () => true, onFullscreenChange: subscribe } });
    const { result } = renderHook(useDesktopFullscreen);
    expect(result.current).toBe(false);
    expect(subscribe).not.toHaveBeenCalled();
  });
});
