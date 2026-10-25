/**
 * The Terminal pane's colours from Tau's semantic tokens (blueprint Terminal pane: Geist Mono, existing tokens).
 *
 * AurigaX parses hex and `rgb()` only, not the `oklch()` Tau's tokens are written in, so each token is resolved by
 * the browser: painted on a one-pixel canvas and read back as sRGB. Each ANSI colour names the token whose meaning it
 * carries (red is destructive, green success, and so on), so a theme or high-contrast change re-themes the shell.
 */

import type { TerminalTheme } from '#components/terminal/aurigax-ghostty-web';

/** The token behind each theme slot. Bright variants share their base token; contrast comes from the ratio below. */
const themeTokens = {
  background: '--background',
  foreground: '--foreground',
  cursor: '--foreground',
  cursorAccent: '--background',
  selectionBackground: '--accent',
  selectionForeground: '--accent-foreground',
  black: '--muted-foreground',
  red: '--destructive',
  green: '--success',
  yellow: '--warning',
  blue: '--information',
  magenta: '--feature',
  cyan: '--stable',
  white: '--foreground',
  brightBlack: '--muted-foreground',
  brightRed: '--destructive',
  brightGreen: '--success',
  brightYellow: '--warning',
  brightBlue: '--information',
  brightMagenta: '--feature',
  brightCyan: '--stable',
  brightWhite: '--foreground',
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
