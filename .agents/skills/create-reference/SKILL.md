---
name: create-reference
description: Add research PDFs to docs/reference through docs/reference/_index.yaml, cache PDFs under docs/reference/pdf/, and generate durable Markdown with scripts:pdf-to-md. Use when the user invokes /create-reference, adds papers or PDFs, or wants reference sources converted before check-in.
---

# Create Reference

Create durable research references through `docs/reference/_index.yaml`. The manifest is the source of truth for source URLs, cached PDF paths, Markdown paths, groups, usage, and citations.

## Canonical Files

- `docs/reference/_index.yaml`: tracked reference manifest.
- `docs/reference/pdf/`: gitignored PDF cache for human reading.
- `docs/reference/<id>.md`: tracked Markdown text extraction.

No PDFs should be tracked in git, including under `docs/reference/pdf/`.

## Manifest Entry

Add or update one entry under `references`:

```yaml
paper-slug:
  title: Example Paper Title
  authors:
    - First Author
    - Second Author
  year: 2026
  venue: arXiv
  source_url: https://arxiv.org/abs/2601.00000
  pdf_url: https://arxiv.org/pdf/2601.00000
  pdf: docs/reference/pdf/paper-slug.pdf
  markdown: docs/reference/paper-slug.md
  used_by:
    - docs/research/example.md
  tags:
    - topic
  description: Why this reference matters.
  citation:
    format: bibtex
    key: author2026example
    bibtex: |
      @misc{author2026example,
        title = {Example Paper Title},
        author = {First Author and Second Author},
        year = {2026},
        url = {https://arxiv.org/abs/2601.00000}
      }
```

Also add the slug to the appropriate `groups.<group>.references` list.

## Workflow

1. Choose a stable lowercase hyphenated slug.
2. Add the manifest entry with a valid `pdf_url` and BibTeX citation.
3. Run `pnpm nx run scripts:pdf-to-md -- sync <slug>`.
4. Confirm `docs/reference/<slug>.md` exists and includes manifest provenance.
5. Keep the cached PDF under `docs/reference/pdf/`.
6. Update research or policy docs to point at `docs/reference/<slug>.md`.
7. Validate the final state.

## Commands

```bash
pnpm nx run scripts:pdf-to-md -- status
pnpm nx run scripts:pdf-to-md -- sync <slug>
pnpm nx run scripts:pdf-to-md -- sync --group <group>
pnpm nx run scripts:pdf-to-md -- sync --force <slug>
pnpm nx run scripts:pdf-to-md -- validate
pnpm docs:validate
```

Default `pnpm nx run scripts:pdf-to-md` syncs every manifest reference.

## Input Handling

### Remote PDF

Prefer manifest-first. Add `pdf_url`, then run:

```bash
pnpm nx run scripts:pdf-to-md -- sync <slug>
```

The script downloads missing PDFs into `docs/reference/pdf/` and converts missing or stale Markdown.

### Local PDF

If the source is a local PDF, copy or move it to `docs/reference/pdf/<slug>.pdf`, add a manifest entry with the durable external `source_url` and `pdf_url` when available, then run:

```bash
pnpm nx run scripts:pdf-to-md -- convert <slug>
```

Do not delete source files outside the repo unless the user explicitly asks.

### Scanned PDFs

The converter extracts embedded text. If a PDF has no extractable text, stop and report that OCR is required unless OCR tooling already exists in the repo.

## Validation

Run before finalizing:

```bash
pnpm nx run scripts:pdf-to-md -- validate
pnpm docs:validate
git check-ignore docs/reference/pdf/example.pdf
git ls-files 'docs/reference/**/*.pdf'
find docs/reference -maxdepth 1 -type f -name '*.pdf' -print
find docs/reference -maxdepth 1 -type f -name '*.md' -exec perl -0ne 'if (/\0/) { print "$ARGV\n" }' {} +
```

Expected results:

- `_index.yaml` validates.
- Cached PDFs are ignored.
- No PDFs are tracked by git.
- No PDFs exist directly under `docs/reference`.
- Generated Markdown has no NUL bytes.
- `pnpm docs:validate` passes.

## Final Response

Summarize:

- Manifest entries added or updated.
- Markdown references created or refreshed.
- Cached PDFs kept under `docs/reference/pdf/`.
- Validation commands run and their results.
