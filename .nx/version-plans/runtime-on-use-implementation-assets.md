---
runtime: minor
---

A transcoder can now have its implementation assets fetched on first use. If it sets `implementationAssetLoading: 'on-use'`, the runtime checks only the asset declarations (unique ids, SHA-256 hex digests) before `initialize`. The transcoder then calls `implementationAssets.load(id)` for each asset when a request first needs it. That call fetches the asset, checks it against its pinned digest, and keeps the verified bytes for the life of the worker. A mismatch, a failed fetch or an undeclared id rejects the call, and a failed load is not cached. `initialize` receives the loader in every mode (`TranscoderInitializeServices` from `@taucad/runtime/transcoder`). The default, `'initialize'`, still verifies every asset before `initialize`, as before. An asset's digest still takes part in artifact identity in both modes.
