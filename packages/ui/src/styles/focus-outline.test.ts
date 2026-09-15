import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const stylesDirectory = join(import.meta.dirname, '.');
const componentsDirectory = join(import.meta.dirname, '../components');
const tokenStyles = readFileSync(join(stylesDirectory, 'tokens.css'), 'utf8');

const componentSources = readdirSync(componentsDirectory)
  .filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
  .map((name) => [name, readFileSync(join(componentsDirectory, name), 'utf8')] as const);

/**
 * Any focus-state utility that restates indicator geometry instead of composing `focus-outline`.
 * `outline-none` and `outline-hidden` are excluded: suppressing a delegated control is legitimate.
 */
const restatedGeometry =
  /[^\s"'`]*focus[a-z-]*]?:(?:ring-\d|ring-ring|ring-inset|ring-offset-\d|outline-\d|outline-solid|outline-ring|outline-sidebar-ring|-?outline-offset-\d)/g;

describe('focus outline entry point', () => {
  it('defines the geometry once, as tokens', () => {
    const declarations = [...tokenStyles.matchAll(/(--focus-outline[a-z-]*):\s*([^;]+);/g)].map(
      ([, name, value]) => `${name}: ${value?.trim()}`,
    );

    expect(declarations).toEqual([
      '--focus-outline-color: var(--ring)',
      '--focus-outline-width: 2px',
      '--focus-outline-offset: calc(-1 * var(--focus-outline-width))',
      '--focus-outline-offset-outside: var(--focus-outline-width)',
    ]);
  });

  it.each(['focus-outline', 'focus-outline-outside'])('exposes the %s utility', (utility) => {
    const body = tokenStyles.slice(tokenStyles.indexOf(`@utility ${utility} {`));

    expect(body.slice(0, body.indexOf('}'))).toContain('outline: var(--focus-outline-width) solid');
  });

  it('routes every component focus indicator through the utility', () => {
    const offenders = componentSources.flatMap(([name, source]) =>
      [...source.matchAll(restatedGeometry)].map((match) => `${name}: ${match[0]}`),
    );

    expect(offenders).toEqual([]);
  });

  it('keeps the outside variant to controls that cannot host an inset outline', () => {
    const consumers = componentSources
      .filter(([, source]) => source.includes('focus-outline-outside'))
      .map(([name]) => name);

    // The resize handle is 0px wide, so an inset outline has nothing to paint on.
    expect(consumers).toEqual(['resizable.tsx']);
  });
});
