---
name: add-editor-language
description: Add a source language to Tau's CodeMirror editor and shared Shiki highlighting. Use when adding file extensions, canonical TextMate grammars, syntax support or a language-service adapter; preserve lazy code-pane admission and grammar provenance.
---

# Add an editor language

Read [language contribution policy](../../../docs/policy/language-contribution-policy.md) and the instruction chains for the affected packages.

## Workflow

1. Establish the supported extensions, canonical language ID, syntax source and actual semantic capabilities. Prefer an existing CodeMirror language package when its parser meets the language's needs. A syntax-only contribution does not imply a language server.
2. For a custom TextMate grammar, preserve its upstream source, revision and licence in `libs/grammars`. Use the existing grammar generator/precompile target after inspecting that project's configuration. Regenerate compiled grammar output; never hand-edit generated regular expressions. Reuse the same grammar for editor and documentation highlighting.
3. Extend the shared language metadata in `libs/types/src/constants/code.constants.ts` and UI resolution in `apps/ui/app/lib/code-language-resolution.ts` as needed. `editor-languages.ts` must remain runtime-free metadata. Preserve TSX/JSX and format-specific distinctions such as JSON, JSONC and JSONL.
4. Add a dynamic syntax loader to `apps/ui/app/lib/editor-syntax.ts`. Custom grammars use the incremental line adapter in `editor-textmate-syntax.ts`; never run whole-document Shiki tokenization after each keystroke. Keep comment, bracket and indentation behavior appropriate to the language.
5. If the language has semantic services, add its adapter under `apps/ui/app/lib/<language>-language/` and dispatch it through `editor-language-runtime.ts`. A factory accepts the neutral document, project environment and abort signal, then returns extensions and an idempotent disposer. Share backends per project session, retain each split view independently and dispose on last release, including cancellation during startup.
6. Resolve files through the existing rooted filesystem ports and shared LSP tiers. Use checked workspace edits against the exact text used to compute the edits. Preserve read-only provenance, diagnostics, request cancellation and stale-result checks.
7. Add the grammar to the existing lazy Shiki highlighter only where the documentation/chat surface needs it. Do not activate editor code from documentation, project hover, viewer-only routes or a hidden mobile code tab.

## Verification

- Add actual token-output fixtures in `editor-syntax.test.ts`: incomplete input, strings/comments, escapes, Unicode, multiline state and embedded syntax where applicable.
- Test each declared semantic capability against its real provider or worker. Include startup cancellation, split reuse, last-view disposal and stale edits. Keep syntax and basic editing usable when optional semantics fail, with a visible diagnostic.
- Run `pnpm nx typecheck ui`, affected package typechecks and focused Nx lint/test targets. Use actual project names from `pnpm nx show project`.
- Inspect all four themes in a real browser, including completion/hover/diagnostic widgets and keyboard focus. Capture no-pane network activity and the production import graph to prove the new syntax/backend downloads only after a matching code pane is admitted.
- Update the current capability documentation and report unavailable device/worker checks explicitly.

## Boundaries

No eager language registry, all-kernel declaration preload, classic-worker fallback, independent filesystem tree, AI inline-completion adapter or whole-buffer tokenization in the editing loop. Keep metadata, syntax readiness, semantic readiness and document persistence as separate owners.
