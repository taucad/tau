---
cli: patch
host: patch
mcp: patch
---

`@taucad/cli` now depends on `geospec-engine`, `geospec` and `@taucad/geospec-engine`, so a global install resolves the GeoSpec engine `@taucad/host` peers optionally and `tau mcp` runs `test_model`. `@taucad/mcp` servers take `cadTools` to list a subset of the CAD tools; `@taucad/host` lists `test_model` only when its registry offers it and answers a `test_model` call it cannot run with `GEOSPEC_ENGINE_MISSING`, naming the install command, instead of `TOOL_NOT_FOUND`.
