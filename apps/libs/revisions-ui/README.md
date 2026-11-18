# @taucad/revisions-ui

The revisions feature of the Tau UI app: the History branch graph's layout and renderer, the timeline row styles, the Revisions pane region, the naming popover, the History entry title rule, the revision compute worker, the page's revision clients over the worker port protocol, who made each entry, and the history hooks every revision surface reads. None of them read app state: what only the app can reach is injected. Private and source-consumed (`scope:ui type:app-lib layer:feature`): `apps/ui` imports it; it imports only app-libs and packages, never `apps/ui`.

Cut from `apps/ui/app/{components/revisions,lib,machines}` so the revisions feature builds and tests apart from the app. It grows as the modules it waits on leave the app.

## Entrypoints

One subpath per module, pinned by `src/exports.test.ts`. Audience: `apps/ui` (the History pane, revision markers and branches, print machine profiles and the file-manager worker).

| Subpath                                        | Contents                                                                                                                                                             |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `./components/revisions/revision-graph-layout` | Pure branch-graph topology and geometry (`layoutRevisionGraph`, `graphGeometry`, `gutterWidth`)                                                                      |
| `./components/revisions/revision-graph-view`   | The SVG graph (`HistoryGraph`), branch tones and swatches, `useRowBoxes`, `HistoryLanesContext`                                                                      |
| `./components/revisions/revision-timeline`     | Class names for the History timeline's rows, gutters and markers                                                                                                     |
| `./components/revisions/revision-region`       | One region of the Revisions pane (`RevisionRegion`)                                                                                                                  |
| `./components/revisions/name-popover`          | The naming form every revision surface shares (`NamePopover`)                                                                                                        |
| `./lib/revision-entry-title`                   | The title a person reads for a History entry (`entryTitleOf`)                                                                                                        |
| `./lib/revision-failure-reporting`             | Which refusals are warnings, and `createRevisionToastReporter(reportUiError)` for every client's error toasts                                                        |
| `./lib/revision-who`                           | Who made an entry (`revisionWho`), the resolver's view of a joined push store (`revisionPushRecordOf`), `RevisionWhoContext`, `RevisionPushRecord`, `RevisionPusher` |
| `./hooks/use-revision-status`                  | `createRevisionClients(services)`: the worker port and desktop host clients, GitHub credential leases and the command surface; `useRevisionClientStatus`             |
| `./hooks/use-revisions`                        | `createRevisionHistoryHooks(services)`: every revision surface's history, lanes graph, cards, turn lookup and comparisons; `RevisionCard`, `revisionPageSize`        |
| `./services/revision-client-registry`          | The one client per project (`revisionClients`, `peekRevisionClient`, `subscribeRevisionClients`)                                                                     |
| `./types/revision-client.types`                | `RevisionClient`, `RevisionCredentialSource`, `RevisionSessionUser`                                                                                                  |
| `./types/revision-push.types`                  | What one account reads of a project's push records: `PushRecordSnapshot`, `PushEntry`, `PushPusher`                                                                  |
| `./types/revision-worker-protocol`             | The port's frames: `WorkerRevisionCommand`, `-Request`, `-Response`, `-Result`, `-Event`, `RevisionToast`, `BranchCreated`                                           |
| `./machines/revision-compute`                  | The revision stores' supervised compute worker, inline where workers cannot start (`createRevisionCompute`)                                                          |

`machines/revision-compute.ts` starts `revision-compute.worker.ts` by URL; the worker entry has no subpath.

The app makes one `createRevisionClients` over `RevisionStatusServices` in `apps/ui/app/hooks/use-revision-status.ts`: the API origin (`window.ENV`), the GitHub connections API, the desktop agent host channel, error reporting, the page's telemetry consent and the build target. Each is read when it is used.

The app makes one `createRevisionHistoryHooks` over `RevisionHistoryServices` in `apps/ui/app/hooks/use-revisions.ts`: the open project, the revision client and projection, the chat session store (a structural `RevisionSettlementStore`), who made each entry (`RevisionAuthorship`, bound to this library's `revisionWho` over `lib/revision-actor`'s `useRevisionWhoContext`) and Tau Cloud's push records (`RevisionPushRecords`, bound to `lib/revision-pushes`). Each is read when it is used.

## Still in the app

- `hooks/use-revision-status`: the binding of the app's services and the React hooks over it (`useRevisionClient`, `useRevisionStatus`, `useRevisionCommands`, `useProjectRole`), which read `use-project`, `use-file-manager` and `use-cloud-projects`. App suites mock this module, so its path stays.
- `hooks/use-revision-status.test-harness`: the factory for mocks of that app module, typed by `use-cloud-projects`' role.
- `hooks/use-revisions`: the binding of the app's services and the hooks it exports, at the same path because route suites import and mock it. The binding reads `use-project`, `use-revision-status`, the chat session store, `lib/revision-actor` and `lib/revision-pushes`.
- `lib/revision-actor`: the account salt fetch (`#environment.config`, `lib/api-request-id`), the anonymity preference and session-user stores, `revisionUserActor`, and `useRevisionWhoContext`, which reads `flags/use-feature` (`tauDebug`) and the push store. Its pure who-resolver is `./lib/revision-who`.
- `lib/revision-pushes`: the push route's fetch and parse, the graph join and the per-account store (`#environment.config`, `lib/api-request-id`). The snapshot it hands out is typed by `./types/revision-push.types`.
- `routes/…/revision-ref-removal`: `#environment.config`.
- `machines/file-manager.worker.revisions`, `workers/agent-host-revisions` and `runtime/session-revisions`: `window.ENV`, `lib/build-target`, `db/indexeddb-storage` and the file-manager machine.
- `components/revision-actor-identity`: `lib/auth-client` and `lib/revision-actor`.
- `machines/revisions-opfs.browser.test.ts` and its fixture worker: a Playwright browser suite under the app's browser config.
- The `routes/w.$workspace.$project` revision modules: route composition over `use-project` and `use-revision-status`. `revision-pane-requests` qualifies but is route wiring; `revision-conflict-editor` waits on the editor slice (`code-editor.client`, `lib/editor-document`).

Part of the [Tau](https://github.com/taucad/tau) monorepo.
