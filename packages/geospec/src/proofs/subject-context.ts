/**
 * Per-subject proof-context adapter (SB4).
 *
 * Builds the L2 selector index for a BRep subject from its STEP-XDE read
 * result plus the native handle's per-occurrence face facts, and pairs it
 * with the native proof surface. The context is cached per subject object
 * (D1: caching the *index* per subject is fine; resolutions are never cached
 * across artifacts). A subject without both `step.xde` and `nativeXde`
 * yields `undefined` — the D5 matcher precondition input.
 *
 * @module
 */

import type { GeometrySubject } from '#mesh/types.js';
import { buildSelectorIndex } from '#selector/index-builder.js';
import type { SelectorFaceFactsTable } from '#selector/index-builder.js';
import { resolveTolerances } from '#selector/tolerances.js';
import type { SelectorFaceFacts } from '#selector/types.js';
import type { RelationshipProofContext } from '#proofs/relationship-proofs.js';

const contextCache = new WeakMap<GeometrySubject, RelationshipProofContext | undefined>();

const parseFaceFacts = (raw: string): { faces: SelectorFaceFacts[] } => {
  const parsed = JSON.parse(raw) as { faces?: SelectorFaceFacts[]; error?: unknown };
  return Array.isArray(parsed.faces) ? { faces: parsed.faces } : { faces: [] };
};

/**
 * Build (or return the cached) relationship proof context for a subject.
 *
 * @param subject - GeoSpec geometry subject.
 * @returns The proof context, or `undefined` when the subject carries no
 * BRep/XDE evidence (D5 precondition failure).
 * @public
 */
export const getSubjectProofContext = (subject: GeometrySubject): RelationshipProofContext | undefined => {
  if (contextCache.has(subject)) {
    return contextCache.get(subject);
  }
  const xde = subject.step?.xde;
  const native = subject.nativeXde;
  if (!xde || !native) {
    contextCache.set(subject, undefined);
    return undefined;
  }
  const faceFactsByOccurrence: SelectorFaceFactsTable = {};
  const occurrenceIndexByPath = new Map<string, number>();
  for (const [position, occurrence] of xde.occurrences.entries()) {
    occurrenceIndexByPath.set(occurrence.path, position);
    faceFactsByOccurrence[occurrence.path] = parseFaceFacts(native.faceFacts(position));
  }
  const context: RelationshipProofContext = {
    native,
    index: buildSelectorIndex({ xde, faceFactsByOccurrence }),
    occurrenceIndexByPath,
    tolerances: resolveTolerances(),
  };
  contextCache.set(subject, context);
  return context;
};
