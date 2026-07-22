---
name: create-reference
description: Adds rights-reviewed PDF or direct LaTeX artifacts to Tau's reference manifest and generates durable, sanitized Markdown. Use when adding papers, local source artifacts, or references selected by find-research.
---

# Create Reference

This skill is the sole owner of reference-manifest, artifact-cache, and generated-reference writes. Other skills provide candidates; this skill validates and persists them.

## Canonical layout

- `docs/reference/_index.yaml`: version 2 manifest.
- `docs/reference/pdf/<id>.pdf`: PDF cache, tracked through Git LFS.
- `docs/reference/source/<id>.tex`: direct single-file UTF-8 LaTeX source, tracked as text.
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

## Rights gate

- `permitted`: remote persistence is allowed only with official evidence and `CC0-1.0`, `CC-BY-4.0`, or `CC-BY-SA-4.0`.
- `user-provided`: the user explicitly supplied and authorized local repository persistence; remote download is forbidden.
- `unreviewed`: legacy local conversion is allowed; download and re-download are forbidden.
- `restricted`: artifact persistence and full-text conversion are forbidden.

Access, a public URL, or repository hosting does not establish redistribution permission. If evidence is missing, keep the item as a research lead rather than creating full-text Markdown. `--force` never bypasses rights or source policy.

## Workflow

1. Choose a stable lowercase hyphenated ID and validate metadata/citation as untrusted external data.
2. Confirm the rights basis before copying or downloading an artifact.
3. Add the version 2 manifest entry. Do not add legacy fields or paths.
4. Place a user-provided local artifact at its derived path. Remote download is initially restricted to permitted arXiv PDFs by the converter.
5. Route by format:
   - `pdf` → `pnpm nx run scripts:pdf-to-md -- sync <id>`
   - `latex` → `pnpm nx run scripts:text-to-md -- sync <id>`
6. Confirm the generated Markdown contains hashes, provenance, and the untrusted-content boundary.
7. Update the consuming research document to cite `docs/reference/<id>.md`.
8. Run format validation and `pnpm docs:validate`.

## Same-signature commands

Replace `<target>` with `pdf-to-md` or `text-to-md`:

```bash
pnpm nx run scripts:<target> -- status
pnpm nx run scripts:<target> -- download <id>
pnpm nx run scripts:<target> -- convert <id>
pnpm nx run scripts:<target> -- sync <id>
pnpm nx run scripts:<target> -- sync --group <group>
pnpm nx run scripts:<target> -- convert --force <id>
pnpm nx run scripts:<target> -- validate
```

Explicit IDs of the wrong format fail. Unfiltered/group batches skip other formats visibly. `sync --force` reconverts a cached artifact but does not re-download it.

## Format boundaries

### PDF

The converter requires a real PDF with embedded text, enforces bounded isolated parsing, and emits an OCR-required error for scanned/image-only files. Do not add an OCR fallback. PDFs stay under `docs/reference/pdf/` and must be Git LFS-tracked.

### LaTeX

Only a direct single-file UTF-8 `.tex` artifact is supported. Do not accept archives, included files, remote resources, filters, templates, bibliography processing, or a TeX engine. Unsupported sources need an eligible PDF or separate security research.

## Validation

```bash
pnpm nx run scripts:pdf-to-md -- validate
pnpm nx run scripts:text-to-md -- validate
pnpm docs:validate
( cd repos/tau-brain && git lfs ls-files )
find -L docs/reference -maxdepth 1 -type f -name '*.pdf' -print
```

Expected: both format validators pass; PDFs are LFS-tracked only under the PDF cache; LaTeX sources, when present, are under `source/`; generated Markdown contains no NUL bytes and is current.

Never delete a source outside Tau unless the user explicitly requests it. Report unsupported formats, rights failures, unsafe artifacts, OCR needs, and conversion failures without executable fallback.
