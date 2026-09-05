# Applications

This subtree contains deployable applications and private application capabilities. Read the nearest nested `AGENTS.md` before changing an app or `apps/libs` project.

## Boundaries

- Keep deployable composition in `apps/api`, `apps/ui`, and `apps/docs`. Put reusable public runtime code in `packages/**`; put private app capabilities in `apps/libs/**`.
- Treat `apps/libs/**` projects as source-consumed libraries. Respect their Nx `scope:*` and `layer:*` tags, and do not import another app through an app alias.
- Keep shared chat wire types in `libs/chat`, filesystem authority in `libs/filesystem`, and portable CAD execution in `packages/agent-host`. Applications compose those owners rather than duplicating their contracts.
- Follow [Workspace Project Policy](../docs/policy/workspace-project-policy.md), [Library API Policy](../docs/policy/library-api-policy.md), and the more specific policy named by a child entrypoint.

## Checks

Run Nx targets with the actual project name from `project.json`; use `pnpm nx show project <name>` when the name or target is uncertain. Limit checks to affected projects unless a cross-application contract changed.
