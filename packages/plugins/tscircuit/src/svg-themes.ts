/**
 * Colour themes for the schematic and PCB views.
 *
 * circuit-to-svg defaults to KiCad's engineering colours: a beige schematic with maroon symbols,
 * and a PCB with red top copper and magenta drills. Tau's themes keep that palette one option
 * away and default to cleaner looks:
 *
 * - Schematic `light` and `dark`: neutral paper or ink-dark background, slate symbols, green wires
 *   and blue reference designators.
 * - PCB `fabrication`: the board as fabricated, in its own solder mask colour, with gold (ENIG)
 *   pads, mask-tinted traces, white silkscreen and dark drills.
 */

import type { Rgb } from '#board-colors.js';
import { boardColorsOf, lighten } from '#board-colors.js';

/** The schematic view's colour theme. @public */
export type SchematicTheme = 'light' | 'dark' | 'engineering';

/** The PCB view's palette. @public */
export type PcbPalette = 'fabrication' | 'engineering';

type SchematicColors = Record<string, string>;

/* eslint-disable @typescript-eslint/naming-convention -- circuit-to-svg's schematic colour map keys are snake_case. */
const lightSchematic: SchematicColors = {
  background: 'rgb(250, 250, 248)',
  component_body: 'rgb(253, 249, 236)',
  component_outline: 'rgb(42, 52, 69)',
  pin: 'rgb(42, 52, 69)',
  pin_name: 'rgb(42, 52, 69)',
  pin_number: 'rgb(120, 129, 143)',
  reference: 'rgb(29, 94, 176)',
  value: 'rgb(88, 98, 114)',
  wire: 'rgb(23, 128, 92)',
  wire_crossing: 'rgb(23, 128, 92)',
  junction: 'rgb(23, 128, 92)',
  bus: 'rgb(29, 94, 176)',
  bus_junction: 'rgb(29, 94, 176)',
  net_name: 'rgb(88, 98, 114)',
  label_local: 'rgb(42, 52, 69)',
  label_global: 'rgb(171, 68, 36)',
  label_hier: 'rgb(132, 96, 12)',
  label_background: 'rgba(255, 255, 255, 0.7)',
  no_connect: 'rgb(171, 68, 36)',
  note: 'rgb(29, 94, 176)',
  sheet: 'rgb(178, 184, 194)',
  sheet_label: 'rgb(88, 98, 114)',
  sheet_name: 'rgb(42, 52, 69)',
  worksheet: 'rgb(178, 184, 194)',
  grid: 'rgb(226, 228, 232)',
};

const darkSchematic: SchematicColors = {
  background: 'rgb(23, 25, 30)',
  component_body: 'rgb(38, 42, 52)',
  component_outline: 'rgb(203, 210, 222)',
  pin: 'rgb(203, 210, 222)',
  pin_name: 'rgb(203, 210, 222)',
  pin_number: 'rgb(128, 138, 154)',
  reference: 'rgb(122, 178, 255)',
  value: 'rgb(160, 169, 184)',
  wire: 'rgb(74, 201, 148)',
  wire_crossing: 'rgb(74, 201, 148)',
  junction: 'rgb(74, 201, 148)',
  bus: 'rgb(122, 178, 255)',
  bus_junction: 'rgb(122, 178, 255)',
  net_name: 'rgb(160, 169, 184)',
  label_local: 'rgb(203, 210, 222)',
  label_global: 'rgb(255, 152, 118)',
  label_hier: 'rgb(230, 190, 90)',
  label_background: 'rgba(23, 25, 30, 0.7)',
  no_connect: 'rgb(255, 152, 118)',
  note: 'rgb(122, 178, 255)',
  sheet: 'rgb(74, 80, 92)',
  sheet_label: 'rgb(160, 169, 184)',
  sheet_name: 'rgb(203, 210, 222)',
  worksheet: 'rgb(74, 80, 92)',
  grid: 'rgb(44, 48, 56)',
};
/* eslint-enable @typescript-eslint/naming-convention -- the snake_case colour maps end here. */

/**
 * The converter writes a few colours into its own `<style>` block (text, symbol strokes, chip
 * fill) rather than reading the colour map; this CSS restyles those classes to the theme.
 *
 * `.boundary` is the sheet's background rectangle. Its outline, in the theme's sheet colour and a
 * constant width on screen, sets the sheet apart from the viewer's grid behind it.
 */
const schematicCss = (colors: SchematicColors): string => `
  .boundary { stroke: ${colors['sheet']}; stroke-width: 1.5px; vector-effect: non-scaling-stroke; }
  .component, .component-pin { stroke: ${colors['component_outline']}; }
  .chip { fill: ${colors['component_body']}; stroke: ${colors['component_outline']}; }
  .text { fill: ${colors['value']}; }
  .pin-number { fill: ${colors['pin_number']}; }
  .port-label, .component-name { fill: ${colors['reference']}; }
`;

/** The circuit-to-svg schematic options for a theme; `engineering` keeps circuit-to-svg's defaults. */
export const schematicThemeOptions = (
  theme: SchematicTheme = 'light',
): { colorOverrides: { schematic: SchematicColors }; css?: string } => {
  if (theme === 'engineering') {
    return { colorOverrides: { schematic: { junction: 'rgb(0, 105, 0)', wire: 'rgb(0, 105, 0)' } } };
  }
  const colors = theme === 'dark' ? darkSchematic : lightSchematic;
  return { colorOverrides: { schematic: colors }, css: schematicCss(colors) };
};

const css = ([r, g, b]: Rgb): string => `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;

/** ENIG gold for exposed pads, as the 3D board's default finish. */
const enigPad: Rgb = [0.86, 0.68, 0.32];

/**
 * The circuit-to-svg PCB options for a palette. `fabrication` draws the top side as fabricated: solder
 * mask over the traces, so only pads show copper. `engineering` keeps circuit-to-svg's defaults.
 */
export const pcbPaletteOptions = (
  palette: PcbPalette = 'fabrication',
  circuitJson: ReadonlyArray<{ type: string }> = [],
): { colorOverrides?: Record<string, unknown>; showSolderMask?: boolean; layer?: 'top'; backgroundColor?: string } => {
  if (palette === 'engineering') {
    return {};
  }
  const board = circuitJson.find((element) => element.type === 'pcb_board') as Record<string, unknown> | undefined;
  const { maskColor, bottomMaskColor, silkColor, bottomSilkColor } = boardColorsOf(board);
  const colorOverrides = {
    copper: { top: css(enigPad), bottom: css(lighten(enigPad, 0.15)) },
    soldermask: { top: css(maskColor), bottom: css(bottomMaskColor) },
    soldermaskOverCopper: { top: css(lighten(maskColor, 0.16)), bottom: css(lighten(bottomMaskColor, 0.16)) },
    soldermaskWithCopperUnderneath: { top: css(lighten(maskColor, 0.16)), bottom: css(lighten(bottomMaskColor, 0.16)) },
    silkscreen: { top: css(silkColor), bottom: css(bottomSilkColor) },
    substrate: 'rgb(201, 172, 120)',
    drill: 'rgb(28, 28, 30)',
    boardOutline: 'rgba(255, 255, 255, 0.35)',
  };
  // The converter draws the mask at 80% opacity over the background, so the background is the mask too.
  return { colorOverrides, showSolderMask: true, layer: 'top', backgroundColor: css(maskColor) };
};
