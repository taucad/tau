Moved from the notes above `EXTENDS` in `ProjectFocus.tla` by `formal review-notes`.

```text
A3b: `ProjectRouteAccess` moved from `use-project-manager.tsx` to `runtime/project-library.ts`; the
route gate imports the type from there. No action or correspondence changes.
A4b: `tauCloudIntent` and its type moved from `hooks/use-cloud-projects.ts` to
`lib/tau-cloud-intent.ts`; the route gate and the live sessions import them from there. No action or
correspondence changes.
A5b: the route gate's effects are gone. The route reports to focus (`project-route-intent.tsx`) and
the runtime composes focus with the registry, the library epoch and the module import over ordered ports
(`runtime/app-runtime-focus.ts`): registry facts reach focus after the open's answer they follow, every
epoch reaches the registry before an open that names it, and a resume the registry drops as stale is
answered `dropped`. Those ports are the environment this spec assumes, so they join the drift sources.
The route sink applies a `chatShown` only once the router is at rest on the commit focus answered (I2):
the model's route steps are atomic, and the sink's deferral is what keeps the app's ones so.
A held `chatShown` is dropped when the person's move changed the route's chat: focus answers that commit
(I18). The sink's own replace, judged where it lands and used once, is not such a move, so the last chat
shown still wins. Where that replace lands, even while another move loads, a held command is judged against it.
The person's Not now on the budget dialog empties `pendingOpen` and is not modelled (a person step, like
`PersonClosed`, outside the registry's own replies). The port answers focus's waiting open `declined`,
and focus settles on the project as it does for `TOpenOnFailed`, deriving `closed` with the reopen offer,
as main does. No action or verdict changes.
Focus = "today" stays the record of the code as built at c5f528dd; no action or correspondence changes.
A6d: the session's `project` child builds the project runtime, so the session reports `chatReady` once
the editor has left ensuring its focused chat (M2) rather than at once, which is the `ChatReady` step
after `live` the model already has. The editor's focused chat reaches focus through the registry
(`chatFocused`, the port's `focusedChatResolved`), not through a prop the route handed the subtree, and
the route no longer passes the subtree a chat or a native kernel id. No action or verdict changes.
A7b: the session's own children report its visibility (from `environment` and focus), its revision facts
and its parking, start its revision client and read connector, and follow the selected checkout, with
nothing mounted; the route's binding relays none of them. `selectFocusTarget` moved beside the route
state it reads (`focus.route-state.ts`), so the app runtime reads the focused project with it too. The
sessions' facts were already the registry's in the model (environment here). No action or verdict changes.
A7c: focus's leave flush asks the session (`flushAsked`), whose `project` child flushes the runtime's producers
and editor store, and the port answers with the session's `flushSettled` under the same request id (I18), after
the session's step, so the facts an open it leads to produces still come before that open's answer. A project
with no live session answers ok, and one that leaves the live set before it answers ran its own close flush in
place of the leave flush (`TLeft`). The route's binding registers no leave flush. No action or verdict changes.
A11: the app shell renders at one tree position beside the keyed live sessions, never inside the focused
one, and the focused project's providers are re-homed in the shell's outlet (`focused-project-view.tsx`),
keyed by the project the route shows in the editor. The gate's worker wait moves into the outlet. Focus,
the route state and the mounted live set are unchanged, so no action or verdict changes. The route and
live-session sources name the re-homing in their comments.
Merged with A7c: the live sessions' focused block is gone, so its imports are too. No action or verdict changes.
A15b: the route content renders inside the persistent workspace frame (`workspace-frame.tsx`), and the gate's
worker wait draws only a busy marker over it. Focus, the route state and the mounted live set are unchanged, so
no action or verdict changes.
A15b2: the shell (`page.tsx`) hosts the workspace frame for the app's route, so the route content renders inside it
from the shell and the route wraps only its detached form. Focus, the route state and the mounted live set are
unchanged, so no action or verdict changes.
RR1 (React Router 7.18.5): the route sink reads the replay's navigation state with the public `useNavigation`.
It still reads the router's live state through `UNSAFE_DataRouterContext` when a command arrives, because the
rendered state lags a navigation React renders in a transition and the I2 deferral needs the live one. Its tests
render under a data router. No action or verdict changes.
PL1 (runtime entry cut): `SessionProjectProvider` moved to `hooks/project-provider.tsx` so Home's graph stops at
the hook; the live sessions import it from there. Only an import path changes. No action or verdict changes.
SP5-warm (STO-25): the module port loads through `openProjectWorkspace`, which answers with the same session
module promise and, only once it has resolved, starts the viewport's workspace layout import as a detached
warm-up. The warm-up never gates, delays or fails the port's answer (a layout import that fails or a viewport
that cannot be measured is swallowed there and retried by the layout's own render), so `ModuleLoaded` and the
module party are unchanged and a link's warm-up still yields `ModuleAtStart = "loaded"`. The live sessions
re-export the layout warm-up. No action or verdict changes.
STO-25 (SP5-model): a live project's binding reads its manifest again once a tree write lands `tau.json`
(`entryManifest`), so the model surfaces know from the first view which manifest the project holds. That is
the session's own manifest observation, environment here; focus, the route state and the mounted live set are
unchanged, so no action or verdict changes.
DC-10 files-ui slice 5 (2026-11-17): `project-route-intent.tsx` takes `project-url.utils` from `@taucad/files-ui`;
only the import moved. No action or verdict changes.
DC-10 revisions-ui slice 2 (2026-11-18): `project-live-sessions.tsx` takes the `RevisionCommands` type from
`@taucad/revisions-ui`; only the import moved. No action or verdict changes.
Shared cloud-open copy (2026-11-24): `project-route.tsx` reads its "Opening project" aria-label from
`#lib/project-open-copy`; only the label's source moved. No action or verdict changes.
One label for the open (2026-11-25): the aria-label reads `projectOpenCopy.label`, the open's one label, in place
of the connecting step's; the words are the same. Copy only. No action or verdict changes.
A failed session's own notice (2026-11-26): `focus.route-state.ts` names a focused project whose session failed
`session-failed` rather than `closed`, so its notice says the open failed (offline, while the page reads offline)
instead of "closed", with a reload as its one action. Both are this model's `closed` view (not the editor, a
notice with a recovery); the derivation of editor and non-editor is unchanged. No action or verdict changes.
A failed workspace import settles once (2026-11-27): `project-route.tsx` reads the workspace shell through
`useProjectWorkspace`, which draws nothing once the import failed instead of importing again on each render; the
route's notice (the model's `closed` view) and its reload are unchanged. Mount mechanics only. No action or verdict
changes.
```

```sha256
d5ec26831b7c71427ac2318f1f789431d397cf5986cb631d436b118958a56bce  apps/ui/app/machines/focus.route-state.ts
8f4cd4a05b209cf4e70336a2b449141788d0e2224a6c8516136976e656c81c58  apps/ui/app/routes/w.$workspace.$project/project-live-sessions.tsx
df4e117b9f073ac4acff56939fd591e8a741368128f3f77102fd227a7b17d19b  apps/ui/app/routes/w.$workspace.$project/project-route-intent.tsx
9c260884f35da10b0ed3b6855cb6ac64aa5426bb858d8a37d74330fc4a8965bb  apps/ui/app/routes/w.$workspace.$project/project-route-state.ts
cea59c1c24147991e99d991c358afaf9d1d77da03a9cd4187271ca4c79f0f035  apps/ui/app/routes/w.$workspace.$project/project-route.tsx
b8a28e1fc22ece997867123b1adcc22df03eb031be6426d8a48f3c8d0ad138d5  apps/ui/app/runtime/app-runtime-focus.ts
```
