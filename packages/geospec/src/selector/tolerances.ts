/**
 * Tolerance and unit contract shared by selector resolution (R3). Units are
 * millimetres and degrees throughout GeoSpec's
 * selector layer; SB4 imports the same module for proof tolerances so the
 * program has a single tolerance vocabulary ("defined once", master rule).
 *
 * @module
 */

/**
 * Tolerance vocabulary consumed by selector predicates.
 *
 * @public
 */
export type SelectorTolerances = {
  /** Linear/contact tolerance in millimetres (offset bands, `near`, radii). */
  linearMm: number;
  /** Angular tolerance in degrees for normal/axis/parallelism predicates. */
  angularToleranceDegrees: number;
};

/**
 * Default selector tolerances.
 *
 * Rationale:
 * - `linearMm: 0.02` — the V8 manufacturability audit's fixture contact
 *   tolerance; tight enough to reject real fit errors, loose enough to absorb
 *   STEP round-trip noise.
 * - `angularToleranceDegrees: 0.5` — separates deliberate drafts/tilts from
 *   numeric noise in exported analytic directions.
 *
 * @public
 */
export const defaultSelectorTolerances: SelectorTolerances = {
  linearMm: 0.02,
  angularToleranceDegrees: 0.5,
};

/**
 * Resolve effective tolerances from optional overrides.
 *
 * @param overrides - Partial tolerance overrides.
 * @returns Effective tolerances with defaults applied.
 * @public
 */
export const resolveTolerances = (overrides?: Partial<SelectorTolerances>): SelectorTolerances => ({
  ...defaultSelectorTolerances,
  ...overrides,
});
