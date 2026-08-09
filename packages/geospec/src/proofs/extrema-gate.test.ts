import { afterEach, describe, expect, it } from 'vitest';
import { setGeoSpecEvidenceStore } from '#cache/evidence-cache.js';
import { createMemoryEvidenceStore } from '#cache/testing/memory-evidence-store.js';
import { boxSoup } from '#mesh/testing/overlap-subjects.js';
import type { OccurrenceMeshFetcher } from '#mesh/types.js';
import { buildFixtureIndex } from '#selector/__fixtures__/two-cube-fixture.js';
import { resolve } from '#selector/resolve.js';
import { resolveTolerances } from '#selector/tolerances.js';
import type { GeometrySelection, GeometrySelector } from '#selector/types.js';
import { proveRelationship } from '#proofs/relationship-proofs.js';
import type { RelationshipProofContext, RelationshipProofNative } from '#proofs/relationship-proofs.js';
import type { GeoSpecSpatialRelationshipExpectation } from '#runner/types.js';

/**
 * CR4 extrema-gate unit matrix over a controlled fake: two unit-cube
 * occurrences whose meshes sit exactly `gap` apart, a native extrema that
 * reports that same gap, and per-row tolerances that steer every resolver
 * branch — resolved passes/fails never cross into OCCT, straddles reproduce
 * the exact path byte-identically (testing policy: observable evidence, no
 * internals).
 */

const index = buildFixtureIndex();

type Harness = {
  context: RelationshipProofContext;
  nativeCalls: () => number;
  meshFetches: () => number;
};

const harness = (options: {
  gap: number;
  extremaGate?: boolean;
  contentHash?: string;
  meshError?: boolean;
}): Harness => {
  let nativeCalls = 0;
  let meshFetches = 0;
  const native: RelationshipProofNative = {
    extrema: () => {
      nativeCalls += 1;
      return JSON.stringify({
        distance: options.gap,
        pointA: [10, 5, 5],
        pointB: [10 + options.gap, 5, 5],
      });
    },
    classifyPoints: () => {
      throw new Error('the extrema gate never classifies points');
    },
    commonVolume: () => {
      nativeCalls += 1;
      return JSON.stringify({ volume: 0, centroid: [10, 5, 5] });
    },
    faceFacts: () => {
      throw new Error('the extrema gate never fetches face facts');
    },
  };
  const occurrenceMesh: OccurrenceMeshFetcher = (occurrence, meshOptions) => {
    meshFetches += 1;
    if (options.meshError) {
      return { error: 'tessellation unavailable' };
    }
    const min = occurrence === 0 ? ([0, 0, 0] as const) : ([10 + options.gap, 0, 0] as const);
    const max = occurrence === 0 ? ([10, 10, 10] as const) : ([20 + options.gap, 10, 10] as const);
    return {
      triangles: new Float64Array(boxSoup(min, max)),
      deflection: meshOptions.linearDeflection,
    };
  };
  return {
    context: {
      native,
      index,
      occurrenceIndexByPath: new Map([
        ['cubeA', 0],
        ['cubeB', 1],
      ]),
      tolerances: resolveTolerances(),
      occurrenceMesh,
      ...(options.contentHash === undefined ? {} : { subjectContentHash: options.contentHash }),
      ...(options.extremaGate === undefined ? {} : { extremaGate: options.extremaGate }),
    },
    nativeCalls: () => nativeCalls,
    meshFetches: () => meshFetches,
  };
};

const occurrence = (name: string): GeometrySelection => {
  const selection = resolve({ kind: 'occurrence', name } as GeometrySelector, index);
  expect(selection.status).toBe('resolved');
  return selection;
};

const prove = (
  context: RelationshipProofContext,
  expectation: Partial<GeoSpecSpatialRelationshipExpectation> & { kind: 'contact' | 'clearance' | 'interference' },
  endpoints?: { subject?: GeometrySelection; target?: GeometrySelection },
) =>
  proveRelationship({
    subject: endpoints?.subject ?? occurrence('cubeA'),
    target: endpoints?.target ?? occurrence('cubeB'),
    expectation: { subject: 'cubeA', target: 'cubeB', ...expectation },
    context,
  });

describe('CR4 extrema gate — contact resolution', () => {
  it('should pass a comfortably-touching claim from a realizable mesh pair, without OCCT', () => {
    const gated = harness({ gap: 1, extremaGate: true });
    const evidence = prove(gated.context, { kind: 'contact', tolerance: 4 });
    expect(evidence.verdict).toBe('pass');
    expect(evidence.final?.method).toBe('mesh-distance-bound');
    // Slack = 2 · (0.1 + 0.1) at this tolerance's deflection clamp.
    expect(evidence.final?.measured['distanceUpperBound']).toBeCloseTo(1.4, 9);
    expect(evidence.final?.witnesses.every((witness) => witness.provenance === 'mesh')).toBe(true);
    expect(evidence.final?.witnesses).toHaveLength(2);
    expect(gated.nativeCalls()).toBe(0);
  });

  it('should fail a clearly-separated claim from the certified bound, without OCCT', () => {
    const gated = harness({ gap: 1, extremaGate: true });
    const evidence = prove(gated.context, { kind: 'contact', tolerance: 0.2 });
    expect(evidence.verdict).toBe('fail');
    expect(evidence.final?.method).toBe('mesh-distance-bound');
    expect(evidence.final?.measured['distanceLowerBound']).toBe(0.2);
    expect(evidence.final?.witnesses).toEqual([]);
    expect(evidence.diagnostics[0]?.message).toContain('certified mesh bound');
    expect(gated.nativeCalls()).toBe(0);
  });

  it('should straddle at boundary equality and reproduce the exact path byte-identically', () => {
    const gated = harness({ gap: 1, extremaGate: true });
    const exact = harness({ gap: 1, extremaGate: false });
    const gatedEvidence = prove(gated.context, { kind: 'contact', tolerance: 1 });
    const exactEvidence = prove(exact.context, { kind: 'contact', tolerance: 1 });
    expect(gatedEvidence).toEqual(exactEvidence);
    expect(gatedEvidence.final?.method).toBe('extrema');
    expect(gated.nativeCalls()).toBe(1);
  });
});

describe('CR4 extrema gate — clearance resolution', () => {
  it('should pass a band claim certified on both sides, without OCCT', () => {
    const gated = harness({ gap: 1, extremaGate: true });
    const evidence = prove(gated.context, { kind: 'clearance', min: 0.2, max: 3, tolerance: 0.01 });
    expect(evidence.verdict).toBe('pass');
    expect(evidence.final?.method).toBe('mesh-distance-bound');
    expect(evidence.final?.measured['distanceLowerBound']).toBeCloseTo(0.19, 9);
    expect(evidence.final?.measured['distanceUpperBound']).toBeCloseTo(1.02, 9);
    expect(evidence.final?.witnesses.every((witness) => witness.provenance === 'mesh')).toBe(true);
    expect(gated.nativeCalls()).toBe(0);
  });

  it('should pass a max-only band via the free lower conjunct', () => {
    const gated = harness({ gap: 1, extremaGate: true });
    const evidence = prove(gated.context, { kind: 'clearance', max: 2, tolerance: 0.01 });
    expect(evidence.verdict).toBe('pass');
    expect(evidence.final?.measured['distanceLowerBound']).toBeUndefined();
    expect(evidence.final?.measured['distanceUpperBound']).toBeCloseTo(1.02, 9);
    expect(gated.nativeCalls()).toBe(0);
  });

  it('should fail too-tight from a realizable pair strictly below the minimum', () => {
    const gated = harness({ gap: 1, extremaGate: true });
    const evidence = prove(gated.context, { kind: 'clearance', min: 3, tolerance: 0.01 });
    expect(evidence.verdict).toBe('fail');
    expect(evidence.final?.method).toBe('mesh-distance-bound');
    expect(evidence.diagnostics[0]?.message).toContain('too tight');
    expect(gated.nativeCalls()).toBe(0);
  });

  it('should fail too-loose from the certified separation beyond the maximum', () => {
    const gated = harness({ gap: 1, extremaGate: true });
    const evidence = prove(gated.context, { kind: 'clearance', max: 0.3, tolerance: 0.01 });
    expect(evidence.verdict).toBe('fail');
    expect(evidence.final?.method).toBe('mesh-distance-bound');
    expect(evidence.diagnostics[0]?.message).toContain('too loose');
    expect(gated.nativeCalls()).toBe(0);
  });

  it('should straddle a minimum at the measured distance and match the exact path', () => {
    const gated = harness({ gap: 1, extremaGate: true });
    const exact = harness({ gap: 1, extremaGate: false });
    const gatedEvidence = prove(gated.context, { kind: 'clearance', min: 1, tolerance: 0.01 });
    const exactEvidence = prove(exact.context, { kind: 'clearance', min: 1, tolerance: 0.01 });
    expect(gatedEvidence).toEqual(exactEvidence);
    expect(gated.nativeCalls()).toBe(1);
  });
});

describe('CR5 interference gate — certified-zero leg', () => {
  afterEach(() => {
    setGeoSpecEvidenceStore(undefined);
  });

  it('should pass a no-interference claim from the certified separation, without OCCT', () => {
    const gated = harness({ gap: 1, extremaGate: true });
    const evidence = prove(gated.context, { kind: 'interference' });
    expect(evidence.verdict).toBe('pass');
    expect(evidence.final?.method).toBe('mesh-distance-bound');
    expect(evidence.final?.measured['volume']).toBe(0);
    expect(gated.nativeCalls()).toBe(0);
  });

  it('should fail a declared interference band from the certified separation, without OCCT', () => {
    const gated = harness({ gap: 1, extremaGate: true });
    const evidence = prove(gated.context, { kind: 'interference', minVolume: 5, maxVolume: 10 });
    expect(evidence.verdict).toBe('fail');
    expect(evidence.diagnostics[0]?.message).toContain('disjoint');
    expect(gated.nativeCalls()).toBe(0);
  });

  it('should fail a degenerate negative band on the exact comparator', () => {
    const gated = harness({ gap: 1, extremaGate: true });
    const evidence = prove(gated.context, { kind: 'interference', maxVolume: -1 });
    expect(evidence.verdict).toBe('fail');
    expect(gated.nativeCalls()).toBe(0);
  });

  it('should fall back to the exact boolean for touching pairs, byte-identically', () => {
    const gated = harness({ gap: 0, extremaGate: true });
    const exact = harness({ gap: 0, extremaGate: false });
    const gatedEvidence = prove(gated.context, { kind: 'interference' });
    const exactEvidence = prove(exact.context, { kind: 'interference' });
    expect(gatedEvidence).toEqual(exactEvidence);
    expect(gatedEvidence.final?.method).toBe('boolean-intersection');
    expect(gated.nativeCalls()).toBe(1);
  });

  it('should replay a stored exact common-volume payload instead of gating (peek-first)', () => {
    setGeoSpecEvidenceStore(createMemoryEvidenceStore());
    const cold = harness({ gap: 1, extremaGate: false, contentHash: 'sha256:interference-gate-peek' });
    const coldEvidence = prove(cold.context, { kind: 'interference' });
    expect(cold.nativeCalls()).toBe(1);

    const gated = harness({ gap: 1, extremaGate: true, contentHash: 'sha256:interference-gate-peek' });
    const gatedEvidence = prove(gated.context, { kind: 'interference' });
    expect(gatedEvidence).toEqual(coldEvidence);
    expect(gated.nativeCalls()).toBe(0);
    expect(gated.meshFetches()).toBe(0);
  });
});

describe('CR4 extrema gate — exact-path guards', () => {
  afterEach(() => {
    setGeoSpecEvidenceStore(undefined);
  });

  it('should stay on the exact path when the gate is disabled', () => {
    const off = harness({ gap: 1, extremaGate: false });
    const evidence = prove(off.context, { kind: 'contact', tolerance: 4 });
    expect(evidence.verdict).toBe('pass');
    expect(evidence.final?.method).toBe('extrema');
    expect(off.nativeCalls()).toBe(1);
    expect(off.meshFetches()).toBe(0);
  });

  it('should stay on the exact path without a tessellation fetcher', () => {
    const gated = harness({ gap: 1, extremaGate: true });
    const { occurrenceMesh: _unused, ...bare } = gated.context;
    const evidence = prove(bare as RelationshipProofContext, { kind: 'contact', tolerance: 4 });
    expect(evidence.final?.method).toBe('extrema');
    expect(gated.nativeCalls()).toBe(1);
  });

  it('should stay on the exact path for face-targeted endpoints', () => {
    const gated = harness({ gap: 1, extremaGate: true });
    const face = resolve('cubeA.face.top', index);
    const evidence = prove(gated.context, { kind: 'contact', tolerance: 4 }, { subject: face });
    expect(evidence.final?.method).toBe('extrema');
    expect(gated.nativeCalls()).toBe(1);
    expect(gated.meshFetches()).toBe(0);
  });

  it('should stay on the exact path when endpoints are unbound', () => {
    const gated = harness({ gap: 1, extremaGate: true });
    const context = { ...gated.context, occurrenceIndexByPath: new Map([['cubeA', 0]]) };
    const evidence = prove(context, { kind: 'contact', tolerance: 4 });
    expect(evidence.verdict).toBe('unsupported');
    expect(gated.meshFetches()).toBe(0);
  });

  it('should stay on the exact path when tessellation errors out', () => {
    const gated = harness({ gap: 1, extremaGate: true, meshError: true });
    const evidence = prove(gated.context, { kind: 'contact', tolerance: 4 });
    expect(evidence.final?.method).toBe('extrema');
    expect(gated.nativeCalls()).toBe(1);
  });

  it('should replay a stored exact payload instead of gating (peek-first)', () => {
    setGeoSpecEvidenceStore(createMemoryEvidenceStore());
    const cold = harness({ gap: 1, extremaGate: false, contentHash: 'sha256:extrema-gate-peek' });
    const coldEvidence = prove(cold.context, { kind: 'contact', tolerance: 4 });
    expect(cold.nativeCalls()).toBe(1);

    const gated = harness({ gap: 1, extremaGate: true, contentHash: 'sha256:extrema-gate-peek' });
    const gatedEvidence = prove(gated.context, { kind: 'contact', tolerance: 4 });
    // The stored exact payload wins: no native call, no mesh fetch, and the
    // evidence replays the exact path byte-identically.
    expect(gatedEvidence).toEqual(coldEvidence);
    expect(gatedEvidence.final?.method).toBe('extrema');
    expect(gated.nativeCalls()).toBe(0);
    expect(gated.meshFetches()).toBe(0);
  });
});
