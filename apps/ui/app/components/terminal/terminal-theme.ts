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

/** WCAG AA for body text: the floor AurigaX holds every foreground to when the person asks for more contrast. */
export const highContrastRatio = 4.5;

/** Queries under which the pane raises the contrast floor. */
export const highContrastQuery = '(prefers-contrast: more), (forced-colors: active)';
