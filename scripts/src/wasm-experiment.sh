#!/bin/bash
set -euo pipefail

# ── WASM Experiment Orchestrator ─────────────────────────────────────
#
# Runs a complete build→pack→install→benchmark cycle from an experiment
# config YAML. Uses build-wasm.sh for all build operations and the
# runtime benchmark system for evaluation.
#
# Usage:
#   ./scripts/src/wasm-experiment.sh <experiment.yml> [options]
#
# Options:
#   --skip-benchmark    Build and pack only, skip benchmarks
#   --baseline <path>   Compare against baseline experiment directory
#   --tau-root <path>   Path to tau repo root (default: auto-detect)
#
# Examples:
#   ./scripts/src/wasm-experiment.sh scripts/experiments/O2-noLTO-single.yml
#   ./scripts/src/wasm-experiment.sh scripts/experiments/O3-noLTO-single.yml --baseline out/artifacts/wasm/baselines/v8-rc4-O2-single
#   ./scripts/src/wasm-experiment.sh scripts/experiments/Os-noLTO-single.yml --skip-benchmark
# ─────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TAU_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
OCJS_DIR="$TAU_ROOT/repos/opencascade.js"
REPLICAD_OCJS_DIR="$TAU_ROOT/repos/replicad/packages/replicad-opencascadejs"
REPLICAD_DIR="$TAU_ROOT/repos/replicad/packages/replicad"

# ── Validate prerequisites ───────────────────────────────────────────

for dir in "$OCJS_DIR" "$REPLICAD_OCJS_DIR" "$REPLICAD_DIR" "$TAU_ROOT"; do
  if [ ! -d "$dir" ]; then
    echo "ERROR: Required directory not found: $dir" >&2
    exit 1
  fi
done

if ! command -v python3 &>/dev/null; then
  echo "ERROR: python3 not found in PATH" >&2
  exit 1
fi

if ! command -v pnpm &>/dev/null; then
  echo "ERROR: pnpm not found in PATH" >&2
  exit 1
fi

# ── Parse arguments ──────────────────────────────────────────────────

if [ $# -eq 0 ]; then
  echo "Usage:"
  echo "  $0 <experiment.yml> [--skip-benchmark] [--baseline <path>] [--tau-root <path>]"
  echo "  $0 benchmark-all [--iterations N] [--only <pattern>]... [--report]"
  echo ""
  echo "Commands:"
  echo "  <experiment.yml>   Run a full build→pack→benchmark cycle from a YAML config"
  echo "  benchmark-all      Re-run benchmarks for experiments in out/artifacts/wasm/experiments/"
  echo ""
  echo "benchmark-all options:"
  echo "  --iterations N     Number of benchmark iterations (default: 10)"
  echo "  --only <pattern>   Substring filter on experiment dir names (repeatable)"
  echo "  --report           Generate HTML build matrix report after benchmarks"
  echo "  --variant <v>      WASM variant: single (default) or with-exceptions"
  exit 1
fi

# ── benchmark-all subcommand ─────────────────────────────────────────

if [ "$1" = "benchmark-all" ]; then
  shift

  BENCH_ALL_ITERATIONS=10
  BENCH_ALL_REPORT=false
  BENCH_ALL_VARIANT="single"
  BENCH_ALL_FILTERS=()

  while [ $# -gt 0 ]; do
    case "$1" in
      --iterations) BENCH_ALL_ITERATIONS="$2"; shift 2 ;;
      --report) BENCH_ALL_REPORT=true; shift ;;
      --variant) BENCH_ALL_VARIANT="$2"; shift 2 ;;
      --tau-root) TAU_ROOT="$(cd "$2" && pwd)"; shift 2 ;;
      --only) BENCH_ALL_FILTERS+=("$2"); shift 2 ;;
      *) echo "ERROR: Unknown option: $1" >&2; exit 1 ;;
    esac
  done

  EXPERIMENTS_DIR="$TAU_ROOT/out/artifacts/wasm/experiments"
  if [ ! -d "$EXPERIMENTS_DIR" ]; then
    echo "ERROR: Experiments directory not found: $EXPERIMENTS_DIR" >&2
    exit 1
  fi

  # Collect experiment directories with optional filtering
  # Baseline experiments are always excluded — they use a different replicad
  # library version and must be benchmarked separately (without --wasm-dir).
  EXP_DIRS=()
  for dir in "$EXPERIMENTS_DIR"/*/; do
    [ -d "$dir/unpacked" ] || continue

    DIR_NAME=$(basename "$dir")
    case "$DIR_NAME" in baseline*) continue ;; esac

    if [ ${#BENCH_ALL_FILTERS[@]} -gt 0 ]; then
      MATCHED=false
      for pattern in "${BENCH_ALL_FILTERS[@]}"; do
        case "$DIR_NAME" in *$pattern*) MATCHED=true; break ;; esac
      done
      [ "$MATCHED" = "true" ] || continue
    fi

    EXP_DIRS+=("$dir")
  done

  TOTAL=${#EXP_DIRS[@]}
  if [ "$TOTAL" -eq 0 ]; then
    echo "ERROR: No experiment directories matched" >&2
    if [ ${#BENCH_ALL_FILTERS[@]} -gt 0 ]; then
      echo "  Filters: ${BENCH_ALL_FILTERS[*]}" >&2
      echo "  Available:" >&2
      for dir in "$EXPERIMENTS_DIR"/*/; do
        [ -d "$dir/unpacked" ] && echo "    $(basename "$dir")" >&2
      done
    fi
    exit 1
  fi

  echo "╔══════════════════════════════════════════════════════════╗"
  echo "║         Benchmark Experiments                           ║"
  echo "╠══════════════════════════════════════════════════════════╣"
  printf "║  %-14s %-40s ║\n" "Experiments:" "$TOTAL"
  printf "║  %-14s %-40s ║\n" "Iterations:" "$BENCH_ALL_ITERATIONS"
  printf "║  %-14s %-40s ║\n" "Variant:" "$BENCH_ALL_VARIANT"
  if [ ${#BENCH_ALL_FILTERS[@]} -gt 0 ]; then
    printf "║  %-14s %-40s ║\n" "Filter:" "${BENCH_ALL_FILTERS[*]}"
  fi
  echo "╚══════════════════════════════════════════════════════════╝"
  echo ""

  CURRENT=0
  FAILED=0
  for dir in "${EXP_DIRS[@]}"; do
    CURRENT=$((CURRENT + 1))
    EXP_NAME=$(basename "$dir")

    # Determine variant from provenance if available
    VARIANT="$BENCH_ALL_VARIANT"
    if [ -f "$dir/provenance.json" ]; then
      PROV_EXC=$(python3 -c "
import json
with open('${dir}provenance.json') as f:
    p = json.load(f)
exc = p.get('compilation', {}).get('exceptions', 'none')
print(exc)
" 2>/dev/null || echo "none")
      if [ "$PROV_EXC" = "wasm-native" ]; then
        VARIANT="with-exceptions"
      fi
    fi

    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "[$CURRENT/$TOTAL] Benchmarking: $EXP_NAME (variant: $VARIANT)"
    echo "═══════════════════════════════════════════════════════════"

    BENCH_OUT_DIR="$dir/benchmarks"
    mkdir -p "$BENCH_OUT_DIR"

    BENCH_CMD="pnpm nx benchmark runtime -- --iterations $BENCH_ALL_ITERATIONS"
    BENCH_CMD="$BENCH_CMD --wasm-dir $dir/unpacked"
    BENCH_CMD="$BENCH_CMD --wasm-variant $VARIANT"
    BENCH_CMD="$BENCH_CMD --output $BENCH_OUT_DIR"

    if [ -f "${dir}provenance.json" ]; then
      BENCH_CMD="$BENCH_CMD --provenance ${dir}provenance.json"
    fi

    if eval "$BENCH_CMD"; then
      echo "✓ $EXP_NAME complete"
    else
      echo "✗ $EXP_NAME failed (non-fatal)" >&2
      FAILED=$((FAILED + 1))
    fi
  done

  echo ""
  echo "╔══════════════════════════════════════════════════════════╗"
  echo "║         Benchmark All Complete                          ║"
  echo "╠══════════════════════════════════════════════════════════╣"
  printf "║  %-14s %-40s ║\n" "Total:" "$TOTAL"
  printf "║  %-14s %-40s ║\n" "Succeeded:" "$((TOTAL - FAILED))"
  printf "║  %-14s %-40s ║\n" "Failed:" "$FAILED"
  echo "╚══════════════════════════════════════════════════════════╝"

  # Generate comparison report
  if [ "$BENCH_ALL_REPORT" = "true" ]; then
    echo ""
    echo "═══ Generating build matrix comparison report ═══"
    cd "$TAU_ROOT"
    if [ ${#BENCH_ALL_FILTERS[@]} -gt 0 ]; then
      COMPARE_ARGS=()
      for dir in "${EXP_DIRS[@]}"; do
        COMPARE_ARGS+=(--compare "../../out/artifacts/wasm/experiments/$(basename "$dir")")
      done
      pnpm nx build-matrix runtime -- "${COMPARE_ARGS[@]}"
      pnpm nx compare-benchmarks runtime -- "${COMPARE_ARGS[@]}"
    else
      pnpm nx build-matrix runtime -- --experiments ../../out/artifacts/wasm/experiments/
      pnpm nx compare-benchmarks runtime -- --experiments ../../out/artifacts/wasm/experiments/
    fi
  fi

  exit 0
fi

# ── Single experiment mode ───────────────────────────────────────────

EXPERIMENT_FILE="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
shift

SKIP_BENCHMARK=false
BASELINE_DIR=""

while [ $# -gt 0 ]; do
  case "$1" in
    --skip-benchmark) SKIP_BENCHMARK=true; shift ;;
    --baseline) BASELINE_DIR="$2"; shift 2 ;;
    --tau-root) TAU_ROOT="$(cd "$2" && pwd)"; shift 2 ;;
    *) echo "ERROR: Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [ ! -f "$EXPERIMENT_FILE" ]; then
  echo "ERROR: Experiment config not found: $EXPERIMENT_FILE" >&2
  exit 1
fi

# ── Parse experiment YAML ────────────────────────────────────────────

parse_yaml_field() {
  local field="$1"
  local default="$2"
  python3 -c "
import yaml, sys
with open('$EXPERIMENT_FILE') as f:
    cfg = yaml.safe_load(f)
keys = '$field'.split('.')
v = cfg
for k in keys:
    if isinstance(v, dict) and k in v:
        v = v[k]
    else:
        v = '$default'
        break
if isinstance(v, list):
    print(','.join(str(x) for x in v))
elif isinstance(v, bool):
    print('true' if v else 'false')
else:
    print(v)
" || { echo "ERROR: Failed to parse field '$field' from $EXPERIMENT_FILE" >&2; exit 1; }
}

EXP_NAME=$(parse_yaml_field "name" "experiment")
EXP_OPT=$(parse_yaml_field "compilation.optimization" "-O2")
EXP_LTO=$(parse_yaml_field "compilation.lto" "false")
EXP_EXC=$(parse_yaml_field "compilation.exceptions" "none")
EXP_THREADING=$(parse_yaml_field "compilation.threading" "single-threaded")
EXP_YAML=$(parse_yaml_field "linking.yaml" "custom_build_single_v8.yml")
EXP_WASM_OPT=$(parse_yaml_field "linking.wasmOptLevel" "-O3")
BENCH_ITERATIONS=$(parse_yaml_field "benchmark.iterations" "10")
BENCH_FILTER=$(parse_yaml_field "benchmark.filter" "")
EXP_CLOSURE=$(parse_yaml_field "optimizations.closure" "false")
EXP_EVAL_CTORS=$(parse_yaml_field "optimizations.evalCtors" "false")
EXP_EVAL_CTORS_LEVEL=$(parse_yaml_field "optimizations.evalCtorsLevel" "1")
EXP_CONVERGE=$(parse_yaml_field "optimizations.converge" "false")
EXP_DEFINES=$(parse_yaml_field "compilation.defines" "")
EXP_UNDEFINES=$(parse_yaml_field "compilation.undefines" "")
EXP_PATCH_DUMP=$(parse_yaml_field "optimizations.patchDump" "false")
EXP_SIMD=$(parse_yaml_field "optimizations.simd" "false")
EXP_BIGINT=$(parse_yaml_field "optimizations.bigint" "false")

LTO_FLAG="0"
if [ "$EXP_LTO" = "true" ]; then
  LTO_FLAG="1"
fi

EXC_FLAG="0"
if [ "$EXP_EXC" = "wasm-native" ]; then
  EXC_FLAG="1"
fi

EXPERIMENT_SLUG="${EXP_NAME}"

echo "╔══════════════════════════════════════════════════════════╗"
echo "║         WASM Experiment Runner                          ║"
echo "╠══════════════════════════════════════════════════════════╣"
printf "║  %-14s %-40s ║\n" "Name:" "$EXP_NAME"
printf "║  %-14s %-40s ║\n" "Compile:" "$EXP_OPT"
printf "║  %-14s %-40s ║\n" "LTO:" "$EXP_LTO"
printf "║  %-14s %-40s ║\n" "Exceptions:" "$EXP_EXC"
printf "║  %-14s %-40s ║\n" "Threading:" "$EXP_THREADING"
printf "║  %-14s %-40s ║\n" "Link YAML:" "$EXP_YAML"
printf "║  %-14s %-40s ║\n" "wasm-opt:" "$EXP_WASM_OPT"
printf "║  %-14s %-40s ║\n" "Slug:" "$EXPERIMENT_SLUG"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ── Step 1: Resolve YAML config path ────────────────────────────────

YAML_PATH=""
SEARCH_PATHS=(
  "$REPLICAD_OCJS_DIR/build-config/$EXP_YAML"
  "$REPLICAD_OCJS_DIR/$EXP_YAML"
  "$OCJS_DIR/build-configs/$EXP_YAML"
  "$OCJS_DIR/$EXP_YAML"
)

for candidate in "${SEARCH_PATHS[@]}"; do
  if [ -f "$candidate" ]; then
    YAML_PATH="$(cd "$(dirname "$candidate")" && pwd)/$(basename "$candidate")"
    break
  fi
done

if [ -z "$YAML_PATH" ]; then
  echo "ERROR: YAML config not found: $EXP_YAML" >&2
  for candidate in "${SEARCH_PATHS[@]}"; do
    echo "  Searched: $candidate" >&2
  done
  exit 1
fi

echo "═══ Step 1: Build WASM (YAML: $YAML_PATH) ═══"

# ── Step 2: Build WASM ───────────────────────────────────────────────

SIMD_FLAG="0"
if [ "$EXP_SIMD" = "true" ]; then
  SIMD_FLAG="1"
fi

BIGINT_FLAG="0"
if [ "$EXP_BIGINT" = "true" ]; then
  BIGINT_FLAG="1"
fi

EXP_CONFIG=$(parse_yaml_field "configuration" "")

cd "$OCJS_DIR"

# Use --config if experiment specifies a named configuration; otherwise set env vars directly
BUILD_ARGS=()
if [ -n "$EXP_CONFIG" ] && [ "$EXP_CONFIG" != "None" ]; then
  BUILD_ARGS+=(--config "$EXP_CONFIG")
else
  export OCJS_OPT="$EXP_OPT"
  export OCJS_LTO="$LTO_FLAG"
  export OCJS_EXCEPTIONS="$EXC_FLAG"
  export THREADING="$EXP_THREADING"
  export OCJS_WASM_OPT_LEVEL="$EXP_WASM_OPT"
  export OCJS_CLOSURE="$EXP_CLOSURE"
  export OCJS_EVAL_CTORS="$EXP_EVAL_CTORS"
  export OCJS_EVAL_CTORS_LEVEL="$EXP_EVAL_CTORS_LEVEL"
  export OCJS_CONVERGE="$EXP_CONVERGE"
  export OCJS_DEFINES="$EXP_DEFINES"
  export OCJS_UNDEFINES="$EXP_UNDEFINES"
  export OCJS_PATCH_DUMP="$EXP_PATCH_DUMP"
  export OCJS_SIMD="$SIMD_FLAG"
  export OCJS_BIGINT="$BIGINT_FLAG"
fi

WASM_OUT_DIR="$(dirname "$YAML_PATH")"
export OCJS_OUTPUT_DIR="$WASM_OUT_DIR"
./build-wasm.sh ${BUILD_ARGS[@]+"${BUILD_ARGS[@]}"} full "$YAML_PATH"

# Verify WASM was actually produced
WASM_COUNT=0
for wf in "$WASM_OUT_DIR"/*.wasm; do
  if [ -f "$wf" ]; then
    WASM_COUNT=$((WASM_COUNT + 1))
  fi
done
if [ "$WASM_COUNT" -eq 0 ]; then
  echo "ERROR: No .wasm files produced in $WASM_OUT_DIR" >&2
  exit 1
fi

echo ""

# ── Step 3: Create experiment directory ──────────────────────────────

echo "═══ Step 3: Create experiment directory ═══"
ARTIFACTS_DIR="$TAU_ROOT/out/artifacts/wasm"
EXP_DIR="$ARTIFACTS_DIR/experiments/$EXPERIMENT_SLUG"
mkdir -p "$EXP_DIR/unpacked"

cp "$EXPERIMENT_FILE" "$EXP_DIR/config.yml"

if [ -f "$OCJS_DIR/build/provenance.json" ]; then
  cp "$OCJS_DIR/build/provenance.json" "$EXP_DIR/provenance.json"
else
  echo "  WARNING: No provenance.json found in build/" >&2
fi

for ext in wasm js d.ts js.symbols; do
  for f in "$WASM_OUT_DIR"/*."$ext"; do
    if [ -f "$f" ]; then
      cp "$f" "$EXP_DIR/unpacked/"
    fi
  done
done

echo "  Experiment directory: $EXP_DIR"

# Show unpacked file sizes
for wf in "$EXP_DIR"/unpacked/*.wasm; do
  if [ -f "$wf" ]; then
    SIZE=$(stat -f%z "$wf" 2>/dev/null || stat -c%s "$wf" 2>/dev/null || echo "?")
    SIZE_MB=$(echo "scale=2; $SIZE / 1048576" | bc 2>/dev/null || echo "?")
    echo "  $(basename "$wf"): ${SIZE_MB} MB"
  fi
done
echo ""

# ── Step 4: Pack tarballs ────────────────────────────────────────────

echo "═══ Step 4: Pack tarballs ═══"

cd "$REPLICAD_OCJS_DIR"
cp build-config/replicad_single.{wasm,js,d.ts} src/
cp build-config/replicad_with_exceptions.{wasm,js,d.ts} src/ 2>/dev/null || true
echo "  Copied build-config → src/"
OCJS_TGZ=$(npm pack --pack-destination "$EXP_DIR" 2>/dev/null | tail -1)
if [ -z "$OCJS_TGZ" ] || [ ! -f "$EXP_DIR/$OCJS_TGZ" ]; then
  echo "ERROR: npm pack failed for replicad-opencascadejs" >&2
  exit 1
fi
echo "  replicad-opencascadejs: $OCJS_TGZ"

cd "$REPLICAD_DIR"
REPLICAD_TGZ=$(npm pack --pack-destination "$EXP_DIR" 2>/dev/null | tail -1)
if [ -z "$REPLICAD_TGZ" ] || [ ! -f "$EXP_DIR/$REPLICAD_TGZ" ]; then
  echo "ERROR: npm pack failed for replicad" >&2
  exit 1
fi
echo "  replicad: $REPLICAD_TGZ"

cd "$OCJS_DIR"
echo ""

# ── Step 5: Update tau workspace ─────────────────────────────────────

echo "═══ Step 5: Update tau workspace ═══"

OCJS_TGZ_PATH="$EXP_DIR/$OCJS_TGZ"
REPLICAD_TGZ_PATH="$EXP_DIR/$REPLICAD_TGZ"

cd "$TAU_ROOT"

python3 -c "
import re
ws_file = 'pnpm-workspace.yaml'
with open(ws_file) as f:
    content = f.read()
content = re.sub(
    r'replicad-opencascadejs:.*',
    'replicad-opencascadejs: $OCJS_TGZ_PATH',
    content
)
content = re.sub(
    r'  replicad:.*',
    '  replicad: $REPLICAD_TGZ_PATH',
    content
)
with open(ws_file, 'w') as f:
    f.write(content)
print('  Updated pnpm-workspace.yaml')
" || { echo "ERROR: Failed to update pnpm-workspace.yaml" >&2; exit 1; }

# ── Step 6: Install and copy assets ──────────────────────────────────

echo "═══ Step 6: Install and copy assets ═══"
pnpm install --no-frozen-lockfile 2>&1 | tail -5
echo ""

KERNELS_DIR="$TAU_ROOT/packages/runtime"
cd "$KERNELS_DIR"

rm -f src/kernels/replicad/wasm/replicad_single.wasm
rm -f src/kernels/replicad/wasm/replicad_with_exceptions.wasm

npx copy-files-from-to --config copy-files-from-to.cjson 2>&1 | head -10

# Verify WASM was copied
if [ ! -f src/kernels/replicad/wasm/replicad_single.wasm ]; then
  echo "ERROR: WASM not copied to runtime package" >&2
  exit 1
fi

echo ""
cd "$TAU_ROOT"

# ── Step 7: Run benchmarks ───────────────────────────────────────────

if [ "$SKIP_BENCHMARK" = "true" ]; then
  echo "═══ Skipping benchmarks (--skip-benchmark) ═══"
else
  echo "═══ Step 7: Run benchmarks ═══"

  BENCH_CMD="pnpm nx benchmark runtime -- --iterations $BENCH_ITERATIONS --output $EXP_DIR"
  BENCH_CMD="$BENCH_CMD --wasm-dir $EXP_DIR/unpacked"

  # Determine variant from exceptions setting
  if [ "$EXP_EXC" = "wasm-native" ]; then
    BENCH_CMD="$BENCH_CMD --wasm-variant with-exceptions"
  else
    BENCH_CMD="$BENCH_CMD --wasm-variant single"
  fi

  if [ -f "$EXP_DIR/provenance.json" ]; then
    BENCH_CMD="$BENCH_CMD --provenance $EXP_DIR/provenance.json"
  fi

  if [ -n "$BENCH_FILTER" ] && [ "$BENCH_FILTER" != "None" ]; then
    BENCH_CMD="$BENCH_CMD --filter $BENCH_FILTER"
  fi

  eval "$BENCH_CMD" || echo "WARNING: Benchmarks completed with errors (non-fatal)" >&2

  # ── Step 8: Comparison ─────────────────────────────────────────────
  if [ -n "$BASELINE_DIR" ] && [ -d "$BASELINE_DIR" ]; then
    echo ""
    echo "═══ Step 8: Generate comparison ═══"
    BASELINE_JSON=$(find "$BASELINE_DIR" -name "benchmark-*.json" -not -name "*comparison*" | head -1)
    CURRENT_JSON=$(find "$EXP_DIR" -name "benchmark-*.json" -not -name "*comparison*" | head -1)

    if [ -n "$BASELINE_JSON" ] && [ -n "$CURRENT_JSON" ]; then
      COMP_DIR="$ARTIFACTS_DIR/comparisons"
      mkdir -p "$COMP_DIR"
      pnpm nx benchmark runtime -- --compare "$BASELINE_JSON" "$CURRENT_JSON" --output "$COMP_DIR" || true
    else
      echo "  No benchmark JSON found for comparison."
    fi
  fi
fi

# ── Step 9: Update active symlink ────────────────────────────────────

echo ""
echo "═══ Step 9: Update active symlink ═══"
ACTIVE_LINK="$ARTIFACTS_DIR/active"
rm -f "$ACTIVE_LINK"
ln -s "experiments/$EXPERIMENT_SLUG" "$ACTIVE_LINK"
echo "  Active: $ACTIVE_LINK -> experiments/$EXPERIMENT_SLUG"

# ── Summary ──────────────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║         Experiment Complete                              ║"
echo "╠══════════════════════════════════════════════════════════╣"
printf "║  %-14s %-40s ║\n" "Name:" "$EXP_NAME"
printf "║  %-14s %-40s ║\n" "Directory:" "$EXP_DIR"

for wasm in "$EXP_DIR"/unpacked/*.wasm; do
  if [ -f "$wasm" ]; then
    SIZE=$(stat -f%z "$wasm" 2>/dev/null || stat -c%s "$wasm" 2>/dev/null || echo "?")
    SIZE_MB=$(echo "scale=2; $SIZE / 1048576" | bc 2>/dev/null || echo "?")
    printf "║  %-14s %-40s ║\n" "$(basename "$wasm"):" "${SIZE_MB} MB"
  fi
done

echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "Experiment slug: $EXPERIMENT_SLUG"
