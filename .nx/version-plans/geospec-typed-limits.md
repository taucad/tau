---
geospec: minor
host: minor
mcp: minor
geospec-engine: minor
cli: minor
---

Report each GeoSpec limit refusal as a typed limit, and a refused load as an inconclusive test instead of a failed one.

- A `test_model` failure or test row refused by a limit carries `limit`: its `kind` (`capacity` or `budget`), `name`, `declared` and `measured` values in `unit`, the refused `operation` and `subject`, its `source` (`engine` or `host`) and `retry`. The name is the configuration key or fixed ceiling the refusal names (`maxSubjectBytes`, `maxTotalBinaryBytes`, `maxTriangles`, `descriptorBytes`, `workUnitLimit` and the rest) or, for an analysis limit, the evidence the engine names, such as `continuousEvidenceBytes`. `retry` is the `workUnitLimit` value that can still decide the claim, `{ parameter: 'workUnitLimit', value }` for a work budget below the host maximum, set where that claim's budget is set (`test_model` for the run, or its `loadModel` or `expectGeo` option); it is `null` when no argument raises the limit. `@taucad/mcp` advertises and validates `limit` in its `test_model` output schema.
- The compact `test_model` result of a large run keeps each row's `category` and `limit`.
- Of the limit rows, only `work-budget` rows name `workUnitLimit`. An admission or analysis limit row says the claim is not decided and that no `test_model` argument raises the limit, and a timeout row no longer points at resource limits. A whole-model claim on a region load, and a region load on a kernel that cannot crop, no longer suggest provisioning more resources or raising `workUnitLimit`.
- `geospec`: a load the engine or the host refuses to admit (`limit-exceeded`), in a test or in a `describe` body, leaves that test or suite `inconclusive`, with a `GEOSPEC_RESOURCE_LIMIT` diagnostic carrying the limit and what the load needed, instead of a `failed` test with `TEST_FAILED`. Run accounting counts such a test as inconclusive, not failed, unless one of its claims was decided false or could not run. A `limit-exceeded` thrown while a claim runs on a load already admitted (the engine or host out of room for the claim) names no limit of the model, so its test still fails, as an infrastructure failure whose row does not call the claim undecided.
- `geospec`: the native model loader's own byte refusals carry the engine's capacity shape and name the limit they enforce (`maxTotalBinaryBytes`, or `descriptorBytes` for the 16 MiB descriptor ceiling), with `source: 'host'`.
- `@taucad/geospec-engine` and `@taucad/cli`: the `geospec` and `tau test` totals name the inconclusive tests, such as `0 passed, 0 failed, 4 selected, 4 inconclusive`.
