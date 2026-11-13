# Project focus

`ProjectFocus.tla` checks which project has focus when the person navigates between projects faster than a leave flush, an access check or the project runtime import completes. It answers the formal plan's ProjectFocus question for the focus machine and its route-state selector, which lane A5a builds (`Focus = "target"`). It also models `ProjectRouteGate` as built at `c5f528dd` (`Focus = "today"`), so that the defects the inventory names, U1, U13 and U20, are counterexamples of the same properties.

## Parties

| Party           | In the model                                                                                                                                                                                                                             |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Router          | `route`, the newest committed request `{id, project, chat}`, or `Home`. `RouteCommitted` and the focus step that hears it are separate, so the selector sees a commit before focus does                                                  |
| Library         | An epoch that `LibraryChanged` moves and one access answer per project, `ready` or `held` (every held kind is one value). It answers for the epoch current when it answers; the epoch may move before focus acts on the answer           |
| Focus           | `f`: its request, `idle`, `resolving`, `leaving`, `opening`, `focused`, `held` or `flushFailed`, the answer it holds, the session it is on and the one it is leaving with that session's leave flush                                     |
| Module          | `mod`, the project runtime import, one for every project                                                                                                                                                                                 |
| Registry        | `sess`, `sreq`, `pendingOpen`: the live set, the budget, the single `pendingOpen` slot and the request it keeps, each session's close flush, and idle expiry. This is environment: the model claims no conformance of `sessions.machine` |
| Opening session | `fact`: once live it reports its chat session and its first file check, and one open bound may pass while either is pending                                                                                                              |
| Person          | Edits the project whose editor is shown, opens a project from the sidebar or a notice (through focus), closes a project and retries (through their owners)                                                                               |

The registry answers an open in the step that sends it, as the actor does, so `OpenAsked` is also `OpenSettled`. `Touch` and the registry's recency order are not modelled, so a policy close may take any candidate.

## States checked

Every config is in tier `pr` except `wide`, which is `nightly`. A passing config checks every safety property that applies to its `Focus`. A violating config checks the one property it violates.

| Config                            | Expect                            | Kind                              | What it holds                                                                                                                                                 |
| --------------------------------- | --------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `target`                          | pass                              |                                   | 3 projects and Home, 3 requests, 1 library change, budget 2, 1 failed leave flush, 1 retry                                                                    |
| `target-one-project`              | pass                              |                                   | Budget 1: the registry closes the session being left through its own close flush, and focus never closes                                                      |
| `target-idle-expiry`              | pass                              |                                   | The registry may expire any clean session focus is neither on nor moving to, at any step                                                                      |
| `target-person-commands`          | pass                              |                                   | Two person opens and two closes interleaved with route requests; a budget wait is resumed with its request                                                    |
| `target-same-project`             | pass                              |                                   | 2 projects, 2 chats, 4 requests: a chat switch and the focused-chat replace keep the editor                                                                   |
| `target-open-facts`               | pass                              |                                   | The chat fact and the first file check settle in either order, before or after the open bound                                                                 |
| `target-resume-window`            | `StaleResumeUnreached`            | witness                           | The registry resumes focus's pending open after a library change focus has not yet re-asked for                                                               |
| `liveness`                        | pass                              |                                   | `RequestEventuallySettles` under weak fairness, budget 1, no symmetry                                                                                         |
| `liveness-person-commands`        | pass                              |                                   | The same with one person close and one person open: an opening session closed before the join settles focus on `closed`                                       |
| `export`                          | pass                              |                                   | The labelled graph export (`ProjectFocus/graph.json`, `suite.json`)                                                                                           |
| `today-late-effect`               | pass                              |                                   | The flush registration lands after the editor's commit but before the next commit or effect run, so an edit before it is still flushed on the next navigation |
| `today-late-effect-reachable`     | `EditBeforeRegistrationUnreached` | witness                           | An edit before the registration lands is reached, so the passing config is not vacuous                                                                        |
| `today-superseded-open`           | pass                              |                                   | A request committed during the leave flush is fenced by the cancellation flag                                                                                 |
| `today-superseded-open-reachable` | `SupersededFlushUnreached`        | witness                           | The interleaving above is reached, so the passing config is not vacuous                                                                                       |
| `today-stale-return`              | `OpenOnlyOnCurrentAccess`         | defect (I4), fixed by A5b         | Returning to the resolved project after a library change opens it on the old epoch's answer                                                                   |
| `today-library-retry`             | `FailedFlushBlocks`               | defect (I3), fixed by A5a         | A library change re-runs the access effect and retries a failed leave flush with no `Retry`                                                                   |
| `today-module-race`               | `EditorOnlyWhenReady`             | defect, U1, fixed by A5b          | `editor` is derived while the import is loading                                                                                                               |
| `today-first-check`               | `FirstCheckBeforeEditor`          | defect, U13 and U20, fixed by A14 | `editor` is derived before the first file check settles                                                                                                       |
| `no-request-id`                   | `FocusFollowsLatestRequest`       | limit                             | Without the id fence an older answer focuses its project under a newer request                                                                                |
| `no-route-in-selector`            | `EditorOnlyForCommittedProject`   | limit                             | Derived from focus alone, the selector shows the previous request's state for a route focus has not taken                                                     |
| `match-by-request-id`             | `SameProjectKeepsEditor`          | limit                             | Matched by request id, a chat switch tears the editor down                                                                                                    |
| `wide`                            | pass                              |                                   | 4 projects and Home, 4 requests, 1 library change (the plan's 6 requests and 2 changes exceed the watchdog)                                                   |

`expected.json` records each config's bounds in its `ref`. Run the family with `pnpm nx run ui:formal:tla`, never TLC directly.

## Rules the focus machine keeps (A5a)

The target actions are the rules. A machine that keeps them inherits the properties above.

1. **Request and selector.** A request is `{id, project, chat}`. The selector reads the newest committed request, focus and the live set. It derives `resolving` whenever the committed request names another project than focus's request, including before focus hears its first request. The comparison is by project, never by id or chat (`no-route-in-selector`, `match-by-request-id`).
2. **The same project is not a move.** A request for the project focus is on or moving to keeps focus's state. When focused, focus sends at most one `ChatForwarded`, and no leave flush, access question or session-creating open.
3. **Another project starts a move.** The session focus was on becomes the one being left. A leave flush still running for it is kept, so one flush is in flight; a failed one is not reused.
4. **Access is fenced.** Focus asks access once per request id, and again when the library epoch moved since its answer. It takes only an answer for its current request id (`no-request-id`). It starts the import beside the question.
5. **Answers.** A held answer gives `held`. A ready answer gives `opening` once the move's leave is done, else `leaving`, or `flushFailed` when the leave flush failed.
6. **A failed leave flush blocks.** `flushFailed` sends no open until `Retry`, which restarts the leave flush, or a newer request for another project. A library change does not retry it (programme control's ruling). Today it does, through the access effect's dependency on the library revision (`today-library-retry`); that coupling is accidental, and A5a changes the behaviour on purpose.
7. **The registry may close what is being left.** If the session being left closes while focus waits, its close flush stands in for the leave flush.
8. **Open.** `OpenAsked` happens only in `opening`, from a ready answer for the current epoch, and carries a request for that project (`OpenCarriesRequest`). A failed start gives `held`.
9. **Withdraw a pending open that no longer stands.** When focus's open waits in `pendingOpen`, focus withdraws it (`cancelPendingOpen`) in the step it moves to another project, takes a held answer, or re-asks access after a library change, and sends it again only from the fresh answer. That re-ask also drops the request focus kept for each project the library now holds.
10. **Join four facts.** `opening` becomes `focused` only when access is ready for the current epoch, the import is loaded, the session is live in answer to focus's open (not waiting in `pendingOpen`), and its chat session and first file check are each settled or the open bound has passed. The move ends at the join.
11. **A session closed before the join.** If the session focus opened leaves the live set before the join (a person's close or a budget close), focus settles on the project as `focused`, which derives `closed` with the reopen offer. It neither reopens nor closes on its own.
12. **Focus never closes.** Only `PersonClosed`, `IdleExpired` and `BudgetSwitchClose` close a session (`FocusNeverCloses`). On a one-project device the registry's budget close takes the session being left, through that session's own close flush.
13. **A person's open goes through focus.** It carries the request focus kept for that project and does not move focus. A reopen of the focused project joins its facts again.

## Sharpened statements

- `OpenOnlyOnCurrentAccess` compares the open with the current request **by project**: an answer for an earlier request of the same project counts, because a chat switch is not a new open (D7). It also covers the registry's resume of a request focus sent: `SessionClosed` may spawn it only while focus still stands behind it (still opening that project from a ready answer, or keeping a ready request for it). It covers today's `Retry` run as well.
- The registry is environment and cannot see the library epoch. Between `LibraryChanged` and focus's re-ask it may still resume focus's pending open (`target-resume-window`). Focus then does not join that session until a fresh answer, and a held answer leaves it `held`. Closing that window needs the registry to check the request's epoch, which no lane here owns.
- `SameProjectKeepsEditor` starts its watch only on a commit for the project the editor shows while no library change still owes a re-check. A library change, a commit for another project or that session's close ends it. Otherwise a library change before a chat switch would count against the switch.
- `FocusFollowsLatestRequest` allows a newer committed request focus has not heard yet, which the plan states as "still being resolved".
- `EditorOnlyForCommittedProject` holds the selector to `resolving` before any request is heard, which covers the server render and the first client render.

## Abstracted away

- The unload sequencer (D26). Its order is one pass with nothing to interleave, so test rows in A0.2, A5b and A7c hold it.
- What a flush writes, why a region fails, and slug resolution: a request already names its project or `Home`.
- What a chat is. It is one opaque value in the request; the model checks only that changing it never moves focus.
- The length of the open bound and of the idle window. Both are steps that may happen.
- The held answer's kinds, `Touch`, the registry's recency order, and today's retained kernel (`project-route.tsx` 211 to 219).
- The registry's internals. Its steps (the single `pendingOpen` slot, the budget-1 close, idle expiry) are pinned by A0.2's rows against `sessions.machine` as it is.

## Drift

`project-focus.drift.test.ts` hashes `ProjectFocus.tla`, every config and `expected.json`, and today's route code: `project-route.tsx`, `project-route-state.ts` and `project-live-sessions.tsx`. `sessions.machine.ts` is left out because the registry is environment here. No focus machine exists yet, so the alphabet is the model's action names. A5a replaces it with the machine's alphabet and version. Regenerate with `node tools/formal/src/cli.ts update apps/ui` after changing the spec, never by hand.
