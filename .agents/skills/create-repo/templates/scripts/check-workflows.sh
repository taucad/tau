#!/usr/bin/env bash
# Validate GitHub Actions and first-party shell scripts with pinned actionlint.

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"

"$script_dir/install-ci-tool.sh" --tool actionlint --dest "$repo_root/.ci-tools"

cd "$repo_root"
.ci-tools/bin/actionlint -shellcheck shellcheck -color
rg --files -0 -g '*.sh' -g '!rust/vendor/**' | xargs -0 shellcheck
