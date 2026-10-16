---
cli: patch
host: patch
mcp: patch
---

`@taucad/cli` now depends on `geospec-engine`, `geospec` and `@taucad/geospec-engine`, so a global install resolves the GeoSpec engine `@taucad/host` peers optionally and `tau mcp` runs `test_model`. `@taucad/mcp` servers take `cadTools` to list a subset of the CAD tools; `@taucad/host` lists `test_model`, and the instructions that ask for GeoSpec tests, only when its registry offers it, so an MCP client is never offered a `test_model` that answers `TOOL_NOT_FOUND`.
