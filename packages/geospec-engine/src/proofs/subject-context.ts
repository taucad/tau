/**
 * The per-subject relationship proof context (D-S5 engine half).
 *
 * The substrate declares the context's *shape* and the accessor; building one
 * is engine work because it needs the retained AP242 read: the L2 selector
 * index is precomputed from `faceFacts(occurrence)` so L3 resolution stays
 * pure (no wasm calls), and the context then carries the four-method native
 * proof surface the exact proofs run through.
 *
 * Per-occurrence face facts persist in the `face-facts` family, so a warm
 * subject builds its index without materializing the deferred native read
 * (R8/B15).
 *
 * @module
 */

import { buildSelectorIndex, resolveTolerances } from 'geospec/selector';
import type { SelectorFaceFactsTable } from 'geospec/selector';
import { readEvidenceJson, writeEvidenceJson } from '#cache/evidence-cache.js';
import type { GeometrySubject } from '#mesh/types.js';
import type { RelationshipProofContext } from '#proofs/context.js';
import { forensicSpan } from '#runner/forensic.js';
import type { ForensicSink } from '#runner/forensic.js';
import type { SelectorFaceFacts } from '#selector/types.js';
import type { GeoSpecNativeXdeReadResult } from '#step/types.js';

type FaceFactsPayload = { faces: SelectorFaceFacts[] };

/**
 * Read one occurrence's analytic face facts, through the `face-facts` family.
 *
 * A native error is not evidence and is never stored (C5); it degrades to an
 * empty face table, which the index reports as an occurrence with no faces.
 *
 * @param native - The retained read.
 * @param occurrence - Occurrence index.
 * @param contentHash - Subject content hash, when the subject has provenance.
 * @returns The occurrence's face facts.
 */
const readFaceFacts = (
  native: GeoSpecNativeXdeReadResult,
  occurrence: number,
  contentHash: string | undefined,
): FaceFactsPayload => {
  const key = contentHash === undefined ? undefined : { contentHash, occurrence };
  if (key) {
    const cached = readEvidenceJson<FaceFactsPayload>('face-facts', key);
    if (cached) {
      return cached;
    }
  }
  const parsed = JSON.parse(native.faceFacts(occurrence)) as Partial<FaceFactsPayload> & { error?: string };
  if (!parsed.faces) {
    return { faces: [] };
  }
  const payload: FaceFactsPayload = { faces: parsed.faces };
  if (key) {
    writeEvidenceJson('face-facts', key, payload);
  }
  return payload;
};

const built = new WeakMap<GeometrySubject, RelationshipProofContext | undefined>();

const build = (subject: GeometrySubject): RelationshipProofContext | undefined => {
  const native = subject.nativeXde;
  const xde = subject.step?.xde;
  if (!native || !xde) {
    // D5 precondition: no BRep/XDE evidence, so no exact proof is possible.
    return undefined;
  }
  const { contentHash } = subject.provenance;
  const occurrenceIndexByPath = new Map<string, number>();
  const faceFactsByOccurrence: SelectorFaceFactsTable = {};
  for (const [position, occurrence] of xde.occurrences.entries()) {
    occurrenceIndexByPath.set(occurrence.path, position);
    faceFactsByOccurrence[occurrence.path] = readFaceFacts(native, position, contentHash);
  }
  const { occurrenceMesh } = subject;
  return {
    index: buildSelectorIndex({ xde, faceFactsByOccurrence }),
    occurrenceIndexByPath,
    tolerances: resolveTolerances(),
    ...(contentHash === undefined ? {} : { subjectContentHash: contentHash }),
    native,
    // The canonical void proof forwards its fixed tessellation deflection.
    ...(occurrenceMesh === undefined ? {} : { occurrenceMesh }),
  };
};

/**
 * Build (or return the cached) relationship proof context for a subject.
 *
 * @param subject - GeoSpec geometry subject.
 * @returns The proof context, or `undefined` when the subject carries no
 * BRep/XDE evidence (D5 precondition failure).
 * @public
 */
export const getSubjectProofContext = (
  subject: GeometrySubject,
  forensic?: ForensicSink,
): RelationshipProofContext | undefined => {
  if (built.has(subject)) {
    const context = built.get(subject);
    return context === undefined || forensic === undefined ? context : { ...context, forensic };
  }
  const context = forensicSpan('subject-build', () => build(subject), forensic);
  built.set(subject, context);
  return context === undefined || forensic === undefined ? context : { ...context, forensic };
};
