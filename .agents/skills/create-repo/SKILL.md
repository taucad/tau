---
name: create-repo
description: Bootstraps, retrofits, or audits standalone taucad repositories with release, CI, quality, documentation, governance, and agent-maintenance conventions. Use only when a maintainer invokes /create-repo.
disable-model-invocation: true
argument-hint: '[bootstrap <name> | retrofit <name> | audit <name>]'
---

# Create Repo

Stand up or audit a standalone `taucad` repository by copying literal files
from `templates/`, binding the repository parameters, and validating every
applicable contract. Do not transcribe template bodies from this document.

## Definition of Done

1. The invocation binds every parameter in the contract below.
2. Every applicable item in [repo-checklist.md](repo-checklist.md) is detected
   before mutation, applied once, and verified after mutation.
3. The repository is ESM-only, exports-map-only, independently buildable, and
   installable from its exact candidate set.
4. `.github/workflows/ci.yml` builds once, tests that candidate across the
   declared hosts, publishes only through npm OIDC, verifies the registry
   artifact and provenance, and fans into `ci-gate`.
5. Quality, coverage, byte, timing, prose, package-shape, dependency, and
   security gates pass with no unexplained exclusions.
6. The docs site, passive Tau attribution, governance, repository registration,
   and agent loop match the checklist.
7. Bootstrap and retrofit leave a reviewable branch; audit leaves no changes.

## Modes

- `bootstrap <name>`: require an empty or placeholder repository. Existing
  identity files may be replaced only after their values are recorded.
- `retrofit <name>`: preserve product code and detect each convention before
  adding it. Never replace a working equivalent merely to match a template.
- `audit <name>`: run the same discovery and verification read-only. Report
  each item as `pass`, `gap`, `not-applicable`, or `needs-ruling` with evidence.

Reject missing names, additional arguments, and unknown modes.

## Parameterization Contract

Bind all values before copying files:

| Parameter        | Contract                                              |
| ---------------- | ----------------------------------------------------- |
| repo slug        | GitHub repository slug and Nx project name            |
| npm name         | Exact registry package name                           |
| description      | One line, no more than 120 characters                 |
| license          | Default `Apache-2.0`; filename is lowercase `license` |
| native toolchain | `rust-wasm`, `emscripten`, or `none`                  |
| artifact policy  | Each binary is `committed` or `ci-built`              |
| env prefix       | Uppercase environment-variable prefix                 |
| Vale pack        | Default `Tau`                                         |
| docs site        | `yes` or `no`                                         |
| benchmark axes   | Bytes always; wall-clock optional                     |
| host matrix      | Exact Node, browser, native OS, and GPU legs          |

Template tokens use the collision-free form `@@CREATE_REPO_<name>@@`. Replace
only those tokens; GitHub expressions and ESLint `{{term}}` messages are not
template inputs. Set `release-projects-json` to the JSON string entries for the
root project and every platform package project. After copying, fail if
`rg -n '@@CREATE_REPO_[a-z0-9-]+@@'` finds an unbound token. Never introduce
`@taucad/toolkit`, Nx migrations, or reusable central workflows; those remain
deferred until a third manual fleet update or material audit drift proves the
maintenance cost.

### Template destinations

Copy files without rewriting their bodies except placeholder substitution:

| Template path                                                                                         | Repository destination                                                     |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `ci.yml`, `bench.yml`, `claude.yml`, `cache-cleanup.yml`, `osv-scan.yml`, `dependabot-auto-merge.yml` | `.github/workflows/`                                                       |
| `dependabot.yml`                                                                                      | `.github/dependabot.yml`                                                   |
| `setup-action/action.yml`                                                                             | `.github/actions/setup/action.yml`                                         |
| `issue-forms/*`                                                                                       | `.github/ISSUE_TEMPLATE/`                                                  |
| `PULL_REQUEST_TEMPLATE.md`                                                                            | `.github/PULL_REQUEST_TEMPLATE.md`                                         |
| `scripts/*`                                                                                           | `scripts/`                                                                 |
| `tests/ci-release.test.mjs`, `tests/release-attestations.test.mjs`                                    | `tests/ci/`                                                                |
| `tests/packaging.test.mjs`                                                                            | `tests/`                                                                   |
| `release-skill/SKILL.md`                                                                              | `.agents/skills/release-<slug>/SKILL.md`                                   |
| `prose-rules.js`, `jsdoc-quality.js`, `eslint-plugin.js`                                              | `tools/eslint-plugin/` as `prose-rules.js`, `jsdoc-quality.js`, `index.js` |
| `vale/<pack>/*`                                                                                       | `.vale/styles/<pack>/`                                                     |
| `prose-quality.test.ts`, `readme-shape.test.ts`                                                       | Repository root                                                            |
| `docs-site/**`                                                                                        | `docs-site/`                                                               |
| Remaining root templates                                                                              | Repository root                                                            |

Delete non-applicable conditional templates only after recording
`not-applicable` in the checklist; for example, a `none` native toolchain does
not keep the Cargo Dependabot block or the `npm/*` workspace glob, and a repo
without docs does not keep the `docs-site` workspace glob.

## 0. Discover Before Editing

1. Read the target repository's `AGENTS.md`, package manifests, lockfiles,
   build configs, workflows, release files, docs, and git state.
2. Read Tau's `repos.yaml` entry. An org-owned `taucad/<name>` origin is
   writable without a `fork:` field; third-party upstream-only repos are not.
3. Read `.agents/skills/create-package/SKILL.md` for package-internal exports,
   tsdown, TypeScript, and Vitest conventions. This skill owns the repository
   boundary around that package.
4. Resolve the default branch, remote visibility, npm namespace state, open
   pull requests, rulesets, secret-scanning state, and Vercel project state.
5. Fill the checklist with evidence. In `audit`, report it and stop.
6. In mutation modes, require a clean worktree and create a fresh branch from
   the remote default branch. Never force-push the default branch.

If a settled parameter is contradicted by reality, stop with the evidence. Do
not silently choose a different release, artifact, host, license, or visibility
model.

## 1. Identity and Package Boundary

1. Copy the hygiene, package, Nx, and ignore templates that apply.
2. Use ESM-only output and an exports map; export `./package.json` and each
   relocatable binary asset on its own subpath.
3. Keep source and published export keys identical. Published runtime entries
   use `{ "types", "import", "default" }` in that order.
4. Use `unbundle: true`, declaration output, minification, and an exhaustive
   `files` whitelist. `.npmignore` is a deny-all safety net.
5. Keep runtime dependencies explicit. Platform native packages are optional
   dependencies. Do not add a runtime dependency for shared repo tooling.
6. Validate the packed file set exactly: missing and extra files both fail;
   CI-built binaries must be present in the candidate tarball.

The lowercase `license` convention is intentional for standalone repositories.
Update the whitelist, package-file constant, `.npmignore`, and package-shape
tests together.

## 2. Nx and Release

1. Use one root project with `nx:run-commands` targets, toolchain fingerprints
   in `namedInputs`, and a fan-in `quality` target.
2. Configure `nx release` with Version Plans and git-inert settings: Nx mutates
   files; CI owns commits, tags, pushes, registries, and releases. Root and
   platform packages form one fixed release group.
3. Copy `prepare-release.mjs`, `ci-release.mjs`, their tests, and the repo-local
   `release-@@CREATE_REPO_slug@@` skill. Keep release policy pure and unit tested.
4. The sole automatic publish trigger is the exact commit subject
   `chore(release): @@CREATE_REPO_slug@@ v<version>`.
5. GitHub Actions is the only publisher. Never run `npm publish` on a laptop,
   add `NPM_TOKEN`, or re-register an existing trusted publisher.

## 3. CI Candidate Pipeline

Copy `templates/ci.yml` to `.github/workflows/ci.yml`; that filename is part of
the npm Trusted Publisher identity.

1. `preflight` derives immutable release metadata once.
2. Quality and host jobs use SHA-pinned actions, least privilege, frozen
   installs, and checksum-pinned standalone tools from `DEPS.json`. Run the
   bound Linux host setup before candidate or consumer commands that execute
   the runtime.
3. Build once, assemble one candidate set, and test those exact tarballs in
   every clean consumer job. Publish platform packages before the root package.
   Prefix local `npm/` package paths with `./` so npm cannot resolve them as
   registry or Git shorthands. Do not rebuild in consumer or publish jobs.
4. Publish idempotently through OIDC. If the version exists, compare registry
   bytes and provenance instead of overwriting it.
5. `registry-verify` installs from the registry and checks the provenance
   source repository, workflow filename, commit, and package integrity.
6. `ci-gate` asserts every required result, including expected skips, and is
   the only branch-protection check.
7. Split concurrency: cancel stale pull-request runs; serialize publish work.

For wasm, test source correctness natively and smoke the wasm shell. Never
rebuild-and-diff wasm bytes across tool versions.

## 4. Quality and Coverage

1. Run oxfmt, oxlint, ESLint, typecheck, tests, package validation, actionlint,
   shellcheck, dead-code detection, docs-link checks, and repo-shape tests.
   Install `oxlint-tsgolint` directly whenever oxlint runs `--type-aware`;
   never rely on a parent workspace or optional peer leaking into `PATH`.
2. Copy the entire anti-slop pack: `prose-rules.js`, `jsdoc-quality.js`,
   `.vale.ini`, all seven Vale rules, and the prose block-length test. Rename
   only the bound Vale pack and ESLint plugin ids. Scan all `.md`, `.mdx`, and
   JSDoc/block-comment surfaces.
3. Set TypeScript coverage thresholds to 100%. Exclude generated bindings only
   when their shells have direct consumer smokes.
4. For Rust, use `cargo llvm-cov --fail-under-lines 100`. Each ignored path is
   a command-line entry followed by `-- reason`; third-party vendor code and
   macro binding shells are the only default carve-outs.
5. Every compatibility-table check mark maps to a CI job.

## 5. Admission Ratchets

1. Gate every JavaScript entry with `.size-limit.json` and every wasm binary
   with raw and compressed byte ceilings. Comment each threshold's measured
   origin. Admission is a budget edit in the causing pull request.
2. Gate at most one wall-clock benchmark. Run pull request and `origin/main`
   on the same runner, compare median-of-15 results, update one marker-keyed
   comment, and fail above the documented threshold.
3. A semantic benchmark change is admitted by renaming the benchmark. The
   comparator treats it as new; never hide it by overwriting a baseline.
4. Run exploratory benchmarks on a cron and open a labeled `claude` issue on
   drift. Do not turn exploratory variance into a pull-request gate.

## 6. Consumer Shape

From the assembled candidate set, verify in clean temporary projects:

- ESM import and the documented quick start;
- deliberate CommonJS `require()` failure with a clear ESM-only diagnostic;
- every binary asset resolves from its installed export path;
- docs code fences typecheck against public imports;
- native and wasm shells produce the required semantic or byte-identical
  result where the repository declares parity.

## 7. Self-Driving Maintenance

1. Copy root `AGENTS.md`; keep it under 150 lines and do not add `CLAUDE.md`.
2. Store repo-local skills under `.agents/skills/` and make
   `.claude/skills` a symlink. Copy `.claude/launch.json`.
3. Copy the three-job trusted/untrusted `claude.yml`; every untrusted checkout
   uses `persist-credentials: false`.
4. Copy cron, Dependabot, OSV, cache-cleanup, and native dependency checks.
   Create or verify the `claude` repository label and confirm the workflow can
   read `ANTHROPIC_API_KEY` from repository or organization secrets without
   displaying it. Cron failures create issues with `--label claude`.
5. Dependabot uses npm, native-toolchain, and GitHub Actions ecosystems with
   7/14-day cooldowns; only grouped patch and action-digest updates auto-merge.
6. OSV is report-only on pull requests and fail-closed on the default branch.
   Every suppression has both `reason` and `ignoreUntil`.

## 8. Docs and Ecosystem Attribution

When docs are enabled, copy the static Fumadocs templates. Use
`remarkAutoTypeTable` through a public re-export barrel and an API coverage
test so every exported type has a page tag. Ship `llms.txt`, `llms-full.txt`,
and `TauAttributionFooter`. Use plain Vercel git deployment; do not add search
until the site exceeds roughly 25 pages.

Attribution is passive only: a README badge/banner, docs footer, and homepage
link to `https://tau.new`. Never add postinstall messages or telemetry.

## 9. Registration and Governance

1. Add or verify the `repos.yaml` entry and explicit non-default `branch:`.
2. Register repo-local skills in the repository `AGENTS.md`.
3. Verify npm Trusted Publishing binds every package in the fixed release group
   to `taucad/@@CREATE_REPO_slug@@` and `ci.yml`; register only when the operator
   says a binding is absent.
4. Create or verify the Vercel project when docs are enabled.
5. Apply repository governance through the `cloud-infra` stack: read-only
   default token, Actions cannot approve pull requests, secret scanning, push
   protection, private vulnerability reporting, and a `main` ruleset with
   linear history, no force-push, `ci-gate`, and zero required approvals.
6. Before making a repository public, make all prose Vale-clean, then enable
   secret scanning and push protection, then change visibility.

## 10. Blast-Radius Verification

Run the repository's Nx `quality` target and every declared host/candidate
smoke locally where the host exists. Also run:

```bash
git diff --check
rg -n '@@CREATE_REPO_[a-z0-9-]+@@' .
npm pack --dry-run --json
git status --short
```

Then push the branch, open a reviewable pull request with exact validation
evidence, wait for `ci-gate`, and merge only when the required end state calls
for it. Report external settings and publication evidence separately from code
checks.

## Boundaries

- Never publish from a laptop, introduce `NPM_TOKEN`, or force-push `main`.
- Never make a repository public before prose cleanup and security controls.
- Never copy Docker/GHCR machinery, Python, sharding, or other reference-repo
  complexity unless the bound repository parameters require it.
- Never create the deferred toolkit, migration, reusable-workflow, upstream
  patch, crates.io, or unrelated retrofit work as part of an invocation.
- Stop when a needs-ruling item would change license, visibility, publisher,
  artifact policy, host support, public API, or governance.
