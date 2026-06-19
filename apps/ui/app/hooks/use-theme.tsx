import { useCallback } from 'react';
import { Theme, useTheme as useRemixTheme } from 'remix-themes';

// oxlint-disable-next-line no-barrel-files/no-barrel-files -- re-export Theme enum so consumers don't need to depend on remix-themes directly
export { Theme } from 'remix-themes';

// Null is used to represent the system theme
// oxlint-disable-next-line @typescript-eslint/no-restricted-types -- null is used to represent the system theme, as it's serializable in JSON
export type ThemeWithSystem = Theme | null;

export type ThemeOption = {
  id: ThemeWithSystem;
  name: string;
  description: string;
};

export const themeOptions: ThemeOption[] = [
  {
    id: Theme.LIGHT,
    name: 'Light',
    description: 'A bright, clean look',
  },
  {
    id: Theme.DARK,
    name: 'Dark',
    description: 'Easy on the eyes',
  },
  {
    id: null,
    name: 'System',
    description: 'Follow your system preference',
  },
];

type UseThemeReturn = {
  /** The resolved theme - always 'light' or 'dark', never 'system' */
  theme: Theme;
  /** The raw resolved theme from remix-themes. Null during SSR when no preference is stored (system theme mode). */
  ssrTheme: ThemeWithSystem;
  /** The user's theme preference including 'system' (null) option */
  themeWithSystem: ThemeWithSystem;
  setTheme: (theme: ThemeWithSystem) => void;
  cycleTheme: () => void;
  currentOption: ThemeOption;
};

/**
 * Hook for managing theme state.
 *
 * @returns theme - The resolved theme, always 'light' or 'dark'
 * @returns themeWithSystem - The user's preference including 'system' (null)
 * @returns setTheme - Function to set the theme preference
 * @returns cycleTheme - Function to cycle through theme options
 * @returns currentOption - The current theme option object
 */
export function useTheme(): UseThemeReturn {
  const [resolvedTheme, setRemixTheme, metadata] = useRemixTheme();
  // ResolvedTheme from remix-themes is always defined as 'light' or 'dark' on the client.
  const theme = resolvedTheme ?? Theme.LIGHT;
  const themeWithSystem = metadata.definedBy === 'SYSTEM' ? null : theme;

  const setTheme = useCallback(
    (newTheme: ThemeWithSystem) => {
      setRemixTheme(newTheme);
    },
    [setRemixTheme],
  );

  const cycleTheme = useCallback(() => {
    let newTheme: ThemeWithSystem;
    if (themeWithSystem === Theme.LIGHT) {
      newTheme = Theme.DARK;
    } else if (themeWithSystem === Theme.DARK) {
      newTheme = null;
    } else {
      newTheme = Theme.LIGHT;
    }

    setTheme(newTheme);
  }, [themeWithSystem, setTheme]);

  const currentOption = themeOptions.find((option) => option.id === themeWithSystem) ?? themeOptions[2]!;

  return {
    theme,
    ssrTheme: resolvedTheme,
    themeWithSystem,
    setTheme,
    cycleTheme,
    currentOption,
  };
}
