import { Color } from 'three';
import type { StudioDome, StudioEmitter } from '#components/geometry/loader/metal-morph-environment.js';

/**
 * Three.js scene values for the glass prism loader. Radiometric and dimensionless, consumed by the renderer
 * rather than by UI chrome, so they live beside the shader instead of in CSS tokens.
 */

/** Studio design for one theme: what the glass reflects and refracts. */
export type GlassPrismStudio = Readonly<{
  dome: StudioDome;
  emitters: readonly StudioEmitter[];
}>;

const white = new Color(1, 1, 1);
const scaled = (color: Color, intensity: number): Color => color.clone().multiplyScalar(intensity);

/**
 * A studio for glass wants structure more than softness: long thin strips at several angles, so a refracted
 * view bends and splits visible lines, plus one broad window for the body's inner glow. In the dark the
 * strips are lights; on a light page they are black cards, because glass over white reads by what it darkens.
 */
const strips = (color: Color, intensity: number, windowColor: Color): StudioEmitter[] => [
  // Tall strip front-right, the main line.
  { color: scaled(color, intensity), position: [9, 6, 12], width: 0.7, height: 18 },
  // Long horizontal strip overhead, seen bending through the lens and the droplet.
  { color: scaled(color, intensity * 0.8), position: [0, 15, 3], width: 22, height: 0.6 },
  // Diagonal strip behind and left, so the back faces carry a line of their own.
  { color: scaled(color, intensity * 0.55), position: [-13, 7, -9], width: 0.6, height: 16 },
  // Low strip behind, catching the pavilion of the brilliant.
  { color: scaled(color, intensity * 0.45), position: [4, -6, -14], width: 14, height: 0.5 },
  // A broad soft window front-left keeps the interior from going flat.
  { color: windowColor, position: [-11, 3, 11], width: 12, height: 9 },
];

const black = new Color(0.01, 0.01, 0.012);

export const glassPrismStudios: Readonly<Record<'dark' | 'light', GlassPrismStudio>> = {
  dark: {
    dome: {
      bottom: new Color(0.012, 0.012, 0.016),
      horizon: new Color(0.09, 0.095, 0.11),
      top: new Color(0.2, 0.21, 0.25),
    },
    emitters: strips(white, 5.5, scaled(white, 1.2)),
  },
  light: {
    // A grey studio, not a white one: over a white page the glass is read by what it darkens.
    dome: { bottom: new Color(0.2, 0.2, 0.22), horizon: new Color(0.58, 0.59, 0.62), top: new Color(0.98, 0.98, 1.02) },
    emitters: strips(black, 1, scaled(white, 2.2)),
  },
};

/**
 * Refractive index per display channel, red, green and blue, for the body's own dispersion. Wider apart than
 * a real flint so the fringes read at spinner sizes; the light sheet carries the physically ordered spectrum.
 */
export const glassPrismChannelIndices: readonly [number, number, number] = [1.56, 1.6, 1.66];

/** Linear transmittance tint of the glass, faintly cool like float glass seen edge on. */
export const glassPrismTint = new Color(0.9, 0.97, 1);
