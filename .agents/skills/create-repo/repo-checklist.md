# Standalone Repository Checklist

Use this checklist for `bootstrap`, `retrofit`, and read-only `audit`. Detect
each item before changing it. Record `pass`, `gap`, `not-applicable`, or
`needs-ruling` plus the command or file that proves the status.

Applicability:

- **B** — bootstrap-only; do not overwrite during retrofit.
- **R** — retrofit-safe after detecting an equivalent.
- **Q** — needs an explicit ruling when unset or contradictory.

## A. Discovery and identity

| Kind | Check                                                                                                                                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| R    | Read `AGENTS.md`, manifests, lockfiles, workflows, release files, docs, remotes, branch, and status.                                              |
| B    | Placeholder repository contains no product implementation worth preserving.                                                                       |
| Q    | Repo slug, npm name, description, license, toolchain, artifact policy, env prefix, Vale pack, docs flag, benchmark axes, and host legs are bound. |
| R    | `repos.yaml` entry exists; an explicit `branch:` names every non-default branch.                                                                  |
| R    | Repository, npm package, trusted publisher, Vercel project, and ruleset state are recorded.                                                       |
| Q    | Any existing license, public API, visibility, or publisher conflict is surfaced before edits.                                                     |

## B. Package boundary

| Kind | Check                                                                                                      |
| ---- | ---------------------------------------------------------------------------------------------------------- |
| R    | Package is ESM-only and exports-map-only; `./package.json` is exported.                                    |
| R    | Binary assets have explicit public subpaths suitable for bundler relocation.                               |
| R    | Source and publish export keys are identical; published entries order `types`, `import`, `default`.        |
| R    | `tsdown` uses `format: 'esm'`, `unbundle: true`, `dts: true`, minification, and a separate build tsconfig. |
| R    | TypeScript config does not inject an undeclared helper runtime dependency.                                 |
| R    | Runtime dependencies are necessary; platform native packages are optional dependencies.                    |
| R    | `files`, lowercase `license`, `.npmignore`, and the package-file constant agree exactly.                   |
| R    | `validate-pack` rejects missing/extra files, source/config leakage, maps, and missing CI-built binaries.   |
| R    | Real `npm pack --dry-run --json`, publint, attw, circular-import, and size checks pass.                    |

## C. Nx and releases

| Kind | Check                                                                                                            |
| ---- | ---------------------------------------------------------------------------------------------------------------- |
| R    | One root Nx project uses `nx:run-commands`; `quality` fans into every gate.                                      |
| R    | `namedInputs` include runtime and native toolchain fingerprints.                                                 |
| R    | Nx Release uses Version Plans and git-inert settings.                                                            |
| R    | Version-plan checks ignore only tests, docs, and governance paths that cannot change the package.                |
| R    | `prepare-release.mjs` validates requested versus planned version.                                                |
| R    | Release policy is a pure module with unit tests for PR, main, manual, and malformed release commits.             |
| R    | Repo-local `release-<slug>` skill is operator-only and says CI owns publication, refs, releases, and deployment. |
| R    | Only `chore(release): <slug> v<version>` can request stable publication.                                         |

## D. CI and exact-candidate testing

| Kind | Check                                                                                                                         |
| ---- | ----------------------------------------------------------------------------------------------------------------------------- |
| R    | Main workflow filename is exactly `.github/workflows/ci.yml`.                                                                 |
| R    | Actions are SHA-pinned; permissions are per-job and minimal.                                                                  |
| R    | Pull-request concurrency cancels stale runs; publish work is serialized.                                                      |
| R    | `preflight` derives release metadata once from immutable event/ref/SHA inputs.                                                |
| R    | Composite setup retries installs and uses frozen lockfiles.                                                                   |
| R    | Standalone CI binaries are checksum-pinned in `DEPS.json`.                                                                    |
| R    | One job assembles the candidate set and records every tarball's integrity.                                                    |
| R    | Local platform package paths passed to npm begin with `./`.                                                                   |
| R    | Every host/consumer job downloads and tests that candidate without rebuilding it.                                             |
| R    | Publish job has `id-token: write`, no checkout, no registry token, and is idempotent.                                         |
| R    | Existing registry versions are byte/provenance verified rather than overwritten.                                              |
| R    | Registry verification installs by exact version and checks package, source repo, workflow, commit, integrity, and provenance. |
| R    | `ci-gate` names every required job and validates expected skips; branch protection requires only it.                          |
| R    | Compatibility-table check marks map one-to-one to CI jobs.                                                                    |

## E. Quality and coverage

| Kind | Check                                                                                                  |
| ---- | ------------------------------------------------------------------------------------------------------ |
| R    | oxfmt, oxlint, ESLint, typecheck, tests, dead-code, package, actionlint, and shellcheck gates run.     |
| R    | `prose-rules.js` is the single vocabulary used by JSDoc and prose tests.                               |
| R    | `jsdoc-quality` scans all JSDoc/block comments.                                                        |
| R    | Vale runs all seven vendored rules over every `.md` and `.mdx` file.                                   |
| R    | Prose block-length test enforces the shared 120-word ceiling.                                          |
| R    | README shape test enforces line budget, persona table, section order, quickstart, and maintainer link. |
| R    | TypeScript coverage is 100%; exclusions are generated binding shells and type tests only.              |
| R    | Rust coverage is 100%; each ignored vendor/macro-shell path has an inline `-- reason`.                 |
| R    | Native GPU coverage uses each declared backend rather than mocking the rendering path.                 |
| R    | Wasm/native shells have direct smokes when excluded from line coverage.                                |

## F. Admission ratchets and consumers

| Kind | Check                                                                                                |
| ---- | ---------------------------------------------------------------------------------------------------- |
| R    | `.size-limit.json` has per-entry budgets with measured-origin comments nearby.                       |
| R    | Every wasm has raw and compressed byte ceilings as hard PR gates.                                    |
| R    | Exactly one wall-clock benchmark is a PR gate when enabled.                                          |
| R    | PR and `origin/main` run on the same runner; median-of-15 comparison posts one marker-keyed comment. |
| R    | Timing threshold carries an origin comment; rename-to-admit is documented.                           |
| R    | Monthly exploratory drift opens a `claude`-labeled issue.                                            |
| R    | Clean-room tarball smoke imports ESM and runs the README quickstart.                                 |
| R    | Clean-room CommonJS smoke expects a clear ESM-only failure.                                          |
| R    | Installed binary subpaths resolve and load.                                                          |
| R    | Documentation code fences typecheck against public package imports.                                  |
| R    | Declared cross-host determinism compares semantic output or exact bytes.                             |

## G. Hygiene and maintenance loop

| Kind | Check                                                                                                                                           |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| R    | README has badges, one-line description, persona table, install, runnable quickstart, compatibility, stability, provenance, license, and links. |
| R    | CONTRIBUTING has numbered PR steps, Version Plans, admission gestures, test commands, and release boundaries.                                   |
| R    | SECURITY.md is concise and names private reporting.                                                                                             |
| R    | MAINTAINER.md owns release, registry, Vercel, and governance operations.                                                                        |
| R    | `license` is verbatim and NOTICE covers fonts plus vendored/forked code.                                                                        |
| R    | Issue forms disable blank issues; pull-request template requests tests, plan, compatibility, and AI disclosure.                                 |
| R    | Root `AGENTS.md` is under 150 lines; no `CLAUDE.md` exists.                                                                                     |
| R    | `.agents/skills` is canonical; `.claude/skills` is a symlink; `.claude/launch.json` exists.                                                     |
| R    | Three-job `claude.yml` separates untrusted notification, approved execution, and trusted execution.                                             |
| R    | Untrusted code checkouts use `persist-credentials: false`.                                                                                      |
| R    | Dependabot covers npm, native dependencies, and Actions with 7/14-day cooldowns.                                                                |
| R    | Only grouped patch and action-digest Dependabot updates auto-merge.                                                                             |
| R    | OSV is report-only on PRs and fail-closed on main; suppressions contain `reason` and `ignoreUntil`.                                             |
| R    | Rust repositories run `cargo deny`; cache cleanup is scheduled.                                                                                 |

## H. Documentation and attribution

| Kind | Check                                                                                                   |
| ---- | ------------------------------------------------------------------------------------------------------- |
| R    | Static Fumadocs site has about 18 source/config files and no search below the page-count trigger.       |
| R    | Type docs use `remarkAutoTypeTable` through one public `props.ts` barrel.                               |
| R    | `api-coverage.test.ts` maps every public export to an `<auto-type-table>` tag or deliberate prose page. |
| R    | `TauAttributionFooter`, README badge/banner, and package homepage link to `https://tau.new`.            |
| R    | `llms.txt` and `llms-full.txt` expose the docs corpus.                                                  |
| R    | Vercel uses plain git integration with no release-tarball pinning machinery.                            |
| R    | No telemetry or postinstall attribution exists.                                                         |

## I. Governance and publication

| Kind | Check                                                                                                 |
| ---- | ----------------------------------------------------------------------------------------------------- |
| R    | Default Actions token is read-only; Actions cannot approve pull requests.                             |
| R    | `main` ruleset requires linear history and `ci-gate`, blocks force-push, and requires zero approvals. |
| R    | Secret scanning, push protection, and private vulnerability reporting are enabled.                    |
| R    | Terraform records bespoke repo settings until the fleet-module trigger is met.                        |
| Q    | Every published package has a trusted publisher only when proven absent; each workflow is `ci.yml`.   |
| Q    | Public transition occurs only after all prose is Vale-clean and security controls are enabled.        |
| R    | First release is prepared by Version Plan and published by CI with provenance.                        |
| R    | Registry verification is green before consumers migrate.                                              |

## J. Final verification

| Kind | Check                                                                            |
| ---- | -------------------------------------------------------------------------------- |
| R    | `nx run <slug>:quality` and all local host smokes pass.                          |
| R    | `git diff --check` passes and no template placeholder remains.                   |
| R    | Git worktree is clean after the intended commit.                                 |
| R    | Pull request records commands, results, risks, and exact external-state changes. |
| R    | `ci-gate` is green before merge.                                                 |
| R    | Audit after merge reports no unexplained gaps.                                   |
