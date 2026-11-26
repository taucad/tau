import { globSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * UI Policy § 6, steady-state decorations: a decoration that loops animates only what the compositor can run without
 * the main thread. A looping `background-position`, `width` or SVG child transform costs style, layout and paint on
 * every frame for as long as a turn waits (the 2026-11-25 chat profile measured 171 ms of every second).
 */
const repositoryRoot = join(process.cwd(), '../..');
const styleSheets = ['apps/ui/app/**/*.css', 'packages/ui/src/**/*.css', 'apps/libs/*/src/**/*.css'].flatMap(
  (pattern) => globSync(pattern, { cwd: repositoryRoot }),
);

/** What a looping keyframe may set: compositor properties, and the per-keyframe easing that is not a property. */
const compositedProperties = new Set([
  'transform',
  'translate',
  'rotate',
  'scale',
  'opacity',
  'animation-timing-function',
]);

type KeyframeRule = Readonly<{ file: string; properties: ReadonlySet<string> }>;

const readKeyframes = (): Map<string, KeyframeRule[]> => {
  const keyframes = new Map<string, KeyframeRule[]>();
  for (const file of styleSheets) {
    const source = readFileSync(join(repositoryRoot, file), 'utf8').replaceAll(/\/\*[\s\S]*?\*\//gu, '');
    for (const match of source.matchAll(/@keyframes\s+([\w-]+)\s*\{/gu)) {
      let depth = 1;
      let index = match.index + match[0].length;
      while (depth > 0 && index < source.length) {
        if (source[index] === '{') {
          depth += 1;
        } else if (source[index] === '}') {
          depth -= 1;
        }
        index += 1;
      }
      const body = source.slice(match.index + match[0].length, index - 1);
      const properties = new Set([...body.matchAll(/([\w-]+)\s*:/gu)].map((declaration) => declaration[1]!));
      const name = match[1]!;
      keyframes.set(name, [...(keyframes.get(name) ?? []), { file, properties }]);
    }
  }
  return keyframes;
};

/** Keyframe names an `animation` shorthand or a `--animate-*` theme token runs with an `infinite` count. */
const readLoopingAnimations = (): Map<string, string> => {
  const looping = new Map<string, string>();
  for (const file of styleSheets) {
    const source = readFileSync(join(repositoryRoot, file), 'utf8').replaceAll(/\/\*[\s\S]*?\*\//gu, '');
    for (const match of source.matchAll(/(?:^|[\s;{])(?:animation|--animate-[\w-]+)\s*:([^;]*);/gu)) {
      const value = match[1]!;
      if (!/\binfinite\b/u.test(value)) {
        continue;
      }
      for (const item of value.split(',')) {
        const name = item.trim().split(/\s+/u)[0];
        if (name !== undefined && /^[a-z][\w-]*$/u.test(name)) {
          looping.set(name, file);
        }
      }
    }
  }
  return looping;
};

describe('steady-state decorations', () => {
  it('should find the style sheets it guards', () => {
    expect(styleSheets.map((file) => relative('.', file))).toEqual(
      expect.arrayContaining(['packages/ui/src/styles/tokens.css', 'apps/ui/app/styles/shiny-text.css']),
    );
  });

  it('should loop only keyframes that animate compositor properties', () => {
    const keyframes = readKeyframes();
    const looping = readLoopingAnimations();
    expect(looping.size).toBeGreaterThan(0);

    const violations = [...looping].flatMap(([name, usedIn]) =>
      (keyframes.get(name) ?? []).flatMap(({ file, properties }) =>
        [...properties]
          .filter((property) => !compositedProperties.has(property))
          .map((property) => `${name} (${usedIn}, keyframes in ${file}) animates ${property}`),
      ),
    );
    expect(violations).toEqual([]);
  });

  it('should turn a spinning glyph as one box, not its SVG children', () => {
    const tokens = readFileSync(join(repositoryRoot, 'packages/ui/src/styles/tokens.css'), 'utf8');
    const spinGlyph = /@utility spin-glyph \{([\s\S]*?)\n\}/u.exec(tokens)?.[1];

    expect(spinGlyph).toBeDefined();
    expect(spinGlyph).toContain('will-change: transform');
    expect(spinGlyph).not.toMatch(/&\s*>\s*\*/u);
  });
});
