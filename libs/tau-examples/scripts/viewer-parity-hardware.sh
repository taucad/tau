#!/usr/bin/env bash
#
# Viewer parity on real hardware: the D2 gate of `viewer-parity.yml` on this Mac's GPU instead of CI's software GPUs.
#
# Tau Brain research/nanoraster-viewer-parity-charter.md, D7 (one real-hardware run before the release) and resume P4,
# ping 1. Builds everything in a throwaway directory under $TMPDIR and leaves only the log:
#   1. a detached git worktree of the Tau commit (default FETCH_HEAD); the checkout it runs from is not touched
#      (no branch, stash, index, hook or working-tree change; the worktree's registration is removed on exit);
#   2. `pnpm install --frozen-lockfile` there, as CI does, which installs the catalog's published nanoraster (0.9.0 or
#      later; the gate refuses an older one), and Playwright's Chromium;
#   3. the fixture GLBs exported from tau-examples source;
#   4. the viewer references captured on the GPU with TAU_E2E_WEBGPU_PROFILE=hardware: the production
#      software-adapter gate is left in place (no I2 mock), and a frame on a software adapter or on WebGL2 fails;
#   5. the gate: nanoraster native on Metal and WASM in Chromium on the same GPU;
#   6. one summary line, `parity: <passed>/<fixtures> under 1% (max <x.xxx>%)`.
# Progress goes to stderr; everything else goes to the log, whose path is printed first.
#
# Usage (in a Tau checkout, any branch, network on):
#   git fetch origin claude/project-thread-ithsz5 &&
#     git show FETCH_HEAD:libs/tau-examples/scripts/viewer-parity-hardware.sh | bash -s
#   bash libs/tau-examples/scripts/viewer-parity-hardware.sh [--ref <commit>] [--fixtures <name,...>] [--headless]
#     [--keep]
#
# Options:
#   --ref <commit>         Tau commit to check (default: FETCH_HEAD)
#   --fixtures <name,...>  only these fixtures, by fixtures.json name (default: all)
#   --headless             run Chromium headless (default on macOS: headed; two Chromium windows open in turn)
#   --keep                 keep the work directory for inspection
#
# Optional env vars:
#   TMPDIR                 where the work directory and the log go (default: /tmp)
#   PARITY_CHROMIUM        Chromium executable (default: Playwright's Chromium, installed on demand)
#   PARITY_ALLOW_SOFTWARE  1 runs on Linux with software GPUs (lavapipe, SwiftShader under xvfb-run), CI's profile, to
#                          test this script; never a real-hardware result
#
# Exit codes:
#   0  Every fixture under 1% on the real GPU (native and WASM)
#   1  Parity failure, a render on a software adapter or WebGL2, or bad arguments
#   2  A step failed (network, install, capture); see the log
#   3  Missing prerequisite

set -euo pipefail

readonly tau_branch_hint='claude/project-thread-ithsz5'
readonly min_free_gb=6

# Terminal stdout (3) and stderr (4), kept before everything else is sent to the log.
exec 3>&1 4>&2

LOG=''
WORK=''
REPO_ROOT=''
WORKTREE_ADMIN=''
KEEP=0

say() {
  printf '%s\n' "$*" >&4
  if [[ -n $LOG ]]; then
    printf '%s\n' "$*"
  fi
}

die() {
  local status=$1
  shift
  if [[ -n $LOG ]]; then
    printf 'ERROR: %s\n' "$*"
    printf 'viewer-parity-hardware: %s (log: %s)\n' "$*" "$LOG" >&4
  else
    printf 'viewer-parity-hardware: %s\n' "$*" >&4
  fi
  exit "$status"
}

cleanup() {
  local status=$?
  set +e
  trap - EXIT INT TERM HUP
  if [[ -n $WORK && -d $WORK ]]; then
    if [[ $KEEP == 1 ]]; then
      printf 'Kept the work directory %s\n' "$WORK"
    else
      if [[ -n $WORKTREE_ADMIN ]]; then
        git -C "$REPO_ROOT" worktree remove --force "$WORK/tau" || true
      fi
      rm -rf "$WORK"
      # The worktree's registration in the checkout's git directory, if `worktree remove` did not take it.
      if [[ -n $WORKTREE_ADMIN && -d $WORKTREE_ADMIN ]]; then
        rm -rf "$WORKTREE_ADMIN"
      fi
      printf 'Removed the work directory %s\n' "$WORK"
    fi
  fi
  exit "$status"
}

# Runs one step with its output in the log; a failure ends the run.
step() {
  local name=$1
  shift
  local started=$SECONDS
  say "→ $name"
  printf '\n=== %s (%s)\n$ %s\n' "$name" "$(date -u +%H:%M:%SZ)" "$*"
  "$@" || die 2 "$name failed (exit $?)"
  printf '=== %s took %ss\n' "$name" "$((SECONDS - started))"
}

# `pnpm nx run`, rerun once when Nx dies from SIGSEGV, as CI's setup-nx guard does.
nx_run() {
  local status=0
  pnpm nx run "$@" || status=$?
  if [[ $status == 139 ]]; then
    printf 'Nx was killed by SIGSEGV; rerunning: nx run %s\n' "$*"
    status=0
    pnpm nx run "$@" || status=$?
  fi
  return "$status"
}

require() {
  command -v "$1" >/dev/null 2>&1 || die 3 "$1 is required: $2"
}

# The JSON checks, in Node (always present; jq is not): written to the work directory, so no JavaScript sits inside a
# command substitution, which macOS's bash 3.2 parses poorly.
write_checks() {
  cat >"$1" <<'JS'
'use strict';
const { readdirSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const software = /swiftshader|llvmpipe|lavapipe|software|warp|basic render driver/i;
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const [command, ...args] = process.argv.slice(2);

const checks = {
  // The exporter's `--only` sources of the named fixtures; fixtures that are not tau-examples exports have none.
  sources([manifestPath, list]) {
    const { fixtures } = readJson(manifestPath);
    const names = list.split(',');
    const unknown = names.filter((name) => !fixtures.some((fixture) => fixture.name === name));
    if (unknown.length > 0) {
      console.error(`unknown fixtures: ${unknown.join(', ')}`);
      return 1;
    }
    const exported = fixtures.filter(
      (fixture) => names.includes(fixture.name) && /^[a-z0-9-]+\/[a-z0-9-]+$/.test(fixture.source),
    );
    console.log(exported.map((fixture) => fixture.source).join(','));
    return 0;
  },
  total([manifestPath, list]) {
    const names = (list ?? '').split(',').filter(Boolean);
    console.log(names.length > 0 ? names.length : readJson(manifestPath).fixtures.length);
    return 0;
  },
  // Every viewer reference is a WebGPU frame at 1x; on the hardware profile, on a hardware adapter.
  references([directory, profile]) {
    const problems = [];
    const adapters = new Set();
    for (const entry of readdirSync(directory, { withFileTypes: true }).filter((item) => item.isDirectory())) {
      const files = readdirSync(join(directory, entry.name)).filter((name) => /^viewer\.webgpu\.ao-o(n|ff)\.json$/.test(name));
      for (const file of files) {
        const reference = readJson(join(directory, entry.name, file));
        const adapter = Object.values(reference.adapter ?? {}).filter(Boolean).join(' ') || 'unnamed adapter';
        adapters.add(adapter);
        console.error(
          `${entry.name}/${file}: ${adapter}, WebGPU ${reference.isWebGPUBackend}, ${reference.size} at ` +
            `${reference.devicePixelRatio}x, software adapter ${reference.softwareAdapter}, gate ${reference.softwareRasterizerGate}`,
        );
        if (reference.isWebGPUBackend !== true) problems.push(`${entry.name}: the viewer fell back to WebGL2`);
        if (reference.devicePixelRatio !== 1) {
          problems.push(`${entry.name}: device pixel ratio ${reference.devicePixelRatio}, not 1`);
        }
        if (profile === 'hardware' && (reference.softwareAdapter !== false || software.test(adapter))) {
          problems.push(`${entry.name}: the viewer rendered on a software adapter (${adapter})`);
        }
      }
    }
    if (adapters.size === 0) problems.push('no viewer references were written');
    for (const problem of problems) console.error(`PROBLEM: ${problem}`);
    console.log([...adapters].join('; '));
    return problems.length === 0 ? 0 : 1;
  },
  // The one summary line. Exit 1 when a build rendered off the GPU, 2 when a fixture is at or over 1%.
  summary([resultsPath, total, profile]) {
    const { adapters = {}, browser, results = [] } = readJson(resultsPath);
    const native = adapters.native ?? {};
    const wasm = adapters.wasm ?? {};
    console.error(`native: ${native.backend} ${native.name} (${native.deviceType})`);
    console.error(`wasm: ${wasm.backend} ${wasm.name} (${wasm.deviceType}) in ${browser}`);
    const problems = [];
    if (profile === 'hardware') {
      if (native.backend !== 'metal' || native.deviceType === 'cpu' || software.test(native.name ?? '')) {
        problems.push(`native rendered on ${native.backend} ${native.name} (${native.deviceType}), not Metal on the GPU`);
      }
      if (wasm.backend === undefined || wasm.deviceType === 'cpu' || software.test(wasm.name ?? '')) {
        problems.push(`WASM rendered on ${wasm.name ?? 'no adapter'} (${wasm.deviceType}), not the GPU`);
      }
    }
    if (problems.length > 0) {
      for (const problem of problems) console.error(`PROBLEM: ${problem}`);
      console.log(`parity: not measured on the GPU (${problems.join('; ')})`);
      return 1;
    }
    const passed = results.filter((result) => result.native.pass && result.wasm.pass).length;
    const max = Math.max(
      0,
      ...results.flatMap((result) =>
        ['native', 'wasm'].flatMap((build) => [result[build].aoOn.percent, result[build].aoOff.percent]),
      ),
    );
    console.log(`parity: ${passed}/${total} under 1% (max ${max.toFixed(3)}%)`);
    return passed === Number(total) ? 0 : 2;
  },
};

const check = checks[command];
if (check === undefined) {
  console.error(`unknown check: ${command}`);
  process.exit(1);
}
process.exit(check(args));
JS
}

usage() {
  cat >&4 <<'USAGE'
Usage (in a Tau checkout, any branch, network on):
  git fetch origin claude/project-thread-ithsz5 &&
    git show FETCH_HEAD:libs/tau-examples/scripts/viewer-parity-hardware.sh | bash -s
  bash libs/tau-examples/scripts/viewer-parity-hardware.sh [--ref <commit>] [--fixtures <name,...>] [--headless]
    [--keep]
USAGE
}

main() {
  # Children never read the terminal or, under `bash -s`, the rest of this script.
  exec </dev/null

  local ref='FETCH_HEAD' fixtures='' headless=0
  while [[ $# -gt 0 ]]; do
    case $1 in
      --ref) ref=${2:?--ref needs a commit}; shift 2 ;;
      --fixtures) fixtures=${2:?--fixtures needs names}; shift 2 ;;
      --headless) headless=1; shift ;;
      --keep) KEEP=1; shift ;;
      -h | --help) usage; exit 0 ;;
      *) usage; die 1 "unknown argument: $1" ;;
    esac
  done

  # --- Platform and tools ---------------------------------------------------------------------------------------
  local os arch mode
  os=$(uname -s)
  arch=$(uname -m)
  if [[ $os == Darwin ]]; then
    [[ $arch == arm64 ]] || die 3 "this check needs Apple Silicon running natively; uname -m says $arch (a Rosetta shell?)"
    mode=hardware
  elif [[ $os == Linux && ${PARITY_ALLOW_SOFTWARE:-} == 1 ]]; then
    mode=software
  else
    die 3 "run this on a Mac with Apple Silicon (charter D7 needs a real GPU); PARITY_ALLOW_SOFTWARE=1 runs it on Linux's software GPUs only to test the script"
  fi
  require git 'install the Xcode Command Line Tools: xcode-select --install'
  if [[ $mode == software ]]; then
    require xvfb-run 'apt-get install -y xvfb'
    [[ -f /usr/share/vulkan/icd.d/lvp_icd.json ]] || die 3 'lavapipe is required: apt-get install -y mesa-vulkan-drivers'
  fi
  require node 'install Node.js 24 (Tau requires node >=24)'
  local node_major node_arch
  node_major=$(node -p 'process.versions.node.split(".")[0]')
  node_arch=$(node -p 'process.arch')
  ((node_major >= 24)) || die 3 "Node.js 24 or later is required (Tau's engines); found $(node --version)"
  if [[ $mode == hardware && $node_arch != arm64 ]]; then
    die 3 "node is $node_arch (Rosetta); install the arm64 Node.js so it can load the arm64 nanoraster addon"
  fi
  require pnpm 'enable it with: corepack enable pnpm'

  REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || die 1 'run this inside your Tau checkout (for example ~/git/tau)'
  local sha
  sha=$(git -C "$REPO_ROOT" rev-parse --verify --quiet "$ref^{commit}") ||
    die 1 "no commit $ref; run: git fetch origin $tau_branch_hint"
  git -C "$REPO_ROOT" cat-file -e "$sha:libs/tau-examples/fixtures/viewer-parity/fixtures.json" 2>/dev/null ||
    die 1 "$ref ($sha) is not a Tau commit with the viewer parity gate"

  local tmp_root free_kb
  tmp_root=$(cd "${TMPDIR:-/tmp}" && pwd -P)
  free_kb=$(df -Pk "$tmp_root" | awk 'NR == 2 { print $4 }')
  ((free_kb >= min_free_gb * 1024 * 1024)) ||
    die 3 "about ${min_free_gb} GB must be free under $tmp_root; $((free_kb / 1024 / 1024)) GB is"

  # --- Log and work directory -------------------------------------------------------------------------------------
  LOG="$tmp_root/viewer-parity-hardware-$(date -u +%Y%m%dT%H%M%SZ).log"
  : >"$LOG"
  printf 'Log: %s\n' "$LOG" >&3
  exec >>"$LOG" 2>&1
  trap cleanup EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  trap 'exit 129' HUP
  WORK=$(mktemp -d "$tmp_root/viewer-parity-hardware.XXXXXX")
  WORK=$(cd "$WORK" && pwd -P)

  # Every git call below: no hooks, no filesystem monitor left watching the throwaway trees.
  export GIT_CONFIG_COUNT=2 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/dev/null
  export GIT_CONFIG_KEY_1=core.fsmonitor GIT_CONFIG_VALUE_1=false GIT_TERMINAL_PROMPT=0
  # As in CI: frozen lockfile, no husky install into the shared git config, no Nx daemon or cloud, Vitest without UI
  # (headed Chromium then keeps the 1x device scale the references are captured at).
  export CI=true HUSKY=0 FORCE_COLOR=0 NX_DAEMON=false NX_NO_CLOUD=true NX_NATIVE_COMMAND_RUNNER=false NX_TUI=false
  export PARITY_FIXTURES_OUT=out/test-results/viewer-parity/fixtures
  export PARITY_VIEWER_OUT=out/test-results/viewer-parity/viewer
  export PARITY_OUT=out/test-results/viewer-parity/nanoraster
  export TAU_E2E_WEBGPU_PROFILE=$mode
  if [[ -n $fixtures ]]; then
    export PARITY_FIXTURES=$fixtures
  else
    unset PARITY_FIXTURES
  fi

  printf 'Viewer parity on real hardware, %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf 'Profile: %s\nHost: %s %s %s\n' "$mode" "$os" "$(uname -r)" "$arch"
  if [[ $os == Darwin ]]; then
    printf 'macOS %s, %s\n' "$(sw_vers -productVersion)" "$(sysctl -n machdep.cpu.brand_string)"
  fi
  printf 'Tau checkout: %s\nTau commit: %s (%s)\nWork directory: %s\n' "$REPO_ROOT" "$sha" "$ref" "$WORK"
  printf 'node %s, pnpm %s, git %s\n' "$(node --version)" "$(pnpm --version)" "$(git --version)"
  say "Checking viewer parity of Tau ${sha:0:10} against its installed nanoraster on the $mode profile"
  say '(about 30 minutes on an Apple Silicon Mac; leave the Chromium windows alone)'

  # --- 1. Tau worktree ------------------------------------------------------------------------------------------
  local tau="$WORK/tau"
  step 'Tau worktree' git -C "$REPO_ROOT" -c core.hooksPath=/dev/null worktree add --detach "$tau" "$sha"
  WORKTREE_ADMIN=$(git -C "$tau" rev-parse --absolute-git-dir)
  cd "$tau"

  # --- 2. Dependencies and Chromium -------------------------------------------------------------------------------
  step 'Tau dependencies (pnpm install)' pnpm install --frozen-lockfile
  if [[ -n ${PARITY_CHROMIUM:-} ]]; then
    printf 'Chromium: %s (PARITY_CHROMIUM)\n' "$PARITY_CHROMIUM"
  else
    step "Playwright's Chromium" pnpm exec playwright install chromium
  fi

  local nanoraster_version
  nanoraster_version=$(cd packages/plugins/image && node -p 'require("nanoraster/package.json").version') ||
    die 2 '@taucad/image has no installed nanoraster'
  printf 'nanoraster: %s (installed package)\n' "$nanoraster_version"
  say "  nanoraster $nanoraster_version"

  # --- 3. Fixtures --------------------------------------------------------------------------------------------------
  local manifest="$tau/libs/tau-examples/fixtures/viewer-parity/fixtures.json" sources=''
  write_checks "$WORK/checks.cjs"
  if [[ -n $fixtures ]]; then
    sources=$(node "$WORK/checks.cjs" sources "$manifest" "$fixtures") || die 1 '--fixtures names unknown fixtures'
  fi
  if [[ -z $fixtures ]]; then
    step 'Fixture GLBs from tau-examples source' \
      pnpm exec tsx libs/tau-examples/scripts/export-parity-fixtures.mts --out="$PARITY_FIXTURES_OUT"
  elif [[ -n $sources ]]; then
    step 'Fixture GLBs from tau-examples source' \
      pnpm exec tsx libs/tau-examples/scripts/export-parity-fixtures.mts --out="$PARITY_FIXTURES_OUT" --only="$sources"
  fi

  # --- 4. Viewer references -----------------------------------------------------------------------------------------
  if [[ $mode == software ]]; then
    # CI's viewer job: SwiftShader WebGPU presents only headed, under Xvfb.
    PARITY_HEADED=1 step "Viewer references ($mode GPU)" \
      xvfb-run -a -s '-screen 0 1280x1024x24' pnpm nx run viewer:capture:viewer-parity
  elif [[ $headless == 1 ]]; then
    PARITY_HEADED=0 step "Viewer references ($mode GPU, headless Chromium)" nx_run viewer:capture:viewer-parity
  else
    PARITY_HEADED=1 step "Viewer references ($mode GPU, headed Chromium)" nx_run viewer:capture:viewer-parity
  fi
  local viewer_adapter
  viewer_adapter=$(node "$WORK/checks.cjs" references "$tau/$PARITY_VIEWER_OUT" "$mode") ||
    die 1 'the viewer references are not real-GPU WebGPU frames (PROBLEM lines in the log)'
  say "  viewer: WebGPU on $viewer_adapter"

  # --- 5. Gate ------------------------------------------------------------------------------------------------------
  local gate_status=0 gate_started=$SECONDS
  say "→ Parity gate (nanoraster native and WASM on the $mode GPU)"
  printf '\n=== Parity gate (%s)\n' "$(date -u +%H:%M:%SZ)"
  if [[ $mode == software ]]; then
    # CI's gate job: native on lavapipe, WASM in headless Chromium on SwiftShader.
    VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/lvp_icd.json nx_run tau-examples:test:viewer-parity || gate_status=$?
  elif [[ $headless == 1 ]]; then
    PARITY_HEADED=0 nx_run tau-examples:test:viewer-parity || gate_status=$?
  else
    PARITY_HEADED=1 nx_run tau-examples:test:viewer-parity || gate_status=$?
  fi
  printf '=== Parity gate exited %s after %ss\n' "$gate_status" "$((SECONDS - gate_started))"

  # --- 6. Summary -----------------------------------------------------------------------------------------------
  local results="$tau/$PARITY_OUT/results.json"
  [[ -f $results ]] || die 2 "the parity gate wrote no results (exit $gate_status)"
  printf '\n=== results.json\n'
  cat "$results"
  local total summary verdict=0
  total=$(node "$WORK/checks.cjs" total "$manifest" "$fixtures") || die 2 'could not count the fixtures'
  summary=$(node "$WORK/checks.cjs" summary "$results" "$total" "$mode") || verdict=$?
  [[ -n $summary ]] || die 2 'could not read the parity results'
  printf '%s\nGate exit %s, verdict %s, %ss in all\n' "$summary" "$gate_status" "$verdict" "$SECONDS"
  if [[ $KEEP == 1 ]]; then
    say "Work directory kept: $WORK"
  fi
  say "Log: $LOG"
  printf '%s\n' "$summary" >&3
  if [[ $verdict != 0 || $gate_status != 0 ]]; then
    exit 1
  fi
}

main ${1+"$@"}
