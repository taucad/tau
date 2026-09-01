import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { tauCustomShikiLanguages } from '#tau-custom-shiki-languages.js';

type PackageJson = { exports: Record<string, string> };

const packageRoot = new URL('../', import.meta.url);
const packageJson = JSON.parse(readFileSync(new URL('package.json', packageRoot), 'utf8')) as PackageJson;

/** Grammar subpaths, i.e. every export but the barrel and the manifest passthrough. */
const grammarSubpaths = Object.keys(packageJson.exports).filter(
  (subpath) => subpath !== '.' && subpath !== './package.json',
);

describe('tauCustomShikiLanguages', () => {
  it('bundles one entry per grammar subpath', () => {
    // The barrel and the exports map are edited separately; a grammar added to
    // one and not the other highlights in some surfaces and not others.
    expect(tauCustomShikiLanguages.length).toBe(grammarSubpaths.length);
  });

  it('exposes the CAD languages Tau highlights', () => {
    expect(grammarSubpaths.toSorted()).toEqual(['./kcl', './openscad', './stepfile', './stl', './sysml', './usd']);
  });

  it('gives every grammar a name and a tokenizer', () => {
    for (const language of tauCustomShikiLanguages) {
      const grammar = language as { name?: unknown; patterns?: unknown };
      expect(typeof grammar.name).toBe('string');
      expect(grammar.patterns).toBeDefined();
    }
  });
});
