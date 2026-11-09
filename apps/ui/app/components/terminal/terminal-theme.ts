/**
 * The Terminal pane's colours: the editor's surface tokens and its syntax theme's ANSI palette.
 *
 * AurigaX parses hex and `rgb()` only, not the `oklch()` Tau's tokens are written in, so each token is resolved by
 * the browser: painted on a one-pixel canvas and read back as sRGB. The ANSI colours follow the editor's syntax theme
 * in light and dark, so a theme change re-themes the shell with the editor.
 */

import type { TerminalTheme } from '#components/terminal/aurigax-ghostty-web';

/**
 * The token behind each theme slot. Surface colours are the editor's; the 16 ANSI colours are the editor theme's
 * terminal palette (`--terminal-ansi-*` in `syntax-highlight.css`), each bright variant distinct from its base.
 */
const themeTokens = {
  background: '--background',
  foreground: '--foreground',
  cursor: '--foreground',
  cursorAccent: '--background',
  selectionBackground: '--accent',
  selectionForeground: '--accent-foreground',
  black: '--terminal-ansi-black',
  red: '--terminal-ansi-red',
  green: '--terminal-ansi-green',
  yellow: '--terminal-ansi-yellow',
  blue: '--terminal-ansi-blue',
  magenta: '--terminal-ansi-magenta',
  cyan: '--terminal-ansi-cyan',
  white: '--terminal-ansi-white',
  brightBlack: '--terminal-ansi-bright-black',
  brightRed: '--terminal-ansi-bright-red',
  brightGreen: '--terminal-ansi-bright-green',
  brightYellow: '--terminal-ansi-bright-yellow',
  brightBlue: '--terminal-ansi-bright-blue',
  brightMagenta: '--terminal-ansi-bright-magenta',
  brightCyan: '--terminal-ansi-bright-cyan',
  brightWhite: '--terminal-ansi-bright-white',
} as const satisfies Record<keyof TerminalTheme, `--${string}`>;

/** Used where a token does not resolve (no canvas, or a token this build lacks): legible on either theme. */
const fallback = { background: '#000000', foreground: '#ffffff' } as const;

const hex = (value: number): string => value.toString(16).padStart(2, '0');

/**
 * Resolve one CSS colour to `#rrggbb` through a canvas, so any syntax the browser accepts (oklch included) works.
 *
 * @param context - A one-pixel 2D context.
 * @param color - Any CSS colour.
 * @returns The sRGB hex, or `undefined` when the browser could not paint it.
 */
const resolveColor = (context: CanvasRenderingContext2D, color: string): string | undefined => {
  if (color.length === 0) {
    return undefined;
  }
  context.clearRect(0, 0, 1, 1);
  context.fillStyle = '#00000000';
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [red = 0, green = 0, blue = 0, alpha = 0] = context.getImageData(0, 0, 1, 1).data;
  return alpha === 0 ? undefined : `#${hex(red)}${hex(green)}${hex(blue)}`;
};

/**
 * The terminal theme for the element's current tokens.
 *
 * @param element - An element inside the themed tree; its computed style supplies the tokens.
 * @returns A complete theme in hex.
 */
export const readTerminalTheme = (element: HTMLElement): TerminalTheme => {
  const style = getComputedStyle(element);
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  let context: CanvasRenderingContext2D | undefined;
  try {
    context = canvas.getContext('2d', { willReadFrequently: true }) ?? undefined;
  } catch {
    /* The jsdom test environment and some sandboxed contexts have no 2D canvas; the fallbacks below apply. */
  }
  const resolve = (slot: keyof TerminalTheme): string => {
    const token = style.getPropertyValue(themeTokens[slot]).trim();
    const resolved = context ? resolveColor(context, token) : undefined;
    return resolved ?? (slot === 'background' || slot === 'cursorAccent' ? fallback.background : fallback.foreground);
  };
  return Object.fromEntries(
    (Object.keys(themeTokens) as Array<keyof TerminalTheme>).map((slot) => [slot, resolve(slot)]),
  ) as TerminalTheme;
};

/** How the WebGL renderer blends glyph coverage, from Tau's AurigaX patch (Ghostty's `alpha-blending`). */
export type TerminalTextRendering = Readonly<{
  textBlending: 'native' | 'linear' | 'linear-corrected';
  textWeight: number;
  /** The regular face's weight; the editor sets 400. */
  fontWeight: number;
}>;

/**
 * Text blending that sets the Terminal's strokes at the editor's weight. AurigaX draws each glyph white on a
 * transparent atlas and tints it, which reads heavier than the editor's DOM text. On light, linear blending thins
 * dark strokes; on dark, linear blending would thicken light strokes, so the corrected mode keeps sRGB weight
 * without its fringes. The coverage exponent then trims the rest. Measured as stroke width against the editor's
 * own text in the same window:
 *
 * - Chromium on Linux at 2x: light `linear` 0.65 and dark `linear-corrected` 1.15 land within 2% of the editor's ink.
 * - macOS: canvas glyphs come out about 0.6 device pixels wider per stroke than the editor's DOM text (2.95 against
 *   2.0 at 2x in the installed app), more than any coverage exponent removes. The face drops to 300, which takes
 *   about 0.5 px off a Geist Mono stroke, and the exponent covers the rest.
 *
 * @param theme - The resolved theme the Terminal opens with.
 * @param apple - Whether the renderer runs on macOS (or iOS), whose glyph rasterizer draws heavier.
 * @returns The blending and weight options for the renderer.
 */
export const terminalTextRendering = (
  theme: Pick<TerminalTheme, 'background'>,
  apple = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/u.test(navigator.platform),
): TerminalTextRendering => {
  const channel = (offset: number): number => {
    const value = Number.parseInt(theme.background.slice(offset, offset + 2), 16) / 255;
    return value <= 4.045e-2 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  const fontWeight = apple ? 300 : 400;
  if (luminance > 0.5) {
    return { textBlending: 'linear', textWeight: apple ? 1.4 : 0.65, fontWeight };
  }
  return { textBlending: 'linear-corrected', textWeight: 1.15, fontWeight };
};

/** WCAG AA for body text: the floor AurigaX holds every foreground to when the person asks for more contrast. */
export const highContrastRatio = 4.5;

/** Queries under which the pane raises the contrast floor. */
export const highContrastQuery = '(prefers-contrast: more), (forced-colors: active)';
