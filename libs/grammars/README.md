# @taucad/grammars

Lezer grammars and the one syntax highlighting registry for every Tau code surface: the editor, its hover,
signature and completion tooltips, chat code blocks, the code and diff viewers, and the API guide renderer.

## Use

- `loadLanguage(id)` loads a language's parser once, on first use; `peekLanguage(id)` returns it synchronously
  after that. `resolveHighlightLanguageId(input)` and `resolveHighlightLanguageIdForPath(path)` map fence tags,
  aliases and file names to an id.
- `tauHighlighter` emits `tok-*` classes. The app colours them once, in `apps/ui/app/styles/syntax-highlight.css`.
- `highlightLines(text, support)` highlights static text into lines of `{ text, className }` segments.

Parsers are generated ahead of time; nothing compiles a regex grammar at runtime.

## Languages

| Language                                             | Source                                                                                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| KCL                                                  | Adapted from Zoo's MIT-licensed [`codemirror-lang-kcl`](https://github.com/KittyCAD/modeling-app/tree/main/packages/codemirror-lang-kcl) grammar. |
| OpenSCAD, STEP, STL, SysML, USD, C#, Bash, JSONC     | Written by Tau in `src/<language>/<language>.grammar`.                                                                                            |
| JavaScript, TypeScript, JSON, Python, YAML, Markdown | The `@codemirror/lang-*` packages.                                                                                                                |

## Change a grammar

1. Edit `src/<language>/<language>.grammar` and, for highlighting, the `styleTags` in `src/<language>/<language>-syntax.ts`.
2. Run `pnpm --filter @taucad/grammars generate` to regenerate the committed parser tables. Conflicts and
   warnings fail the build.
3. Extend the language's sample in `src/fixtures.ts` and run the tests: every fixture must parse without
   error nodes, highlight its expected tokens, reparse incrementally to the same result, and survive
   unterminated strings and comments. A test fails if a committed parser differs from its grammar.
