#!/usr/bin/env bash
# Validate first-party Markdown and MDX with the checksum-pinned Vale binary.

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"

"$script_dir/install-ci-tool.sh" --tool vale --dest "$repo_root/.ci-tools"

cd "$repo_root"
prose_files=()
while IFS= read -r -d '' file; do
  [[ -f "$file" ]] && prose_files+=("$file")
done < <(
  git ls-files -z \
    '*.md' \
    '*.mdx' \
    ':!rust/vendor/**'
)

.ci-tools/bin/vale --config=.vale.ini "${prose_files[@]}"

pnpm exec vitest run prose-quality.test.ts readme-shape.test.ts
