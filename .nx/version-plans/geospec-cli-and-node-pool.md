---
geospec: minor
geospec-engine: minor
---

`geospec` ships the `geospec` bin. `geospec run` reads the project's `geospec.config.*` (or `--config <path>`): its `include`, `exclude`, `testNamePattern`, `testTimeout` and `bail` apply unless a flag replaces them, and each pool worker imports the config for its `exporters`. `geospec/runner/node` adds `createGeoSpecNodePoolRunner` (with `configPath` and `exporterModules`) and `createNodeGeoSpecEngine`, which runs on the `geospec-engine` native addon when this platform has one and on its WASM build when none is installed; an installed addon that fails to load throws. `geospec/cli` exports `runGeoSpecCli` and `createNodeGeoSpecCliHost` for hosts that wrap the CLI. `geospec` now depends on `geospec-engine`.

`@taucad/geospec-engine` becomes a compatibility package until it is removed: its bin is renamed `tau-geospec`, so it no longer clashes with `geospec`'s own, and it and `createGeoSpecNativeNodePoolRunner` run `geospec`'s CLI and pool with Tau's default exporter ahead of the config's exporters.
