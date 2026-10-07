import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadKclCorpus } from '#languages/kcl/extract.js';
import { flattenEntries } from '#model/api-corpus.js';
import type { ApiEntry } from '#model/api-corpus.types.js';

const corpus = loadKclCorpus({ extractionDate: '2026-09-10T00:00:00.000Z' });
const entries = [...flattenEntries(corpus)];
const byName = (name: string): ApiEntry => {
  const entry = entries.find((candidate) => candidate.name === name);
  if (entry === undefined) {
    throw new Error(`No KCL entry named ${name}`);
  }

  return entry;
};

describe('KCL corpus', () => {
  it('holds the whole vendored export', () => {
    expect(corpus.metadata).toMatchObject({
      language: 'kcl',
      packageName: 'kcl-std',
      packageVersion: '0.2.184',
      totalEntries: 284,
      breakdown: { function: 203, type: 37, constant: 24, module: 20 },
    });
  });

  it('matches the kcl-lib version the runtime @taucad/kcl-wasm-lib is built from', () => {
    // Upstream bumps kcl-wasm-lib 0.1.N and kcl-lib 0.2.N together, so the
    // pnpm catalog's wasm-lib patch number names the kcl-lib release.
    const workspace = readFileSync(new URL('../../../../../pnpm-workspace.yaml', import.meta.url), 'utf8');
    const wasmLib = /'@taucad\/kcl-wasm-lib': (?<version>\S+)/u.exec(workspace)?.groups?.['version'];
    expect(wasmLib).toMatch(/^0\.1\.\d+$/u);
    expect(corpus.metadata.packageVersion).toBe(wasmLib?.replace(/^0\.1\./u, '0.2.'));
  });

  it('holds the sketch-block API', () => {
    const solver = entries.filter((entry) => entry.path === 'std.solver').map((entry) => entry.name);
    expect(solver).toEqual(
      expect.arrayContaining([
        'solver::line',
        'solver::arc',
        'solver::circle',
        'solver::coincident',
        'solver::horizontal',
        'solver::vertical',
        'solver::distance',
        'solver::horizontalDistance',
        'solver::radius',
        'solver::tangent',
        'solver::ORIGIN',
      ]),
    );
    expect(byName('solver').docs?.summary).toContain('sketch blocks');
    expect(byName('region').signatures?.[0]?.parameters.map((parameter) => parameter.name)).toContain('segments');
  });

  it('carries upstream examples, preferring the current sketch syntax', () => {
    const region = byName('region').docs?.examples ?? [];
    expect(region.length).toBeGreaterThan(0);
    expect(region.every((example) => example.code.includes('sketch(on ='))).toBe(true);
    // An entry whose only examples use the deprecated pipeline keeps them, captioned.
    expect(byName('cos').docs?.examples?.[0]?.caption).toBe('Legacy sketch syntax (deprecated in KCL 2.0)');
    expect(entries.filter((entry) => entry.kind === 'function' && entry.docs?.examples !== undefined)).toHaveLength(
      193,
    );
  });

  it('assigns unique ids', () => {
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);
  });

  it('recovers the module entries the markdown pipeline dropped', () => {
    const modules = entries.filter((entry) => entry.kind === 'module');
    expect(modules).toHaveLength(20);
    expect(modules.map((entry) => entry.id)).toContain('kcl:std.math');
    expect(modules.map((entry) => entry.id)).toContain('kcl:std');
    expect(byName('units').docs?.summary).toContain('converting numbers to different units');
  });

  it('recovers the experimental flag the old model had nowhere to put', () => {
    const experimental = entries.filter(
      (entry) => entry.languageSpecific?.language === 'kcl' && entry.languageSpecific.experimental === true,
    );
    expect(experimental.filter((entry) => entry.kind === 'function')).toHaveLength(17);
    expect(experimental.filter((entry) => entry.kind === 'type')).toHaveLength(8);
    expect(experimental.filter((entry) => entry.kind === 'module').map((entry) => entry.id)).toEqual([
      'kcl:std.gear',
      'kcl:std.runtime',
      'kcl:std.view',
    ]);
  });

  it('marks the legacy sketch pipeline deprecated with its KCL version', () => {
    expect(byName('startSketchOn').deprecated).toBe('Deprecated in KCL 2.0.');
    expect(entries.filter((entry) => entry.deprecated !== undefined)).toHaveLength(18);
    expect(byName('extrude').deprecated).toBeUndefined();
  });

  it('carries unit types, positional sigils and argument prose on a function', () => {
    const helix = byName('helix');
    const signature = helix.signatures?.[0];
    expect(signature?.parameters.map((parameter) => parameter.name)).toEqual([
      'revolutions',
      'angleStart',
      'ccw',
      'radius',
      'axis',
      'length',
      'cylinder',
    ]);
    expect(signature?.parameters[1]).toMatchObject({
      type: { text: 'number(Angle)' },
      optional: false,
      description: 'Start angle.',
    });
    expect(signature?.returnType?.text).toBe('Helix');
    expect(signature?.description).toBe('A helix.');
    expect(helix.languageSpecific).toEqual({
      language: 'kcl',
      unitTypes: { revolutions: '_', angleStart: 'Angle', radius: 'Length', length: 'Length' },
    });
  });

  it('keeps the @ sigil on positional arguments', () => {
    expect(byName('offsetPlane').signatures?.[0]?.parameters[0]?.name).toBe('@plane');
    expect(byName('clone').signatures?.[0]?.parameters[0]?.name).toBe('@geometries');
    const sigils = entries.filter((entry) =>
      entry.signatures?.some((signature) => signature.parameters.some((parameter) => parameter.name.startsWith('@'))),
    );
    expect(sigils).toHaveLength(157);
  });

  it('keeps type definitions and constant values', () => {
    expect(byName('Point2d').type?.text).toBe('type Point2d = [number(Length); 2]');
    expect(byName('PI').type?.text).toBe('number(_?)');
    expect(byName('PI').docs?.examples?.[0]?.code).toContain('PI = 3.14159');
  });
});
