---
mcp: minor
host: minor
cli: minor
geospec-engine: minor
---

`test_model`, `tau test` and `geospec run` print one summary of a GeoSpec run, and a requirement the engine could not decide is never called failing. The line reads `GeoSpec <runStatus>: <passed> passed, <failed> failed[, N inconclusive][, N unsupported][, N not run][, N skipped] of <total>.`; over MCP it is followed by `Failed: <ids>` for requirements decided false or broken and `Undecided: <id> (<category>)` for the rest, twenty of each at most. It replaces "GeoSpec passed P of T requirements. Failing IDs: …", which listed inconclusive and unsupported rows as failing. A planetary run whose interference claims exceed the analysis limit now reads `GeoSpec inconclusive: 5 passed, 0 failed, 5 inconclusive of 10.`, and a filtered re-run of one refused requirement no longer says "passed 0 of 1".

Each `test_model` failure row carries `status` (`failed`, `inconclusive`, `unsupported` or `not-run`, the requirement's own status), kept on the compact rows of an oversized result, and each `tests[]` row carries `assertions`: one `{ ordinal, status, matcher, code?, message?, limit? }` per `expectGeo` claim, so a passed claim stays visible beside a refused one in the same requirement. The `test_model` description, over MCP and in the app alike, says that only a row with status `failed` is a failure.

`geospec run` labels each non-passing test by its status (`fail`, `inconclusive`, `unsupported`, `not-run`, `skip`) instead of `fail` for every one, and `tau test` prints undecided tests as warnings with their status. Both end with the same line as MCP. `tau test --json` records `status: 'inconclusive'` for a run where nothing failed but a test was left undecided, instead of `failed`. Exit codes are unchanged. `@taucad/host/agent-tools` exports `formatTestModelHeadline` and `runStatusFromCounts`, which `tau test` prints its line with.
