# geospec — Constants

4 top-level symbols. Signatures are verbatim typescript.

// Every matcher name exposed by {@link expectGeo}, derived from the live matcher surface so it can never drift from the real implementation
geoSpecMatcherNames: readonly string[]

// The 26-entry matcher registry
geoSpecMatcherDescriptors: Readonly<{
    [Name in GeoSpecMatcherName]: Name extends GeoSpecFixedMatcherName ? GeoSpecFixedMatcherDescriptor & {
        readonly kind: Name;
    } : GeoSpecMatcherDescriptor;
}>

// Directories skipped by recursive GeoSpec discovery unless callers provide their own ignored-directory list
defaultGeoSpecIgnoredDirectories: readonly [".git", "node_modules", "dist", "coverage", ".tau/cache", ".tau/artifacts", ".tau/transcripts"]

// Default file globs used by GeoSpec test discovery
defaultGeoSpecInclude: readonly ["**/*.geospec.{ts,js}"]
