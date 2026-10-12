# Material v6-02 portable controls

This is the successor material authority to [`material-v6.json`](material-v6.md), not a rebaseline of it or of the immutable 320 early controls. `material-v6-02.json` is pinned by SHA-256 `613a98156d7cfad0b28e6b6caba654fc443b9c2ecba64aa0e9a8a6738df9b13d` and declares the unchanged `geospec-demand-v6`; ingest profile `geospec-gltf-f64-instance-v2` is unchanged because this is a decoder correction within it. Its 22 admissions and 51 records are the v6 20/46 plus two `EXT_mesh_manifold` admissions and five records. Removing those admissions and records and restoring authority ID `material-v6-01` recovers `material-v6.json` byte-for-byte (SHA-256 `45b98aa9bdc83b0846e74837e5891f4d9c7c7a51b6488db2ae23e8ccbe833975`); both pins remain admissible.

All TRIANGLES primitives of a glTF mesh carrying `EXT_mesh_manifold` over its declared POSITION accessor form one material partition; separate meshes, instancing nodes and undeclared primitives remain separate operands.

## Independent construction

- Both admissions reuse the frozen single-solid `mesh.bin` exactly: the outward unit cube `[0,1]^3` with eight f32-dyadic vertex records and 36 `u16` indices. One node `A` holds one mesh with two TRIANGLES primitives over the single POSITION accessor 0. Index accessors 1 and 2 slice the one index view into the complementary halves `(bottom, top, y=0)` and `(x=1, y=1, x=0)` used by `complementary-open-operands`; accessor 3 is the full 36-index list. Every exact edge of the union has two oppositely directed incidences, each half alone is open, and the divergence-theorem signed volume is `+1` mm³.
- `manifold-runs` declares `extensionsUsed: ["EXT_mesh_manifold"]` and `manifoldPrimitive` `{attributes: {POSITION: 0}, indices: 3, mode: 4}`. The two runs form one closed body: a count of one passes positively and fails negatively with the existing negation diagnostic and unchanged evidence. The single cluster is labelled `A`, its one primitive reports `V = 8` vertex records and `totalVertices` is `3T = 36`. Bounded gap witnesses accompany only an unsatisfied positive proposition, so neither polarity carries them.
- The component inventory has one operand, `A#0`: an interference claim requesting the pair `A#0`/`A#1` refuses with `GEOSPEC_SELECTOR_UNMATCHED`, because the second run is not a separate component.
- `manifold-undeclared-runs` has identical `mesh.bin`, accessors and primitives, but its `manifoldPrimitive` lacks `attributes.POSITION`. The runs remain two open operands, and both polarities still refuse with `GEOSPEC_INVALID_EVIDENCE`: the fold requires the declaration.

The fixture-authoring receipt retains the input-only script; it imports no GeoSpec engine and does not harvest observations. Before constructing anything, it reproduces the frozen single-solid admission byte-for-byte from geometry, checks edge incidences and signed volume, and verifies the v6 recovery. Admission descriptors and subject hashes are computed from the declared bytes. Expected wire bytes follow the existing serializer and result owners, and the full evidence, diagnostics, polarity and typed refusal are checked.

## Existing runners

The successor replaces v6 as the private `--suite material` selection of the native Node and Node/WASM runners and of the browser runner. Python's `test_material_v6_byte_facade` cases and `--material` selection read the successor. Rust runs `material_v6_02_portable_controls_bind_independent_inputs_and_full_cold_warm_results` beside the retained v6 test in `mesh_conformance`. The Node host check pins both authorities and the byte-for-byte v6 recovery.

The qualification limits of [`material-v6.md`](material-v6.md) apply unchanged. Historical v6 authority and its raw bytes remain unchanged.
