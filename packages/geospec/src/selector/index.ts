/**
 * GeoSpec selector index and resolution engine (SB3): the canonical selector
 * type system (L2/L3 of the durable selector architecture), the per-subject
 * selector index, pure resolution, diagnostics, tolerances, and stale
 * detection.
 *
 * @module
 */

export {
  composeFullName,
  isValidStoredName,
  parseSelectorPath,
  storedNamePattern,
  type SelectorPathSegment,
} from '#selector/grammar.js';
export { defaultSelectorTolerances, resolveTolerances, type SelectorTolerances } from '#selector/tolerances.js';
export type {
  AxisQuery,
  AxisSelector,
  BodyQuery,
  BodySelector,
  CandidateEntity,
  Cardinality,
  DatumSelector,
  DirectionPredicate,
  FaceQuery,
  FaceSelector,
  GeometryFacts,
  GeometrySelection,
  GeometrySelectionSource,
  GeometrySelectionStability,
  GeometrySelectionStatus,
  GeometrySelector,
  GroupSelector,
  InterfaceSelector,
  NumericRange,
  OccurrenceSelector,
  PlaneQuery,
  PlaneSelector,
  RayPredicate,
  ResolvedEntity,
  ResolvedEntityType,
  SelectorFaceFacts,
  SelectorSurfaceType,
  SerializedRegExp,
  Vec3Record,
} from '#selector/types.js';
export { deserializeSelector, serializeSelector } from '#selector/types.js';
export {
  buildSelectorIndex,
  type BuildSelectorIndexOptions,
  type SelectorBodyRow,
  type SelectorDatumRow,
  type SelectorFaceFactsTable,
  type SelectorFaceRow,
  type SelectorGroupRow,
  type SelectorIndex,
  type SelectorInterfaceRow,
  type SelectorOccurrenceRow,
} from '#selector/index-builder.js';
export { resolve } from '#selector/resolve.js';
export {
  ambiguousDiagnostic,
  missingStampedFactsDiagnostic,
  selectorDiagnosticCodes,
  staleDiagnostic,
  unmatchedDiagnostic,
  unsupportedEvidenceDiagnostic,
  type SelectorDiagnosticOptions,
} from '#selector/diagnostics.js';
export {
  compareStampedFacts,
  mapStampedFactsToSubjectFrame,
  parseStampedFacts,
  type ParsedStampedFacts,
  type StaleComparison,
  type StampedDatumFacts,
  type StampedFaceFacts,
  type StampedFacts,
} from '#selector/stale.js';
