import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { useCookie } from '@/utils/cookies';
import { CSSProperties } from 'react';
import { convertHslToRgb, serializeHex } from 'culori/fn';

const COLOR_COOKIE_NAME = 'tau-color-hue';
const DEFAULT_HUE = 242;
const OKLCH_TO_HSL_HUE_DIFF = 17.95;
const HUE_CSS_VAR = '--hue-primary';

const computeHue = (hue: number) => {
  return Number(hue) + OKLCH_TO_HSL_HUE_DIFF;
};

const getRootColorStyle = (hue: number) => {
  return { [HUE_CSS_VAR]: `${computeHue(hue)}deg` } as CSSProperties;
};

interface ColorContextType {
  hue: number;
  setHue: (hue: number) => void;
  resetHue: () => void;
  hex: string;
  rootStyles: CSSProperties;
}

const ColorContext = createContext<ColorContextType | undefined>(undefined);

export function ColorProvider({ children }: { children: React.ReactNode }) {
  const [colorCookie, setColorCookie] = useCookie(COLOR_COOKIE_NAME, DEFAULT_HUE, {
    parse: Number,
    stringify: String,
  });

  // Update styles whenever the colorCookie changes
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty(HUE_CSS_VAR, `${computeHue(colorCookie)}deg`);
  }, [colorCookie]);

  const setHue = useCallback(
    (hue: number) => {
      setColorCookie(hue);
    },
    [setColorCookie],
  );

  const resetHue = useCallback(() => {
    setColorCookie(DEFAULT_HUE);
  }, [setColorCookie]);

  const parsed = useMemo(() => {
    const computedHue = computeHue(colorCookie);

    return {
      hex: serializeHex(convertHslToRgb({ h: computedHue - OKLCH_TO_HSL_HUE_DIFF, s: 0.5, l: 0.65 })),
      rootStyles: getRootColorStyle(Number(colorCookie)),
    };
  }, [colorCookie]);

  return (
    <ColorContext.Provider
      value={{
        hue: colorCookie,
        setHue,
        resetHue,
        ...parsed,
      }}
    >
      {children}
    </ColorContext.Provider>
  );
}

export function useColor() {
  const context = useContext(ColorContext);
  if (!context) {
    throw new Error('useColor must be used within a ColorProvider');
  }
  return context;
}
