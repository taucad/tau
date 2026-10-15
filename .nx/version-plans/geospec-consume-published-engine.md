---
geospec: minor
geospec-engine: minor
host: minor
---

The compiled GeoSpec engine now comes from npm as `geospec-engine`, published from [taucad/geospec](https://github.com/taucad/geospec), and no longer from the workspace package `@taucad/geospec-engine-native`.

- `@taucad/geospec-engine` depends on `geospec-engine` and its Node worker pool imports `geospec-engine/node`.
- `@taucad/host`'s optional GeoSpec peer is `geospec-engine` (`^0.1.0-next.19`); the `test_model` tool is advertised when `geospec-engine/node` resolves.
- `geospec` documentation points at the `geospec-engine` package.
