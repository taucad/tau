import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const globalStyles = readFileSync(join(process.cwd(), 'app/styles/global.css'), 'utf8');

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

const readRuleBody = (selectorStart: number): string => {
  const blockStart = globalStyles.indexOf('{', selectorStart) + 1;
  const blockEnd = globalStyles.indexOf('}', blockStart);

  expect(selectorStart).toBeGreaterThanOrEqual(0);
  expect(blockStart).toBeGreaterThan(0);
  expect(blockEnd).toBeGreaterThan(blockStart);

  return globalStyles.slice(blockStart, blockEnd);
};

const readRuleStyle = (selectorStart: number): CSSStyleDeclaration => {
  const { style } = document.createElement('div');

  style.cssText = readRuleBody(selectorStart);

  return style;
};

const readRuleTokens = (selectorStart: number): TokenMap => {
  const style = readRuleStyle(selectorStart);

  return Object.fromEntries(
    Array.from({ length: style.length }, (_, index) => style.item(index))
      .filter((name) => name.startsWith('--'))
      .map((name) => [name, style.getPropertyValue(name).trim()]),
  ) as TokenMap;
};

const firstRoot = globalStyles.indexOf(':root');
const lightTokens = readRuleTokens(firstRoot);
const cornerShapeSupports = '@supports (corner-shape: superellipse(1.5))';
const enhancedRadiusSupports = globalStyles.indexOf(cornerShapeSupports);
const enhancedRadiusRoot = globalStyles.indexOf(':root', enhancedRadiusSupports);
const firstBaseLayer = globalStyles.indexOf('@layer base');
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
