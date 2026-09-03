import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';

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

const themeStateSchema = z.strictObject({
  theme: themeSchema,
  metadata: z.strictObject({ definedBy: z.enum(['USER', 'SYSTEM']) }),
});

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

export const ThemeProvider = ({
  children,
  specifiedTheme,
  themeAction,
}: {
  readonly children: ReactNode;
  readonly specifiedTheme: ThemeWithSystem;
  readonly themeAction: string;
}): React.JSX.Element => {
  const [state, setState] = useState<ThemeState>(() => ({
    theme: specifiedTheme ?? (import.meta.env.SSR ? undefined : getPreferredTheme()),
    metadata: { definedBy: specifiedTheme === null ? 'SYSTEM' : 'USER' },
  }));
  const [prefersMoreContrast, setPrefersMoreContrast] = useState(
    () => !import.meta.env.SSR && globalThis.matchMedia(prefersMoreContrastMediaQuery).matches,
  );
  const broadcastChannel = useRef<BroadcastChannel | undefined>(undefined);

  useEffect(() => {
    if (!('BroadcastChannel' in globalThis)) {
      return;
    }

    const channel = new globalThis.BroadcastChannel('tau-theme');
    const handleMessage = ({ data }: MessageEvent<unknown>): void => {
      const parsed = themeStateSchema.safeParse(data);
      if (!parsed.success) {
        return;
      }
      setState(parsed.data);
    };
    channel.addEventListener('message', handleMessage);
    broadcastChannel.current = channel;

    return () => {
      channel.removeEventListener('message', handleMessage);
      channel.close();
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

  const setTheme = useCallback(
    (theme: ThemeWithSystem) => {
      const nextState: ThemeState = {
        theme: theme ?? getPreferredTheme(),
        metadata: { definedBy: theme === null ? 'SYSTEM' : 'USER' },
      };
      setState(nextState);
      broadcastChannel.current?.postMessage(nextState);
      void fetch(themeAction, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ theme }),
      });
    },
    [themeAction],
  );

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

const clientThemeCode = String.raw`
(() => {
  const theme = window.matchMedia(${JSON.stringify(prefersLightMediaQuery)}).matches ? 'light' : 'dark';
  const classList = document.documentElement.classList;
  if (!classList.contains('light') && !classList.contains('dark') && !classList.contains('black') && !classList.contains('high-contrast')) {
    classList.add(theme);
  }
  const meta = document.querySelector('meta[name=color-scheme]');
  if (meta) meta.content = theme === 'light' ? 'light dark' : 'dark light';
})();
`;

export const PreventFlashOnWrongTheme = ({ hasSsrTheme }: { readonly hasSsrTheme: boolean }): React.JSX.Element => {
  const { theme } = useTheme();

  return (
    <>
      <meta name='color-scheme' content={theme === Theme.LIGHT ? 'light dark' : 'dark light'} />
      {hasSsrTheme ? null : (
        // oxlint-disable-next-line react/no-danger -- static inline script must run before hydration to prevent a theme flash
        <script dangerouslySetInnerHTML={{ __html: clientThemeCode }} suppressHydrationWarning />
      )}
    </>
  );
};
