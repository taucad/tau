import type { CSSProperties, JSX, ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import type { Hsl, Rgb, Oklch } from 'culori/fn';
import {
  serializeHex,
  serializeRgb,
  serializeHsl,
  convertOklabToRgb,
  convertLchToLab,
  convertRgbToHsl,
} from 'culori/fn';
import { useCookie } from '~/hooks/use-cookie.js';
import { cookieName } from '~/constants/cookie.constants.js';

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

const hueCssVariable = '--hue-primary';
const defaultHue = 266;
const defaultLightness = 0.5719;
const defaultChroma = 0.1898;

const getRootColorStyle = (hue: number) => {
  return { [hueCssVariable]: `${hue}deg` };
};

type ColorContextType = {
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
};

const ColorContext = createContext<ColorContextType | undefined>(undefined);

export function ColorProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const [hue, setHue] = useCookie(cookieName.colorHue, defaultHue);

  // Update styles whenever the colorCookie changes
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty(hueCssVariable, `${hue}deg`);
  }, [hue]);

  const resetHue = useCallback(() => {
    setHue(defaultHue);
  }, [setHue]);

  const colors = useMemo(() => {
    // Const computedHue = computeHue(hue);
    const oklch = {
      l: defaultLightness,
      c: defaultChroma,
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
      hex: serializeHex(rgb),

      rgb: serializeRgb(rgb)!,

      hsl: serializeHsl(hsl)!,
      oklch: `oklch(${oklch.l} ${oklch.c} ${oklch.h})`,
    };

    return {
      serialized,
      raw,
      rootStyles: getRootColorStyle(Number(hue)),
    };
  }, [hue]);

  const value = useMemo(() => {
    return {
      hue,
      setHue,
      resetHue,
      ...colors,
    };
  }, [hue, setHue, resetHue, colors]);

  return <ColorContext.Provider value={value}>{children}</ColorContext.Provider>;
}

export function useColor(): ColorContextType {
  const context = useContext(ColorContext);
  if (!context) {
    throw new Error('useColor must be used within a ColorProvider');
  }

  return context;
}
