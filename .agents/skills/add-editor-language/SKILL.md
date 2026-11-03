---
name: add-editor-language
description: Add a source language to Tau's CodeMirror editor and the shared Lezer highlighting registry. Use when adding file extensions, a Lezer grammar, syntax support or a language-service adapter; preserve lazy code-pane admission and grammar provenance.
---

# Add an editor language

Read [language contribution policy](../../../docs/policy/language-contribution-policy.md) and the instruction chains for the affected packages.

## Workflow

1. Establish the supported extensions, canonical language ID, syntax source and actual semantic capabilities. Prefer an existing CodeMirror language package when its parser meets the language's needs. A syntax-only contribution does not imply a language server.
2. For a custom grammar, write or adapt a Lezer grammar at `libs/grammars/src/<language>/<language>.grammar` and record its upstream source, revision and licence in the grammar header and the package README. Map node names to highlight tags in `<language>-syntax.ts`, then run `pnpm --filter @taucad/grammars generate`; never hand-edit the generated `.parser.ts` tables. Register the language in `languages.ts` (id and aliases) and `registry.ts` (lazy loader). One grammar serves every surface.
3. Extend the shared language metadata in `libs/types/src/constants/code.constants.ts` and UI resolution in `apps/ui/app/lib/code-language-resolution.ts` as needed. `editor-languages.ts` must remain runtime-free metadata. Preserve TSX/JSX and format-specific distinctions such as JSON, JSONC and JSONL.
4. `apps/ui/app/lib/editor-syntax.ts` loads syntax through the registry, so no editor change is needed for highlighting. Keep comment, bracket, indentation and folding behavior appropriate to the language in the grammar's `languageData`, `indentNodeProp` and `foldNodeProp`.
5. If the language has semantic services, add its adapter under `apps/ui/app/lib/<language>-language/` and dispatch it through `editor-language-runtime.ts`. A factory accepts the neutral document, project environment and abort signal, then returns extensions and an idempotent disposer. Share backends per project session, retain each split view independently and dispose on last release, including cancellation during startup.
6. Resolve files through the existing rooted filesystem ports and shared LSP tiers. Use checked workspace edits against the exact text used to compute the edits. Preserve read-only provenance, diagnostics, request cancellation and stale-result checks.
7. If the language server documents code loosely (untagged fences, or another language's tag), pass `languageId` and `fenceAliases` to `renderEditorDocumentation` and `editorCompletionInfo` in the adapter. Do not activate language services from documentation, project hover, viewer-only routes or a hidden mobile code tab; highlighting a code block loads only the grammar.

## Verification

- Add a realistic sample and expected tokens to `libs/grammars/src/fixtures.ts`. `grammars.test.ts` then checks it parses without error nodes, highlights each expected token, reparses incrementally to a fresh parse's result and survives unterminated input; `code-surfaces.test.tsx` checks the same tokens on every app surface. Parse any real corpus the language has (for KCL, every standard library module) with zero error nodes.
- Test each declared semantic capability against its real provider or worker. Include startup cancellation, split reuse, last-view disposal and stale edits. Keep syntax and basic editing usable when optional semantics fail, with a visible diagnostic.
- Run `pnpm nx typecheck ui`, affected package typechecks and focused Nx lint/test targets. Use actual project names from `pnpm nx show project`.
- Inspect all four themes in a real browser, including completion/hover/diagnostic widgets and keyboard focus. Capture no-pane network activity and the production import graph to prove the new syntax/backend downloads only after a matching code pane is admitted.
- Update the current capability documentation and report unavailable device/worker checks explicitly.

## Boundaries

No eager language registry, all-kernel declaration preload, classic-worker fallback, independent filesystem tree, AI inline-completion adapter or whole-buffer tokenization in the editing loop. Keep metadata, syntax readiness, semantic readiness and document persistence as separate owners.
