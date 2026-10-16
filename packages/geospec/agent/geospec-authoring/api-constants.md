# geospec — Constants

4 top-level symbols. Signatures are verbatim typescript.

// Every matcher name exposed by {@link expectGeo}, derived from the live matcher surface so it can never drift from the real implementation
geoSpecMatcherNames: readonly string[]

// The matchers mesh evidence answers, as the GeoSpec authoring skill lists them (`packages/geospec/agent/geospec-authoring/SKILL.md`)
geoSpecMeshEvidenceMatchers: readonly ["toHaveBoundingBox", "toHaveVolume", "toHaveSurfaceArea", "toHaveConnectedComponents", "toBeWatertight"]

// The claims a region-cropped subject answers
// Remarks: Every other kind quantifies over the whole model (component counts, all-components interference, occurrences, watertightness, integrity, topology, diagnostics) or relates parts the crop may have cut, so a crop can neither prove nor disprove it.
geoSpecRegionScopedKinds: ReadonlySet<GeoSpecAssertion['kind']>

// Diagnostic code of a whole-model claim made on a region-cropped subject
geoSpecRegionWholeModelClaimCode: "GEOSPEC_REGION_WHOLE_MODEL_CLAIM"
