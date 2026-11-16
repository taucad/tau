import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Theme, ThemeProvider, themeMigrationAction, useTheme } from '#hooks/use-theme.js';
import type { ThemeWithSystem } from '#hooks/use-theme.js';
import { clientFactsStorageKey, forgetClientFacts, readClientFacts } from '#lib/client-facts.js';

const setDesktopAppIconTheme = vi.hoisted(() => vi.fn());
vi.mock('@taucad/files-ui/filesystem/desktop-bridge', () => ({ setDesktopAppIconTheme }));

const store = new Map<string, string>();
const localStorageStub = {
  clear: () => {
    store.clear();
  },
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.set(key, value);
  },
  removeItem: (key: string) => {
    store.delete(key);
  },
};

const fetchMock = vi.fn(async () => Response.json({ theme: null }));
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

/** Store a theme choice in the client facts, as the head script or an earlier visit left it. */
const storeTheme = (theme: ThemeWithSystem): void => {
  store.set(clientFactsStorageKey, JSON.stringify({ v: 1, theme: theme ?? 'system' }));
  forgetClientFacts();
};

const wrapper = ({ children }: { readonly children: ReactNode }): ReactElement => (
  <ThemeProvider>{children}</ThemeProvider>
);

describe('useTheme', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', localStorageStub);
    store.clear();
    forgetClientFacts();
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
    { storedTheme: Theme.LIGHT, expectedResolvedTheme: Theme.LIGHT, expectedName: 'Light' },
    { storedTheme: Theme.DARK, expectedResolvedTheme: Theme.DARK, expectedName: 'Dark' },
    { storedTheme: Theme.BLACK, expectedResolvedTheme: Theme.DARK, expectedName: 'Black' },
    { storedTheme: Theme.HIGH_CONTRAST, expectedResolvedTheme: Theme.DARK, expectedName: 'High Contrast' },
  ])(
    'should report a stored $expectedName as a user-defined theme',
    ({ storedTheme, expectedResolvedTheme, expectedName }) => {
      storeTheme(storedTheme);
      const { result } = renderHook(() => useTheme(), { wrapper });

      expect(result.current.theme).toBe(expectedResolvedTheme);
      expect(result.current.ssrTheme).toBe(storedTheme);
      expect(result.current.themeWithSystem).toBe(storedTheme);
      expect(result.current.currentOption.name).toBe(expectedName);
      expect(result.current.isHighContrast).toBe(storedTheme === Theme.HIGH_CONTRAST);
    },
  );

  it('should report system while preserving its resolved dark color scheme', () => {
    storeTheme(null);
    mediaQueries[prefersLightMediaQuery]!.matches = false;
    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(result.current.theme).toBe(Theme.DARK);
    expect(result.current.ssrTheme).toBe(Theme.DARK);
    expect(result.current.themeWithSystem).toBeNull();
    expect(result.current.currentOption.name).toBe('System');
  });

  it('should start a calibration subtree in its initial theme', () => {
    storeTheme(Theme.DARK);
    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }: { readonly children: ReactNode }) => (
        <ThemeProvider initialTheme={Theme.LIGHT}>{children}</ThemeProvider>
      ),
    });

    expect(result.current.themeWithSystem).toBe(Theme.LIGHT);
  });

  it('should cycle through Light, Dark, Black, High Contrast, and System, storing each in the client facts', () => {
    storeTheme(Theme.LIGHT);
    const { result } = renderHook(() => useTheme(), { wrapper });

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
      expect(readClientFacts().theme).toBe(expectedTheme ?? 'system');
    }

    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.documentElement.classList.contains(Theme.LIGHT)).toBe(true);
  });

  it('should follow a choice another tab stores', () => {
    storeTheme(Theme.LIGHT);
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      store.set(clientFactsStorageKey, JSON.stringify({ v: 1, theme: Theme.BLACK }));
      globalThis.dispatchEvent(new StorageEvent('storage', { key: clientFactsStorageKey }));
    });

    expect(result.current.themeWithSystem).toBe(Theme.BLACK);
  });

  it('should react to contrast preference changes without storing them', () => {
    storeTheme(Theme.LIGHT);
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      updateMediaQuery(prefersMoreContrastMediaQuery, true);
    });

    expect(result.current.theme).toBe(Theme.LIGHT);
    expect(result.current.isHighContrast).toBe(true);
    expect(readClientFacts().theme).toBe(Theme.LIGHT);

    act(() => {
      updateMediaQuery(prefersMoreContrastMediaQuery, false);
    });

    expect(result.current.isHighContrast).toBe(false);
  });

  it('should clean up the contrast media listener', () => {
    storeTheme(Theme.LIGHT);
    const { unmount } = renderHook(() => useTheme(), { wrapper });
    const mediaQuery = mediaQueries[prefersMoreContrastMediaQuery]!;

    expect(mediaQuery.listeners).toHaveLength(1);
    unmount();
    expect(mediaQuery.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    expect(mediaQuery.listeners).toHaveLength(0);
  });

  it('should keep returned callbacks stable when theme state is unchanged', () => {
    storeTheme(Theme.LIGHT);
    const { result, rerender } = renderHook(() => useTheme(), { wrapper });
    const firstSetTheme = result.current.setTheme;
    const firstCycleTheme = result.current.cycleTheme;

    rerender();

    expect(result.current.setTheme).toBe(firstSetTheme);
    expect(result.current.cycleTheme).toBe(firstCycleTheme);
  });

  describe('one-time cookie migration on the web', () => {
    it('moves the pre-record cookie choice into the client facts once', async () => {
      fetchMock.mockResolvedValueOnce(Response.json({ theme: Theme.BLACK }));
      const { result } = renderHook(() => useTheme(), { wrapper });

      expect(result.current.themeWithSystem).toBeNull();
      await waitFor(() => {
        expect(result.current.themeWithSystem).toBe(Theme.BLACK);
      });
      expect(fetchMock).toHaveBeenCalledWith(themeMigrationAction, { method: 'POST' });
      expect(readClientFacts().theme).toBe(Theme.BLACK);
    });

    it('records System when the visitor had no cookie, so it never asks again', async () => {
      renderHook(() => useTheme(), { wrapper });

      await waitFor(() => {
        expect(readClientFacts().theme).toBe('system');
      });
      forgetClientFacts();
      renderHook(() => useTheme(), { wrapper });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('retries on a later load when the request fails', async () => {
      fetchMock.mockResolvedValueOnce(new Response(undefined, { status: 503 }));
      renderHook(() => useTheme(), { wrapper });

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });
      expect(readClientFacts().theme).toBeUndefined();
    });

    it('does not ask once a choice is stored', () => {
      storeTheme(Theme.DARK);
      renderHook(() => useTheme(), { wrapper });

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('desktop target', () => {
    beforeEach(() => {
      vi.stubEnv('TAU_TARGET', 'desktop');
    });

    it('never asks the server to migrate a cookie', () => {
      renderHook(() => useTheme(), { wrapper });

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('keeps the native app icon aligned with the resolved local theme', async () => {
      storeTheme(Theme.LIGHT);
      const { result } = renderHook(() => useTheme(), { wrapper });

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

    it('ignores a corrupted stored record', () => {
      store.set(clientFactsStorageKey, JSON.stringify({ v: 1, theme: 'chartreuse' }));
      forgetClientFacts();

      const { result } = renderHook(() => useTheme(), { wrapper });

      expect(result.current.themeWithSystem).toBeNull();
      expect(result.current.theme).toBe(Theme.LIGHT);
    });
  });
});
