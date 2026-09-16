import { contentDigest } from '@taucad/cache-core';
import { compileParameterManifest } from '@taucad/parameters';
import type { ParameterDeclaration, ParameterManifest } from '@taucad/parameters';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import type { GetParametersResult } from '@taucad/runtime/types';
import { createMockRuntime } from '@taucad/runtime-testing';
import { describe, expect, it } from 'vitest';

import { parameterUnits } from '#parameter-units.middleware.js';

const dependency = contentDigest({ value: `sha256:${'1'.repeat(64)}` });
const middleware = contentDigest({ value: `sha256:${'2'.repeat(64)}` });
const root = {
  $schema: 'https://json-structure.org/meta/extended/v0/#',
  $id: 'urn:taucad:test:parameter-units',
  $uses: ['JSONSchemaUnits'],
  name: 'ParameterUnitsTest',
  type: 'object',
} as const;

const compile = async (declaration: ParameterDeclaration, resolution = {}): Promise<ParameterManifest> =>
  compileParameterManifest({
    declaration,
    scope: { kind: 'source', authority: 'test', root: '', entry: 'main.ts' },
    source: {
      id: 'test-kernel',
      version: '1.0.0',
      revision: dependency,
      capability: 'json-structure',
    },
    dependency,
    middleware,
    resolution,
  });

const infer = async (
  manifest: ParameterManifest,
  input: Readonly<{
    mode?: 'default' | 'declared-only';
    inferenceLanguage?: string;
  }> = {},
  angleDefault: 'deg' | 'rad' = 'deg',
): Promise<GetParametersResult> => {
  const definition = await resolveRuntimePluginDefinition('middleware', parameterUnits());
  return definition.wrapGetParameters!(
    { entryPath: 'main.ts', resolution: input },
    async () => ({ success: true, data: manifest, issues: [] }),
    createMockRuntime({ options: { angleDefault } }),
  );
};

describe('parameterUnits', () => {
  it('infers only the reviewed English length corpus', async () => {
    const expectedKinds = {
      '/width': 'http://qudt.org/vocab/quantitykind/Width',
      '/partHeight': 'http://qudt.org/vocab/quantitykind/Height',
      '/model_depth': 'http://qudt.org/vocab/quantitykind/Depth',
      '/hole-radius': 'http://qudt.org/vocab/quantitykind/Radius',
      '/outerDiameter': 'http://qudt.org/vocab/quantitykind/Diameter',
      '/travelDistance': 'http://qudt.org/vocab/quantitykind/Distance',
      '/partLength': 'http://qudt.org/vocab/quantitykind/Length',
      '/wallThickness': 'http://qudt.org/vocab/quantitykind/Length',
      '/edgeClearance': 'http://qudt.org/vocab/quantitykind/Length',
      '/panelGap': 'http://qudt.org/vocab/quantitykind/Length',
      '/cellSize': 'http://qudt.org/vocab/quantitykind/Length',
    } as const;
    const unknown = [
      'bitDepth',
      'colorDepth',
      'treeDepth',
      'pixelWidth',
      'scale',
      'size',
      'offset',
      'margin',
      'frequency',
      'torque',
      'energy',
      'ratio',
      'percent',
      'segmentCount',
      'widthAngle',
      'mystery',
    ] as const;
    const names = [...Object.keys(expectedKinds).map((pointer) => pointer.slice(1)), ...unknown];
    const manifest = await compile({
      schema: {
        ...root,
        properties: Object.fromEntries(names.map((name) => [name, { type: 'double', default: 2 }])),
      },
      defaults: Object.fromEntries(names.map((name) => [name, 2])),
    });

    const inferred = await infer(manifest, { inferenceLanguage: 'en-NZ' });
    expect(inferred.success).toBe(true);
    if (!inferred.success) {
      return;
    }
    for (const [pointer, quantityKind] of Object.entries(expectedKinds)) {
      expect(inferred.data.bindings[pointer]).toMatchObject({
        unit: 'mm',
        quantityKind,
        space: 'linear',
      });
      expect(
        Object.values(inferred.data.provenance).some(
          ({ field, origin, evidence }) =>
            field === 'unit' && origin === 'inferred' && evidence?.includes(`instance=${pointer};`),
        ),
      ).toBe(true);
    }
    for (const name of unknown) {
      expect(inferred.data.bindings[`/${name}`]?.unit).toBeUndefined();
    }
    expect(
      Object.values(inferred.data.provenance).find(
        ({ field, evidence }) => field === 'unit' && evidence?.includes('instance=/width;'),
      )?.profile,
    ).toContain('tau-parameter-units-03');
    expect(await infer(inferred.data, { inferenceLanguage: 'en-NZ' })).toEqual(inferred);
  });

  it('preserves compatible and conflicting declared units without replacing them', async () => {
    const compatible = await infer(
      await compile({
        schema: {
          ...root,
          properties: { width: { type: 'double', ucumUnit: 'cm' } },
        },
        defaults: { width: 20 },
      }),
    );
    expect(compatible.success && compatible.data.bindings['/width']).toMatchObject({
      unit: 'cm',
      quantityKind: 'http://qudt.org/vocab/quantitykind/Width',
      space: 'linear',
    });
    expect(
      compatible.success &&
        Object.values(compatible.data.provenance).find(
          ({ field, origin }) => field === 'unit' && origin === 'declared',
        ),
    ).toBeDefined();

    const conflicting = await compile({
      schema: {
        ...root,
        properties: { width: { type: 'double', ucumUnit: 's' } },
      },
      defaults: { width: 20 },
    });
    const explicitWins = await infer(conflicting);
    expect(explicitWins.success && explicitWins.data.bindings['/width']).toMatchObject({ unit: 's' });
    expect(explicitWins.success && explicitWins.data.bindings['/width']).not.toHaveProperty('quantityKind');
    expect(explicitWins.success && explicitWins.data.bindings['/width']).not.toHaveProperty('space');
  });

  it('infers angle fields per claim while explicit and project semantics win', async () => {
    const defaults = {
      cameraAngle: 38,
      rotationRadians: 0.5,
      nested: { tilt: 12 },
    };
    const declaration: ParameterDeclaration = {
      schema: {
        ...root,
        definitions: {
          angle: {
            type: 'double',
            minimum: -180,
            maximum: 180,
            multipleOf: 0.5,
          },
        },
        properties: {
          cameraAngle: { type: 'double', minimum: 0, maximum: 90, default: 38 },
          rotationRadians: { type: 'double', ucumUnit: 'rad' },
          nested: {
            type: 'object',
            properties: { tilt: { type: { $ref: '#/definitions/angle' } } },
          },
        },
      },
      defaults,
      bindings: {
        '/rotationRadians': {
          quantityKind: 'http://qudt.org/vocab/quantitykind/PlaneAngle',
          provenance: {
            quantityKind: {
              origin: 'project',
              producer: 'project.json',
              sourceRevision: dependency,
              evidence: 'project.json#/rotationRadians/quantityKind',
            },
          },
        },
      },
    };
    const before = structuredClone(declaration);
    const first = await infer(await compile(declaration), {
      inferenceLanguage: 'en-NZ',
    });
    expect(first.success).toBe(true);
    if (!first.success) {
      return;
    }
    expect(first.data.defaults).toEqual(defaults);
    expect(declaration).toEqual(before);
    expect(first.data.bindings['/cameraAngle']).toMatchObject({
      unit: 'deg',
      quantityKind: 'http://qudt.org/vocab/quantitykind/PlaneAngle',
      space: 'linear',
      constraints: { default: 38, minimum: 0, maximum: 90 },
    });
    expect(first.data.bindings['/rotationRadians']).toMatchObject({
      unit: 'rad',
      quantityKind: 'http://qudt.org/vocab/quantitykind/PlaneAngle',
      space: 'linear',
    });
    expect(first.data.bindings['/nested/tilt']).toMatchObject({
      unit: 'deg',
      constraints: { minimum: -180, maximum: 180, multipleOf: 0.5 },
      schema: {
        resource: 'urn:taucad:parameter-schema:root',
        pointer: '/definitions/angle',
      },
    });
    const inferred = Object.values(first.data.provenance).filter(({ origin }) => origin === 'inferred');
    expect(inferred).toHaveLength(7);
    expect(inferred).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'unit',
          rule: 'angle-default-v1/unit',
        }),
        expect.objectContaining({
          field: 'space',
          rule: 'angle-radian-token-v1/space',
        }),
        expect.objectContaining({
          field: 'space',
          rule: 'angle-default-v1/space',
        }),
      ]),
    );
    expect(
      Object.values(first.data.provenance).find(
        ({ field, origin }) => field === 'quantity-kind' && origin === 'project',
      ),
    ).toMatchObject({ producer: 'project.json' });

    const second = await infer(first.data, { inferenceLanguage: 'en-NZ' });
    expect(second).toEqual(first);
  });

  it('keeps ambiguous, non-English, declared-only, and unknown fields unclassified', async () => {
    const manifest = await compile({
      schema: {
        ...root,
        properties: {
          triangleCount: { type: 'int32' },
          strainAngle: { type: 'double' },
          energyTorque: { type: 'double' },
          hexColor: { type: 'uint32' },
          mystery: { type: 'double' },
          cameraAngle: { type: 'double' },
          widthDegreesRadians: { type: 'double' },
          widthHeightAngle: { type: 'double' },
        },
      },
      defaults: {
        triangleCount: 3,
        strainAngle: 1,
        energyTorque: 2,
        hexColor: 0xff_00_ff,
        mystery: 4,
        cameraAngle: 5,
        widthDegreesRadians: 6,
        widthHeightAngle: 7,
      },
    });
    const inferred = await infer(manifest);
    expect(inferred.success).toBe(true);
    if (!inferred.success) {
      return;
    }
    expect(inferred.data.bindings['/cameraAngle']).toMatchObject({
      unit: 'deg',
    });
    for (const pointer of [
      '/triangleCount',
      '/strainAngle',
      '/energyTorque',
      '/hexColor',
      '/mystery',
      '/widthDegreesRadians',
      '/widthHeightAngle',
    ]) {
      expect(inferred.data.bindings[pointer]?.unit).toBeUndefined();
    }
    const declaredOnly = await infer(manifest, { mode: 'declared-only' });
    expect(declaredOnly).toEqual({ success: true, data: manifest, issues: [] });
    const unsupportedLanguage = await infer(manifest, {
      inferenceLanguage: 'fr',
    });
    expect(unsupportedLanguage).toEqual({
      success: true,
      data: manifest,
      issues: [],
    });
  });

  it('infers digit-delimited and array-template fields without changing array data', async () => {
    const defaults = {
      width2: 2,
      '2Width': 2.5,
      widthArray: [1, 2],
      parts: [{ width: 3 }, { width: 4 }],
      nestedParts: [[{ width: 4.5 }]],
      externalParts: [{ height: 4.75 }],
      nullableWidthArray: [null, 5],
    };
    const manifest = await compile({
      schema: {
        ...root,
        properties: {
          width2: { type: 'double' },
          '2Width': { type: 'double' },
          widthArray: { type: 'array', items: { type: 'double' } },
          parts: {
            type: 'array',
            items: {
              type: 'object',
              properties: { width: { type: 'double' } },
            },
          },
          nestedParts: {
            type: 'array',
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: { width: { type: 'double' } },
              },
            },
          },
          externalParts: { type: { $ref: 'urn:taucad:test:external-parts' } },
          nullableWidthArray: {
            type: 'array',
            items: { type: ['double', 'null'] },
          },
        },
      },
      resources: {
        'urn:taucad:test:external-parts': {
          ...root,
          $id: 'urn:taucad:test:external-parts',
          name: 'ExternalParts',
          type: 'array',
          items: {
            type: 'object',
            properties: { height: { type: 'double' } },
          },
        },
      },
      defaults,
    });

    const inferred = await infer(manifest);
    expect(inferred.success).toBe(true);
    if (!inferred.success) {
      return;
    }
    expect(inferred.data.defaults).toEqual(defaults);
    for (const pointer of [
      '/width2',
      '/2Width',
      '/widthArray/*',
      '/parts/*/width',
      '/nestedParts/*/*/width',
      '/externalParts/*/height',
      '/nullableWidthArray/*',
    ]) {
      expect(inferred.data.bindings[pointer]).toMatchObject({
        unit: 'mm',
        space: 'linear',
      });
    }
    expect(inferred.data.bindings['/parts/*/width']?.quantityKind).toBe('http://qudt.org/vocab/quantitykind/Width');
  });

  it('resolves external references independently and changes profile identity with the angle default', async () => {
    const external = {
      ...root,
      $id: 'urn:taucad:test:external-angle',
      name: 'ExternalAngle',
      type: 'double',
      minimum: -6.3,
      maximum: 6.3,
    };
    const manifest = await compile({
      schema: {
        ...root,
        properties: { cameraAngle: { type: { $ref: external.$id } } },
      },
      resources: { [external.$id]: external },
      defaults: { cameraAngle: 1 },
    });
    const degrees = await infer(manifest, {}, 'deg');
    const radians = await infer(manifest, {}, 'rad');
    expect(degrees.success && degrees.data.bindings['/cameraAngle']).toMatchObject({
      unit: 'deg',
      schema: { resource: external.$id, pointer: '' },
    });
    expect(radians.success && radians.data.bindings['/cameraAngle']).toMatchObject({ unit: 'rad' });
    expect(degrees.success && radians.success && degrees.data.revision).not.toBe(
      radians.success ? radians.data.revision : undefined,
    );
    const degreeProfile = degrees.success
      ? Object.values(degrees.data.provenance).find(({ field }) => field === 'unit')?.profile
      : undefined;
    const radianProfile = radians.success
      ? Object.values(radians.data.provenance).find(({ field }) => field === 'unit')?.profile
      : undefined;
    expect(degreeProfile).toContain('angle=deg');
    expect(radianProfile).toContain('angle=rad');
  });
});
