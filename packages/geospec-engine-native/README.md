# @taucad/geospec-engine-native

Experimental portable Rust core for GeoSpec's canonical control protocol and
whole-subject mesh bounding-box assertions. The existing TypeScript/WASM engine
remains the reference implementation. Node, WASM and Python expose the same
experimental byte interface; public matcher-framework integration remains separate.

## Rust interface

The package-local crate is `geospec-engine-native-core`. `Engine::ingest_mesh`
admits owned indexed triangle bytes; `Engine::process_request` evaluates claims
against retained content. These methods and `canonicalize` return canonical JSON
bytes or a typed `ProtocolError` with a stable `code()`. The free `process_request`
function delegates to a fresh `Engine` and therefore has no retained subjects.

`Engine::canonical_plan` validates a complete `submitClaims` request and returns
a neutral plan without `method` or `requestId`. It materializes the bounding-box
tolerance, lowers min/max triples to axis objects, removes redundant arguments
and empty axis objects, and records `numericProfile: "mesh-f32-bounds-v1"`.
Logical IDs, subject/claim order, polarity and budgets remain significant.
This route supports bounding-box plans and the unavailable `analyzeMesh` claim;
other recognized capabilities return `unsupported-normalization`.

`Engine::evaluate_plan` accepts that neutral envelope and returns canonical
`{"results":[...]}` bytes. Both execution routes validate the complete batch
before computing any geometry. Raw requests preserve authored expectations in
evidence; neutral plans use normalized expectations through the same evaluator.
The free `canonicalize` function only encodes JSON and does not normalize plans.

The selected control profile is protocol **3**, registry **4**,
`geospec-jcs-v1`, with **experimental** qualification. Initialization advertises
`toHaveBoundingBox` only for `mesh-buffer-whole-subject`. The registry catalog
records recognized capability identities separately. `analyzeMesh` remains
unavailable until its full statistics contract is implemented. Selectors,
occurrence resolution, BRep evidence and file loaders are not supported by this
portable matcher interface. The separate native OCCT/CSG adapters supply entry
operations without promoting additional matcher capabilities.

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

## Configured BRep feature measurements

The configured full engine exposes the numeric filters of `toHavePlanarFace`,
`toHaveCylindricalFace` and `toHaveCircularHole` under
`evidence.witnesses.measurementContract.profile = "geospec-feature-metric-nominal-v1"`.
These filters compare backend nominal binary64 measurements. Equality uses
`abs(measured - expected) <= tolerance`; zero tolerance means nominal equality,
not an exact-real geometry certificate. Area conditions preserve the authored
`>`, `>=`, `<` and `<=` operators without expanding them by tolerance. Independent
accuracy calibration does not add a runtime error enclosure or implicit epsilon.

Planar normal components and offsets retain their shared sign convention.
Cylindrical axis labels select the largest absolute direction component, with
x/y/z tie order; a label does not certify exact axial alignment. Analytic Plane
or Cylinder backend identity remains required for the corresponding inventory.

The measurement contract covers numeric filters only. Circular-hole membership
and through/blind topology require separate qualification: the current
reversed-cylinder and bounds-derived inventory is not a qualified topology
proof. This limitation also prevents treating these measurements as continuous
containment, clearance, insertion, wall or void guarantees. F1/F2 certificates
retain their separately declared admitted domains and verification contracts.

## Development checks

Run these Nx targets from the workspace root. They invoke Rust **1.88.0**
explicitly and keep build output in `node_modules/.cache/geospec-engine-native`:

```bash
pnpm nx run geospec-engine-native:test-rust
pnpm nx run geospec-engine-native:check-wasm
pnpm nx run geospec-engine-native:format-rust
pnpm nx run geospec-engine-native:clippy-rust
```

The portable compile check targets `wasm32-unknown-unknown`. Runtime conformance
uses the frozen package-local corpus through actual built artifacts.

## Host packages

The default JavaScript entrypoint and `./wasm` expose `initialize`, `Engine`,
`canonicalize` and `ProtocolError`. Initialize with the shipped WASM bytes or
URL before creating an engine. The Node-only `./node` entrypoint exposes the
same operations without WASM initialization. Engine methods are `ingestMesh`,
`processRequest`, `canonicalPlan` and `evaluatePlan`; all forward bytes to Rust.
The Node facade admits ordinary ArrayBuffer-backed Uint8Array views and copies
their selected bytes before invoking NAPI. Shared backing is refused at runtime.
The private generated addon is not the public input boundary and has not received
the deferred direct-entry lifetime/concurrency qualification.

The `geospec_engine_native` Python extension exposes `Engine` with the matching
snake_case methods and module-level `canonicalize`. It accepts and returns bytes,
preserving the protocol error code and message. Current wheel profiles are
CPython 3.13 and 3.14 on Darwin ARM64.

Use Node 24 for pnpm/Nx bootstrap. Build host artifacts before the TypeScript
package and local assembly:

```bash
pnpm nx run geospec-engine-native:build-node
pnpm nx run geospec-engine-native:build-wasm
pnpm nx build geospec-engine-native
pnpm nx run geospec-engine-native:assemble-package
```

WASM generation uses the matching wasm-bindgen 0.2.127 executable in the package
cache. Assembly creates disposable tarballs, generates the platform metadata and
exact-version optional dependency with pinned NAPI tooling, and performs no
publication. The source manifest stays unchanged. The declared NAPI target is
Darwin ARM64; this entry does not establish the full delivery matrix.

These are byte facades over the bounded mesh matcher contract. Complete matcher
parity, public standalone/Vitest/pytest matcher integration, mixed OCCT WASM,
cache/runtime integration and release qualification remain pending.
