import { afterEach, describe, expect, it } from 'vitest';
import { setGeoSpecEvidenceStore } from '#cache/evidence-cache.js';
import { createMemoryEvidenceStore } from '#cache/testing/memory-evidence-store.js';
import { getSubjectProofContext } from '#proofs/subject-context.js';
import type { GeometrySubject } from '#mesh/types.js';
import type { GeoSpecNativeXdeReadResult, XdeReadResult } from '#step/types.js';

const xde = (): XdeReadResult =>
  ({
    occurrences: [
      { path: 'cube', productName: 'cube', transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], shapeIndex: 0 },
    ],
    subshapeNames: [],
    datumPlacements: [],
    semanticDatums: [],
    datumSystems: [],
    supplementalPlanes: [],
    supplementalAxisPlacements: [],
  }) as unknown as XdeReadResult;

const faceFactsJson = JSON.stringify({
  faces: [
    {
      faceIndex: 0,
      surfaceType: 'plane',
      normal: [0, 0, 1],
      offset: 0,
      area: 4,
      centroid: [0, 0, 0],
      bounds: { min: [-1, -1, 0], max: [1, 1, 0] },
    },
  ],
});

const nativeRead = (options?: { json?: string; count?: () => void }): GeoSpecNativeXdeReadResult =>
  ({
    isSuccess: () => true,
    resultJson: () => '{}',
    faceFacts: () => {
      options?.count?.();
      return options?.json ?? faceFactsJson;
    },
    extrema: () => '{}',
    classifyPoints: () => '{"states":[]}',
    commonVolume: () => '{}',
  }) as unknown as GeoSpecNativeXdeReadResult;

const subject = (overrides?: Partial<GeometrySubject>): GeometrySubject =>
  ({
    kind: 'geometry-subject',
    mesh: { format: 'mesh-buffer', stats: {} },
    step: { xde: xde() },
    provenance: { contentHash: 'sha256:a' },
    capabilities: [],
    diagnostics: [],
    nativeXde: nativeRead(),
    ...overrides,
  }) as unknown as GeometrySubject;

afterEach(() => {
  setGeoSpecEvidenceStore(undefined);
});

describe('the per-subject proof context', () => {
  it('should refuse a subject with no retained read or no XDE structure (D5)', () => {
    expect(getSubjectProofContext(subject({ nativeXde: undefined }))).toBeUndefined();
    expect(getSubjectProofContext(subject({ step: undefined }))).toBeUndefined();
  });

  it('should build the L2 index and the occurrence table from the read', () => {
    const context = getSubjectProofContext(subject())!;
    expect(context.index.faces).toHaveLength(1);
    expect(context.occurrenceIndexByPath.get('cube')).toBe(0);
    expect(context.tolerances.linearMm).toBe(0.02);
    expect(context.subjectContentHash).toBe('sha256:a');
  });

  it('should memoize per subject, including the refusal', () => {
    const built = subject();
    expect(getSubjectProofContext(built)).toBe(getSubjectProofContext(built));
    const refused = subject({ nativeXde: undefined });
    expect(getSubjectProofContext(refused)).toBeUndefined();
    expect(getSubjectProofContext(refused)).toBeUndefined();
  });

  it('should attach a run-local forensic sink to fresh and memoized contexts', () => {
    const built = subject();
    const sink = (): void => undefined;

    expect(getSubjectProofContext(built, sink)?.forensic).toBe(sink);
    expect(getSubjectProofContext(built, sink)?.forensic).toBe(sink);
  });

  it('should replay face facts through the face-facts family', () => {
    setGeoSpecEvidenceStore(createMemoryEvidenceStore());
    let reads = 0;
    const count = (): void => {
      reads += 1;
    };
    getSubjectProofContext(subject({ nativeXde: nativeRead({ count }) }));
    getSubjectProofContext(subject({ nativeXde: nativeRead({ count }) }));
    expect(reads).toBe(1);
  });

  it('should never persist a failed face-facts crossing', () => {
    const store = createMemoryEvidenceStore();
    setGeoSpecEvidenceStore(store);
    const context = getSubjectProofContext(subject({ nativeXde: nativeRead({ json: '{"error":"nope"}' }) }))!;
    expect(context.index.faces).toEqual([]);
    expect(store.families()).toEqual([]);
  });

  it('should skip persistence for a subject with no content provenance', () => {
    const store = createMemoryEvidenceStore();
    setGeoSpecEvidenceStore(store);
    const context = getSubjectProofContext(
      subject({ provenance: { loader: 'test' } as unknown as GeometrySubject['provenance'] }),
    )!;
    expect(context.subjectContentHash).toBeUndefined();
    expect(store.families()).toEqual([]);
  });

  it('should thread the tessellation fetchers only when the subject has them', () => {
    const bare = getSubjectProofContext(subject())!;
    expect(bare.occurrenceMesh).toBeUndefined();

    const mesh = { positions: new Float32Array(0), triangleCount: 0 };
    const wired = getSubjectProofContext(
      subject({
        occurrenceMesh: () => mesh,
      }),
    )!;
    expect(wired.occurrenceMesh?.(0)).toBe(mesh);
  });
});
