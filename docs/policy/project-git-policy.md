---
title: 'Project Git Policy'
description: 'Rules for the Git files Tau generates into every user project: a minimal ignore block that only excludes what stock Git would otherwise track, and new Tau files placed under .tau/.'
status: active
created: '2026-11-26'
updated: '2026-11-26'
related:
  - docs/policy/revisions-policy.md
  - docs/policy/filesystem-authority-policy.md
  - docs/research/project-gitignore-minimisation.md
---

# Project Git Policy

Internal reference for the Git surface Tau leaves in a person's project: the generated `.gitignore` block (or `.git/info/exclude` for an adopted repository), the generated `.gitattributes` block, and the top-level names Tau reserves in a project directory.

## Rationale

The generated ignore block is the one Tau artifact a person reads in their own checkout, every time they open `.gitignore`. It once carried 26 lines, 19 of them repeating what `/.tau/*` already excluded or what Git never tracks anyway, which made it look like Tau did not understand gitignore. The registry (`packages/filesystem/src/path-registry.ts`) stays the single source of truth; these rules govern how little of it reaches the person's file, and where a new Tau file may live so it costs no line at all.

## The generated block today

```gitignore
# BEGIN Tau generated — derived content is never versioned
/.tau/*
!/.tau/parameters
!/.tau/machines
.jj
/exports/
/thumbnail.webp
node_modules/
# END Tau generated
```

`workspace-config.test.ts` pins this block literally. A change to it arrives as a reviewable diff, and the reviewer checks it against the rules below.

## Rules

### 1. Emit a line only where stock Git would otherwise track an unversioned path

A generated ignore line exists for exactly one reason: without it, `git add -A` in the person's checkout would track a path `classify()` calls unversioned (PP5). Never emit a line to "name the family", to document the layout, or for symmetry with the registry. The registry documents the layout; the block only has to be correct.

**Why**: Every redundant line is noise in a file the person owns, and a reader cannot tell a load-bearing line from a decorative one.

CORRECT:

```gitignore
/.tau/*
```

INCORRECT:

```gitignore
/.tau/*
/.tau/chats/
/.tau/runs/
/.tau/cache/
```

### 2. Never repeat what the reserved head already excludes

`/.tau/*` excludes every member of the root `.tau/` directory. An unversioned row that is root-matched (`anchored: true`), lives directly or deeply inside `.tau/`, and sits under no versioned row that a `!` line re-includes gets no line. A row beneath a re-included one (`.tau/skills/private` under `!/.tau/skills`) is no longer under the head and keeps its own line. The generator derives both (`coveredByHead`); do not add an override that re-emits a covered row.

### 3. Never ignore what Git or its owning tool already leaves untracked

Git's directory walk never enters an entry named `.git` (directory or pointer file) at any depth. Mark such registry rows `selfIgnored: true`; they stay control-plane (hidden, unversioned, refused by every view) but take no ignore line. Mark a row `selfIgnored` only with a stock-Git test that proves Git leaves it untracked without Tau's block.

| Store         | Why Git leaves it untracked                                                                                     | Ignore line       |
| ------------- | --------------------------------------------------------------------------------------------------------------- | ----------------- |
| `.git`        | Git skips every `.git` entry in its walk (`dir.c`)                                                              | none              |
| `.jj`         | Only a store colocated with Git gets Jujutsu's own `.jj/.gitignore` (`/*`); a nested non-colocated one has none | `.jj`, unanchored |
| `.hg`, `.svn` | Nothing; not a registry row (shell-grant denies them only)                                                      | n/a               |

### 4. The only negations are re-includes of authored `.tau` controls

A `!` line exists only to re-include a versioned registry row directly inside `.tau/` (`.tau/parameters`, `.tau/machines`). Keep every authored control a direct member of `.tau/`: a nested one needs a `!/.tau/a/` + `/.tau/a/*` chain, which the generator deliberately does not emit.

### 5. Put every new Tau-owned path under `.tau/`

A new derived, cached, record, staging or control path that Tau writes into a project or storage root lives under that root's `.tau/` and is root-matched. It then needs no ignore line (rule 2) and adds no top-level name to the person's project. A new top-level name, or a new segment-matched row, needs a written justification in the change and a reviewer's agreement; "it was simpler to put it at the root" is not one.

**Why**: `.tau-staging` was a second top-level dot-folder that cost its own ignore line; as `.tau/staging` it costs neither.

### 6. Spell each remaining line in its simplest form

Anchor a root-only row with a leading `/`. Spell an any-depth name without an inner `/` bare (`node_modules/`), never `**/node_modules/`; use `**/` only when the prefix holds an inner `/`, which Git would otherwise anchor. Give a directory row its trailing `/`, except a control-plane row, which also covers a pointer file.

### 7. Prove PP5 with stock Git, not only with a matcher

Any change to the registry or the generator keeps the stock-Git case in `packages/revisions/src/workspace-config.test.ts` green: it writes the block into a real repository and asserts, path by path, what `git add -A --dry-run` would track. Add a path to that case for every new row. `git check-ignore` alone is not the verdict: it cannot see Git's intrinsic `.git` skip.

### 8. Breaking layout moves are hard cutovers unless the operator asks otherwise

Moving a Tau-owned path (as `.tau-staging` → `.tau/staging`) ships as a breaking change in the package's version plan, without a legacy reader or migration, while the product's install base is small. Leftover bytes at the old path are inert and are not swept. Revisit this rule before general availability.

### 9. Keep a cross-tool convention's file at the convention's path

A file that other tools read by a fixed, published path stays at that path and takes no registry row: the project's instructions are `AGENTS.md` at the project root, and its skills live under `.agents/skills/<name>/`. They are the person's own files, authored and versioned by the unlisted default, so they cost no ignore line and no `!` line. Never give such a file a Tau-private copy under `.tau/`, and never generate Tau content into it.

**Why**: `.tau/AGENTS.md` and `.tau/skills` each needed a registry row and a re-include line, and no agent but Tau's could find them. At the conventional paths every agent reads them, a publication carries them into a remix, and the block is two lines shorter (`docs/research/project-agent-files-standard-paths.md`).

CORRECT:

```typescript
{ prefix: '.tau/staging', class: 'control-plane', versioned: false, anchored: true, match: 'root', ... }
```

INCORRECT:

```typescript
{ prefix: '.tau-staging', class: 'control-plane', versioned: false, anchored: false, match: 'segment', ... }
```

## Anti-Patterns

- Re-emitting a `.tau/*` row "so the file names every family".
- Adding `**/.git`, `.DS_Store`, editor or OS patterns to Tau's block; the person's own lines or global excludes own those.
- A new top-level dot-folder (`.tau-<thing>`) for a Tau implementation detail.
- Asserting the block with `toContain` instead of the literal pin, which lets a redundant line slip in unreviewed.

## Summary Checklist

- [ ] The new or changed row is under `.tau/` and root-matched, or the change justifies otherwise.
- [ ] The literal block pin in `workspace-config.test.ts` changed only by lines rule 1 requires.
- [ ] The stock-Git case covers the new path and passes.
- [ ] `selfIgnored` is set only on a store Git or its tool leaves untracked, with test evidence.
- [ ] A moved path has a breaking version-plan entry.

## References

- Generator: `packages/revisions/src/workspace-config.ts` (`generatedIgnoreEntries`)
- Registry: `packages/filesystem/src/path-registry.ts`
- PP3/PP5: [filesystem authority policy](filesystem-authority-policy.md)
- Revisions storage classes: [revisions policy](revisions-policy.md)
- Research: `docs/research/project-gitignore-minimisation.md`
- [gitignore(5)](https://git-scm.com/docs/gitignore); [Jujutsu Git compatibility](https://jj-vcs.github.io/jj/latest/git-compatibility/)
