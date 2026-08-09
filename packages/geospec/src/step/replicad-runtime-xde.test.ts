// @vitest-environment node

import { beforeAll, describe, expect, it } from 'vitest';
import { replicad as replicadKernel } from '@taucad/runtime/kernels/replicad';
import { assertSuccess, createGeometryFile, createTestWorker } from '@taucad/runtime/testing';
import type { GeoSpecNativeStepBackend, XdeReadResult } from '#step/types.js';

const translatedDatumModelSource = `
  import { drawRoundedRectangle } from 'replicad';
  import { datum, face } from '@taucad/runtime/kernels/replicad/annotations';

  export default function main() {
    return {
      shape: drawRoundedRectangle(20, 10).sketchOnPlane().extrude(8).translate([40, 0, 0]),
      name: 'bracket',
      interfaces: {
        mount: face((f) => f.inPlane('XY', 8)),
        origin: datum({ origin: [40, 0, 0], xAxis: [1, 0, 0], zAxis: [0, 0, 1] }),
      },
    };
  }
`;

const translatedDatumModelFile = 'main.ts';

const expectTripletCloseTo = (actual: readonly number[] | undefined, expected: readonly number[]): void => {
  expect(actual).toHaveLength(3);
  for (const [index, value] of expected.entries()) {
    expect(actual?.[index]).toBeCloseTo(value, 6);
  }
};

const exportStepText = async (coordinateSystem: 'z-up' | 'y-up' = 'z-up'): Promise<string> => {
  const worker = await createTestWorker(replicadKernel, { [translatedDatumModelFile]: translatedDatumModelSource });
  const createResult = await worker.createGeometry({
    file: createGeometryFile(translatedDatumModelFile),
    parameters: {},
  });
  assertSuccess(createResult, 'createGeometry for runtime STEP datum readback');

  const exportResult = await worker.exportGeometry('step', { coordinateSystem });
  assertSuccess(exportResult, 'runtime STEP datum export');
  return new TextDecoder().decode(exportResult.data[0]!.bytes);
};

describe('Replicad runtime STEP export read through GeoSpec XDE', () => {
  let backend: GeoSpecNativeStepBackend;

  beforeAll(async () => {
    const module_ = (await import('geospec/native/opencascade/single')) as unknown as {
      default: () => Promise<GeoSpecNativeStepBackend>;
    };
    backend = await module_.default();
    if (!backend.GeoSpecXdeReader) {
      throw new Error('GeoSpecXdeReader is missing from the native backend.');
    }
  }, 120_000);

  const readXde = (stepText: string): XdeReadResult => {
    const native = backend.GeoSpecXdeReader!.readText(stepText, '{}');
    try {
      if (!native.isSuccess()) {
        throw new Error(native.resultJson());
      }
      return JSON.parse(native.resultJson()) as XdeReadResult;
    } finally {
      native.delete?.();
    }
  };

  it('should round-trip Tau-authored face names and datum placements without legacy property rows', async () => {
    const xde = readXde(await exportStepText());

    expect(xde).not.toHaveProperty('properties');
    expect(xde.occurrences).toHaveLength(1);
    expect(xde.occurrences[0]).toMatchObject({
      path: 'bracket',
      productName: 'bracket',
      instanceName: 'bracket',
    });
    expect(xde.subshapeNames).toContainEqual(
      expect.objectContaining({ occurrencePath: 'bracket', name: 'mount', shapeType: 'face' }),
    );

    const placement = xde.datumPlacements.find((datumPlacement) => datumPlacement.name === 'origin');
    expect(placement?.occurrencePath).toBe('bracket');
    expectTripletCloseTo(placement?.origin, [40, 0, 0]);
    expectTripletCloseTo(placement?.xAxis, [1, 0, 0]);
    expectTripletCloseTo(placement?.zAxis, [0, 0, 1]);
  }, 30_000);

  it('should rotate datum placements exactly once during y-up STEP export', async () => {
    const xde = readXde(await exportStepText('y-up'));

    const placement = xde.datumPlacements.find((datumPlacement) => datumPlacement.name === 'origin');
    expect(placement?.occurrencePath).toBe('bracket');
    expectTripletCloseTo(placement?.origin, [40, 0, 0]);
    expectTripletCloseTo(placement?.xAxis, [1, 0, 0]);
    expectTripletCloseTo(placement?.zAxis, [0, 1, 0]);
  }, 30_000);
});
