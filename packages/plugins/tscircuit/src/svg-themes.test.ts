/* eslint-disable @typescript-eslint/naming-convention -- circuit JSON field names are snake_case. */
import { describe, expect, it } from 'vitest';

import { pcbPaletteOptions, schematicThemeOptions } from '#svg-themes.js';

describe('PCB palettes', () => {
  it('keeps circuit-to-svg defaults for the engineering palette', () => {
    expect(pcbPaletteOptions('engineering', [])).toEqual({});
  });

  it('draws the fabricated top side in the board mask colour by default', () => {
    const board: { type: string; solder_mask_color: string } = { type: 'pcb_board', solder_mask_color: 'blue' };
    const options = pcbPaletteOptions(undefined, [board]);
    expect(options).toMatchObject({ showSolderMask: true, layer: 'top', backgroundColor: 'rgb(8, 31, 107)' });
    expect(options.colorOverrides).toMatchObject({ soldermask: { top: 'rgb(8, 31, 107)' } });
  });

  it('defaults to a green mask with white silkscreen', () => {
    expect(pcbPaletteOptions('fabrication', []).colorOverrides).toMatchObject({
      soldermask: { top: 'rgb(8, 69, 31)' },
      silkscreen: { top: 'rgb(237, 237, 230)' },
    });
  });
});

describe('schematic themes', () => {
  it('keeps the engineering wire colour and adds no CSS', () => {
    expect(schematicThemeOptions('engineering')).toEqual({
      colorOverrides: { schematic: { junction: 'rgb(0, 105, 0)', wire: 'rgb(0, 105, 0)' } },
    });
  });

  it('themes light by default and restyles circuit-to-svg classes for dark', () => {
    expect(schematicThemeOptions().colorOverrides.schematic['background']).toBe('rgb(250, 250, 248)');
    const dark = schematicThemeOptions('dark');
    expect(dark.colorOverrides.schematic['background']).toBe('rgb(23, 25, 30)');
    expect(dark.css).toContain('.chip { fill: rgb(38, 42, 52)');
  });
});
