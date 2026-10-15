---
runtime: minor
host: minor
cli: minor
---

Prepare native kernel runtimes into one digest-keyed store shared by every Tau host on a machine (native dependency resolution charter W2, API 4).

- `@taucad/runtime/preparation/node`: `createPreparationHost` downloads each pinned payload from the store, a seed, a digest-addressed mirror or its origins, verifies every byte before writing, unpacks while hashing, writes the receipt last and publishes the closure with one `rename`. Two calls join one attempt; two processes race by `rename` and the loser adopts the winner's receipt. Cancellation keeps verified blobs. Also `selectVariant`, `detectHostIndicators`, `readManagedPreparation`, `describeEffectiveProfile`, `readStoreGeneration` and `systemLibraryRefusal`.
- `@taucad/host`: `defaultPayloadStore()`, the per-OS data root (or `<TAU_CONFIG_DIR>/payloads`).
- `@taucad/cli`: `tau prepare <kernel>` with `--offline`, `--json`, `--inspect`, `--verify` and `--gc [--dry-run]`.
