# Script templates — copy-pastable

Three canonical templates. Pick one based on the [SKILL.md location decision tree](SKILL.md).

## 1. Workspace bash (`scripts/<name>.sh`)

For workspace-wide one-shot operator/release tools. Cloud ops, release triggers, smoke tests.

```bash
#!/usr/bin/env bash
#
# <One-line purpose.>
#
# <Why-context. Link to docs/research/<doc>.md or the PR that motivated this.>
#
# Required env vars:
#   API_URL    Base URL of the target service.
# Optional env vars:
#   TIMEOUT    Curl timeout in seconds (default: 10).
#
# Usage:
#   API_URL=https://api.tau.new ./scripts/<name>.sh
#
# Exit codes:
#   0  Success
#   1  Validation failure
#   2  Network failure
#   3  Missing dependency

set -euo pipefail

: "${API_URL:?set API_URL}"
TIMEOUT="${TIMEOUT:-10}"
API_URL="${API_URL%/}"

command -v curl >/dev/null || { echo "ERROR: curl required" >&2; exit 3; }

REPO_ROOT="$(git rev-parse --show-toplevel)"

echo "→ Probing ${API_URL}"
response="$(curl -sS --max-time "${TIMEOUT}" "${API_URL}/health")" || {
  echo "ERROR: curl failed" >&2
  exit 2
}

[[ "$response" == *"ok"* ]] || {
  echo "ERROR: unexpected response: $response" >&2
  exit 1
}

echo "✓ ${API_URL} is healthy"
```

After creating: `chmod +x scripts/<name>.sh`.

## 2. Per-project bash (`apps/<app>/scripts/<name>.sh`)

For build-output assertions, deploy hooks, project-local ops. Same template — the only difference is `REPO_ROOT` resolution (still `git rev-parse`).

```bash
#!/usr/bin/env bash
#
# Sync <thing> from infra/<source>/ to the target instance.
#
# Idempotent — safe to rerun.
#
# Optional env vars:
#   TARGET_URL   Base URL (default: http://localhost:6100).
#   API_KEY      Bearer token; falls back to local dev creds.
#
# Usage:
#   ./apps/<app>/scripts/<name>.sh
#   TARGET_URL=https://prod.example.com API_KEY=... ./apps/<app>/scripts/<name>.sh

set -euo pipefail

TARGET_URL="${TARGET_URL:-http://localhost:6100}"
TARGET_URL="${TARGET_URL%/}"

if [[ -n "${API_KEY:-}" ]]; then
  AUTH_HEADER="Authorization: Bearer ${API_KEY}"
else
  AUTH_HEADER="Authorization: Basic $(printf 'admin:admin' | base64)"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git rev-parse --show-toplevel)"
SOURCE_DIR="${REPO_ROOT}/infra/<source>"

count=0
for f in "${SOURCE_DIR}"/*.json; do
  [[ -f "$f" ]] || continue
  echo "→ Pushing $(basename "$f")"
  curl -sS -X PUT "${TARGET_URL}/api/<endpoint>" \
    -H "${AUTH_HEADER}" \
    -H 'Content-Type: application/json' \
    --data-binary "@${f}" >/dev/null
  count=$((count + 1))
done

echo "✓ Synced ${count} files to ${TARGET_URL}"
```

## 3. TypeScript Nx target (`scripts/src/<name>.ts`)

For workspace-wide CI gates that run under `pnpm nx run scripts:<name>`. Use `zod` for input parsing.

```ts
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';

import { z } from 'zod';

const repoRoot = resolve(import.meta.dirname, '../..');
const targetDirectory = join(repoRoot, 'apps');

const projectSchema = z.object({
  name: z.string().min(1),
  projectType: z.enum(['application', 'library']),
  tags: z.array(z.string()).optional(),
});

type Diagnostic = { path: string; message: string };

const collectProjects = (root: string): string[] =>
  readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => join(root, d.name, 'project.json'));

const validateOne = (path: string): Diagnostic | null => {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return null;
  }
  const parsed = projectSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    return { path, message: parsed.error.message };
  }
  return null;
};

const main = (): void => {
  const diagnostics = collectProjects(targetDirectory)
    .map(validateOne)
    .filter((d): d is Diagnostic => d !== null);

  for (const { path, message } of diagnostics) {
    console.error(`ERROR ${path}: ${message}`);
  }

  if (diagnostics.length > 0) {
    process.exit(1);
  }
  console.log(`✓ Validated ${collectProjects(targetDirectory).length} projects`);
};

try {
  main();
} catch (error) {
  console.error('script failed:', error);
  process.exit(1);
}
```

Then add to `scripts/project.json`:

```jsonc
"targets": {
  "validate-<thing>": {
    "executor": "nx:run-commands",
    "options": { "command": "node scripts/src/validate-<thing>.ts" }
  }
}
```

Invoke: `pnpm nx run scripts:validate-<thing>`.
