/**
 * Fixture manifest schema for the GeoSpec acceptance corpus (SB5-R1).
 *
 * One `manifest.json` per committed fixture under `packages/geospec/fixtures/`
 * is the single source the acceptance harness reads expectations from:
 * generator provenance, selector expectations (full composed names or
 * serialized typed selectors), and relationship expectations with explicit
 * `broadPhase`/`final` separation for the adversarial cases.
 *
 * @module
 */

import type { GeometrySelectionStatus } from '#selector/types.js';

/**
 * Fixture family, one directory per family under `fixtures/`.
 *
 * @public
 */
export type FixtureFamily = 'contact' | 'clearance' | 'mate' | 'containment' | 'selector';

/**
 * How the committed STEP artifact is (re)produced.
 *
 * @public
 */
export type FixtureGenerator = {
  /**
   * Generation script path relative to `packages/geospec/fixtures/`
   * (run through the runtime CLI), or `'hand-authored'` for fixtures whose
   * STEP text is committed source (the second-producer fixture).
   */
  script: string;
  /** `--params` value passed to the runtime CLI export. */
  parameters?: Record<string, boolean | number | string>;
  /** Post-generation doctoring applied to the emitted STEP text. */
  postEdit?: { script: string; description: string };
};

/**
 * One selector-resolution expectation the harness asserts via the SB3 engine.
 *
 * @public
 */
export type FixtureSelectorExpectation = {
  /**
   * String shorthand (full composed name) or a serialized typed selector
   * (see `deserializeSelector`).
   */
  selector: string | Record<string, unknown>;
  status: GeometrySelectionStatus;
  /** Expected resolved entity count. */
  entityCount?: number;
  /** Fact subset the first resolved entity must match within `factsTolerance`. */
  facts?: Record<string, number | number[] | string>;
  /** Absolute tolerance for `facts` comparison (mm/degrees). Default 1e-6. */
  factsTolerance?: number;
  /** Substrings the resolution (diagnostics/details) must mention. */
  mentions?: string[];
};

/**
 * One relationship expectation, evaluated by the SB4 proof engine when its
 * surface is present (skip-with-reason otherwise).
 *
 * @public
 */
export type FixtureRelationshipExpectation = {
  kind: string;
  subject: string | Record<string, unknown>;
  target: string | Record<string, unknown>;
  /** Expectation options (tolerance bands, minContactArea, …). */
  options?: Record<string, unknown>;
  expected: {
    verdict: 'pass' | 'fail';
    /** Broad-phase expectation — asserted separately from `final` (master case 6). */
    broadPhase?: { candidate: boolean };
    final?: { method?: string; measured?: Record<string, number> };
    /** Selector names the failure diagnostic must single out. */
    mentions?: string[];
  };
  /**
   * Skip marker: the row stays normative but its assertion is skipped with
   * this reason (pending engine work, e.g. an SB4 semantics gap recorded in
   * the sub-blueprint's Implementation Status). Remove the marker when the
   * engine lands the behavior — the row then gates regressions.
   */
  pending?: string;
};

/**
 * The per-fixture manifest, `fixtures/<family>/<fixture>/manifest.json`.
 *
 * @public
 */
export type FixtureManifest = {
  family: FixtureFamily;
  /** Stable fixture id, `<family>.<name>` (directory name is `<name>`). */
  fixture: string;
  generator: FixtureGenerator;
  /** Tolerance context for relationship expectations (mm/degrees). */
  tolerances?: Record<string, number>;
  /**
   * Adversarial premise (master case 6, audit rule 3): the two occurrences'
   * whole-part AABBs must overlap within the linear tolerance — exactly what
   * a naive AABB matcher would accept while the exact proof fails.
   */
  adversarialAabb?: { subject: string; target: string };
  selectors: FixtureSelectorExpectation[];
  relationships?: FixtureRelationshipExpectation[];
  /** Performance canary budgets (largest fixture only). */
  budgets?: {
    /** Milliseconds: full loadStep → index → resolve-all wall clock. */
    loadAndResolve: number;
  };
  notes?: string;
};

const fixtureFamilies: ReadonlySet<string> = new Set(['contact', 'clearance', 'mate', 'containment', 'selector']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Validate a parsed `manifest.json` value structurally.
 *
 * Deliberately shallow: it guards the fields the harness dereferences
 * (family, fixture id shape, generator script, selector/relationship list
 * shapes); expectation semantics are asserted by the harness itself.
 *
 * @param value - Parsed JSON value.
 * @param source - Manifest path for error context.
 * @returns The validated manifest.
 * @public
 */
export const parseFixtureManifest = (value: unknown, source: string): FixtureManifest => {
  const fail = (reason: string): never => {
    throw new Error(`Invalid fixture manifest at ${source}: ${reason}`);
  };
  if (!isRecord(value)) {
    fail('not an object');
  }
  const manifest = value as FixtureManifest;
  if (!fixtureFamilies.has(manifest.family)) {
    fail(`unknown family '${String(manifest.family)}'`);
  }
  if (typeof manifest.fixture !== 'string' || !manifest.fixture.startsWith(`${manifest.family}.`)) {
    fail(`fixture id must be a string prefixed '<family>.', got '${String(manifest.fixture)}'`);
  }
  if (!isRecord(manifest.generator) || typeof manifest.generator.script !== 'string') {
    fail('generator.script must be a string');
  }
  if (!Array.isArray(manifest.selectors) || manifest.selectors.length === 0) {
    fail('selectors must be a non-empty array');
  }
  for (const [index, expectation] of manifest.selectors.entries()) {
    if (!isRecord(expectation) || typeof expectation.status !== 'string') {
      fail(`selectors[${index}] must declare a status`);
    }
  }
  if (manifest.relationships !== undefined && !Array.isArray(manifest.relationships)) {
    fail('relationships must be an array when present');
  }
  return manifest;
};
