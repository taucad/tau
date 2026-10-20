---
host: patch
---

`test_model` is offered only when the GeoSpec engine's native addon loads. Before, the host checked only that `geospec-engine/node` resolved, so on a platform without a prebuilt addon it advertised `test_model` and the first call failed with "Failed to load native binding". The host now loads the engine entry once and keeps the answer.
