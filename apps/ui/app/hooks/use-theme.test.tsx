import { act, renderHook } from '@testing-library/react';
import { Theme } from 'remix-themes';
import type * as RemixThemes from 'remix-themes';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ThemeWithSystem } from '#hooks/use-theme.js';
import { useTheme } from '#hooks/use-theme.js';

type ThemeDefinedBy = RemixThemes.ThemeMetadata['definedBy'];
type CycleThemeCase = {
  resolvedTheme: Theme;
  definedBy: ThemeDefinedBy;
  expectedNextTheme: ThemeWithSystem;
};

const { mockSetRemixTheme, remixThemeState } = vi.hoisted(() => ({
  mockSetRemixTheme: vi.fn(),
  remixThemeState: {
    resolvedTheme: null as ThemeWithSystem,
    definedBy: 'SYSTEM' as ThemeDefinedBy,
  },
}));

vi.mock('remix-themes', async (importOriginal) => {
  const actual = await importOriginal<typeof RemixThemes>();

  return {
    ...actual,
    useTheme: () => [remixThemeState.resolvedTheme, mockSetRemixTheme, { definedBy: remixThemeState.definedBy }],
  };
});

function setRemixThemeState({
  resolvedTheme,
  definedBy,
}: {
  resolvedTheme: ThemeWithSystem;
  definedBy: ThemeDefinedBy;
}): void {
  remixThemeState.resolvedTheme = resolvedTheme;
  remixThemeState.definedBy = definedBy;
}

function writeDocumentCookie(cookie: string): void {
  // oxlint-disable-next-line unicorn/no-document-cookie -- this regression test intentionally seeds a stale legacy browser cookie
  document.cookie = cookie;
}

function readDocumentCookie(): string {
  // oxlint-disable-next-line unicorn/no-document-cookie -- this assertion proves the stale legacy cookie exists before the hook ignores it
  return document.cookie;
}

describe('useTheme', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeDocumentCookie('tau-color-theme=; Max-Age=0; Path=/');
    setRemixThemeState({ resolvedTheme: null, definedBy: 'SYSTEM' });
  });

  it.each([
    { resolvedTheme: Theme.LIGHT, expectedName: 'Light' },
    { resolvedTheme: Theme.DARK, expectedName: 'Dark' },
  ])('should report $expectedName when remix-themes metadata is user-defined', ({ resolvedTheme, expectedName }) => {
    setRemixThemeState({ resolvedTheme, definedBy: 'USER' });

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe(resolvedTheme);
    expect(result.current.ssrTheme).toBe(resolvedTheme);
    expect(result.current.themeWithSystem).toBe(resolvedTheme);
    expect(result.current.currentOption.name).toBe(expectedName);
  });

  it('should report system while preserving the resolved theme when remix-themes metadata is system-defined', () => {
    setRemixThemeState({ resolvedTheme: Theme.DARK, definedBy: 'SYSTEM' });

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe(Theme.DARK);
    expect(result.current.ssrTheme).toBe(Theme.DARK);
    expect(result.current.themeWithSystem).toBeNull();
    expect(result.current.currentOption.name).toBe('System');
  });

  it.each([
    { resolvedTheme: Theme.LIGHT, definedBy: 'USER', expectedNextTheme: Theme.DARK },
    { resolvedTheme: Theme.DARK, definedBy: 'USER', expectedNextTheme: null },
    { resolvedTheme: Theme.DARK, definedBy: 'SYSTEM', expectedNextTheme: Theme.LIGHT },
  ] satisfies CycleThemeCase[])(
    'should cycle to $expectedNextTheme when current theme is $resolvedTheme defined by $definedBy',
    ({ resolvedTheme, definedBy, expectedNextTheme }) => {
      setRemixThemeState({ resolvedTheme, definedBy });
      const { result } = renderHook(() => useTheme());

      act(() => {
        result.current.cycleTheme();
      });

      expect(mockSetRemixTheme).toHaveBeenCalledWith(expectedNextTheme);
    },
  );

  it('should ignore a stale legacy tau-color-theme cookie', () => {
    writeDocumentCookie('tau-color-theme=%22light%22; Path=/');
    setRemixThemeState({ resolvedTheme: Theme.DARK, definedBy: 'SYSTEM' });

    const { result } = renderHook(() => useTheme());

    expect(readDocumentCookie()).toContain('tau-color-theme');
    expect(result.current.theme).toBe(Theme.DARK);
    expect(result.current.themeWithSystem).toBeNull();
    expect(result.current.currentOption.name).toBe('System');
  });

  it('should keep returned callbacks stable when remix-themes state is unchanged', () => {
    setRemixThemeState({ resolvedTheme: Theme.LIGHT, definedBy: 'USER' });
    const { result, rerender } = renderHook(() => useTheme());

    const firstSetTheme = result.current.setTheme;
    const firstCycleTheme = result.current.cycleTheme;

    rerender();

    expect(result.current.setTheme).toBe(firstSetTheme);
    expect(result.current.cycleTheme).toBe(firstCycleTheme);
  });
});
