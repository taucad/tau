/**
 * Engine-side handle on the substrate's selector engine.
 *
 * Selector semantics are substrate (D-S1) and stay there; this barrel exists
 * so engine modules and the migrated oracle suites reach the index builder,
 * pure resolution and the tolerance defaults through one `#selector/*`
 * specifier instead of importing `geospec/selector` from a dozen files.
 *
 * @module
 */

export {
  buildSelectorIndex,
  deserializeSelector,
  resolveTolerances,
  serializeSelector,
  type BuildSelectorIndexOptions,
  type SelectorBodyRow,
  type SelectorFaceFactsTable,
  type SelectorFaceRow,
  type SelectorIndex,
  type SelectorOccurrenceRow,
  type SelectorTolerances,
} from 'geospec/selector';
export { resolve } from '#selector/resolve.js';
export type {
  CandidateEntity,
  Cardinality,
  GeometryFacts,
  GeometrySelection,
  GeometrySelectionSource,
  GeometrySelectionStability,
  GeometrySelectionStatus,
  GeometrySelector,
  ResolvedEntity,
  ResolvedEntityType,
  SelectorFaceFacts,
  SelectorSurfaceType,
} from '#selector/types.js';
