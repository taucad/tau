---
geospec: patch
geospec-engine: patch
cli: patch
---

GeoSpec's model loaders, Tau project artifact export and `tau export` open their one-shot runtime documents with `watch: false`. They previously subscribed a native file watcher per export that the one-shot teardown had to race, which could abort a Node worker pool on macOS with a fatal `napi_throw` from `@parcel/watcher`.
