---
title: 'Tool Output Location Policy'
description: 'Rules for placing caches, temporary work, reports, artifacts, and persistent machine state created by Tau workspace tooling.'
status: active
created: '2026-08-22'
updated: '2026-08-23'
related:
  - docs/research/workspace-root-generated-output-hygiene-blueprint.md
  - docs/policy/npm-policy.md
  - docs/policy/testing-policy.md
---

# Tool Output Location Policy

Internal reference for filesystem paths created by build, test, documentation, package-validation, and repository maintenance tooling in the host Tau checkout.

## Rationale

Machine-created top-level entries make the workspace root unstable for people, file pickers, and watchers. Output lifetime also matters: dependency-coupled caches may disappear with `node_modules`, while reports, security identities, and external working copies need different ownership boundaries. This policy classifies output by lifecycle before choosing its path.

## Scope

This policy applies to host-workspace tooling and CI jobs that write into or beside the Tau checkout. It does not rename paths inside Tau's virtual project filesystem, such as project-local `/.tau/cache` or `/node_modules`.

## Rules

### 1. Classify Output by Lifecycle

Choose the destination from this table before adding a path:

| Output class                                                                             | Required location                                                                        | Examples                                                                                  | Deletion contract                                                     |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Dependency-coupled, reproducible cache or intermediate                                   | `node_modules/.cache/<producer>/...`                                                     | GeoSpec V8 compile cache, pkgcheck consumers, Fumadocs collections, TypeScript build info | A dependency reinstall may delete it                                  |
| Upstream tool cache with an established `node_modules` convention                        | The tool's native path                                                                   | `node_modules/.vite`, `node_modules/.cache/webpack`                                       | A dependency reinstall may delete it                                  |
| Run result, report, or artifact that people or CI may inspect after installation changes | `out/<class>/<producer>/...`                                                             | Coverage, benchmark reports, browser-test evidence, WASM experiment output                | Tool-specific cleanup may delete it; dependency installation must not |
| Process scratch with no workspace affinity                                               | Operating-system temporary storage                                                       | One-off extracted inputs or isolated staging                                              | The process or OS may delete it                                       |
| Persistent machine identity, credential, or user state                                   | Platform application-data or credential storage                                          | mkcert root CA and private key                                                            | Only its owning lifecycle may delete it                               |
| Human-authored or persistent working copy                                                | Tracked workspace path or configured persistent workspace outside generated-output roots | `repos/` Git worktrees                                                                    | Never treat it as disposable output                                   |
| Package-local publication output                                                         | The package's configured local output directory                                          | `packages/*/dist`                                                                         | Governed by package build and release tooling                         |

Do not choose a path merely because it is ignored by Git.

**Why**: `.gitignore` affects version control, not deletion safety, directory-picker churn, watcher load, or artifact retention.

### 2. Keep the Workspace Root Stable

Never create per-run, per-worker, random, or timestamped entries directly under the workspace root. Create changing descendants beneath an existing stable boundary instead.

The approved machine-output root entries are:

| Root entry     | Purpose                                                                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `node_modules` | Installed dependencies and install-coupled disposable state                                                                                     |
| `out`          | Reports, test results, and artifacts that survive dependency reinstall                                                                          |
| `out-tsc`      | TypeScript emit and build info for the root solution config, matching the per-project `out-tsc` convention that Nx task outputs already declare |
| `.nx`          | Existing Nx-owned state; unchanged by this policy                                                                                               |

Existing authored, configuration, and explicitly persistent workspace entries are not machine-output destinations. Adding another machine-output root requires changing this policy first.

CORRECT:

```text
node_modules/.cache/tau-pkgcheck/consumer-a81d/
node_modules/.cache/tau-pkgcheck/consumer-x92f/
```

INCORRECT:

```text
.pkgcheck-consumer-a81d/
.pkgcheck-consumer-x92f/
```

### 3. Put Install-Coupled State Under `node_modules`

Use `node_modules/.cache/<producer>` for Tau-controlled caches, generated intermediates, and temporary work that requires installed workspace dependencies. Store no sole copy of valuable state there, and ensure the producer can regenerate the directory after a clean install.

Use the producer name without repeating the parent directory's meaning. Prefer short, stable names and add purpose-specific descendants only when one producer owns multiple cache families.

CORRECT:

```text
node_modules/.cache/geospec/
node_modules/.cache/fumadocs/apps/ui/
node_modules/.cache/tau-pkgcheck/consumer-<unique>/
node_modules/.cache/tsbuildinfo/examples/react-router/
```

INCORRECT:

```text
node_modules/.cache/geospec-compile-cache/
node_modules/.pkgcheck-consumer-<unique>/
```

Preserve an upstream tool's standard `node_modules` path when it already provides the correct lifecycle, such as Vite's `node_modules/.vite`. Do not relocate package-manager-owned entries such as `.pnpm`, `.pnpm_patches`, `.bin`, or `.modules.yaml`.

**Why**: Node.js tooling commonly treats `node_modules` caches as rebuildable accelerators tied to the installed dependency graph.

### 4. Put Retained Run Output Under `out`

Write reports, diagnostic evidence, and generated artifacts that may need inspection or upload after `node_modules` changes beneath one stable `out` root.

Use this hierarchy:

```text
out/
├── reports/
│   ├── benchmarks/
│   ├── coverage/
│   └── wasm-inspect/
├── test-results/
│   └── vitest-browser/
└── artifacts/
    └── wasm/
```

Producers may clean or replace their owned descendants, but must not remove and recreate the top-level `out` directory during a run.

**Why**: Reports and artifacts are disposable, but coupling their retention to dependency installation can erase the evidence needed to diagnose a failed run.

### 5. Isolate Concurrent and Temporary Work

Create one stable parent, then allocate unique descendants beneath it. Retain producer-local `try/finally` cleanup for normal completion and tolerate interrupted residue only within that parent.

Use operating-system temporary storage when the work has no reason to share the checkout's dependency graph. Use `node_modules/.cache/<producer>` when the work requires workspace packages, binaries, or resolution state.

Never use the workspace root as the parent passed to `mkdtemp`, and never rely on a global cleanup process for correctness.

**Why**: Unique descendants preserve parallel isolation without continuously adding and removing root entries.

### 6. Keep Persistent and Security-Sensitive State Out of Disposable Roots

Never store credentials, private keys, trusted certificate-authority state, user databases, or dirty working copies beneath `node_modules` or `out`.

Use platform application-data or credential storage for persistent tool identity. In particular, keep mkcert's root CA and private key outside `node_modules`; deleting the key while its certificate remains trusted can leave stale trust-store state that cannot be repaired by merely generating a new CA.

Keep `repos/` and other editable Git worktrees in an explicitly persistent location. Never move them under `node_modules` to hide a top-level entry.

**Why**: Package installs and output cleanup are allowed to destroy their directories without recovery.

### 7. Resolve Paths Explicitly

Resolve repository-owned output from the canonical workspace root, not from an incidental process working directory. Prefer each tool's native path setting—such as `cacheDir`, `outDir`, `reportsDirectory`, or an environment variable—over wrappers or a generic output-path framework.

Create required parents recursively before writing. When moving a producer, update all consumers, task inputs/outputs, ignore rules, Docker contexts, and CI upload paths in the same change.

**Why**: Implicit current-working-directory defaults recreate root output when commands are launched from a different entry point.

### 8. Make Cleanup Ownership Narrow and Observable

Let each producer delete only the descendants it owns. Never use broad root globs, `git clean`, or whole-workspace deletion as routine output cleanup.

Upload required CI reports and diagnostics before cleanup. Verify root hygiene after representative tasks have run; checking only before execution cannot detect a producer that writes to the wrong location.

The root-hygiene check should permit tracked top-level entries, `.git`, `node_modules`, `out`, `out-tsc`, `.nx`, and documented persistent exceptions such as `repos`. It should reject unexpected untracked root entries.

**Why**: Narrow ownership prevents one tool from deleting another tool's evidence or human work.

## Anti-Patterns

- Adding a root directory and relying on `.gitignore` to make it harmless.
- Storing reports under `node_modules` when they are expected to survive dependency reinstall or be uploaded after a run.
- Calling a persistent certificate-authority directory a cache.
- Repeating `cache` in a child name beneath `.cache`, such as `.cache/geospec-compile-cache`.
- Moving package-manager internals, `.nx`, package-local `dist`, or persistent Git worktrees merely to make the root look uniform.
- Introducing a shared path service when the owning tool already accepts a direct output-directory setting.

## Summary Checklist

- [ ] Classify the output by lifetime before choosing its path.
- [ ] Use `node_modules/.cache/<producer>` only for reproducible install-coupled state.
- [ ] Use `out/reports`, `out/test-results`, or `out/artifacts` for retained run output, including package-owned benchmark tools.
- [ ] Use platform storage for persistent identity, credentials, and user state.
- [ ] Keep random and per-run names below a stable parent.
- [ ] Resolve paths from the workspace root and configure the producer directly.
- [ ] Update consumers, CI uploads, task metadata, and ignore rules together.
- [ ] Test regeneration after a clean install and root stability during parallel work.
- [ ] Leave `.nx` and package-manager-owned `node_modules` entries unchanged.

## References

- [Vite `cacheDir`](https://vite.dev/config/shared-options.html#cachedir)
- [Vitest cache configuration](https://vitest.dev/config/cache)
- [webpack filesystem cache](https://webpack.js.org/configuration/cache/)
- [npm `ci`](https://docs.npmjs.com/cli/commands/npm-ci/)
- [mkcert](https://github.com/FiloSottile/mkcert)
- Research: `docs/research/workspace-root-generated-output-hygiene-blueprint.md`
- Related: `docs/policy/npm-policy.md`
- Related: `docs/policy/testing-policy.md`
