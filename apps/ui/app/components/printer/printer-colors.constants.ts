/**
 * Three.js tints for the printer simulation scene.
 *
 * Scene colours are material constants, not CSS tokens (UI policy §2). Every
 * value is sRGB hex consumed by `THREE.Color`; the theme picks the background
 * and the grey ramp so the machine reads on both surfaces.
 *
 * @module
 */

/* oxlint-disable tau-lint/no-hardcoded-color -- Three.js material tints */

/** Canvas clear colour per resolved theme; matches the app surfaces. */
export const printerBackground = { light: '#f5f5f5', dark: '#171717' } as const;

/** Default filament when no loaded material reports a colour: the brand teal. */
export const printerAccent = '#14b8a6';

/** Physical hardware finishes, independent of the interface theme. */
export const printerHardwareColors = {
  aluminium: '#a8abae',
  steel: '#888e93',
  graphite: '#25282a',
  carbon: '#303234',
  miniHousing: '#dadbd7',
  glass: '#647176',
} as const;

/** Machine body tints. */
export const printerBody = {
  frame: { light: '#5b6470', dark: '#9aa3ad' },
  base: { light: '#2b2f36', dark: '#23272d' },
  glass: { light: '#7fa5bc', dark: '#8fb2c9' },
  plateGrid: { light: '#6b7280', dark: '#4b515a' },
  envelope: printerAccent,
  rail: '#7c8792',
  beam: '#8d97a1',
  carriage: '#b3bcc6',
  nozzle: '#bab5af',
  nozzleGlow: '#ff7a2a',
  /** The material unit sits at the top of the frame as context, so it stays close to the background. */
  materialUnit: { light: '#d8dde3', dark: '#2c3238' },
  spool: { light: '#b9c1ca', dark: '#3b424a' },
  chute: '#3f454d',
  lightOn: '#fff2c4',
  lightOff: '#4a4f57',
} as const;

/** Segment-kind tints that do not derive from the filament colour. */
export const printerToolpath = {
  support: '#8a8f98',
  skirt: '#9aa3ad',
  brim: '#9aa3ad',
  /**
   * The start sequence and purge extrusion, at every height and on the active layer alike: a dark umber
   * that contrasts with gold; dark coatings use the lighter umber below.
   */
  preparation: '#472a0d',
  preparationOnDark: '#b58a61',
  travel: { light: '#c9ced6', dark: '#3a3f47' },
  unknown: '#b45fc9',
  /**
   * Layers below the active one drift toward this with depth. Both themes drift toward shade, which reads
   * against the plate surface: a light target washed the whole print out to pink on the light theme.
   */
  muted: { light: '#3b4048', dark: '#2a2f36' },
  /** The active layer and the fresh-filament trail brighten toward this. */
  highlight: '#ffffff',
} as const;

/* oxlint-enable tau-lint/no-hardcoded-color */
