#!/usr/bin/env bash
# Run the real-GPU viewer smoke inside a disposable Google Cloud GPU host that already booted into the NVIDIA driver.
# The rows that make hardware claims (millisecond frame budgets, presented WebGPU, 2560 px and 5K pixel claims) run
# here on a real GPU; the software lane asserts work counts instead (closeout package W12, operator decision D2).
# Required files: ~/node (verified host runtime), ~/qualification-env.json (GITHUB_SHA and TAU_VM_MODE only).
# Optional env: none. Usage: invoked over SSH by hosted-linux-vm.sh in gpu-smoke mode.
# Exit codes: 0 every smoke target passed; nonzero missing prerequisite, install failure or a failed row.
set -euo pipefail
umask 022
export PATH="$HOME/node/bin:$PATH"
[[ "$(id -un)" == tau && "$(id -u)" != 0 && "$(cat /proc/1/comm)" == systemd ]]
mode="$(python3 -c 'import json,pathlib; print(json.loads((pathlib.Path.home()/"qualification-env.json").read_text())["TAU_VM_MODE"])')"
[[ "$mode" == gpu-smoke ]]
# The smoke proves nothing unless the browser sees the NVIDIA GPU, so a missing driver fails before any install.
nvidia-smi --query-gpu=name,driver_version --format=csv,noheader
sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  git curl ca-certificates python3 xvfb xauth libvulkan1 mesa-vulkan-drivers vulkan-tools
# Clone public source without credentials; only the checked main commit is admitted.
source_sha="$(python3 -c 'import json,pathlib; print(json.loads((pathlib.Path.home()/"qualification-env.json").read_text())["GITHUB_SHA"])')"
[[ "$source_sha" =~ ^[a-f0-9]{40}$ ]]
export GIT_LFS_SKIP_SMUDGE=1
git clone --no-checkout https://github.com/taucad/tau.git "$HOME/tau"
cd "$HOME/tau"
git fetch origin "$source_sha"
git checkout --detach "$source_sha"
[[ "$(git rev-parse HEAD)" == "$source_sha" ]]
corepack enable
for attempt in 1 2 3; do
  pnpm install --frozen-lockfile && break
  [[ "$attempt" -lt 3 ]] || exit 1
  echo "pnpm install attempt $attempt failed; retrying" >&2
  sleep $((attempt * 30))
done
pnpm exec playwright install chromium
sudo env "PATH=$PATH" "$PWD/node_modules/.bin/playwright" install-deps chromium
# Which Vulkan device the browser will be offered, for the record: the NVIDIA device, never llvmpipe.
vulkaninfo --summary 2>/dev/null | grep -E 'deviceName|driverName' || true
# The hardware profile launches Chromium on the real adapter; every target fails loudly if it falls back.
export TAU_E2E_WEBGPU_PROFILE=hardware CI=true
xvfb-run --auto-servernum --server-args='-screen 0 2560x1440x24' \
  pnpm nx run-many -t test:e2e:webgpu --parallel=1 --outputStyle=stream
