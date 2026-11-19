# @taucad/chat-ui

Chat building blocks for the Tau UI app: chat and tool-call presentation, the Tiptap composer pieces, the browser and daemon agent-host transports, the agent-host event projection, the per-device composer, attachment, placement and message-queue stores, and the headless chat machines and helpers that sit on them (draft, composer record, chat persistence, message queue and chat mode machines, the chat SDK loader and composer trays). Private and source-consumed (`scope:ui type:app-lib layer:feature`): `apps/ui` imports it; it imports `@taucad/ui-kit`, `@taucad/ui-core`, published packages and shared libs, never `apps/ui`.

Cut from `apps/ui/app`. The modules here are the part of the chat domain that reads no app state.

## Entrypoints

One subpath per module, pinned by `src/exports.test.ts`. Audience: `apps/ui` routes, components and hooks, and the UI feature libraries cut from it (`project-workspace`, …).

| Subpath                         | Contents                                                                                                                                                                                |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `./components/<name>`           | Chat tool cards, labels and text, activity groups, context chips, message surface, queue view, typed-question field, composer skeleton and styling, paste handling                      |
| `./components/tiptap/<name>`    | Composer editor, context and slash-command suggestions, drop handling, submit-on-enter, fuzzy matching                                                                                  |
| `./chat-clients/<name>`         | `turn-intent`; `_internal/*` browser-placement transport and snapshot context (app chat clients only)                                                                                   |
| `./services/<name>`             | `agent-host-event-projection`, `agent-host-transport`, `daemon-agent-host-client`, `rpc-ledger`; `chat-sdk-loader` and the `chat-sdk` it loads by dynamic import; `chat-composer-trays` |
| `./db/<name>`                   | `attachment-store`, `composer-record-store`, `chat-message-queue-store`, `chat-placements`                                                                                              |
| `./utils/<name>`                | Chat errors and error cards, attachments and attachment refusals, at-references, chat execution and new-chat execution, recency, model groups, activity cues, tool-output summaries     |
| `./hooks/<name>`                | Name-generator agent configs; the `draft` and `chat-persistence` machines; `composer-record` (actor and hook); the composer-record and draft-image error toasts                         |
| `./machines/<name>`             | `chat-message-queue`, `composer-record` and `chat-mode` machines                                                                                                                        |
| `./types/chat-sidebar.types`    | Sidebar activity types                                                                                                                                                                  |
| `./utils/attachment.test-utils` | Test-only attachment fixtures for app suites                                                                                                                                            |

## Formal model

`specs/lean` holds the Lean model of `utils/new-chat-execution` (`pnpm nx run chat-ui:formal:lean`); `src/utils/new-chat-execution.differential.test.ts` compares the TypeScript with its goldens.

## Still in the app

The chat runtime binds app state and stays in `apps/ui/app` until it can take ports: `services/chat-session-store*`, `services/agent-host-client`, `hooks/use-chat*`, `active-chat-provider`, `chat-session-store-provider`, `use-models`, the `chat-clients` turn host, the chat session and projection machines, and the composer components that read those hooks.

Part of the [Tau](https://github.com/taucad/tau) monorepo.
