---
runtime: minor
runtime-testing: minor
host: minor
cli: minor
native-process-core: minor
dotnet-kernel-core: minor
python-kernel-core: minor
build123d: minor
picogk: minor
smlibpy: minor
agent-plugin: minor
---

Native kernel runtimes are now "dependency files", not "payloads" (R2 storage blast-radius blueprint D2a, phase 11). This is a clean break with no aliases.

- `tau-plugin.json` schema v1: a variant lists its files under `files`, not `payloads`. A manifest that still has `payloads` fails `MANIFEST_INVALID` at `dependencies.<name>[i].payloads`, and the message says to use `files`. The `@taucad/build123d`, `@taucad/picogk` and `@taucad/smlibpy` manifests and the plugin generator template use `files`. Closure identities and golden receipts do not change.
- `@taucad/runtime/preparation/node`: `DependencyPayload` is now `DependencyFile`, `ReceiptFile` is `InstalledFile`, `PayloadOrigin` is `DependencyFileOrigin`, `PayloadFormat` is `DependencyFileFormat` and `PayloadAcquisition` is `DependencyFileAcquisition`. `ClosureReceipt.payloads` is now `dependencyFiles`, and `InstalledFile.payload` is `dependencyFile`. In `PreparationState`'s `preparing` state, `payload` is now `dependencyFile`, and `completedPayloads`/`totalPayloads` are `completedDependencyFiles`/`totalDependencyFiles`. `ClosureVerification.payloads` is `dependencyFiles`.
- The managed variables `TAU_PAYLOAD_MIRROR`, `TAU_PAYLOAD_MIRROR_NO_FALLBACK`, `TAU_PAYLOAD_DIR`, `TAU_PAYLOAD_TARGET` and `TAU_PAYLOAD_EMULATION` are now `TAU_DEPENDENCY_*`. Setting an old name fails, and the error names the new one.
- `@taucad/host` and `@taucad/native-process-core/store`: `defaultPayloadStore` is now `defaultDependencyStore`. The store directory is now `dependencies` (for example `<TAU_CONFIG_DIR>/dependencies`), not `payloads`, so a store prepared before this change is prepared again. A seed's `tau-seed.json` lists each closure's pins under `dependencyFiles`.
- `@taucad/runtime-testing/preparation`: `startPayloadMirror` is now `startDependencyMirror`, `PayloadMirror` is `DependencyMirror`, `FixturePayload` is `FixtureDependencyFile` and `FixturePayloadInput` is `FixtureDependencyFileInput`. `createFixtureClosure` takes and returns `dependencyFiles`.
- `@taucad/dotnet-kernel-core/layer`: `payloadCdnBase` is now `dependencyBaseUrl`, `payloadKey` is `dependencyKey`, and the layer rule's `payload` is `dependencyFile`. The host value and the `blobs/sha256/<hex>` key layout do not change.
- `@taucad/agent-plugin`: the Codex MCP configuration forwards the `TAU_DEPENDENCY_*` variables.
- `@taucad/cli`: `tau prepare`, `tau serve` and `tau mcp` read the `TAU_DEPENDENCY_*` variables, and their help and progress text say "dependency files" and "dependency store".
