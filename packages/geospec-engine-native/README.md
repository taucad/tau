# @taucad/geospec-engine-native

Experimental portable Rust core for GeoSpec's canonical control protocol. The
existing TypeScript/WASM engine remains the reference implementation. This
package does not yet expose a JavaScript binding or compute geometry.

## Rust interface

The package-local crate is `geospec-engine-native-core`. Its byte-oriented
`canonicalize` and `process_request` functions return canonical JSON bytes or a
typed `ProtocolError` with a stable `code()`.

The selected control profile is protocol **3**, registry **4**,
`geospec-jcs-v1`, with **experimental** qualification. Initialization advertises
no implemented geometric capabilities. The registry catalog records recognized
capability identities separately; an `analyzeMesh` request reports unavailable
computation, never a fabricated geometric result.

Canonical JSON uses UTF-16 key ordering and finite binary64 number rendering.
Measurement numbers are not limited to the safe-integer range. Work budgets are
positive exact integers no larger than `9007199254740991`.

Control documents are limited to 16 MiB, nesting depth 64, decoded strings of
1 MiB, arrays of 65536 entries and batches of 4096 claims. These limits describe
control JSON, not geometry payloads. Claim IDs and subject slots are logical
identities; transport request IDs remain outside canonical plan identity.

## Development checks

Run these Nx targets from the workspace root. They invoke Rust **1.88.0**
explicitly and keep build output in `node_modules/.cache/geospec-engine-native`:

```bash
pnpm nx run geospec-engine-native:test-rust
pnpm nx run geospec-engine-native:check-wasm
pnpm nx run geospec-engine-native:format-rust
pnpm nx run geospec-engine-native:clippy-rust
```

The portable check targets `wasm32-unknown-unknown`; it verifies compilation,
not browser execution or release qualification. Native bindings, geometry
evaluation, complete matcher parity and release qualification remain pending.
