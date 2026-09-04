import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildClientThemeCode, Theme, ThemeProvider, useTheme } from '#hooks/use-theme.js';
import type { ThemeWithSystem } from '#hooks/use-theme.js';

const setDesktopAppIconTheme = vi.hoisted(() => vi.fn());
vi.mock('#filesystem/desktop-bridge.js', () => ({ setDesktopAppIconTheme }));

const localThemeStore = new Map<string, string>();
const localStorageStub = {
  clear: () => {
    localThemeStore.clear();
  },
  getItem: (key: string) => localThemeStore.get(key) ?? null,
  setItem: (key: string, value: string) => {
    localThemeStore.set(key, value);
  },
};

const fetchMock = vi.fn(async () => new Response());
const prefersLightMediaQuery = '(prefers-color-scheme: light)';
const prefersMoreContrastMediaQuery = '(prefers-contrast: more)';

type MediaQueryListener = (event: { readonly matches: boolean }) => void;
type MediaQueryMock = {
  matches: boolean;
  listeners: Set<MediaQueryListener>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
};

let mediaQueries: Record<string, MediaQueryMock>;

const createMediaQuery = (matches: boolean): MediaQueryMock => {
  const listeners = new Set<MediaQueryListener>();
  return {
    matches,
    listeners,
    addEventListener: vi.fn((_type: string, listener: MediaQueryListener) => listeners.add(listener)),
    removeEventListener: vi.fn((_type: string, listener: MediaQueryListener) => listeners.delete(listener)),
  };
};

const updateMediaQuery = (query: string, matches: boolean): void => {
  const mediaQuery = mediaQueries[query]!;
  mediaQuery.matches = matches;
  for (const listener of mediaQuery.listeners) {
    listener({ matches });
  }
};

class BroadcastChannelMock {
  public addEventListener = vi.fn();
  public removeEventListener = vi.fn();
  public postMessage = vi.fn();
  public close = vi.fn();
}

const createWrapper =
  (specifiedTheme: ThemeWithSystem) =>
  ({ children }: { readonly children: ReactNode }): ReactElement => (
    <ThemeProvider specifiedTheme={specifiedTheme} themeAction='/action/set-theme'>
      {children}
    </ThemeProvider>
  );

describe('useTheme', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', localStorageStub);
    mediaQueries = {
      [prefersLightMediaQuery]: createMediaQuery(true),
      [prefersMoreContrastMediaQuery]: createMediaQuery(false),
    };
    fetchMock.mockClear();
    setDesktopAppIconTheme.mockClear();
    // `stubEnv` is not auto-restored; the desktop suite below would otherwise
    // leak `TAU_TARGET` into every test declared after it.
    vi.unstubAllEnvs();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('BroadcastChannel', BroadcastChannelMock);
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => mediaQueries[query]),
    );
  });

  it('should render detached theme-aware surfaces with a light fallback', () => {
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe(Theme.LIGHT);
    expect(result.current.isHighContrast).toBe(false);
    expect(() => {
      result.current.setTheme(Theme.DARK);
    }).toThrow('Theme changes require a ThemeProvider');
  });

  it.each([
    { specifiedTheme: Theme.LIGHT, expectedResolvedTheme: Theme.LIGHT, expectedName: 'Light' },
    { specifiedTheme: Theme.DARK, expectedResolvedTheme: Theme.DARK, expectedName: 'Dark' },
    { specifiedTheme: Theme.BLACK, expectedResolvedTheme: Theme.DARK, expectedName: 'Black' },
    {
      specifiedTheme: Theme.HIGH_CONTRAST,
      expectedResolvedTheme: Theme.DARK,
      expectedName: 'High Contrast',
    },
  ])(
    'should report $expectedName as a user-defined theme',
    ({ specifiedTheme, expectedResolvedTheme, expectedName }) => {
      const { result } = renderHook(() => useTheme(), { wrapper: createWrapper(specifiedTheme) });

      expect(result.current.theme).toBe(expectedResolvedTheme);
      expect(result.current.ssrTheme).toBe(specifiedTheme);
      expect(result.current.themeWithSystem).toBe(specifiedTheme);
      expect(result.current.currentOption.name).toBe(expectedName);
      expect(result.current.isHighContrast).toBe(specifiedTheme === Theme.HIGH_CONTRAST);
    },
  );

  it('should report system while preserving its resolved dark color scheme', () => {
    mediaQueries[prefersLightMediaQuery]!.matches = false;
    const { result } = renderHook(() => useTheme(), { wrapper: createWrapper(null) });

    expect(result.current.theme).toBe(Theme.DARK);
    expect(result.current.ssrTheme).toBe(Theme.DARK);
    expect(result.current.themeWithSystem).toBeNull();
    expect(result.current.currentOption.name).toBe('System');
    expect(result.current.isHighContrast).toBe(false);
  });

  it('should cycle through Light, Dark, Black, High Contrast, and System', () => {
    const { result } = renderHook(() => useTheme(), { wrapper: createWrapper(Theme.LIGHT) });

    for (const expectedTheme of [
      Theme.DARK,
      Theme.BLACK,
      Theme.HIGH_CONTRAST,
      null,
      Theme.LIGHT,
    ] satisfies ThemeWithSystem[]) {
      act(() => {
        result.current.cycleTheme();
      });
      expect(result.current.themeWithSystem).toBe(expectedTheme);
    }

    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('should persist High Contrast through the theme action without persisting the media preference', () => {
    const { result } = renderHook(() => useTheme(), { wrapper: createWrapper(Theme.LIGHT) });

    act(() => {
      result.current.setTheme(Theme.HIGH_CONTRAST);
    });

    expect(fetchMock).toHaveBeenCalledWith('/action/set-theme', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ theme: Theme.HIGH_CONTRAST }),
    });
  });

  it('should react to contrast preference changes without persisting them', () => {
    const { result } = renderHook(() => useTheme(), { wrapper: createWrapper(Theme.LIGHT) });

    act(() => {
      updateMediaQuery(prefersMoreContrastMediaQuery, true);
    });

    expect(result.current.theme).toBe(Theme.LIGHT);
    expect(result.current.isHighContrast).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();

    act(() => {
      updateMediaQuery(prefersMoreContrastMediaQuery, false);
    });

    expect(result.current.isHighContrast).toBe(false);
  });

  it('should clean up the contrast media listener', () => {
    const { unmount } = renderHook(() => useTheme(), { wrapper: createWrapper(Theme.LIGHT) });
    const mediaQuery = mediaQueries[prefersMoreContrastMediaQuery]!;

    expect(mediaQuery.listeners).toHaveLength(1);
    unmount();
    expect(mediaQuery.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    expect(mediaQuery.listeners).toHaveLength(0);
  });

  it('should keep returned callbacks stable when theme state is unchanged', () => {
    const { result, rerender } = renderHook(() => useTheme(), { wrapper: createWrapper(Theme.LIGHT) });
    const firstSetTheme = result.current.setTheme;
    const firstCycleTheme = result.current.cycleTheme;

    rerender();

    expect(result.current.setTheme).toBe(firstSetTheme);
    expect(result.current.cycleTheme).toBe(firstCycleTheme);
  });

  describe('desktop target', () => {
    beforeEach(() => {
      vi.stubEnv('TAU_TARGET', 'desktop');
      globalThis.localStorage.clear();
    });

    it('persists the preference to localStorage instead of the dropped theme action', () => {
      const { result } = renderHook(() => useTheme(), { wrapper: createWrapper(null) });

      act(() => {
        result.current.setTheme(Theme.BLACK);
      });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(globalThis.localStorage.getItem('tau-theme')).toBe(Theme.BLACK);
    });

    it('keeps the native app icon aligned with the resolved local theme', async () => {
      const { result } = renderHook(() => useTheme(), { wrapper: createWrapper(Theme.LIGHT) });

      await waitFor(() => {
        expect(setDesktopAppIconTheme).toHaveBeenLastCalledWith('light');
      });

      act(() => {
        result.current.setTheme(Theme.BLACK);
      });

      await waitFor(() => {
        expect(setDesktopAppIconTheme).toHaveBeenLastCalledWith('dark');
      });
    });

    it('persists the system preference as an explicit choice', () => {
      const { result } = renderHook(() => useTheme(), { wrapper: createWrapper(Theme.BLACK) });

      act(() => {
        result.current.setTheme(null);
      });

      expect(globalThis.localStorage.getItem('tau-theme')).toBe('system');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('hydrates the stored preference when the SPA root supplies none', () => {
      globalThis.localStorage.setItem('tau-theme', Theme.HIGH_CONTRAST);

      const { result } = renderHook(() => useTheme(), { wrapper: createWrapper(null) });

      expect(result.current.themeWithSystem).toBe(Theme.HIGH_CONTRAST);
      expect(result.current.isHighContrast).toBe(true);
    });

    it('hydrates a stored system preference as the resolved media theme', () => {
      globalThis.localStorage.setItem('tau-theme', 'system');
      mediaQueries[prefersLightMediaQuery]!.matches = false;

      const { result } = renderHook(() => useTheme(), { wrapper: createWrapper(null) });

      expect(result.current.themeWithSystem).toBeNull();
      expect(result.current.theme).toBe(Theme.DARK);
    });

    describe('pre-paint flash guard', () => {
      const runFlashScript = (): void => {
        // oxlint-disable-next-line no-new-func -- the subject under test is a script string.
        const run = new Function(buildClientThemeCode()) as () => void;
        run();
      };

      beforeEach(() => {
        document.documentElement.className = '';
        document.head.innerHTML = '<meta name="color-scheme" content="light dark" />';
      });

      it('applies the stored theme before hydration', () => {
        globalThis.localStorage.setItem('tau-theme', Theme.BLACK);

        runFlashScript();

        expect([...document.documentElement.classList]).toStrictEqual([Theme.DARK, Theme.BLACK]);
        expect(document.querySelector('meta[name=color-scheme]')?.getAttribute('content')).toBe('dark light');
      });

      it('falls back to the system preference when nothing is stored', () => {
        mediaQueries[prefersLightMediaQuery]!.matches = false;

        runFlashScript();

        expect([...document.documentElement.classList]).toStrictEqual([Theme.DARK]);
      });

      it('falls back to the system preference for an explicit System choice', () => {
        globalThis.localStorage.setItem('tau-theme', 'system');

        runFlashScript();

        expect([...document.documentElement.classList]).toStrictEqual([Theme.LIGHT]);
      });
    });

    it('ignores a corrupted stored preference', () => {
      globalThis.localStorage.setItem('tau-theme', 'chartreuse');

      const { result } = renderHook(() => useTheme(), { wrapper: createWrapper(null) });

      expect(result.current.themeWithSystem).toBeNull();
      expect(result.current.theme).toBe(Theme.LIGHT);
    });
  });

  it('never reads the desktop theme store from the web flash guard', () => {
    expect(buildClientThemeCode()).not.toContain('tau-theme');
    expect(buildClientThemeCode()).not.toContain('localStorage');
  });

  it('keeps posting to the theme action on the web target', () => {
    globalThis.localStorage.clear();
    const { result } = renderHook(() => useTheme(), { wrapper: createWrapper(null) });

    act(() => {
      result.current.setTheme(Theme.BLACK);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(globalThis.localStorage.getItem('tau-theme')).toBeNull();
  });
});
