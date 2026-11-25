# @taucad/chat-surfaces

The composed chat surfaces of the Tau UI app: chat-sized Markdown with `@`-reference chips and file links, the chips themselves, the composer's context-chip node, and a chat's question record. Each one joins chat state (`@taucad/chat-ui`) with files (`@taucad/files-ui`) or the Markdown viewer (`@taucad/editor-ui`), so it lives above those features. Private and source-consumed (`scope:ui type:app-lib`, layer L2 of the UI app library layering): `apps/ui` imports it; it imports the foundation (`ui-core`, `ui-kit`) and the `chat-ui`, `files-ui` and `editor-ui` features, never `apps/ui`, another composition library or the agent-host adapters.

Cut from `editor-ui` and `files-ui` in layering W4, which took `editor-ui` off `chat-ui` and `files-ui`.

## Entrypoints

One subpath per module, pinned by `src/exports.test.ts`. Audience: the app's chat routes, its composer and its chat questions provider.

| Subpath                                         | Contents                                                                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `./components/chat/at-reference-chip`           | `AtReferenceChip`: `@path`, `@cad[…]` and invocation chips in chat messages                                                                 |
| `./components/chat/context-chip-node`           | `ContextChipNode`: the composer's Tiptap context-chip node; a file chip is a `FileLink` and is struck through once its path leaves the tree |
| `./components/markdown/chat-markdown-hyperlink` | Chat links to files (`ChatMarkdownHyperlink`, `rehypeChatFileLinks`): open a project file; import a desktop generated image first           |
| `./components/markdown/markdown-viewer-chat`    | The chat-sized Markdown renderer (`MarkdownViewerChat`): `@`-reference chips, chat file links and the streaming fade                        |
| `./components/markdown/rehype-at-references`    | `@`-reference chips from chat text (`rehypeAtReferences`)                                                                                   |
| `./hooks/use-chat-questions`                    | `useChatQuestions`: a chat's question record and its answers                                                                                |

`editor-ui` keeps the generic `MarkdownViewer`, `MarkdownHyperlink` and the streaming fade (`chat-streaming-block`, `chat-streaming-fade`) that `markdown-viewer-chat` composes.

## Seams

- `chat-markdown-hyperlink` reads the open project from `ProjectContext` (`@taucad/ui-core/contexts/project-context`) and the file manager from `FileManagerContext` (`@taucad/ui-core/contexts/file-manager-context`). The app's providers fill them. Its suite, and the link cases of `markdown-viewer-chat`'s, render inside both providers and mock `files-ui`'s desktop bridge and handle store.
- `context-chip-node` reads the tree service from `files-ui`'s `FileServicesProvider`.
- `use-chat-questions` reads, checks and writes the answers file through `FileManagerContext` (`readFile`, `exists`, `writeFile`) and throws outside a file-manager provider.

## Tests outside this library

- `apps/ui/app/components/markdown/chat-markdown-hyperlink.browser.test.tsx`: it runs in the app's Chromium lane (`workers/agent-host.vitest.browser.config.ts`); this library has no browser lane.

Part of the [Tau](https://github.com/taucad/tau) monorepo.
