---
name: occt-wasm-build
description: Build and optimize OpenCASCADE WASM binaries. Use when building opencascade.js, running WASM experiments, comparing build sizes, or configuring the OCCT build harness.
disable-model-invocation: true
---

# WASM Build + Evaluation Harness

## When to Use

Use this skill when the user wants to:

- Build or optimize WASM binaries (especially OpenCASCADE/opencascade.js)
- Run WASM build experiments with different configurations
- Compare WASM build sizes and benchmark performance
- Manage the build cache for WASM compilation
- Understand build provenance of existing WASM artifacts
- Set up new WASM optimization targets (e.g., assimpjs)

## Architecture

The harness consists of four interconnected systems:

1. **Build Cache** (`repos/opencascade.js/src/build-cache.py`) — Config-keyed compilation cache
2. **Provenance Tracking** (`repos/opencascade.js/src/provenance.py`) — Build metadata sidecar
3. **Experiment Orchestrator** (`scripts/src/wasm-experiment.sh`) — Full lifecycle runner
4. **Comparison Reporting** (`packages/runtime/scripts/build-matrix-report.mts`) — Visual dashboard

All build operations go through `repos/opencascade.js/build-wasm.sh` as the single entry point.

## Quick Start

### Run an Experiment

```bash
# Run a preset experiment (build + pack + install + benchmark)
./scripts/src/wasm-experiment.sh scripts/experiments/O2-noLTO-single.yml

# Build only (skip benchmarks)
./scripts/src/wasm-experiment.sh scripts/experiments/O3-noLTO-single.yml --skip-benchmark

# Compare against a baseline
./scripts/src/wasm-experiment.sh scripts/experiments/Os-noLTO-single.yml --baseline tarballs/baselines/v8-rc4-O2-single
```

### Just Build WASM

**Always use `nohup` for full builds.** Full builds take 10-30+ minutes (longer with cold caches). If the terminal session drops (SSH timeout, IDE restart, laptop sleep), the build is lost. Wrap the command with `nohup` and redirect output to a log file:

```bash
cd repos/opencascade.js

# Full build (always use nohup — takes 10-30+ min)
nohup env OCJS_LTO=0 ./build-wasm.sh full build-configs/full.yml > build.log 2>&1 &
tail -f build.log  # Monitor progress

# Link-only rebuild (fastest, reuses compiled .o files — nohup optional, ~1-2 min)
./build-wasm.sh link build-configs/full.yml

# Rebuild PCH then link
./build-wasm.sh pch link build-configs/full.yml

# Regenerate .d.ts only (fastest — no compile/link, just reassemble from fragments)
./build-wasm.sh dts build-configs/full.yml

# Regenerate bindings then reassemble .d.ts (after editing bindings.py/generateBindings.py)
./build-wasm.sh generate dts build-configs/full.yml
```

### Compare Experiments

```bash
# Generate build matrix report from all experiments
pnpm nx build-matrix runtime -- --experiments ../../tarballs/experiments/

# Compare specific experiments
pnpm nx build-matrix runtime -- --compare ../../tarballs/experiments/exp1 ../../tarballs/experiments/exp2

# With baseline
pnpm nx build-matrix runtime -- --experiments ../../tarballs/experiments/ --baseline ../../tarballs/baselines/v8-rc4-O2-single
```

## Experiment Config Reference

Experiment configs live in `scripts/experiments/*.yml`:

```yaml
name: 'O2-noLTO-single'
description: 'Default production build'

compilation:
  optimization: '-O2' # -O0, -O1, -O2, -O3, -Os, -Oz
  lto: false # true = -flto at compile time
  exceptions: 'none' # "none" or "wasm-native"
  threading: 'single-threaded' # or "multi-threaded"

linking:
  yaml: 'custom_build_single_v8.yml' # Build YAML config
  wasmOptLevel: '-O3' # wasm-opt optimization level

benchmark:
  iterations: 10
  filter: ['primitives', 'booleans', 'fillets', 'complex']
```

### Available Presets

| Preset                        | Compile | LTO | Exceptions  | Expected Size |
| ----------------------------- | ------- | --- | ----------- | ------------- |
| `O2-noLTO-single.yml`         | -O2     | No  | none        | ~17.7 MB      |
| `O3-noLTO-single.yml`         | -O3     | No  | none        | ~19.0 MB      |
| `Os-noLTO-single.yml`         | -Os     | No  | none        | ~16.1 MB      |
| `O2-noLTO-wasmExc-single.yml` | -O2     | No  | wasm-native | ~20.0 MB      |

## Cache Management

### Cache Key Format

```
<OPT>-<lto|noLTO>-<noExc|wasmExc>-<single|multi>-<filterHash8>-<occtHash6>-em<emscriptenVersion>
```

Example: `O2-noLTO-noExc-single-a3f2b1cd-c7d4e9-em5.0.1`

### Cache Commands

```bash
cd repos/opencascade.js

# List all cached compilations
./build-wasm.sh cache-list

# Garbage collect (keep N most recent)
./build-wasm.sh cache-gc 5
```

### Cache Directory

```
repos/opencascade.js/cache/
├── O2-noLTO-noExc-single-a3f2b1cd-c7d4e9-em5.0.1/
│   ├── manifest.json        # Config snapshot, stats
│   ├── bindings/            # Compiled binding .o files
│   ├── sources/             # Compiled source .o files
│   ├── pch.h.pch            # Precompiled header
│   └── occt-includes/       # Flat include symlinks
└── index.json               # Cache index
```

### Cache Invalidation

The cache key changes when any of these change:

- `OCJS_OPT` (optimization level)
- `OCJS_LTO` (LTO flag)
- `OCJS_EXCEPTIONS` (exception mode)
- `THREADING` (thread mode)
- `filterPackages.py` content (SHA-256)
- OCCT commit hash
- Emscripten version (e.g. `5.0.1`)

Changing the YAML config or wasm-opt flags does NOT invalidate the cache — those only affect the linking step.

## Provenance Interpretation

Each build produces a `provenance.json` sidecar:

```json
{
  "schema": "wasm-build-provenance-v1",
  "buildId": "20260228T120000-O2-noLTO-single",
  "toolchain": { "emscripten": "5.0.1", "llvm": "23" },
  "compilation": {
    "cacheKey": "O2-noLTO-noExc-single-...",
    "cacheHit": true,
    "optimization": "-O2",
    "sourceFiles": 4156,
    "bindingFiles": 5235
  },
  "linking": {
    "boundSymbols": 233,
    "symbolList": ["..."],
    "emccFlags": ["..."]
  },
  "postProcessing": {
    "preOptSize": 19900000,
    "postOptSize": 19885932,
    "optReduction": "0.1%"
  }
}
```

Key fields for size analysis:

- `compilation.sourceFiles` — total .o files compiled
- `linking.boundSymbols` — number of symbols bound via embind
- `postProcessing.preOptSize` vs `postOptSize` — wasm-opt impact
- `filtering.excludedPackages` — packages removed from build

## Tarballs Directory Layout

```
tarballs/
├── experiments/
│   ├── 20260228T120000_O2-noLTO-single/
│   │   ├── config.yml                    # Frozen experiment config
│   │   ├── provenance.json               # Full build provenance
│   │   ├── replicad-opencascadejs-*.tgz  # Packaged tarball
│   │   ├── replicad-*.tgz                # Replicad lib tarball
│   │   ├── unpacked/                     # Raw WASM/JS/DTS files
│   │   ├── benchmark-*.json              # Benchmark results
│   │   └── benchmark-*.html              # HTML report
│   └── .../
├── baselines/                            # Reference builds
├── comparisons/                          # Generated matrix reports
└── active -> experiments/latest/         # Symlink to active build
```

## Testing & Benchmarking

### Running Kernel Tests

Example model tests validate that the WASM build can produce geometry for curated fixtures:

```bash
# Run all example model tests
pnpm nx test runtime --testNamePattern="Example models" --watch=false

# Run a specific fixture
pnpm nx test runtime --testNamePattern="cycloidal-gear" --watch=false
```

Test fixtures are defined in `packages/runtime/src/kernels/replicad/replicad.test-fixtures.ts`.
Benchmark cases are defined in `packages/runtime/src/benchmarks/benchmark-suite.ts`.

### Running Benchmarks

```bash
# Run benchmarks with the installed WASM (default: single variant)
pnpm nx benchmark runtime -- --iterations 10 --wasm-variant single

# Run benchmarks and save output to a specific directory
pnpm nx benchmark runtime -- --iterations 10 --wasm-variant single --output /abs/path/to/output/

# Run with a custom WASM directory (must contain replicad_single.wasm + replicad_single.js)
pnpm nx benchmark runtime -- --iterations 10 --wasm-dir /abs/path/to/wasm/ --wasm-variant single
```

**Important:** `--wasm-dir` and `--output` paths are resolved relative to `packages/runtime/` (the project root). Use absolute paths to avoid confusion.

### Cross-Version Benchmarking (e.g. v7.6.2 vs v8)

WASM-only injection (`--wasm-dir`) does NOT work for cross-version comparison because Emscripten constructor numbering (e.g. `gp_Dir_4`) differs between OCCT versions. You must fully swap the npm packages:

```bash
# 1. Swap pnpm-workspace.yaml to v7.6.2 packages
#    replicad: /path/to/replicad-0.20.5.tgz
#    replicad-opencascadejs: /path/to/replicad-opencascadejs-0.20.2.tgz

# 2. Install + copy WASM assets
pnpm install --no-frozen-lockfile
cd packages/runtime && rm -f src/kernels/replicad/wasm/replicad_*.wasm
npx copy-files-from-to --config copy-files-from-to.cjson

# 3. Run benchmarks
pnpm nx benchmark runtime -- --iterations 10 --wasm-variant single \
  --output /abs/path/to/experiments/v762/benchmarks

# 4. Swap pnpm-workspace.yaml back to v8 packages
#    replicad: /path/to/replicad-0.21.0-v8.7.tgz
#    replicad-opencascadejs: /path/to/replicad-opencascadejs-0.21.0-v8.25.tgz

# 5. Install + copy WASM assets (same as step 2)

# 6. Run benchmarks for v8
pnpm nx benchmark runtime -- --iterations 10 --wasm-variant single \
  --output /abs/path/to/experiments/v8/benchmarks

# 7. Generate comparison report
pnpm nx build-matrix runtime -- \
  --compare /abs/path/to/experiments/v762 \
  --compare /abs/path/to/experiments/v8
```

The v7.6.2 packages can be downloaded from npm: `npm pack replicad@0.20.5` and `npm pack replicad-opencascadejs@0.20.2`.

### Experiment Directory Requirements for Reporting

Each experiment directory must contain:

- `provenance.json` — build metadata (used for WASM size, variant detection)
- `benchmarks/` subdirectory — containing `benchmark-*.json` files from benchmark runs

### Adding New Benchmark Fixtures

1. Create the fixture in `libs/tau-examples/src/kernels/replicad/<name>/main.ts`
2. Add to test fixtures: `packages/runtime/src/kernels/replicad/replicad.test-fixtures.ts`
3. Add to benchmark suite: `packages/runtime/src/benchmarks/benchmark-suite.ts`
4. Run tests to validate: `pnpm nx test runtime --testNamePattern="<name>" --watch=false`

### Diagnosing Unbound Symbol Errors

When a model fails with `Cannot call X due to unbound types: N11opencascade6handleI...`, this means a handle wrapper type is missing from the YAML build config.

1. Decode the mangled name: `N11opencascade6handleI12Law_FunctionEE` → `opencascade::handle<Law_Function>`
2. Add the handle to **both** YAML configs (`custom_build_single_v8.yml` and `custom_build_with_exceptions_v8.yml`):
   - Binding: `- symbol: Handle_Law_Function`
   - Typedef: `typedef opencascade::handle<Law_Function> Handle_Law_Function;`
3. Rebuild with fastest flags to validate: `OCJS_OPT="-O2" OCJS_LTO=0 ./build-wasm.sh full <yaml>`
4. Copy built files from `build-config/` to `src/`, re-pack, re-install

### Deploying Rebuilt WASM to the Workspace

After `build-wasm.sh` finishes, the output lands in `repos/replicad/packages/replicad-opencascadejs/build-config/`. To use it:

```bash
# Copy build output to the package source directory
cd repos/replicad/packages/replicad-opencascadejs
cp build-config/replicad_single.{wasm,js,d.ts} src/
cp build-config/replicad_with_exceptions.{wasm,js,d.ts} src/

# Re-pack and install
npm pack --pack-destination /path/to/tarballs/
# Update pnpm-workspace.yaml to point to new tarball
pnpm install --no-frozen-lockfile

# Copy WASM to runtime package
cd packages/runtime
rm -f src/kernels/replicad/wasm/replicad_*.wasm
npx copy-files-from-to --config copy-files-from-to.cjson
```

## Troubleshooting

### Build interrupted by terminal disconnect

Full builds take 10-30+ minutes and are lost if the terminal session drops. Always use `nohup` for full builds:

```bash
nohup env OCJS_OPT=-O2 OCJS_LTO=0 ./build-wasm.sh full build-configs/full.yml > build.log 2>&1 &
tail -f build.log
```

If a build was interrupted, check for stale lock files or partial cache entries (`*.storing` directories in `cache/`) and re-run.

### Stale cache after modifying OCCT source

The cache key includes the OCCT HEAD commit. If you make uncommitted changes, the cache won't invalidate. Either commit your changes or manually delete the relevant cache entry.

### pnpm integrity errors after swapping tarballs

Run `pnpm install --no-frozen-lockfile` to refresh the lockfile. The experiment orchestrator does this automatically.

### copy-files-from-to not overwriting WASM

Delete the target WASM files first, then re-run the copy. The experiment orchestrator handles this.

### Build takes too long

Check the cache: `./build-wasm.sh cache-list`. If compilation is cached, the `full` command will skip directly to linking (~1-2 min instead of ~30 min).

### wasm-opt not found

Ensure `EMSDK` is set and activated: `source "$EMSDK/emsdk_env.sh"`. The build script does this automatically.

### Switching optimization levels produces wrong binaries

Fixed: `build-wasm.sh` now purges `build/sources/` and `build/bindings/` on cache miss before recompiling. Previously, `compileSources.py` and `compileBindings.py` would skip files with existing `.o` output, silently reusing object files from a prior optimization level. If you suspect a stale build, manually `rm -rf repos/opencascade.js/build/sources repos/opencascade.js/build/bindings` and rebuild.

### Interrupted build left corrupted cache

Cache store/restore operations are now atomic (copy to staging dir, then rename). If you see `*.storing` or `*.restoring` directories in `cache/`, they are incomplete artifacts from interrupted builds — `cache-gc` will clean them automatically.

### Orphan cache directories consuming disk space

`cache-gc` now detects and removes directories in `cache/` that are not tracked in `index.json`.

## Symbol Management

The YAML `bindings` list is a whitelist of OCCT classes exposed to JavaScript via Embind. Every symbol adds WASM binary size (embind registration + C++ implementation) and JS glue code.

### Auditing Symbols

Cross-reference bound symbols against actual usage in `repos/replicad/packages/replicad/src/`:

```bash
# Find all OCCT classes used at runtime
rg "oc\.\w+" --type ts repos/replicad/packages/replicad/src/ -o | sort -u

# Compare against YAML bindings
rg "symbol:" repos/replicad/packages/replicad-opencascadejs/build-config/custom_build_single_v8.yml
```

Full audit results: [Replicad OCCT Symbol Usage Audit](docs/research/replicad-occt-usage-refinement.md)

### Known Gaps (as of 2026-03-03)

| Missing Symbol               | Impact                             | Status           |
| ---------------------------- | ---------------------------------- | ---------------- |
| `HLRBRep_Algo`               | 2D projection broken               | Fixed 2026-03-03 |
| `HLRBRep_InternalAlgo`       | 2D projection (base class)         | Fixed 2026-03-03 |
| `HLRAlgo_Projector`          | 2D projection broken               | Fixed 2026-03-03 |
| `HLRBRep_HLRToShape`         | 2D projection broken               | Fixed 2026-03-03 |
| `Handle_HLRBRep_Algo`        | 2D projection broken               | Fixed 2026-03-03 |
| `Handle_Law_Function`        | Wavy vase / sweep profiles         | Fixed 2026-03-03 |
| `Handle_Geom2d_BSplineCurve` | Cycloidal gear / parametric curves | Fixed 2026-03-03 |

**Note**: HLR also required un-excluding `TKHLR`, `HLRTopoBRep`, `HLRBRep`, `HLRAlgo`, `HLRAppli`, `Intrv`, and `Contap` from `filterPackages.py` (previously excluded as "not used").

### Adding a New Handle Type

When adding a handle type, you must update **both** the bindings list and `additionalCppCode`:

```yaml
# In bindings:
  - symbol: Handle_NewType

# In additionalCppCode:
  typedef opencascade::handle<NewType> Handle_NewType;
```

Both `custom_build_single_v8.yml` and `custom_build_with_exceptions_v8.yml` must be updated.

### Symbol Categories

| Category                    | Count | Notes                           |
| --------------------------- | ----- | ------------------------------- |
| Directly used by replicad   | ~120  | Core API surface                |
| Required base classes       | ~40   | Embind type hierarchy           |
| Return/param type deps      | ~33   | Needed for method signatures    |
| Unused (removal candidates) | ~29   | See audit doc for details       |
| **Total bound**             | ~231  | In `custom_build_single_v8.yml` |

### Adding Symbols for New Features

When replicad adds new OCCT API usage:

1. Check the `.d.ts` for the class and its constructor overloads
2. Add `- symbol: ClassName` to the YAML bindings
3. If the class uses `opencascade::handle<T>`, also add the Handle typedef
4. Rebuild with `./build-wasm.sh link` (fastest — reuses cached .o files)
5. Run tests: `pnpm nx test runtime --testNamePattern="Example models" --watch=false`

## Related Documentation

- [OCCT V8 Migration](docs/research/occt-v8-migration.md)
- [WASM Size Analysis V7.6.2 vs V8RC4](docs/research/wasm-size-analysis-v762-vs-v8rc4.md)
- [Replicad Symbol Audit](docs/research/replicad-occt-usage-refinement.md)
- [Build Harness Plan](.cursor/plans/wasm_build_harness_903e2d7f.plan.md)

## Key Build Variables and Their Impact

| Variable            | Default           | Impact                                                                                |
| ------------------- | ----------------- | ------------------------------------------------------------------------------------- |
| `OCJS_OPT`          | `-O2`             | Compile optimization. `-O3` adds ~1.5 MB via inlining. `-Os` saves ~1.5 MB.           |
| `OCJS_LTO`          | `1`               | Link-time optimization. Dramatically reduces function count but increases build time. |
| `OCJS_EXCEPTIONS`   | `0`               | `1` enables `-fwasm-exceptions`, adding ~2-4 MB but enabling proper error handling.   |
| `THREADING`         | `single-threaded` | `multi-threaded` adds pthread support, increases size.                                |
| `filterPackages.py` | —                 | Package-level exclusion. Removing Draw+Visualization saves significant size.          |
| wasm-opt level      | `-O3`             | Post-link optimization. `-Oz` prioritizes size over speed.                            |
