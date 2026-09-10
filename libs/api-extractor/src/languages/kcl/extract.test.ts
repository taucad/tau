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
      packageVersion: '0.2.111',
      totalEntries: 191,
      breakdown: { function: 129, type: 29, constant: 19, module: 14 },
    });
  });

  it('assigns unique ids', () => {
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);
  });

  it('recovers the module entries the markdown pipeline dropped', () => {
    const modules = entries.filter((entry) => entry.kind === 'module');
    expect(modules).toHaveLength(14);
    expect(modules.map((entry) => entry.id)).toContain('kcl:std.math');
    expect(modules.map((entry) => entry.id)).toContain('kcl:std');
    expect(byName('units').docs?.summary).toContain('converting numbers to different units');
  });

  it('recovers the experimental flag the old model had nowhere to put', () => {
    const experimental = entries.filter(
      (entry) => entry.languageSpecific?.language === 'kcl' && entry.languageSpecific.experimental === true,
    );
    expect(experimental.filter((entry) => entry.kind === 'function')).toHaveLength(16);
    expect(experimental.filter((entry) => entry.kind === 'type')).toHaveLength(2);
    // Nothing in this export is deprecated; the field must still be carried, not assumed absent.
    expect(entries.filter((entry) => entry.deprecated !== undefined)).toHaveLength(0);
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
    expect(signature?.description).toBe('A helix; created by the `helix` function.');
    expect(helix.languageSpecific).toEqual({
      language: 'kcl',
      unitTypes: { revolutions: '_', angleStart: 'Angle', radius: 'Length', length: 'Length' },
    });
  });

  it('keeps the @ sigil on positional arguments', () => {
    expect(byName('offsetPlane').signatures?.[0]?.parameters[0]?.name).toBe('@plane');
    expect(byName('clone').signatures?.[0]?.parameters[0]?.name).toBe('@geometry');
    const sigils = entries.filter((entry) =>
      entry.signatures?.some((signature) => signature.parameters.some((parameter) => parameter.name.startsWith('@'))),
    );
    expect(sigils).toHaveLength(111);
  });

  it('keeps type definitions and constant values', () => {
    expect(byName('Point2d').type?.text).toBe('type Point2d = [number(Length); 2]');
    expect(byName('PI').type?.text).toBe('number(_?)');
    expect(byName('PI').docs?.examples?.[0]?.code).toContain('PI = 3.14159');
  });
});
