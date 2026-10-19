---
geospec: minor
---

Add the GeoSpec-native model exporter seam beside the runtime routes: `GeoSpecModelExporter` with declared capabilities, `exporters` on `createModelLoader` and the native model loader (consulted when no runtime is configured), the typed refusals `GEOSPEC_EXPORTER_UNSUPPORTED`, `GEOSPEC_EXPORTER_MISSING`, `GEOSPEC_EXPORTER_FAILED` and `GEOSPEC_EXPORTER_INVALID_ARTIFACT`, and `commandExporter` in the new `geospec/model/node` subpath, which runs any command speaking subprocess protocol 1.
