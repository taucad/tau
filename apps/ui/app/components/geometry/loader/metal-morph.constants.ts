import { Color } from 'three';

/**
 * Three.js scene colours for the metal morph loader. They live here rather than in CSS tokens because they
 * are linear-light radiometric values consumed by the renderer, not UI chrome (see `docs/policy/ui-policy.md`).
 */

/** Linear base reflectance of the body: polished platinum-steel, bright without blowing out. */
export const metalMorphBodyColor = new Color(0.8, 0.81, 0.83);

/** Environment palettes are HDR radiance values; emitters exceed 1 so chrome shows crisp highlights. */
export type MetalMorphEnvironmentPalette = Readonly<{
  /** Dome radiance from the floor, through the horizon, to the zenith. */
  domeBottom: Color;
  domeHorizon: Color;
  domeTop: Color;
  /** Large soft key light above and in front of the body. */
  keyIntensity: number;
  /** Long thin strip behind and to the side of the body, the signature specular streak. */
  rimIntensity: number;
  /** Broad low-intensity fill opposite the key. */
  fillIntensity: number;
  /** Brand accent strip; teal so a few facets pick up Tau's hue without tinting the whole body. */
  accentColor: Color;
  accentIntensity: number;
  /** Matte black cards that give a mirror surface dark reflections to read its shape against. */
  cardRadiance: Color;
}>;

export const metalMorphAccentColor = new Color(0.1, 0.78, 0.7);

export const metalMorphEnvironmentPalettes: Readonly<Record<'dark' | 'light', MetalMorphEnvironmentPalette>> = {
  dark: {
    domeBottom: new Color(0.02, 0.02, 0.024),
    domeHorizon: new Color(0.3, 0.31, 0.34),
    domeTop: new Color(0.72, 0.74, 0.8),
    keyIntensity: 3.2,
    rimIntensity: 6,
    fillIntensity: 1.4,
    accentColor: metalMorphAccentColor,
    accentIntensity: 3,
    cardRadiance: new Color(0.004, 0.004, 0.004),
  },
  light: {
    domeBottom: new Color(0.16, 0.16, 0.17),
    domeHorizon: new Color(0.7, 0.71, 0.74),
    domeTop: new Color(1.5, 1.5, 1.55),
    keyIntensity: 3,
    rimIntensity: 5,
    fillIntensity: 1.2,
    accentColor: metalMorphAccentColor,
    accentIntensity: 2.5,
    cardRadiance: new Color(0.03, 0.03, 0.032),
  },
};
