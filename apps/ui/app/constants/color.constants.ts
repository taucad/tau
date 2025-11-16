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
export const hueCssVariable = '--hue-primary';
export const defaultHue = 180;
export const defaultLightness = 0.5719;
export const defaultChroma = 0.1898;

export const axesColors = {
  x: 'oklch(0.7 0.12 22.5)',
  y: 'oklch(0.7 0.12 135)',
  z: 'oklch(0.7 0.12 255)',
};
