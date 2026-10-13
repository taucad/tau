# Durable message queue protocol

`MessageQueue.tla` checks a bounded safety protocol with two messages, two tabs and one initial active run. The target configuration explores submit, finish, pause, resume, stop, targeted Steer, delayed cancellation, preparation, delivery, lost acknowledgement, crash and reopen. Each tab observes an independently delayed snapshot. Queue storage and the delivery lock are shared by the tabs.

The model is untimed. It does not assert eventual progress: a tab may remain offline, a provider may remain paused and an observation may remain delayed indefinitely. `CHECK_DEADLOCK FALSE` permits a stopped or paused run to retain queued work until an explicit action.

## Correspondence to implementation

| Model                                   | Runtime seam                                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `Submit` and durable `saved`            | `ChatSessionStore.requestTurn` updates the queue under its filesystem lock without cancelling the active run                   |
| `Prepare`, `prepared` and `owner`       | Delivery Web Lock, admission, then persistence of the complete start command before transport                                  |
| `Recover`, `Deliver`, `LoseAck`         | Replay the persisted command with the same command ID and run ID; host receipts deduplicate acceptance                         |
| `Acknowledge`, `after`                  | Queue deletion writes `afterRunId` in the same record                                                                          |
| `BarrierSeen`, per-tab `observed.known` | `#advanceMessageQueue` refuses a new item until the projection contains `afterRunId`                                           |
| `Ready`                                 | Automatic sends require completed history; paused/cancelled runs retain pending work                                           |
| `Steer`, `Cancel`, `FinishCancel`       | Persist the observed target run, cancel only that run, then wait for its terminal projection before starting the selected item |
| `Crash`, `Reopen`                       | Release local delivery ownership while retaining the filesystem queue and prepared command                                     |

The implementation also checks `isLive(session.stateActorRef.getSnapshot()) && !retainsLiveRun(phase)`. This is a conservative local guard during a gap between admission and projection, in addition to the durable cross-tab barrier. The model abstracts local admission into the locked preparation step; it does not independently model the local XState actor. Removing this local guard therefore does not produce a dedicated model counterexample. The service test named “should wait for full completion and preserve FIFO through a fast acknowledgement and delayed projection” exercises that combined interval. The “should serialize delivery across two tabs with stale follower history” test isolates the durable barrier's cross-tab requirement, where the follower has no live local actor.

`message-queue.conformance.test.ts` runs the concrete filesystem-store portion of the prepared/lost-ack/reopen/ack trace and checks canonical source drift. It asserts byte-equivalent command replay, wrong-ACK rejection and atomic publication of `afterRunId` to another store instance. This is a refinement slice, not a general TLC-trace-to-runtime replay adapter. Runtime service tests additionally cover immutable prepared replay, authoritative receipt reconciliation, cancellation targeting and cancellation completion. Host replay and billing tests are separate owners.

The source manifest includes the queue store, driver machine, session service, admission bridge, queue binding and view, and the composer submit path (`chat-textarea.tsx` and `use-chat.tsx`) that captures the selected execution. Hashing a UI file forces review of changed wiring; it does not extend the formal proof to rendering or model-selection behavior. A source change requires reviewing and updating the model before regenerating the manifest. The driver machine exposes its actual event alphabet and version; protocol decisions live in the hashed service effects, so there are currently no transition `meta.tla` mappings.

## Final runtime guard reconciliation

`Acknowledge` requires membership in `Accepted`, which represents durable acceptance. The service now explicitly checks `answer.effect === 'durable'` on both initial dispatch and prepared replay before deleting an item. An `applied` answer with `not-applied` effect retains the original prepared command; it corresponds to stuttering, not `Acknowledge`. Reconciliation from `ledger.applied` uses the authoritative durable log. The model does not equate a successful transport response with acceptance.

The final implementation also stops the queue actor and aborts command work synchronously before chat/project deletion waits for other work. The enqueue callback rechecks session identity and actor liveness inside the filesystem lock. These are additional lifecycle restrictions: deletion is outside the retained-session model, and `PayloadSurvives` intentionally does not claim that explicitly deleted chats retain their payloads. Owner tests verify deletion races; no deletion proof is inferred from `Crash`, which preserves data for reopen.

Optional filesystem observation is composed only when supported. Watch errors hold delivery and explicit retry rechecks availability; a missing machine effect is separately reported as a composition error. The model allows observation to lag forever and therefore makes no progress guarantee for an environment without a watcher. Prepared retry additionally holds behind an unrelated live run, narrowing the modeled recovery behavior.

## Invariants and deliberate counterexamples

| Configuration  | Required result                      | Removed safeguard                                                                   |
| -------------- | ------------------------------------ | ----------------------------------------------------------------------------------- |
| `target`       | All nine invariants pass             | None                                                                                |
| `today`        | `SubmitPreservesRun` violation       | Ordinary submit interrupts the active run, reproducing the prior interaction        |
| `duplicate`    | `AtMostOnceCharge` violation         | A lost-ACK retry invents a fresh acceptance identity                                |
| `lost-payload` | `PayloadSurvives` violation          | Submit does not durably store the queued payload                                    |
| `follower-lag` | `NoEarlyDelivery` violation          | The next item can use completed history from before the preceding item was accepted |
| `wrong-cancel` | `CancelTargetsObservedRun` violation | Cancellation follows a later current run instead of its persisted target            |
| `early-steer`  | `SteerWaitsForTerminal` violation    | A cancellation request is treated as terminal completion                            |

The target additionally checks unique queue membership, persistence of prepared payloads and FIFO delivery unless explicitly steering an item. Ordinary stop and pause prevent automatic sends because first ordinary delivery records must show the actual prior run as completed. Retries of an already accepted item do not count as a new delivery or charge.

## Bounds and proof limits

- TLC explores two messages and two tabs, with at most two transport attempts per message. This is finite exhaustive checking within that scope, not an unbounded proof.
- An accepted stable command ID represents one logical billable admission. The model assumes the existing host's receipt/attempt deduplication contract. It does not model the billing database, gateway usage reports, monetary amounts or prove external settlement exactly once.
- Prepared command contents are abstracted to message identity. The concrete persistence test checks full command equality; host/provider tests check actual replay wire validity and durable tool results.
- Storage updates and delivery ownership are atomic model steps. Filesystem implementation, Web Locks availability, arbitrary storage corruption and cross-device coordination are outside this model.
- Only queue-originated new admissions are modeled after the original run. Competing direct starts from another device and reopening a cancelled run are outside the explored protocol.
- Editing, deletion, explicit reorder, attachments, admission refusal, loading animations and watch failure are covered by ordinary owner tests, not these safety invariants.
- No fairness, termination, maximum wait or automatic retry guarantee is claimed. All six intentional failures are regression witnesses for the named removed safeguard; they are not evidence that the current implementation has those defects.

Run the owner's pinned PR checks with `JAVA_HOME=/opt/homebrew/opt/openjdk pnpm nx formal ui`. The initial weak model preceded implementation; this strengthened model was added after the delivery barrier and replay protocol were refined. Keep that evidence order distinct from the red-first executable runtime tests.
