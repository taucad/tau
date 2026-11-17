import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { isDesktopTarget } from '#lib/build-target.js';
import { setDesktopAppIconTheme } from '@taucad/files-ui/filesystem/desktop-bridge';
import { clientFactsScript, readClientFacts, subscribeClientFacts, writeClientFacts } from '#lib/client-facts.js';

/* eslint-disable @typescript-eslint/naming-convention -- Preserve the existing enum-style public API with erasable object syntax. */
export const Theme = {
  LIGHT: 'light',
  DARK: 'dark',
  BLACK: 'black',
  HIGH_CONTRAST: 'high-contrast',
} as const;
/* eslint-enable @typescript-eslint/naming-convention -- Re-enable project naming checks. */

export const themeSchema = z.enum([Theme.LIGHT, Theme.DARK, Theme.BLACK, Theme.HIGH_CONTRAST]);
export type Theme = z.infer<typeof themeSchema>;

// Null is used to represent the system theme
// oxlint-disable-next-line @typescript-eslint/no-restricted-types -- null is used to represent the system theme, as it's serializable in JSON
export type ThemeWithSystem = Theme | null;
export const themePreferenceSchema = z.strictObject({ theme: themeSchema.nullable() });

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
    id: Theme.BLACK,
    name: 'Black',
    description: 'True black with ultra-dark surfaces',
  },
  {
    id: Theme.HIGH_CONTRAST,
    name: 'High Contrast',
    description: 'Stronger text, borders, and focus indicators',
  },
  {
    id: null,
    name: 'System',
    description: 'Follow your system preference',
  },
];

type ThemeMetadata = {
  definedBy: 'USER' | 'SYSTEM';
};

type ThemeState = {
  theme?: Theme;
  metadata: ThemeMetadata;
};

type ThemeContextValue = ThemeState & {
  prefersMoreContrast: boolean;
  setTheme: (theme: ThemeWithSystem) => void;
};

const missingThemeProvider = (): never => {
  throw new Error('Theme changes require a ThemeProvider');
};
const ThemeContext = createContext<ThemeContextValue>({
  theme: Theme.LIGHT,
  metadata: { definedBy: 'USER' },
  prefersMoreContrast: false,
  setTheme: missingThemeProvider,
});
const prefersLightMediaQuery = '(prefers-color-scheme: light)';
const prefersMoreContrastMediaQuery = '(prefers-contrast: more)';

export const isTheme = (value: unknown): value is Theme => themeSchema.safeParse(value).success;

const getPreferredTheme = (): Theme =>
  globalThis.matchMedia(prefersLightMediaQuery).matches ? Theme.LIGHT : Theme.DARK;

/** The stored choice: `undefined` = never chose, `null` = an explicit System choice. */
const readStoredTheme = (): ThemeWithSystem | undefined => {
  const stored = readClientFacts().theme;
  return stored === 'system' ? null : stored;
};

/** Where a web visitor's theme cookie from before the client-facts record is moved into it, once (P2). */
export const themeMigrationAction = '/action/migrate-theme';

const stateFor = (preference: ThemeWithSystem | undefined): ThemeState => ({
  theme: preference ?? (import.meta.env.SSR ? undefined : getPreferredTheme()),
  metadata: { definedBy: preference === null || preference === undefined ? 'SYSTEM' : 'USER' },
});

/**
 * Move the theme a web visitor chose before the client-facts record from its `HttpOnly` cookie into the record, once
 * per device. That first load paints the system theme, so a choice that differs from the OS flashes once.
 *
 * @returns The migrated preference, or `undefined` when the request failed and should be retried on a later load.
 */
const migrateThemeCookie = async (): Promise<ThemeWithSystem | undefined> => {
  try {
    const response = await fetch(themeMigrationAction, { method: 'POST' });
    if (response.status === 404) {
      // A build without the route (`tau serve`) has no cookie to move.
      return null;
    }
    if (!response.ok) {
      return undefined;
    }
    const parsed = themePreferenceSchema.safeParse(await response.json());
    return parsed.success ? parsed.data.theme : null;
  } catch {
    return undefined;
  }
};

/**
 * The theme preference and its resolved theme. The choice is a client fact (`#lib/client-facts`): the head script
 * applies it to `<html>` before first paint, the server renders no theme, and the first client render reads the same
 * stored choice, so `<html>`'s class hydrates as the script set it. Other tabs follow through the record's `storage`
 * event.
 */
export const ThemeProvider = ({
  children,
  initialTheme,
}: {
  readonly children: ReactNode;
  /** A theme this subtree starts in instead of the stored choice: calibration pages and visual tests. */
  readonly initialTheme?: Theme;
}): React.JSX.Element => {
  const [state, setState] = useState<ThemeState>(() => stateFor(initialTheme ?? readStoredTheme()));
  const [prefersMoreContrast, setPrefersMoreContrast] = useState(
    () => !import.meta.env.SSR && globalThis.matchMedia(prefersMoreContrastMediaQuery).matches,
  );

  /* Another tab's choice. */
  useEffect(
    () =>
      subscribeClientFacts(() => {
        const stored = readStoredTheme();
        setState((current) => {
          const next = stateFor(stored);
          return current.theme === next.theme && current.metadata.definedBy === next.metadata.definedBy
            ? current
            : next;
        });
      }),
    [],
  );

  useEffect(() => {
    if (isDesktopTarget() || readClientFacts().theme !== undefined) {
      return;
    }
    let isCurrent = true;
    // async-iife: bootstrap — a failed migration is retried on the next load.
    void (async () => {
      const migrated = await migrateThemeCookie();
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- cleanup can flip isCurrent while the POST is pending
      if (migrated === undefined || !isCurrent || readClientFacts().theme !== undefined) {
        return;
      }
      writeClientFacts({ theme: migrated ?? 'system' });
      setState(stateFor(migrated));
    })();
    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    const mediaQuery = globalThis.matchMedia(prefersMoreContrastMediaQuery);
    const handleChange = ({ matches }: MediaQueryListEvent): void => {
      setPrefersMoreContrast(matches);
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  useEffect(() => {
    if (state.metadata.definedBy === 'USER') {
      return;
    }

    const mediaQuery = globalThis.matchMedia(prefersLightMediaQuery);
    const handleChange = ({ matches }: MediaQueryListEvent): void => {
      setState({ theme: matches ? Theme.LIGHT : Theme.DARK, metadata: { definedBy: 'SYSTEM' } });
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, [state.metadata.definedBy]);

  useEffect(() => {
    if (isDesktopTarget() && state.theme) {
      setDesktopAppIconTheme(state.theme === Theme.LIGHT ? 'light' : 'dark');
    }
  }, [state.theme]);

  const setTheme = useCallback((theme: ThemeWithSystem) => {
    setState(stateFor(theme));
    writeClientFacts({ theme: theme ?? 'system' });
  }, []);

  const value = useMemo(() => ({ ...state, prefersMoreContrast, setTheme }), [prefersMoreContrast, setTheme, state]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

type UseThemeReturn = {
  /** The resolved color scheme used by integrations that support only light or dark. */
  theme: typeof Theme.LIGHT | typeof Theme.DARK;
  /** The resolved app theme. Null only during SSR when following the system preference. */
  ssrTheme: ThemeWithSystem;
  /** The user's theme preference including the system, Black, and High Contrast options. */
  themeWithSystem: ThemeWithSystem;
  /** Whether the explicit theme or operating-system preference requests increased contrast. */
  isHighContrast: boolean;
  setTheme: (theme: ThemeWithSystem) => void;
  cycleTheme: () => void;
  currentOption: ThemeOption;
};

/** Manages the resolved color scheme and the user's app-theme preference. */
export const useTheme = (): UseThemeReturn => {
  const context = useContext(ThemeContext);
  const { theme: appTheme, metadata, prefersMoreContrast, setTheme } = context;
  const theme = appTheme === Theme.BLACK || appTheme === Theme.HIGH_CONTRAST ? Theme.DARK : (appTheme ?? Theme.LIGHT);
  const themeWithSystem: ThemeWithSystem = metadata.definedBy === 'SYSTEM' ? null : (appTheme ?? null);
  const isHighContrast = appTheme === Theme.HIGH_CONTRAST || prefersMoreContrast;

  const cycleTheme = useCallback(() => {
    let newTheme: ThemeWithSystem;
    switch (themeWithSystem) {
      case Theme.LIGHT: {
        newTheme = Theme.DARK;
        break;
      }
      case Theme.DARK: {
        newTheme = Theme.BLACK;
        break;
      }
      case Theme.BLACK: {
        newTheme = Theme.HIGH_CONTRAST;
        break;
      }
      case Theme.HIGH_CONTRAST: {
        newTheme = null;
        break;
      }
      default: {
        newTheme = Theme.LIGHT;
      }
    }

    setTheme(newTheme);
  }, [themeWithSystem, setTheme]);

  const currentOption = themeOptions.find((option) => option.id === themeWithSystem) ?? themeOptions.at(-1)!;

  return {
    theme,
    ssrTheme: appTheme ?? null,
    themeWithSystem,
    isHighContrast,
    setTheme,
    cycleTheme,
    currentOption,
  };
};

/**
 * The client-facts head script and the color-scheme declaration, before any stylesheet in `<head>`. The script is the
 * same for every visitor and every build; its CSP hash is listed in `#lib/inline-script-hashes`.
 *
 * @returns The head elements.
 */
export const ClientFactsHead = (): React.JSX.Element => (
  <>
    <meta name='color-scheme' content='light dark' />
    {/* oxlint-disable-next-line react/no-danger -- static inline script must run before first paint to apply the client facts */}
    <script dangerouslySetInnerHTML={{ __html: clientFactsScript }} suppressHydrationWarning />
  </>
);
