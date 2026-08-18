---
title: 'Release Policy'
description: 'Versioning, building, and publishing strategy for @taucad/* npm packages: Nx Release, version plans, tsdown, OIDC.'
status: active
created: '2026-02-27'
updated: '2026-08-17'
related:
  - docs/policy/version-policy.md
  - docs/policy/public-surface-policy.md
  - docs/policy/npm-policy.md
---

# Release Policy

This document defines the versioning, building, and publishing strategy for the `@taucad/*` npm packages.

## Rationale

Nx Release with version plans provides native monorepo integration and decouples version intent from commit messages. Fixed versioning across packages simplifies compatibility for consumers. npm Trusted Publishing (OIDC) and build provenance eliminate stored secrets and provide supply-chain transparency. CI-only publishing prevents accidental or unauthorized releases.

## Packages in Scope

| Package                  | Description                                             |
| ------------------------ | ------------------------------------------------------- |
| `@taucad/runtime`        | Multi-kernel CAD runtime for browser and Node.js        |
| `@taucad/cli`            | Headless CAD export CLI                                 |
| `@taucad/react`          | React bindings for the runtime                          |
| `geospec`                | GeoSpec authoring contract and CLI-facing specification |
| `@taucad/geospec-engine` | Fair-source GeoSpec execution/proof engine and CLI      |
| `@taucad/openrscad`      | OpenRSCAD runtime plugin                                |

The following internal libraries remain in the fixed Nx version group so a change forces a runtime version, but `private: true` and the publish workflow prevent publishing them independently: `@taucad/converter`, `@taucad/events`, `@taucad/filesystem`, `@taucad/fs-bridge`, `@taucad/gltf-extensions`, `@taucad/json-schema`, `@taucad/memory`, `@taucad/rpc`, `@taucad/types`, `@taucad/units`, `@taucad/utils`, and `@taucad/vm`. Their code and declarations ship inside `@taucad/runtime`.

`@taucad/runtime/types` is the public owner for runtime contract types. JSON Schema inference and units remain implementation libraries with no public runtime veneer or subpath.

`@taucad/fs-client` and `@taucad/telemetry` are private and outside the release group. Telemetry is Tau application infrastructure; its contracts live in `libs/telemetry`, its observability middleware lives in the UI, and it is neither bundled into runtime nor published.

## Versioning Strategy

### Fixed Versioning

All packages in the release group share a single version number. When any member changes, Nx aligns the group to the same version. This includes the versioned-but-not-published bundled libraries so their changes cannot ship without a corresponding runtime version.

**Rationale**: The packages are tightly coupled, and `@taucad/runtime` bundles its twelve private implementation libraries. Independent versioning would create a combinatorial compatibility matrix that is difficult to test and communicate.

### Semantic Versioning

Versions follow [SemVer 2.0.0](https://semver.org/):

- **Major** (`X.0.0`): Breaking API changes, removal of deprecated features, minimum Node.js version bumps
- **Minor** (`0.X.0`): New features, new kernel/middleware additions, new export formats
- **Patch** (`0.0.X`): Bug fixes, performance improvements, dependency updates without API changes

### Pre-1.0 Convention

While packages are below `1.0.0`, minor versions may include breaking changes. The API is not considered stable until `1.0.0`.

## Version Management: Nx Release with Version Plans

### Why Nx Release (not Changesets)

We use **Nx Release** with **Version Plans** rather than Changesets or semantic-release. Rationale:

1. **Native Nx integration**: Nx Release leverages the project dependency graph that Nx already maintains, ensuring inter-package dependencies are updated correctly during version bumps.

2. **Version Plans over Conventional Commits**: Version Plans are file-based (similar to Changesets) but built into Nx. They decouple version intent from commit message format, which is important because:
   - Not all contributors follow strict conventional commit formats
   - A single feature may span multiple commits
   - The version bump decision belongs to the PR author, not an automated parser

3. **Single toolchain**: Eliminates the need for a separate `@changesets/cli` dependency and its GitHub bot infrastructure. Nx handles versioning, changelogs, and publishing in one tool.

4. **CI validation**: `nx release plan:check` verifies that version plans exist for changed projects, acting as a PR gate.

### Version Plan Workflow

1. Developer makes changes to a package
2. Developer creates a version plan: `pnpm nx release plan`
3. Version plan file (`.nx/version-plans/*.md`) is committed alongside the code change
4. CI runs `nx release plan:check` to enforce version plans exist
5. At release time, `nx release` applies all pending version plans

### Changelog Generation

Changelogs are generated automatically from version plan descriptions and conventional commit messages:

- A **workspace-level** `CHANGELOG.md` at the repository root aggregates all changes
- Each package has its own `CHANGELOG.md` in its directory

## Build Pipeline

### Build Tool: tsdown

All packages are built with [tsdown](https://tsdown.dev/) (Rolldown-based bundler) via a custom Nx plugin (`tools/tsdown.plugin.ts`). The build produces:

| Output | Directory | Description                    |
| ------ | --------- | ------------------------------ |
| ESM    | `dist/`   | ES modules (`.mjs` + `.d.mts`) |

### Build Order

Nx Release is configured with a `preVersionCommand` that builds all packages before versioning. This ensures the `dist/` directories exist with correct content before `package.json` versions are updated, so the published tarball contains the built artifacts at the correct version.

The build respects Nx's dependency graph. Bundled libraries build before `@taucad/runtime`; `packages/kernels/*` participates in the same release build.

### Package Validation

The `pkgcheck` Nx plugin validates package.json structure before publish:

- Identical development and publish export key sets
- Every `files` entry exists in the staged package
- ESM-only entry points resolve correctly
- Bundled workspace modules have exactly one published owner
- Published declarations contain no non-JSDoc specifier for a bundled workspace package
- A strict consumer (`skipLibCheck: false`) resolves the runtime under both `bundler` and `nodenext`
- publint, Are the Types Wrong, circular-dependency, and size-limit gates pass

The pre-publish registry gate validates each runtime production dependency with `npm view`, verifies every runtime-artifact subpath and named import against the published package, and rejects a direct dependency whose current workspace manifest has a one-level private transitive dependency. It is a readiness signal, not an allowlist: every reported blocker must remain visible until its owning precondition is resolved.

## Publishing

### npm Trusted Publishing (OIDC)

Packages are published using **npm Trusted Publishing** with OpenID Connect (OIDC), the recommended approach as of 2025. This replaces traditional long-lived npm access tokens.

**How it works**:

1. Each package on npmjs.com is configured with a "Trusted Publisher" pointing to the GitHub Actions workflow in `taucad/tau`
2. During CI, GitHub's OIDC provider issues a short-lived token
3. npm verifies the token matches the configured publisher
4. The package is published without any stored secrets

**Why Trusted Publishing over access tokens**:

- **No secret rotation**: Tokens are ephemeral and scoped to a single workflow run
- **No secret exposure risk**: Nothing to leak in logs or environment variables
- **Automatic provenance**: Build provenance attestations are generated automatically
- **Audit trail**: Every publish is cryptographically linked to a specific commit and workflow run

### Build Provenance

Every published package includes a [Sigstore](https://www.sigstore.dev/) provenance attestation that cryptographically links the published tarball to:

- The exact source commit in `taucad/tau`
- The GitHub Actions workflow that built it
- The build environment and parameters

This is visible on npmjs.com as a "Provenance" badge and can be verified with:

```bash
npm audit signatures
```

**Provenance does not guarantee the absence of malicious code.** It provides a verifiable chain of custody so consumers can audit where and how a package was built.

### Publish Workflow

The release process is split between local and CI:

```
Developer                          CI (GitHub Actions)
─────────                          ──────────────────
1. nx release plan
2. Commit + push PR
3. PR merged to main
4. nx release --skip-publish
   ├─ Apply version plans
   ├─ Update package.json versions
   ├─ Generate changelogs
   ├─ Commit + tag (v{version})
   └─ Push tag
                                   5. Tag triggers publish workflow
                                      ├─ Run every candidate-only gate
                                      ├─ Verify live registry dependencies
                                      ├─ Pack, npm-install, and execute runtime in OS temp
                                      ├─ Dry-run every publish batch
                                      ├─ Publish runtime
                                      ├─ Publish consumers, kernels, and geospec
                                      └─ Publish geospec-engine
```

Nx 22 does not permit `nx release publish -p` to select a subset of a fixed release group. The workflow therefore invokes the Nx-generated `nx-release-publish` targets in explicit dependency batches after the fixed group has been versioned. Those targets use the same `@nx/js:release-publish` executor, npm Trusted Publishing identity, and provenance settings; `--excludeTaskDependencies` prevents a batch from publishing an unverified downstream project.

### Prerelease Strategy

For alpha, beta, and release candidate versions:

- Publish under a dist-tag (`next`, `alpha`, `beta`, `rc`) so `npm install @taucad/runtime` always resolves to the latest stable version
- Prerelease versions follow the format `X.Y.Z-alpha.N`
- Prereleases do not generate changelog entries in the stable changelog

## Operator Publish Handoff

This section specifies the operator-owned release procedure. It does not authorize an implementation agent or ordinary development task to publish, retag, claim a name, or deprecate a package.

### Preconditions

The closeout Decision Register has settled the former C1/C5/C6 and OQ2/OQ4/OQ7 branches:

1. Runtime bundles exactly twelve private implementation libraries: converter, events, filesystem, fs-bridge, gltf-extensions, JSON Schema, memory, RPC, types, units, utils, and VM. None publishes independently.
2. `@taucad/runtime/types` is the public runtime-contract type surface. JSON Schema inference and units have no public veneer or runtime subpath.
3. Runtime consumes `replicad` and `replicad-opencascadejs` through registry aliases to the published `@taulabs/*` forks.
4. `@taucad/geospec-engine` publishes after runtime and `geospec`.
5. `nanoraster@0.2.0` and its three platform packages replace the deleted `@taucad/render` package.
6. Telemetry is private application infrastructure and does not participate in the train.
7. Candidate-only build, test, typecheck, lint, package, license, surface, documentation, and pack/install gates must pass before the release tag is pushed.

`pnpm registry:check` is the final dependency-readiness signal and must be green before any publication. Do not allowlist a blocker. The packed-artifact smoke must use **`pnpm pack` only**; `npm pack` does not apply Tau's publish metadata and workspace/catalog rewriting correctly. `pnpm runtime:npm-local-smoke` must create the TGZ and a separate npm test application under the operating system's temporary directory, install the TGZ with npm, execute the shipped README quick start, and report the exact TGZ byte size.

### Version and Publish Sequence

The operator runs the versioning half locally after every precondition and gate is green:

```bash
pnpm nx release plan
pnpm nx release plan:check
pnpm registry:check
pnpm runtime:npm-local-smoke
NX_CLOUD=false pnpm nx release --dry-run --skip-publish --first-release
pnpm nx release --skip-publish --first-release
git push origin main --follow-tags
```

The pushed release tag triggers `.github/workflows/publish.yml`; CI dry-runs and then executes the explicit dependency batches. After verifying the train, the operator may promote each approved package:

```bash
npm dist-tag add '<package>@<released-version>' latest
```

The first successful train publication claims the decided names `geospec` and `@taucad/geospec-engine`. Do not publish placeholder packages merely to reserve either name.

### Superseded Package Deprecations

Only after the replacement train is installed and verified, deprecate the exact superseded ranges with replacement pointers:

```bash
npm deprecate '@taucad/converter@0.1.0-beta.0' 'Bundled into @taucad/runtime.'
npm deprecate '@taucad/events@0.1.0-beta.0' 'Bundled into @taucad/runtime.'
npm deprecate '@taucad/filesystem@0.1.0-beta.0' 'Use @taucad/runtime/filesystem.'
npm deprecate '@taucad/memory@0.1.0-beta.0' 'Bundled into @taucad/runtime.'
npm deprecate '@taucad/rpc@0.1.0-beta.0' 'Bundled into @taucad/runtime.'
npm deprecate '@taucad/types@0.1.0-beta.0' 'Use @taucad/runtime/types.'
npm deprecate '@taucad/json-schema@0.1.0-beta.0' 'Bundled into @taucad/runtime.'
npm deprecate '@taucad/units@0.1.0-beta.0' 'Bundled into @taucad/runtime.'
npm deprecate '@taucad/utils@0.1.0-beta.0' 'Bundled into @taucad/runtime.'
npm deprecate '@taucad/fs-client@0.1.0-beta.0' 'Use @taucad/runtime/filesystem.'
npm deprecate '@taucad/testing@0.1.0-beta.0' 'Use @taucad/runtime/testing.'
npm deprecate '@taucad/telemetry@0.1.0-beta.0' 'Internal Tau application package; no public replacement.'
```

## Security Considerations

1. **No npm tokens in CI**: Trusted Publishing eliminates stored credentials
2. **Provenance attestation**: Every package is cryptographically signed
3. **Version plan review**: Version bumps are reviewed as part of the PR process
4. **CI-only publishing**: Packages cannot be published from developer machines (Trusted Publishing is scoped to the CI workflow)
5. **Lockfile integrity**: `pnpm install --frozen-lockfile` in CI prevents dependency tampering

## Decision Log

| Date    | Decision                                                | Rationale                                                                                                                                                 |
| ------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-02 | Adopt Nx Release over Changesets                        | Native Nx integration; Version Plans provide same file-based workflow without extra tooling                                                               |
| 2026-02 | Fixed versioning (all packages same version)            | Packages are tightly coupled; simplifies compatibility story                                                                                              |
| 2026-02 | npm Trusted Publishing (OIDC)                           | Eliminates stored secrets; automatic provenance; industry best practice since July 2025                                                                   |
| 2026-02 | Build provenance via Sigstore                           | Supply chain transparency; required by Trusted Publishing; visible on npmjs.com                                                                           |
| 2026-02 | tsdown for package builds                               | Already in use; Rolldown-based, fast ESM output with tree-shaking                                                                                         |
| 2026-02 | CI-only publishing                                      | Prevents accidental or unauthorized publishes from dev machines                                                                                           |
| 2026-08 | Include `@taucad/geospec-engine` in the train           | The settled package split keeps authoring in `geospec` and publishes execution/proof plus the CLI from the fair-source engine package                     |
| 2026-08 | Close C1/C5/C6 and OQ2/OQ4/OQ7                          | Bundle RPC/converter, use scoped Replicad aliases, publish GeoSpec engine, replace render with nanoraster, and internalize telemetry                      |
| 2026-08 | Batch fixed-group publication through generated targets | Nx rejects project-filtered publication within a fixed group; explicit generated-target batches preserve fixed versioning and registry-dependent ordering |
