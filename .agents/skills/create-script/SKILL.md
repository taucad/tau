---
name: create-script
description: Author a workspace script in the Tau monorepo following established conventions for bash and TypeScript scripts (shebang, set -euo pipefail, header comment template, env-var validation, REPO_ROOT pattern, location decision tree, chmod, Nx wiring). Use when creating a new script under scripts/, apps/*/scripts/, packages/*/scripts/, or a skill-bundled script, or when the user asks to add a script, helper, CLI tool, smoke test, release helper, or operator runbook.
disable-model-invocation: true
---

# Create a workspace script

Conventions for bash and TypeScript scripts in the Tau monorepo. Pick the right location, copy the template, fill in the header, `chmod +x`, done.

## Quick decision: where does it live?

| Script scope                                    | Location                                                                                            | Canonical example                                                                                                                                                                                  |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace-wide operator / release tool (bash)   | `scripts/<name>.sh`                                                                                 | [scripts/seed-r2-defaults.sh](../../scripts/seed-r2-defaults.sh), [scripts/release-ocjs-image.sh](../../scripts/release-ocjs-image.sh)                                                             |
| Workspace-wide CLI exposed as an Nx target (TS) | `scripts/src/<name>.ts` + entry in `scripts/project.json`                                           | [scripts/src/validate-frontmatter.ts](../../scripts/src/validate-frontmatter.ts)                                                                                                                   |
| Workspace-wide installable bin (TS)             | `scripts/src/<name>/` directory + `bin` field in [scripts/package.json](../../scripts/package.json) | `scripts/src/repos/`                                                                                                                                                                               |
| Per-project ops (bash or TS)                    | `apps/<app>/scripts/` or `packages/<pkg>/scripts/`                                                  | [apps/api/scripts/sync-grafana-dashboards.sh](../../apps/api/scripts/sync-grafana-dashboards.sh), [apps/ui/scripts/check-ssr-bundle-budget.mts](../../apps/ui/scripts/check-ssr-bundle-budget.mts) |
| Skill-internal (only invoked by one skill)      | `.agent/skills/<skill>/scripts/`                                                                    | `.agent/skills/pr-review-coordinator/scripts/fetch-pr-comments.sh`                                                                                                                                 |

**Rule of thumb:** workspace-wide one-shot ops → `scripts/`; gated CI checks → `scripts/src/` + Nx target; build-output assertions → next to the thing they assert about (`apps/<app>/scripts/`).

## Bash template

Copy this for every new `*.sh` and fill in the header. The header is non-optional — it is the script's contract.

```bash
#!/usr/bin/env bash
#
# <One-line purpose.>
#
# <Why-context: link to research doc or PR if applicable.>
#
# Required env vars:
#   FOO   <description>
# Optional env vars:
#   BAR   <description> (default: <value>)
#
# Usage:
#   <example invocation>
#
# Exit codes:
#   0  Success
#   1  Validation failure (bad args, wrong state)
#   2  Network / external failure
#   3  Missing dependency

set -euo pipefail

: "${FOO:?set FOO}"
BAR="${BAR:-default}"

command -v gh >/dev/null || { echo "ERROR: gh CLI required" >&2; exit 3; }

REPO_ROOT="$(git rev-parse --show-toplevel)"

# ...work here...

echo "✓ done"
```

See [examples.md](examples.md) for full copy-pastable templates (workspace bash, per-project bash, TS Nx target).

## TypeScript template

Use plain `.ts` for workspace `scripts/src/` (Nx-managed) and `.mts` for per-project scripts that need an explicit ESM marker. Both run under Node 22+ with native TS support (via `nx`'s `node` invocation or `NX_PREFER_NODE_STRIP_TYPES=true`).

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const repoRoot = resolve(import.meta.dirname, '../..');

const main = (): void => {
  // ...
};

try {
  main();
} catch (error) {
  console.error('script failed:', error);
  process.exit(1);
}
```

**Node native APIs only** for `scripts/` unless a dep already lives in `scripts/package.json`. If you need YAML/zod/etc., add to `scripts/package.json` first.

## Conventions checklist (bash)

- [ ] `#!/usr/bin/env bash` shebang (never `/bin/bash`)
- [ ] Header block: purpose, why-context, env vars (required + optional), usage, exit codes
- [ ] `set -euo pipefail` immediately after the header
- [ ] Required env vars validated with `: "${VAR:?msg}"` or explicit `if [[ -z ]]` + non-zero exit
- [ ] Optional env vars use `${VAR:-default}`
- [ ] Paths anchored via `REPO_ROOT="$(git rev-parse --show-toplevel)"` (never `cd $(dirname $0)/..` unguarded)
- [ ] Errors go to stderr (`>&2`); progress to stdout
- [ ] Strip trailing slashes from URL inputs (`${URL%/}`)
- [ ] Use `printf '%s\n'` over `echo -e` for portability
- [ ] `chmod +x` the file after creation
- [ ] Idempotent where possible — rerun must be safe (or fail loudly)
- [ ] Status output uses `→` (in-progress) and `✓` (success) markers; no emoji elsewhere

## Conventions checklist (TypeScript)

- [ ] Use `node:` prefix for built-in imports (`node:fs`, `node:path`, `node:process`)
- [ ] Resolve paths via `import.meta.dirname` (Node 22+ native)
- [ ] Exit with `process.exit(N)` on failure; never throw uncaught
- [ ] No top-level `await` of long-running ops without a `main()` wrapper + try/catch
- [ ] Prefer `zod` for input parsing if already a dep; otherwise hand-rolled validation
- [ ] One file per script; extract helpers only when shared across scripts

## Wiring a TS script as an Nx target

For workspace-wide CI gates, add to [scripts/project.json](../../scripts/project.json):

```jsonc
"targets": {
  "validate-<thing>": {
    "executor": "nx:run-commands",
    "options": { "command": "node scripts/src/validate-<thing>.ts" }
  }
}
```

Then invoke as `pnpm nx run scripts:validate-<thing>`.

## Anti-patterns

| Smell                                                 | Why it bites                                      | Fix                                                                       |
| ----------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------- |
| `set -e` alone                                        | Doesn't catch unset vars or piped failures        | Use `set -euo pipefail`                                                   |
| No header block                                       | Script becomes mystery meat after 3 months        | Always include purpose + env vars + usage + exit codes                    |
| Hard-coded absolute paths (`/Users/...`, `/home/...`) | Breaks on every other machine                     | Use `REPO_ROOT="$(git rev-parse --show-toplevel)"`                        |
| `cd $(dirname $0)/..` without quotes                  | Breaks on paths with spaces                       | Quote: `cd "$(dirname "${BASH_SOURCE[0]}")/.."` — or just use `REPO_ROOT` |
| `echo "$VAR"` for required vars without check         | Silent empty-string propagation                   | Validate with `: "${VAR:?msg}"`                                           |
| `echo -e` for ANSI/escapes                            | Not portable to all `sh` impls                    | Use `printf '%s\n'`                                                       |
| Forgotten `chmod +x`                                  | Script fails with "permission denied"             | Run `chmod +x` at creation time                                           |
| Emoji in output                                       | Inconsistent terminal rendering, breaks log greps | Stick to `→` / `✓` ASCII-only markers                                     |
| Adding npm deps inline at top of `.mts`               | Lockfile drift, not installed in CI               | Add to relevant `package.json` first                                      |

## Additional Resources

- [examples.md](examples.md) — three full copy-pastable templates
- [scripts/release-ocjs-image.sh](../../scripts/release-ocjs-image.sh) — canonical workspace bash example (validation + gh CLI orchestration)
- [scripts/seed-r2-defaults.sh](../../scripts/seed-r2-defaults.sh) — canonical workspace bash example (env-var-driven cloud ops)
- [apps/api/scripts/sync-grafana-dashboards.sh](../../apps/api/scripts/sync-grafana-dashboards.sh) — canonical per-project bash example (idempotent API sync)
- [scripts/src/validate-frontmatter.ts](../../scripts/src/validate-frontmatter.ts) — canonical TS Nx-target example (zod validation, file walking)
