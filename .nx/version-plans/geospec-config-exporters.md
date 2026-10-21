---
geospec: minor
---

`geospec/config` adds `defineConfig`, the `exporters` field and `readGeoSpecConfig`, and drops `cache`, `cacheDirectory`, `subjects` and `GeoSpecTauProjectDescriptor` with the `@taucad/project-core` dependency. `readGeoSpecConfig({ filesystem, projectPath })` reads a config's data fields through the spec VM on any host: a config that imports a package other than `geospec/config` is `not-applied` with reason `unresolved-import`, detected before bundling with no network call. `loadGeoSpecConfig` resolves a config's `geospec/config` import to its own copy when the project has no install. `commandExporter` takes an optional `exportTimeout` and fails an export that runs longer with `GEOSPEC_EXPORTER_FAILED`.
