# @taucad/project-workspace

The project workspace (`/w/:workspace/:project`) of the Tau UI app, cut from `apps/ui/app/routes/w.$workspace.$project` and the project-open modules. Private and source-consumed (`scope:ui type:app-lib layer:feature`): `apps/ui` imports it; it imports only app-libs and packages, never `apps/ui`.

The route modules stay in `apps/ui` because React Router's file routing and `typegen` bind them there. This library holds the route-private code that reads no app state, and grows as the modules it waits on leave the app.

## Entrypoints

One subpath per module, pinned by `src/exports.test.ts`. Audience: the `w.$workspace.$project` route tree and the project manager in `apps/ui`.

| Subpath                  | Contents                                                                                                                                                                                |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `./components/<name>`    | `archived-chats-view`, `chat-editor-binary-warning`, `chat-editor-error-placeholder`, `chat-editor-too-large-warning`, `chat-history-empty`, `chat-pane-skeleton`, `scroll-down-button` |
| `./hooks/use-row-window` | Windowed row rendering for long lists                                                                                                                                                   |
| `./utils/<name>`         | File tree targets, drop ingestion and operation results; native image sniffing; kernel trace types; tool file metadata; revision reveal; project-open timer; manifest equivalence       |
