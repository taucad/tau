---
geospec: minor
geospec-engine: minor
host: minor
cli: minor
---

Load Tau models through a host exporter instead of a runtime client. The `runtime` model-loader option, `GeoSpecRuntimeClient`, the runtime export-intent helpers and `exportTauProjectArtifact` leave `geospec`; Tau hosts now pass `exporters: [await tauClientExporter({ client })]` from `@taucad/agent-tools/geospec`, which claims the extensions the client's kernels declare. `HostGeoSpecRuntimeClient` in `@taucad/host` now names the Tau runtime surface the exporter uses instead of GeoSpec's client, and `createHostGeoSpecRunner` takes any Tau runtime client. The engine's pool worker exports through the same exporter over its default runtime.
