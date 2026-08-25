---
name: package-release
description: Manage versioning, building, and publishing of @taucad npm packages using Nx Release. Use when releasing packages, bumping versions, creating version plans, publishing to npm, setting up CI publishing workflows, or when the user mentions releasing, publishing, versioning, or changelogs.
disable-model-invocation: true
---

# Package Release Management

Release workflow for Tau npm packages using Nx Release with Version Plans, pnpm, and npm Trusted Publishing. Treat this skill as the operator workflow; do not treat it as the package inventory.

## Source Of Truth

| Fact                              | Owner                                                                        |
| --------------------------------- | ---------------------------------------------------------------------------- |
| Package scope and publish classes | `docs/policy/release-policy.md`                                              |
| Resolved Nx release graph         | `NX_DAEMON=false ./node_modules/.bin/nx release --printConfig` and `nx.json` |
| CI publish sequence               | `.github/workflows/publish.yml`                                              |
| Package quality rules             | `docs/policy/npm-policy.md`                                                  |
| Version semantics                 | `docs/policy/version-policy.md`                                              |

Current model, in brief:

- Packages in the release group use fixed versioning.
- Published packages are listed in `docs/policy/release-policy.md`.
- Bundled internal libraries stay in the fixed version group but are not published independently.
- `@taucad/fs-client` is private and outside the release group.

When release config matters, inspect the resolved Nx config instead of copying package scope from memory:

```bash
NX_DAEMON=false ./node_modules/.bin/nx release --printConfig
```

Then compare with `nx.json` if the output looks surprising. The resolved config is the result of Nx merging `nx.json` and any programmatic release configuration.

## Quick Reference

```bash
# Create a version plan (tracks desired bump alongside your code change)
NX_DAEMON=false ./node_modules/.bin/nx release plan

# Check version plans exist for changed projects (CI gate)
NX_DAEMON=false ./node_modules/.bin/nx release plan:check

# Preview a release (always do this first)
NX_DAEMON=false ./node_modules/.bin/nx release --dry-run

# Prepare the release locally; CI publishes from the tag
NX_DAEMON=false ./node_modules/.bin/nx release --skip-publish

# Inspect the resolved release config
NX_DAEMON=false ./node_modules/.bin/nx release --printConfig
```

Mirror the current CI validation gates before publishing:

```bash
NX_DAEMON=false ./node_modules/.bin/nx run scripts:release-gate
```

`release-gate` (`scripts/project.json`) fans out to every `scripts:validate-*` and `scripts:check-*` target plus `pkgcheck` on `tag:type:package` and `test`/`typecheck`/`lint` on `tag:type:package` and `tag:type:lib`, then `audit-public-surface` and `readme-quickstart` workspace-wide. Selectors are Nx targets and tags — never project path globs.

## Normal Release Workflow

1. Create a version plan for changes that affect the release group:

```bash
NX_DAEMON=false ./node_modules/.bin/nx release plan
```

This creates a Markdown file in `.nx/version-plans/` with frontmatter specifying the bump type:

```markdown
---
runtime: minor
---

Add runtime export support
```

Valid bump types: `major`, `minor`, `patch`, `premajor`, `preminor`, `prepatch`, `prerelease`.

2. Commit the version plan with the code change and let CI run `NX_DAEMON=false ./node_modules/.bin/nx release plan:check`.
3. After merge, preview the release:

```bash
NX_DAEMON=false ./node_modules/.bin/nx release --dry-run
```

4. Prepare versions, changelogs, the release commit, and the tag locally:

```bash
NX_DAEMON=false ./node_modules/.bin/nx release --skip-publish
```

This will:

- Apply version plans to bump package versions
- Update inter-package workspace dependencies
- Generate or update changelogs
- Delete applied version plan files
- Commit changes and create a git tag using the configured `v{version}` pattern

5. Push the tag. GitHub Actions publishes from CI with Trusted Publishing.

Do not publish manually from a developer machine unless the operator explicitly asks for a local-publish exception. `docs/policy/release-policy.md` owns the CI-only publishing rule.

## CI Publish Workflow

The publish workflow lives in `.github/workflows/publish.yml` and currently runs:

```bash
pnpm nx run scripts:release-gate
pnpm nx release publish --dry-run --tag=beta
pnpm nx release publish --tag=beta
```

There is no `--exclude` list. Nx synthesises `nx-release-publish` for every publishable project with `dependsOn: ['^nx-release-publish', 'pkgcheck']` (the second from `nx.json` `targetDefaults`), so one command orders the whole fixed group, gates each package on its own `pkgcheck`, and skips the dependents of a failed publish. The workflow also asserts pnpm is the publisher, because only pnpm applies `publishConfig` field overrides.

The job uses npm Trusted Publishing through GitHub OIDC and sets `NPM_CONFIG_PROVENANCE=true`.

If the command list above disagrees with `.github/workflows/publish.yml`, the workflow file wins and this skill is stale.

## Validation And Tarball Inspection

Before publishing, run the same release gate as CI:

```bash
NX_DAEMON=false ./node_modules/.bin/nx run scripts:release-gate
```

For a local tarball spot-check, inspect the exact filename returned by `pnpm pack`:

```bash
cd packages/runtime
pack_file=$(
  pnpm pack --pack-destination /tmp --json |
    node -e "let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>{const data=JSON.parse(s);console.log((Array.isArray(data)?data[0]:data).filename)})"
)
tar -tzf "$pack_file"
```

Use `docs/policy/npm-policy.md` for package manifest, export-map, bundling, publint, Are the Types Wrong, circular-dependency, and size-limit rules.

## Trusted Publishing Setup

For each package listed as published in `docs/policy/release-policy.md`, configure npm Trusted Publishing on npmjs.com:

1. Go to Settings -> Trusted Publisher
2. Add GitHub Actions publisher:
   - Repository: `taucad/tau`
   - Workflow: `publish.yml`
   - Environment: leave blank unless the workflow later adds one

Read the live package list from the release policy at execution time. Do not maintain a copied bulk command in this skill.

## Troubleshooting

| Problem                                             | Solution                                                                                                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm registry:check` fails                         | A runtime production dependency does not resolve from npm. Publish or replace that dependency before continuing.                                       |
| Publish tries to publish a bundled internal library | The project is publishable by placement. Check `nx.json` release `projects` and the `docs/policy/release-policy.md` bundled-library list.              |
| Release config looks stale                          | Run `NX_DAEMON=false ./node_modules/.bin/nx release --printConfig`, then compare with `nx.json`; update this skill only after the source files change. |
| `npm ERR! 403` on publish                           | Trusted Publisher is missing for the package, or the npm workflow filename/repository does not match exactly.                                          |
| Package validation fails                            | Run the failing package's `pkgcheck` target and fix the npm-policy violation before release.                                                           |
| Build fails before version                          | Run `NX_DAEMON=false ./node_modules/.bin/nx run scripts:release-gate` locally and fix the first failing project.                                       |
| Provenance not generated                            | Ensure the workflow has `id-token: write` and `NPM_CONFIG_PROVENANCE=true`.                                                                            |
| Stale lockfile after version                        | Run `pnpm install --no-frozen-lockfile` and commit the lockfile update.                                                                                |

## References

- [Release policy and rationale](../../../docs/policy/release-policy.md)
- [npm package policy](../../../docs/policy/npm-policy.md)
- [Version policy](../../../docs/policy/version-policy.md)
- [Nx Release docs](https://nx.dev/features/manage-releases)
- [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers)
- [npm Provenance](https://docs.npmjs.com/generating-provenance-statements)
