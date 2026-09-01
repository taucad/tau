---
title: 'Documentation Policy'
description: 'Standards for writing and maintaining Tau documentation: content types, templates, AI discoverability, API reference, sidebar navigation, and cross-linking. Applies to apps/ui/content/docs/ and docs/.'
status: active
created: '2026-02-23'
updated: '2026-05-21'
---

# Documentation Policy

Internal reference for writing and maintaining Tau documentation. Applies to all content under `apps/ui/content/docs/` and policy documents under `docs/`.

## Rationale

Consistent documentation structure improves both human navigation and AI agent consumption. A systematic framework (pragmatic Diataxis) reduces contributor drift, enables deterministic agent-produced content, and optimizes for RAG retrieval and context-window efficiency.

## 1. Framework Evaluation & Rationale

We evaluated six documentation frameworks before settling on an approach:

| Framework               | Strengths                                                                                                        | Why not (alone)                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Diataxis**            | Systematic four-type model; proven at NX, Cloudflare, Django; single-purpose pages ideal for LLM context windows | Conflates quickstart with tutorial; rigid four-bucket navigation confuses contributors |
| **Good Docs Project**   | Practical templates for 14+ content types; reduces blank-page anxiety                                            | Too many types for a single-package project; no cohesive information architecture      |
| **DITA**                | Formal XML standard; strong content reuse                                                                        | XML-based, incompatible with MDX/fumadocs; massive overhead                            |
| **Information Mapping** | Chunking/labeling principles map well to LLM retrieval                                                           | Proprietary; no modern tooling                                                         |
| **EPPO**                | "Every Page Is Page One" self-containment; excellent for search and RAG                                          | No content-type taxonomy; no structural templates                                      |
| **Stripe-style**        | Gold-standard DX; progressive disclosure; code-first                                                             | No formal framework; hard to systematize for agent production                          |

**Decision**: Pragmatic Diataxis -- use Diataxis as the structural backbone with two modifications that optimize for SDK documentation, AI agent consumption, and systematic agent-produced content.

### Why this works for agents and humans

- **Single-purpose pages** fit efficiently in LLM context windows. The "lost in the middle" effect (where models lose information mid-context) is mitigated by keeping pages focused and under 2000 words.
- **Structural templates** for each content type give agents deterministic guardrails. An agent tasked with writing a how-to guide follows the template; it cannot drift into a tutorial-reference hybrid.
- **Feature-oriented navigation** lets human developers find content by intent ("I need to set up a filesystem") rather than by documentation taxonomy ("Is this a how-to or a tutorial?").
- **77% of documentation teams use no established framework** (State of Docs 2025). Adopting a systematic approach is itself a competitive advantage.

## 2. Pragmatic Diataxis

Two modifications to standard Diataxis.

### Modification 1: Feature-Oriented Navigation

Content is organized by **developer journey stage**, not by Diataxis content-type labels:

| Directory          | Diataxis type         | Developer intent                       |
| ------------------ | --------------------- | -------------------------------------- |
| `getting-started/` | Quickstart + Tutorial | "I want to start using this"           |
| `guides/`          | How-to guide          | "I need to accomplish a specific task" |
| `concepts/`        | Explanation           | "I want to understand why this works"  |
| `api/`             | Reference             | "I need to look up a specific API"     |

Users find content by what they want to do, not by what kind of document it is. This follows the Stripe and NX pattern.

### Modification 2: Quickstart as a Distinct Content Type

Diataxis treats quickstart as a tutorial. For SDK documentation, these serve fundamentally different needs:

- **Quickstart**: Goal is first success. Install, copy-paste 20 lines, see output. Under 5 minutes. No learning objectives, no digressions.
- **Tutorial**: Goal is learning. Step-by-step guided practice. 15-30 minutes. Builds understanding through doing.

This gives us **five content types**: quickstart, tutorial, how-to guide, explanation, reference.

## 3. Content Types & Templates

Every documentation page must follow the template for its content type. These templates ensure consistency and give agents deterministic structure to follow.

### 3.1 Quickstart

**Purpose**: First successful use of the package in minimal time.
**Audience**: Developer who just discovered the package.
**Tone**: Direct, imperative. No explanations beyond what's needed to succeed.
**Location**: `getting-started/quick-start.mdx`

**Required sections**:

```
---
title: [Descriptive title]
description: [What you'll achieve, max 160 chars]
---

# [Title]

[1-sentence: what you will accomplish]

## Prerequisites

[Bulleted list with links to installation/setup if needed]

## Install

[Package manager commands in code tabs]

## [Action -- e.g., "Render Your First Model"]

[Complete, copy-paste code block with ALL imports. No partial snippets.]

## Expected Output

[What the developer should see -- text output, screenshot description, or data shape]

## What's Next

[2-3 links: tutorial for deeper learning, API reference for the functions used, a how-to guide for a common next task]
```

**Constraints**: Must be completable in under 4 minutes. No conceptual digressions. Every "why" question links to a concepts page instead of being answered inline.

### 3.2 Tutorial

**Purpose**: Build skills through guided, hands-on practice.
**Audience**: Developer who wants to learn the package properly.
**Tone**: Instructional, encouraging. Explain _what_ each step does and _why_.
**Location**: `getting-started/*.mdx`

**Required sections**:

```
---
title: [Descriptive title]
description: [What you'll learn, max 160 chars]
---

# [Title]

## What You'll Learn

[Bulleted list of 3-5 learning outcomes]

## Prerequisites

[What the reader needs before starting, with links]

## Step 1: [Action]

[Explanation of what this step does and why]

[Code block]

[Verification -- what should happen after this step]

## Step 2: [Action]

[Continue pattern...]

## Recap

[Summary of what was built and what was learned]

## Next Steps

[Links to related how-to guides, advanced tutorials, or concept pages]
```

**Constraints**: Every step must have a verification checkpoint. Code must build incrementally -- each step extends the previous one. Include learning goals at the top and a recap at the bottom.

### 3.3 How-To Guide

**Purpose**: Solve a specific problem. Task-oriented, assumes competence.
**Audience**: Developer who knows the basics and needs to accomplish something specific.
**Tone**: Concise, practical. No teaching -- just show how.
**Location**: `guides/*.mdx`

**Required sections**:

```
---
title: [Task-oriented title starting with a verb]
description: [What this guide helps you do, max 160 chars]
---

# [Title]

[1-2 sentences: what problem this solves]

## Prerequisites

[What you need before starting, with links to relevant pages]

## Steps

### 1. [Action]

[Code + minimal explanation]

### 2. [Action]

[Continue pattern...]

## Variations

[Alternative approaches, edge cases, or configuration options]

## Related

- [Link to concept page explaining the underlying mechanism]
- [Link to API reference for the functions used]
- [Link to related how-to guides]
```

**Constraints**: Limit to 8-10 steps. If more steps are needed, split into multiple guides. Assume the reader has completed the quickstart.

### 3.4 Explanation

**Purpose**: Help the reader understand _why_ things work the way they do.
**Audience**: Developer seeking deeper understanding of architecture or design decisions.
**Tone**: Reflective, analytical. Connect concepts to each other.
**Location**: `concepts/*.mdx`

**Required sections**:

```
---
title: [Concept name]
description: [What this explains, max 160 chars]
---

# [Title]

[1-2 paragraphs: context and motivation. Why does this concept exist? What problem does it solve?]

## How It Works

[Core explanation with diagrams (prefer mermaid). Break into subsections as needed.]

## Key Relationships

[How this concept relates to other parts of the system. Link to relevant concept, reference, and guide pages.]

## Implications

[What this means for the developer. Design trade-offs, performance characteristics, or constraints to be aware of.]

## Further Reading

[Links to API reference pages, related concepts, and external resources]
```

**Constraints**: Must include at least one diagram (mermaid preferred). No step-by-step instructions -- link to how-to guides instead.

### 3.5 Reference

**Purpose**: Factual, complete API documentation for lookup.
**Audience**: Developer who knows what they're looking for.
**Tone**: Austere, precise. No opinions, no teaching.
**Location**: `api/*.mdx`

**Required sections**:

```
---
title: [API area name]
description: [What APIs are covered, max 160 chars]
---

# [Title]

[1-2 sentences: when you would use this API area]

## [Function/Type Name]

<auto-type-table path="./props/[file].ts" name="[TypeName]" />

### Usage

[Minimal code example showing the most common usage pattern]

## Related

- [Link to how-to guide demonstrating practical usage]
- [Link to concept page explaining the design]
- [Link to other reference pages for related APIs]
```

**Constraints**: Auto-generated from JSDoc via `fumadocs-typescript`'s `remarkAutoTypeTable`. Only public API types appear -- use dedicated props files that re-export the intended public surface. Brief context paragraph only; no explanatory content (link to concepts pages instead).

## 4. Page Self-Containment (EPPO)

Every page must make sense when read in isolation. This is critical for search-driven navigation (humans) and RAG retrieval (AI agents).

**Requirements**:

- Each page states its purpose in the first paragraph.
- Prerequisites link to the pages that cover them. Never assume the reader has read any other page.
- Code examples include all necessary imports. No "assuming you have the client from the previous section" patterns.
- Technical terms link to their definition on first use within the page.
- Each page has a complete frontmatter block with `title` and `description`.

## 5. AI Agent Discoverability

Documentation must be optimized for consumption by AI agents (ChatGPT, Claude, Cursor, Codex) tasked with integrating Tau packages.

### llms.txt Standard

Every documentation page is automatically indexed in `/llms.txt` via the fumadocs integration in `apps/ui/app/lib/fumadocs/get-llms-text.ts`. The `description` frontmatter field populates the annotation for each page in this index. **Every MDX page MUST have a `description` field** -- without it, the page appears as an unannotated link in the LLM index.

### Individual Page Markdown

Individual pages are available as raw markdown at `*.mdx` endpoints via the `llms.mdx` route. To ensure clean markdown output:

- Use clear H2/H3 headings to structure content.
- Use fenced code blocks with language tags (`typescript`, `bash`, `json`).
- Include explicit package import paths in code examples (`@taucad/runtime`, `@taucad/runtime/kernels`, etc.).

### Structured Metadata

- Title in H1 (matches frontmatter `title`).
- Description in frontmatter (max 160 characters).
- Single-topic pages. No multi-topic omnibus documents.
- Break content with headings every 200-400 words. No walls of text.

### Context Window Optimization

- Keep pages under 2000 words. Prefer linking to related pages over inlining large blocks of content.
- Smaller focused pages produce chunks that fit in agent context windows without triggering the "lost in the middle" degradation where models lose information from the center of long contexts.
- Each page should be independently useful when retrieved by a RAG system.

### Agent-Friendly Code Examples

- Always include the full package import path.
- Use TypeScript.
- Show complete, runnable snippets (not fragments).
- Annotate expected output with comments or a separate "Expected Output" section.

## 6. API Reference Standards

### JSDoc Requirements

All public APIs in `packages/` must have JSDoc documentation. This is enforced by ESLint (`eslint.config.mjs`, lines 325-367):

- `jsdoc/require-jsdoc` with `publicOnly: true` on functions, methods, classes, types, and interfaces.
- `jsdoc/require-description` on all public declarations.
- `jsdoc/require-param-description` and `jsdoc/require-returns-description` for parameters and return values.

**JSDoc must include**:

- A description of what the function/type does.
- `@param` tags with descriptions for all parameters.
- `@returns` tag with description for functions with non-void return types.
- `@example` tag for key public functions (factory functions, `createRuntimeClient`, `defineKernel`, `defineMiddleware`, `defineBundler`).

For `@example` standards (compilable examples, real-world usage, language tags), see [JSDoc Policy](jsdoc-policy.md).

### Auto-Generated Reference Docs

Reference documentation is auto-generated from JSDoc using `fumadocs-typescript`'s `remarkAutoTypeTable` remark plugin. The workflow:

1. JSDoc comments on source types in `packages/runtime/src/` are the source of truth.
2. Dedicated props files in `apps/ui/content/docs/(runtime)/api/props/` re-export only the intended public API types.
3. MDX reference pages use `<auto-type-table path="./props/[file].ts" name="[TypeName]" />` to render type tables.
4. Only types explicitly re-exported in props files appear in docs. No internal types leak.

### Public API Boundary

A type is "public" if it is exported from one of the package's entry points defined in `package.json` `exports`. Internal implementation types (framework internals, worker protocol messages, internal kernel state) must NOT appear in props files even if they are technically exported for cross-module use.

## 7. Cross-Linking Rules

Documentation pages must link to related content to support navigation across content types:

- Every **quickstart/tutorial** links to the API reference pages for the functions it uses.
- Every **API reference** page links to the how-to guide(s) that demonstrate practical usage.
- Every **how-to guide** links to the concept page that explains _why_ the approach works.
- Every **concept** page links to related reference and how-to content.
- Use **relative MDX links** (e.g., `../api/client`), never absolute URLs to docs pages.
- Every page's "Related" or "Next Steps" section should contain at least one link to a different content type.

## 8. Content Conventions

### Frontmatter

Every MDX page requires:

```yaml
---
title: [Descriptive title -- not generic like "Overview"]
description: [What this page covers, max 160 characters]
icon: [Optional lucide icon name, e.g., lucide:rocket]
---
```

### Code Examples

- Use TypeScript (not JavaScript).
- Include all imports at the top of each code block.
- Show complete, runnable code -- not fragments.
- Annotate expected output with comments or a dedicated section.
- Use code tabs for package manager commands (`npm`, `pnpm`, `yarn`).
- For inline identifiers in prose (same highlighting as fenced blocks), append `{:ts}` / `{:tsx}` / `{:bash}` / etc. after the closing backtick content: `` `client.shutdown(){:ts}` `` (Fumadocs `@shikijs/rehype` tailing-curly-colon mode). Omitting the suffix is allowed but renders plain monospace.

### Callouts

Use callouts for prerequisites, warnings, tips, and important notes. Never use callouts for primary content -- the main instructional flow should be in regular prose and code blocks.

### Progressive Complexity

Within a section, order pages from simple to advanced. The `meta.json` page ordering defines the learning path.

### File Naming

- Use kebab-case for all MDX filenames: `custom-middleware.mdx`, not `customMiddleware.mdx`.
- Use descriptive titles. Prefer "Kernels Overview" over "Overview". Prefer "Create Custom Middleware" over "Middleware".
- Folder names match their purpose: `getting-started/`, `guides/`, `concepts/`, `api/`.

## 9. Sidebar Navigation Structure

The sidebar is the docs' primary wayfinding surface. A clear, stutter-free
structure is as important as the prose on each page — readers form their
mental model of the product from what they scan in the sidebar before they
open any page.

### Rationale (May 2026 best practices)

Reviewed practice across Stripe, Vercel/Next.js, Cloudflare, Mintlify, and
the Fumadocs reference docs:

- **No label repetition.** A section name appears once: either as a separator
  heading (non-collapsible, always-visible) or as a collapsible group label
  — never both. The "Guides / Guides" stutter is the most common
  anti-pattern on Fumadocs sites and is purely a configuration accident.
- **Maximum 2–3 levels of depth.** Beyond that, click fatigue and
  orientation cost dominate. If you need a fourth level, you're better off
  splitting into a separate doc site or a tabbed top-level switcher.
- **Top-level sections always visible.** Primary section contents (Getting
  Started, Guides, Concepts, Reference, Examples) should not be hidden behind
  an extra click. The collapsible-group pattern is reserved for nested
  sub-groupings (e.g. "OCJS package API" inside Reference) and for
  auto-generated trees too large to inline (e.g. the 5000-class OCJS API
  Reference).
- **Section separators carry the section name.** This is the Stripe/Vercel
  pattern: each top-level section gets a non-clickable heading that fences
  its pages visually. The pages below it are direct children, not items
  inside a re-stating collapsible.

### Required structure for Fumadocs sites

The root `meta.json` MUST use one of these two stutter-free patterns:

**Pattern A (preferred)** — extract folder contents inline with the
`...folder-name` syntax. The folder's own `meta.json` owns the page order;
the root just composes sections.

```json
{
  "title": "Documentation",
  "pages": [
    "index",
    "---Getting Started---",
    "...getting-started",
    "---Guides---",
    "...guides",
    "---Concepts---",
    "...concepts",
    "---Reference---",
    "...reference",
    "api",
    "---Examples---",
    "...examples"
  ]
}
```

This produces an always-visible flat list of pages under each separator
heading. The folder's own `meta.json` title (e.g. `"title": "Guides"`) is
preserved for cases where the folder _is_ rendered as a group elsewhere
(breadcrumbs, sub-trees) but does not double-render in the root sidebar.

**Pattern B (acceptable)** — explicit page paths under separators. Use this
when you need cross-folder interleaving or want absolute control over which
pages surface at the root level.

```json
{
  "pages": [
    "index",
    "---Getting Started---",
    "getting-started/installation",
    "getting-started/quick-start",
    "---Guides---",
    "guides/choosing-a-kernel",
    "guides/live-rendering"
  ]
}
```

This is the pattern Tau's runtime docs (`apps/ui/content/docs/runtime/meta.json`) use.

### Forbidden pattern

The combination of a separator heading **and** the folder name as the next
entry (which Fumadocs renders as a collapsible re-stating the section name)
is forbidden:

```json
// WRONG — produces a "Guides / Guides" stutter in the sidebar
{
  "pages": ["---Guides---", "guides"]
}
```

If you see a section name appearing twice in adjacent sidebar slots, this is
the bug. Convert to Pattern A by changing `"guides"` to `"...guides"`.

### When to use collapsible groups

A collapsible (folder rendered as a group with its title) is the right
choice in three cases:

1. **Auto-generated trees too large to inline** (e.g. 5000-class API
   references). Set `defaultOpen: false` in the folder's `meta.json` so the
   sidebar isn't drowned by it at first paint.
2. **Nested sub-groupings inside a primary section** (e.g. `OCJS package
API` inside `Reference`). One level of nesting under a primary section
   is fine; two or more is not.
3. **Optional / advanced material gated behind explicit interest** (e.g. a
   "Build pipeline (maintainers)" subgroup that consumer-track readers
   shouldn't have to scan past).

### Inline sub-separators

Within an inlined section, sub-separators (`---Build pipeline
(maintainers)---` etc.) are permitted and render as a visual fence inside
the parent section. Use them sparingly — at most one or two per section —
to fence audience-specific subgroups.

### Sidebar depth budget

- **Level 1:** Top-level separator (e.g. "Concepts").
- **Level 2:** Pages directly under the separator OR a single nested
  collapsible group.
- **Level 3:** Pages inside that nested collapsible.

Three levels is the hard ceiling for human navigation. Four-level structures
must be split across multiple top-level sections, tabs, or doc sites.

### Verification

When adding or restructuring sidebar entries:

1. Build the site (`pnpm build`) and visually scan the sidebar for adjacent
   identical labels.
2. Confirm every primary section heading is followed by pages (not by a
   collapsible re-stating the section name).
3. Confirm collapsibles only appear for the three cases above.
