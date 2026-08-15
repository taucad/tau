#!/usr/bin/env bash
# Validate first-party Markdown and MDX with the checksum-pinned Vale binary.

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"

"$script_dir/install-ci-tool.sh" --tool vale --dest "$repo_root/.ci-tools"

cd "$repo_root"
rg --files -0 \
  -g '*.md' \
  -g '*.mdx' \
  -g '!node_modules/**' \
  -g '!.nx/**' \
  -g '!rust/target/**' \
  -g '!rust/vendor/**' \
  | xargs -0 .ci-tools/bin/vale --config=.vale.ini

pnpm exec vitest run prose-quality.test.ts readme-shape.test.ts
