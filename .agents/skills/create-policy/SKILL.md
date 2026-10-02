---
name: create-policy
description: Create or update policy documents in docs/policy/. Use when writing a new policy, updating an existing policy, reviewing policy structure, or when the user mentions policy docs, coding standards, or architectural decisions that should be documented as policy.
---

# Create Policy

Guide for authoring policy documents in `docs/policy/`. Policies are internal reference docs that codify decisions, conventions, and rules for the codebase. They are consumed by both humans and AI agents (via `.cursor/rules/*.mdc` summaries).

## Structure Template

Every policy follows this skeleton. Include sections in order; omit optional sections when not applicable.

```markdown
---
title: '{Title} Policy'
description: '{One-line description for agent discoverability}'
status: active
created: 'YYYY-MM-DD'
updated: 'YYYY-MM-DD'
related: # optional
  - docs/research/related-research.md
---

# {Title} Policy

{One-line scope statement: "Internal reference for [what this covers]."}

## Rationale

Why this policy exists. Link the problem to the rules. 2-4 sentences max.

## Rules

### 1. Rule Name

Rule statement. Use imperative voice: "Do X", "Never Y".

**Why**: One sentence explaining the rationale (inline with the rule).

CORRECT:
\`\`\`typescript
// example of correct usage
\`\`\`

INCORRECT:
\`\`\`typescript
// example of what to avoid
\`\`\`

### 2. Next Rule

...

## Anti-Patterns <!-- optional -->

Explicit "do not" rules when the wrong approach is common or tempting.

## Summary Checklist <!-- optional -->

- [ ] Actionable checklist for compliance

## References <!-- optional -->

- [External spec](url)
- Related: `docs/policy/other-policy.md`
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
title: 'My Policy'
description: 'One-line description'
status: active
created: '2026-03-24'
updated: '2026-03-24'
related:
  - docs/research/some-research.md
---
```

INCORRECT:

```yaml
---
## title: 'My Policy'

description: 'One-line description'
status: active
related:
  - docs/research/some-research.md
```

## Section Guide

| Section               | When to include                                    | Purpose                             |
| --------------------- | -------------------------------------------------- | ----------------------------------- |
| **Rationale**         | Always                                             | Connects the problem to the rules   |
| **Rules** (numbered)  | Always                                             | Concrete "must"/"never" statements  |
| **Decision tables**   | When classifying options, mappings, or error codes | Quick reference lookup              |
| **Code examples**     | When rules govern code patterns                    | Show CORRECT/INCORRECT side by side |
| **Anti-patterns**     | When the wrong approach is common                  | Explicit "do not" guidance          |
| **Diagrams**          | When architecture or data flow matters             | ASCII or Mermaid                    |
| **Summary Checklist** | When the policy is implementation-focused          | Review gate before merging          |
| **Known Limitations** | When constraints exist                             | Prevent workaround attempts         |
| **References**        | When external specs or related policies exist      | Cross-link                          |

## Writing Rules

### Voice

- **Imperative/prescriptive** for implementation policies: "Use X", "Never Y", "Must Z"
- **Descriptive** only in Rationale sections to explain "why"
- Strategic policies (e.g. vision) may use aspirational voice

### Example Labels

Use `CORRECT:` and `INCORRECT:` consistently. Do not use Good/Bad, WRONG/RIGHT, or other variants.

### Numbering

Number rules as H3 headings (`### 1. Rule Name`) when the policy has 3+ distinct rules. This makes individual rules referenceable.

### Inline Rationale

Attach `**Why**:` to rules that aren't self-explanatory. Keep to one sentence.

```markdown
### 3. Clone ArrayBuffers Before Transfer

Clone `Uint8Array` content before `postMessage` with transferables.

**Why**: Transfer detaches the original buffer; concurrent consumers get zero-length views.
```

### Tables Over Prose

Prefer decision tables for classification, lifecycle phases, error codes, or option comparisons. Tables are scannable; paragraphs are not.

### Cross-References

Link to related policies and research docs. Use relative paths:

```markdown
- Related: `docs/policy/testing-policy.md`
- Research: `docs/research/filesystem-architecture.md`
```

## Size Budget

- **Target**: 150-400 lines
- **Max**: 500 lines — split into multiple policies if larger
- **Min**: 50 lines — if shorter, consider adding to an existing policy

## Discoverability

Policies are discoverable through a tiered system (see `docs/policy/agents-md-policy.md`). Use the cheapest tier that provides adequate discoverability:

1. **Most policies** need no companion rule. `AGENTS.md` points to `docs/policy/` and the agent can search/read on demand.
2. **Create a glob-scoped `.cursor/rules/*.mdc`** only when the policy governs code patterns during active editing (e.g., `*.test.ts` → testing, `*.tsx` → React patterns). Keep the rule under 50 lines — it references the policy, it does not duplicate it.
3. **Never create an `alwaysApply` rule** for a policy.

```markdown
---
description: Brief description
globs: relevant/file/patterns/**/*.ts
alwaysApply: false
---

# Rule Title

Follow `docs/policy/{name}-policy.md` for the full policy. Key rules:

- Rule 1 summary
- Rule 2 summary
```

## Programmatic Enforcement

**Strong preference**: when a policy rule can be checked by static analysis, create an oxlint rule to enforce it. Lint rules scale across the entire codebase and prevent regressions without human review overhead.

### When to Create a Lint Rule

| Policy rule characteristic                                                | Lint rule? | Example                                                              |
| ------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------- |
| Pattern detectable in AST (string literals, node types, attribute values) | **Yes**    | "No hardcoded hex colors" → `no-hardcoded-color`                     |
| File structure constraint (imports, exports, naming)                      | **Yes**    | "Public exports need JSDoc" → `require-public-export-jsdoc`          |
| Comment/annotation requirement                                            | **Yes**    | "Disable comments need descriptions" → `require-disable-description` |
| Semantic/architectural decision                                           | No         | "Use composition over inheritance"                                   |
| Requires runtime context (contrast ratios, render output)                 | No         | "Meet 4.5:1 contrast"                                                |
| Subjective judgment (code clarity, naming quality)                        | No         | "Names should describe the action"                                   |

### Creating an Oxlint Rule

Rules live in `libs/oxlint/src/rules/`. Follow the existing pattern:

1. **Rule file**: `src/rules/<rule-name>.js`
   - Export a `RuleModule` with `meta` (type, docs, messages, **fixable**) and `create(context)` returning an AST visitor
   - **Autofix is mandatory by default.** Set `meta.fixable: 'code'` (or `'whitespace'`) and provide a `fix(fixer)` callback in every `context.report()` call. Only omit autofix when the correct replacement requires human judgment (e.g., choosing which semantic token to use). Even then, prefer `suggest` (suggestions) over no fix.
   - Use `context.report({ node, messageId, data, fix(fixer) { ... } })` — the `fix` callback uses `fixer.replaceText()`, `fixer.replaceTextRange()`, `fixer.remove()`, or `fixer.insertTextBefore()`/`fixer.insertTextAfter()`
   - Keep algorithms O(n) in file size — avoid nested traversals

2. **Test file**: `src/rules/<rule-name>.test.js`
   - Use `RuleTester` from `eslint` with `tseslint.parser`
   - Include `valid` cases (must NOT flag) and `invalid` cases (must flag with correct `messageId`)
   - Name each test case descriptively

3. **Registration**: Import in `tau-lint.js`, add to `rules` object, bump version

4. **Configuration**: Add to `.oxlintrc.json`
   - Global scope: `"tau-lint/<rule-name>": "warn"` (or `"error"` for zero-tolerance)
   - File-type scope: use `overrides` with `"files"` pattern when the rule applies to specific extensions

5. **Run tests**: `pnpm nx test oxlint ./src/rules/<rule-name>.test.js --watch=false`

### Linking Policy to Lint Rule

When a policy has a companion lint rule, add a note in the policy's rule section:

```markdown
### 1. No Hardcoded Colors

Use semantic design tokens, never raw hex/rgb/hsl values in component files.

**Enforced by**: `tau-lint/no-hardcoded-color` (warn in `.tsx` files)
```

This creates a bidirectional link: the policy explains _why_, the lint rule enforces _what_.

### Existing Policy-to-Lint Mappings

| Policy                                        | Lint Rule                              | Severity           |
| --------------------------------------------- | -------------------------------------- | ------------------ |
| Color Policy § No hardcoded colors            | `tau-lint/no-hardcoded-color`          | warn (`.tsx` only) |
| JSDoc Policy § Public exports                 | `tau-lint/require-public-export-jsdoc` | warn               |
| Lint Policy § Disable descriptions            | `tau-lint/require-disable-description` | error              |
| TypeScript Policy § No `as const` on literals | `tau-lint/no-literal-const-assertion`  | error              |
| WebGPU Shader & Pipeline Policy § Rule 1      | `tau-lint/no-scene-override-material`  | error              |

## Checklist

Before finalizing a policy:

- [ ] Filename matches `docs/policy/{name}-policy.md`
- [ ] YAML frontmatter with title, description, status, created, updated — dates single-quoted
- [ ] Frontmatter `title` matches H1 heading
- [ ] Frontmatter `related` lists cross-referenced docs
- [ ] Opens with one-line scope statement
- [ ] Has Rationale section
- [ ] Rules are numbered and use imperative voice
- [ ] Examples use CORRECT/INCORRECT labels
- [ ] Tables used for classification (not prose)
- [ ] Under 500 lines
- [ ] Passes `pnpm docs:validate`
- [ ] Companion `.cursor/rules/*.mdc` only if policy governs active editing patterns
- [ ] Lint rules created for any programmatically enforceable rules (strong preference)
