---
title: 'Commit Policy'
description: 'Conventional commit format, scope rules, and message quality guidelines for the Tau monorepo.'
status: active
created: '2026-03-11'
updated: '2026-03-11'
related:
  - docs/policy/release-policy.md
  - docs/policy/version-policy.md
---

# Commit Policy

Internal reference for commit message format, scope conventions, and quality standards in this monorepo.

## Rationale

Commit messages drive automated changelog generation and semantic versioning. Inconsistent scopes break per-package changelogs; vague descriptions produce useless release notes. Enforcing a machine-readable format with human-quality descriptions ensures both tooling and humans benefit from the git history.

## Rules

### 1. Use Conventional Commits Format

Every commit must follow the Conventional Commits specification:

```
type(scope): description

[optional body]

[optional footer]
```

**Why**: This format enables automated changelog generation, semantic version bumping, and scope-filtered release notes per package.

### 2. Allowed Types

Use one of these types. Each maps to a semantic versioning action:

| Type       | Purpose                                              | SemVer |
| ---------- | ---------------------------------------------------- | ------ |
| `feat`     | New feature or capability                            | MINOR  |
| `fix`      | Bug fix                                              | PATCH  |
| `docs`     | Documentation-only changes                           | —      |
| `style`    | Code style, formatting, lint rules (no logic change) | —      |
| `refactor` | Code restructuring without behavior change           | —      |
| `perf`     | Performance improvement                              | PATCH  |
| `test`     | Add or update tests                                  | —      |
| `build`    | Build system or dependency changes                   | —      |
| `ci`       | CI/CD configuration changes                          | —      |
| `chore`    | Maintenance tasks (deps, config, scripts)            | —      |
| `revert`   | Revert a previous commit                             | —      |

**Why**: Changelog generators categorize entries by type. Using unlisted types breaks filtering and produces orphaned entries.

### 3. Scope Must Be a Valid Project Name

The scope must be one of:

- A project name from any `project.json` in `apps/`, `packages/`, or `libs/`
- `root` for changes outside those directories (CI, config, docs, scripts)

Scope is **required** — do not omit it. Use lowercase always.

**Why**: Per-package changelogs filter by scope. An invented scope (e.g., `auth`, `parser`, `core`) produces entries that appear in no package's changelog.

CORRECT:

```
feat(runtime): add OpenCASCADE mesh export
fix(ui): resolve theme toggle flickering
chore(root): update GitHub Actions workflow
```

INCORRECT:

```
feat(core): add OpenCASCADE mesh export       # "core" is not a project
fix(frontend): resolve theme toggle flickering # "frontend" is not a project
chore: update GitHub Actions workflow          # missing scope
```

### 4. Scope Is Determined by Changed Files

Map changed files to their scope:

| File path pattern     | Scope    |
| --------------------- | -------- |
| `apps/<name>/...`     | `<name>` |
| `packages/<name>/...` | `<name>` |
| `libs/<name>/...`     | `<name>` |
| Everything else       | `root`   |

When changes span multiple projects, use the scope of the most significant change. Do not use comma-separated scopes.

**Why**: A single scope per commit keeps changelog entries unambiguous. Split multi-scope work into separate commits when feasible.

### 5. Write Descriptions in Imperative Present Tense

Start the description with a capitalized present-tense verb. Complete the sentence: _"If applied, this commit will..."_

CORRECT:

```
feat(api): Add user authentication endpoint
fix(converter): Resolve STEP file import crash on empty solids
refactor(runtime): Extract WASM loader into shared utility
```

INCORRECT:

```
feat(api): added user authentication endpoint    # past tense
fix(converter): Fixes STEP file import crash     # third-person
refactor(runtime): Extracting WASM loader        # gerund
feat(api): add user authentication endpoint      # lowercase first word
```

**Why**: Imperative mood reads naturally in changelogs ("Add X", "Fix Y") and matches git's own conventions (`Merge branch`, `Revert "..."`).

### 6. Be Specific in Descriptions

Reference concrete names, numbers, formats, and components. Avoid generic verbs like "update", "improve", or "fix issue".

CORRECT:

```
fix(runtime): Resolve OpenCASCADE null shape crash on empty STEP files
feat(ui): Add keyboard shortcut Cmd+K for command palette
perf(converter): Reduce STL parse time by 40% via streaming decoder
chore(root): Bump Node.js requirement from 22 to 24
```

INCORRECT:

```
fix(runtime): Fix bug                        # what bug?
feat(ui): Add new feature                    # what feature?
perf(converter): Improve performance         # how? by how much?
chore(root): Update dependencies             # which ones?
```

**Why**: Specific messages are searchable, debuggable, and produce changelogs that users can actually act on. "Fix bug" tells a user nothing about whether a release addresses their issue.

### 7. Keep Subject Lines Under 72 Characters

The `type(scope): description` line must not exceed 72 characters. If more context is needed, use the commit body.

**Why**: Git tooling, GitHub, and terminal UIs truncate long subjects. The 72-character limit ensures the full message is visible everywhere.

### 8. Use the Body for Context, Not Narration

When a body is needed, explain **why** the change was made and any non-obvious trade-offs. Do not repeat what the diff already shows.

CORRECT:

```
fix(runtime): Clamp negative tolerance values in STEP export

Negative tolerance caused OpenCASCADE to produce degenerate faces.
The STEP spec (ISO 10303-42) requires positive-definite tolerance.
Clamping to machine epsilon matches the behavior of FreeCAD and GMSH.
```

INCORRECT:

```
fix(runtime): Clamp negative tolerance values in STEP export

Changed the tolerance parameter to use Math.max with epsilon.
Updated the test to check for the new behavior.
Added a comment explaining the change.
```

### 9. Mark Breaking Changes Explicitly

Indicate breaking changes with `!` after the scope or a `BREAKING CHANGE:` footer:

```
feat(runtime)!: Remove deprecated `renderSync` API

BREAKING CHANGE: `renderSync` has been removed. Use `render` with
`await` instead. See migration guide in docs/guides/v3-migration.mdx.
```

**Why**: Breaking changes trigger major version bumps in semantic versioning. Missing the indicator causes a breaking release to ship as a minor/patch.

### 10. One Logical Change Per Commit

Each commit should represent a single, coherent change. Do not combine unrelated changes in one commit.

**Why**: Atomic commits enable clean reverts, meaningful bisects, and per-change changelog entries. A commit that "Add auth and fix CSS and bump deps" is three changelog entries masquerading as one.

## Anti-Patterns

| Anti-pattern            | Problem                                                | Fix                                     |
| ----------------------- | ------------------------------------------------------ | --------------------------------------- |
| Invented scope          | Appears in no package changelog                        | Use a project name from `project.json`  |
| Missing scope           | Cannot be attributed to any package                    | Always include a scope                  |
| "Fix stuff" / "WIP"     | Useless in changelog and `git log`                     | Describe what was fixed and where       |
| "Update dependencies"   | Which ones? What changed?                              | Name the dependency and version range   |
| Multi-scope mega-commit | Multiple changelog entries collapsed into one          | Split into one commit per logical scope |
| Past tense description  | Inconsistent with git conventions and changelog format | Use imperative present tense            |
| Subject over 72 chars   | Truncated in tooling                                   | Move detail to the body                 |

## Enforcement

### Automated

- **`commit-msg` hook** (`tools/git-hooks/commit-msg`): Validates scope against known project names at commit time. Rejects invalid scopes with the full list of valid options.
- **`scripts/src/validate-project-names.ts`**: CI check ensuring `project.json` names match directory and `package.json` names — keeps the scope source of truth consistent.

### AI-Assisted

- **`scripts/src/aic.sh`**: Dynamically discovers valid scopes from the repo, detects which scopes are touched by staged files, and generates a prompt that constrains the AI to valid scopes only. Invalid scopes are excluded from the AI's options.

## Summary Checklist

- [ ] Format is `type(scope): Description`
- [ ] Type is from the allowed list
- [ ] Scope is a valid project name or `root`
- [ ] Description starts with a capitalized imperative verb
- [ ] Description is specific (names, numbers, formats)
- [ ] Subject line is under 72 characters
- [ ] Body explains "why", not "what" (if present)
- [ ] Breaking changes marked with `!` or `BREAKING CHANGE:` footer
- [ ] One logical change per commit
