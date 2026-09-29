import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { interpolate, wcagContrast } from 'culori';
import type { Color } from 'culori';
import { describe, expect, it } from 'vitest';
import { Button } from '#components/button.js';

/*
 * The jsdom environment neither compiles Tailwind nor resolves `var()`, and this package has no
 * browser runner, so the ring and the fill are resolved from the declarations in `tokens.css`,
 * cascaded the way the theme script applies them (`black` and `high-contrast` also carry `dark`).
 */
const tokenStyles = readFileSync(join(import.meta.dirname, '../styles/tokens.css'), 'utf8').replaceAll(
  /\/\*[\S\s]*?\*\//g,
  '',
);

type Declarations = Record<string, string>;

/** The declarations of the first block opened after `selector`, up to its first nested block. */
const block = (selector: string): Declarations => {
  const start = tokenStyles.indexOf(selector);
  expect(start, selector).toBeGreaterThan(-1);
  const open = tokenStyles.indexOf('{', start) + 1;
  const body = tokenStyles.slice(open, tokenStyles.slice(open).search(/[{}]/) + open);

  return Object.fromEntries(
    [...body.matchAll(/([\w-]+):\s*([^;]+);/g)].map(([, name, value]): [string, string] => [name!, value!.trim()]),
  );
};

const light = block(':root {');
const dark = { ...light, ...block(":root[class~='dark']") };
const themes = {
  light,
  dark,
  black: { ...dark, ...block(":root[class~='black']") },
  'high contrast': { ...dark, ...block(":root[class~='high-contrast']") },
};

/* What the `primary-action` utility declares on the button itself, ahead of its hover block. */
const primaryAction = block('@utility primary-action');

const resolve = (value: string, tokens: Declarations): string =>
  value.replaceAll(/var\((--[\w-]+)\)/g, (_match, name: string) => {
    const reference = tokens[name];
    if (reference === undefined) {
      throw new Error(`Unknown token ${name}`);
    }
    return resolve(reference, tokens);
  });

/** Every colour the fill paints: the base colour and each stop of the sheen gradient. */
const fillStops = (tokens: Declarations): Array<string | Color> => {
  const paint = resolve(`${primaryAction['background-color']} ${primaryAction['background-image']}`, tokens);

  return [...paint.matchAll(/color-mix\(in oklch, (\w+) (\d+)%, (oklch\([^)]*\))\)|oklch\([^)]*\)/g)].map(
    ([stop, mixWith, percent, base]) =>
      mixWith === undefined ? stop : interpolate([mixWith, base!], 'oklch')(1 - Number(percent) / 100),
  );
};

describe('Button default variant focus ring', () => {
  it('paints its focus outline on the primary-action fill', () => {
    render(<Button>Save model</Button>);

    expect(screen.getByRole('button', { name: 'Save model' })).toHaveClass(
      'primary-action',
      'focus-visible:focus-outline',
    );
  });

  it.each(Object.entries(themes))('keeps the %s ring at 3:1 against every fill stop', (_theme, tokens) => {
    const ring = resolve({ ...tokens, ...primaryAction }['--focus-outline-color']!, tokens);
    const stops = fillStops(tokens);

    expect(stops.length).toBeGreaterThan(0);
    for (const stop of stops) {
      expect(wcagContrast(ring, stop), `${ring} on ${JSON.stringify(stop)}`).toBeGreaterThanOrEqual(3);
    }
  });
});
