import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { useCookie } from '@/utils/cookies';
import { CSSProperties } from 'react';
import {
  serializeHex,
  serializeRgb,
  Hsl,
  serializeHsl,
  Rgb,
  Oklch,
  convertOklabToRgb,
  convertLchToLab,
  convertRgbToHsl,
} from 'culori/fn';

/**
 * Colors are defined in OKLCH space.
 * The hue is the hue in the OKLCH space.
 * The chroma is the chroma in the OKLCH space.
 * The lightness is the lightness in the OKLCH space.
 *
 * Other colors are derived from the primary OKLCH color.
 *
 * The hue is the hue in the OKLCH space.
 */

const COLOR_COOKIE_NAME = 'tau-color-hue';
const HUE_CSS_VAR = '--hue-primary';
const DEFAULT_HUE = 266;
const DEFAULT_LIGHTNESS = 0.5719;
const DEFAULT_CHROMA = 0.1898;

const getRootColorStyle = (hue: number) => {
  return { [HUE_CSS_VAR]: `${hue}deg` } as CSSProperties;
};

interface ColorContextType {
  serialized: {
    hex: string;
    rgb: string;
    hsl: string;
  };
  raw: {
    hsl: Hsl;
    rgb: Rgb;
    oklch: Oklch;
  };
  hue: number;
  setHue: (hue: number) => void;
  resetHue: () => void;
  rootStyles: CSSProperties;
}

const ColorContext = createContext<ColorContextType | undefined>(undefined);

export function ColorProvider({ children }: { children: React.ReactNode }) {
  const [hue, setHue] = useCookie(COLOR_COOKIE_NAME, DEFAULT_HUE, {
    parse: Number,
    stringify: String,
  });

  // Update styles whenever the colorCookie changes
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty(HUE_CSS_VAR, `${hue}deg`);
  }, [hue]);

  const resetHue = useCallback(() => {
    setHue(DEFAULT_HUE);
  }, [setHue]);

  const colors = useMemo(() => {
    // const computedHue = computeHue(hue);
    const oklch = {
      l: DEFAULT_LIGHTNESS,
      c: DEFAULT_CHROMA,
      h: hue,
      mode: 'oklch',
    } as const satisfies Oklch;

    const rgb = convertOklabToRgb(convertLchToLab(oklch));
    const hsl = convertRgbToHsl(rgb);

    const raw = {
      hsl,
      rgb,
      oklch,
    };

    const serialized = {
      hex: serializeHex(rgb) as string,
      rgb: serializeRgb(rgb) as string,
      hsl: serializeHsl(hsl) as string,
      oklch: `oklch(${oklch.l} ${oklch.c} ${oklch.h})`,
    };

    return {
      serialized,
      raw,
      rootStyles: getRootColorStyle(Number(hue)),
    };
  }, [hue]);

  return (
    <ColorContext.Provider
      value={{
        hue,
        setHue,
        resetHue,
        ...colors,
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
