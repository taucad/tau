/**
 * How every Terminal tab draws its grid: the code editor's face and the theme tokens, shared by the person's own shell
 * and an external agent's sign-in tab so both read as the same Terminal.
 */

import type { TerminalRendererOptions, TerminalRendererView } from '#components/terminal/terminal-renderer.js';
import {
  highContrastQuery,
  highContrastRatio,
  readTerminalTheme,
  terminalTextRendering,
} from '#components/terminal/terminal-theme.js';

/** Loads the renderer; the default imports it lazily so no other surface pays for it. @public */
export type TerminalRendererLoader = (options: TerminalRendererOptions) => Promise<TerminalRendererView>;

/** The default loader: the renderer module is imported only when a Terminal tab first draws. @public */
export const loadTerminalRenderer: TerminalRendererLoader = async (options) => {
  const { createTerminalRenderer } = await import('#components/terminal/terminal-renderer.js');
  return createTerminalRenderer(options);
};

/* The code editor's font (`--font-mono`, 14px, line-height 1.5), so the Terminal and the editor set code the same way. */
const fallbackFontFamily = "'Geist Mono', ui-monospace, monospace";
const fontSize = 14;
const lineHeight = fontSize * 1.5;
const scrollbackLines = 10_000;

/**
 * The editor's monospace family, read from the `--font-mono` token the code editor uses.
 *
 * @param element - An element inside the themed document.
 * @returns The font family list.
 */
const readEditorFontFamily = (element: Element): string =>
  getComputedStyle(element).getPropertyValue('--font-mono').trim() || fallbackFontFamily;

/**
 * The foreground contrast floor for the current contrast preference.
 *
 * @returns 1 (off), or the high-contrast ratio.
 * @public
 */
export const readMinimumContrastRatio = (): number =>
  globalThis.matchMedia(highContrastQuery).matches ? highContrastRatio : 1;

/**
 * The renderer options every Terminal tab shares, read from the themed `host`.
 *
 * @param host - The element the grid draws into.
 * @param screenReaderMode - Whether the screen mirror is on.
 * @returns Everything but the tab's own callbacks.
 * @public
 */
export const terminalViewOptions = (
  host: HTMLElement,
  screenReaderMode: boolean,
): Omit<TerminalRendererOptions, 'onLinkActivate' | 'onLeave' | 'onMetricsChange'> => {
  const theme = readTerminalTheme(host);
  return {
    host,
    fontFamily: readEditorFontFamily(host),
    fontSize,
    lineHeight,
    theme,
    ...terminalTextRendering(theme),
    scrollback: scrollbackLines,
    screenReaderMode,
    minimumContrastRatio: readMinimumContrastRatio(),
    reducedMotion: globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
};

/**
 * Open a Ctrl/Cmd+clicked `http(s)` link: the desktop navigation policy sends it to the person's default browser and
 * opens nothing in the app, and its log keeps the origin only.
 *
 * @param uri - The link.
 * @public
 */
export const openTerminalLink = (uri: string): void => {
  globalThis.open(uri, '_blank', 'noopener,noreferrer');
};
