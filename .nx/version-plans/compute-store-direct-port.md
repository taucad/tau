---
runtime: minor
---

`@taucad/runtime/host` adds `fromComputeStoreChannel(openPort)`, an opaque durable `ComputeStore` whose authority runs in another realm. A worker, node-worker, in-process or WebSocket transport opens one port per runtime binding or initialize retry and hands that port to the runtime itself, instead of serving a second channel from the composing thread and relaying every `get`, `put` and `generation` call through it. Disposing the binding before or after a failed initialize closes the port. The store is still opaque: it carries no port, and a store it did not make is still refused. A same-realm store from `fromIndexedDb`, `fromSqlite` or `connectComputeStoreChannel` keeps the relay.
