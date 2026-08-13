/**
 * The proof context and its operands — the vocabulary every proof module
 * shares.
 *
 * It lives apart from the proofs themselves so relationship implementations
 * can share it without import cycles.
 *
 * @module
 */

import type { RelationshipProofNative } from '#proofs/native-evidence.js';
import type { GeometryFacts, GeometrySelection } from '#selector/types.js';
import type { SelectorIndex, SelectorTolerances } from '#selector/index.js';
import type { GeoSpecSpatialRelationshipExpectation } from '#runner/types.js';
import type { OccurrenceMesh, OccurrenceMeshOptions } from '#mesh/types.js';
import type { ForensicSink } from '#runner/forensic.js';

/**
 * The proof context as the engine sees it: the substrate's declared shape plus
 * the live members D-S0 keeps off the seam — the native proof surface and the
 * on-demand tessellation fetchers.
 *
 * @public
 */
export type RelationshipProofContext = {
  index: SelectorIndex;
  occurrenceIndexByPath: ReadonlyMap<string, number>;
  tolerances: SelectorTolerances;
  subjectContentHash?: string;
  native: RelationshipProofNative;
  occurrenceMesh?: (occurrence: number, options?: OccurrenceMeshOptions) => OccurrenceMesh | undefined;
  forensic?: ForensicSink;
};

/**
 * Input to one relationship proof.
 *
 * @public
 */
export type RelationshipProofInput = {
  subject: GeometrySelection;
  target: GeometrySelection;
  expectation: GeoSpecSpatialRelationshipExpectation;
  context: RelationshipProofContext;
};

/**
 * One proof operand: an occurrence solid, or one of its located faces.
 *
 * @public
 */
export type ProofEndpoint = { occurrence: number; face: number; facts: GeometryFacts };

/**
 * Name a selector for a diagnostic.
 *
 * A selector is either the authored string shorthand or a structured query;
 * both have to name themselves in a failure message, and the default
 * stringification of the second one is `[object Object]`.
 *
 * @param selector - The selector as the spec author wrote it.
 * @returns A human-readable label.
 * @public
 */
export const selectorLabel = (selector: unknown): string =>
  typeof selector === 'string' ? selector : JSON.stringify(selector);
