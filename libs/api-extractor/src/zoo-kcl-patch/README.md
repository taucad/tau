# Zoo KCL JSON Export Patch

[gen_std_tests.patch.rs](./gen_std_tests.patch.rs) adds a `test_export_stdlib_json` test to the Zoo Modeling App's `rust/kcl-lib/src/docs/gen_std_tests.rs`. It writes the KCL standard library (functions, types, constants, modules, `deprecated_since` and doc-comment examples with their sketch syntax) as JSON for Tau's api-extractor. It walks `walk_stdlib()`, so the `std::solver` sketch-block module is included.

The vendored export must match the kcl-lib version Tau's runtime runs. Upstream bumps `kcl-wasm-lib` `0.1.N` and `kcl-lib` `0.2.N` together, so `@taucad/kcl-wasm-lib@0.1.184` (pnpm catalog) needs the `kcl-lib` `0.2.184` export; `src/languages/kcl/extract.test.ts` enforces this.

## Regenerate

Use the upstream commit the runtime was built from (the `rebuild-kcl-wasm-lib` skill records it; `0.1.184` = `9b0ecedff5`). A separate worktree keeps `repos/zoo-modeling-app` on its checked-out commit:

```bash
git -C repos/zoo-modeling-app worktree add --detach "$SCRATCH/zoo" 9b0ecedff5
cat libs/api-extractor/src/zoo-kcl-patch/gen_std_tests.patch.rs \
  >> "$SCRATCH/zoo/rust/kcl-lib/src/docs/gen_std_tests.rs"
cd "$SCRATCH/zoo/rust"
CARGO_TARGET_DIR="$SCRATCH/target" EXPECTORATE=overwrite \
  cargo test -p kcl-lib --lib test_export_stdlib_json
cp "$SCRATCH/zoo/docs/kcl-std/kcl-stdlib-export.json" \
  libs/api-extractor/src/generated/kcl/kcl-stdlib-export.json
```

The debug test build needs about 2.5 GB in `CARGO_TARGET_DIR`; delete it afterwards. If upstream renames an item the patch uses (`docs_for_type`, `mod_name_std`, the `kcl_doc` structs), adapt the patch to the new names and keep the JSON field names stable.

Then update the expectations in `src/languages/kcl/extract.test.ts` and regenerate the skill bundles. The corpus and the rendered reference come from the vendored export through `src/languages/kcl/extract.ts`.
