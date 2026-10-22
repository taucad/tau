---
cli: minor
host: minor
---

`@taucad/cli/geospec` exports `tauExporter()`, Tau's runtime as a GeoSpec model exporter composed the way `tau export` composes it (built-in kernels, then `plugins` and `config`), so a `geospec.config.ts` can run a Tau project under `geospec run`. `tau test` now runs suites on GeoSpec's Node pool with that exporter ahead of the config's exporters, and gives the same verdicts a Tau host gives. `tau export --out <dir>` serves GeoSpec subprocess protocol 1 (`--file`, `--format glb|step`, `--project`, and optional `--parameters-json`, mesh tolerances and region), printing one JSON document, so `commandExporter` and Python's `command_loader` can export through the CLI.

`@taucad/host/agent-tools` adds `createHostGeoSpecExporter`, the exporter a Tau host's runtime client backs.
