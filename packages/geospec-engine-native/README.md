# @taucad/geospec-engine-native

Experimental portable Rust core for GeoSpec's canonical control protocol and
whole-subject mesh bounding-box assertions. The existing TypeScript/WASM engine
remains the reference implementation. This package has no JavaScript binding yet.

## Rust interface

The package-local crate is `geospec-engine-native-core`. `Engine::ingest_mesh`
admits owned indexed triangle bytes; `Engine::process_request` evaluates claims
against retained content. These methods and `canonicalize` return canonical JSON
bytes or a typed `ProtocolError` with a stable `code()`. The free `process_request`
function delegates to a fresh `Engine` and therefore has no retained subjects.

The selected control profile is protocol **3**, registry **4**,
`geospec-jcs-v1`, with **experimental** qualification. Initialization advertises
`toHaveBoundingBox` only for `mesh-buffer-whole-subject`. The registry catalog
records recognized capability identities separately. `analyzeMesh` remains
unavailable until its full statistics contract is implemented. Selectors,
occurrence resolution, BRep evidence and file loaders are not supported here.

## Mesh input and assertions

The `mesh-buffer-v1` byte lane contains ASCII `GSM1`, little-endian u32 vertex
and triangle counts, `vertexCount * 3` little-endian f64 coordinates, then
`triangleCount * 3` little-endian u32 indices. Its maximum size is 16 MiB.
Coordinates must already be in whole-subject millimetres with z-up orientation.
Ingestion verifies SHA-256 over the complete bytes, including the header; claim
plans map logical subject slots to that retained content hash.

Bounds use indexed vertices after f64-to-f32-to-f64 conversion, matching the
reference mesh-buffer path. Min/max are reconstructed from size and center.
Bounding-box expectations support min/max triples or partial axis objects,
size/center axis objects, and a nonnegative tolerance that defaults to 0.02 mm.
Results preserve full measured evidence, ordered axis failures and effective
positive/negative polarity. Invalid or unavailable evidence cannot become a
geometric pass under negation.

The deterministic work charge is one unit per referenced vertex visit plus one
per declared expectation axis. Insufficient budget returns a refused
`MATCHER_TIMEOUT` result before evaluating bounds.

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
not browser execution or release qualification. Language bindings, broader
geometry evaluation, complete matcher parity and release qualification remain
pending.
