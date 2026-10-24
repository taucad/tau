/**
 * The host's contrast and accent, for the viewer (workbench parity PAR-8): the Tau app passes its high-contrast theme
 * and accent colour to `@taucad/viewer`, and the page passes its host's. An MCP Apps host names neither directly; it
 * shares its theme as CSS variables (`McpUiStyles`), so the page reads them: high contrast when the person asked the
 * system for more contrast or the host's primary border stands out from its background as a high-contrast theme's
 * does, and the accent from the host's focus ring.
 */

/** What the page passes the viewer of its host's theme. */
export type HostTheme = Readonly<{
  isHighContrast: boolean;
  /** A CSS hex colour, or `undefined` to keep Tau's accent. */
  accentColor: string | undefined;
}>;

/** A colour as its 0-255 channels. */
type Rgb = readonly [number, number, number];

/** A primary border this far from the background reads as a high-contrast theme's: ordinary themes stay under 2. */
const highContrastBorder = 3;

/**
 * Parse a computed colour, `rgb(r, g, b)` or `rgba(r, g, b, a)`, as browsers report one.
 *
 * @param color - The computed colour.
 * @returns Its channels, or `undefined` for anything else or a transparent colour.
 */
export const parseComputedColor = (color: string | undefined): Rgb | undefined => {
  const match = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/u.exec(
    color?.trim() ?? '',
  );
  if (match === null) {
    return undefined;
  }
  const alpha = match[4] === undefined ? 1 : Number.parseFloat(match[4]) / (match[4].endsWith('%') ? 100 : 1);
  return alpha === 0 ? undefined : [Number(match[1]), Number(match[2]), Number(match[3])];
};

const luminance = ([red, green, blue]: Rgb): number => {
  const linear = (channel: number): number => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
};

/**
 * The WCAG contrast ratio of two colours.
 *
 * @param first - One colour.
 * @param second - The other.
 * @returns From 1 (the same) to 21 (black on white).
 */
export const contrastRatio = (first: Rgb, second: Rgb): number => {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((left, right) => right - left) as [
    number,
    number,
  ];
  return (lighter + 0.05) / (darker + 0.05);
};

const hex = (channels: Rgb): string =>
  `#${channels.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;

/**
 * The host's theme as the viewer takes it.
 *
 * @param input - The host's style variables, how to compute one (the page resolves `light-dark()` and named colours
 *   through the document), and whether the system asks for more contrast.
 * @returns High contrast and the accent.
 */
export const hostThemeOf = ({
  variables,
  compute,
  prefersMoreContrast,
}: Readonly<{
  variables: Readonly<Record<string, string | undefined>> | undefined;
  compute: (value: string) => string | undefined;
  prefersMoreContrast: boolean;
}>): HostTheme => {
  const color = (name: string): Rgb | undefined => {
    const value = variables?.[name];
    return value === undefined ? undefined : parseComputedColor(compute(value));
  };
  const background = color('--color-background-primary');
  const border = color('--color-border-primary');
  const ring = color('--color-ring-primary');
  return {
    isHighContrast:
      prefersMoreContrast ||
      (background !== undefined && border !== undefined && contrastRatio(background, border) >= highContrastBorder),
    accentColor: ring === undefined ? undefined : hex(ring),
  };
};

/**
 * Compute a CSS colour through the document, so `light-dark()` follows the theme the host set.
 *
 * @param value - Any CSS colour value.
 * @returns The computed `rgb()` colour, or `undefined` outside a document.
 */
export const computeDocumentColor = (value: string): string | undefined => {
  if (typeof document === 'undefined') {
    return undefined;
  }
  const probe = document.createElement('span');
  probe.style.color = value;
  probe.hidden = true;
  document.body.append(probe);
  try {
    return probe.style.color === '' ? undefined : getComputedStyle(probe).color;
  } finally {
    probe.remove();
  }
};

/**
 * Whether the system asks for more contrast.
 *
 * @returns The `prefers-contrast: more` media query's answer; `false` where there is none.
 */
export const prefersMoreContrast = (): boolean =>
  typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(prefers-contrast: more)').matches;
