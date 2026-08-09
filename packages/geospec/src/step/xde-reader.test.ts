import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadStep } from '#step/index.js';
import type { GeoSpecNativeStepBackend, GeoSpecNativeXdeReadResult, XdeReadResult } from '#step/types.js';

const fixturePath = join(import.meta.dirname, '../../fixtures/xde/two-cube-assembly.step');
const flatCubeStepPath = join(import.meta.dirname, '../../../runtime/src/kernels/replicad/__fixtures__/cube.step');

// Fixture geometry: cubeA is a 10mm cube centered at the origin; cubeB is the
// same cube placed at +30mm X, so the facing gap between them is 20mm.
const cubeGap = 20;

type FaceFactRow = {
  faceIndex: number;
  surfaceType: string;
  normal?: [number, number, number];
  offset?: number;
  area: number;
  centroid: [number, number, number];
  bounds: { min: [number, number, number]; max: [number, number, number] };
};

describe('GeoSpecXdeReader', () => {
  let xdeReader: NonNullable<GeoSpecNativeStepBackend['GeoSpecXdeReader']>;
  let native: GeoSpecNativeXdeReadResult;
  let result: XdeReadResult;

  beforeAll(async () => {
    const module_ = (await import('geospec/native/opencascade/single')) as unknown as {
      default: () => Promise<GeoSpecNativeStepBackend>;
    };
    const backend = await module_.default();
    const text = await readFile(fixturePath, 'utf8');
    if (!backend.GeoSpecXdeReader) {
      throw new Error('GeoSpecXdeReader is missing from the native backend.');
    }
    xdeReader = backend.GeoSpecXdeReader;
    native = xdeReader.readText(text, '{}');
    if (!native.isSuccess()) {
      throw new Error(native.resultJson());
    }
    result = JSON.parse(native.resultJson()) as XdeReadResult;
  }, 120_000);

  afterAll(() => {
    native.delete?.();
  });

  it('should recover occurrence paths and placement transforms from the assembly fixture', () => {
    expect(result.freeShapeCount).toBe(0);
    expect(result.occurrences.map((occurrence) => occurrence.path)).toEqual(['cubeA', 'cubeB']);
    expect(result.occurrences.map((occurrence) => occurrence.productName)).toEqual(['cubeA', 'cubeB']);

    const cubeA = result.occurrences[0];
    const cubeB = result.occurrences[1];
    expect(cubeA?.transform).toHaveLength(16);
    // Identity placement for cubeA.
    expect(cubeA?.transform).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    // Translation +30mm X for cubeB (4x4 row-major: translation in column 4).
    expect(cubeB?.transform[3]).toBeCloseTo(30, 9);
    expect(cubeB?.transform[7]).toBeCloseTo(0, 9);
    expect(cubeB?.transform[11]).toBeCloseTo(0, 9);
    expect(cubeB?.transform.filter((_value, index) => index % 5 === 0)).toEqual([1, 1, 1, 1]);
  });

  it('should surface the authored SHAPE_ASPECT subshape name with a geometrically correct faceIndex', () => {
    expect(result.subshapeNames).toHaveLength(1);
    const faceA = result.subshapeNames[0];
    expect(faceA).toMatchObject({ occurrencePath: 'cubeA', name: 'face.a', shapeType: 'face' });
    expect(faceA?.faceIndex).toBeGreaterThanOrEqual(0);

    // Verify the index resolves to the authored face geometrically: 'face.a'
    // is the +Z top face of cubeA (plane z = +5, outward normal [0, 0, 1]).
    const occurrenceOfCubeA = result.occurrences.findIndex((occurrence) => occurrence.path === 'cubeA');
    const facts = JSON.parse(native.faceFacts(occurrenceOfCubeA)) as { faces: FaceFactRow[] };
    expect(facts.faces).toHaveLength(6);
    const namedFace = facts.faces[faceA?.faceIndex ?? -1];
    expect(namedFace?.surfaceType).toBe('plane');
    expect(namedFace?.normal?.[2]).toBeCloseTo(1, 9);
    expect(namedFace?.centroid[2]).toBeCloseTo(5, 9);
    expect(namedFace?.area).toBeCloseTo(100, 6);
  });

  it('should surface native AP242 datum placements and no legacy property rows', () => {
    expect(result).not.toHaveProperty('properties');
    const origin = result.datumPlacements.find((placement) => placement.name === 'origin');
    expect(origin).toMatchObject({
      occurrencePath: 'cubeA',
      origin: [0, 0, 0],
      xAxis: [1, 0, 0],
      zAxis: [0, 0, 1],
    });
  });

  it('should treat a flat non-assembly STEP file as a valid single-level subject', async () => {
    const text = await readFile(flatCubeStepPath, 'utf8');
    const flatNative = xdeReader.readText(text, '{}');
    try {
      expect(flatNative.isSuccess()).toBe(true);
      const flat = JSON.parse(flatNative.resultJson()) as XdeReadResult;
      expect(flat.freeShapeCount).toBeGreaterThan(0);
      expect(flat.occurrences).toHaveLength(flat.freeShapeCount);
    } finally {
      flatNative.delete?.();
    }
  });

  it('should compute exact extrema with witness points on the facing faces', () => {
    const extrema = JSON.parse(native.extrema(0, -1, 1, -1)) as {
      distance: number;
      pointA: [number, number, number];
      pointB: [number, number, number];
    };
    expect(extrema.distance).toBeCloseTo(cubeGap, 6);
    expect(extrema.pointA[0]).toBeCloseTo(5, 6);
    expect(extrema.pointB[0]).toBeCloseTo(25, 6);
  });

  it('should classify points against the placed occurrence solid', () => {
    const classified = JSON.parse(native.classifyPoints(0, '[[0,0,0],[100,100,100]]')) as { states: string[] };
    expect(classified.states).toEqual(['in', 'out']);
  });

  it('should compute a zero boolean-common volume for the gapped pair', () => {
    const common = JSON.parse(native.commonVolume(0, 1)) as { volume: number };
    expect(common.volume).toBeCloseTo(0, 9);
  });

  it('should report an error payload instead of throwing for out-of-range proof arguments', () => {
    const outOfRange = JSON.parse(native.extrema(0, 99, 1, -1)) as { error?: string };
    expect(outOfRange.error).toContain('face index 99');
  });

  it('should fail safely on non-STEP input', () => {
    const broken = xdeReader.readText('not a step file', '{}');
    try {
      expect(broken.isSuccess()).toBe(false);
      expect(JSON.parse(broken.resultJson())).toHaveProperty('error');
    } finally {
      broken.delete?.();
    }
  });

  it(
    'should populate StepEvidence.xde and retain the native handle through loadStep',
    { timeout: 60_000 },
    async () => {
      const subject = await loadStep({ source: fixturePath, name: 'two-cube-assembly.step' });
      expect(subject.step?.xde?.occurrences.map((occurrence) => occurrence.path)).toEqual(['cubeA', 'cubeB']);
      expect(subject.step?.xde?.freeShapeCount).toBe(0);
      expect(subject.nativeXde).toBeDefined();
      expect(subject.nativeXde?.isSuccess()).toBe(true);
      subject.nativeXde?.delete?.();
    },
  );
});
