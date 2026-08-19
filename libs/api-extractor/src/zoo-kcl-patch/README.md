# Zoo KCL JSON Export Patch

This folder contains the modifications needed for the Zoo Modeling App repository to export KCL standard library documentation as JSON for use in Tau.

## Quick Start

If you have the Zoo repo already cloned at `repos/zoo-modeling-app`:

```bash
# Apply the patch and generate JSON
cd repos/zoo-modeling-app/rust
EXPECTORATE=overwrite cargo test -p kcl-lib test_export_stdlib_json --release

# Then run the Tau extraction
cd ../../..
pnpm tsx libs/api-extractor/src/extract-kcl-api.ts
```

## Fresh Zoo Repo Setup

### 1. Clone the Zoo repository

```bash
cd repos
git clone https://github.com/KittyCAD/modeling-app.git zoo-modeling-app
cd zoo-modeling-app
```

### 2. Apply the patch to gen_std_tests.rs

Copy the patched file from this folder to the Zoo repo:

```bash
cp /path/to/tau/libs/api-extractor/src/zoo-kcl-patch/gen_std_tests.rs \
   repos/zoo-modeling-app/rust/kcl-lib/src/docs/gen_std_tests.rs
```

Or manually add the following to `rust/kcl-lib/src/docs/gen_std_tests.rs`:

1. **Add JSON builder helper functions** after `docs_for_type()` (around line 377):
   - `build_function_json()`
   - `build_const_json()`
   - `build_type_json()`
   - `build_module_json()`

2. **Add the JSON export test** after `test_generate_stdlib_markdown_docs()`:
   - `test_export_stdlib_json()`

See [gen_std_tests.patch.rs](./gen_std_tests.patch.rs) for the exact code to add.

### 3. Generate the JSON export

```bash
cd repos/zoo-modeling-app/rust

# First run creates the file (use EXPECTORATE=overwrite)
EXPECTORATE=overwrite cargo test -p kcl-lib test_export_stdlib_json --release

# Subsequent runs will verify the file hasn't changed
cargo test -p kcl-lib test_export_stdlib_json --release
```

This generates: `repos/zoo-modeling-app/docs/kcl-std/kcl-stdlib-export.json`

### 4. Run Tau extraction

```bash
cd /path/to/tau
pnpm tsx libs/api-extractor/src/extract-kcl-api.ts
```

This:

1. Copies the JSON from Zoo repo to `libs/api-extractor/src/generated/kcl/`
2. Generates markdown documentation files

## Output Files

| File                     | Description                      |
| ------------------------ | -------------------------------- |
| `kcl-stdlib-export.json` | Raw JSON from Zoo repo (copied)  |
| `kcl-stdlib-data.json`   | Transformed JSON with Tau schema |
| `kcl-stdlib-api.md`      | Full API documentation           |
| `kcl-stdlib-compact.md`  | LLM-optimized compact reference  |

## Updating When KCL Changes

When the Zoo repo updates their KCL stdlib:

1. Pull latest Zoo changes: `cd repos/zoo-modeling-app && git pull`
2. Re-run the JSON export: `cd rust && EXPECTORATE=overwrite cargo test -p kcl-lib test_export_stdlib_json --release`
3. Re-run Tau extraction: `pnpm tsx libs/api-extractor/src/extract-kcl-api.ts`
4. Commit the updated generated files

## Notes

- The patch reuses existing JSON construction code from the Handlebars template rendering
- No new Rust dependencies are required
- The `expectorate` crate handles file writing (same as existing markdown docs)
- The test will fail if the JSON output changes (run with `EXPECTORATE=overwrite` to update)
