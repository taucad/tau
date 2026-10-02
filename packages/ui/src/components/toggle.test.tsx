import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { interpolate, wcagContrast } from 'culori';
import { describe, expect, it } from 'vitest';
import { Toggle, toggleVariants } from '#components/toggle.js';

const css = readFileSync(join(import.meta.dirname, '../styles/tokens.css'), 'utf8');
const declarations = (selector: string): Record<string, string> => {
  const start = css.indexOf(selector);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  const open = css.indexOf('{', start) + 1;
  const body = css.slice(open, css.slice(open).search(/[{}]/) + open);
  return Object.fromEntries(
    [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name!, value!.trim()]),
  );
};
const light = declarations(':root {');
const dark = { ...light, ...declarations(":root[class~='dark']") };
const themes = [
  light,
  dark,
  { ...dark, ...declarations(":root[class~='black']") },
  { ...dark, ...declarations(":root[class~='high-contrast']") },
];
const resolve = (value: string, tokens: Record<string, string>): string =>
  value.replaceAll(/var\((--[\w-]+)\)/g, (_match, name: string) => resolve(tokens[name]!, tokens));

describe('Toggle selected indicator', () => {
  it('styles Radix pressed and generic checked states while preserving the focus outline', () => {
    render(
      <Toggle pressed aria-label='PCB view'>
        PCB
      </Toggle>,
    );
    expect(screen.getByRole('button', { name: 'PCB view', pressed: true })).toHaveClass(
      'data-[state=on]:after:bg-selected-indicator',
      'focus-visible:focus-outline',
    );
    expect(toggleVariants()).toContain('aria-[pressed=true]:after:bg-selected-indicator');
    expect(toggleVariants()).toContain('aria-[checked=true]:after:bg-selected-indicator');
  });

  it.each(themes)('keeps the neutral selected indicator at 3:1 against its selected fill', (theme) => {
    const indicator = resolve(theme['--selected-indicator']!, theme);
    const mix = /color-mix\(in oklch, (white|black|var\(--neutral\)) (\d+)%, var\(--popover\)\)/.exec(
      theme['--menu-highlight']!,
    );
    expect(mix).not.toBeNull();
    const mixed = mix![1] === 'var(--neutral)' ? resolve(theme['--neutral']!, theme) : mix![1]!;
    const background = interpolate([resolve(theme['--popover']!, theme), mixed], 'oklch')(Number(mix![2]) / 100);
    expect(wcagContrast(indicator, background)).toBeGreaterThanOrEqual(3);
  });
});
