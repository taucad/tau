# Public packages

Packages are independently publishable `@taucad/*` surfaces. Keep application capabilities out of this subtree. Follow the root `AGENTS.md`, `docs/policy/library-api-policy.md`, `docs/policy/typescript-policy.md`, and `docs/policy/npm-policy.md`.

## Boundaries

- Use explicit package-export subpaths and direct imports. Public examples and tests consume the published-shaped surface so missing exports fail locally.
- Put domain types and schemas in the package that owns them; consumers depend on that owner rather than making the owner depend on a consumer.
- Put reusable black-box runtime and plugin-author tests in `@taucad/runtime-testing`; keep owner-internal white-box fixtures private.
- Runtime work routes to `packages/runtime/AGENTS.md`; plugins and kernels to `packages/plugins/AGENTS.md`; portable agent execution to `packages/agent-host/AGENTS.md`.
- GeoSpec contracts route to `docs/policy/geospec-policy.md`. Public matchers live in `packages/geospec`; evidence production and native geometry live in `packages/geospec-engine`.
- Add package dependencies with pnpm in the package that consumes them and review the manifest/lockfile diff. Do not use a deleted package as a dependency-placement example.

Inspect `pnpm nx show project <project>` and run every declared lint, test, typecheck, build, package, and public-surface check relevant to the change.
