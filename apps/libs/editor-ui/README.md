# @taucad/editor-ui

The editor feature of the Tau UI app: the read-only code and diff viewers, the editor pane placeholder and the CodeMirror extension builders (language features, go-to-definition, search panel, surface theme, JSON depth highlighting) that read no app state. Private and source-consumed (`scope:ui type:app-lib layer:feature`): `apps/ui` imports it; it imports only app-libs and packages, never `apps/ui`.

Cut from `apps/ui/app/components/code` in UI wave D (CI decomposition blueprint, Part 3 P2 row D, the `editor` row). It grows as the modules it waits on leave the app.

## Entrypoints

One subpath per module, pinned by `src/exports.test.ts`. Audience: `apps/ui` (the CodeMirror editor, chat tool and error rows, revision views and the workbench dock).

| Subpath                                     | Contents                                                                                                                      |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `./components/code/code-viewer`             | Read-only highlighted code (`CodeViewer`)                                                                                     |
| `./components/code/code-block`              | `CodeViewer` in a styled block                                                                                                |
| `./components/code/diff-viewer`             | Line diff with context folding (`DiffViewer`, `getDiffLineCount`, `getFirstChangedLine`)                                      |
| `./components/code/highlighted-line`        | One highlighted line                                                                                                          |
| `./components/code/use-highlighted-lines`   | Lezer highlighting for the viewers, with the size cap                                                                         |
| `./components/code/editor-pane-placeholder` | The pane shown before the editor mounts                                                                                       |
| `./components/code/editor-<name>`           | CodeMirror extensions: `completion-icon`, `definition`, `documentation`, `language-features`, `search-panel`, `surface-theme` |
| `./components/code/json-depth-highlighting` | JSON bracket-depth decoration                                                                                                 |

The CodeMirror extension modules are deferred leaves of `tau-lint/no-static-heavy-import`: the app reaches them only through the dynamic import of `code-editor-view.client`.

## Still in the app

- `code-editor.client`, `code-editor-view.client` and their four `*.client.test.tsx` suites, and `editor-lint`: they import `lib/editor-document`, `lib/editor-diagnostics` and `lib/editor-syntax`. Those qualify, but `editor-document` alone has about 40 app importers, so they move in the next slice together with `editor-languages`, `virtual-declarations` and `kcl-stdlib`.
- `code-surfaces.test.tsx`: it covers moved viewers together with `lib/editor-syntax` and `components/markdown/markdown-viewer`.
- `code-editor.browser.test.tsx` and its browser config: `use-theme`, `lib/editor-language-environment` and the app's Vite config.
- `lib/editor-language-environment`, `lib/editor-language-runtime`, `lib/editor-workspace-edits` and the `*-codemirror` language modules: the file-manager machine types; `typescript-codemirror` also reads `#environment.config`, `csharp-codemirror` the `tauCsharpLanguageAssets` define, and `kcl-lsp-worker` a `?url` import.
- `machines/editor.machine`, `hooks/use-editor-document-session` and `components/panes/editor-tab-context-menu`: the app runtime, the workbench records, `use-file-manager`, `use-project` and the revision client registry.

Part of the [Tau](https://github.com/taucad/tau) monorepo.
