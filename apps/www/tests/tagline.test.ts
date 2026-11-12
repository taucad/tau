import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

/*
 * The tagline is Design, Verify, Build (onboarding blueprint, Q29 and S9). Production once served "Design Verify
 * Make." from a deploy older than this source; these are the two places the site writes the line.
 */
const taglineSources = ['../app/root.tsx', '../src/page-components.tsx'] as const;

const taglinesIn = (source: string): string[] => source.match(/Design\.?\s+Verify\.?\s+\w+\./gu) ?? [];

test.each(taglineSources)('writes the tagline as "Design. Verify. Build." in %s', (path) => {
  const source = readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
  const taglines = taglinesIn(source);
  expect(taglines.length).toBeGreaterThan(0);
  for (const tagline of taglines) {
    expect(tagline).toBe('Design. Verify. Build.');
    expect(tagline).not.toContain('Make');
  }
});
