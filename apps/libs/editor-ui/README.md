# @taucad/editor-ui

The editor feature of the Tau UI app: the CodeMirror source editor (`CodeEditor` and its lazily loaded view), the document, diagnostics and syntax models it edits, the read-only code and diff viewers, the editor pane placeholder and the CodeMirror extension builders (language features, go-to-definition, lint, search panel, surface theme, JSON depth highlighting) that read no app state, the language services a code pane acquires on demand (TypeScript, KCL, C#, OpenSCAD, JSON and Python), the bundled authoring types the file-manager worker mounts for them, and the Markdown viewer with its links, code fences, sanitizer and chat streaming fade. Private and source-consumed (`scope:ui type:app-lib layer:feature`): `apps/ui` imports it; it imports only app-libs and packages, never `apps/ui`.

Cut from `apps/ui/app/components/code` and `apps/ui/app/lib` in five slices (tau #2378, tau #2438 with the source editor and its models, the document session and the navigation service, tau #2669 with the language services, then the Markdown viewer and the bundled types). It grows as the modules it waits on leave the app.

## Entrypoints

One subpath per module, pinned by `src/exports.test.ts`. Audience: `apps/ui` (the CodeMirror editor, chat tool and error rows, revision views and the workbench dock).

| Subpath                                                                                   | Contents                                                                                                                                                   |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `./components/code/code-viewer`                                                           | Read-only highlighted code (`CodeViewer`)                                                                                                                  |
| `./components/code/code-block`                                                            | `CodeViewer` in a styled block                                                                                                                             |
| `./components/code/diff-viewer`                                                           | Line diff with context folding (`DiffViewer`, `getDiffLineCount`, `getFirstChangedLine`)                                                                   |
| `./components/code/highlighted-line`                                                      | One highlighted line                                                                                                                                       |
| `./components/code/use-highlighted-lines`                                                 | Lezer highlighting for the viewers, with the size cap                                                                                                      |
| `./components/code/editor-pane-placeholder`                                               | The pane shown before the editor mounts                                                                                                                    |
| `./components/code/editor-<name>`                                                         | CodeMirror extensions: `completion-icon`, `definition`, `documentation`, `language-features`, `search-panel`, `surface-theme`                              |
| `./components/code/json-depth-highlighting`                                               | JSON bracket-depth decoration                                                                                                                              |
| `./components/code/code-editor.client`                                                    | The source editor (`CodeEditor`, `markCodeEditorMilestone`); loads `code-editor-view.client` on demand                                                     |
| `./components/code/code-editor-view.client`                                               | The CodeMirror view behind `CodeEditor`, with `code-editor.css`                                                                                            |
| `./components/code/editor-lint`                                                           | Diagnostics into CodeMirror lint state (`storeDiagnostics`)                                                                                                |
| `./lib/editor-document`                                                                   | The editable document model (`EditorDocument`, transactions and changes)                                                                                   |
| `./lib/editor-document-session`                                                           | Open documents over the file content service (`EditorDocumentSession`): load, save, conflicts and revisions                                                |
| `./lib/editor-navigation-service`                                                         | Go-to-location requests to the mounted editor view (`requestEditorNavigation`)                                                                             |
| `./lib/editor-diagnostics`                                                                | Per-file diagnostics store (`EditorDiagnostics`)                                                                                                           |
| `./lib/editor-syntax`                                                                     | Lazy Lezer syntax loading per language; `./lib/editor-syntax.fixtures` holds its sample sources                                                            |
| `./lib/editor-languages`                                                                  | Runtime-free file-to-language metadata                                                                                                                     |
| `./lib/virtual-declarations`                                                              | Read-only virtual declaration documents                                                                                                                    |
| `./lib/kcl-language/kcl-stdlib`, `./lib/kcl-language/kcl-bindings`                        | KCL standard-library index and binding analysis                                                                                                            |
| `./lib/editor-language-environment`                                                       | The project ports a language service receives (`EditorLanguageEnvironment`), typed structurally                                                            |
| `./lib/editor-language-runtime`                                                           | `acquireEditorLanguage`: one family's semantic service on demand, with the app's `EditorLanguageHost`                                                      |
| `./lib/editor-workspace-edits`, `./lib/lsp-workspace-edit`                                | Checked multi-file edits against the text a language service saw (`editor-workspace-fs`: URI paths)                                                        |
| `./lib/<language>-language/…`                                                             | Adapters for `typescript`, `kcl` (client, codec, navigation), `csharp`, `openscad`, `json` and `python`                                                    |
| `./components/markdown/markdown-viewer`                                                   | The Markdown renderer (`MarkdownViewer`, `defaultMarkdownControls`): Streamdown with math, CJK, sanitizing and Tau's links and code                        |
| `./components/markdown/markdown-<name>`                                                   | Its parts: `hyperlink` (in-app and external links), `code` (inline code and collapsible fences), `sanitize` (`publicationRehypeSanitize`), `header-anchor` |
| `./components/markdown/rehype-at-references`                                              | `@`-reference chips from chat text (`rehypeAtReferences`)                                                                                                  |
| `./components/markdown/chat-streaming-block`, `./components/markdown/chat-streaming-fade` | The fade on newly streamed chat prose                                                                                                                      |
| `./components/ui/collapsible-code-block`                                                  | A code block that collapses past a line count, with copy                                                                                                   |
| `./components/external-link`                                                              | A link that opens in a new tab, with its arrow                                                                                                             |
| `./lib/bundled-types-mount`, `./lib/bundled-types-sentinel`, `./lib/bundled-types-lazy`   | The bundled authoring declarations under `/node_modules`: write, check by sentinel, install on first read                                                  |

The CodeMirror extension modules, `code-editor-view.client`, `editor-lint` and the `lib/<language>-language/` adapters are deferred leaves of `tau-lint/no-static-heavy-import`: the app reaches them only through dynamic imports, and `editor-language-runtime` imports each family only when a code pane asks for it.

The app supplies `EditorLanguageHost` from `apps/ui/app/lib/editor-language-runtime.ts`: the TypeScript acquisition mode, the staged C# and OpenSCAD server assets, and the KCL worker, which stays in the app because it loads `kcl.wasm` by a `?url` import. It imports the KCL codec and types through this library's subpaths.

## Still in the app

- `components/code/code-surfaces.test.tsx`: the check that no app source pins a `CodeEditor` to a literal language. It reads `apps/ui/app`; the surface matrix is here.
- `components/markdown/markdown-viewer-chat` and `chat-markdown-hyperlink`: `use-project`, `use-file-manager` and `at-reference-chip`. `chat-streaming-fade.test.tsx` stays with them, since it renders `MarkdownViewerChat`.
- `code-editor.browser.test.tsx` and its browser config: `use-theme` and the app's Vite config.
- `lib/editor-language-runtime` (the host binding over this library's runtime) and `lib/kcl-language/lsp/kcl-lsp-worker`: build defines, `#environment.config` and the `kcl.wasm?url` import.
- `machines/editor.machine`, `hooks/use-editor-document-session` and `components/panes/editor-tab-context-menu`: the app runtime, the workbench records, `use-file-manager`, `use-project` and the revision client registry.

Part of the [Tau](https://github.com/taucad/tau) monorepo.
