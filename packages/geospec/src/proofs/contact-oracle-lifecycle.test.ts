import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setGeoSpecEvidenceStore } from '#cache/evidence-cache.js';
import { createMemoryEvidenceStore } from '#cache/testing/memory-evidence-store.js';
import type { GeometrySubject } from '#mesh/types.js';
import { getSubjectProofContext, proveRelationship } from '#proofs/index.js';
import type { RelationshipProofContext } from '#proofs/index.js';
import { resolve } from '#selector/resolve.js';
import { loadStep } from '#step/index.js';

// The contact fixtures the differential corpus already certifies: the
// positive flange seats (patch ≈ 1600), the gap variant separates the faces.
const fixture = (relative: string): string => join(import.meta.dirname, '../../fixtures', relative);
const flangePath = fixture('contact/flange-face-positive/model.step');
const flangeGapPath = fixture('contact/flange-face-gap-negative/model.step');

/** Count every occurrence-mesh fetch — the classifier build's first move. */
const countingContext = (
  base: RelationshipProofContext,
): { context: RelationshipProofContext; fetches: () => number } => {
  let count = 0;
  return {
    context: {
      ...base,
      occurrenceMesh: (occurrence, options) => {
        count += 1;
        return base.occurrenceMesh!(occurrence, options);
      },
    },
    fetches: () => count,
  };
};

describe('contact oracle lifecycle (R2/CO-R1, CO-R2, CO-R5)', () => {
  const subjects: GeometrySubject[] = [];

  const loadContext = async (path: string, name: string): Promise<RelationshipProofContext> => {
    const subject = await loadStep({ source: path, name });
    subjects.push(subject);
    const built = getSubjectProofContext(subject);
    if (!built) {
      throw new Error('contact fixture subject must carry STEP-XDE and native BRep evidence.');
    }
    return built;
  };

  const proveSeatArea = (context: RelationshipProofContext) =>
    proveRelationship({
      subject: resolve('runnerFlange.mount', context.index),
      target: resolve('head.port.mount', context.index),
      expectation: {
        kind: 'contact',
        subject: 'runnerFlange.mount',
        target: 'head.port.mount',
        minContactArea: 1500,
      },
      context: { ...context, contactEngine: 'topological' },
    });

  beforeAll(async () => {
    // Warm the fixture cache path once so per-test loads are cheap.
    await loadContext(flangePath, 'flange-face-positive.step');
  }, 120_000);

  afterEach(() => {
    setGeoSpecEvidenceStore(undefined);
  });

  afterAll(() => {
    for (const subject of subjects) {
      subject.nativeXde?.delete?.();
    }
  });

  it('should never build the target oracle when every subject face is beyond the contact tolerance', async () => {
    // The gap fixture separates the flange from the deck by more than the
    // default tolerance: the R3 per-face prune fires for the whole group, and
    // with the R2 thunk the oracle (mesh fetch + winding tree) must never
    // materialize — CO-R5's occurrence-level case, delivered by laziness.
    const { context, fetches } = countingContext(await loadContext(flangeGapPath, 'flange-face-gap-negative.step'));

    const evidence = proveSeatArea(context);

    expect(evidence.verdict).toBe('fail');
    expect(fetches()).toBe(0);
  });

  it('should replay a warm run with zero oracle mesh fetches on a fresh subject', async () => {
    setGeoSpecEvidenceStore(createMemoryEvidenceStore());
    const cold = countingContext(await loadContext(flangePath, 'flange-face-positive.step'));
    const coldEvidence = proveSeatArea(cold.context);
    expect(coldEvidence.verdict).toBe('pass');
    expect(cold.fetches()).toBeGreaterThan(0);

    // Fresh subject, fresh context (the per-requirement shape): the
    // contact-patch family replays every patch, so the thunk never runs and
    // no oracle mesh is fetched.
    const warm = countingContext(await loadContext(flangePath, 'flange-face-positive.step'));
    const warmEvidence = proveSeatArea(warm.context);

    expect(warm.fetches()).toBe(0);
    expect(warmEvidence).toEqual(coldEvidence);
  });

  it('should reuse the built winding classifier across fresh contexts via the content-keyed LRU', async () => {
    // No evidence store at all: every patch recomputes, so the classifier IS
    // needed — but the LRU (keyed on subject content) must satisfy the second
    // context without a single new mesh fetch: the cross-requirement reuse the
    // per-context WeakMap cannot provide.
    const first = countingContext(await loadContext(flangePath, 'flange-face-positive.step'));
    const firstEvidence = proveSeatArea(first.context);
    expect(firstEvidence.verdict).toBe('pass');

    const second = countingContext(await loadContext(flangePath, 'flange-face-positive.step'));
    const secondEvidence = proveSeatArea(second.context);

    expect(second.fetches()).toBe(0);
    expect(secondEvidence).toEqual(firstEvidence);
  });
});
