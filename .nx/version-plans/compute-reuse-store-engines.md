---
runtime: minor
---

Add the durable workspace compute store engines behind the existing
`ComputeStoreEngine`/`ComputeStoreSession`/`ComputeStoreControl` contract: a
`node:sqlite` engine for native hosts (WAL, measured connection settings, a
required-durability barrier and incremental reclamation) and a dedicated
IndexedDB engine for the browser, plus `fromSqlite` and `fromIndexedDb` host
factories on `@taucad/runtime/host`. Record validation moves to one shared
owner, so every engine — memory included — recomputes canonical action and
content identity before it admits a record.
