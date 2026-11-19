# @taucad/revisions-ui

The revisions feature of the Tau UI app: the History branch graph's layout and renderer, the timeline row styles, the Revisions pane region, the naming popover, the conflict editor, the History entry title rule, the revision compute worker, the page's revision clients over the worker port protocol, who made each entry and the push records it reads, the audited removal of a conflict line, the History pane's page-wide requests, and the history hooks every revision surface reads. None of them read app state: what only the app can reach is injected. Private and source-consumed (`scope:ui type:app-lib layer:feature`): `apps/ui` imports it; it imports only app-libs and packages, never `apps/ui`.

Cut from `apps/ui/app/{components/revisions,lib,machines,routes}` so the revisions feature builds and tests apart from the app. It grows as the modules it waits on leave the app.

## Entrypoints

One subpath per module, pinned by `src/exports.test.ts`. Audience: `apps/ui` (the History pane, revision markers and branches, print machine profiles and the file-manager worker).

| Subpath                                           | Contents                                                                                                                                                                                                   |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `./components/revisions/revision-graph-layout`    | Pure branch-graph topology and geometry (`layoutRevisionGraph`, `graphGeometry`, `gutterWidth`)                                                                                                            |
| `./components/revisions/revision-graph-view`      | The SVG graph (`HistoryGraph`), branch tones and swatches, `useRowBoxes`, `HistoryLanesContext`                                                                                                            |
| `./components/revisions/revision-timeline`        | Class names for the History timeline's rows, gutters and markers                                                                                                                                           |
| `./components/revisions/revision-region`          | One region of the Revisions pane (`RevisionRegion`)                                                                                                                                                        |
| `./components/revisions/name-popover`             | The naming form every revision surface shares (`NamePopover`)                                                                                                                                              |
| `./components/revisions/revision-conflict-editor` | Another device's conflict, resolved hunk by hunk in the code editor (`RevisionConflictEditor`)                                                                                                             |
| `./lib/chat-turn-revision-state`                  | A chat turn's revision summary from its log facts (`deriveTurnRevisionState`, `turnRevisionLabel`, `turnRevisionDetail`); `TurnRevisionLog`, the facts the app's chat projection selects                   |
| `./lib/history-lanes`                             | The History pane's lanes: listed branches, conflict lines and pending merges for a filter (`historyLanesOf`, `listedBranchesOf`, `conflictLinesOf`)                                                        |
| `./lib/history-lanes.test-harness`                | Lanes graph scenarios for History suites (`lanesScenarios`, `oneBranchRows`, `conflictLine`, `lidConflict`)                                                                                                |
| `./lib/revision-entry-title`                      | The title a person reads for a History entry (`entryTitleOf`)                                                                                                                                              |
| `./lib/revision-failure-reporting`                | Which refusals are warnings, and `createRevisionToastReporter(reportUiError)` for every client's error toasts                                                                                              |
| `./lib/revision-who`                              | Who made an entry (`revisionWho`), the resolver's view of a joined push store (`revisionPushRecordOf`), `RevisionWhoContext`, `RevisionPushRecord`, `RevisionPusher`                                       |
| `./lib/revision-push-records`                     | The push route's answer read (`parsePushPage`, `PushPage`, `PushMember`) and joined to the held graph (`joinPushes`)                                                                                       |
| `./lib/revision-pushes`                           | `createRevisionPushStore(services)`: the push route's fetch and the per-account records joined to the held graph (`RevisionPushStore`)                                                                     |
| `./lib/revision-ref-removal`                      | `createRevisionRefRemoval(services)`: the Hosted Remote's audited removal of a conflict line (`requestRefRemoval`, `ConflictLineRef`, `RemovalAnswer`)                                                     |
| `./lib/revision-pane-requests`                    | Whether a History pane is on screen, and the branch control the palette asked its header to open (`useReportHistoryPaneShown`, `useIsHistoryPaneShown`, `requestBranchControl`, `useBranchControlRequest`) |
| `./lib/revision-actor`                            | The anonymity preference and session-user stores, the salts this host keeps, `revisionUserActor`, and `createRevisionActorHooks(services)`: the account salt request and `useRevisionWhoContext`           |
| `./hooks/use-revision-status`                     | `createRevisionClients(services)`: the worker port and desktop host clients, GitHub credential leases and the command surface; `useRevisionClientStatus`                                                   |
| `./hooks/use-revisions`                           | `createRevisionHistoryHooks(services)`: every revision surface's history, lanes graph, cards, turn lookup and comparisons; `RevisionCard`, `revisionPageSize`                                              |
| `./services/revision-client-registry`             | The one client per project (`revisionClients`, `peekRevisionClient`, `subscribeRevisionClients`)                                                                                                           |
| `./types/revision-client.types`                   | `RevisionClient`, `RevisionCredentialSource`, `RevisionSessionUser`                                                                                                                                        |
| `./types/revision-push.types`                     | What one account reads of a project's push records: `PushRecordSnapshot`, `PushEntry`, `PushPusher`                                                                                                        |
| `./types/revision-worker-protocol`                | The port's frames: `WorkerRevisionCommand`, `-Request`, `-Response`, `-Result`, `-Event`, `RevisionToast`, `BranchCreated`                                                                                 |
| `./machines/revision-compute`                     | The revision stores' supervised compute worker, inline where workers cannot start (`createRevisionCompute`)                                                                                                |

`machines/revision-compute.ts` starts `revision-compute.worker.ts` by URL; the worker entry has no subpath.

The app makes one `createRevisionClients` over `RevisionStatusServices` in `apps/ui/app/hooks/use-revision-status.ts`: the API origin (`window.ENV`), the GitHub connections API, the desktop agent host channel, error reporting, the page's telemetry consent and the build target. Each is read when it is used.

The app makes one `createRevisionHistoryHooks` over `RevisionHistoryServices` in `apps/ui/app/hooks/use-revisions.ts`: the open project, the revision client and projection, the chat session store (a structural `RevisionSettlementStore`), who made each entry (`RevisionAuthorship`, bound to this library's `revisionWho` over `lib/revision-actor`'s `useRevisionWhoContext`) and Tau Cloud's push records (`RevisionPushRecords`, bound to `lib/revision-pushes`). Each is read when it is used.

The app makes one `createRevisionPushStore` over `RevisionPushStoreServices` in `apps/ui/app/lib/revision-pushes.ts` (the API origin from `window.ENV`), and one `createRevisionActorHooks` over `RevisionActorServices` in `apps/ui/app/lib/revision-actor.ts`: the API origin, the `tauDebug` flag reader and that push store. Each is read when it is used. App modules import the stores and `revisionUserActor` from `./lib/revision-actor` itself.

The app makes one `createRevisionRefRemoval` over `RevisionRefRemovalServices` in `apps/ui/app/routes/w.$workspace.$project/revision-ref-removal.ts` (the API origin from the client environment, read on every request).

## Still in the app

- `hooks/use-revision-status`: the binding of the app's services and the React hooks over it (`useRevisionClient`, `useRevisionStatus`, `useRevisionCommands`, `useProjectRole`), which read `use-project`, `use-file-manager` and `use-cloud-projects`. App suites mock this module, so its path stays.
- `hooks/use-revision-status.test-harness`: the factory for mocks of that app module, typed by `use-cloud-projects`' role.
- `hooks/use-revisions`: the binding of the app's services and the hooks it exports, at the same path because route suites import and mock it. The binding reads `use-project`, `use-revision-status`, the chat session store, `lib/revision-actor` and `lib/revision-pushes`.
- `lib/revision-pushes`: the binding of the push store to the API origin (`#environment.config`). `hooks/use-revisions` and the actor binding read it, and `use-revisions`' suite resets it.
- `lib/revision-actor`: the binding of `requestRevisionSalt` and `useRevisionWhoContext` to the API origin (`#environment.config`), the `tauDebug` flag (`flags/use-feature`) and that push store. `runtime/session-revisions`, `hooks/use-revisions` and the chat revision tool read it.
- `routes/…/revision-ref-removal`: the binding of the ref removal to the API origin (`#environment.config`), at the same path because the branches suite mocks it.
- `machines/file-manager.worker.revisions`: `lib/build-target`, `db/indexeddb-storage` and `observability/report-to-api`.
- `runtime/session-revisions`: the app's `use-revision-status`, `use-cloud-projects` and `use-project-availability`, `lib/revision-actor`, `lib/tau-cloud-intent`, the file-manager and chat-session machines and the chat session store.
- `workers/agent-host-revisions`: the `history` tool's client in the agent-host worker, composed only by `workers/agent-host.impl`. It imports only packages and this library, but it is the agent host's, and moving it would make this library depend on `@taucad/chat` for one worker-side client.
- `machines/revision-load-telemetry`: `observability/report-to-api`.
- `components/revision-actor-identity`: `lib/auth-client`.
- `machines/revisions-opfs.browser.test.ts` and its fixture worker: a Playwright browser suite under the app's browser config.
- `routes/…/revision-vocabulary`: the History words and icons over the app's `use-revisions`, `use-revision-status`, `use-cloud-projects` and `use-sidebar-status`.
- The other `routes/w.$workspace.$project` revision modules: route composition over `use-project`, `use-revision-status`, `use-revisions`, the workspace context, chats, analytics, GitHub connections and the client environment.

Part of the [Tau](https://github.com/taucad/tau) monorepo.
