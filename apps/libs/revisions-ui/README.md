# @taucad/revisions-ui

The revisions feature of the Tau UI app: the History branch graph's layout and renderer, the timeline row styles, the Revisions pane region, the naming popover, the History entry title rule and the revision compute worker, none of which read app state. Private and source-consumed (`scope:ui type:app-lib layer:feature`): `apps/ui` imports it; it imports only app-libs and packages, never `apps/ui`.

Cut from `apps/ui/app/{components/revisions,lib,machines}` in UI wave D (CI decomposition blueprint, Part 3 P2 row D, the `revisions-ui` row). It grows as the modules it waits on leave the app.

## Entrypoints

One subpath per module, pinned by `src/exports.test.ts`. Audience: `apps/ui` (the History pane, revision markers and branches, print machine profiles and the file-manager worker).

| Subpath                                        | Contents                                                                                                    |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `./components/revisions/revision-graph-layout` | Pure branch-graph topology and geometry (`layoutRevisionGraph`, `graphGeometry`, `gutterWidth`)             |
| `./components/revisions/revision-graph-view`   | The SVG graph (`HistoryGraph`), branch tones and swatches, `useRowBoxes`, `HistoryLanesContext`             |
| `./components/revisions/revision-timeline`     | Class names for the History timeline's rows, gutters and markers                                            |
| `./components/revisions/revision-region`       | One region of the Revisions pane (`RevisionRegion`)                                                         |
| `./components/revisions/name-popover`          | The naming form every revision surface shares (`NamePopover`)                                               |
| `./lib/revision-entry-title`                   | The title a person reads for a History entry (`entryTitleOf`)                                               |
| `./machines/revision-compute`                  | The revision stores' supervised compute worker, inline where workers cannot start (`createRevisionCompute`) |

`machines/revision-compute.ts` starts `revision-compute.worker.ts` by URL; the worker entry has no subpath.

## Still in the app

- `hooks/use-revision-status` and `hooks/use-revisions`: `#environment.config`, `use-file-manager`, `use-project`, `use-cloud-projects`, `lib/agent-host-placement` and the chat session store.
- `lib/revision-actor`, `lib/revision-pushes`, `routes/…/revision-ref-removal`: `#environment.config` (and `flags/use-feature`).
- `lib/revision-failure-reporting`: the app's error reporting.
- `machines/file-manager.worker.revisions`, `workers/agent-host-revisions`, `types/revision-client.types`, `services/revision-client-registry` and `runtime/session-revisions`: `window.ENV`, `lib/build-target`, `db/indexeddb-storage` and the file-manager machine.
- `components/revision-actor-identity`: `lib/auth-client` and `lib/revision-actor`.
- `machines/revisions-opfs.browser.test.ts` and its fixture worker: a Playwright browser suite under the app's browser config.
- The `routes/w.$workspace.$project` revision modules: route composition over `use-project` and `use-revision-status`. `revision-pane-requests` qualifies but is route wiring; `revision-conflict-editor` waits on the editor slice (`code-editor.client`, `lib/editor-document`).

Part of the [Tau](https://github.com/taucad/tau) monorepo.
