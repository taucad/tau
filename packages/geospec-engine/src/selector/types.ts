/**
 * Engine-side selector vocabulary: the substrate's canonical selector type
 * system re-published under the engine's own `#selector/*` paths.
 *
 * The engine never owns selector semantics (D-S1: the selector language is
 * substrate). These aliases exist only so engine modules and the migrated
 * oracle suites can import the vocabulary through one specifier.
 *
 * @module
 */

import type {
  Cardinality as SubstrateCardinality,
  CandidateEntity as SubstrateCandidateEntity,
  GeometryFacts as SubstrateGeometryFacts,
  GeometrySelection as SubstrateGeometrySelection,
  GeometrySelectionSource as SubstrateGeometrySelectionSource,
  GeometrySelectionStability as SubstrateGeometrySelectionStability,
  GeometrySelectionStatus as SubstrateGeometrySelectionStatus,
  GeometrySelector as SubstrateGeometrySelector,
  ResolvedEntity as SubstrateResolvedEntity,
  ResolvedEntityType as SubstrateResolvedEntityType,
  SelectorFaceFacts as SubstrateSelectorFaceFacts,
  SelectorSurfaceType as SubstrateSelectorSurfaceType,
} from 'geospec/selector';

/** Re-published substrate vocabulary: {@link SubstrateCandidateEntity}. @public */
export type CandidateEntity = SubstrateCandidateEntity;
/** Re-published substrate vocabulary: {@link SubstrateCardinality}. @public */
export type Cardinality = SubstrateCardinality;
/** Re-published substrate vocabulary: {@link SubstrateGeometryFacts}. @public */
export type GeometryFacts = SubstrateGeometryFacts;
/** Re-published substrate vocabulary: {@link SubstrateGeometrySelection}. @public */
export type GeometrySelection = SubstrateGeometrySelection;
/** Re-published substrate vocabulary: {@link SubstrateGeometrySelectionSource}. @public */
export type GeometrySelectionSource = SubstrateGeometrySelectionSource;
/** Re-published substrate vocabulary: {@link SubstrateGeometrySelectionStability}. @public */
export type GeometrySelectionStability = SubstrateGeometrySelectionStability;
/** Re-published substrate vocabulary: {@link SubstrateGeometrySelectionStatus}. @public */
export type GeometrySelectionStatus = SubstrateGeometrySelectionStatus;
/** Re-published substrate vocabulary: {@link SubstrateGeometrySelector}. @public */
export type GeometrySelector = SubstrateGeometrySelector;
/** Re-published substrate vocabulary: {@link SubstrateResolvedEntity}. @public */
export type ResolvedEntity = SubstrateResolvedEntity;
/** Re-published substrate vocabulary: {@link SubstrateResolvedEntityType}. @public */
export type ResolvedEntityType = SubstrateResolvedEntityType;
/** Re-published substrate vocabulary: {@link SubstrateSelectorFaceFacts}. @public */
export type SelectorFaceFacts = SubstrateSelectorFaceFacts;
/** Re-published substrate vocabulary: {@link SubstrateSelectorSurfaceType}. @public */
export type SelectorSurfaceType = SubstrateSelectorSurfaceType;
