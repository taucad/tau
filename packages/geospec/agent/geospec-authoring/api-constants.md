# geospec — Constants

12 top-level symbols. Signatures are verbatim typescript.

// Every matcher name exposed by {@link expectGeo}, derived from the live matcher surface so it can never drift from the real implementation
geoSpecMatcherNames: readonly string[]

// The 26-entry matcher registry
geoSpecMatcherDescriptors: Readonly<{
    [Name in GeoSpecMatcherName]: Name extends GeoSpecFixedMatcherName ? GeoSpecFixedMatcherDescriptor & {
        readonly kind: Name;
    } : GeoSpecMatcherDescriptor;
}>

// Contract-B protocol version spoken by this substrate
geoSpecEngineProtocolVersion: 2

// Registry version consumed by the Wave-1 matcher vocabulary
geoSpecMatcherRegistryVersion: 3

geoSpecEngineGlobalKey: "__GEOSPEC_ENGINE__"

geoSpecEngineUnavailableCode: "GEOSPEC_ENGINE_UNAVAILABLE"

// Registry error constructor, re-exported without changing its identity
GeoSpecEngineUnavailableError: typeof RegisteredGeoSpecEngineUnavailableError

// Directories skipped by recursive GeoSpec discovery unless callers provide their own ignored-directory list
defaultGeoSpecIgnoredDirectories: readonly [".git", "node_modules", "dist", "coverage", ".tau/cache", ".tau/artifacts", ".tau/transcripts"]

// Default file globs used by GeoSpec test discovery
defaultGeoSpecInclude: readonly ["**/*.geospec.{ts,js}"]

// Full-name regex for stored interface names per the profile
storedNamePattern: RegExp

// Default selector tolerances
defaultSelectorTolerances: SelectorTolerances

// Diagnostic codes emitted by selector resolution
selectorDiagnosticCodes: {
    readonly unmatched: "GEOSPEC_SELECTOR_UNMATCHED";
    readonly ambiguous: "GEOSPEC_SELECTOR_AMBIGUOUS";
    readonly unsupportedEvidence: "GEOSPEC_SELECTOR_UNSUPPORTED_EVIDENCE";
}
