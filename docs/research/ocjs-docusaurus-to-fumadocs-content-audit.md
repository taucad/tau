---
title: 'OpenCascade.js Docusaurus → Fumadocs Content Audit & Reinstatement Blueprint'
description: 'Page-by-page audit of the deleted upstream `repos/opencascade.js/website` (Docusaurus) against the replacement `repos/opencascade.js/docs-site` (Fumadocs / Next.js), with editorial decisions, phased reinstatement plan, and concrete next-step blueprint for closing the gaps.'
status: active
created: '2026-05-22'
updated: '2026-05-22'
category: audit
related:
  - docs/research/ocjs-fork-holistic-diff.md
  - docs/research/occt-v8-migration.md
---

# OpenCascade.js Docusaurus → Fumadocs Content Audit & Reinstatement Blueprint

End-to-end audit of every file deleted under `repos/opencascade.js/website/`
against the new `repos/opencascade.js/docs-site/` (Fumadocs/Next.js) site,
with editorial decisions resolved and a phased plan for closing the
identified gaps before the public-successor cutover.

## Executive Summary

The migration is **structurally sound but content-incomplete**. Roughly **75%
of the original prose was retained or improved** (often substantially —
v3 API rewrites, expanded multi-threading guide, new concepts pages),
but **eight distinct content surfaces were dropped without explicit
replacement** and **14 legacy URLs lack redirects**.

The five upstream eigenquestions that gated all reinstatement decisions
have been resolved in favour of treating `docs-site/` as the **public
successor to `ocjs.org` while the Tau-maintained fork is in flight toward
an upstream merge-back PR**. Concretely:

- **Audience**: direct npm consumers first; library-author surfaces stay
  but are not the front door.
- **Hosting**: public successor — every legacy URL must redirect to a
  meaningful destination, branding must be present.
- **Fork narrative**: ephemeral fork pending upstream PR — branding,
  voice, and structure stay close to upstream's so the merge-back diff
  is small; Tau attribution is footer-level.
- **Live UX**: reinstated as a **Playground** built on
  `@taucad/runtime` (planned standalone npm release).
- **Bundler floor**: Vite + Next 15 + Bun + Node + Deno + **Webpack 5**.
  CRA, `react-app-rewired`, and Webpack 4 are explicitly out of scope.
- **Sidebar information architecture**: split the flat tree into two
  Fumadocs root-toggle dropdown sections — **Package**
  (`@taucad/opencascade.js` npm) and **Toolchain** (Docker image +
  custom WASM) — matching the Tau editor docs pattern. Every URL gets
  a root prefix; the redirect plan in the appendix reflects this.

The decisions reframe every previously "P2 / trade-off" recommendation
into either a confirmed deliverable (with a clear phase) or an explicit
non-goal. See [Decisions](#decisions) and [Blueprint](#blueprint).

Six surfaces (the v2 `_N` overload page, the `{ current: 0 }` reference-type
pattern, the v2 `OCJS.getStandard_FailureData` helper, etc.) were
**intentionally obsoleted** by the v3 API rewrite; `docs-site/` covers
them correctly under new names. They are out of scope for reinstatement.

## Decisions

The five eigenquestions and their resolved answers — these are the
authoritative inputs for every recommendation in the [Blueprint](#blueprint).

### D1. Hosting commitment — public successor (was E2)

`docs-site/` is the **public successor to `ocjs.org`**. Every legacy URL
must redirect to a meaningful destination, branding must be present, and
inbound traffic from external sites must continue to land on something
useful. The "no favicon / no logo" current state is a transitional artifact
to be closed before public cutover.

### D2. Primary audience — direct npm consumer (was E1)

The canonical reader is someone running
`pnpm add @taucad/opencascade.js@beta`, looking to ship a CAD UX in their
own product. Library-author / fork-maintainer pages (bindgen pipeline,
configurations.json reference, derive-C++-class) remain, but the front
door, homepage cards, search-result ranking, and meta-navigation
prioritise the direct-consumer journey.

### D3. Fork narrative — ephemeral fork pending upstream PR (was E3)

Tau maintains this fork **during the v3 / OCCT V8 release window** with
explicit intent to merge back upstream into `donalffons/opencascade.js`.
Concrete implications:

- **Branding stays OCJS-original**: reinstate the upstream OCJS logo and
  favicon, not a Tau-branded variant. The merge-back PR should be a
  prose-and-structure delta, not a brand reskin.
- **Voice**: "OpenCascade.js" is the project; Tau attribution lives in a
  footer line and the FAQ. Avoid Tau-as-headline framing in the docs
  prose itself.
- **FAQ owns the fork narrative**: explicit acknowledgement that the
  fork is interim and that the goal is upstream merge-back. Maintainer
  attribution remains `donalffons` first, Tau second.
- **Projects gallery**: Tau is one entry alongside ArchiYou, BitByBit,
  CascadeStudio, Polygonjs, and RepliCAD — not promoted to peer
  status, not omitted. Polygonjs and the official
  `opencascade.js-examples` link are restored.

### D4. Live UX — Playground built on `@taucad/runtime` (was E4)

Live code execution is **in scope** but rebranded as **Playground**.
Implementation:

- Built on `@taucad/runtime` once the standalone npm release is published.
  Until then, Playground work is **blocked** and tracked as Phase 3 of the
  blueprint.
- Embedded per-example as a Fumadocs MDX component (`<Playground>`).
  Direct successor in role to the old `js ocjs` codeblock, but the
  underlying worker / IPC / FS infrastructure is `@taucad/runtime`-shaped,
  not Comlink-bespoke.
- A dedicated `/playground` landing page may also exist (decision deferred
  to the runtime-release planning pass).

### D5. Bundler floor — Vite + Next + Bun + Node + Deno + Webpack 5 (was E5)

`guides/bundler-locatefile.mdx` adds a Webpack 5 (standalone) section.
CRA, `react-app-rewired`, and Webpack 4 are **explicitly out of scope** —
the page should carry a brief "Legacy bundlers" note pointing at the
upstream Docusaurus version preserved in git history, so consumers
searching for those bundlers find a definitive "not supported" signal
rather than silence.

### D6. Sidebar root-toggle dropdown — Package + Toolchain (new)

The current flat docs tree mixes consumer- and author-facing surfaces
into one sidebar. With the audience cut from
[D2](#d2-primary-audience--direct-npm-consumer-was-e1) settled, the
sidebar needs a **root-toggle dropdown** matching the Tau docs pattern
(`apps/ui/content/docs/{editor,runtime}/meta.json` with `root: true`).

Two roots, named after the two physical artefacts OCJS ships:

| Root          | Audience            | Artefact                             | Icon                       |
| ------------- | ------------------- | ------------------------------------ | -------------------------- |
| **Package**   | direct npm consumer | `@taucad/opencascade.js` (npm)       | `lucide:package text-blue` |
| **Toolchain** | library author      | GHCR Docker image + custom-WASM YAML | `lucide:wrench text-amber` |

Full design (page allocation, meta.json shapes, URL implications,
restructure plan) lives in
[Sidebar root-toggle dropdown](#sidebar-root-toggle-dropdown). A third
"Contribute" root was considered and **deferred** — under
[D3](#d3-fork-narrative--ephemeral-fork-pending-upstream-pr-was-e3) the
fork is ephemeral, so investing in a contributor-only surface that
disappears at merge-back time is poor leverage.

## Sidebar root-toggle dropdown

This section is the design brief for [D6](#d6-sidebar-root-toggle-dropdown--package--toolchain-new).
It owns the audience taxonomy, naming, icons, page allocation,
`meta.json` shapes, and URL/redirect implications. Implementation lands
in [Blueprint Phase 1, R0](#phase-1--pre-cutover-unblocked-ship-before-redirecting-ocjsorg).

### Pattern reference

Fumadocs renders a root-toggle dropdown in the sidebar header when the
top-level `content/docs/meta.json` lists child folders whose own
`meta.json` carries `"root": true`. Each child entry contributes its
`title`, `description`, and `icon` to the dropdown UI. The Tau editor's
docs use this pattern with two roots — `editor/` and `runtime/` — see
`apps/ui/content/docs/{editor,runtime}/meta.json` for the canonical
example. No additional `layout.config.tsx` wiring is required; the
root-toggle is automatic given the `meta.json` structure.

### Naming rationale

Tau's roots are **nouns naming product surfaces** ("Editor", "Runtime"),
not audience labels ("Consumer", "Author"). The OCJS equivalent is to
name the two production artefacts the project ships:

| Considered                 | Reject reason                                                                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "Use" / "Build" (verbs)    | Reads as actions inside a single product, not as distinct product surfaces. Diverges from Tau pattern.                                                                   |
| "SDK" / "Builder"          | "SDK" implies vendor; OCJS is open-source kernel bindings. "Builder" overloads with the Gang-of-Four pattern name.                                                       |
| "Library" / "Build System" | "Library" is overloaded with the underlying C++ library (OCCT itself). "Build System" is two words and reads bureaucratic.                                               |
| "Consumer" / "Author"      | Audience labels, not artefact names. Mixes the axis Tau uses.                                                                                                            |
| "Package" / "Toolchain" ✅ | Both nouns. Both refer to concrete artefacts (npm package + Docker-image-driven build toolchain). Each has its own versioning, changelog, install path, consumer subset. |

The `Package` / `Toolchain` pair maps 1:1 to the two
`pnpm add @taucad/opencascade.js` vs `docker run ghcr.io/taucad/opencascade.js`
entry points and reads naturally in nav copy ("Package quickstart",
"Toolchain reference").

### Page allocation

The current flat tree is split as follows. Page paths are post-restructure;
existing files move to new locations. Stub pages from
[Blueprint Phase 1](#phase-1--pre-cutover-unblocked-ship-before-redirecting-ocjsorg)
land in the destination shown.

**`package/` root** — direct npm consumer journey:

```
package/
  index.mdx                                 ← (new) Package landing page
  getting-started/
    quick-start-npm.mdx                     ← from getting-started/
    what-is-opencascade-js.mdx              ← from getting-started/
    first-shape-tutorial.mdx                ← from getting-started/
    faq.mdx                                 ← Phase 1, R3 (new)
    projects-using-opencascade-js.mdx       ← Phase 1, R2 (new)
  guides/
    bundler-locatefile.mdx                  ← from guides/, + Webpack 5 (R4)
    debugging-wasm-exceptions.mdx           ← from guides/
    export-step.mdx                         ← from guides/
    export-gltf.mdx                         ← from guides/
    render-with-three-js.mdx                ← from guides/
    visualize-shape-helper.mdx              ← Phase 2, R9 (new)
  examples/
    boolean-logo.mdx                        ← from examples/, + PBR (R6)
    classic-bottle.mdx                      ← from examples/, + full body (R5)
    polygon-extrusion.mdx                   ← from examples/
  concepts/
    calling-occt-from-js.mdx                ← from concepts/
    memory-and-disposables.mdx              ← from concepts/
    handles-and-collections.mdx             ← from concepts/
    return-shapes.mdx                       ← from concepts/
  api/                                      ← from api/ (4,587 classes, unchanged tree)
  reference/
    ocjs-package-api/
      init-function.mdx                     ← from reference/ocjs-package-api/
      module-shape.mdx                      ← from reference/ocjs-package-api/
      exception-classes.mdx                 ← from reference/ocjs-package-api/
```

**`toolchain/` root** — library author + custom-WASM journey:

```
toolchain/
  index.mdx                                 ← (new) Toolchain landing page
  getting-started/
    quick-start-docker.mdx                  ← from getting-started/
  guides/
    custom-emcc-flags.mdx                   ← from guides/
    extend-with-cpp.mdx                     ← from guides/
    trim-symbols.mdx                        ← from guides/
    multi-threading.mdx                     ← from guides/
    derive-cpp-class-in-js.mdx              ← Phase 1 stub → Phase 2, R1 full content
    reproducible-ci.mdx                     ← from guides/
  concepts/
    bindgen-pipeline.mdx                    ← from concepts/
    two-channel-config-model.mdx            ← from concepts/
  reference/
    yaml-schema.mdx                         ← from reference/
    configurations.mdx                      ← from reference/
    docker-image.mdx                        ← from reference/
    env-vars.mdx                            ← from reference/
    cli-build-wasm.mdx                      ← from reference/
```

Allocation principles:

- **Examples live in `package/`** — they demonstrate npm consumption, not
  custom builds. (The Phase-3 Playground reuses them in both roots.)
- **Concepts split by audience**: `calling-occt-from-js`,
  `memory-and-disposables`, `handles-and-collections`, `return-shapes`
  inform writing JS against the API → `package/`. `bindgen-pipeline` and
  `two-channel-config-model` inform extending OCJS source → `toolchain/`.
- **API reference lives in `package/`** — the 4,587 generated class pages
  are consumed by JS callers, not by anyone modifying the bindgen
  pipeline. The toolchain root references the API only via cross-links.
- **The `reference/ocjs-package-api/` sub-tree stays in `package/`** — it
  documents the `init()` function and module shape, both consumer
  concerns.

### `meta.json` shapes

The three new/changed `meta.json` files:

```json
// content/docs/meta.json (REPLACED)
{ "title": "OpenCascade.js", "pages": ["package", "toolchain"] }
```

```json
// content/docs/package/meta.json (NEW)
{
  "title": "Package",
  "description": "Consume @taucad/opencascade.js from npm — render, export, integrate.",
  "icon": "lucide:package text-blue",
  "root": true,
  "pages": [
    "index",
    "---Getting Started---",
    "getting-started/quick-start-npm",
    "getting-started/what-is-opencascade-js",
    "getting-started/first-shape-tutorial",
    "getting-started/faq",
    "getting-started/projects-using-opencascade-js",
    "---Guides---",
    "guides/bundler-locatefile",
    "guides/debugging-wasm-exceptions",
    "guides/export-step",
    "guides/export-gltf",
    "guides/render-with-three-js",
    "guides/visualize-shape-helper",
    "---Examples---",
    "examples/boolean-logo",
    "examples/classic-bottle",
    "examples/polygon-extrusion",
    "---Concepts---",
    "concepts/calling-occt-from-js",
    "concepts/memory-and-disposables",
    "concepts/handles-and-collections",
    "concepts/return-shapes",
    "---Reference---",
    "api",
    "reference/ocjs-package-api/init-function",
    "reference/ocjs-package-api/module-shape",
    "reference/ocjs-package-api/exception-classes"
  ]
}
```

```json
// content/docs/toolchain/meta.json (NEW)
{
  "title": "Toolchain",
  "description": "Build a custom WASM via Docker — trim symbols, extend with C++, ship reproducible CI.",
  "icon": "lucide:wrench text-amber",
  "root": true,
  "pages": [
    "index",
    "---Getting Started---",
    "getting-started/quick-start-docker",
    "---Guides---",
    "guides/custom-emcc-flags",
    "guides/extend-with-cpp",
    "guides/trim-symbols",
    "guides/multi-threading",
    "guides/derive-cpp-class-in-js",
    "guides/reproducible-ci",
    "---Concepts---",
    "concepts/bindgen-pipeline",
    "concepts/two-channel-config-model",
    "---Reference---",
    "reference/yaml-schema",
    "reference/configurations",
    "reference/docker-image",
    "reference/env-vars",
    "reference/cli-build-wasm"
  ]
}
```

### URL + redirect implications

Fumadocs derives URLs from folder structure, so the restructure
**changes every page URL** — `/docs/getting-started/quick-start-npm`
becomes `/docs/package/getting-started/quick-start-npm`, and so on. Two
consequences:

1. **Every existing `redirects.json` entry needs updating** to point at
   the new prefixed URL. The full updated redirect table lives in
   [Appendix § Redirect plan](#appendix--redirect-plan).
2. **Every cross-link in MDX bodies** (e.g.
   `[derive a C++ class](/docs/guides/derive-cpp-class-in-js)`) needs
   updating. This is a mechanical pass — search-and-replace per root —
   and is covered by Blueprint Phase 1, R0.

### Top-nav `layout.config.tsx` adjustments

`app/layout.config.tsx` currently exposes two top-level nav links:

```ts
links: [
  { text: 'Docs', url: '/docs' },
  { text: 'API', url: '/docs/api' },
],
```

Post-restructure these become:

```ts
links: [
  { text: 'Package', url: '/docs/package' },
  { text: 'Toolchain', url: '/docs/toolchain' },
  { text: 'API', url: '/docs/package/api' },
],
```

The two-root top-nav mirrors the sidebar dropdown for direct-link
discoverability (a user who landed on the homepage and wants the
Toolchain surface can click the top-nav once instead of navigating into
Docs and then opening the dropdown).

### Why two roots, not three

A third **"Contribute"** root was considered for OCJS-source-level
content (bindgen pipeline, derive-cpp-class-in-js, reproducible-ci,
fork narrative). Rejected for two reasons:

1. **Page volume is thin** — only 3–4 pages plausibly belong in
   Contribute, vs ~15 in Toolchain and ~25 in Package. A near-empty
   third root reads as scaffolding rather than a real surface.
2. **D3 ephemeral-fork narrative**: contributor-facing content is itself
   short-lived. Investing in a third sidebar root that disappears at
   upstream-merge-back time is poor leverage.

The contributor-facing pages live inside `toolchain/` (custom-build
mechanics) with the merge-back narrative carried by `package/faq.mdx`.

## Methodology

1. Extracted every deleted `website/*` file via `git show HEAD:<path>` into
   `/tmp/ocjs-website-audit/` for inspection.
2. Read every original `.md` doc (`website/docs/**`) plus the
   `website/src/pages/`, homepage feature components, custom-build YAML, and
   live-preview React theme.
3. Read every `.mdx` under `repos/opencascade.js/docs-site/content/docs/`
   plus `app/(home)/page.tsx`, `app/layout.config.tsx`, `redirects.json`.
4. Built a page-by-page coverage matrix mapping each original URL to its
   docs-site successor (or marking it dropped).
5. Cross-checked `docs-site/redirects.json` against the original sidebar to
   identify missing redirects.
6. Searched repo `README.md`, `BREAKING_CHANGES.md`, and `CHANGELOG.md` for
   content that may have migrated to those surfaces instead of the docs site.

## Coverage Matrix

Verdict legend:

- **Retained** — content carried over with at most cosmetic edits.
- **Transformed (v3)** — content rewritten to reflect a legitimate v3 API
  change; the underlying capability is still documented.
- **Improved** — new doc is meaningfully better than the original.
- **Partial** — some content carried, some dropped.
- **Dropped** — no replacement found anywhere in `docs-site/`.

### Docs tree (`website/docs/**`)

| #   | Original URL                                                 | Original file                                                           | docs-site successor                                                                     | Verdict              |
| --- | ------------------------------------------------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------- |
| 1   | `/docs/about`                                                | `docs/01-about.md`                                                      | `getting-started/what-is-opencascade-js` (concept)                                      | **Partial**          |
| 2   | `/docs/getting-started/hello-world`                          | `docs/02-getting-started/01-hello-world.md`                             | `getting-started/quick-start-npm`                                                       | **Improved**         |
| 3   | `/docs/getting-started/configure-bundler`                    | `docs/02-getting-started/02-configure-bundler.md`                       | `guides/bundler-locatefile`                                                             | **Partial**          |
| 4   | `/docs/getting-started/file-size`                            | `docs/02-getting-started/03-file-size.md`                               | `guides/trim-symbols` + `concepts/two-channel-config-model`                             | **Improved**         |
| 5   | `/docs/app-dev-workflow/workflow`                            | `docs/03-app-dev-workflow/01-workflow.md`                               | (subsumed into `/docs` "Choose your path")                                              | **Partial**          |
| 6   | `/docs/app-dev-workflow/pre-built`                           | `docs/03-app-dev-workflow/02-pre-built.md`                              | `getting-started/quick-start-npm`                                                       | **Retained**         |
| 7   | `/docs/app-dev-workflow/custom-builds`                       | `docs/03-app-dev-workflow/03-custom-builds.md`                          | `getting-started/quick-start-docker` + `guides/trim-symbols` + `guides/extend-with-cpp` | **Improved**         |
| 8   | `/docs/examples/ocjs-logo`                                   | `docs/04-examples/01-ocjs-logo.md`                                      | `examples/boolean-logo`                                                                 | **Partial**          |
| 9   | `/docs/examples/bottle`                                      | `docs/04-examples/02-bottle.md`                                         | `examples/classic-bottle`                                                               | **Partial**          |
| 10  | `/docs/examples/polygon`                                     | `docs/04-examples/03-polygon.md`                                        | `examples/polygon-extrusion`                                                            | **Improved**         |
| 11  | `/docs/advanced/differences-cpp-js/intro`                    | `docs/05-advanced/01-differences-cpp-js/01-intro.md`                    | `concepts/calling-occt-from-js`                                                         | **Improved**         |
| 12  | `/docs/advanced/differences-cpp-js/overloaded-methods`       | `docs/05-advanced/01-differences-cpp-js/02-overloaded-methods.md`       | `concepts/calling-occt-from-js` ("No more `_N` overload suffixes")                      | **Transformed (v3)** |
| 13  | `/docs/advanced/differences-cpp-js/references-to-built-ins`  | `docs/05-advanced/01-differences-cpp-js/03-references-to-built-ins.md`  | `concepts/return-shapes` (envelope returns / input-passthrough RBV)                     | **Transformed (v3)** |
| 14  | `/docs/advanced/progress-indicators-user-break/intro`        | `docs/05-advanced/02-progress-indicators-user-break/01-intro.md`        | — none —                                                                                | **Dropped**          |
| 15  | `/docs/advanced/progress-indicators-user-break/custom-build` | `docs/05-advanced/02-progress-indicators-user-break/02-custom-build.md` | — none —                                                                                | **Dropped**          |
| 16  | `/docs/advanced/progress-indicators-user-break/derive-class` | `docs/05-advanced/02-progress-indicators-user-break/03-derive-class.md` | — none —                                                                                | **Dropped**          |
| 17  | `/docs/advanced/multi-threading/intro`                       | `docs/05-advanced/03-multi-threading/01-intro.md`                       | `guides/multi-threading`                                                                | **Retained**         |
| 18  | `/docs/advanced/multi-threading/custom-build`                | `docs/05-advanced/03-multi-threading/02-custom-build.md`                | `guides/multi-threading`                                                                | **Improved**         |
| 19  | `/docs/advanced/exceptions/intro`                            | `docs/05-advanced/04-exceptions/01-intro.md`                            | `guides/debugging-wasm-exceptions`                                                      | **Retained**         |
| 20  | `/docs/advanced/exceptions/catch-exceptions`                 | `docs/05-advanced/04-exceptions/02-catch-exceptions.md`                 | `guides/debugging-wasm-exceptions` (v3: `getExceptionMessage`)                          | **Transformed (v3)** |
| 21  | `/docs/developer-docs/overview`                              | `docs/06-developer-docs/01-overview.md`                                 | `concepts/bindgen-pipeline`                                                             | **Improved**         |
| 22  | `/docs/faq`                                                  | `docs/99-faq.md`                                                        | — none —                                                                                | **Dropped**          |

### Top-level pages (`website/src/pages/**`)

| #   | Original URL         | Original file                                         | docs-site successor   | Verdict         |
| --- | -------------------- | ----------------------------------------------------- | --------------------- | --------------- |
| 23  | `/` (homepage)       | `src/pages/index.tsx` + `components/HomepageFeatures` | `app/(home)/page.tsx` | **Transformed** |
| 24  | `/starter-templates` | `src/pages/starter-templates.md`                      | — none —              | **Dropped**     |

### Supporting infrastructure

| #   | Asset                                                            | Original location                                   | docs-site equivalent                                          | Verdict      |
| --- | ---------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------- | ------------ |
| 25  | Live OCJS code preview (Comlink worker + model-viewer + sliders) | `ocjs-editor-theme/src/theme/CodeBlock/`            | — none — (code blocks are static)                             | **Dropped**  |
| 26  | Custom-trimmed WASM build powering the previews                  | `ocjs-editor-theme/src/customBuild/customBuild.yml` | partial (trim-symbols has a STEP example, not the bottle one) | **Partial**  |
| 27  | `visualizeDoc` / `visualizeShapes` reusable helpers              | `docs/02-getting-started/01-hello-world.md`         | inlined per-example (no canonical doc)                        | **Dropped**  |
| 28  | Favicon, OCJS logo SVG                                           | `static/favicon.ico`, `static/img/logo.svg`         | — none — (Fumadocs defaults)                                  | **Dropped**  |
| 29  | Homepage feature illustrations (3× undraw SVGs)                  | `static/img/undraw_*.svg`                           | — none — (new persona-card homepage)                          | **Replaced** |
| 30  | React/Vue/Node logos (used in starter-templates)                 | `static/img/logos/{react,vue,node}.svg`             | — none —                                                      | **Dropped**  |
| 31  | Firebase analytics + cookie consent                              | `src/firebase.ts`, `static/cookieconsent/*`         | — none — (Tau-controlled deployment will wire its own)        | **N/A**      |

### Configuration

| #   | Original file               | Purpose                                           | docs-site equivalent                                | Verdict         |
| --- | --------------------------- | ------------------------------------------------- | --------------------------------------------------- | --------------- |
| 32  | `docusaurus.config.js`      | Navbar, footer, search plugin, MDX mermaid plugin | `app/layout.config.tsx` + `app/api/search/route.ts` | **Transformed** |
| 33  | `sidebars.js`               | Auto-generated sidebar from filesystem            | `content/docs/**/meta.json`                         | **Transformed** |
| 34  | `firebase.json`             | Cache headers + hosting config                    | `vercel.json` (per Tau infra)                       | **Transformed** |
| 35  | `README.md` (website-local) | Docusaurus dev instructions                       | (Tau workspace conventions apply)                   | **Dropped**     |

## Findings

### Finding 1: Custom-C++-class-derivation tutorial dropped wholesale

The `/docs/advanced/progress-indicators-user-break/` series (3 pages, ~120
lines total) was the **only** documentation in the OCJS surface for a
high-leverage Emscripten capability: deriving a C++ class in JavaScript so
that virtual-method overrides flow back into C++ callbacks.

The technique combines:

1. A bridge struct in C++:
   ```cpp
   struct Message_ProgressIndicator_JS : public Message_ProgressIndicator {
     using Message_ProgressIndicator::Show;
     using Message_ProgressIndicator::UserBreak;
     using Message_ProgressIndicator::Reset;
   };
   ```
2. An Emscripten `wrapper<T>` that exposes virtual overrides to JS:
   ```cpp
   struct Message_ProgressIndicator_JSWrapper : public wrapper<Message_ProgressIndicator_JS> {
     EMSCRIPTEN_WRAPPER(Message_ProgressIndicator_JSWrapper);
     void Show(const Message_ProgressScope& theScope, const Standard_Boolean isForce) {
       val valTheScope = val::object();
       valTheScope.set("current", &theScope);
       return call<void>("Show", valTheScope, isForce);
     }
     // ...
   };
   ```
3. An `EMSCRIPTEN_BINDINGS` block registering `.allow_subclass<>()`.
4. The JS-side `extend("...", { Show: function (...) { ... } })` pattern.

The whole flow is unique — it is the canonical answer to "how do I pass a
callback into OCCT?" — and is entirely absent from `docs-site/`. Neither
`guides/extend-with-cpp.mdx` (which covers `additionalCppCode`/Files/
`additionalBindCode` but not `allow_subclass<>`) nor any concept page
addresses it.

This is also the only documentation of OCCT's progress-reporting and
user-break-cancellation APIs, which are user-visible runtime features
distinct from C++ extension mechanics.

Reinstatement plan: Phase-1 stub at `guides/derive-cpp-class-in-js.mdx`,
replaced by the full v3 tutorial in Phase 2 (R1 in [Blueprint](#blueprint)).
Keeps `Message_ProgressIndicator` as the worked example with the v2 → v3
migration done in-place — the v2 source used overload suffixes (`Start_1`
/ `Start_2`) that no longer exist, so the wrapper must be re-validated
against the current OCCT V8 pin. Full v3 migration snippet at
[Code Examples](#code-examples).

### Finding 2: Projects-using-OCJS gallery only lives in repo README

Original `/docs/about` opened with a list of public projects built on OCJS
(ArchiYou, BitByBit, CascadeStudio, Polygonjs, RepliCAD, plus the official
`opencascade.js-examples` repo). This list:

- Was **dropped** from `docs-site/` entirely.
- **Partially survives** in `repos/opencascade.js/README.md` lines 138–144,
  but with **Polygonjs and the official `opencascade.js-examples` link
  removed**, and **Tau added**.
- Is not discoverable on the public docs site — the repo README is GitHub-only.

For consumers evaluating whether to adopt OCJS, a public projects-using gallery
is a high-signal landing surface. The fork-aware version (Tau included)
should be on the docs site.

### Finding 3: FAQ page dropped, fork status answer is stale

`/docs/faq` answered three questions:

1. Is this a fork of OpenCascade?
2. Who keeps it up to date?
3. How can I contribute?

Per [D3](#d3-fork-narrative--ephemeral-fork-pending-upstream-pr-was-e3),
the reinstated FAQ uses the ephemeral-fork framing:

1. **"Is this a fork?"** — Yes. `@taucad/opencascade.js` is a Tau-maintained
   fork of `donalffons/opencascade.js` (itself a port of upstream OCCT to
   WebAssembly via Emscripten). The fork exists to ship the v3 / OCCT V8
   release while upstream is dormant; the intent is to merge back into
   upstream via a single PR once V8 lands.
2. **"Who keeps it up to date?"** — `donalffons` remains the primary
   maintainer-of-record; Tau is the interim driver. Issues and PRs live at
   `taucad/opencascade.js` during the fork window.
3. **"How can I contribute?"** — Standard GitHub flow at
   `taucad/opencascade.js`; contributions are upstream-merge-back-aware.

The repo `README.md` has a 3-line Contributing stub but no FAQ section.
The reinstated FAQ lives at `getting-started/faq.mdx`
(R3 in [Blueprint Phase 1](#phase-1--pre-cutover-unblocked-ship-before-redirecting-ocjsorg)).

### Finding 4: Webpack 5 standalone recipe dropped (CRA / Webpack 4 out of scope)

The original `/docs/getting-started/configure-bundler` page covered the most
common 2021–2023 bundler stacks:

- Webpack 5 with `file-loader` for `.wasm` URLs.
- The Webpack 4 `node: { fs: "empty" }` fallback.
- Create-React-App with `react-app-rewired` + `config-overrides.js`.

The new `guides/bundler-locatefile.mdx` covers Vite 6+, Next 15, Bun, Node,
Deno — all modern stacks — but **no Webpack 5 standalone**, and **no
CRA/Webpack 4**.

Per [D5](#d5-bundler-floor--vite--next--bun--node--deno--webpack-5-was-e5):
Webpack 5 standalone is in scope (still ~30% of npm bundles in 2026 and
trivial to document). CRA and Webpack 4 are out of scope (CRA deprecated
Q1 2025; Webpack 4 EOL). The Webpack 5 recipe ships in Phase 1; the
"Legacy bundlers" disclaimer ships with it.

### Finding 5: Bottle example body truncated

Original `04-examples/02-bottle.md` was a complete 170-line translation of
OCCT's canonical tutorial — profile → mirror → extrude → fillet → neck → fuse
→ hollow → threading-via-elliptical-curves → compound assembly → final
rotation. The new `examples/classic-bottle.mdx` stops at fuse and inlines:

> (Hollow + threading + compound assembly: see the legacy example for the
> full sequence)

…where "legacy example" links to the **upstream OCCT C++ tutorial**, not the
v2 JS translation. Consumers comparing v2 JS → v3 JS migrations have no
worked example for `BRepOffsetAPI_MakeThickSolid`, `BRepOffsetAPI_ThruSections`,
`Geom_CylindricalSurface`, `Geom2d_Ellipse`, or `Geom2d_TrimmedCurve` on the
v3 suffix-free API surface.

The hollow / threading / compound code is the most useful part of the
example — the first 40% (profile + fillet) is already demonstrated in
multiple other places (`first-shape-tutorial`, `quick-start-npm`).

### Finding 6: XCAF material-assignment pattern dropped from boolean-logo

Original `04-examples/01-ocjs-logo.md` ended with a ~25-line block that
iterated the final logo shape via `TopoDS_Iterator`, allocated one
`XCAFDoc_VisMaterial` + `XCAFDoc_VisMaterialPBR` per topology subset, and
assigned per-subset PBR base colors — producing a logo with brass + gray
material zones in the GLB output.

The new `examples/boolean-logo.mdx` ends at `fuse.Shape()` and returns the
shape uncoloured. The material-assignment block is **the single most useful
pattern** for shipping multi-material assemblies through `RWGltf_CafWriter` —
no other example in `docs-site/` demonstrates per-shape PBR material
assignment via `TopoDS_Iterator` walk.

`guides/export-gltf.mdx` shows the general PBR material setup (single
material on a single shape) but **not** the per-subset assignment in a
boolean composite.

### Finding 7: Live interactive code preview removed — to be reinstated as "Playground"

Every original example block was a `js ocjs` fenced code block parsed by
`ocjs-editor-theme/src/theme/CodeBlock/`:

- A Comlink-wrapped web worker (`opencascade.worker.ts`) ran the user's code
  inside a sandboxed `eval()` against a curated `oc` / `visualizeShapes` /
  `visualizeDoc` / `params` scope.
- The resulting GLB rendered into a `<model-viewer>` web component in-page.
- Any `params:` block in the YAML preamble produced live `<input type="range">`
  sliders that re-executed the code on `pointerup` — true parametric live
  preview.
- The worker booted a 7.1 MB / 2.4 MB-compressed custom-trimmed WASM build
  defined by `ocjs-editor-theme/src/customBuild/customBuild.yml` (113 symbols
  for the docs-site examples).

This was a substantial feature and the most differentiating UX of the old
site. None of it survives in `docs-site/`: every code block is static text.

Per [D4](#d4-live-ux--playground-built-on-taucadruntime-was-e4): the
capability is reinstated and rebranded as **Playground**, but the
underlying runtime swap (Comlink+bespoke-worker → `@taucad/runtime`)
gates the work on the standalone npm release of `@taucad/runtime`. Until
that release lands the Playground is **blocked**, tracked as Phase 3.

The custom-trimmed WASM that powered the old previews
(`ocjs-editor-theme/src/customBuild/customBuild.yml`, 113 symbols) is a
useful starting point for sizing the Playground's wasm payload — the
bottle / boolean-logo / polygon examples it was tuned for are
substantially the same as the docs-site successors.

### Finding 8: Starter-templates page + zip downloads dropped

`/starter-templates` indexed pre-configured project skeletons:

- `ocjs-create-react-app-5.zip`
- `ocjs-create-react-app-typescript.zip`
- `ocjs-create-react-app-web-worker.zip`
- `ocjs-create-next-app-12.zip`
- `ocjs-create-nuxt-app.zip`
- `ocjs-node.zip`

These were served from `firebase.app`-hosted `/download-starter-templates/*.zip`
endpoints. The repository does not contain the templates themselves
(they were external assets), and the firebase hosting domain is gone.

Cross-cutting decisions ([D2](#d2-primary-audience--direct-npm-consumer-was-e1)

- [D4](#d4-live-ux--playground-built-on-taucadruntime-was-e4) +
  [D5](#d5-bundler-floor--vite--next--bun--node--deno--webpack-5-was-e5))
  reshape the starter-templates problem:

* CRA + Nuxt zips are **out of scope** (CRA deprecated, Nuxt was specific
  to Vue 2 era).
* The remaining frameworks (Vite, Next 15, Bun, Node) are already covered
  as **copy-paste-able single-file snippets** in `quick-start-npm.mdx` and
  `bundler-locatefile.mdx`. Reinstating a separate `/starter-templates`
  page would duplicate them.
* The **Playground** ([D4](#d4-live-ux--playground-built-on-taucadruntime-was-e4))
  obviates the "give me a runnable starting point" use-case for browser
  consumers — you start in the Playground, then export the snippet to
  your own project.

Concrete plan: drop the standalone `/starter-templates` page; the legacy
URL redirects to `quick-start-npm` (R8 in [Blueprint](#blueprint)). The
.zip download URLs all redirect to the same target. Once Playground
ships, the "runnable starting point" framing moves there.

### Finding 9: `visualizeShapes` / `visualizeDoc` helpers no longer documented

Original Hello, World introduced two reusable helpers in `/src/visualize.js`
and reused them across every example. They were the canonical
"shape → GLB → blob URL" pipeline.

In `docs-site/`, each example inlines the GLB pipeline (XCAF doc + shape tool

- incremental mesh + GLB writer + FS read + unlink). The duplication makes
  each example self-contained, but new consumers reading three examples in a
  row see the boilerplate three times.

Plan: keep the inline-per-example approach (clearer for first read) but
ship a canonical reusable utility in a new `guides/visualize-shape-helper.mdx`
(or as a callout in `render-with-three-js.mdx`) in Phase 2
(R9 in [Blueprint](#phase-2--content-reinstatement-unblocked-parallel-with-phase-1)).

### Finding 10: Redirects coverage is partial

`docs-site/redirects.json` has 10 entries; the deleted site exposed 24
URLs under `/docs/**` and `/starter-templates`, plus the legacy
`/reference-docs/**` TypeDoc family (linked from inside example
narratives). The full reinstatement table — 14 new entries plus the
`/reference-docs/**` catch-all — lives in
[Appendix § Redirect plan](#appendix--redirect-plan).

Three legacy URLs (the `progress-indicators-user-break/*` trio) and one
(`/docs/faq`) point at content that is itself being reinstated as part of
the blueprint. Per the redirect plan they land on the Phase-1 stub pages,
which then become real content in Phase 2 (R1) — the URL stays stable
across phases.

### Finding 11: No public-facing branding

`docs-site/app/layout.tsx` does **not** configure `metadata.icons`. `public/`
is empty. The Fumadocs default favicon and a plain text-only nav title will
ship instead of OCJS branding. The old site had:

- `static/favicon.ico` — OCJS-branded favicon.
- `static/img/logo.svg` — OCJS logo (boolean-cut sphere).

Per [D1](#d1-hosting-commitment--public-successor-was-e2) +
[D3](#d3-fork-narrative--ephemeral-fork-pending-upstream-pr-was-e3):
reinstate **the original upstream OCJS logo and favicon**, not Tau-branded
variants. Branding stays merge-back-ready — the upstream PR diff should
not include a brand reskin. Tau attribution lives footer-level only
(e.g. "Maintained by Tau during the v3 / OCCT V8 release window — see
FAQ").

Source assets to restore:

- `repos/opencascade.js/website/static/favicon.ico` (in deleted state,
  recoverable via `git show HEAD:website/static/favicon.ico`).
- `repos/opencascade.js/website/static/img/logo.svg` (same).

Both ship into `docs-site/public/` and get wired via
`app/layout.tsx` (`metadata.icons`) and `app/layout.config.tsx`
(`nav.title` upgrade to logo + text).

## Blueprint

The reinstatement work splits into **three phases** keyed on dependency
gates. Phase 1 is unblocked and ships before public-successor cutover.
Phase 2 is content reinstatement, parallelisable. Phase 3 is gated on the
standalone `@taucad/runtime` npm release.

### Phase 1 — Pre-cutover (unblocked, ship before redirecting `ocjs.org`)

These items are blocking for declaring `docs-site/` the public successor.
None depend on external work. **R0 sequences first** — it changes every
URL, so redirects (R10) and stub pages must target the post-restructure
paths.

| #   | Deliverable                                                                                                                                                                                                                                                                                                                                                                | Effort | Output                                                                                                                                                                                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R0  | Restructure `content/docs/` into `package/` + `toolchain/` roots per [Sidebar root-toggle dropdown](#sidebar-root-toggle-dropdown). Move every existing MDX file into its new home; add three new `meta.json` files (top-level + two roots); search-and-replace every internal `/docs/*` cross-link to the new prefixed URL; update `app/layout.config.tsx` top-nav links. | Medium | Sidebar shows the Package/Toolchain dropdown matching the Tau pattern; URLs change to `/docs/package/**` and `/docs/toolchain/**`; internal cross-links resolve; top-nav updated. Blocks R10. |
| R10 | Fill in the now-23 missing/updated redirects in `docs-site/redirects.json`. Concrete targets in [Appendix § Redirect plan](#appendix--redirect-plan). Every existing redirect entry's `destination` also needs updating to the new prefixed URL.                                                                                                                           | Low    | All `ocjs.org/docs/**` legacy URLs land somewhere meaningful; `progress-indicators-user-break/*` and `faq` redirect to interim stub pages.                                                    |
| R12 | Add catch-all redirect for `/reference-docs/**` TypeDoc URLs into Fumadocs `/docs/api/**` (or a friendly search fallback).                                                                                                                                                                                                                                                 | Low    | Inbound deep links from blog posts / Stack Overflow continue to resolve.                                                                                                                      |
| R11 | Ship favicon + nav-title logo using the **upstream OCJS assets** (restored from `git show HEAD:website/static/{favicon.ico,img/logo.svg}`). Tau attribution stays footer-level.                                                                                                                                                                                            | Low    | `docs-site/public/favicon.ico`, `docs-site/public/logo.svg`, `app/layout.tsx` `metadata.icons` block, `app/layout.config.tsx` `nav.title` upgraded to logo + text.                            |
| R3  | Reinstate FAQ as `getting-started/faq.mdx`. Three questions: "Is this a fork?" (answer: ephemeral fork pending upstream PR), "Who maintains it?" (donalffons primary, Tau interim), "How can I contribute?" (link to repo + upstream merge-back tracking).                                                                                                                 | Low    | `content/docs/getting-started/faq.mdx`, linked from homepage cards + footer.                                                                                                                  |
| R2  | Reinstate projects gallery as `getting-started/projects-using-opencascade-js.mdx` (or section on `what-is-opencascade-js.mdx`). Restore Polygonjs and the official `opencascade.js-examples` repo; include Tau as a peer entry, not a headline.                                                                                                                            | Low    | List of: ArchiYou, BitByBit, CascadeStudio, Polygonjs, RepliCAD, Tau, and the `opencascade.js-examples` reference repo.                                                                       |
| R4  | Extend `guides/bundler-locatefile.mdx` with a **Webpack 5** standalone section. Add a "Legacy bundlers" disclaimer linking to the upstream Docusaurus version in git history for CRA / Webpack 4 consumers.                                                                                                                                                                | Low    | New `## Webpack 5` section + `## Legacy bundlers` disclaimer in `bundler-locatefile.mdx`.                                                                                                     |
| —   | **Stub pages** for blocked content (so Phase 1 redirects have valid targets):                                                                                                                                                                                                                                                                                              | Low    | `guides/derive-cpp-class-in-js.mdx` marked "coming in Phase 2", plus a Playground placeholder noting the `@taucad/runtime` release dependency.                                                |

**Phase 1 exit criteria**: sidebar Package/Toolchain dropdown renders
matching the Tau pattern; every URL listed in the [Original Docusaurus
URL inventory](#appendix--original-docusaurus-url-inventory) resolves to
a Fumadocs page under `/docs/package/**` or `/docs/toolchain/**` (real
content or labelled stub); favicon + logo present; FAQ + projects
gallery + Webpack 5 recipe live; every internal cross-link in MDX bodies
resolves; `pnpm docs:validate` passes; `docs-site/tests/link-validity.test.ts`
passes against the restructured tree.

### Phase 2 — Content reinstatement (unblocked, parallel with Phase 1)

These items expand the consumer-facing surface but don't gate the
public-successor cutover. They can ship as content lands.

| #   | Deliverable                                                                                                                                                                                                                                                                                | Effort | Output                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Replace the Phase-1 stub with the full `guides/derive-cpp-class-in-js.mdx` tutorial. v3 suffix-free API; `Message_ProgressIndicator` + `UserBreak` as the worked example; validated against the current OCCT V8 pin. Updates `EMSCRIPTEN_BINDINGS` group naming to v3 conventions.         | Medium | New guide replacing Phase-1 stub; covers `EMSCRIPTEN_WRAPPER` + `allow_subclass<>` + `.extend("ClassName", { method() })` pattern. |
| R5  | Restore the full bottle example body in `examples/classic-bottle.mdx`: hollow (`BRepOffsetAPI_MakeThickSolid`), threading (`Geom_CylindricalSurface` + `Geom2d_Ellipse` + `Geom2d_TrimmedCurve` + `BRepOffsetAPI_ThruSections`), compound assembly, final rotation. On v3 suffix-free API. | Medium | Removes the "see legacy example" pointer; bottle becomes a complete worked example again.                                          |
| R6  | Restore XCAF per-subset PBR material assignment in `examples/boolean-logo.mdx` (`TopoDS_Iterator` walk + per-subset `XCAFDoc_VisMaterialPBR` allocation). v3 suffix-free API; new `using` declarations.                                                                                    | Low    | Boolean-logo renders with brass + gray material zones again, demonstrating the multi-material GLB-export pattern.                  |
| R9  | Document `visualizeShape` / `visualizeDoc` helpers — either as a new `guides/visualize-shape-helper.mdx` or as a callout in `render-with-three-js.mdx`. Single canonical reusable utility that examples can `import` from.                                                                 | Low    | Eliminates the inline-per-example GLB pipeline duplication. Examples become shorter; the helper lives in one canonical spot.       |

**Phase 2 exit criteria**: zero "see legacy example" or "this content is
being reinstated" pointers anywhere in `docs-site/`; all stubs replaced;
direct-consumer journey is gap-free.

### Phase 3 — Playground (blocked on `@taucad/runtime` npm release)

Single deliverable, single hard dependency.

| #   | Deliverable                                                                                                                                                                                                                                                                                                                           | Effort           | Output                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R7  | Build the **Playground** as a Fumadocs MDX component (`<Playground>`) backed by `@taucad/runtime`. Custom-trimmed WASM hosted alongside the docs site (starting point: 113 symbols from the legacy `customBuild.yml`, retargeted to v3 / OCCT V8). Replaces every static `js ocjs` legacy block with a live, parameterisable preview. | High (1–2 weeks) | `<Playground code="..." params={...}>` MDX component, custom-trimmed WASM in `docs-site/public/playground/`, Playground placeholder pages from Phase 1 promoted to real previews. Optional `/playground` landing page (decision deferred to runtime-release planning). |

**Hard dependency**: `@taucad/runtime` published to npm as a standalone
package. Until that release lands, Phase 3 is **not in flight** — the
Phase-1 Playground placeholders remain.

**Phase 3 exit criteria**: every example in `examples/*.mdx` has a live
Playground; `/playground` landing page exists (if scoped in); custom-trimmed
WASM bundle is reproducible from a checked-in YAML in `docs-site/`.

### Non-goals (explicitly out of scope)

For traceability, decisions that **removed** items from the original
recommendation list:

- **CRA / `react-app-rewired` / Webpack 4 recipes** — per
  [D5](#d5-bundler-floor--vite--next--bun--node--deno--webpack-5-was-e5).
  Legacy-bundlers disclaimer points consumers at the upstream
  Docusaurus version in git history.
- **Standalone `/starter-templates` page + rehosted .zip downloads** —
  per [Finding 8](#finding-8-starter-templates-page--zip-downloads-dropped).
  Single-file snippets in `quick-start-npm.mdx` + the Playground (Phase 3)
  cover the use-case; the legacy URL redirects to `quick-start-npm`.
- **Tau-branded variants of OCJS assets** — per
  [D3](#d3-fork-narrative--ephemeral-fork-pending-upstream-pr-was-e3).
  Upstream OCJS branding is restored to keep the merge-back diff small.
- **v2 `_N` overload suffix doc, `{ current: 0 }` reference-type doc,
  v2 `OCJS.getStandard_FailureData` doc** — architecturally obsolete in
  v3; existing `docs-site/` content covers the v3 replacements.

## Code Examples

### Phase 2 — `Message_ProgressIndicator` v3 migration (R1)

The Phase-1 stub at `guides/derive-cpp-class-in-js.mdx` becomes the full
tutorial in Phase 2 along these lines, validated against the current
OCJS / OCCT V8 pin:

```cpp
// additionalCppFiles: wrappers/progress-indicator-js.cpp
#include <Message_ProgressIndicator.hxx>
#include <Message_ProgressScope.hxx>
#include <emscripten/bind.h>
using namespace emscripten;

struct Message_ProgressIndicator_JS : public Message_ProgressIndicator {
  using Message_ProgressIndicator::Show;
  using Message_ProgressIndicator::UserBreak;
  using Message_ProgressIndicator::Reset;
};

struct Message_ProgressIndicator_JSWrapper : public wrapper<Message_ProgressIndicator_JS> {
  EMSCRIPTEN_WRAPPER(Message_ProgressIndicator_JSWrapper);
  void Show(const Message_ProgressScope& theScope, const Standard_Boolean isForce) {
    val valTheScope = val::object();
    valTheScope.set("current", &theScope);
    return call<void>("Show", valTheScope, isForce);
  }
  Standard_Boolean UserBreak() { return call<Standard_Boolean>("UserBreak"); }
  void Reset() { return call<void>("Reset"); }
};
```

```yaml
# build-configs/with-progress-callback.yml
additionalCppFiles:
  - wrappers/progress-indicator-js.cpp
mainBuild:
  bindings:
    - symbol: Message_ProgressIndicator
    - symbol: Message_ProgressScope
    - symbol: Message_ProgressRange
    - symbol: BRepAlgoAPI_Fuse
    - symbol: BRepPrimAPI_MakeBox
    - symbol: gp_Pnt
  additionalBindCode: |
    EMSCRIPTEN_BINDINGS(progress_indicator_js) {
      class_<Message_ProgressIndicator_JS, base<Message_ProgressIndicator>>(
          "Message_ProgressIndicator_JS")
        .function("Show", &Message_ProgressIndicator_JS::Show, pure_virtual())
        .function("UserBreak", optional_override([](Message_ProgressIndicator_JS& self) {
          return self.Message_ProgressIndicator_JS::UserBreak();
        }))
        .function("Reset", optional_override([](Message_ProgressIndicator_JS& self) {
          return self.Message_ProgressIndicator_JS::Reset();
        }))
        .allow_subclass<Message_ProgressIndicator_JSWrapper>("Message_ProgressIndicator_JSWrapper");
    }
```

```typescript
// JS side — note suffix-free Start(), pure_virtual Show, and v3 `using`.
const MyProgress = oc.Message_ProgressIndicator_JS.extend('Message_ProgressIndicator_JS', {
  Show(scope, isForce) {
    console.log('progress', this.GetPosition());
  },
  UserBreak() {
    return shouldCancel;
  },
});
using p = new MyProgress();
using box1 = new oc.BRepPrimAPI_MakeBox(new oc.gp_Pnt(0, 0, 0), 2, 1, 1);
using box2 = new oc.BRepPrimAPI_MakeBox(new oc.gp_Pnt(1, 0, 0), 2, 1, 1);
using fuse = new oc.BRepAlgoAPI_Fuse(box1.Shape(), box2.Shape(), p.Start());
```

The compile must be verified — `Start_1`/`Start_2` no longer exist in v3,
and the `EMSCRIPTEN_BINDINGS(...)` group name must be unique against the
generated bindings TUs (`progress_indicator_js` is unlikely to collide but
should be checked).

## References

- Deleted upstream Docusaurus tree: `git show HEAD:website/**` against
  `repos/opencascade.js`.
- Replacement Fumadocs tree:
  `repos/opencascade.js/docs-site/content/docs/**`.
- Redirect manifest:
  `repos/opencascade.js/docs-site/redirects.json`.
- Repo-level surfaces that absorbed some content:
  `repos/opencascade.js/README.md`,
  `repos/opencascade.js/CHANGELOG.md`,
  `repos/opencascade.js/BREAKING_CHANGES.md`.
- Related research:
  `docs/research/ocjs-fork-holistic-diff.md`,
  `docs/research/occt-v8-migration.md`.

## Appendix — Redirect plan

Concrete `redirects.json` deliverable for **Phase 1, R10**. The current
file ships 10 entries; this table is the full set of 24 plus the
`/reference-docs/**` catch-all (R12). Every legacy URL has a target.

**All target URLs include the post-restructure root prefix** (`/docs/package/*`
or `/docs/toolchain/*`) per
[D6 / Sidebar root-toggle dropdown](#sidebar-root-toggle-dropdown). The
existing 10 redirect entries in `redirects.json` also need their
destinations updated to the new prefixed paths — they don't survive
unchanged.

### Existing redirects (destinations updated for restructure)

| Source                                        | Target (new, prefixed)                           |
| --------------------------------------------- | ------------------------------------------------ |
| `/docs/getting-started/hello-world`           | `/docs/package/getting-started/quick-start-npm`  |
| `/docs/getting-started/configure-bundler`     | `/docs/package/guides/bundler-locatefile`        |
| `/docs/getting-started/file-size`             | `/docs/toolchain/guides/trim-symbols`            |
| `/docs/app-dev-workflow/custom-builds`        | `/docs/toolchain/guides/trim-symbols`            |
| `/docs/examples/ocjs-logo`                    | `/docs/package/examples/boolean-logo`            |
| `/docs/examples/bottle`                       | `/docs/package/examples/classic-bottle`          |
| `/docs/advanced/exceptions/catch-exceptions`  | `/docs/package/guides/debugging-wasm-exceptions` |
| `/docs/advanced/multi-threading/custom-build` | `/docs/toolchain/guides/multi-threading`         |
| `/docs/developer-docs/overview`               | `/docs/toolchain/concepts/bindgen-pipeline`      |
| `/docs/concepts/ncollection-and-handles`      | `/docs/package/concepts/handles-and-collections` |

### New redirects (add in Phase 1)

| Source                                                       | Target                                                                     | Notes                                                                                                                        |
| ------------------------------------------------------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `/docs/about`                                                | `/docs/package/getting-started/what-is-opencascade-js`                     | The original "About" page is now split between the concept doc and the projects gallery (R2).                                |
| `/docs/app-dev-workflow/workflow`                            | `/docs`                                                                    | Landing page's "Choose your path" subsumes the workflow concept.                                                             |
| `/docs/app-dev-workflow/pre-built`                           | `/docs/package/getting-started/quick-start-npm`                            | Pre-built consumption is the npm quickstart.                                                                                 |
| `/docs/examples/polygon`                                     | `/docs/package/examples/polygon-extrusion`                                 | Direct successor.                                                                                                            |
| `/docs/advanced/differences-cpp-js/intro`                    | `/docs/package/concepts/calling-occt-from-js`                              |                                                                                                                              |
| `/docs/advanced/differences-cpp-js/overloaded-methods`       | `/docs/package/concepts/calling-occt-from-js#no-more-_n-overload-suffixes` | v3 removed `_N`; section anchor lands directly on the v3 explanation.                                                        |
| `/docs/advanced/differences-cpp-js/references-to-built-ins`  | `/docs/package/concepts/return-shapes`                                     | v3 envelope returns supersede the `{current: 0}` pattern.                                                                    |
| `/docs/advanced/multi-threading/intro`                       | `/docs/toolchain/guides/multi-threading`                                   |                                                                                                                              |
| `/docs/advanced/exceptions/intro`                            | `/docs/package/guides/debugging-wasm-exceptions`                           |                                                                                                                              |
| `/docs/advanced/progress-indicators-user-break/intro`        | `/docs/toolchain/guides/derive-cpp-class-in-js`                            | Phase-1 stub page; replaced with full content in Phase 2 (R1). URL remains stable.                                           |
| `/docs/advanced/progress-indicators-user-break/custom-build` | `/docs/toolchain/guides/derive-cpp-class-in-js`                            | Same destination — single consolidated guide replaces the 3-page series.                                                     |
| `/docs/advanced/progress-indicators-user-break/derive-class` | `/docs/toolchain/guides/derive-cpp-class-in-js`                            | Same destination.                                                                                                            |
| `/docs/faq`                                                  | `/docs/package/getting-started/faq`                                        | Reinstated in Phase 1, R3.                                                                                                   |
| `/starter-templates`                                         | `/docs/package/getting-started/quick-start-npm`                            | Single-file snippets in quick-start replace .zips per [Finding 8](#finding-8-starter-templates-page--zip-downloads-dropped). |
| `/download-starter-templates/*.zip`                          | `/docs/package/getting-started/quick-start-npm`                            | Wildcard rule; honours external blog-post inbound links.                                                                     |
| `/reference-docs/**`                                         | `/docs/package/api/**` (catch-all)                                         | R12. Legacy TypeDoc URL family redirected into the Fumadocs OpenAPI surface.                                                 |

**Note**: every redirect is `permanent: true` (HTTP 308). The Tau-fork
period is bounded, but during the merge-back PR the URL stability matters
more than reserving optionality.

## Appendix — Original Docusaurus URL inventory

For traceability, the full set of public URLs the deleted site exposed,
keyed against the [redirect plan](#appendix--redirect-plan) above:

```
/                                                              homepage — replaced (persona cards)
/docs/about                                                    → /docs/package/getting-started/what-is-opencascade-js
/docs/getting-started/hello-world                              → /docs/package/getting-started/quick-start-npm
/docs/getting-started/configure-bundler                        → /docs/package/guides/bundler-locatefile
/docs/getting-started/file-size                                → /docs/toolchain/guides/trim-symbols
/docs/app-dev-workflow/workflow                                → /docs
/docs/app-dev-workflow/pre-built                               → /docs/package/getting-started/quick-start-npm
/docs/app-dev-workflow/custom-builds                           → /docs/toolchain/guides/trim-symbols
/docs/examples/ocjs-logo                                       → /docs/package/examples/boolean-logo
/docs/examples/bottle                                          → /docs/package/examples/classic-bottle
/docs/examples/polygon                                         → /docs/package/examples/polygon-extrusion
/docs/advanced/differences-cpp-js/intro                        → /docs/package/concepts/calling-occt-from-js
/docs/advanced/differences-cpp-js/overloaded-methods           → /docs/package/concepts/calling-occt-from-js#no-more-_n-overload-suffixes
/docs/advanced/differences-cpp-js/references-to-built-ins     → /docs/package/concepts/return-shapes
/docs/advanced/progress-indicators-user-break/intro            → /docs/toolchain/guides/derive-cpp-class-in-js  (Phase-1 stub → Phase-2 full content)
/docs/advanced/progress-indicators-user-break/custom-build     → /docs/toolchain/guides/derive-cpp-class-in-js
/docs/advanced/progress-indicators-user-break/derive-class     → /docs/toolchain/guides/derive-cpp-class-in-js
/docs/advanced/multi-threading/intro                           → /docs/toolchain/guides/multi-threading
/docs/advanced/multi-threading/custom-build                    → /docs/toolchain/guides/multi-threading
/docs/advanced/exceptions/intro                                → /docs/package/guides/debugging-wasm-exceptions
/docs/advanced/exceptions/catch-exceptions                     → /docs/package/guides/debugging-wasm-exceptions
/docs/developer-docs/overview                                  → /docs/toolchain/concepts/bindgen-pipeline
/docs/faq                                                      → /docs/package/getting-started/faq
/starter-templates                                             → /docs/package/getting-started/quick-start-npm
/reference-docs/**                                             → /docs/package/api/**  (catch-all)
/download-starter-templates/*.zip                              → /docs/package/getting-started/quick-start-npm  (wildcard)
```

## Implementation Status

Implementation landed in the Tau monorepo working copy (2026-05-22). PR ref TBD at merge time.

### Phase 1 — Pre-cutover

| R#  | Status | Notes                                                                                                     |
| --- | ------ | --------------------------------------------------------------------------------------------------------- |
| R0  | Landed | `package/` + `toolchain/` Fumadocs roots; Package/Toolchain sidebar dropdown; API at `/docs/package/api`. |
| R10 | Landed | 25 entries in `redirects.json`; legacy `/docs/api` catch-all in `next.config.ts`.                         |
| R12 | Landed | `/reference-docs/**` → `/docs/package/api/**` in `next.config.ts`.                                        |
| R11 | Landed | Upstream favicon + logo in `public/`; `metadata.icons`; nav logo in `layout.config.tsx`.                  |
| R3  | Landed | `package/getting-started/faq.mdx` with ephemeral-fork narrative.                                          |
| R2  | Landed | `package/getting-started/projects-using-opencascade-js.mdx`.                                              |
| R4  | Landed | Webpack 5 + Legacy bundlers sections in `bundler-locatefile.mdx`.                                         |
| —   | Landed | Playground placeholder at `package/playground/index.mdx`.                                                 |

### Phase 2 — Content reinstatement

| R#  | Status | Notes                                                                     |
| --- | ------ | ------------------------------------------------------------------------- |
| R1  | Landed | Full `toolchain/guides/derive-cpp-class-in-js.mdx` on v3 suffix-free API. |
| R5  | Landed | Full bottle body (hollow + threading + compound) in `classic-bottle.mdx`. |
| R6  | Landed | XCAF per-subset PBR materials restored in `boolean-logo.mdx`.             |
| R9  | Landed | `package/guides/visualize-shape-helper.mdx`; cross-linked from examples.  |

### Phase 3 — Playground (blocked)

| R#  | Status  | Notes                                                                                             |
| --- | ------- | ------------------------------------------------------------------------------------------------- |
| R7  | Blocked | Awaiting standalone `@taucad/runtime` npm release. Placeholder at `package/playground/index.mdx`. |
