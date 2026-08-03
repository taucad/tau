---
name: create-reference
description: Adds rights-reviewed PDF, direct LaTeX, or JavaScript-rendered HTML artifacts to Tau's reference manifest and generates durable, sanitized Markdown. Use when adding papers, web pages, local source artifacts, or references selected by find-research.
---

# Create Reference

This skill is the sole owner of reference-manifest, artifact-cache, and generated-reference writes. Other skills provide candidates; this skill validates and persists them.

## Canonical layout

- `docs/reference/_index.yaml`: version 2 manifest.
- `docs/reference/pdf/<id>.pdf`: downloaded PDF or static HTML visual capture, tracked through Git LFS.
- `docs/reference/source/<id>.tex`: direct single-file UTF-8 LaTeX source, tracked as text.
- `docs/reference/source/<id>.snapshot.html`: inert semantic snapshot paired with an HTML visual capture.
- `docs/reference/<id>.md`: durable sanitized Markdown that research documents cite.

Paths and expected media types are derived from the reference ID and `artifact.format`; never add configurable paths. `docs/reference` intentionally resolves to the Tau Brain repository. Do not replace that boundary or introduce symlinks below it.

## Manifest entry

```yaml
example-paper:
  title: Example Paper
  authors:
    - Example Author
  year: 2026
  venue: arXiv
  source_url: https://arxiv.org/abs/2601.00000
  artifact:
    format: pdf
    url: https://arxiv.org/pdf/2601.00000
    rights:
      status: permitted
      license: CC-BY-4.0
      evidence_url: https://arxiv.org/abs/2601.00000
  used_by:
    - docs/research/example.md
  tags:
    - topic
  citation:
    format: bibtex
    key: author2026example
    bibtex: |
      @misc{author2026example,
        title = {Example Paper},
        author = {Example Author},
        year = {2026}
      }
```

Add the ID to the appropriate `groups.<group>.references` list.

For an eligible web page, use `format: html`; its artifact URL is the credential-free HTTPS page URL:

```yaml
artifact:
  format: html
  url: https://example.org/article
  rights:
    status: permitted
    license: CC-BY-4.0
    evidence_url: https://example.org/article
```

## Rights gate

- `permitted`: remote persistence is allowed when the user explicitly authorizes it or official evidence establishes an approved `CC0-1.0`, `CC-BY-4.0`, or `CC-BY-SA-4.0` license. `license` and `evidence_url` are optional provenance; when recorded, the license must be approved and the evidence must be credential-free HTTPS. HTML evidence must be same-origin and page-scoped.
- `user-provided`: the user explicitly supplied and authorized local repository persistence; remote download or navigation is forbidden.
- `unreviewed`: legacy local conversion is allowed; download, recapture, and re-download are forbidden.
- `restricted`: artifact persistence and full-text conversion are forbidden.

Access, a public URL, an application license, or repository hosting does not establish redistribution permission for article prose. Without official evidence or explicit user authorization, keep the item as a research lead. `--force` never bypasses rights or source policy.

## Workflow

1. Choose a stable lowercase hyphenated ID and validate metadata/citation as untrusted external data.
2. Confirm the rights basis before copying, downloading, or capturing an artifact.
3. Add the version 2 manifest entry. Do not add legacy fields or paths.
4. Place a user-provided local artifact at its derived path, or let the correct permitted remote route acquire it.
5. Route by format:
   - `pdf` → `pnpm nx run scripts:pdf-to-md -- sync <id>`
   - `latex` → `pnpm nx run scripts:text-to-md -- sync <id>`
   - `html` → `pnpm nx run scripts:html-to-md -- sync <id>`
6. For HTML, review the raw and rendered Markdown against both cached artifacts. Fix shared collection/conversion defects and regenerate until the output is legible, complete within its reported scope, and free of critical duplication, hierarchy, table, code, link, figure, and whitespace defects.
7. Confirm the generated Markdown contains hashes, provenance, the HTML completeness report when applicable, and the untrusted-content boundary.
8. Update the consuming research document to cite `docs/reference/<id>.md`.
9. Run all format validation and `pnpm docs:validate`.

## Same-signature commands

Replace `<target>` with `pdf-to-md`, `text-to-md`, or `html-to-md`:

```bash
pnpm nx run scripts:<target> -- status
pnpm nx run scripts:<target> -- download <id>
pnpm nx run scripts:<target> -- convert <id>
pnpm nx run scripts:<target> -- sync <id>
pnpm nx run scripts:<target> -- sync --group <group>
pnpm nx run scripts:<target> -- convert --force <id>
pnpm nx run scripts:<target> -- validate
```

Explicit IDs of the wrong format fail. Unfiltered/group batches skip other formats visibly. `sync --force` reconverts cached artifacts but does not re-download or recapture them.

## Format boundaries

### PDF

The converter requires a real PDF with embedded text, enforces bounded isolated parsing, and emits an OCR-required error for scanned/image-only files. Do not add an OCR fallback. PDFs stay under `docs/reference/pdf/` and must be Git LFS-tracked.

### LaTeX

Only a direct single-file UTF-8 `.tex` artifact is supported. Do not accept archives, included files, remote resources, filters, templates, bibliography processing, or a TeX engine. Unsupported sources need an eligible PDF or separate security research.

### HTML

HTML acquisition runs JavaScript in a fresh bounded Chromium context, then writes a complementary pair: a static visual PDF and an inert, resource-free semantic snapshot. The snapshot, not PDF text extraction, feeds Markdown.

The collector settles fonts, images, animations, lazy scrolling, and routed requests; then sequentially visits native `<details>`, ARIA accordions with `aria-expanded` plus `aria-controls`, and ARIA tabs with `role=tab` plus `aria-controls`. It restores prior state, deduplicates captured panels, and reports discovered, visited, empty, failed, and skipped states. A discovered standard state that cannot be collected is fatal. `body` fallback or malformed standard controls produce an explicit `partial` report; arbitrary widgets are never clicked.

Only credential-free public HTTP(S) resources are allowed. Authentication, cookies, consent clicks, arbitrary selectors, popups, downloads, workers, sockets, media, active/raw HTML, HAR/WARC/MHTML, and replay are unsupported. The PDF preserves visual evidence, including rendered SVG/canvas/WebGL output where the page exposes it to Chromium; it never contains live JavaScript.

## Validation

```bash
pnpm nx run scripts:pdf-to-md -- validate
pnpm nx run scripts:text-to-md -- validate
pnpm nx run scripts:html-to-md -- validate
pnpm docs:validate
( cd repos/tau-brain && git lfs ls-files )
find -L docs/reference -maxdepth 1 -type f -name '*.pdf' -print
```

Expected: all format validators pass; PDFs are LFS-tracked only under the PDF cache; LaTeX and inert HTML snapshots are under `source/`; generated Markdown contains no NUL bytes and is current; HTML headers match both cached hashes and state the capture completeness.

Never delete a source outside Tau unless the user explicitly requests it. Report unsupported formats, rights failures, unsafe artifacts, OCR needs, partial coverage, and conversion failures without executable fallback.
