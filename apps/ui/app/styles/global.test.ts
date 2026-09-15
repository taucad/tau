import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { converter, parse, wcagContrast } from 'culori';
import { describe, expect, it } from 'vitest';

const tokenStyles = readFileSync(join(process.cwd(), '../../packages/ui/src/styles/tokens.css'), 'utf8');
const appStyles = readFileSync(join(process.cwd(), 'app/styles/global.css'), 'utf8');
const appStyleLinks = readFileSync(join(process.cwd(), 'app/styles/global.styles.ts'), 'utf8');
const globalStyles = `${tokenStyles}\n${appStyles}`;

const structuralTokens = [
  '--background',
  '--foreground',
  '--muted',
  '--muted-foreground',
  '--secondary',
  '--secondary-foreground',
  '--neutral',
  '--neutral-foreground',
  '--accent',
  '--accent-foreground',
  '--border',
  '--input',
  '--popover',
  '--popover-foreground',
  '--card',
  '--card-foreground',
  '--sidebar-background',
  '--sidebar-foreground',
  '--sidebar-primary',
  '--sidebar-primary-foreground',
  '--sidebar-accent',
  '--sidebar-accent-foreground',
  '--sidebar-border',
] as const;

type TokenName = (typeof structuralTokens)[number] | `--${string}`;
type TokenMap = Record<TokenName, string>;

const readRuleBody = (selectorStart: number, styles = globalStyles): string => {
  const blockStart = styles.indexOf('{', selectorStart) + 1;
  const blockEnd = styles.indexOf('}', blockStart);

  expect(selectorStart).toBeGreaterThanOrEqual(0);
  expect(blockStart).toBeGreaterThan(0);
  expect(blockEnd).toBeGreaterThan(blockStart);

  return styles.slice(blockStart, blockEnd);
};

const readRuleStyle = (selectorStart: number, styles = globalStyles): CSSStyleDeclaration => {
  const { style } = document.createElement('div');

  style.cssText = readRuleBody(selectorStart, styles);

  return style;
};

const readRuleTokens = (selectorStart: number, styles = globalStyles): TokenMap => {
  const style = readRuleStyle(selectorStart, styles);

  return Object.fromEntries(
    Array.from({ length: style.length }, (_, index) => style.item(index))
      .filter((name) => name.startsWith('--'))
      .map((name) => [name, style.getPropertyValue(name).trim()]),
  ) as TokenMap;
};

const firstRoot = globalStyles.indexOf(':root');
const lightTokens = {
  ...readRuleTokens(tokenStyles.indexOf(':root'), tokenStyles),
  ...readRuleTokens(appStyles.indexOf(':root'), appStyles),
};
const darkOverride = {
  ...readRuleTokens(tokenStyles.indexOf(":root[class~='dark']"), tokenStyles),
  ...readRuleTokens(appStyles.indexOf(":root[class~='dark']"), appStyles),
};
const blackOverride = {
  ...readRuleTokens(tokenStyles.indexOf(":root[class~='black']"), tokenStyles),
  ...readRuleTokens(appStyles.indexOf(":root[class~='black']"), appStyles),
};
const highContrastOverride = {
  ...readRuleTokens(tokenStyles.indexOf(":root[class~='high-contrast']"), tokenStyles),
  ...readRuleTokens(appStyles.indexOf(":root[class~='high-contrast']"), appStyles),
};
const darkTokens = { ...lightTokens, ...darkOverride };
const blackTokens = { ...darkTokens, ...blackOverride };
const highContrastTokens = { ...darkTokens, ...highContrastOverride };
const tokenContrastStart = tokenStyles.indexOf('@media (prefers-contrast: more)');
const appContrastStart = appStyles.indexOf('@media (prefers-contrast: more)');
const contrastLightOverride = {
  ...readRuleTokens(tokenStyles.indexOf(':root', tokenContrastStart), tokenStyles),
  ...readRuleTokens(appStyles.indexOf(':root', appContrastStart), appStyles),
};
const contrastDarkOverride = {
  ...readRuleTokens(tokenStyles.indexOf(":root[class~='dark']", tokenContrastStart), tokenStyles),
  ...readRuleTokens(appStyles.indexOf(":root[class~='dark']", appContrastStart), appStyles),
};
const contrastBlackOverride = {
  ...readRuleTokens(tokenStyles.indexOf(":root[class~='black']", tokenContrastStart), tokenStyles),
};
const contrastLightTokens = { ...lightTokens, ...contrastLightOverride };
const contrastDarkTokens = { ...darkTokens, ...contrastLightOverride, ...contrastDarkOverride };
const contrastBlackTokens = {
  ...blackTokens,
  ...contrastLightOverride,
  ...contrastDarkOverride,
  ...contrastBlackOverride,
};
const cornerShapeSupports = '@supports (corner-shape: superellipse(1.5))';
const enhancedRadiusSupports = globalStyles.indexOf(cornerShapeSupports);
const enhancedRadiusRoot = globalStyles.indexOf(':root', enhancedRadiusSupports);
const firstBaseLayer = globalStyles.indexOf('@layer base');

const resolveValue = (value: string, tokens: TokenMap, depth = 0): string => {
  if (depth > 20) {
    throw new Error(`Circular color token reference: ${value}`);
  }

  return value.replaceAll(/var\((--[\w-]+)\)/g, (_match, name: TokenName) => {
    const referencedValue = tokens[name];

    if (!referencedValue) {
      throw new Error(`Unknown color token: ${name}`);
    }

    return resolveValue(referencedValue, tokens, depth + 1);
  });
};

const resolveToken = (name: TokenName, tokens: TokenMap): string => {
  const value = tokens[name];

  if (!value) {
    throw new Error(`Missing color token: ${name}`);
  }

  return resolveValue(value, tokens);
};

const toOklch = converter('oklch');

const parseToken = (name: TokenName, tokens: TokenMap) => {
  const color = parse(resolveToken(name, tokens));

  if (!color) {
    throw new Error(`Invalid color token: ${name}`);
  }

  return toOklch(color);
};

describe('global structural color tokens', () => {
  it('uses the neutral Codex-matched light sidebar surface', () => {
    expect(resolveToken('--sidebar-background', lightTokens)).toBe('oklch(0.99 0 none)');
    expect(resolveToken('--sidebar-foreground', lightTokens)).toBe('oklch(0.43 0 none)');
  });

  it.each([
    ['light', lightTokens],
    ['dark', darkTokens],
    ['black', blackTokens],
    ['high contrast', highContrastTokens],
  ])('keeps every %s structural token achromatic', (_mode, tokens) => {
    for (const name of structuralTokens) {
      expect(parseToken(name, tokens).c, name).toBe(0);
    }
  });

  it.each([
    ['light', lightTokens],
    ['dark', darkTokens],
    ['black', blackTokens],
    ['high contrast', highContrastTokens],
  ])('meets WCAG AA for %s structural text pairs', (_mode, tokens) => {
    const pairs = [
      ['--foreground', '--background'],
      ['--muted-foreground', '--background'],
      ['--sidebar-foreground', '--sidebar-background'],
    ] as const;

    for (const [foreground, background] of pairs) {
      expect(
        wcagContrast(parseToken(foreground, tokens), parseToken(background, tokens)),
        `${foreground} on ${background}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each([
    ['light', lightTokens],
    ['dark', darkTokens],
    ['black', blackTokens],
    ['high contrast', highContrastTokens],
  ])('keeps %s structural colors independent of the primary hue', (_mode, tokens) => {
    const redAccent = { ...tokens, '--hue-primary': '20deg' };
    const blueAccent = { ...tokens, '--hue-primary': '280deg' };

    for (const name of structuralTokens) {
      expect(resolveToken(name, redAccent), name).toBe(resolveToken(name, blueAccent));
      expect(parseToken(name, redAccent), name).toEqual(parseToken(name, blueAccent));
    }
  });

  it.each([
    ['light', lightTokens],
    ['dark', darkTokens],
    ['black', blackTokens],
    ['high contrast', highContrastTokens],
  ])('keeps primary action text readable in %s mode', (_mode, tokens) => {
    expect(
      wcagContrast(parseToken('--primary', tokens), parseToken('--primary-foreground', tokens)),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ['light', lightTokens],
    ['dark', darkTokens],
    ['black', blackTokens],
    ['high contrast', highContrastTokens],
  ])('uses a light foreground on primary actions in %s mode', (_mode, tokens) => {
    expect(parseToken('--primary-foreground', tokens).l).toBeGreaterThanOrEqual(0.95);
  });

  it('maps the structural accent foreground into Tailwind', () => {
    expect(globalStyles).toContain('--color-accent-foreground: var(--accent-foreground);');
  });
});

describe('global focus ring token', () => {
  it.each([
    ['light', lightTokens],
    ['dark', darkTokens],
    ['black', blackTokens],
    ['high contrast', highContrastTokens],
  ])('uses one restrained interactive ring in %s mode', (_mode, tokens) => {
    const ring = parseToken('--ring', tokens);

    expect(ring.c).toBeCloseTo(0.08, 6);
    expect(ring.c).toBeGreaterThanOrEqual(0.05);
    expect(ring.c).toBeLessThanOrEqual(0.12);
    expect(resolveToken('--sidebar-ring', tokens)).toBe(resolveToken('--ring', tokens));
  });

  it.each([
    ['light', lightTokens],
    ['dark', darkTokens],
    ['black', blackTokens],
    ['high contrast', highContrastTokens],
  ])('keeps the %s ring visible across supported accent hues and control surfaces', (_mode, tokens) => {
    const surfaces = ['--background', '--sidebar-background', '--muted'] as const;

    for (let hue = 0; hue < 360; hue += 5) {
      const hueTokens = { ...tokens, '--hue-primary': `${hue.toString()}deg` };
      const ring = parseToken('--ring', hueTokens);

      for (const surface of surfaces) {
        expect(
          wcagContrast(ring, parseToken(surface, hueTokens)),
          `${hue.toString()}deg on ${surface}`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe('action cursor contract', () => {
  it('defaults actions to the platform cursor and exposes one opt-in utility', () => {
    expect(lightTokens).toMatchObject({ '--cursor-action': 'default' });

    const enabled = readRuleStyle(tokenStyles.indexOf(":root[data-pointer-cursors='true']"), tokenStyles);
    const utility = readRuleStyle(tokenStyles.indexOf('@utility cursor-action'), tokenStyles);

    expect(enabled.getPropertyValue('--cursor-action').trim()).toBe('pointer');
    expect(utility.cursor).toBe('var(--cursor-action)');
  });

  it('applies the preference to enabled actions and scoped sidebar navigation', () => {
    expect(tokenStyles).toContain("[role='button']");
    expect(tokenStyles).toContain("[role='menuitem']");
    expect(tokenStyles).toContain("[role='switch']");
    expect(tokenStyles).toContain(':not(:any-link)');
    expect(tokenStyles).toContain(":not([aria-disabled='true'])");
    expect(tokenStyles).toContain(":not([data-disabled='true'])");
    expect(tokenStyles).toContain("[data-slot='sidebar'] :any-link");
    expect(tokenStyles).toContain('cursor: var(--cursor-action);');
  });

  it('blocks dependency pointer utilities and adapts vendor actions to the shared token', () => {
    const legacyUtility = ['cursor', 'pointer'].join('-');
    expect(tokenStyles).toContain(`@source not inline('${legacyUtility}');`);
    expect(tokenStyles).toContain("svg[id^='mermaid-'] .clickable");
    expect(appStyles).not.toContain("@import 'dockview-react/dist/styles/dockview.css'");
    expect(appStyleLinks.indexOf('href: dockviewStylesUrl')).toBeLessThan(
      appStyleLinks.indexOf('href: globalStylesUrl'),
    );
    expect(appStyles).toContain('.dockview-theme-tau');
    expect(appStyles).toContain('cursor: var(--cursor-action) !important;');
    expect(appStyles).toContain('.monaco-menu-option');
    expect(appStyles).toContain('[data-sonner-toast] [data-button]');
    expect(appStyles).toContain('#profiler-toggle');
  });
});

describe('increased contrast palettes', () => {
  const contrastThemes = [
    ['explicit dark', highContrastTokens],
    ['preferred light', contrastLightTokens],
    ['preferred dark', contrastDarkTokens],
    ['preferred black', contrastBlackTokens],
  ] as const;

  it.each(contrastThemes)('keeps primary and muted text highly readable in %s mode', (_mode, tokens) => {
    expect(wcagContrast(parseToken('--foreground', tokens), parseToken('--background', tokens))).toBeGreaterThanOrEqual(
      7,
    );

    for (const surface of ['--background', '--muted', '--card', '--sidebar-background'] as const) {
      expect(
        wcagContrast(parseToken('--muted-foreground', tokens), parseToken(surface, tokens)),
        `--muted-foreground on ${surface}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(contrastThemes)('keeps structural boundaries visible in %s mode', (_mode, tokens) => {
    for (const [boundary, surface] of [
      ['--border', '--background'],
      ['--input', '--background'],
      ['--sidebar-border', '--sidebar-background'],
    ] as const) {
      expect(
        wcagContrast(parseToken(boundary, tokens), parseToken(surface, tokens)),
        `${boundary} against ${surface}`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(contrastThemes)('keeps primary actions and focus rings visible for every hue in %s mode', (_mode, tokens) => {
    for (let hue = 0; hue < 360; hue += 5) {
      const hueTokens = { ...tokens, '--hue-primary': `${hue.toString()}deg` };

      expect(
        wcagContrast(parseToken('--primary', hueTokens), parseToken('--primary-foreground', hueTokens)),
        `primary at ${hue.toString()}deg`,
      ).toBeGreaterThanOrEqual(4.5);

      for (const surface of ['--background', '--sidebar-background', '--muted'] as const) {
        expect(
          wcagContrast(parseToken('--ring', hueTokens), parseToken(surface, hueTokens)),
          `ring at ${hue.toString()}deg on ${surface}`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it.each(contrastThemes)('keeps diagram boundaries visible in %s mode', (_mode, tokens) => {
    for (const [boundary, surface] of [
      ['--diagram-node-border', '--diagram-node'],
      ['--diagram-cluster-border', '--diagram-cluster'],
      ['--diagram-line', '--background'],
    ] as const) {
      expect(
        wcagContrast(parseToken(boundary, tokens), parseToken(surface, tokens)),
        `${boundary} against ${surface}`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it('preserves the pure-black canvas when contrast is preferred', () => {
    expect(resolveToken('--background', contrastBlackTokens)).toBe('oklch(0 0 none)');
  });
});

describe('global corner shape', () => {
  it('progressively enhances existing radii while preserving full-round shapes', () => {
    expect(globalStyles).not.toContain('@utility rounded-*');

    const supportsStart = globalStyles.indexOf(cornerShapeSupports, firstBaseLayer);
    const squircleStart = globalStyles.indexOf(':where(*)', supportsStart);
    const fullRoundStart = globalStyles.indexOf(":where([class*='rounded-full'])", supportsStart);

    expect(supportsStart).toBeGreaterThan(firstBaseLayer);
    expect(squircleStart).toBeGreaterThan(supportsStart);
    expect(fullRoundStart).toBeGreaterThan(squircleStart);
    expect(readRuleBody(squircleStart).trim()).toBe('corner-shape: superellipse(1.5);');
    expect(readRuleBody(fullRoundStart).trim()).toBe('corner-shape: round;');
  });

  it('keeps the established radius hierarchy', () => {
    expect(lightTokens).toMatchObject({
      '--radius-xs': '0.4375rem',
      '--radius-sm': 'calc(var(--radius-xs) + 0.125rem)',
      '--radius-md': 'calc(var(--radius-sm) + 0.125rem)',
      '--radius-lg': 'calc(var(--radius-md) + 0.125rem)',
      '--radius-xl': 'calc(var(--radius-lg) + 0.25rem)',
      '--radius-2xl': 'calc(var(--radius-xl) + 0.25rem)',
      '--radius-3xl': 'calc(var(--radius-2xl) + 0.5rem)',
      '--radius-4xl': 'calc(var(--radius-3xl) + 0.5rem)',
    });
  });

  it('compensates the radius scale only when native superellipses are supported', () => {
    expect(enhancedRadiusSupports).toBeGreaterThan(firstRoot);
    expect(enhancedRadiusSupports).toBeLessThan(firstBaseLayer);
    expect(enhancedRadiusRoot).toBeGreaterThan(enhancedRadiusSupports);
    expect(enhancedRadiusRoot).toBeLessThan(firstBaseLayer);
    expect(readRuleTokens(enhancedRadiusRoot)).toMatchObject({
      '--radius-xs': '0.59375rem',
      '--radius-sm': '0.75rem',
      '--radius-md': '0.9375rem',
      '--radius-lg': '1.09375rem',
      '--radius-xl': '1.4375rem',
      '--radius-2xl': '1.78125rem',
      '--radius-3xl': '2.4375rem',
      '--radius-4xl': '3.125rem',
    });
  });
});

describe('scroll fades', () => {
  it('uses the workbench fade globally', () => {
    const scrollFadeStart = globalStyles.indexOf(':root', globalStyles.indexOf('/* START SCROLL SHADOWS */'));

    expect(readRuleTokens(scrollFadeStart)).toMatchObject({
      '--scroll-fade-size': '28px',
      '--scroll-fade-end': 'transparent',
    });
  });

  it('provides a static CSS-only inline-end fade', () => {
    const style = readRuleStyle(globalStyles.indexOf('@utility scroll-shadow-right'));

    expect(style.getPropertyValue('mask-image')).toBe(
      'linear-gradient(to right, black, black calc(100% - var(--scroll-fade-size)), var(--scroll-fade-end))',
    );
    expect(style.getPropertyValue('animation')).toBe('');
  });
});
