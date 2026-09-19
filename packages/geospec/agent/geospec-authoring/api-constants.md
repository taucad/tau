# geospec — Constants

3 top-level symbols. Signatures are verbatim typescript.

// Every matcher name exposed by {@link expectGeo}, derived from the live matcher surface so it can never drift from the real implementation
geoSpecMatcherNames: readonly string[]

// Directories skipped by recursive GeoSpec discovery unless callers provide their own ignored-directory list
defaultGeoSpecIgnoredDirectories: readonly [".git", "node_modules", "dist", "coverage", ".tau/cache", ".tau/artifacts", ".tau/transcripts"]

// Default file globs used by GeoSpec test discovery
defaultGeoSpecInclude: readonly ["**/*.geospec.{ts,js}"]
