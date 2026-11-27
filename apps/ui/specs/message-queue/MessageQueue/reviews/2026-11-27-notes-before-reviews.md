Moved from the notes above `EXTENDS` in `MessageQueue.tla` by `formal review-notes`.

```text
Presentation changes preserve admission, cancellation and command identity.
Composer Stop and its shortcut retain Stop; removing the duplicate message
button and its diagnostic origin does not change cancellation or queue delivery.
Explicit reorder changes only the saved queue sequence under delivery exclusion.
Enlarged-text reflow and readable busy labels retain the same disabled guards.
Composer tray dividers, row padding and icon alignment are presentation only;
queue edit, reorder, retry and targeted-send callbacks retain their guards and identity.
Pending view actions remain serialized until settlement. Pointer cancellation,
dropping outside the queue and unsaved inline edits further restrict Reorder.
Failed steering retains its durable cancel identity; a removed item's view-only
action error cannot offer a retry. Admission bridge hashing fences Prepare inputs.
Letting a new project's first cloud backup go on its first live frame (WP-12
step 5) reads the frame only; delivery, admission and persistence are unchanged.
A command that borrows the chat's attached client goes through the same answer
wrapper as a dialled one, so a cursor wake is the only effect; delivery is unchanged.
Composer focus asking the chat's host to prewarm an ACP adapter (WP-18) opens no
turn and sends no queued item; admission, delivery and persistence are unchanged.
The executable queue event alphabet comes from its schemas; removing an unused
duplicate TypeScript event union does not change these transitions or guards.
Grok config discovery and host-owned session selection affect composer controls;
queued admission, FIFO delivery and durable cancellation retain these owners.
Relabelling Steer as Send now changes only presentation; Steer keeps its targeted
durable cancel, and the next message's run waits on the stopped attempt in the host.
The composer's mobile collapse tracks focus for layout only; submit, admission
and queue delivery keep the same paths.
A foreign segment rescan that ends unchanged re-presents the local transcript;
it reads the projection only and leaves admission, delivery and the queue alone.
Chat message-change wakes are throttled for React readers only; status wakes
stay immediate, and admission, delivery and the queue never read either.
A queued item's execution is the chat's intent with this device's own placement
put back on it, and admission refuses an external agent this device cannot place
before any host wait; queue delivery, persistence and cancellation are unchanged.
A run another device holds disables submit like the existing disabled guards, and
the host's `wait` refusal of a queued admission while it holds takes the existing
refused-admission path; this device's placement is written on every change and
read from the open session first. Queue transitions and guards are unchanged.
A legacy device-relative placement is adopted once at a session's load, through
the chat store's adopting write, before any queued item is admitted. A placement this
tab cannot reach is held at load and the chat runs locally; queue paths unchanged.
A held placement is applied once this tab can reach it and dropped when the person
picks an execution elsewhere; admission, delivery and the queue never read it.
The persistence context is the held placement's one copy, which the placement write reads.
A half-finished legacy adoption is finished on a later open; queue paths are unchanged.
A chat's load never waits on the origin probe or on finishing an adoption; queue paths unchanged.
An adopted placement is written only after the chat record's drop commits; queue paths unchanged.
A legacy host is adopted without leaving the synced record; a placement of unknown reach is applied
at load and settled later, so admission waits for its host. Queue paths unchanged.
Held placements are re-applied on one reachability signal (origin or loopback); queue paths unchanged.
chat.json drops device-relative hosts in the chat store alone; queue paths unchanged.
A late reach answer settles a load placement only while the chat still runs on it, and placements are read
and written through one path; queue paths unchanged.
A chat's open reads its placement through that one shared read too; queue paths unchanged.
A placement held during a load is checked against reach once it is held; queue paths unchanged.
Other devices' segments reach the projection with this device's read time, so a run held
elsewhere goes stale by this device's clock; queue paths unchanged.
Each segment also carries when it last changed on this device (its modification time), the one
time the page and the agent host both measure a foreign run from; queue paths unchanged.
That modification time comes from a metadata-only stat, which never reads segment content; queue paths unchanged.
A foreign run goes stale only once this device's last pull, read beside the segments, came past
the bound after that time with nothing newer, and the page asks for that pull; queue paths unchanged.
That pull answers whether this device can pull the chat at all; where it cannot, a run quiet past the
ask interval no longer disables submit, as the host's fence reads it; queue paths unchanged.
QueuePlacement.tla separately checks host-local lost-ACK recovery and scoped
legacy receipt rebasing; this module retains its single-host FIFO scope.
Skipping observation of the registration probe, or of a chat this tab already
crashed on, never enqueues, prepares or acknowledges; queue paths unchanged.
Timing when a live run's first model text was shown (agent observability T10)
only reads the projection and notifies the host; queue paths unchanged.
Rating an ended run's reply (agent observability T12) only reads the ledger
and notifies the host, once the run's lifecycle ended (a pause resumes); queue
paths unchanged.
Home's server-rendered composer input stays live until the rich composer hydrates; its edit
enters the existing draft owner through one setDraftText, and that early input carries no submit
path, so nothing enqueues, prepares or acknowledges before hydration; queue paths unchanged.
Home and the library now host that early input themselves and fetch the rich composer on
demand, so the composer's own module is no longer in the entry route's eager closure. The
host withholds adoption until the composer is loaded, the composer receives the adopted
snapshot as a prop instead of mounting its own early input, and no submit, admission,
enqueue or acknowledgement path can run before it arrives; queue paths unchanged.
A Tau turn's admission now waits for the page's skills catalog to settle, bounded the way it
waits for the host probe, before it composes the turn's context (prompt-prefix identity I1);
the wait sits inside Prepare, and submit, persistence, delivery, cancellation and the queue
keep their paths and guards; queue paths unchanged.
The composer now takes its toast from the shared UI package instead of the app's own sonner
wrapper (ui-kit extraction); only an import moved, and queue paths unchanged.
The queue store and the queue view moved into the chat-ui library (UI wave B) with no change
to their code beyond import specifiers; queue paths unchanged.
The session machine now holds the chat's automatic-resume wait and the run-elsewhere pull
heartbeat as `after` delays the store drives (audit R5). A wait that ends sends a `continue`
gesture, which never enters the queue; a gesture ends the wait. Submit, Prepare and delivery unchanged.
Only a viewed chat with a published admission waits; the resumed plan stays in hand until its
failure leaves, or the run returns to failed under it; neither touches the queue.
The machines, the session store and the turn host take their xstate, privacy and observation
helpers from the ui-core library (UI wave E) instead of the app's lib; only imports moved,
and queue paths unchanged.
The session store reads and persists the chat's kernel preference beside its active kernel
(automatic kernel selection M4); queue delivery, persistence and placement are unchanged.
The turn host passes the Auto kernel preference and owner to turn telemetry (automatic kernel
selection AKS-10); admission, delivery and the queue barrier are unchanged.
The app runtime builds the session store with its dependencies at construction (app state
orchestration A2): the library's chat-record ports, and its record client and watch, taken again
when the root worker is replaced. The closures it calls are the same; queue paths unchanged.
A chat a sidebar row only observes answers unread from its observation's project, as an
acquired chat answers from its session's; admission, delivery and the queue never read it.
The session store reports its transcript's load state and the composer trays a chat remembers
(app state orchestration A12, I21): read-only derivations of the applied transcript and a
per-device memory, latched once the load settles (a refused read, or a chat this tab created
empty, noted by the create paths); an empty log waits for the scan of other devices' history before
it settles, and a refused or failed read waits for it too; a scan that fails or never reads
latches, as does a chat refused before it was opened or whose watch closed after it read; a
partial page never settles, and trays are remembered only once that scan has read and this
device's log has answered; a chat opened after its foreign watch closed settles at once.
Admission, delivery, persistence and the queue barrier are unchanged.
A dispatched continue whose resumed attempt's running and failed rows fold into one read
presents that attempt as running before its terminal, so the session settles as the run
ended (Observe of a terminal run); delivery still waits for the same terminal observation.
A7b: the store hears the focused project from the app runtime's focus rather than from a setter the
session binding called, and binds that project's chats to its live session again each time focus
arrives there, as the setter did. Admission, delivery, persistence and the queue barrier are unchanged.
A7c: the store binds each live project's session from the registry's live set, which the app runtime hands it,
rather than from a setter the session binding called, so a session is bound with nothing mounted and forgotten
when the registry lets it go. Admission, delivery, persistence and the queue barrier are unchanged.
A7c review: the store's members are reordered for lint and its session loop reads the map's keys directly; the
binding, admission, delivery, persistence and the queue barrier are unchanged.
PR-7: the turn host reads usage-metrics consent from the one telemetry consent rule; it gates only
telemetry, so admission, delivery, persistence and the queue barrier are unchanged.
Approval watch: a run watch or transcript read that fails on a dropped or replaced connection is
retried a bounded number of times instead of latching the run; only presentation changes, so
admission, delivery, persistence and the queue barrier are unchanged.
Approval stop: the composer offers Stop while its run is paused on an approval or stopping, and the
cancel goes through the one targeted host cancel it always used; the host cancel log line is JSON
text. Only the control and logging change, so admission, delivery, persistence and the queue
barrier are unchanged.
PL1 (runtime entry cut): the store's per-chat SDK `Chat` loads on demand behind `DeferredChat`, an ordered
queue that replays every send made before the load in order, rejects one past its bound rather than dropping
it, and settles every queued send as failed when the load fails. Once loaded, a send runs synchronously as
before. Delivery order, admission, persistence and the queue barrier are unchanged, so no action or verdict
changes.
PL6 (hand-off contract): the project composer adopts the native input the workspace placeholder served, moving
its edit into the draft before the editor renders, and an Enter pressed there is one submit through the
composer's existing Enter path once the editor holds the text. Submit, admission, delivery and the queue keep
the same paths and guards. No action or verdict changes.
PL6 review: the composer adopts only an input its own project's placeholder served, and the queued submit waits,
still queued, until the composer's guards permit a send, then carries the editor's text through the same submit.
The composer's guard refs update in a layout effect. No action or verdict changes.
WP5 (composer image formats): the store and the composer draft provide the image step from the app's
attachment image actor, and a queued image carries its declared type for the intake counter only; admission,
delivery, persistence and the queue barrier are unchanged.
Composer drop zone and converting slot: the chat pane and Home hero forward dropped files to the composer's
existing drop handler, and the draft lists images still being converted as placeholder slots. Draft, admission,
delivery, persistence and the queue barrier are unchanged. No action or verdict changes.
SP2g (change-event netting): the store's watch of a chat's foreign segment directory also refolds on a
summary of that directory or any ancestor (the project root included), as the coalescer now delivers scoped
`directoryChanged` resets; a refold only re-reads segments, so admission, delivery, persistence and the queue
barrier are unchanged.
SP2h (chats before the whole download): the chats and the composer open once their records land, before a Tau
Cloud open has written the files. A turn this document hosts waits inside its admission, as it already waits for
the host probe, until the open's intent clears; the wait ends in a placement refusal when the open fails or this
account may not continue it (re-read on an account switch), and with the stop's reason on Stop or the turn
host's unmount, which is checked again after the catalog wait. The composer disables
send meanwhile. Admission still decides once, so delivery order, persistence and the queue barrier are unchanged.
A15d (early input, on PL6's hand-off): while the chat's record is unread (read through a selector, never a
snapshot in the component), the composer takes a painted draft through `hydrateDraft`, which skips a touched draft.
PL6's queued submit is shown until it is sent or cancelled, and Escape cancels it as an edit does. An Enter queued on
a painted draft nobody edited waits for the composer's record (the chat's, or Home's own) and is replayed only when
the record holds that text and nothing more;
otherwise it is cancelled and never sent. A send still enters the queue only through the composer's submit, so
admission, delivery, persistence and the queue barrier are unchanged, and no action or verdict changes.
External-agent sign-in: the store answers which host a chat is attached to (a read of the observation it already
keeps), so a login card can offer the sign-in where that host refused the turn, and an exit-0 sign-in retries the
refused turn through the existing regenerate gesture. No action or verdict changes.
DC-10 revisions-ui slice 2 (2026-11-18): `use-turn-admission.ts` takes the revision client registry from
`@taucad/revisions-ui`; only the import moved. No action or verdict changes.
revisions-ui slice 6 (2026-11-19): `use-turn-admission.ts` takes `subscribeRevisionSessionUser` from
`@taucad/revisions-ui/lib/revision-actor`; only the import moved. No action or verdict changes.
Tau Cloud naming audit (2026-11-18): `chat-session-store.ts` rewords the queue-updates error sentence; copy only.
No action or verdict changes.
DC-10 files-ui slice 9 (2026-11-19): `chat-session-store.ts` takes the `CommitCancelledDraftRestoreInput` type
from `@taucad/files-ui`; only the import moved. No action or verdict changes.
Adaptive app deployment mode C6 (2026-11-19): `chat-turn-host.tsx` rebuilds `snapshot.kernel` from the plan read at
admission; delivery, persistence and the queue are untouched. No action or verdict changes.
DC-10 chat-ui slice 1 (2026-11-19): `chat-message-queue.machine.ts` moves unchanged to `@taucad/chat-ui`, and
`chat-session-store.ts`, `chat-message-queue.tsx`, `chat-textarea.tsx` and `use-chat.tsx` import it, the draft
machine and the chat SDK loader from there; only paths moved. No action or verdict changes.
PL7 staging defects FP9 (2026-11-20): `chat-textarea.tsx` loads the headless capture service through the
code-loading owner (`loadCode`); delivery, persistence and the queue are untouched. No action or verdict changes.
UI layering W2 (2026-11-21): `chat-session-store.ts` takes `run-auto-resume` from `@taucad/chat-ui`, where it moved
unchanged from `@taucad/ui-core`; only the import moved. No action or verdict changes.
UI layering W5 (2026-11-21): `chat-session-store.ts` takes the `CommitCancelledDraftRestoreInput` type from
`@taucad/project-library`, where `chat-storage.types` moved unchanged from `@taucad/files-ui`; only the import
moved. No action or verdict changes.
FP10 held seed (2026-11-25): `chat-session-store.ts` shows the agent host's terminal code load failure, which the
chat's host read met before a seed's command could, as the chat's error once the chat has loaded. The seed stays
held, as before, until a host read answers; delivery, persistence and the queue are untouched. No action or verdict
changes.
Launch audit first fixes (2026-11-25): `chat-session-store.ts` compares the composer's draft with a sent message in
the composed form before it clears the draft or returns the message to it. `use-turn-admission.ts` refuses a
signed-out person's turn on the existing refused-admission path and records the refused gesture's identity and kind
on the saved error; `chat-turn-host.tsx` and `use-cad-chat-client.ts` pass that kind. Delivery, persistence and the
queue barrier are unchanged. No action or verdict changes.
Launch audit review fixes (2026-11-25): `use-cad-chat-client.ts` names a refused attachment send or edit by its own
gesture kind instead of always `send`. Delivery, persistence and the queue barrier are unchanged. No action or
verdict changes.
Chat UX F1/F2 (2026-11-25): a send made with nothing running is shown in the thread while it is admitted,
not as a queue row. Stop during that admission, or a host refusal of it, withdraws the entry (Withdraw): an
unprepared, unsteered, never-accepted entry leaves the queue and the submitted set and returns to the composer,
and the session machine's `withdrawTurn` abandons the admission. The person may submit it again.
The store waits for a withdrawal's removal before it re-reads the outbox, so no delivery reads it half-written.
A Stop with no run, or over a run that already ended, sends no cancel (Cancel needs a live observed run).
Audit A-5: a cancel the host refuses or never answers lets go of the Stop; one owed while no host is attached is
sent when it attaches; a Stop deferred to a command that started no run is let go. Cancel and delivery unchanged.
The outbox logs which gate holds its head each time that gate changes; the gates themselves are unchanged.
Chat UX review (2026-11-25): the delivery gate moved into `outbox-gate.ts` as one pure selector that both the
advance and the thread's departing send read, so the two cannot disagree. Withdraw now returns the message to
the composer in the same step that removes it under the file lock (`composer`), and marks every unprepared,
unsteered send still behind it held (`held`): the person stopped, so nothing queued behind leaves until they
send it now (Steer). ComposerExclusive and HeldWaitsForPerson state both; the withdraw-releases-held witness
removes the hold.
Review round 2: held sends are parked, so a later send goes ahead of them (FIFO among the unheld, `NextUp`).
A steered send not yet prepared may be withdrawn too. TakeBack models the host's take-back of an accepted,
still-live turn (`TURN_WITHDRAWN`): the run is cancelled and its request returns to the composer, never shown.
Stop is one value on the session (`PendingStop`); a cancel refused `RUN_NOT_LIVE` lets it go quietly, and a Stop
during a resume's answer cancels the accepted attempt. Cancel's guards and every action above are unchanged.
Review round 3: a withdrawn send is parked first and leaves the outbox only once an empty composer has taken it,
so Withdraw may also leave it queued and parked (a composer holding new text); either way it is in one place.
Parking drops the send's spent steer, so it never reads as Send now. Admission refusals use the same offer.
The thread calls a handed-over send departing only until the log has its request. A take-back is restored
from the log's `TURN_WITHDRAWN` row even when the Stop was let go before that row arrived.
A `TURN_RELEASED` that reaches the page before its run's ending row waits briefly for that row before it is
judged; that changes no action or verdict.
TakeBack now holds the sends queued behind a taken-back turn, as Withdraw does. A Stop aimed at a run settles
from that run's end, and each cancel's answer settles only the Stop that sent it.
use_skill startup latency T2 (2026-11-26): the transcript `chat-session-store.ts`, `chat-turn-host.tsx`,
`use-cad-chat-client.ts` and `use-chat.tsx` read is the fold of the projection, with a durably accepted gesture shown
until its run folds; delivery, persistence, acknowledgement and the queue are untouched. No action or verdict changes.
use_skill startup latency T3 (2026-11-26): the chat's status in `chat-session-store.ts`, `use-chat.tsx` and
`use-cad-chat-client.ts` is the run phase, else the command in flight; the store arms no SDK stream, and its usage,
trays and first-text timing read the fold. Dispatch, acknowledgement and the queue are untouched. No action or
verdict changes.
use_skill startup latency T4 (2026-11-26): `chat-session-store.ts` and `use-chat.tsx` hold no AI SDK `Chat`, watch,
presentation hold, retry or materialization; the fold is the transcript's one owner and settles its load. A Start
whose log read is refused for good no longer shows as submitted. Dispatch, acknowledgement and the queue are
untouched. No action or verdict changes.
T4 review (2026-11-26): the store's transcript holds its D-UI-10 announcement, a refused read releases its held run
and a Resume stays submitted until its run reopens. Dispatch, acknowledgement and the queue are untouched.
T4 review round 3 (2026-11-26): a command answered on a refused read releases its run, and a gesture's admission
in `use-chat.tsx` reads the current fold rather than the throttled transcript, and `chat-turn-host.tsx` builds
its command from the fold read after its admission waits. No action or verdict changes.
Chat UX F1/F2 with T2: the departing send is shown on the fold until the host accepts it, and the accepted
gesture shows it after; a handed-over send no longer needs its own copy. No action or verdict changes.
Chat UX F1/F2 with T3: a Stop that dispatch lets go also refreshes the run-phase status. No action or verdict
changes.
Chat UX F1/F2 with T4: the departing send is appended to the throttled transcript, so it shows at once. No
action or verdict changes.
Chat UX second automated review: the return to the composer moves under the delivery lock and leaves the outbox
only once the composer's record holds it; `Withdraw`'s two outcomes already cover both. No action or verdict changes.
PERF-5 (2026-11-26): an owner `wait` refusal (WRITER_LOCKED, LOG_FENCED, HOST_CLOSED and kin) of a prepared send is
no longer a failure. The delivery lets go of the lock and keeps the command (`Yield`), and the outbox sends it again
by its key after a backoff of 250 ms doubling to 30 s (`Recover`, `Deliver`). Stop meanwhile takes it back: a
prepared send no delivery holds and the host never accepted may now be withdrawn, dropping its command.
PERF-8 (2026-11-26): a reload between a send's outbox write and its composer clear restored the queued message
as a draft. The composer lets go of a restored draft that an outbox entry composes; no action or verdict changes.
Comment pins S1 review (2026-11-26): `use-cad-chat-client.ts` flattens a message's commented images before it
builds the message, only for a submit that carries annotations and after the gesture's queue intent is captured, as
attachment promotion already waits there; a failed flatten sends nothing. `chat-session-store.ts` gains a reader of
the draft's attachment bytes, `use-chat.tsx` the draft's annotations and their setter, and `chat-textarea.tsx` a
slot for the draft's comment list. Dispatch, acknowledgement and the queue are untouched. No action or verdict
changes.
The flatten step and its painter load on demand as one module (`annotated-send.ts`), in the same place and order.
Launch audit merged with PERF-8 (2026-11-26): the restored draft is matched to an outbox entry in the composed form,
as a sent draft is, so a draft with trailing whitespace is let go too. No action or verdict changes.
Comment pins S2 review (2026-11-26): an edit names its comments and is flattened like a send before its turn is
requested (`use-cad-chat-client.ts`, `chat-turn-host.tsx`, `use-chat.tsx`); a returned message's originals are
re-retained with its parts and the draft bytes reader falls back to the chat's directory (`chat-session-store.ts`);
the edit composer shows its comment list (`chat-textarea.tsx`). A send without annotations still takes no tick
before it is sent. No action or verdict changes.
Chat performance WP-04 review (2026-11-26): the composer's draft hint is held and written when the page hides instead of
written per keystroke (`chat-textarea.tsx`), and `useDraftSelector` selects inside the draft actor's subscription
(`use-chat.tsx`, beside WP-06's live view). Neither touches the outbox, a send or a turn request. No action or verdict changes.
Chat performance WP-06a (2026-11-26): `useChatSelector` (`use-chat.tsx`) reads each field on demand and wakes a
selector only for the sources its last evaluation read; it sends nothing to the queue. No action or verdict changes.
Its per-evaluation view is a class instance (`ChatStateView`), not an object literal of accessors. No action or verdict
changes.
Chat performance WP-06 (2026-11-26): `ChatSessionStore` publishes a projection change that touches only the live
preview from the next animation frame (`LiveOverlay.tla` `FrameClock`); ledger and durable changes, which this
model reads, still publish at once. No action or verdict changes.
HA0 review (2026-11-27): `chat-session-store.ts` reports a replayed command whose effect stays unknown (a refusal
still `unknown`, an applied answer with no durable row, or a connection lost past the bound) to Sentry, and arms a
report-only timer for a read that stays lost. A wait-class refusal still holds for its host. What is thrown, held and
acknowledged is unchanged. No action or verdict changes.
Connecting attachment placement (2026-11-27, #2297): `chat-session-store.ts` no longer reads an attachment still
connecting as observing another host. A placement change waits for that connect's answer and rebinds the log
reader only when the answered placement differs, which is the `Observe` guard of `QueuePlacement.tla`
(`s.observed # s.selected`); before, it restarted a reader already on the selected host and dropped the live text
of the run under way. The grant, the prepared-command marking and delivery are unchanged. No action or verdict
changes.
H-1 (2026-11-27): a prepared send its host refused on the only try of a fresh command, with a code that never clears
by itself, was pinned to that command for good: Delete, Edit and reorder stayed locked and every later send queued
behind it. `chat-session-store.ts` now drops that command (`Refuse`): a lone send returns to the composer, and one
with others behind it keeps its place for a new command. A `wait` refusal still yields, and a replay still keeps
its pin.
A-1 (2026-11-27): `chat-session-store.ts` shows the end of the log's current run to a chat machine that holds no
turn and is not admitting its own gesture, whatever run it presents, so a read that folds a run's `running` with
its end, or ends a later run too, no longer leaves the machine live and the queue waiting for good. This is the
model's `Observe` of a terminal phase; no action or verdict changes.
H-1 review (2026-11-27): `Deliver` may now be refused on any try, including a fresh key on an idle host, so `Refuse`
is reached from the state the runtime meets. `RefuseOnlyUnapplied` gates `Refuse`'s `m \notin Accepted`; the
`refuse-accepted` witness (pinned with the other tables) drops it and must violate `ComposerExclusive`.
One voice during an open (2026-11-27): `chat-message-queue-view.tsx` makes a queued row's busy label a live region
only for the person's own Send now or a failed send; an automatic send shows the same words without speaking.
Presentation only. No action or verdict changes.
Host attachment HA1 (2026-11-27): a composer pick made while the chat's own run is unsettled waits, whole, for
the run to settle (HA-I7); the outbox holds its head with a `pick-deferred` reason meanwhile, and the queue wakes
only after the pick's writes and route restart. A chat this device holds reads its own segment from the file, and
`attach` and the in-page route are new host commands. Dispatch, acknowledgement and the gate are untouched; the
new hold refines `Ready`, as the gate's other holds do. No action or verdict changes.
HA1 review (2026-11-27): the hold is lifted only by the pick that set it, so a newer pick that supersedes a deferred
one keeps the queue held until its own writes are done. Only a chat whose own run the file shows defers a pick.
The pick's mark is a symbol of its own. No action or verdict changes.
HA1 review round 3 (2026-11-27): an applied pick decides again whether the chat is read from the file before its
observer restarts, so a chat moved to a paired computer reads that host, and the own watch follows new
dependencies. No action or verdict changes.
HA1 review round 4 (2026-11-27): overlapping picks start one own source, the newest; while it decides, a chat whose
own run was unsettled keeps deferring picks; an older start stands down. No action or verdict changes.
Send now spoken in flight (2026-11-27): the row the person sent with Send now keeps its live region while its
durable steer is in flight, past `onSteer` settling, and an automatic send stays silent. Presentation only. No action
or verdict changes.
Host attachment HA2 (2026-11-27): a replayed or dispatched queued command's outcome follows its code's retry class
(HA-I4). Every `wait` code, and an answer lost past the command's bound, holds the item to send again by its key,
as an owner wait already did; `never`, `resume` and `reauth` still fail it with its card. Only a durable answer
acknowledges. The wait's line shows after `outboxWaitLineMilliseconds`. Holding is stuttering, never `Acknowledge`
or a second id. A head that re-sends is one cause the "Reconnecting…" cue reads (HA-I8). No action or verdict
changes.
HA2 review (2026-11-27): only a head that re-sends after a lost answer is a "Reconnecting…" cause; a coded wait
shows its own line. A replayed answer that applied nothing is reported as before. No action or verdict changes.
HA2 review round 2 (2026-11-27): the cue follows the HA5 table. A `wait` code with a line of its own shows that line
after its bound and no cue; every other `wait` code and a lost answer show the cue and no line. No action or
verdict changes.
HA2 on WP-12 (2026-11-28): a local chat lends its live overlay's client to its commands while the overlay is
subscribed, and an overlay loss drops it, so a command is a keyed send on a connection either way. Delivery and
acknowledgement are unchanged. No action or verdict changes.
HA3 (2026-11-27): a lost remote read is retried inside the host attachment (D17), not by the store, and R6 is
held as a fact beside it; the queue's delivery and persistence seam is unchanged. No action or verdict changes.
HA3 review (2026-11-27): R6 is a revocation (4003) or a computer no longer paired; a 1008 is transient. Comments
only in the store. No action or verdict changes.
```

```sha256
b44a781d3813b51d49b0af4fb70f7c07db3c323b255182dc86fc58c9fff1e2ac  apps/libs/chat-ui/src/components/chat-message-queue-view.tsx
7f5887a1f65eea460b3463f445a3aef19dd7843ea1b379940e0273eebc1c32f7  apps/libs/chat-ui/src/db/chat-message-queue-store.ts
b8ff03658a2db816af1d7e34ad621d548653e48784d5c7b2ce7801a26bbfeb0f  apps/libs/chat-ui/src/machines/chat-message-queue.machine.ts
53443348c954ec1cb4656dda9569385dd0af65c39356e1cfadd5ddb44ded8d0a  apps/ui/app/chat-clients/_internal/use-turn-admission.ts
f2037dc8f438aa8a006009909def50e9ba4d558896e77fe539f1613ecb030cd8  apps/ui/app/chat-clients/chat-turn-host.tsx
3749ada815f745fed131d6990868df4733e3279a16f073a780a34513c6b3cbff  apps/ui/app/chat-clients/use-cad-chat-client.ts
77c8164d742b8c64dc79ae0969fa71721be0c3bc64ea908cb0b812b8c42c081b  apps/ui/app/components/chat/chat-message-queue.tsx
74075a3b9d435a31944da35b53fc0e47939c09edde2ad9fe194f4a52c5aca4cf  apps/ui/app/components/chat/chat-textarea.tsx
62ae68a00adebfe89e6c620421d5a9d447135ac81b8c4e0cfd885f1d1c933f40  apps/ui/app/hooks/use-chat.tsx
2076bc41cb203f45c0049297df17be9a4a4eed966d704f34423e3a2aa3f733cf  apps/ui/app/machines/chat-session.machine.ts
dd4efbe286df2f8bfe2452c997aaad4c90ecc11126fb5f79d754a00a9d9783a0  apps/ui/app/services/chat-session-store.ts
c9d5a33f02c06d6bb45657f76e30a6c3a28b31bf6403d7dc0e9d3c840c4e357e  apps/ui/app/services/outbox-gate.ts
```
