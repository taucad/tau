# F1 dependency-source successor

This additional authority identifies the current verifier implementation after the
serde, serde_json, num-integer, ryu-js and regress dependency updates. It does not
change the `geospec-demand-v6` numeric profile or independently authored geometry,
claim bodies, budgets or expected verdicts. Historical `current-profile-v5` and
`current-profile-v6` files remain byte-for-byte unchanged.

`f1-definition-records.json` contains the same nine owning source paths as v6 and
the complete 34-package registry closure of the current core Cargo.lock. Each
archive digest is its locked checksum, independently checked against the actual
cached `.crate` bytes during derivation. Entries are sorted by path. The verifier
source hash is SHA-256 of canonical JSON for these records; the generated literal
in `src/certificates/definition.rs` is excluded to avoid circular identity, as in
the preceding authority.

The source binding test verifies canonical identity, each actual source digest,
complete lock membership/checksums, historical identity and mutation sensitivity.
The independent F1 controls continue to compare the same mathematical claims
through fresh admission with this source identity. The changed digest deliberately
prevents the preceding implementation from being mistaken for this implementation.

This authority is not a compiled-product receipt, performance result or release
qualification. Node, Python, mixed-WASM and browser products need their own actual
source-matched production and qualification evidence. No historical benchmark
result or delivery receipt is relabeled by this addition.
