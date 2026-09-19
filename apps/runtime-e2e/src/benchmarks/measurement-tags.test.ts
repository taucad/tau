import { describe, expect, it } from 'vitest';
import { budgetVerdict, readContention, rendererAngle } from '#benchmarks/measurement-tags.js';
import type { MeasurementTags } from '#benchmarks/measurement-tags.js';

const quietProduction: MeasurementTags = {
  build: 'production',
  wasmVariant: 'single',
  adapter: { api: 'webgpu', angle: 'metal', name: 'Apple M2 Pro', implementation: 'hardware' },
  kernelProcess: { kind: 'worker', role: 'kernel', pid: 42 },
  crossOriginIsolated: true,
  contention: { tag: 'quiet', source: 'operator', loadAverage1m: 0.4, cpuCount: 12 },
};

describe('readContention', () => {
  it('derives the tag from the load average and keeps the raw numbers', () => {
    expect(readContention({ loadAverage1m: 42.05, cpuCount: 12 })).toEqual({
      tag: 'contended',
      source: 'load-average',
      loadAverage1m: 42.05,
      cpuCount: 12,
    });
    expect(readContention({ loadAverage1m: 1.2, cpuCount: 12 })).toMatchObject({
      tag: 'quiet',
      source: 'load-average',
    });
  });

  it('records an operator statement over the derivation, and refuses a typo', () => {
    expect(readContention({ loadAverage1m: 0.1, cpuCount: 12, operatorTag: 'contended' })).toMatchObject({
      tag: 'contended',
      source: 'operator',
    });
    expect(() => readContention({ loadAverage1m: 0.1, cpuCount: 12, operatorTag: 'quiet-ish' })).toThrow(
      "Contention tag must be 'quiet' or 'contended'",
    );
  });
});

describe('rendererAngle', () => {
  it('separates the Metal and SwiftShader cohorts', () => {
    expect(rendererAngle(['--enable-unsafe-webgpu', '--use-angle=metal'])).toBe('metal');
    expect(rendererAngle(['--use-webgpu-adapter=swiftshader'])).toBe('swiftshader');
    expect(rendererAngle(['--enable-unsafe-webgpu'])).toBe('default');
  });
});

describe('budgetVerdict', () => {
  it('binds a budget only to a quiet, production, tagged, low-spread measurement', () => {
    expect(budgetVerdict({ tags: quietProduction, coefficientOfVariation: 0.09 })).toEqual({
      eligible: true,
      refusals: [],
    });
  });

  it('refuses an untagged measurement, a contended one, a dev build and an over-spread one', () => {
    expect(budgetVerdict({ coefficientOfVariation: 0.01 }).refusals).toEqual(['measurement tags are absent']);
    expect(
      budgetVerdict({
        tags: {
          ...quietProduction,
          build: 'development',
          contention: { ...quietProduction.contention, tag: 'contended' },
        },
        coefficientOfVariation: 0.25,
      }),
    ).toEqual({
      eligible: false,
      refusals: [
        'run was contended (load average 0.40)',
        'run measured a development build',
        'coefficient of variation 25.0% exceeds 10%',
      ],
    });
    expect(budgetVerdict({ tags: quietProduction }).refusals).toEqual(['coefficient of variation is unrecorded']);
  });
});
