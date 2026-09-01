---
name: create-research
description: Create or update research documents in docs/research/. Use when investigating a bug root cause, auditing code or configuration, comparing libraries or approaches, designing architecture, evaluating migration paths, or when the user mentions research, investigation, audit, analysis, or deep dive.
---

# Create Research

Guide for authoring research documents in `docs/research/`. Research docs are investigative artifacts that capture analysis, evidence, and recommendations. They inform decisions and often feed into policy docs (`docs/policy/`).

## Research vs Policy

| Dimension     | Research (`docs/research/`)        | Policy (`docs/policy/`)      |
| ------------- | ---------------------------------- | ---------------------------- |
| **Purpose**   | Investigate, compare, recommend    | Prescribe rules and patterns |
| **Voice**     | Analytical, investigative          | Imperative, prescriptive     |
| **Lifecycle** | Point-in-time snapshot             | Ongoing, maintained          |
| **Outcome**   | "Here's what we found; consider X" | "Do X; never Y"              |
| **Length**    | 150–600 lines typical              | 150–400 lines typical        |

When findings solidify into stable rules, extract them into a policy using the `create-policy` skill.

## Research Types

Identify the type of research before writing. Each type emphasizes different sections.

| Type                         | When to use                                             | Key sections                                                 |
| ---------------------------- | ------------------------------------------------------- | ------------------------------------------------------------ |
| **Audit/Inventory**          | Systematic review of existing code, config, or patterns | Methodology, Inventory table, Issues found, Priorities       |
| **Root Cause Investigation** | Debugging a specific problem or regression              | Problem, Evidence/traces, Root cause, Fix                    |
| **Comparison/Evaluation**    | Choosing between options, libraries, or approaches      | Options table, Trade-offs, Verdict per area                  |
| **Architecture Blueprint**   | Designing a new system or subsystem                     | Target architecture, Layers, Data flow diagrams, Roadmap     |
| **Migration/Upgrade**        | Moving to a new version or system                       | Current vs target, Breaking changes, Migration steps         |
| **Optimization**             | Improving performance, size, or resource usage          | Baseline metrics, Experiment data, Recommendations           |
| **Technical Reference**      | Documenting an external API, spec, or system            | Architecture overview, Feature catalog, Integration strategy |

## Structure Template

Every research doc follows this skeleton. Include sections in order; omit optional sections when not applicable.

```markdown
---
title: '{Title}'
description: '{One-line description for agent discoverability}'
status: draft
created: 'YYYY-MM-DD'
updated: 'YYYY-MM-DD'
category: audit # audit | investigation | comparison | architecture | migration | optimization | reference
related: # optional
  - docs/policy/related-policy.md
---

# {Title}

{One-line scope statement: what is being investigated and why.}

## Executive Summary <!-- recommended -->

2-4 sentences: problem, key finding, recommendation.

## Table of Contents <!-- for docs >200 lines -->

## Problem Statement

What triggered this investigation. Include symptoms, error messages, or the question being answered.

## Methodology <!-- recommended -->

How the investigation was conducted: tools, commands, source analysis, experiments.

## Findings

Present findings with tables, tiered lists, or matrices. Number significant findings for referenceability.

### Finding 1: Title

Evidence and analysis.

## Recommendations

Actionable next steps. Prioritize with severity/effort/impact when applicable.

| #   | Action | Priority | Effort | Impact |
| --- | ------ | -------- | ------ | ------ |
| R1  | ...    | P0       | Low    | High   |

## Trade-offs <!-- optional -->

When comparing options or approaches. Use comparison tables.

## Code Examples <!-- optional -->

Snippets, diffs, or repro scripts that support findings.

## Diagrams <!-- optional -->

ASCII or Mermaid diagrams for architecture, data flow, or state machines.

## References <!-- optional -->

- [External spec or issue](url)
- Related: `docs/research/other-research.md`
- Policy: `docs/policy/related-policy.md`

## Appendix <!-- optional -->

Detailed data tables, file inventories, or raw experiment results.
```

## Frontmatter Pitfalls

Two errors that repeatedly break `pnpm docs:validate`:

1. **Unquoted dates** — YAML auto-parses bare `YYYY-MM-DD` as `Date` objects. The validator expects strings. Always single-quote dates.

CORRECT:

```yaml
created: '2026-03-24'
updated: '2026-03-24'
```

INCORRECT:

```yaml
created: 2026-03-24
updated: 2026-03-24
```

2. **Markdown syntax in YAML** — The frontmatter block between `---` delimiters is pure YAML. Markdown headings (`##`), blank lines between fields, or markdown list syntax (`- ` without indentation for `related`) will corrupt the parse.

CORRECT:

```yaml
---
title: 'My Research'
description: 'One-line description'
status: draft
created: '2026-03-24'
updated: '2026-03-24'
category: audit
related:
  - docs/policy/some-policy.md
---
```

INCORRECT:

```yaml
---
## title: 'My Research'

description: 'One-line description'
status: draft
related:
  - docs/policy/some-policy.md
```

## Section Guide

| Section                 | When to include                                | Purpose                              |
| ----------------------- | ---------------------------------------------- | ------------------------------------ |
| **Executive Summary**   | Docs >100 lines or with a clear finding        | Quick orientation for readers        |
| **Problem Statement**   | Always                                         | Frames the investigation             |
| **Methodology**         | When the approach matters for reproducibility  | Enables others to verify or extend   |
| **Findings** (numbered) | Always                                         | Core content — evidence and analysis |
| **Recommendations**     | When findings lead to actionable changes       | Prioritized next steps               |
| **Trade-offs**          | When comparing options                         | Side-by-side evaluation              |
| **Code Examples**       | When illustrating behavior, bugs, or APIs      | Concrete evidence                    |
| **Diagrams**            | When architecture or flow matters              | Visual clarity                       |
| **References**          | When citing external sources or related docs   | Traceability                         |
| **Appendix**            | When detailed data would clutter main sections | Keeps body focused                   |

## Status Tracking

Research docs evolve. Track document-level status in frontmatter (`status` field):

- **draft**: Investigation in progress, findings may change
- **active**: Investigation complete, findings are current
- **superseded**: Replaced by a newer document (set `superseded_by` in frontmatter)

Mark resolved items and implemented recommendations inline in the body:

```markdown
### Issue 3: Worker leak on hot reload

**Status**: ✅ RESOLVED (PR #482)

...
```

## Writing Principles

### Analytical Voice

Research docs explain and recommend, not mandate. Use "we found", "evidence suggests", "recommend" — not "must", "never", "always" (save those for policies).

```markdown
<!-- Research voice -->

Analysis shows the Comlink bridge adds ~2ms overhead per RPC call.
Recommendation: use direct postMessage for hot-path operations.

<!-- Policy voice (don't use in research) -->

Never use Comlink for hot-path operations.
```

### Evidence Over Opinion

Support findings with data: benchmarks, traces, code references, experiment results, or upstream documentation.

```markdown
<!-- Weak -->

The V8 build is too large.

<!-- Strong -->

The V8 build is 14.2 MB (2.08× increase from V7.6.2's 6.8 MB).
Root cause: 40% from new `DEStep` package, 35% from exception tables.
```

### Tables for Structured Findings

Prefer tables and matrices for inventories, comparisons, and prioritized lists. Tables are scannable; prose paragraphs are not.

### Numbered Findings and Recommendations

Number significant findings (`### Finding 1: ...`) and recommendations (`R1`, `R2`, ...) so they can be referenced in discussions, PRs, and policy docs.

### Scoped Non-Goals

When the investigation has a defined boundary, state what is out of scope to prevent scope creep.

```markdown
## Scope and Non-Goals

**In scope**: Build flags for OCCT WASM compilation
**Out of scope**: Runtime performance benchmarking (separate investigation)
```

## Cross-References

Use the `related` field in frontmatter for machine-parseable cross-references. CI validates that all paths exist.

```yaml
related:
  - docs/policy/filesystem-policy.md
  - docs/research/fs-capabilities.md
```

A human-readable `## References` section in the body can still exist for external links and explanatory context.

## Size Budget

- **Typical**: 150–600 lines
- **Max**: 800 lines — split into focused sub-investigations if larger
- **Changelogs/references** may exceed this (e.g., upstream release notes)

## Filename Convention

`docs/research/{descriptive-slug}.md`

Use descriptive slugs that identify the subject: `filesystem-architecture`, `occt-wasm-optimization`, `xstate-patterns`. Do not include dates in filenames (dates go in frontmatter).

## Checklist

Before finalizing a research document:

- [ ] Filename matches `docs/research/{slug}.md`
- [ ] YAML frontmatter with title, description, status, created, updated, category — dates single-quoted
- [ ] Frontmatter `title` matches H1 heading
- [ ] Frontmatter `related` lists cross-referenced docs
- [ ] Opens with one-line scope statement
- [ ] Has Problem Statement section
- [ ] Findings are evidence-based (data, code, traces — not opinion)
- [ ] Tables used for inventories, comparisons, and priorities (not prose)
- [ ] Recommendations are numbered and prioritized when applicable
- [ ] Under 800 lines (or justified exception for reference docs)
- [ ] Passes `pnpm docs:validate`
- [ ] No secrets, tokens, or credentials
