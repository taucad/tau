---
geospec: patch
geospec-engine: patch
---

GeoSpec's model loaders and Tau project artifact export open their one-shot runtime documents with `watch: false`. They previously subscribed a native file watcher per model load that teardown never drained, which could abort a Node worker pool on macOS with a fatal `napi_throw` from `@parcel/watcher`.
