import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { loadStep } from '#step/index.js';
import type { BrepEvidence, GeometryDiagnostic } from '#mesh/types.js';
import type {
  GeoSpecNativeStepBackend,
  GeoSpecNativeStepReadResult,
  GeoSpecNativeXdeReadResult,
  GeoSpecOpenCascadeStepModule,
} from '#step/types.js';
import type { SelectorFaceFacts } from '#selector/types.js';

const cubeStepPath = join(import.meta.dirname, '../../../runtime/src/kernels/replicad/__fixtures__/cube.step');
const trianglePayload = {
  triangles: [0, 0, 0, 1, 0, 0, 0, 1, 0],
  brep: {
    validity: { valid: true },
    topologyCounts: { faces: 1 },
  },
  diagnostics: [],
};

const createResult = (payload: unknown, success = true): GeoSpecNativeStepReadResult => ({
  success,
  evidenceJson: () => JSON.stringify(payload),
  delete: vi.fn(),
});

describe('loadStep', () => {
  it(
    'should load STEP evidence through the GeoSpec OpenCascade native stream importer',
    { timeout: 30_000 },
    async () => {
      const subject = await loadStep({
        source: cubeStepPath,
        name: 'cube.step',
      });

      expect(subject.kind).toBe('geometry-subject');
      expect(subject.provenance.loader).toBe('opencascade-step');
      expect(subject.step?.readStrategy).toEqual(
        expect.objectContaining({
          strategy: 'native-stream',
          nativeReadStream: true,
          copiedToEmscriptenFs: false,
        }),
      );
      expect(subject.brep?.validity).toMatchObject({ valid: true });
      expect(subject.brep?.massProperties?.surfaceArea).toBeCloseTo(600, 6);
      expect(subject.brep?.massProperties?.volume).toBeCloseTo(1000, 6);
      expect(subject.mesh.stats.triangleCount).toBe(12);
    },
  );

  it('should fail when no native STEP reader is available', async () => {
    const bytes = await readFile(cubeStepPath);

    await expect(
      loadStep({
        source: new Uint8Array(bytes),
        openCascade: {},
      }),
    ).rejects.toThrow('GeoSpec native STEP reader is unavailable');
  });

  it('should load STEP evidence through the backend-neutral nativeStepBackend option', async () => {
    const reader = {
      readText: vi.fn(() => createResult(trianglePayload)),
    };
    const stepStreamReaderKey = 'GeoSpecStepStreamReader';
    const nativeStepBackend = { [stepStreamReaderKey]: reader } satisfies GeoSpecNativeStepBackend;

    const subject = await loadStep({
      source: new TextEncoder().encode('ISO-10303-21; HEADER; ENDSEC; END-ISO-10303-21;'),
      nativeStepBackend,
    });

    expect(reader.readText).toHaveBeenCalledOnce();
    expect(subject.provenance.loader).toBe('opencascade-step');
    expect(subject.brep?.validity).toMatchObject({ valid: true });
    expect(subject.mesh.stats.triangleCount).toBe(1);
  });

  it('should report native parse diagnostics without using another importer', async () => {
    const reader = {
      readText: vi.fn(() =>
        createResult(
          {
            diagnostics: [
              {
                code: 'GEOSPEC_STEP_PARSE_FAILED',
                severity: 'error',
                message: 'mock native STEP parser failed',
              },
            ],
          },
          false,
        ),
      ),
    };
    const openCascade: GeoSpecOpenCascadeStepModule = {};
    openCascade.GeoSpecStepStreamReader = reader;

    await expect(
      loadStep({
        source: new TextEncoder().encode('ISO-10303-21; HEADER; ENDSEC; END-ISO-10303-21;'),
        openCascade,
      }),
    ).rejects.toThrow('mock native STEP parser failed');
    expect(reader.readText).toHaveBeenCalledOnce();
  });

  it('should use GeoSpec filesystem fallback when explicitly requested', async () => {
    const writeFile = vi.fn();
    const unlink = vi.fn();
    const readFileNative = vi.fn(() => createResult(trianglePayload));
    const reader = {
      readText: vi.fn(() => createResult({ diagnostics: [] })),
      readFile: readFileNative,
    };
    const openCascade: GeoSpecOpenCascadeStepModule = {};
    openCascade.GeoSpecStepStreamReader = reader;
    openCascade.FS = {
      writeFile,
      unlink,
    };

    const subject = await loadStep({
      source: new Uint8Array(await readFile(cubeStepPath)),
      streaming: 'filesystem',
      openCascade,
    });

    expect(subject.step?.readStrategy).toEqual(
      expect.objectContaining({
        strategy: 'filesystem',
        nativeReadStream: false,
        copiedToEmscriptenFs: true,
      }),
    );
    expect(reader.readText).not.toHaveBeenCalled();
    expect(readFileNative).toHaveBeenCalledOnce();
    expect(writeFile).toHaveBeenCalledOnce();
    expect(unlink).toHaveBeenCalledOnce();
  });

  it('should delete the native XDE handle when subject construction throws', async () => {
    const xdeDelete = vi.fn();
    const nativeXde: GeoSpecNativeXdeReadResult = {
      isSuccess: () => true,
      resultJson: () => JSON.stringify({ occurrences: [], subshapeNames: [], datumPlacements: [], freeShapeCount: 0 }),
      extrema: () => '{}',
      classifyPoints: () => '{"states":[]}',
      commonVolume: () => '{"volume":0}',
      faceFacts: () => '{"faces":[]}',
      delete: xdeDelete,
    };
    // A non-iterable `diagnostics` makes buildStepSubject throw after the XDE
    // read has produced a live native handle, exercising the leak path.
    const stepStreamReaderKey = 'GeoSpecStepStreamReader';
    const xdeReaderKey = 'GeoSpecXdeReader';
    const backend: GeoSpecNativeStepBackend = {
      [stepStreamReaderKey]: {
        readText: vi.fn(() =>
          createResult({ brep: { validity: { valid: true } }, diagnostics: 5 as unknown as GeometryDiagnostic[] }),
        ),
      },
      [xdeReaderKey]: { readText: vi.fn(() => nativeXde) },
    };

    await expect(
      loadStep({
        source: new TextEncoder().encode('ISO-10303-21; HEADER; ENDSEC; END-ISO-10303-21;'),
        nativeStepBackend: backend,
      }),
    ).rejects.toThrow();
    expect(xdeDelete).toHaveBeenCalledOnce();
  });

  it('should preserve BRep evidence without advertising mesh capabilities when mesh loading is disabled', async () => {
    let parsedOptions: unknown;
    const reader = {
      readText: vi.fn((_data: string, optionsJson: string) => {
        parsedOptions = JSON.parse(optionsJson);
        return createResult({
          brep: {
            validity: { valid: true },
            cylindricalFaces: [{ radius: 5, axis: 'z' }],
          },
          step: {
            schema: 'AP242',
          },
          diagnostics: [],
        });
      }),
    };
    const openCascade: GeoSpecOpenCascadeStepModule = {};
    openCascade.GeoSpecStepStreamReader = reader;

    const subject = await loadStep({
      source: new TextEncoder().encode('ISO-10303-21; HEADER; ENDSEC; END-ISO-10303-21;'),
      openCascade,
      mesh: false,
    });

    expect(parsedOptions).toMatchObject({ mesh: false });
    expect(subject.mesh.stats.triangleCount).toBe(0);
    expect(subject.capabilities).toContainEqual({ kind: 'brep', feature: 'cylindrical-faces' });
    expect(subject.capabilities).toContainEqual({ kind: 'step', feature: 'schema' });
    expect(subject.capabilities).not.toContainEqual({ kind: 'mesh', feature: 'component-overlap' });
  });
});

// WS-E: TS-side feature re-derivation from faceFacts. A fake native backend
// supplies (1) the analyzeShape brep payload the step reader returns and (2) the
// per-occurrence faceFacts the XDE reader exposes, so loadStep runs the full
// re-derivation without a real STEP file or wasm.
const makeXdeResult = (facts: SelectorFaceFacts[], occurrenceCount = 1): GeoSpecNativeXdeReadResult => ({
  isSuccess: () => true,
  resultJson: () =>
    JSON.stringify({
      occurrences: Array.from({ length: occurrenceCount }, (_value, index) => ({
        path: `part${index}`,
        productName: `part${index}`,
      })),
      subshapeNames: [],
      datumPlacements: [],
      freeShapeCount: occurrenceCount,
    }),
  extrema: () => '{}',
  classifyPoints: () => '{"states":[]}',
  commonVolume: () => '{"volume":0}',
  faceFacts: () => JSON.stringify({ faces: facts }),
  delete: vi.fn(),
});

type Hole = NonNullable<BrepEvidence['circularHoles']>[number];

// Named native reader keys carry PascalCase class identity; use computed keys so
// the object-literal naming lint stays satisfied (mirrors the loadStep tests).
const stepReaderKey = 'GeoSpecStepStreamReader';
const xdeReaderKey = 'GeoSpecXdeReader';

const makeBackend = (
  brep: BrepEvidence | undefined,
  facts: SelectorFaceFacts[],
  occurrenceCount = 1,
): GeoSpecNativeStepBackend =>
  ({
    [stepReaderKey]: {
      readText: vi.fn(() => createResult(brep ? { brep, diagnostics: [] } : { diagnostics: [] })),
    },
    [xdeReaderKey]: {
      readText: vi.fn(() => makeXdeResult(facts, occurrenceCount)),
    },
  }) satisfies GeoSpecNativeStepBackend;

const loadWithFaceFacts = async (brep: BrepEvidence, facts: SelectorFaceFacts[], occurrenceCount = 1) =>
  loadStep({
    source: new TextEncoder().encode('ISO-10303-21; HEADER; ENDSEC; END-ISO-10303-21;'),
    nativeStepBackend: makeBackend(brep, facts, occurrenceCount),
    mesh: false,
  });

// A d x 45 chamfer around the X axis: a cone of axial span d flanked by the
// shaft outer cylinder and the planar end face.
const chamferCone = (distance: number): SelectorFaceFacts => ({
  faceIndex: 0,
  surfaceType: 'cone',
  axisOrigin: [0, 0, 0],
  axisDirection: [1, 0, 0],
  radius: 11 - distance,
  area: 10,
  centroid: [-10 + distance / 2, 0, 0],
  bounds: { min: [-10, -11, -11], max: [-10 + distance, 11, 11] },
});

const shaftCylinder: SelectorFaceFacts = {
  faceIndex: 1,
  surfaceType: 'cylinder',
  axisOrigin: [0, 0, 0],
  axisDirection: [1, 0, 0],
  radius: 11,
  area: 400,
  centroid: [0, 0, 0],
  bounds: { min: [-9, -11, -11], max: [9, 11, 11] },
};

const shaftEndPlane: SelectorFaceFacts = {
  faceIndex: 2,
  surfaceType: 'plane',
  normal: [-1, 0, 0],
  offset: 10,
  area: 300,
  centroid: [-10, 0, 0],
  bounds: { min: [-10, -11, -11], max: [-10, 11, 11] },
};

describe('WS-E feature re-derivation', () => {
  it('surfaces a revolved cone-chamfer at a shaft end as one chamfer feature', async () => {
    const subject = await loadWithFaceFacts({ validity: { valid: true } }, [
      chamferCone(1),
      shaftCylinder,
      shaftEndPlane,
    ]);

    expect(subject.brep?.chamferFeatures).toEqual([
      expect.objectContaining({ distance: 1, selection: 'revolved chamfer (axis x)' }),
    ]);
  });

  it('does not fabricate a chamfer from a lone cone with no coaxial cylinder or end face', async () => {
    const subject = await loadWithFaceFacts({ validity: { valid: true } }, [chamferCone(1)]);
    expect(subject.brep?.chamferFeatures ?? []).toEqual([]);
  });

  it('tolerates a faceFacts payload that carries no faces array', async () => {
    const backend: GeoSpecNativeStepBackend = {
      [stepReaderKey]: {
        readText: vi.fn(() => createResult({ brep: { validity: { valid: true } }, diagnostics: [] })),
      },
      [xdeReaderKey]: {
        readText: vi.fn(() => ({
          ...makeXdeResult([]),
          faceFacts: () => '{"error":"no faces"}',
        })),
      },
    };
    const subject = await loadStep({
      source: new TextEncoder().encode('ISO-10303-21; HEADER; ENDSEC; END-ISO-10303-21;'),
      nativeStepBackend: backend,
      mesh: false,
    });
    expect(subject.brep?.chamferFeatures ?? []).toEqual([]);
  });

  it('skips face-fact collection for assembly-scale subjects (no per-occurrence cost)', async () => {
    // A part-shaped chamfer topology but with >8 occurrences: the loader treats
    // it as an assembly and derives no chamfers.
    const subject = await loadWithFaceFacts(
      { validity: { valid: true } },
      [chamferCone(1), shaftCylinder, shaftEndPlane],
      20,
    );
    expect(subject.brep?.chamferFeatures ?? []).toEqual([]);
  });

  it('ignores oblique cones, oversized cones, and de-duplicates repeated chamfer distances', async () => {
    const oblique: SelectorFaceFacts = { ...chamferCone(1), axisDirection: [0.7, 0.7, 0] };
    const oversized: SelectorFaceFacts = {
      ...chamferCone(1),
      bounds: { min: [-10, -11, -11], max: [30, 11, 11] },
    };
    // Two identical d=0.5 chamfers (both shaft ends) collapse to one feature.
    const subject = await loadWithFaceFacts({ validity: { valid: true } }, [
      oblique,
      oversized,
      chamferCone(0.5),
      { ...chamferCone(0.5), faceIndex: 9, centroid: [9.5, 0, 0], bounds: { min: [9.5, -11, -11], max: [10, 11, 11] } },
      shaftCylinder,
      shaftEndPlane,
    ]);
    expect(subject.brep?.chamferFeatures).toEqual([
      expect.objectContaining({ distance: 0.5, selection: 'revolved chamfer (axis x)' }),
    ]);
  });

  it('unions revolved chamfers with the native planar-bevel chamfers', async () => {
    const subject = await loadWithFaceFacts(
      { validity: { valid: true }, chamferFeatures: [{ distance: 2, selection: 'top perimeter' }] },
      [chamferCone(0.5), shaftCylinder, shaftEndPlane],
    );
    expect(subject.brep?.chamferFeatures).toEqual([
      { distance: 2, selection: 'top perimeter' },
      expect.objectContaining({ distance: 0.5, selection: 'revolved chamfer (axis x)' }),
    ]);
  });

  it('recognises a z-axis chamfer and ignores a cone missing its axis direction', async () => {
    const zCone: SelectorFaceFacts = {
      faceIndex: 0,
      surfaceType: 'cone',
      axisOrigin: [0, 0, 0],
      axisDirection: [0, 0, 1],
      radius: 4,
      area: 8,
      centroid: [0, 0, 9.5],
      bounds: { min: [-5, -5, 9], max: [5, 5, 10] },
    };
    const zCylinder: SelectorFaceFacts = { ...shaftCylinder, axisDirection: [0, 0, 1] };
    const zPlane: SelectorFaceFacts = { ...shaftEndPlane, normal: [0, 0, 1] };
    const axislessCone: SelectorFaceFacts = { ...zCone, faceIndex: 5, axisDirection: undefined };
    const subject = await loadWithFaceFacts({ validity: { valid: true } }, [zCone, axislessCone, zCylinder, zPlane]);
    expect(subject.brep?.chamferFeatures).toEqual([
      expect.objectContaining({ distance: 1, selection: 'revolved chamfer (axis z)' }),
    ]);
  });

  it('recognises a y-axis chamfer', async () => {
    const yCone: SelectorFaceFacts = {
      faceIndex: 0,
      surfaceType: 'cone',
      axisOrigin: [0, 0, 0],
      axisDirection: [0, 1, 0],
      radius: 4,
      area: 8,
      centroid: [0, 9.5, 0],
      bounds: { min: [-5, 9, -5], max: [5, 10, 5] },
    };
    const yCylinder: SelectorFaceFacts = { ...shaftCylinder, axisDirection: [0, 1, 0] };
    const yPlane: SelectorFaceFacts = { ...shaftEndPlane, normal: [0, 1, 0] };
    const subject = await loadWithFaceFacts({ validity: { valid: true } }, [yCone, yCylinder, yPlane]);
    expect(subject.brep?.chamferFeatures).toEqual([
      expect.objectContaining({ distance: 1, selection: 'revolved chamfer (axis y)' }),
    ]);
  });

  it('skips holes with no centre when rebuilding patterns', async () => {
    const withMissingCentre: BrepEvidence['circularHoles'] = [
      { diameter: 8, through: false, axis: 'z' },
      { diameter: 8, through: false, axis: 'z', center: [0, 0, 0], axisRange: { min: -5, max: 0 } },
      { diameter: 8, through: false, axis: 'z', center: [1, 1, 0], axisRange: { min: -5, max: 0 } },
    ];
    const subject = await loadWithFaceFacts({ validity: { valid: true }, circularHoles: withMissingCentre }, []);
    // The two positioned holes still pattern; the centre-less one is skipped.
    expect(subject.brep?.circularHolePatterns).toHaveLength(1);
    expect(subject.brep?.circularHolePatterns?.[0]?.count).toBe(2);
  });

  it('reports two mirror-symmetric blind-tap pads as count-3 patterns, not a merged count-6', async () => {
    // Two positive/negative-y mount pads, each with 3 M10 blind taps entering the y face.
    const padTaps: BrepEvidence['circularHoles'] = [];
    for (const y of [106, -106]) {
      for (const x of [-30, 0, 30]) {
        padTaps.push({
          diameter: 10,
          through: false,
          axis: 'y',
          center: [257 + x, y - 6, -21],
          axisRange: { min: y - 12, max: y },
        });
      }
    }
    const subject = await loadWithFaceFacts({ validity: { valid: true }, circularHoles: padTaps }, []);

    const patterns = subject.brep?.circularHolePatterns ?? [];
    expect(patterns).toHaveLength(2);
    expect(patterns.every((pattern) => pattern.count === 3)).toBe(true);
    expect(patterns.every((pattern) => pattern.holeDiameter === 10 && pattern.axis === 'y')).toBe(true);
    // Pads sit on opposite sides of y = 0.
    expect(patterns.map((pattern) => Math.sign(pattern.center![1])).sort((a, b) => a - b)).toEqual([-1, 1]);
  });

  it('keeps a through-hole row as a single pattern and honours re-derived through-state', async () => {
    // Through-holes along X spread over the part; boundingBox lets the loader
    // recompute through-state from axisRange.
    const windows: BrepEvidence['circularHoles'] = [0, 200, 400].flatMap((x) =>
      [30, -30].map(
        (y): Hole => ({
          diameter: 28,
          through: true,
          axis: 'x',
          center: [x, y, 45],
          axisRange: { min: -1, max: 493 },
        }),
      ),
    );
    const subject = await loadWithFaceFacts(
      {
        validity: { valid: true },
        boundingBox: { min: [0, -110, -40], max: [492, 110, 60], size: [492, 220, 100], center: [246, 0, 10] },
        circularHoles: windows,
      },
      [],
    );
    const patterns = subject.brep?.circularHolePatterns ?? [];
    expect(patterns).toHaveLength(1);
    expect(patterns[0]).toEqual(expect.objectContaining({ count: 6, holeDiameter: 28, axis: 'x' }));
    expect(subject.brep?.circularHoles?.every((hole) => hole.through)).toBe(true);
  });

  it('preserves through-holes lacking a bounding box', async () => {
    // Two through-holes with no boundingBox: through-state falls through to the
    // native flag (rangeThrough undefined), and they still form one pattern.
    const throughHoles: BrepEvidence['circularHoles'] = [-20, 20].map(
      (x): Hole => ({
        diameter: 12,
        through: true,
        axis: 'z',
        center: [x, 0, 0],
        axisRange: { min: -5, max: 5 },
      }),
    );
    const subject = await loadWithFaceFacts({ validity: { valid: true }, circularHoles: throughHoles }, []);
    expect(subject.brep?.circularHoles?.every((hole) => hole.through)).toBe(true);
    expect(subject.brep?.circularHolePatterns).toHaveLength(1);
  });

  it('keeps a single-face bolt circle of blind taps as one pattern', async () => {
    // 6 M10 blind taps on one rear face (all share the same X entry plane).
    const bolts: BrepEvidence['circularHoles'] = Array.from({ length: 6 }, (_value, index): Hole => {
      const theta = ((index * 60 + 30) * Math.PI) / 180;
      return {
        diameter: 10,
        through: false,
        axis: 'x',
        center: [491, 165 * Math.cos(theta), 165 * Math.sin(theta)],
        axisRange: { min: 472, max: 491 },
      };
    });
    const subject = await loadWithFaceFacts({ validity: { valid: true }, circularHoles: bolts }, []);

    const patterns = subject.brep?.circularHolePatterns ?? [];
    expect(patterns).toHaveLength(1);
    expect(patterns[0]).toEqual(expect.objectContaining({ count: 6, holeDiameter: 10, axis: 'x' }));
    expect(patterns[0]?.boltCircleDiameter).toBeCloseTo(330, 6);
  });

  it('drops a lone tap that splits off from a pad (a singleton is not a pattern)', async () => {
    // One pad of 2 taps near y=100 plus a single stray tap far away at y=-100.
    const holes: BrepEvidence['circularHoles'] = [
      { diameter: 10, through: false, axis: 'y', center: [0, 100, 0], axisRange: { min: 94, max: 106 } },
      { diameter: 10, through: false, axis: 'y', center: [30, 100, 0], axisRange: { min: 94, max: 106 } },
      { diameter: 10, through: false, axis: 'y', center: [0, -100, 0], axisRange: { min: -106, max: -94 } },
    ];
    const subject = await loadWithFaceFacts({ validity: { valid: true }, circularHoles: holes }, []);
    const patterns = subject.brep?.circularHolePatterns ?? [];
    expect(patterns).toHaveLength(1);
    expect(patterns[0]?.count).toBe(2);
  });

  it('detects a shallow blind tap pad (no depth/aspect floor drops it)', async () => {
    // 3 very shallow M6 taps (axisRange spans only 3mm) still form a pad.
    const shallow: BrepEvidence['circularHoles'] = [-20, 0, 20].map(
      (x): Hole => ({
        diameter: 6,
        through: false,
        axis: 'z',
        center: [x, 40, -35],
        axisRange: { min: -38, max: -35 },
      }),
    );
    const subject = await loadWithFaceFacts({ validity: { valid: true }, circularHoles: shallow }, []);

    const patterns = subject.brep?.circularHolePatterns ?? [];
    expect(patterns).toHaveLength(1);
    expect(patterns[0]).toEqual(expect.objectContaining({ count: 3, holeDiameter: 6, axis: 'z' }));
  });

  it('leaves a subject without brep evidence untouched', async () => {
    const subject = await loadStep({
      source: new TextEncoder().encode('ISO-10303-21; HEADER; ENDSEC; END-ISO-10303-21;'),
      nativeStepBackend: makeBackend(undefined, []),
      mesh: false,
    });
    expect(subject.brep).toBeUndefined();
  });
});
