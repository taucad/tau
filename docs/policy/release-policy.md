# Release Policy

This document defines the versioning, building, and publishing strategy for the `@taucad/*` npm packages.

## Packages in Scope

| Package | Description |
|---------|-------------|
| `@taucad/kernels` | Multi-kernel CAD runtime framework for browser and Node.js |
| `@taucad/converter` | CAD file format conversion (STL, STEP, IGES, USDZ, etc.) |
| `@taucad/json-schema` | JSON to JSON Schema conversion |
| `@taucad/js` | Tau JavaScript API |

Internal workspace packages (`@taucad/types`, `@taucad/utils`, `@taucad/tau-examples`) are not published to npm and are consumed only within the monorepo.

## Versioning Strategy

### Fixed Versioning

All four packages share a single version number. When any package changes, all packages are bumped to the same version. This simplifies dependency management for consumers who use multiple `@taucad` packages together.

**Rationale**: The packages are tightly coupled (e.g., `@taucad/kernels` depends on `@taucad/converter` and `@taucad/json-schema`). Independent versioning would create a combinatorial compatibility matrix that is difficult to test and communicate.

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

| Output | Directory | Description |
|--------|-----------|-------------|
| ESM | `dist/esm/` | ES modules (`.js` + `.d.ts`) |
| CJS | `dist/cjs/` | CommonJS (`.cjs` + `.d.cts`) |

A post-build plugin (`tools/generate-cjs-dts.plugin.ts`) copies `.d.ts` files to `.d.cts` for CJS type resolution.

### Build Order

Nx Release is configured with a `preVersionCommand` that builds all packages before versioning. This ensures the `dist/` directories exist with correct content before `package.json` versions are updated, so the published tarball contains the built artifacts at the correct version.

The build respects Nx's dependency graph: `@taucad/json-schema` and `@taucad/converter` build before `@taucad/kernels` (which depends on both).

### Package Validation

The `pkgcheck` Nx plugin validates package.json structure before publish:

- Correct `exports` and `publishConfig.exports` mappings
- `files` array includes only intended artifacts
- Dual ESM/CJS entry points resolve correctly

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
                                      ├─ Checkout at tag
                                      ├─ Build all packages
                                      ├─ nx release publish
                                      │  ├─ OIDC token exchange
                                      │  ├─ Provenance attestation
                                      │  └─ Publish to npmjs.com
                                      └─ Create GitHub Release
```

### Prerelease Strategy

For alpha, beta, and release candidate versions:

- Publish under a dist-tag (`next`, `alpha`, `beta`, `rc`) so `npm install @taucad/kernels` always resolves to the latest stable version
- Prerelease versions follow the format `X.Y.Z-alpha.N`
- Prereleases do not generate changelog entries in the stable changelog

## Security Considerations

1. **No npm tokens in CI**: Trusted Publishing eliminates stored credentials
2. **Provenance attestation**: Every package is cryptographically signed
3. **Version plan review**: Version bumps are reviewed as part of the PR process
4. **CI-only publishing**: Packages cannot be published from developer machines (Trusted Publishing is scoped to the CI workflow)
5. **Lockfile integrity**: `pnpm install --frozen-lockfile` in CI prevents dependency tampering

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02 | Adopt Nx Release over Changesets | Native Nx integration; Version Plans provide same file-based workflow without extra tooling |
| 2026-02 | Fixed versioning (all packages same version) | Packages are tightly coupled; simplifies compatibility story |
| 2026-02 | npm Trusted Publishing (OIDC) | Eliminates stored secrets; automatic provenance; industry best practice since July 2025 |
| 2026-02 | Build provenance via Sigstore | Supply chain transparency; required by Trusted Publishing; visible on npmjs.com |
| 2026-02 | tsdown for package builds | Already in use; Rolldown-based, fast dual ESM/CJS output with tree-shaking |
| 2026-02 | CI-only publishing | Prevents accidental or unauthorized publishes from dev machines |
