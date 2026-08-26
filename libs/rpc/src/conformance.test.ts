import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isWireMessage } from '#wire.js';
import type { WireMessage } from '#wire.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = join(here, '..', 'test', 'conformance');

type Fixture = { readonly name: string; readonly kind: WireMessage['k']; readonly frame: WireMessage };

const loadFixtures = (): readonly Fixture[] => {
  const files = readdirSync(fixtureDirectory)
    .filter((f) => f.endsWith('.json'))
    .sort();
  return files.map((f) => {
    const raw = readFileSync(join(fixtureDirectory, f), 'utf8');
    return JSON.parse(raw) as Fixture;
  });
};

describe('@taucad/rpc wire conformance fixtures (R13, F11)', () => {
  const fixtures = loadFixtures();

  it('discovers at least one fixture per documented wire kind', () => {
    const expectedKinds = new Set([
      'rq',
      'rs',
      'rs',
      'rc',
      'nt',
      'ss',
      'sn',
      'sc',
      'se',
      'su',
      'lh',
      'lh',
      'lb',
      'fa',
      'fw',
    ]);
    const seen = new Set(fixtures.map((f) => f.kind));
    for (const k of expectedKinds) {
      expect(seen.has(k as WireMessage['k'])).toBe(true);
    }
  });

  it.each(loadFixtures())('accepts fixture $name as a valid wire frame', (fixture) => {
    expect(isWireMessage(fixture.frame)).toBe(true);
  });

  it.each(loadFixtures())('preserves fixture $name byte-for-byte through JSON round-trip', (fixture) => {
    const encoded = JSON.stringify(fixture.frame);
    const decoded = JSON.parse(encoded) as unknown;
    expect(decoded).toEqual(fixture.frame);
    expect(isWireMessage(decoded)).toBe(true);
  });

  it.each(loadFixtures())('fixture $name advertises matching kind metadata', (fixture) => {
    expect(fixture.frame.k).toBe(fixture.kind);
  });
});
