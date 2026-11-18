# @taucad/revisions-ui

The revisions feature of the Tau UI app: the History branch graph's layout and renderer, the timeline row styles, the Revisions pane region, the naming popover, the History entry title rule, the revision compute worker, and the page's revision clients over the worker port protocol. None of them read app state: what only the app can reach is injected. Private and source-consumed (`scope:ui type:app-lib layer:feature`): `apps/ui` imports it; it imports only app-libs and packages, never `apps/ui`.

Cut from `apps/ui/app/{components/revisions,lib,machines}` in UI wave D (CI decomposition blueprint, Part 3 P2 row D, the `revisions-ui` row). It grows as the modules it waits on leave the app.

## Entrypoints

One subpath per module, pinned by `src/exports.test.ts`. Audience: `apps/ui` (the History pane, revision markers and branches, print machine profiles and the file-manager worker).

| Subpath                                        | Contents                                                                                                                                                 |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `./components/revisions/revision-graph-layout` | Pure branch-graph topology and geometry (`layoutRevisionGraph`, `graphGeometry`, `gutterWidth`)                                                          |
| `./components/revisions/revision-graph-view`   | The SVG graph (`HistoryGraph`), branch tones and swatches, `useRowBoxes`, `HistoryLanesContext`                                                          |
| `./components/revisions/revision-timeline`     | Class names for the History timeline's rows, gutters and markers                                                                                         |
| `./components/revisions/revision-region`       | One region of the Revisions pane (`RevisionRegion`)                                                                                                      |
| `./components/revisions/name-popover`          | The naming form every revision surface shares (`NamePopover`)                                                                                            |
| `./lib/revision-entry-title`                   | The title a person reads for a History entry (`entryTitleOf`)                                                                                            |
| `./lib/revision-failure-reporting`             | Which refusals are warnings, and `createRevisionToastReporter(reportUiError)` for every client's error toasts                                            |
| `./hooks/use-revision-status`                  | `createRevisionClients(services)`: the worker port and desktop host clients, GitHub credential leases and the command surface; `useRevisionClientStatus` |
| `./services/revision-client-registry`          | The one client per project (`revisionClients`, `peekRevisionClient`, `subscribeRevisionClients`)                                                         |
| `./types/revision-client.types`                | `RevisionClient`, `RevisionCredentialSource`, `RevisionSessionUser`                                                                                      |
| `./types/revision-worker-protocol`             | The port's frames: `WorkerRevisionCommand`, `-Request`, `-Response`, `-Result`, `-Event`, `RevisionToast`, `BranchCreated`                               |
| `./machines/revision-compute`                  | The revision stores' supervised compute worker, inline where workers cannot start (`createRevisionCompute`)                                              |

`machines/revision-compute.ts` starts `revision-compute.worker.ts` by URL; the worker entry has no subpath.

The app makes one `createRevisionClients` over `RevisionStatusServices` in `apps/ui/app/hooks/use-revision-status.ts`: the API origin (`window.ENV`), the GitHub connections API, the desktop agent host channel, error reporting, the page's telemetry consent and the build target. Each is read when it is used.

## Still in the app

- `hooks/use-revision-status`: the binding of the app's services and the React hooks over it (`useRevisionClient`, `useRevisionStatus`, `useRevisionCommands`, `useProjectRole`), which read `use-project`, `use-file-manager` and `use-cloud-projects`. App suites mock this module, so its path stays.
- `hooks/use-revision-status.test-harness`: the factory for mocks of that app module, typed by `use-cloud-projects`' role.
- `hooks/use-revisions`: each hook reads `use-project`, the chat session store, and `lib/revision-actor` and `lib/revision-pushes`.
- `lib/revision-actor`, `lib/revision-pushes`, `routes/…/revision-ref-removal`: `#environment.config` (and `flags/use-feature`).
- `machines/file-manager.worker.revisions`, `workers/agent-host-revisions` and `runtime/session-revisions`: `window.ENV`, `lib/build-target`, `db/indexeddb-storage` and the file-manager machine.
- `components/revision-actor-identity`: `lib/auth-client` and `lib/revision-actor`.
- `machines/revisions-opfs.browser.test.ts` and its fixture worker: a Playwright browser suite under the app's browser config.
- The `routes/w.$workspace.$project` revision modules: route composition over `use-project` and `use-revision-status`. `revision-pane-requests` qualifies but is route wiring; `revision-conflict-editor` waits on the editor slice (`code-editor.client`, `lib/editor-document`).

Part of the [Tau](https://github.com/taucad/tau) monorepo.
