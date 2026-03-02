---
name: package-release
description: Manage versioning, building, and publishing of @taucad npm packages using Nx Release. Use when releasing packages, bumping versions, creating version plans, publishing to npm, setting up CI publishing workflows, or when the user mentions releasing, publishing, versioning, or changelogs.
---

# Package Release Management

Release workflow for the `@taucad/*` npm packages using Nx Release with Version Plans, pnpm, and npm Trusted Publishing.

## Packages

| Package | Path | Description |
|---------|------|-------------|
| `@taucad/kernels` | `packages/kernels` | Multi-kernel CAD runtime |
| `@taucad/converter` | `packages/converter` | CAD file format conversion |
| `@taucad/json-schema` | `packages/json-schema` | JSON to JSON Schema |
| `@taucad/js` | `packages/js` | Tau JavaScript API |

All packages use fixed versioning (same version across all packages).

## Quick Reference

```bash
# Create a version plan (tracks desired bump alongside your code change)
pnpm nx release plan

# Check version plans exist for changed projects (CI gate)
pnpm nx release plan:check

# Preview a release (always do this first)
pnpm nx release --dry-run

# First ever release
pnpm nx release --first-release

# Release (version + changelog, skip publish for CI)
pnpm nx release --skip-publish

# Publish from CI
pnpm nx release publish

# Verify a package tarball locally
pnpm pack --pack-destination ./tmp
```

## Workflow

### 1. During Development: Create Version Plans

When making changes that affect published packages, create a version plan:

```bash
pnpm nx release plan
```

This creates a markdown file in `.nx/version-plans/` with frontmatter specifying the bump type:

```markdown
---
**default**: minor
---

Add support for USDZ export in converter
```

Valid bump types: `major`, `minor`, `patch`, `premajor`, `preminor`, `prepatch`, `prerelease`.

For multi-package changes, specify per-project:

```markdown
---
@taucad/kernels: minor
@taucad/converter: patch
---

Add new kernel middleware and fix converter edge case
```

Commit the version plan file alongside your code changes in the PR.

### 2. Release Locally

Preview changes:

```bash
pnpm nx release --dry-run
```

Execute (version bump + changelog generation, no publish):

```bash
pnpm nx release --skip-publish
```

This will:
- Apply version plans to bump `package.json` versions
- Update inter-package `workspace:*` dependencies
- Generate/update `CHANGELOG.md` files
- Delete applied version plan files
- Commit changes and create a git tag (`v{version}`)

### 3. Publish from CI

Push the release tag. The CI workflow triggers `nx release publish` with:
- npm Trusted Publishing (OIDC) -- no tokens stored
- Build provenance generated automatically via Sigstore
- Packages built via `preVersionCommand` before publish

## Nx Configuration

The release config in `nx.json`:

```jsonc
{
  "release": {
    "projects": ["packages/*"],
    "versionPlans": {
      "ignorePatternsForPlanCheck": ["**/*.spec.ts", "**/*.test.ts", "**/*.md"]
    },
    "version": {
      "preVersionCommand": "pnpm nx run-many -t build --projects=packages/*",
      "conventionalCommits": true
    },
    "changelog": {
      "workspaceChangelog": {
        "file": "CHANGELOG.md",
        "renderOptions": {
          "authors": true,
          "commitReferences": true,
          "versionTitleDate": true
        }
      },
      "projectChangelogs": {
        "file": "CHANGELOG.md",
        "renderOptions": {
          "authors": false,
          "commitReferences": true,
          "versionTitleDate": true
        }
      }
    },
    "releaseTag": {
      "pattern": "v{version}"
    },
    "git": {
      "commitMessage": "chore(release): v{version}"
    }
  }
}
```

## CI/CD Workflow

The publish workflow (`.github/workflows/publish.yml`):

```yaml
name: Publish Packages
on:
  push:
    tags: ['v*.*.*']

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write    # Required for OIDC / Trusted Publishing
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0

      - uses: ./.github/actions/setup-nx

      - name: Build packages
        run: pnpm nx run-many -t build --projects=packages/*

      - name: Publish to npm
        run: pnpm nx release publish
        env:
          NPM_CONFIG_PROVENANCE: true
```

### Trusted Publishing Setup

For each `@taucad/*` package on npmjs.com:
1. Go to Settings -> Trusted Publisher
2. Add GitHub Actions publisher:
   - Repository: `taucad/tau`
   - Workflow: `publish.yml`
   - Environment: _(leave blank or set to `npm`)_

Bulk configure with npm CLI v11.10.0+:

```bash
npm trust add --publisher github --repository taucad/tau --workflow publish.yml @taucad/kernels @taucad/converter @taucad/json-schema @taucad/js
```

## Package Validation

Before publishing, validate package structure:

```bash
# Run pkgcheck on all packages
pnpm nx run-many -t pkgcheck --projects=packages/*

# Inspect tarball contents
cd packages/kernels && pnpm pack --pack-destination /tmp && tar -tzf /tmp/taucad-kernels-*.tgz
```

Ensure each `package.json` has:
- `"private": false`
- `"repository"` field matching `github.com/taucad/tau`
- `"publishConfig.access": "public"`
- `"files": ["dist", "README.md"]`
- Correct `publishConfig.exports` with dual ESM/CJS entries

## Prerelease Workflow

For alpha/beta/rc releases:

```bash
# Create a prerelease version plan
# Use "prerelease" bump type in the version plan frontmatter

# Or specify directly:
pnpm nx release version --specifier prerelease --preid alpha
pnpm nx release publish --tag next
```

Published with `--tag next` so `npm install @taucad/kernels` still resolves to stable.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `npm ERR! 403` on publish | Trusted Publisher not configured for this package, or workflow filename mismatch (case-sensitive) |
| Version plan check fails in CI | Run `pnpm nx release plan` locally and commit the file |
| Build fails before version | Check `pnpm nx run-many -t build --projects=packages/*` locally |
| Provenance not generated | Ensure `id-token: write` permission and `NPM_CONFIG_PROVENANCE=true` |
| Stale lockfile after version | Run `pnpm install --no-frozen-lockfile` then commit |

## Additional Resources

- [Release policy and rationale](../../docs/policy/release-policy.md)
- [Nx Release docs](https://nx.dev/features/manage-releases)
- [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers)
- [npm Provenance](https://docs.npmjs.com/generating-provenance-statements)
