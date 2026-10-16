# geospec — Constants

9 top-level symbols. Signatures are verbatim typescript.

// Every matcher name exposed by {@link expectGeo}, derived from the live matcher surface so it can never drift from the real implementation
geoSpecMatcherNames: readonly string[]

// The 26-entry matcher registry
geoSpecMatcherDescriptors: Readonly<{
    [Name in GeoSpecMatcherName]: Name extends GeoSpecFixedMatcherName ? GeoSpecFixedMatcherDescriptor & {
        readonly kind: Name;
    } : GeoSpecMatcherDescriptor;
}>

// The matchers mesh evidence answers, as the GeoSpec authoring skill lists them (`packages/geospec/agent/geospec-authoring/SKILL.md`)
geoSpecMeshEvidenceMatchers: readonly ["toHaveBoundingBox", "toHaveVolume", "toHaveSurfaceArea", "toHaveConnectedComponents", "toBeWatertight"]

// The claims a region-cropped subject answers
// Remarks: Every other kind quantifies over the whole model (component counts, all-components interference, occurrences, watertightness, integrity, topology, diagnostics) or relates parts the crop may have cut, so a crop can neither prove nor disprove it.
geoSpecRegionScopedKinds: ReadonlySet<GeoSpecAssertion['kind']>

// Diagnostic code of a whole-model claim made on a region-cropped subject
geoSpecRegionWholeModelClaimCode: "GEOSPEC_REGION_WHOLE_MODEL_CLAIM"

// Directories skipped by recursive GeoSpec discovery unless callers provide their own ignored-directory list
defaultGeoSpecIgnoredDirectories: readonly [".git", "node_modules", "dist", "coverage", ".tau/cache", ".tau/artifacts", ".tau/transcripts"]

// Default file globs used by GeoSpec test discovery
defaultGeoSpecInclude: readonly ["**/*.geospec.{ts,js}"]

// Codes for GeoSpec wall-clock timeouts, one per bound
geoSpecTimeoutCode: {
    /** A test's async body outlived `testTimeout` / `--test-timeout`. */
    readonly test: "GEOSPEC_TEST_TIMEOUT";
    /** A pool shard outlived the non-verdict `--shard-timeout` watchdog. */
    readonly shard: "GEOSPEC_SHARD_TIMEOUT";
    /** A whole run outlived its host run budget. */
    readonly run: "GEOSPEC_RUN_TIMEOUT";
}

  // A test's async body outlived `testTimeout` / `--test-timeout`
  readonly test: "GEOSPEC_TEST_TIMEOUT"

  // A pool shard outlived the non-verdict `--shard-timeout` watchdog
  readonly shard: "GEOSPEC_SHARD_TIMEOUT"

  // A whole run outlived its host run budget
  readonly run: "GEOSPEC_RUN_TIMEOUT"

// Default largest work-unit budget a spec may author through `loadModel` or `expectGeo` options
geoSpecMaximumWorkUnitLimit: 512000000
