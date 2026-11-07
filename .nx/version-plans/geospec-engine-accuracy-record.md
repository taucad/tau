---
cli: minor
host: minor
mcp: minor
---

The bundled `geospec` and `geospec-engine` move together to 0.5.2-next.412. Each volume, surface-area, mass, centre-of-mass and bounding-box result now carries `evidence.accuracy`, so those results' bytes change while their status and diagnostics do not. The engine declares three accuracy refusals, `GEOSPEC_ACCURACY_INSUFFICIENT`, `GEOSPEC_FILE_TOLERANCE_EXCEEDS_CLAIM` and `GEOSPEC_SUBJECT_NOT_CLOSED`, for facts that carry an error bound. Volume, surface-area and mass claims accept `relativeTolerance` beside an equality `value`.

`test_model` reports a claim refused by one of these codes with the new failure category `accuracy`, which `@taucad/mcp` advertises and validates in its output schema. Such a row is `inconclusive` in either polarity, never passed. Its suggestion keeps the assertion and its tolerance and never relays an engine suggestion to widen or raise a tolerance.

`@taucad/host` asks for the `geospec` and `geospec-engine` peers at exactly 0.5.2-next.412. The open-source notices and the editor declarations are refreshed from the installed packages.
