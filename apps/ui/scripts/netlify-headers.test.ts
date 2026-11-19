// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const toml = await readFile(resolve(import.meta.dirname, '../netlify.toml'), 'utf8');

type HeaderRule = Readonly<{ pattern: string; values: Readonly<Record<string, string>> }>;

/** Each `[[headers]]` rule: its path pattern and its header values. */
const rules: readonly HeaderRule[] = [
  ...toml.matchAll(/^\[\[headers\]\]\nfor = "([^"]+)"\n\[headers\.values\]\n((?:[\w-]+ = "[^"]*"\n?)+)/gmu),
].map(([, pattern, body]) => ({
  pattern: pattern!,
  values: Object.fromEntries<string>(
    [...body!.matchAll(/^([\w-]+) = "([^"]*)"$/gmu)].map(([, name, value]): [string, string] => [name!, value!]),
  ),
}));

/** Netlify's `*` matches any run of characters, slashes included. */
const matches = (pattern: string, path: string): boolean =>
  new RegExp(`^${pattern.replaceAll(/[.+?^${}()|[\]\\]/gu, String.raw`\$&`).replaceAll('*', '.*')}$`, 'u').test(path);

/** Every value a path receives for one header, from every rule that matches it. */
const valuesFor = (path: string, header: string): string[] =>
  rules
    .filter((rule) => matches(rule.pattern, path) && rule.values[header] !== undefined)
    .map((rule) => rule.values[header]!);

describe('UI hosting headers (audit R17)', () => {
  it('should read the header rules', () => {
    expect(rules.length).toBeGreaterThan(5);
  });

  it('should give a hashed sprite under /assets/ only the immutable year', () => {
    for (const path of ['/assets/sprite-BWGdUwqw.svg', '/assets/payment-sprite-DNg4AeNP.svg']) {
      expect(valuesFor(path, 'Cache-Control')).toEqual(['public, max-age=31536000, immutable']);
      expect(valuesFor(path, 'Netlify-CDN-Cache-Control')).toEqual(['public, durable, max-age=31536000']);
    }
  });

  it('should keep one day for the unhashed SVGs in public/', () => {
    for (const path of [
      '/favicon.svg',
      '/wordmark.svg',
      '/avatar-circle.svg',
      '/avatar-square.svg',
      '/placeholder.svg',
    ]) {
      expect(valuesFor(path, 'Cache-Control')).toEqual(['public, max-age=86400']);
    }
  });

  /* PL7: a new deploy's worker, the kill switch's included, must reach a visitor on their next page load. */
  it.each(['/service-worker.js', '/offline-shell-worker.js'])(
    'should never let the browser or the CDN store the worker at %s',
    (path) => {
      expect(valuesFor(path, 'Cache-Control')).toEqual(['no-cache, no-store, must-revalidate']);
      expect(valuesFor(path, 'CDN-Cache-Control')).toEqual(['no-store']);
      expect(valuesFor(path, 'Netlify-CDN-Cache-Control')).toEqual(['no-store']);
    },
  );

  it('should serve the prerendered web app manifest as a manifest', () => {
    expect(valuesFor('/manifest.webmanifest', 'Content-Type')).toEqual(['application/manifest+json']);
  });
});
