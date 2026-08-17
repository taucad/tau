---
name: package-release
description: Manage versioning, building, and publishing of @taucad npm packages using Nx Release. Use when releasing packages, bumping versions, creating version plans, publishing to npm, setting up CI publishing workflows, or when the user mentions releasing, publishing, versioning, or changelogs.
disable-model-invocation: true
---

# Package Release Management

Release workflow for Tau npm packages using Nx Release with Version Plans, pnpm, and npm Trusted Publishing. Treat this skill as the operator workflow; do not treat it as the package inventory.

## Source Of Truth

| Fact                              | Owner                                         |
| --------------------------------- | --------------------------------------------- |
| Package scope and publish classes | `docs/policy/release-policy.md`               |
| Resolved Nx release graph         | `pnpm nx release --printConfig` and `nx.json` |
| CI publish sequence               | `.github/workflows/publish.yml`               |
| Package quality rules             | `docs/policy/npm-policy.md`                   |
| Version semantics                 | `docs/policy/version-policy.md`               |

Current model, in brief:

- Packages in the release group use fixed versioning.
- Published packages are listed in `docs/policy/release-policy.md`.
- Bundled internal libraries stay in the fixed version group but are not published independently.
- `@taucad/fs-client` is private and outside the release group.

When release config matters, inspect the resolved Nx config instead of copying package scope from memory:

```bash
pnpm nx release --printConfig
```

Then compare with `nx.json` if the output looks surprising. The resolved config is the result of Nx merging `nx.json` and any programmatic release configuration.

## Quick Reference

```bash
# Create a version plan (tracks desired bump alongside your code change)
pnpm nx release plan

# Check version plans exist for changed projects (CI gate)
pnpm nx release plan:check

# Preview a release (always do this first)
pnpm nx release --dry-run

# Prepare the release locally; CI publishes from the tag
pnpm nx release --skip-publish

# Inspect the resolved release config
pnpm nx release --printConfig
```

Mirror the current CI validation gates before publishing:

```bash
pnpm registry:check
pnpm nx run-many -t build --projects=packages/*,packages/kernels/*,events,filesystem,fs-bridge,gltf-extensions,memory,utils,vm
pnpm nx run-many -t pkgcheck --projects=packages/*,packages/kernels/*
```

## Normal Release Workflow

1. Create a version plan for changes that affect the release group:

```bash
pnpm nx release plan
```

This creates a Markdown file in `.nx/version-plans/` with frontmatter specifying the bump type:

```markdown
---
runtime: minor
---

Add runtime export support
```

Valid bump types: `major`, `minor`, `patch`, `premajor`, `preminor`, `prepatch`, `prerelease`.

2. Commit the version plan with the code change and let CI run `pnpm nx release plan:check`.
3. After merge, preview the release:

```bash
pnpm nx release --dry-run
```

4. Prepare versions, changelogs, the release commit, and the tag locally:

```bash
pnpm nx release --skip-publish
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
pnpm registry:check
pnpm nx run-many -t build --projects=packages/*,packages/kernels/*,events,filesystem,fs-bridge,gltf-extensions,memory,utils,vm
pnpm nx run-many -t pkgcheck --projects=packages/*,packages/kernels/*
pnpm nx release publish --exclude=events,filesystem,fs-bridge,gltf-extensions,memory,utils,vm
```

The job uses npm Trusted Publishing through GitHub OIDC and sets `NPM_CONFIG_PROVENANCE=true`.

If the command list above disagrees with `.github/workflows/publish.yml`, the workflow file wins and this skill is stale.

## Validation And Tarball Inspection

Before publishing, run the same release gates as CI:

```bash
pnpm registry:check
pnpm nx run-many -t build --projects=packages/*,packages/kernels/*,events,filesystem,fs-bridge,gltf-extensions,memory,utils,vm
pnpm nx run-many -t pkgcheck --projects=packages/*,packages/kernels/*
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

| Problem                                             | Solution                                                                                                                |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `pnpm registry:check` fails                         | A runtime production dependency does not resolve from npm. Publish or replace that dependency before continuing.        |
| Publish tries to publish a bundled internal library | Check `.github/workflows/publish.yml` publish exclusions and `docs/policy/release-policy.md` bundled-library list.      |
| Release config looks stale                          | Run `pnpm nx release --printConfig`, then compare with `nx.json`; update this skill only after the source files change. |
| `npm ERR! 403` on publish                           | Trusted Publisher is missing for the package, or the npm workflow filename/repository does not match exactly.           |
| Package validation fails                            | Run the failing package's `pkgcheck` target and fix the npm-policy violation before release.                            |
| Build fails before version                          | Run the build command from `.github/workflows/publish.yml` locally and fix the first failing project.                   |
| Provenance not generated                            | Ensure the workflow has `id-token: write` and `NPM_CONFIG_PROVENANCE=true`.                                             |
| Stale lockfile after version                        | Run `pnpm install --no-frozen-lockfile` and commit the lockfile update.                                                 |

## References

- [Release policy and rationale](../../../docs/policy/release-policy.md)
- [npm package policy](../../../docs/policy/npm-policy.md)
- [Version policy](../../../docs/policy/version-policy.md)
- [Nx Release docs](https://nx.dev/features/manage-releases)
- [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers)
- [npm Provenance](https://docs.npmjs.com/generating-provenance-statements)
