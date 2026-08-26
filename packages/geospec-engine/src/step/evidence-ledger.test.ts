import { afterEach, describe, expect, it, vi } from 'vitest';
import { setGeoSpecEvidenceStore } from '#cache/evidence-cache.js';
import { createMemoryEvidenceStore } from '#cache/testing/memory-evidence-store.js';
import {
  createBrepEvidenceLedger,
  getBrepFacetDiagnostic,
  setBrepEvidenceForensicSink,
} from '#step/evidence-ledger.js';
import type { BrepLedgerHandle } from '#step/evidence-ledger.js';
import type { GeoSpecNativeXdeReadResult } from '#step/types.js';

const summaryJson = JSON.stringify({ topologyCounts: { faces: 6 }, boundingBox: { min: [0, 0, 0] } });
const faceFeaturesJson = JSON.stringify({
  planarFaces: [{ normal: [0, 0, 1], offset: 1 }],
  cylindricalFaces: [],
  circularHoles: [
    { diameter: 8, through: false, axis: 'z', center: [10, 0, 0] },
    { diameter: 8, through: false, axis: 'z', center: [-10, 0, 0] },
  ],
  chamferFeatures: [{ distance: 1 }],
  filletFeatures: [],
});

const fakeNative = (overrides: Partial<GeoSpecNativeXdeReadResult> = {}): GeoSpecNativeXdeReadResult =>
  ({
    analysisSummaryJson: vi.fn(() => summaryJson),
    analysisMassPropertiesJson: vi.fn(() => JSON.stringify({ massProperties: { volume: 2 } })),
    analysisValidityJson: vi.fn(() => JSON.stringify({ validity: { valid: true } })),
    analysisFaceFeaturesJson: vi.fn(() => faceFeaturesJson),
    analysisWallThicknessJson: vi.fn(() => JSON.stringify({ minimumWallThickness: { value: 3 } })),
    faceFacts: vi.fn(() =>
      JSON.stringify({
        faces: [
          {
            faceIndex: 0,
            surfaceType: 'cone',
            axisDirection: [0, 0, 1],
            radius: 1,
            bounds: { min: [-13, -13, 0], max: [13, 13, 2] },
          },
        ],
      }),
    ),
    ...overrides,
  }) as unknown as GeoSpecNativeXdeReadResult;

const ledgerFor = (native: GeoSpecNativeXdeReadResult, occurrenceCount = 1) => {
  const handle: BrepLedgerHandle = { native, occurrenceCount, disposed: false };
  return { handle, brep: createBrepEvidenceLedger({ handle, facetOptionsJson: '{}' }) };
};

describe('lazy BRep facet ledger', () => {
  it('should run a facet once, on first read, and share it across its fields', () => {
    const native = fakeNative();
    const { brep } = ledgerFor(native);

    expect(native.analysisSummaryJson).not.toHaveBeenCalled();
    expect(brep.topologyCounts).toStrictEqual({ faces: 6 });
    expect(brep.boundingBox).toStrictEqual({ min: [0, 0, 0] });
    expect(brep.topologyCounts).toStrictEqual({ faces: 6 });
    expect(native.analysisSummaryJson).toHaveBeenCalledTimes(1);
    // Reading one facet must not force any other.
    expect(native.analysisWallThicknessJson).not.toHaveBeenCalled();
  });

  it('should materialize every facet independently', () => {
    const { brep } = ledgerFor(fakeNative());

    expect(brep.massProperties).toStrictEqual({ volume: 2 });
    expect(brep.validity).toStrictEqual({ valid: true });
    expect(brep.minimumWallThickness).toStrictEqual({ value: 3 });
    expect(brep.planarFaces).toStrictEqual([{ normal: [0, 0, 1], offset: 1 }]);
  });

  it('should attach and clear a forensic sink without changing evidence identity', () => {
    const { brep } = ledgerFor(fakeNative());
    const measurements: unknown[] = [];
    const clear = setBrepEvidenceForensicSink(brep, (measurement) => measurements.push(measurement));

    expect(brep.validity).toStrictEqual({ valid: true });
    clear();
    expect(measurements).toHaveLength(1);
  });

  it('should append derived features to the face-features facet', () => {
    const { brep } = ledgerFor(fakeNative());

    expect(brep.chamferFeatures).toStrictEqual([
      { distance: 1 },
      { distance: 2, selection: 'revolved chamfer (axis z)' },
    ]);
    expect(brep.circularHolePatterns).toStrictEqual([
      { count: 2, holeDiameter: 8, boltCircleDiameter: 20, axis: 'z', center: [0, 0, 0] },
    ]);
  });

  it('should serialize only materialized facets', () => {
    const { brep } = ledgerFor(fakeNative());

    // Serialization must not force a facet, so this asserts on the wire text:
    // a deep clone would read every getter and materialize all five.
    expect(JSON.stringify(brep)).toBe('{}');
    expect(brep.validity).toBeDefined();
    expect(JSON.stringify(brep)).toBe('{"validity":{"valid":true}}');
  });

  it('should memoize a diagnostic when the kernel reports a facet error', () => {
    const native = fakeNative({ analysisSummaryJson: vi.fn(() => JSON.stringify({ error: 'no root shape' })) });
    const { brep } = ledgerFor(native);

    expect(brep.topologyCounts).toBeUndefined();
    expect(brep.boundingBox).toBeUndefined();
    expect(native.analysisSummaryJson).toHaveBeenCalledTimes(1);
    expect(getBrepFacetDiagnostic(brep, 'summary')).toMatchObject({
      code: 'GEOSPEC_FACET_FAILED',
      severity: 'warning',
      details: { facet: 'summary' },
    });
    expect(getBrepFacetDiagnostic(brep, 'summary')?.message).toContain('no root shape');
    expect(getBrepFacetDiagnostic(brep, 'validity')).toBeUndefined();
  });

  it('should memoize a diagnostic when a facet throws or answers malformed JSON', () => {
    const thrown = ledgerFor(
      fakeNative({
        analysisMassPropertiesJson: vi.fn(() => {
          throw new Error('native trap');
        }),
      }),
    );
    expect(thrown.brep.massProperties).toBeUndefined();
    expect(getBrepFacetDiagnostic(thrown.brep, 'massProperties')?.message).toContain('native trap');

    const nonError = ledgerFor(
      fakeNative({
        analysisMassPropertiesJson: vi.fn((): string => {
          // oxlint-disable-next-line typescript/only-throw-error -- An embind trap can surface as a bare value; the ledger must still name it.
          throw 'bare string';
        }),
      }),
    );
    expect(nonError.brep.massProperties).toBeUndefined();
    expect(getBrepFacetDiagnostic(nonError.brep, 'massProperties')?.message).toContain('bare string');

    const malformed = ledgerFor(fakeNative({ analysisValidityJson: vi.fn(() => 'not json') }));
    expect(malformed.brep.validity).toBeUndefined();
    expect(getBrepFacetDiagnostic(malformed.brep, 'validity')?.message).toContain('malformed JSON');
  });

  it('should never report a partial result when the work-unit budget is exhausted', () => {
    const { brep } = ledgerFor(
      fakeNative({
        analysisWallThicknessJson: vi.fn(() => JSON.stringify({ budgetExceeded: { workUnits: 12, limit: 10 } })),
      }),
    );

    expect(brep.minimumWallThickness).toBeUndefined();
    expect(getBrepFacetDiagnostic(brep, 'wallThickness')).toMatchObject({
      details: { facet: 'wallThickness', native: { workUnits: 12, limit: 10 } },
    });
  });

  it('should record a diagnostic instead of touching a disposed handle', () => {
    const native = fakeNative();
    const { handle, brep } = ledgerFor(native);
    handle.disposed = true;

    expect(brep.validity).toBeUndefined();
    expect(native.analysisValidityJson).not.toHaveBeenCalled();
    expect(getBrepFacetDiagnostic(brep, 'validity')?.message).toContain('already disposed');
  });

  it('should answer no diagnostic for evidence it did not create', () => {
    expect(getBrepFacetDiagnostic({}, 'summary')).toBeUndefined();
  });

  it('should scan no occurrences when the read reports none', () => {
    const native = fakeNative();
    const { brep } = ledgerFor(native, 0);

    expect(brep.chamferFeatures).toStrictEqual([{ distance: 1 }]);
    expect(native.faceFacts).not.toHaveBeenCalled();
  });

  it('should tolerate a face-facts payload with no faces', () => {
    const native = fakeNative({ faceFacts: vi.fn(() => '{}') });
    const { brep } = ledgerFor(native);

    expect(brep.chamferFeatures).toStrictEqual([{ distance: 1 }]);
  });

  it('should derive from an empty face-features payload without inventing rows', () => {
    const native = fakeNative({ analysisFaceFeaturesJson: vi.fn(() => '{}'), faceFacts: vi.fn(() => '{"faces":[]}') });
    const { brep } = ledgerFor(native);

    expect(brep.chamferFeatures).toStrictEqual([]);
    expect(brep.circularHolePatterns).toStrictEqual([]);
  });
});

describe('the brep-facet family', () => {
  afterEach(() => {
    setGeoSpecEvidenceStore(undefined);
  });

  const persistentLedger = (native: GeoSpecNativeXdeReadResult) => {
    const handle: BrepLedgerHandle = { native, occurrenceCount: 1, disposed: false };
    return createBrepEvidenceLedger({ handle, facetOptionsJson: '{}', contentHash: 'sha256:abc' });
  };

  it('should answer a warm facet without touching the native read', () => {
    setGeoSpecEvidenceStore(createMemoryEvidenceStore());
    const cold = fakeNative();
    expect(persistentLedger(cold).topologyCounts).toStrictEqual({ faces: 6 });
    expect(cold.analysisSummaryJson).toHaveBeenCalledTimes(1);

    const warm = fakeNative();
    expect(persistentLedger(warm).topologyCounts).toStrictEqual({ faces: 6 });

    expect(warm.analysisSummaryJson).not.toHaveBeenCalled();
  });

  it('should replay a derived face-features facet identically', () => {
    setGeoSpecEvidenceStore(createMemoryEvidenceStore());
    const cold = persistentLedger(fakeNative()).chamferFeatures;
    const warmNative = fakeNative();
    const warm = persistentLedger(warmNative).chamferFeatures;

    expect(warm).toStrictEqual(cold);
    expect(warmNative.analysisFaceFeaturesJson).not.toHaveBeenCalled();
  });

  it('should NEVER store a facet that failed', () => {
    setGeoSpecEvidenceStore(createMemoryEvidenceStore());
    const broken = () => fakeNative({ analysisSummaryJson: vi.fn(() => JSON.stringify({ error: 'no root shape' })) });

    expect(persistentLedger(broken()).topologyCounts).toBeUndefined();
    const second = broken();
    expect(persistentLedger(second).topologyCounts).toBeUndefined();

    // A failure is not evidence: the second read tried again rather than
    // replaying the empty payload as if it were an answer.
    expect(second.analysisSummaryJson).toHaveBeenCalledTimes(1);
  });

  it('should stay cold for a subject with no content hash', () => {
    setGeoSpecEvidenceStore(createMemoryEvidenceStore());
    const first = fakeNative();
    const second = fakeNative();

    const read = (native: GeoSpecNativeXdeReadResult): unknown =>
      createBrepEvidenceLedger({ handle: { native, occurrenceCount: 1, disposed: false }, facetOptionsJson: '{}' })
        .topologyCounts;
    read(first);
    read(second);

    expect(second.analysisSummaryJson).toHaveBeenCalledTimes(1);
  });
});
