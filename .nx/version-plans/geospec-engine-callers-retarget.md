---
cli: patch
host: patch
---

`@taucad/cli` no longer depends on `@taucad/geospec-engine`, and `@taucad/host` drops its optional peer on it. Tau's GeoSpec runs (`tau test`, `test_model`, and `geospec run` with `tauExporter` from `@taucad/cli/geospec`) use `geospec`'s CLI and Node pool with the CLI's own runtime, so the compatibility package is no longer installed beside them.
