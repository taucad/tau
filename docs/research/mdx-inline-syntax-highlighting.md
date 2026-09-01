---
title: 'MDX Inline Syntax Highlighting for Fumadocs'
description: 'Investigate options for adding Shiki-powered inline code highlighting to prose in `apps/ui/content/docs/**` so API references like `shutdown({ drain: true })` render with the same color treatment as fenced code blocks.'
status: active
created: '2026-05-04'
updated: '2026-05-04'
category: comparison
related:
  - docs/policy/documentation-policy.md
  - docs/research/diff-viewer-shiki-notation-leak.md
---

# MDX Inline Syntax Highlighting for Fumadocs

Survey of the design space for adding inline syntax highlighting to MDX prose in `apps/ui/content/docs/`, with a recommendation grounded in our current Fumadocs + Shiki pipeline.

## Executive Summary

Today every fenced code block in our docs renders with Shiki dual-theme highlighting (`github-light` / `github-dark`), but inline backticks like `` `shutdown({ drain: true })` `` fall through to a plain `<code>` element styled only with a muted border via `InlineCode`. The Fumadocs/Shiki stack we already depend on ships a first-party feature for this — `@shikijs/rehype`'s `inline: 'tailing-curly-colon'` mode — that lights up `` `shutdown({ drain: true }){:ts}` `` syntax during MDX compilation with zero new dependencies. The only real work is two lines in `source.config.ts` and a small refactor of the `code` MDX component override in `docs-mdx.tsx` so highlighted children render inside the existing `InlineCode` chrome instead of the unrelated `flex flex-col` fallback path. Switching to `rehype-pretty-code` for its "context-aware" inline mode is technically attractive but would replace a working highlighter pipeline for marginal authoring benefit, and a runtime JSX component (`<InlineCode lang='ts'>...</InlineCode>`) is strictly worse than the rehype path for prose fragments. **Recommendation: enable `inline: 'tailing-curly-colon'`, ship a small `InlineCode` adjustment, and keep the JSX-component option as an escape hatch for one-offs.**

## Implementation status

**Resolved in tree.** `rehypeCodeOptions` in `apps/ui/app/lib/fumadocs/source.config.ts` sets `defaultColor: false` and `inline: 'tailing-curly-colon'`. The MDX `code` override in `apps/ui/app/routes/docs.$/docs-mdx.tsx` always renders through `InlineCode`. Enforcement: ESLint `tau-lint/require-mdx-inline-shiki-lang` (`libs/oxlint/src/rules/require-mdx-inline-shiki-lang.js`) on `apps/ui/content/docs/**/*.mdx`. A one-shot codemod for bulk inserts lives at `tools/mdx-inline-shiki-codemod.mjs`. Authoring guidance: `docs/policy/documentation-policy.md` (Individual Page Markdown + Code Examples). Regression: `apps/ui/app/routes/docs.$/docs-mdx.test.tsx` + `libs/oxlint/src/rules/require-mdx-inline-shiki-lang.test.js`.

## Table of Contents

- [Executive Summary](#executive-summary)
- [Implementation status](#implementation-status)
- [Problem Statement](#problem-statement)
- [Current Pipeline](#current-pipeline)
- [Options](#options)
- [Trade-offs](#trade-offs)
- [Recommendation](#recommendation)
- [Implementation Plan](#implementation-plan)
- [Open Questions](#open-questions)
- [References](#references)

## Problem Statement

`apps/ui/content/docs/(runtime)/guides/embedding-in-a-host.mdx:188` ends with the prose sentence:

```mdx
`shutdown({ drain: true })` snapshots the in-flight intents, awaits each via `Promise.allSettled`, and then runs the same teardown as `terminate()`.
```

The fenced TypeScript example a few lines up renders with full Shiki highlighting (`function`, `addEventListener`, string literals all colored), but the same identifiers cited in the surrounding paragraph render as plain monospace with a muted border. This is a recurring pattern across the runtime docs (`render-lifecycle.mdx`, `kernels.mdx`, `client.mdx`, `bundler.mdx`, `middleware.mdx`, every `(runtime)/guides/*.mdx` page) where API references in prose lose the visual cue that they are code, not just monospace text. The contrast inside a single paragraph — colored block, colorless inline — also makes long passages harder to scan.

The question this research answers: **what is the cheapest, most idiomatic way to highlight inline code in our MDX pipeline, and what authoring syntax does that imply?**

### In Scope / Out of Scope

**In scope.** The static MDX docs site under `apps/ui/content/docs/`, served via Fumadocs, compiled with the `fumadocs-mdx` toolchain wired up in `apps/ui/app/lib/fumadocs/source.config.ts`.

**Out of scope.** Chat-message inline code (rendered via the chat markdown pipeline, separate from Fumadocs), Monaco/editor inline rendering, code blocks with file titles or notation diff markers (already handled by `DocsCodeBlock` and `DiffViewer`).

## Current Pipeline

The relevant pieces, all already in tree:

| Component             | File                                          | Role                                                                                                                                                                                                              |
| --------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fumadocs MDX config   | `apps/ui/app/lib/fumadocs/source.config.ts`   | Registers `rehypeCodeOptions` with `themes: { light: 'github-light', dark: 'github-dark' }` and our precompiled KCL/OpenSCAD grammars. `inline` is not set, so it defaults to `false`.                            |
| MDX component map     | `apps/ui/app/routes/docs.$/docs-mdx.tsx`      | Overrides `pre` (renders through `DocsCodeBlock` + `Pre` + `CodeViewer`) and `code` (returns `InlineCode` when children is a string, falls back to a `<code className='flex flex-col'>` for non-string children). |
| Inline pill           | `apps/ui/app/components/code/code-block.tsx`  | `InlineCode` adds `rounded-xs border bg-neutral/10 px-1 py-0 font-normal text-foreground/80` around the children, with `before:content-none after:content-none` to suppress prose backticks.                      |
| Block highlighter     | `apps/ui/app/components/code/code-viewer.tsx` | Runtime React Shiki path used by `Pre`; renders through the same shared `getHighlighter` instance defined in `apps/ui/app/lib/shiki.lib.ts`.                                                                      |
| Singleton highlighter | `apps/ui/app/lib/shiki.lib.ts`                | Lazy-builds a `HighlighterCore` with the `JavaScriptRawEngine` + precompiled grammars for ts/tsx/js/jsx/bash/json/openscad/kcl/step/stl/usd.                                                                      |

Crucially: `getMdxComponents().pre()` extracts text from children via `extractTextFromChildren` and re-renders through `<Pre><CodeViewer>`, **so the inner `code` element produced by Shiki for a fenced block is never visibly rendered through the `code()` override.** The `code()` override therefore only ever produces visible output for inline backticks. That observation simplifies the integration substantially (see [Implementation Plan](#implementation-plan)).

## Options

### Option A — Enable `@shikijs/rehype` `inline: 'tailing-curly-colon'`

The path Fumadocs documents and supports first-party. Adds a single option to the existing `rehypeCodeOptions` map. Authors mark inline code with a trailing `{:lang}` suffix:

```md
`shutdown({ drain: true }){:ts}` snapshots the in-flight intents, awaits each via `Promise.allSettled{:ts}`.
```

The plugin replaces the inline `<code>` HAST node with a `<code class="shiki shiki-themes …">` containing pre-tokenized Shiki spans (the same dual-theme `--shiki-light` / `--shiki-dark` CSS variables we already use). Highlighting happens at MDX compile time, ships zero JS to the client beyond what the prose already costs.

**Pros**

- First-party Fumadocs/Shiki feature; no new dependencies, no new authored components, no runtime work.
- Build-time output → no FOUC, no `useEffect` flash, no SSR mismatch concerns.
- Reuses the exact theme + grammar set we already configured for fenced blocks (perfect visual parity with surrounding code blocks).
- Per-fragment language tag: a paragraph can mix `` `useEffect(){:tsx}` `` and `` `pnpm install{:bash}` `` accurately.
- No JSX in prose; markdown stays scannable.

**Cons**

- Authors must remember to append `{:lang}`. Forgetting it = silent fall-through to the plain `InlineCode` styling (graceful, but inconsistent across the same doc).
- Not context-aware: every fragment must self-declare its language. Not a real problem in our docs because most inline code refers to TS/TSX, but it does mean we cannot tie inline code "back" to a nearby fenced block's parser state the way `rehype-pretty-code` does.
- The `code()` MDX override currently funnels non-string children into a `<code className='flex flex-col'>` fallback — the path that highlighted inline code would now follow. We must update that handler so highlighted children render inside `InlineCode` (one-line change, [see plan](#implementation-plan)).

### Option B — Replace `@shikijs/rehype` with `rehype-pretty-code`

`rehype-pretty-code` (built on top of Shiki) supports the same `` `code{:lang}` `` syntax **plus** a "context-aware" mode that resolves `` `getStringLength` `` inside a paragraph to the same token classification it had in the nearest preceding code block. It also adds line-level annotations (`{1-3}`), word highlighting (`/foo/`), and ANSI inline highlighting.

**Pros**

- Context-aware inline highlighting is genuinely nicer for tutorial-style prose ("now we'll call `getStringLength`...").
- Mature feature surface (line numbers, word highlights, copy buttons baked in).

**Cons**

- Requires swapping out Fumadocs's `rehypeCode` plugin, which means re-implementing the integration with our precompiled KCL/OpenSCAD grammars (Fumadocs's `rehypeCode` accepts a `langs` array; `rehype-pretty-code` accepts a `getHighlighter` function and we'd reimplement the dual-theme bootstrap).
- `rehype-pretty-code` is ESM-only, currently targets `shiki ^1.0.0`; we use `shiki/core` from a singleton on the runtime side. Mixing two highlighter instantiations in the same bundle is fragile (we already have a precompiled-grammar-coverage gap on the runtime path).
- "Context-aware" inline classification only works when the inline fragment is unambiguous (`getStringLength` matched once in the preceding block); for our docs most inline references are method calls and types, where `{:ts}` is just as accurate.
- We've already taken one bug from Shiki transformers leaking into multi-language UI (`docs/research/diff-viewer-shiki-notation-leak.md`). Adding a second Shiki frontend doubles the surface for similar regressions.

### Option C — Author-supplied JSX inline component

Drop the rehype side entirely; expose a component like `<InlineCode lang='ts'>shutdown({ drain: true })</InlineCode>` that calls the existing runtime `CodeViewer` (or a thin inline-only variant) and have authors use JSX inside MDX prose.

**Pros**

- No MDX compiler-side change.
- Same runtime highlighter as `Pre`, so themes/colors stay perfectly in sync without any HAST-level coordination.

**Cons**

- Runtime highlighting → flash of unstyled monospace until `getHighlighter()` resolves. Mid-paragraph flicker is more visible than block-level flicker.
- JSX inside prose hurts readability and copy-pastability of the markdown source. Compare:
  - `` `shutdown({ drain: true }){:ts}` snapshots... `` vs.
  - `<InlineCode lang='ts'>shutdown({ drain: true })</InlineCode> snapshots...`
  - The first is still a normal markdown paragraph; the second visibly is not.
- Friction on authoring — every reference to a TS identifier becomes a multi-attribute JSX node.
- AI authoring agents and `pnpm docs:validate` external-link checks both prefer prose-first markdown. JSX in prose makes content harder to mine for `llms.txt`.

### Option D — Hybrid (Recommendation)

Adopt Option A as the default authoring mode and reserve a small JSX escape hatch (`<InlineCode lang='diff'>...</InlineCode>` or similar) for the rare cases where the trailing-curly-colon syntax is awkward (e.g., fragments containing a literal `{` that confuses Shiki's tag matcher, or generated content where the language can only be known at render time).

## Trade-offs

| Dimension                                              | A: `@shikijs/rehype` `inline`                | B: `rehype-pretty-code`                     | C: Runtime JSX component                  |
| ------------------------------------------------------ | -------------------------------------------- | ------------------------------------------- | ----------------------------------------- |
| Highlighting time                                      | Build                                        | Build                                       | Runtime                                   |
| New dependency                                         | None                                         | Yes (replaces existing)                     | None                                      |
| Authoring syntax                                       | `` `code{:lang}` ``                          | `` `code{:lang}` `` (+ context-aware)       | `<InlineCode lang='ts'>code</InlineCode>` |
| Context-aware (inherits language from preceding block) | No                                           | Yes                                         | No                                        |
| Visual parity with fenced blocks                       | Same theme, same grammars                    | Requires reconciling two highlighter setups | Same runtime highlighter, but FOUC        |
| FOUC/SSR risk                                          | None                                         | None                                        | Yes                                       |
| Risk of Shiki-transformer regressions                  | Low (reuses our existing `rehypeCode`)       | Medium (new pipeline, two Shiki instances)  | None                                      |
| Affects `code()` MDX override                          | One-line refactor                            | One-line refactor                           | None                                      |
| Readability of MDX source                              | Best (reads like markdown)                   | Best (reads like markdown)                  | Worst (JSX in prose)                      |
| `llms.txt` / agent-mining friendliness                 | Best                                         | Best                                        | Worst                                     |
| Discoverability for new authors                        | Documented in `documentation-policy.md` once | Documented + grammar-aware fallbacks        | Component import per file                 |

Numerical impact estimate (build-time output bytes added by inline highlighting, based on a representative paragraph with five inline fragments): ≈ 200–400 bytes of additional Shiki span markup per paragraph, all gzip-friendly because it reuses the same `--shiki-*` variable namespace as block code; runtime cost is unchanged because the existing block path already pays the highlighter init.

## Recommendation

Adopt **Option A (`@shikijs/rehype` inline mode)** in `source.config.ts`, plus the necessary update to the `code()` MDX override in `docs-mdx.tsx`. Reject Option B (cost > benefit on a working pipeline) and Option C (runtime FOUC + worst-in-class authoring DX). Treat a JSX `<InlineCode lang>` escape hatch (Option D) as a future addition only if a concrete need shows up.

| #   | Action                                                                                                                                                                                                                                      | Priority | Effort         | Impact                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------- | ------------------------------------------------------- |
| R1  | Enable `inline: 'tailing-curly-colon'` and `defaultColor: false` in `apps/ui/app/lib/fumadocs/source.config.ts`.                                                                                                                            | P1       | Trivial        | High — unlocks inline highlighting site-wide            |
| R2  | Refactor `code()` in `apps/ui/app/routes/docs.$/docs-mdx.tsx` to render highlighted children inside `InlineCode` (drop the unused `flex flex-col` fallback).                                                                                | P1       | Low            | Required for R1 to render correctly                     |
| R3  | Document the `` `code{:lang}` `` syntax in `docs/policy/documentation-policy.md` (Code Examples section) and add at least one usage example in `apps/ui/content/docs/(runtime)/guides/embedding-in-a-host.mdx` so authors learn by example. | P2       | Low            | Medium — drives consistent adoption                     |
| R4  | Add a small unit test in `apps/ui/app/components/code/code-block.test.tsx` (or co-located with `docs-mdx`) asserting that a `<code className='shiki …'>…</code>` from `@shikijs/rehype` renders inside `InlineCode` chrome.                 | P2       | Low            | Prevents regressions when the MDX component map evolves |
| R5  | Sweep `apps/ui/content/docs/**` opportunistically (not as a single mass migration) and add `{:ts}` / `{:tsx}` / `{:bash}` annotations as pages are touched. Forgetting the annotation falls back gracefully to plain `InlineCode` styling.  | P3       | Incremental    | Medium — UX polish, can be ambient                      |
| R6  | Optionally expose a JSX `<InlineCode lang>` escape hatch only if a concrete page hits a case where `{:lang}` is ambiguous. Do not pre-build this.                                                                                           | P4       | Low (deferred) | Low                                                     |

## Implementation Plan

### R1 — `source.config.ts`

```ts
export default defineConfig({
  mdxOptions: {
    remarkPlugins: [[remarkAutoTypeTable, { generator }], remarkMdxMermaid],
    remarkCodeTabOptions: {
      parseMdx: true,
    },
    rehypeCodeOptions: {
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
      defaultColor: false,
      inline: 'tailing-curly-colon',
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- precompiled Shiki grammars are compatible at runtime but don't match LanguageInput type
      langs: [...kclLang, ...openscadLang] as unknown as LanguageInput[],
    },
  },
});
```

`defaultColor: false` is important: without it Shiki emits a hard-coded `color:#…;background-color:#…` inline style on the outer `<code>` that would override our `InlineCode`'s `bg-neutral/10` and `text-foreground/80`. With `defaultColor: false` only the per-token `--shiki-light` / `--shiki-dark` CSS variables ride along, which Tailwind's existing dark-mode rules already pick up on the block path.

### R2 — `code()` MDX override

The current handler:

```40:58:apps/ui/app/routes/docs.$/docs-mdx.tsx
    code(properties) {
      const { children, className } = properties as {
        children: string;
        className: string;
      };

      // Only render InlineCode for inline code (strings)
      if (typeof children === 'string') {
        return (
          <InlineCode {...properties} className={className}>
            {children}
          </InlineCode>
        );
      }

      return (
        <code {...properties} className={cn(className, 'flex flex-col')}>
          {children}
        </code>
      );
    },
```

The non-string fallback was added for some long-since-removed nested-code path (the `pre()` override re-renders block code from extracted text; the inner `<code>` it produces is never rendered to the DOM). Once `inline` is enabled, highlighted inline code arrives as JSX spans with `className='shiki shiki-themes …'` — the fallback path would wrap it in `flex flex-col`, which breaks inline flow. Simplification: always render through `InlineCode`.

```tsx
    code(properties) {
      const { children, className } = properties as { children: ReactNode; className?: string };
      return (
        <InlineCode {...properties} className={className}>
          {children}
        </InlineCode>
      );
    },
```

This works for both strings (legacy plain inline code) and JSX (highlighted Shiki spans) because `InlineCode` simply forwards `children` into `<code>`.

### R3 — Author guidance

Add a short subsection in `docs/policy/documentation-policy.md` (Code Examples block) and link it from the docs welcome page:

```md
Inline references to identifiers, methods, or shell commands take a trailing language tag so they pick up the same syntax highlighting as fenced blocks:

`client.shutdown({ drain: true }){:ts}` blocks until pending intents settle.
Run `pnpm nx test ui{:bash}` from the workspace root.

Omitting the tag is allowed but renders the fragment as plain monospace; prefer the tagged form for any TS/TSX/bash/JSON identifier.
```

### R4 — Regression test

`docs-mdx.test.tsx` (or a co-located test) should assert:

1. `code()` with a string child renders an `<code data-slot='inline-code'>` with the muted-border class.
2. `code()` with JSX children carrying `className='shiki shiki-themes …'` renders the highlighted spans **inside** the same `<code data-slot='inline-code'>` wrapper, not in a `<code className='flex flex-col'>`.

### R5 — Opportunistic sweep

Do not script a one-shot bulk rewrite. The `{:lang}` annotation is graceful when missing, so adopting it as authors touch each page is sufficient and avoids a giant MDX diff.

## Open Questions

1. **Border on highlighted inline code.** `InlineCode` adds a `border` and `rounded-xs` ring around plain inline code today. With Shiki spans inside, the colored tokens may visually compete with the border. Two reasonable answers: (a) keep the border for visual consistency with non-highlighted inline code; (b) drop the border specifically when `className` contains `shiki`. Recommend (a) on day one and revisit if it looks busy in practice.
2. **Grammar coverage for prose.** The current `apps/ui/app/lib/fumadocs/source.config.ts` registers only `kclLang` and `openscadLang` explicitly; everything else (ts/tsx/bash/json/…) comes through Shiki's default grammar bundle. Inline mode reuses that bundle, so no extra grammars are needed; KCL/OpenSCAD inline fragments will also Just Work.
3. **Theme consistency.** `getHighlighter()` in `shiki.lib.ts` uses `@shikijs/themes/github-light` / `@shikijs/themes/github-dark`; the rehype path uses the same theme names. Both pipelines emit `--shiki-light` / `--shiki-dark` variables under the same names, so light/dark switching is unified for free.
4. **`pnpm docs:validate` and `llms.txt`.** The validator parses MDX as text; the trailing-curly-colon syntax is plain markdown so it passes through transparently. `llms-full.txt` will include the `{:ts}` markers verbatim, which is a no-op for downstream consumers because the markers parse as literal characters in non-Fumadocs renderers.

## References

- [Fumadocs — Rehype Code (`inline` option)](https://fumadocs.dev/docs/headless/mdx/rehype-code)
- [Shiki — `@shikijs/rehype` `inline: 'tailing-curly-colon'`](https://shiki.style/packages/rehype)
- [Shiki PR #751 — `feat(rehype): support inline codes`](https://github.com/shikijs/shiki/pull/751)
- [Shiki — Light/Dark Dual Themes (`defaultColor: false`)](https://shiki.style/guide/dual-themes)
- [`rehype-pretty-code` — Inline code & context-aware mode](https://rehype-pretty.pages.dev/)
- Internal: `apps/ui/app/lib/fumadocs/source.config.ts`, `apps/ui/app/routes/docs.$/docs-mdx.tsx`, `apps/ui/app/components/code/code-block.tsx`, `apps/ui/app/lib/shiki.lib.ts`
- Related research: `docs/research/diff-viewer-shiki-notation-leak.md` (cautionary tale about Shiki transformers and grammar-comment dependencies — the `tailing-curly-colon` mode does not use comment-based notation, so the same failure mode does not apply here)
