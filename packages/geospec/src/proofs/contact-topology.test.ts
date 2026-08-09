import { describe, expect, it } from 'vitest';
import type { GeometryFacts } from '#selector/types.js';
import type { ContactClassifier } from '#proofs/contact-classifier.js';
import { estimateContactPatchTopological } from '#proofs/contact-topology.js';
import type { RelationshipProofContext, RelationshipProofInput } from '#proofs/relationship-proofs.js';
import type { NativeShapeRef } from '#proofs/types.js';

/** Membership stub — the topology guards return before it is consulted. */
const stubClassifier: ContactClassifier = { classify: (points) => points.map(() => 'out') };
const subject: NativeShapeRef = { occurrence: 0, face: 0 };
const target: NativeShapeRef = { occurrence: 1, face: -1 };
const noAreaFacts: GeometryFacts = {};
const areaFacts: GeometryFacts = { area: 100 };

/** Minimal proof input for the topology guard branches (real proofs come via fixtures). */
const makeInput = (occurrenceFaceMesh?: RelationshipProofContext['occurrenceFaceMesh']): RelationshipProofInput =>
  ({
    subject: {},
    target: {},
    expectation: { kind: 'contact', subject: 's', target: 't' },
    context: {
      tolerances: { linearMm: 0.01 },
      ...(occurrenceFaceMesh ? { occurrenceFaceMesh } : {}),
    },
  }) as unknown as RelationshipProofInput;

describe('estimateContactPatchTopological', () => {
  it('returns undefined (honest unsupported) when the face carries no area', () => {
    const result = estimateContactPatchTopological({
      input: makeInput(),
      subject,
      target,
      facts: noAreaFacts,
      getTargetClassifier: () => stubClassifier,
    });
    expect(result).toBeUndefined();
  });

  it('falls back when the native backend exposes no per-face mesh facet', () => {
    const result = estimateContactPatchTopological({
      input: makeInput(),
      subject,
      target,
      facts: areaFacts,
      getTargetClassifier: () => stubClassifier,
    });
    expect(result).toEqual({ fallback: 'no-occurrence-face-mesh' });
  });

  it('falls back when the per-face fetcher reports a native error', () => {
    const result = estimateContactPatchTopological({
      input: makeInput(() => ({ error: 'face mesh boom' })),
      subject,
      target,
      facts: areaFacts,
      getTargetClassifier: () => stubClassifier,
    });
    expect(result).toEqual({ fallback: 'occurrence-face-mesh: face mesh boom' });
  });
});
