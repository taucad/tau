/* eslint-disable @typescript-eslint/naming-convention -- circuit JSON field names are snake_case. */
import { describe, expect, it } from 'vitest';

import { convertCircuitJsonToPcbSvg } from '#engine/svg.js';
import { pcbPaletteOptions, schematicThemeOptions, withPcbScale } from '#svg-themes.js';

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

  it('outlines the sheet in the theme sheet colour at a constant screen width', () => {
    const outline = 'stroke-width: 1.5px; vector-effect: non-scaling-stroke; }';
    expect(schematicThemeOptions('light').css).toContain(`.boundary { stroke: rgb(178, 184, 194); ${outline}`);
    expect(schematicThemeOptions('dark').css).toContain(`.boundary { stroke: rgb(74, 80, 92); ${outline}`);
  });
});

describe('PCB scale', () => {
  // A 20 x 10 mm board off the origin with one 2 x 1 mm pad at its centre.
  const circuitJson = [
    {
      type: 'pcb_board',
      pcb_board_id: 'board',
      center: { x: 3, y: -2 },
      width: 20,
      height: 10,
      thickness: 1.6,
      num_layers: 2,
      material: 'fr4',
    },
    { type: 'pcb_smtpad', pcb_smtpad_id: 'pad', shape: 'rect', x: 3, y: -2, width: 2, height: 1, layer: 'top' },
  ];
  // The kernel's PCB options: the board fills the SVG edge to edge.
  const render = (): string =>
    convertCircuitJsonToPcbSvg(circuitJson as Parameters<typeof convertCircuitJsonToPcbSvg>[0], {
      matchBoardAspectRatio: true,
      drawPaddingOutsideBoard: false,
    });

  it('declares the millimetre-to-pixel matrix the converter drew the board with', () => {
    const svg = withPcbScale(render(), circuitJson);
    const matrix = /^<svg data-real-to-screen-transform="matrix\(([^)]+)\)"/.exec(svg)?.[1]?.split(',').map(Number);
    // 800 px across 20 mm; the board's top-left corner (-7, 3) mm is the SVG's origin.
    expect(matrix).toEqual([40, 0, 0, -40, 280, 120]);

    // The drawn pad proves the declared scale: 2 x 1 mm at the board centre is 80 x 40 px at the SVG centre.
    const pad = /<rect class="pcb-pad"[^>]*>/.exec(svg)?.[0] ?? '';
    const attribute = (name: string): number => Number(new RegExp(` ${name}="([^"]+)"`).exec(pad)?.[1]);
    expect([attribute('width'), attribute('height')]).toEqual([80, 40]);
    expect([attribute('x') + 40, attribute('y') + 20]).toEqual([400, 200]);
  });

  it('leaves an SVG without a sized board unchanged', () => {
    expect(withPcbScale('<svg width="800" height="600"></svg>', [])).toBe('<svg width="800" height="600"></svg>');
    expect(withPcbScale('<svg width="800"></svg>', [{ type: 'pcb_board' }])).toBe('<svg width="800"></svg>');
  });
});
