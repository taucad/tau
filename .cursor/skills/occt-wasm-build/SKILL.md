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
3. **Experiment Orchestrator** (`repos/opencascade.js/wasm-experiment.sh`) — Full lifecycle runner
4. **Comparison Reporting** (`packages/kernels/scripts/build-matrix-report.mts`) — Visual dashboard

All build operations go through `repos/opencascade.js/build-wasm.sh` as the single entry point.

## Quick Start

### Run an Experiment

```bash
cd repos/opencascade.js

# Run a preset experiment (build + pack + install + benchmark)
./wasm-experiment.sh experiments/O2-noLTO-single.yml

# Build only (skip benchmarks)
./wasm-experiment.sh experiments/O3-noLTO-single.yml --skip-benchmark

# Compare against a baseline
./wasm-experiment.sh experiments/Os-noLTO-single.yml --baseline ../../tarballs/baselines/v8-rc4-O2-single
```

### Just Build WASM

```bash
cd repos/opencascade.js

# Full build with cache (checks cache first, compiles only on miss)
OCJS_LTO=0 ./build-wasm.sh full ../replicad/packages/replicad-opencascadejs/build-config/custom_build_single_v8.yml

# Link-only rebuild (fastest, reuses compiled .o files)
./build-wasm.sh link ../replicad/packages/replicad-opencascadejs/build-config/custom_build_single_v8.yml

# Rebuild PCH then link
./build-wasm.sh pch link ../replicad/packages/replicad-opencascadejs/build-config/custom_build_single_v8.yml
```

### Compare Experiments

```bash
# Generate build matrix report from all experiments
pnpm nx build-matrix kernels -- --experiments ../../tarballs/experiments/

# Compare specific experiments
pnpm nx build-matrix kernels -- --compare ../../tarballs/experiments/exp1 ../../tarballs/experiments/exp2

# With baseline
pnpm nx build-matrix kernels -- --experiments ../../tarballs/experiments/ --baseline ../../tarballs/baselines/v8-rc4-O2-single
```

## Experiment Config Reference

Experiment configs live in `repos/opencascade.js/experiments/*.yml`:

```yaml
name: "O2-noLTO-single"
description: "Default production build"

compilation:
  optimization: "-O2"    # -O0, -O1, -O2, -O3, -Os, -Oz
  lto: false             # true = -flto at compile time
  exceptions: "none"     # "none" or "wasm-native"
  threading: "single-threaded"  # or "multi-threaded"

linking:
  yaml: "custom_build_single_v8.yml"  # Build YAML config
  wasmOptLevel: "-O3"    # wasm-opt optimization level

benchmark:
  iterations: 10
  filter: ["primitives", "booleans", "fillets", "complex"]
```

### Available Presets

| Preset | Compile | LTO | Exceptions | Expected Size |
|--------|---------|-----|------------|---------------|
| `O2-noLTO-single.yml` | -O2 | No | none | ~17.7 MB |
| `O3-noLTO-single.yml` | -O3 | No | none | ~19.0 MB |
| `Os-noLTO-single.yml` | -Os | No | none | ~16.1 MB |
| `O2-noLTO-wasmExc-single.yml` | -O2 | No | wasm-native | ~20.0 MB |

## Cache Management

### Cache Key Format

```
<OPT>-<lto|noLTO>-<noExc|wasmExc>-<single|multi>-<filterHash6>-<occtHash6>
```

Example: `O2-noLTO-noExc-single-a3f2b1-c7d4e9`

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
├── O2-noLTO-noExc-single-a3f2b1-c7d4e9/
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

## Troubleshooting

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

## Related Documentation

- [OCCT V8 Migration](docs/research/occt-v8-migration.md)
- [WASM Size Analysis V7.6.2 vs V8RC4](docs/research/wasm-size-analysis-v762-vs-v8rc4.md)
- [Build Harness Plan](.cursor/plans/wasm_build_harness_903e2d7f.plan.md)

## Key Build Variables and Their Impact

| Variable | Default | Impact |
|----------|---------|--------|
| `OCJS_OPT` | `-O2` | Compile optimization. `-O3` adds ~1.5 MB via inlining. `-Os` saves ~1.5 MB. |
| `OCJS_LTO` | `1` | Link-time optimization. Dramatically reduces function count but increases build time. |
| `OCJS_EXCEPTIONS` | `0` | `1` enables `-fwasm-exceptions`, adding ~2-4 MB but enabling proper error handling. |
| `THREADING` | `single-threaded` | `multi-threaded` adds pthread support, increases size. |
| `filterPackages.py` | — | Package-level exclusion. Removing Draw+Visualization saves significant size. |
| wasm-opt level | `-O3` | Post-link optimization. `-Oz` prioritizes size over speed. |
