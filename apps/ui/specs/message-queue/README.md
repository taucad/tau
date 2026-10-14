# Durable message queue protocol

`MessageQueue.tla` checks a bounded safety protocol with two messages, two tabs and one initial active run. The target configuration explores explicit reorder, gesture capture, delayed queue persistence, finish, pause, resume, stop, failure, targeted Steer, delayed cancellation, preparation, delivery, lost acknowledgement, crash and reopen. Each tab observes an independently delayed snapshot. Queue storage and the delivery lock are shared by the tabs.

The model is untimed. It does not assert eventual progress: a tab may remain offline, a provider may remain paused and an observation may remain delayed indefinitely. `CHECK_DEADLOCK FALSE` permits a stopped or paused run to retain queued work until an explicit action.

## Correspondence to implementation

| Model                                        | Runtime seam                                                                                                                        |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `Submit(t,m)`, `Persist` and durable `saved` | `ChatSessionStore.requestTurn` updates the queue under its filesystem lock without cancelling the active run                        |
| `Prepare`, `prepared` and `owner`            | Delivery Web Lock, admission, then persistence of the complete start command before transport                                       |
| `Recover`, `Deliver`, `LoseAck`              | Replay the persisted command with the same command ID and run ID; host receipts deduplicate acceptance                              |
| `Acknowledge`, `after`                       | Queue deletion writes `afterRunId` in the same record                                                                               |
| `BarrierSeen`, per-tab `observed.known`      | `#advanceMessageQueue` refuses a new item until the projection contains `afterRunId`                                                |
| `Ready`                                      | Ordinary sends require completed history, or an exact gesture-time cancelled/failed run permission; older stopped work remains held |
| `Steer`, `Cancel`, `FinishCancel`            | Persist the observed target run, cancel only that run, then wait for its terminal projection before starting the selected item      |
| `Crash`, `Reopen`                            | Release local delivery ownership while retaining the filesystem queue and prepared command                                          |

The implementation also checks `isLive(session.stateActorRef.getSnapshot()) && !retainsLiveRun(phase)`. This is a conservative local guard during a gap between admission and projection, in addition to the durable cross-tab barrier. The model abstracts local admission into the locked preparation step; it does not independently model the local XState actor. Removing this local guard therefore does not produce a dedicated model counterexample. The service test named “should wait for full completion and preserve FIFO through a fast acknowledgement and delayed projection” exercises that combined interval. The “should serialize delivery across two tabs with stale follower history” test isolates the durable barrier's cross-tab requirement, where the follower has no live local actor.

`message-queue.conformance.test.ts` runs the concrete filesystem-store portion of the prepared/lost-ack/reopen/ack trace and checks canonical source drift. It asserts byte-equivalent command replay, wrong-ACK rejection and atomic publication of `afterRunId` to another store instance. This is a refinement slice, not a general TLC-trace-to-runtime replay adapter. Runtime service tests additionally cover immutable prepared replay, authoritative receipt reconciliation, cancellation targeting and cancellation completion. Host replay and billing tests are separate owners.

The source manifest includes the queue store, driver and session machines, session service, admission bridge, queue binding and view, and the composer submit path (`chat-textarea.tsx`, `use-cad-chat-client.ts` and `use-chat.tsx`) that captures and forwards intent and selected execution. Hashing a UI file forces review of changed wiring; it does not extend the formal proof to rendering or model-selection behavior. A source change requires reviewing and updating the model before regenerating the manifest. The manifest records both the driver and session machines’ actual event alphabets and versions. This fences their integration changes without claiming to model the entire session machine; protocol decisions live in the hashed service effects, so there are currently no transition `meta.tla` mappings.

## Submissions after a terminal run

A new ordinary gesture may capture `afterTerminalRunId` only when the healthy, caught-up projection already shows a cancelled or failed run at **UI submit entry, before attachment promotion**. The captured object passes through the chat actions to the store; an explicit empty object preserves the absence of permission. Legacy callers that omit the object capture at store request entry. `Submit(t,m)` freezes that observation in `capturedTerminal[m]`; `Persist` saves it in `afterTerminal[m]`. Stop, failure and observations can interleave between these two actions, but cannot grant an earlier gesture new permission. Capture is not repeated after attachment promotion, execution lookup or taking the queue lock.

At delivery, the permission authorizes only the same current run while cancelled/failed. A live or paused run, a different cancelled/failed run, and any absent permission keep the item waiting. Normal completion continues to permit the FIFO head. Permission does not reorder: a newer authorized item behind older held work waits until that head is explicitly removed or steered. Steer retains its separate explicit cancellation contract.

`NoEarlyDelivery` checks the immutable gesture-time permission against the **actual recorded preceding run**, not just the permission stored later. This catches both globally releasing old work on Stop (`release-stopped`) and incorrectly acquiring permission during an asynchronous save (`late-terminal-capture`). These are unsafe mutants, not claims about the implemented target.

The concrete store conformance trace saves an unmarked older head followed by a marked new item, reopens them in order, then edits the latter without transferring or losing its permission. Service owner tests separately exercise healthy/caught-up capture, cancelled and failed runs, different-run/live rejection, FIFO hold and stop during delayed execution lookup.

## Final runtime guard reconciliation

`Acknowledge` requires membership in `Accepted`, which represents durable acceptance. The service now explicitly checks `answer.effect === 'durable'` on both initial dispatch and prepared replay before deleting an item. An `applied` answer with `not-applied` effect retains the original prepared command; it corresponds to stuttering, not `Acknowledge`. Reconciliation from `ledger.applied` uses the authoritative durable log. The model does not equate a successful transport response with acceptance.

The final implementation also stops the queue actor and aborts command work synchronously before chat/project deletion waits for other work. The enqueue callback rechecks session identity and actor liveness inside the filesystem lock. These are additional lifecycle restrictions: deletion is outside the retained-session model, and `PayloadSurvives` intentionally does not claim that explicitly deleted chats retain their payloads. Owner tests verify deletion races; no deletion proof is inferred from `Crash`, which preserves data for reopen.

Optional filesystem observation is composed only when supported. Watch errors hold delivery and explicit retry rechecks availability; a missing machine effect is separately reported as a composition error. The model allows observation to lag forever and therefore makes no progress guarantee for an environment without a watcher. Prepared retry additionally holds behind an unrelated live run, narrowing the modeled recovery behavior.

## Invariants and deliberate counterexamples

| Configuration           | Required result                      | Removed safeguard                                                                   |
| ----------------------- | ------------------------------------ | ----------------------------------------------------------------------------------- |
| `target`                | All nine invariants pass             | None                                                                                |
| `today`                 | `SubmitPreservesRun` violation       | Ordinary submit interrupts the active run, reproducing the prior interaction        |
| `duplicate`             | `AtMostOnceCharge` violation         | A lost-ACK retry invents a fresh acceptance identity                                |
| `lost-payload`          | `PayloadSurvives` violation          | Submit does not durably store the queued payload                                    |
| `follower-lag`          | `NoEarlyDelivery` violation          | The next item can use completed history from before the preceding item was accepted |
| `wrong-cancel`          | `CancelTargetsObservedRun` violation | Cancellation follows a later current run instead of its persisted target            |
| `early-steer`           | `SteerWaitsForTerminal` violation    | A cancellation request is treated as terminal completion                            |
| `release-stopped`       | `NoEarlyDelivery` violation          | Stop or failure releases an older ordinary item without fresh permission            |
| `late-terminal-capture` | `NoEarlyDelivery` violation          | A pre-stop gesture gains permission while its queue save awaits                     |

The target additionally checks unique queue membership, persistence of prepared payloads and FIFO delivery unless explicitly steering an item. Pause always prevents first delivery. Stop and failure preserve older ordinary queued work; only a newly captured exact-run permission can authorize the FIFO head before a later normal completion. Retries of an already accepted item do not count as a new delivery or charge.

## Bounds and proof limits

- TLC explores two messages and two tabs, with at most two transport attempts per message and one queue save pending at a time. Tab/message symmetry is used only for these safety checks. Monotone safety-monitor booleans accumulate whether any first delivery violated its preceding-run permission, Steer terminal requirement or FIFO position. Each update evaluates the same predicate over the current decision as an exhaustive send-history invariant; once false safety is recorded it cannot be erased. This merges histories with identical safety outcomes without restricting protocol actions, including duplicate transport attempts. Cancellation targeting uses the same monotone monitor technique. Once an acknowledgement permanently removes an item, its capture fields and retry counter are discarded: submitted membership prevents re-enqueue, no later action can prepare that item, and the accepted-key set and sticky monitors retain every invariant-relevant fact. This is finite exhaustive checking within that scope, not an unbounded proof.
- An accepted stable command ID represents one logical billable admission. The model assumes the existing host's receipt/attempt deduplication contract. It does not model the billing database, gateway usage reports, monetary amounts or prove external settlement exactly once.
- Prepared command contents are abstracted to message identity. The concrete persistence test checks full command equality; host/provider tests check actual replay wire validity and durable tool results.
- The gesture/persistence split models lifecycle changes while saving, but crashes are explored only after a queue save answers; it makes no promise to persist an unacknowledged draft through a crash. Storage updates and delivery ownership are atomic model steps. Filesystem implementation, Web Locks availability, arbitrary storage corruption and cross-device coordination are outside this model.
- Projection health and catch-up flags are not independent model variables: observations represent eligible snapshots, and withholding observation can conservatively delay action. Service and UI owner tests cover rejecting unhealthy/incomplete captures and retaining the original intent across attachment promotion. Only queue-originated new admissions are modeled after the original run. Competing direct starts from another device and reopening a cancelled or failed run are outside the explored protocol; Resume is modeled from paused only. Runtime guards and service tests cover a marked item facing a live run, but this finite model does not explore every cross-device failed-run resume race.
- Editing, deletion, attachments, admission refusal, loading animations and watch failure are covered by ordinary owner tests, not these safety invariants.
- No fairness, termination, maximum wait or automatic retry guarantee is claimed. All eight intentional failures are regression witnesses for the named removed safeguard; they are not evidence that the current implementation has those defects.

Run the owner's pinned PR checks with `JAVA_HOME=/opt/homebrew/opt/openjdk pnpm nx formal ui`. The initial weak model preceded implementation; this strengthened model was added after the delivery barrier and replay protocol were refined. Keep that evidence order distinct from the red-first executable runtime tests.

Explicit reorder atomically moves one pending identity before another (or to the end), only while no delivery or steering command is prepared. It changes the saved sequence but preserves command identity, payload and terminal authorization. FIFO is evaluated against this user-selected order. Store tests cover stale targets, concurrent submissions, failed writes, replayed moves and reopening.
