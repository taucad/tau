#!/usr/bin/env node
/**
 * Projects the design tokens onto the flat sRGB palette transactional email needs.
 *
 * Email clients cannot read `oklch()`, `var()` or `color-mix()`, so every colour in
 * `app/email/templates` has to ship as a hex literal. This script is the only place those
 * literals are allowed to come from: it reads `packages/ui/src/styles/tokens.css`, resolves the
 * lightness scale for the light and dark blocks, and writes `email-palette.generated.ts`.
 *
 * Required env: none.
 * Usage: node --import @oxc-node/core/register apps/api/scripts/generate-email-palette.mts [--check]
 * Exit codes: 0 written (or up to date), 1 drift under `--check` or an unreadable token.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { clampChroma, formatHex, interpolate } from 'culori';
import type { Oklch } from 'culori';

const workspaceRoot = resolve(import.meta.dirname, '../../..');
const tokensPath = resolve(workspaceRoot, 'packages/ui/src/styles/tokens.css');
const outputPath = resolve(import.meta.dirname, '../app/email/templates/email-palette.generated.ts');

/** Numeric custom properties declared inside one selector block of tokens.css. */
const readBlock = (css: string, selector: string): ReadonlyMap<string, number> => {
  const start = css.indexOf(selector);
  if (start === -1) {
    throw new Error(`tokens.css has no \`${selector}\` block`);
  }
  const open = css.indexOf('{', start);
  const body = css.slice(open + 1, css.indexOf('\n}', open));
  const values = new Map<string, number>();
  for (const [, name, value] of body.matchAll(/--([a-z-]+):\s*([\d.]+)(?:deg)?;/g)) {
    if (name !== undefined) {
      values.set(name, Number(value));
    }
  }
  return values;
};

/** One email colour. Each channel is a literal oklch value or a tokens.css custom-property name. */
type Ink = {
  readonly lightness: string | number;
  readonly chroma?: string | number;
  readonly hue?: string | number;
};

/** Every email colour, as the token expression it projects. Keep the comments in sync with tokens.css. */
const roles = {
  // --muted in light, --background in dark.
  canvas: { light: { lightness: 'l-surface' }, dark: { lightness: 'l-base' } },
  surface: { light: { lightness: 'l-base' }, dark: { lightness: 'l-surface' } }, // --background / --muted
  // --muted in light, --accent in dark.
  detail: { light: { lightness: 'l-surface' }, dark: { lightness: 0.295 } },
  foreground: { light: { lightness: 'l-deepest' }, dark: { lightness: 'l-deepest' } },
  muted: { light: { lightness: 'l-emphasized' }, dark: { lightness: 'l-emphasized' } }, // --muted-foreground
  border: { light: { lightness: 'l-subtle' }, dark: { lightness: 'l-subtle' } },
  // --primary-action is authored as a literal and is not remapped by the dark block.
  action: {
    light: { lightness: 0.4, chroma: 0.008, hue: 'hue-primary' },
    dark: { lightness: 0.4, chroma: 0.008, hue: 'hue-primary' },
  },
  actionForeground: { light: { lightness: 0.985 }, dark: { lightness: 0.985 } },
  // Light: the fill already reads at 9.18:1 on the card, so the border is the fill. Dark: the fill sits at
  // 1.77:1, so the border steps up to --l-medium for an identifiable boundary (WCAG 1.4.11) at 3.37:1.
  actionBorder: {
    light: { lightness: 0.4, chroma: 0.008, hue: 'hue-primary' },
    dark: { lightness: 'l-medium', chroma: 0.008, hue: 'hue-primary' },
  },
  // Detail-row separator. Light reuses --border; dark drops to the element step so it does not glare.
  rowBorder: { light: { lightness: 'l-subtle' }, dark: { lightness: 'l-element' } },
  brand: {
    light: { lightness: 'l-primary', chroma: 'c-primary', hue: 'hue-primary' },
    dark: { lightness: 'l-primary', chroma: 'c-primary', hue: 'hue-primary' },
  },
} satisfies Record<string, { readonly light: Ink; readonly dark: Ink }>;

const css = readFileSync(tokensPath, 'utf8');
const base = readBlock(css, ':root {');
const scales = {
  light: base,
  // The dark block only overrides part of the scale; everything else falls through to :root.
  dark: new Map([...base, ...readBlock(css, ".dark,\n:root[class~='dark'] {")]),
} as const;

const lookup = (scheme: keyof typeof scales, value: string | number | undefined, fallback: number): number => {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value === 'number') {
    return value;
  }
  const resolved = scales[scheme].get(value);
  if (resolved === undefined) {
    throw new Error(`tokens.css has no --${value} for the ${scheme} scheme`);
  }
  return resolved;
};

const hex = (scheme: keyof typeof scales, ink: Ink): string => {
  const colour: Oklch = {
    mode: 'oklch',
    l: lookup(scheme, ink.lightness, 0),
    c: lookup(scheme, ink.chroma, 0),
    h: lookup(scheme, ink.hue, 0),
  };
  return formatHex(clampChroma(colour, 'oklch'));
};

/** `color-mix(in oklch, <other> <weight>, <base>)`, which is how --primary-action-sheen is authored. */
const mix = (other: string, weight: number, base: string): string =>
  formatHex(clampChroma(interpolate([base, other], 'oklch')(weight), 'oklch'));

const shadow = /--shadow-xs:\s*([^;]+);/.exec(css)?.[1];
if (shadow === undefined) {
  throw new Error('tokens.css has no --shadow-xs');
}

const entries = (scheme: keyof typeof scales): string =>
  Object.entries(roles)
    .map(([role, ink]) => `  ${role}: '${hex(scheme, ink[scheme])}',`)
    .join('\n');

const action = hex('light', roles.action.light);
const generated = `// GENERATED by apps/api/scripts/generate-email-palette.mts — do not edit.
// sRGB projection of packages/ui/src/styles/tokens.css for email clients, which support neither
// oklch() nor var(). Run \`pnpm nx run api:generate-email-palette\` after changing the token scale.

export const light = {
${entries('light')}
  // --primary-action-sheen, with its color-mix() stops resolved in oklch.
  actionSheen: 'linear-gradient(165deg, ${mix('#ffffff', 0.16, action)} 0%, ${action} 45%, ${mix('#000000', 0.18, action)} 50%, ${action} 100%)',
  actionShadow: '${shadow}', // --shadow-xs
} as const;

export const dark = {
${entries('dark')}
} as const;

// --radius-* in px at the 16px root.
export const radius = { sm: 9, md: 11, lg: 13 } as const;

export const fontStack = {
  sans: "Geist, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  mono: "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
} as const;
`;

if (process.argv.includes('--check')) {
  const current = readFileSync(outputPath, 'utf8');
  if (current !== generated) {
    process.stderr.write(`${outputPath} is stale. Run \`pnpm nx run api:generate-email-palette\`.\n`);
    process.exit(1);
  }
  process.stdout.write('email palette is up to date\n');
} else {
  writeFileSync(outputPath, generated);
  process.stdout.write(`wrote ${outputPath}\n`);
}
