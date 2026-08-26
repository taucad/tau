/**
 * Lazy BRep facet-ledger contract. The ledger itself is engine machinery; the
 * substrate publishes the facet vocabulary and the per-facet diagnostic
 * accessor the matchers read.
 *
 * @module
 */

/**
 * The five lazily materialized BRep evidence facets.
 *
 * Facet → evidence-field ownership:
 * - `summary` → `topologyCounts`, `boundingBox`
 * - `massProperties` → `massProperties`
 * - `validity` → `validity`
 * - `faceFeatures` → `planarFaces`, `cylindricalFaces`, `circularHoles`,
 *   `circularHolePatterns`, `chamferFeatures`, `filletFeatures`
 * - `wallThickness` → `minimumWallThickness`
 *
 * @public
 */
export type BrepFacetName = 'summary' | 'massProperties' | 'validity' | 'faceFeatures' | 'wallThickness';
