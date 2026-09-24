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

/** Machine body tints. */
export const printerBody = {
  frame: { light: '#5b6470', dark: '#9aa3ad' },
  base: { light: '#2b2f36', dark: '#23272d' },
  glass: { light: '#7fa5bc', dark: '#8fb2c9' },
  plate: { light: '#3b4048', dark: '#2f343b' },
  plateGrid: { light: '#6b7280', dark: '#4b515a' },
  envelope: printerAccent,
  rail: '#7c8792',
  beam: '#8d97a1',
  carriage: '#b3bcc6',
  nozzle: '#d9c27a',
  nozzleGlow: '#ff7a2a',
  materialUnit: '#d8dde3',
  spool: '#6f7a86',
  chute: '#3f454d',
  lightOn: '#fff2c4',
  lightOff: '#4a4f57',
} as const;

/** Segment-kind tints that do not derive from the filament colour. */
export const printerToolpath = {
  support: '#8a8f98',
  skirt: '#9aa3ad',
  brim: '#9aa3ad',
  purge: '#e0a15a',
  travel: { light: '#c9ced6', dark: '#3a3f47' },
  unknown: '#b45fc9',
  /** Layers below the active one drift toward this with depth. */
  muted: { light: '#dfe3e8', dark: '#2a2f36' },
  /** The active layer and the fresh-filament trail brighten toward this. */
  highlight: '#ffffff',
} as const;

/* oxlint-enable tau-lint/no-hardcoded-color */
