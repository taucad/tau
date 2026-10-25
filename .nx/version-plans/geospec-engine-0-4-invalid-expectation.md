---
geospec: minor
cli: minor
host: minor
mcp: minor
---

The bundled engine moves to `geospec-engine` 0.4.0. In this version a claim whose expectation has an unknown or malformed field is refused on its own with `GEOSPEC_INVALID_EXPECTATION`, and the other claims in the plan still run. Before, the engine rejected the whole plan with `ProtocolError` `invalid-claim`. The refused claim's diagnostic keeps the former message, and its `details` carry `field` and, when that key occurs once in the payload, its `path`. A GeoSpec test whose only undecided claim is such a refusal is `inconclusive`, never passed, so `geospec run` exits 1 and the run is not green. A claim decided false beside it still fails the test. `client.query` returns a malformed query payload as that query's `refused` report instead of rejecting it. Code that caught `invalid-claim` for a malformed payload should read the refused report's first diagnostic instead. A negated query, an unadmitted subject, an out-of-range budget and other plan-level errors still throw `invalid-claim`.

`test_model` reports such a row with the new failure category `invalid-expectation`, which `@taucad/mcp` advertises and validates in its output schema. The row's suggestion says to correct the expectation to the matcher's documented fields and to keep the assertion. The `geospec-authoring` skill says so.

`@taucad/host` now asks for the `geospec-engine` peer at `^0.4.0`, the first release that refuses a malformed expectation per claim.
