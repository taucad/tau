/**
 * Board colours shared by the 3D presentation board and the PCB view's fabrication palette, so
 * both read a board's `solderMaskColor` and `silkscreenColor` the same way.
 */

/** sRGB, 0–1 per channel. */
export type Rgb = readonly [number, number, number];

/** Solder mask presets: the props' `BoardColorPreset` names, as fabricators' typical mask colours. */
export const solderMaskPresets: Readonly<Record<string, Rgb>> = {
  green: [0.03, 0.27, 0.12],
  red: [0.55, 0.05, 0.05],
  blue: [0.03, 0.12, 0.42],
  purple: [0.27, 0.07, 0.42],
  black: [0.035, 0.035, 0.04],
  white: [0.9, 0.9, 0.88],
  yellow: [0.85, 0.7, 0.05],
};

export const silkscreenPresets: Readonly<Record<string, Rgb>> = {
  white: [0.93, 0.93, 0.9],
  black: [0.04, 0.04, 0.04],
  yellow: [0.92, 0.82, 0.2],
};

/** A preset name, `#rrggbb` or `rgb()`/`rgba()` colour; anything else is `undefined`. */
export const parseCssColor = (value: unknown, presets: Readonly<Record<string, Rgb>>): Rgb | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const key = value.trim().toLowerCase();
  const preset = presets[key];
  if (preset) {
    return preset;
  }
  const hex = /^#([\da-f]{6})$/u.exec(key)?.[1];
  if (hex) {
    return [
      Number.parseInt(hex.slice(0, 2), 16) / 255,
      Number.parseInt(hex.slice(2, 4), 16) / 255,
      Number.parseInt(hex.slice(4, 6), 16) / 255,
    ];
  }
  const rgb = /^rgba?\(([^)]+)\)$/u.exec(key)?.[1];
  if (rgb) {
    const [r = 0, g = 0, b = 0] = rgb.split(',').map((part) => Number.parseFloat(part) / 255);
    return [r, g, b];
  }
  return undefined;
};

export const lighten = (rgb: Rgb, amount: number): Rgb => [
  rgb[0] + (1 - rgb[0]) * amount,
  rgb[1] + (1 - rgb[1]) * amount,
  rgb[2] + (1 - rgb[2]) * amount,
];

export type BoardColors = { maskColor: Rgb; bottomMaskColor: Rgb; silkColor: Rgb; bottomSilkColor: Rgb };

/** A `pcb_board`'s mask and silkscreen colours: green mask by default, with white ink on dark masks. */
export const boardColorsOf = (board: Record<string, unknown> | undefined): BoardColors => {
  const maskColor =
    parseCssColor(board?.['top_solder_mask_color'] ?? board?.['solder_mask_color'], solderMaskPresets) ??
    solderMaskPresets['green']!;
  const bottomMaskColor =
    parseCssColor(board?.['bottom_solder_mask_color'] ?? board?.['solder_mask_color'], solderMaskPresets) ?? maskColor;
  const defaultSilk =
    maskColor[0] + maskColor[1] + maskColor[2] > 2 ? silkscreenPresets['black']! : silkscreenPresets['white']!;
  const silkColor =
    parseCssColor(board?.['top_silkscreen_color'] ?? board?.['silkscreen_color'], silkscreenPresets) ?? defaultSilk;
  const bottomSilkColor =
    parseCssColor(board?.['bottom_silkscreen_color'] ?? board?.['silkscreen_color'], silkscreenPresets) ?? silkColor;
  return { maskColor, bottomMaskColor, silkColor, bottomSilkColor };
};
