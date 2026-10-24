---
geospec: minor
host: minor
mcp: minor
---

`geospec/vitest/node` exports `setupGeoSpecVitestProject()`, which reads the project's `geospec.config.*` (exporters and `testTimeout`, with programmatic overrides), builds the model loader and installs the GeoSpec matchers for a Vitest project. The authoring skill says models load through the exporter the host or the project's `geospec.config.ts` supplies, which on Tau projects is Tau's runtime.

`@taucad/host`'s `test_model` reads the project's `geospec.config.*` and applies its include, exclude, testNamePattern, testTimeout and bail as defaults that an input field replaces; the result's `config` names the file, or reports `GEOSPEC_CONFIG_NOT_APPLIED` once per session. The trust prompt for relayed projects names both `tau.config.*` and `geospec.config.*`.

`@taucad/mcp`'s `test_model` result schema carries the same optional `config` field, and its description says the config sets defaults.
