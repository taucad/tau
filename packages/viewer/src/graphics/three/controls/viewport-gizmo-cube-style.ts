import { Color, SRGBColorSpace } from 'three';
import { axesHelperColors } from '#graphics/three/overlay-colors.constants.js';

/** The cube's dimensions and texture density, independent of canvas pixel ratio. @internal */
export const viewportGizmoMetrics = { radius: 0.3, segments: 4, textureSize: 256, fontSize: 64 } as const;

/** Display colors resolved from the host's Tau tokens. @internal */
export type ViewportGizmoStyle = {
  readonly face: number;
  readonly bevel: number;
  readonly label: number;
  readonly hover: number;
  readonly hoverLabel: number;
  readonly font: string;
  readonly axes: Readonly<{ x: string; y: string; z: string }>;
};

// Achromatic OKLCH lightness maps to linear RGB as L³. These token-scale fallbacks also
// serve embedders that supply ViewerEnvironment without loading the Tau stylesheet.
const neutral = (lightness: number): number => new Color().setScalar(lightness ** 3).getHex();

/**
 * Resolve CSS colors to sRGB before passing them to Three, which cannot parse OKLCH.
 * @internal
 * @returns The host's neutral surfaces, accent, and legible label colors.
 */
export const readViewportGizmoStyle = ({
  container,
  colorScheme,
  isHighContrast,
  accentColor,
}: {
  readonly container: HTMLElement;
  readonly colorScheme: 'light' | 'dark';
  readonly isHighContrast: boolean;
  readonly accentColor: string;
}): ViewportGizmoStyle => {
  const styles = getComputedStyle(container);
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const readColor = (token: string, fallback: number): number => {
    const value = styles.getPropertyValue(token).trim();
    if (!context || !value || !CSS.supports('color', value)) {
      return fallback;
    }
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const [red = 0, green = 0, blue = 0] = context.getImageData(0, 0, 1, 1).data;
    return new Color().setRGB(red / 255, green / 255, blue / 255, SRGBColorSpace).getHex();
  };
  const isDark = colorScheme === 'dark';
  const hover = new Color(accentColor);
  const luminance = 0.2126 * hover.r + 0.7152 * hover.g + 0.0722 * hover.b;
  const label = readColor('--foreground', neutral(isDark ? (isHighContrast ? 1 : 0.95) : 0.16));
  // Preserve Tau's XYZ hues and lift their luminance on dark canvases so the small
  // orientation labels remain legible; the face palette stays achromatic.
  const axisColor = (value: string): string => new Color(value).lerp(new Color(label), isDark ? 0.3 : 0).getStyle();
  return {
    face: readColor(
      isDark ? (isHighContrast ? '--border' : '--accent') : '--border',
      neutral(isDark ? (isHighContrast ? 0.55 : 0.295) : 0.9),
    ),
    bevel: readColor(isDark ? '--neutral' : '--muted', neutral(isDark ? 0.47 : 0.965)),
    label,
    hover: hover.getHex(),
    // Choose the higher-contrast neutral for every user-selected accent, including very pale hues.
    hoverLabel: neutral(luminance > 0.179 ? 0 : 1),
    font: styles.getPropertyValue('--font-sans').trim() || "'Geist Sans', ui-sans-serif, system-ui, sans-serif",
    axes: { x: axisColor(axesHelperColors.x), y: axisColor(axesHelperColors.y), z: axisColor(axesHelperColors.z) },
  };
};
