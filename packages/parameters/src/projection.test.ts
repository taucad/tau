import { contentDigest } from '@taucad/cache-core';
import { describe, expect, it } from 'vitest';
import { compileParameterManifest } from '#manifest.js';
import { projectParameterField } from '#projection.js';

const digest = contentDigest({ value: `sha256:${'1'.repeat(64)}` });
const manifest = async (
  binding?: Readonly<Record<string, unknown>>,
  type = 'double',
  schema: Readonly<Record<string, unknown>> = {},
) =>
  compileParameterManifest({
    declaration: {
      schema: {
        $schema: 'https://json-structure.org/meta/extended/v0/#',
        $id: 'urn:taucad:test:projection',
        $uses: ['JSONSchemaUnits'],
        name: 'Projection',
        type: 'object',
        properties: { value: { type, ...schema } },
      },
      defaults: { value: type === 'decimal' ? '1.25' : 1 },
      ...(binding ? { bindings: { '/value': binding } } : {}),
    },
    scope: { kind: 'source', authority: 'test', root: '/', entry: 'main.ts' },
    source: {
      id: 'test',
      version: '1',
      revision: 'source',
      capability: 'json-structure',
    },
    dependency: digest,
    middleware: digest,
  });

describe('projectParameterField', () => {
  it('uses admitted localized display symbols without treating them as unit codes', async () => {
    const admitted = await manifest({ unit: 'mm' }, 'double', {
      symbols: { default: 'millimetres', 'lang:en-NZ': 'mitamano' },
    });

    expect(projectParameterField(admitted, '/value').adornment).toBe('millimetres');
    expect(projectParameterField(admitted, '/value', { locale: 'en-NZ' }).adornment).toBe('mitamano');
    expect(projectParameterField(admitted, '/value', { unit: 'cm', locale: 'en-NZ' }).adornment).toBe('cm');
  });

  it('distinguishes declared, inferred, dimensionless, unknown, and unsupported fields', async () => {
    const declared = await manifest({ unit: 'mm' });
    expect(projectParameterField(declared, '/value', { unit: 'cm' })).toMatchObject({
      status: 'unit-bearing',
      nativeUnit: 'mm',
      displayUnit: 'cm',
      adornment: 'cm',
      unitOrigin: 'declared',
      guessed: false,
    });

    const inferred = await manifest({
      unit: 'deg',
      provenance: {
        unit: {
          origin: 'inferred',
          producer: 'test-rule',
          sourceRevision: String(digest),
          profile: 'test-v1',
          rule: 'angle-default-v1',
          evidence: 'main.ts#/value',
        },
      },
    });
    expect(projectParameterField(inferred, '/value')).toMatchObject({
      status: 'unit-bearing',
      adornment: '°',
      unitOrigin: 'inferred',
      guessed: true,
    });
    // A unit the person authored for the field beats the manifest's guess; its presence is the
    // whole "project" provenance, and the record carries nothing else about the field.
    expect(projectParameterField(inferred, '/value', {}, { values: {}, units: { '/value': 'rad' } })).toMatchObject({
      nativeUnit: 'rad',
      adornment: 'rad',
      unitOrigin: 'project',
      guessed: false,
    });

    expect(projectParameterField(await manifest({ unit: '1' }), '/value')).toMatchObject({
      status: 'dimensionless',
      guessed: false,
    });
    expect(projectParameterField(await manifest({ unit: '1' }, 'double', { symbol: 'px' }), '/value')).toMatchObject({
      status: 'dimensionless',
      adornment: 'px',
      guessed: false,
    });
    expect(projectParameterField(await manifest(), '/missing')).toEqual({
      status: 'unknown',
      instancePointer: '/missing',
      guessed: false,
    });
    expect(projectParameterField(await manifest({ unit: 'mm' }, 'decimal'), '/value')).toMatchObject({
      status: 'unsupported',
      diagnostic: { code: 'REPRESENTATION_UNSUPPORTED' },
    });
  });

  it('keeps explicit semantics above stale project claims and reports partial inference', async () => {
    const explicit = await manifest({
      unit: 'rad',
      quantityKind: 'http://qudt.org/vocab/quantitykind/PlaneAngle',
      space: 'linear',
    });
    // An explicitly declared unit outranks an authored one the producer never sanctioned.
    expect(projectParameterField(explicit, '/value', {}, { values: {}, units: { '/value': 'deg' } })).toMatchObject({
      nativeUnit: 'rad',
      adornment: 'rad',
      unitOrigin: 'declared',
      guessed: false,
    });

    const partial = await manifest(
      {
        quantityKind: 'http://qudt.org/vocab/quantitykind/Width',
        space: 'linear',
        provenance: {
          quantityKind: {
            origin: 'inferred',
            producer: 'parameterUnits',
            sourceRevision: String(digest),
            profile: 'test-v1',
            rule: 'width-kind',
            evidence: '/value',
          },
          space: {
            origin: 'inferred',
            producer: 'parameterUnits',
            sourceRevision: String(digest),
            profile: 'test-v1',
            rule: 'width-space',
            evidence: '/value',
          },
        },
      },
      'double',
      { ucumUnit: 'cm' },
    );
    expect(projectParameterField(partial, '/value')).toMatchObject({
      nativeUnit: 'cm',
      unitOrigin: 'declared',
      inferredFields: ['quantityKind', 'space'],
      guessed: true,
    });
  });
});
