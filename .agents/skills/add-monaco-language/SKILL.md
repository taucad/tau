---
name: add-monaco-language
description: Adds a new TextMate-based language to the Monaco editor and Shiki highlighter in apps/ui, including precompiling grammars from repos/shiki, wiring codeLanguages and the contribution registry, and keeping artefacts traceable. Use when adding Monaco or Shiki support for a new file extension, creating a custom language pack, or copying the SysML v2 integration pattern.
disable-model-invocation: true
---

# Add a Monaco + Shiki language

## When to use

- A new source extension (e.g. `.sysml`, `.kerml`) should open in the editor with correct token colours.
- MDX/docs need the same grammar available through the shared Shiki bundle (`getHighlighter` in `apps/ui/app/lib/shiki.lib.ts`).
- You have or can obtain a **TextMate JSON** grammar (`*.tmLanguage.json`).

## Prerequisites

- **Grammar**: Prefer MIT/BSD-licenced VS Code extensions on GitHub (search `extension:tmLanguage.json <keyword>`). Evaluate richness: keyword-only regex blobs vs structured rules (strings, numbers, operators, type capture groups).

- **Fork tooling**: Grammar precompilation lives in the Tau `taucad/shiki` fork under `repos/shiki/precompiled/` (clone via `pnpm repos clone shiki` after `repos.yaml` lists it). The script is `precompiled/precompile-grammar.ts`; see `repos/shiki/precompiled/README.md`.

## Workflow (SysML v2 example)

1. **Author or vendor** `your-lang.tmLanguage.json` (optionally patch upstream — e.g. merge `unrestricted-names` from the OMG pilot into daltskin’s SysML grammar).

2. **Precompile** from the shiki checkout (requires workspace `node_modules` installed in `repos/shiki`):

   ```bash
   cd repos/shiki/precompiled
   npx tsx precompile-grammar.ts ./your-lang.tmLanguage.json
   ```

   This writes `your-lang-precompiled.mjs` next to the script.

3. **Create** `apps/ui/app/lib/<name>-language/` with three artefacts:
   - `<name>.tmLanguage.json` — source grammar (reviewable in PRs).
   - `<name>-shiki-precompiled.ts` — header (oxlint/eslint disables + @see + licence attribution) plus the body of the generated `.mjs` (`const lang = Object.freeze(…); const langs = [lang]; export default langs`).
   - `<name>-register-language.ts` — `register*Language(monaco)` (id from `codeLanguages`, extensions, aliases, `setLanguageConfiguration`), and export `<name>Contribution: LanguageContribution` with explicit `activationLanguageIds`.

   Mirror simple languages like `apps/ui/app/lib/usd-language/` (comment/bracket languages) or richer ones like `openscad-language/` (extra providers). Use **object** shapes for `surroundingPairs` / `autoClosingPairs` (`{ open, close }`) — Monaco types reject raw tuples.

4. **Wire five sites**
   - `libs/types/src/constants/code.constants.ts` — `codeLanguages.<id>` and `languageFromExtension` entries for each file extension.
   - `apps/ui/app/lib/monaco.constants.ts` — `monacoLanguages` and `extensionToMonacoLanguage`.
   - `apps/ui/app/lib/shiki.lib.ts` — `import('#lib/.../<name>-shiki-precompiled.js')` in `langs` (keep `@ts-expect-error` until grammars live upstream).
   - `apps/ui/app/lib/monaco.lib.ts` — `registry.addContribution(<name>Contribution)`.
   - `apps/ui/app/lib/contribution-activation-ids.test.ts` — one row asserting `activationLanguageIds`.

5. **Verify**
   - `pnpm nx typecheck ui` and `pnpm nx typecheck types`.
   - `pnpm nx test ui ./app/lib/contribution-activation-ids.test.ts --watch=false`.
   - `pnpm nx lint ui --files='app/lib/<name>-language/*.ts'` and `pnpm nx lint types --files='src/constants/code.constants.ts'`.
   - Smoke: `pnpm nx serve ui`, open a file with the new extension, confirm Shiki token colours.

## File checklist

| Location                                                      | Purpose                                            |
| ------------------------------------------------------------- | -------------------------------------------------- |
| `apps/ui/app/lib/<name>-language/<name>.tmLanguage.json`      | Canonical TextMate source                          |
| `apps/ui/app/lib/<name>-language/<name>-shiki-precompiled.ts` | Shiki `LanguageRegistration` for `@shikijs/monaco` |
| `apps/ui/app/lib/<name>-language/<name>-register-language.ts` | Monaco registration + `LanguageContribution`       |
| `libs/types/src/constants/code.constants.ts`                  | Shared language id + extension map                 |
| `apps/ui/app/lib/monaco.constants.ts`                         | Monaco id + extension map                          |
| `apps/ui/app/lib/shiki.lib.ts`                                | Register grammar with `createHighlighterCore`      |
| `apps/ui/app/lib/monaco.lib.ts`                               | Register contribution                              |
| `apps/ui/app/lib/contribution-activation-ids.test.ts`         | Regression guard on `activationLanguageIds`        |

## Anti-patterns

- Do not hand-edit thousands of lines of precompiled regex in TS — **regenerate** from `tmLanguage.json` when the grammar changes.
- Do not strip attribution: upstream grammar paths and licences belong in the precompiled file header.
- Avoid tuning token colours in application TS; fix the **grammar** so TextMate scopes stay stable for theme mapping.

## Reference implementation

- Package layout: `apps/ui/app/lib/sysml-language/` (SysML v2: daltskin TextMate + OMG `unrestricted-names`).
- Precompile script: `repos/shiki/precompiled/precompile-grammar.ts`.
