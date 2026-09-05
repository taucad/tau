# Workspace tooling instructions

## Generators

Read [workspace-project policy](../docs/policy/workspace-project-policy.md) and the relevant creation skill before changing the workspace generators. `tools/workspace-plugin` owns package, core, plugin, machine and lint-rule generation. Question manual additions that the owning generator should produce consistently.

Project creators share the instruction starter pair and preserve authored AGENTS/CLAUDE bytes. Use the actual normalized Nx project name, selected build mode, capability/host and package entrypoints. Test every affected creator and collision path; machine/lint-rule additions must not rewrite project instructions. Follow [AGENTS policy](../docs/policy/agents-md-policy.md) for native discovery and budgets. Do not add a separate agent provisioning layer.

## Workspace tooling and build outputs

Use `pnpm nx show project <name> --json` for inferred targets and dependencies. Run tasks through Nx. Lightweight docs/preview/development tasks must not depend on expensive native/WASM rebuilds; serve the available artifact and make required rebuilds explicit.

Use inherited tsdown outputs rather than project overrides naming absent directories. Keep generated API reports and build output outside authored formatting/lint inputs. Fix the source tsconfig or generated target owner instead of patching downstream output.

For builds that require native Node TypeScript loading, set `NX_PREFER_NODE_STRIP_TYPES=true` in the build command: Nx reads it before dotenv. For a specific plugin timeout diagnosis, inspect the failing plugin and use `NX_PLUGIN_NO_TIMEOUTS=true` with optional `NX_DAEMON=false`/`NX_VERBOSE_LOGGING=true`; do not bake diagnostic overrides into normal configuration or reset another active task's daemon.

## Lint and type ownership

[Lint policy](../docs/policy/lint-policy.md) owns the oxlint-first/ESLint residual split. Custom rules live in `libs/oxlint`; inspect their current registration and tests. Files must belong to the intended tsconfig before trusting type-aware lint results. Keep one path-alias convention per project and verify isolated declarations at the public package boundary.

Use [testing policy](../docs/policy/testing-policy.md) for semantic generator and tooling checks. An ordinary passing test run does not exercise coverage thresholds; request coverage when validating those thresholds. Runtime project-reference checks belong to `scripts:validate-tsgo-runtime-references`.
