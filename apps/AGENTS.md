# Applications

This subtree contains deployable applications and private application capabilities. Read the nearest nested `AGENTS.md` before changing an app or `apps/libs` project.

## Boundaries

- Keep deployable composition in `apps/api`, `apps/ui`, and `apps/docs`. Put reusable public runtime code in `packages/**`; put private app capabilities in `apps/libs/**`.
- Treat `apps/libs/**` projects as source-consumed libraries. Respect their Nx `scope:*` and `layer:*` tags, and do not import another app through an app alias.
- Keep shared chat wire types in `libs/chat`, filesystem authority in `packages/filesystem`, and portable CAD execution in `packages/agent-host`. Applications compose those owners rather than duplicating their contracts.
- Follow [Workspace Project Policy](../docs/policy/workspace-project-policy.md), [Library API Policy](../docs/policy/library-api-policy.md), and the more specific policy named by a child entrypoint.

## Checks

Run Nx targets with the actual project name from `project.json`; use `pnpm nx show project <name>` when the name or target is uncertain. Limit checks to affected projects unless a cross-application contract changed.

## Local desktop acceptance testing

- For local macOS acceptance testing, default to `pnpm nx run desktop:package-macos:local` (`desktop:package-macos-intel:local` on Intel). Use `desktop:dev:local` or `desktop:serve:local` for development launches. These modes use Apple Development signing to preserve Keychain trust across rebuilds while keeping debugging and local overrides available.
- The local configurations auto-select a single installed Apple Development certificate. If selection is ambiguous, use the base target with `TAU_LOCAL_CODESIGN_IDENTITY` set to the intended certificate's exact name or fingerprint and, for packaging, `TAU_DESKTOP_CHANNEL=staging`. If no usable certificate exists, report that prerequisite; do not silently fall back to ad-hoc or unsigned signing.
- Launch acceptance packages with `TAU_DESKTOP_UPDATES=off` and an explicit disposable `--user-data-dir` when isolated test state is needed. Keep the same signing identity across rebuilds; a first Keychain authorization may still require the user's **Always Allow**.
- Use release signing only when testing release behavior. CI or an explicitly requested unsigned/ad-hoc scenario may retain its existing mode; those exceptions do not change the default for local acceptance testing.
