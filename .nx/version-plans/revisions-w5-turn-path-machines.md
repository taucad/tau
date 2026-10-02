---
revisions: minor
host: minor
---

Answer every revision request by its own id, key turns by attempt, and hold a turn's lease until its settlement is acknowledged. **Breaking**:

- Every request carries a `requestId` and every answer echoes it: the checkout's and the root's `cut`, `cancelCut` and `cutCancelled`, the branch verbs, `publish`, the root's `switch`, `addCheckout` and `removeCheckout`, and their `toast.*`, `switchResolved`, `switchRefused`, `checkoutAdded`, `checkoutRemoved` and `checkoutFailed` answers. Coalesced saves answer each requester under its own id. `syncNow` keeps its `pushId`, and every carried `pushId` is answered.
- The root's turn verbs take a `TurnAttemptKey` (`{ chatId, turnId, runId, attempt }`, now exported): `admitTurn{ key, checkoutId?, legacy? }`, `turnCompleted{ key }`, `turnAbandoned{ key }` and the new `acknowledge{ key }`. The root's `release` event is removed. `TurnMachineInput` is `{ key, checkoutId?, parentRef?, adopt? }`.
- A turn writes its lease record before it mints a base, stays `settled` after announcing its outcome, and retires the record only on `acknowledge`. The root emits `turnPlaced`, `turnCutRefused`, `turnRetired`, `acknowledgeRefused` and `leaseHeld`. A refused cut keeps the lease (`CUT_FAILED`). An admission marked `legacy` is acknowledged by the root, and gives up after a refused cut, as before.
- `headChanged` is replaced by `headMoved`, which carries nothing: the checkout re-reads its head and branch, deferring the read past a running mint. The registry's heads seed a checkout and are not adopted later. `headsCached` is removed.
- A busy branch or publish verb is answered `toast.error` with code `REVISIONS_BUSY`. The branch, publish and turn machines hold no timeout of their own: `BASE_CUT_TIMED_OUT`, `CUT_TIMED_OUT` and `turnCutSettlementMilliseconds` are removed, and `BASE_CUT_FAILED` is added. A push has a network deadline in `sync`.
- Turn provenance names the attempt (`runId`, `attempt`, `turnCut`) and lists the checkout's other leases in `heldRunIds`, and the revision trailer carries them.
- `selectTurnRevisionId` and the branch machine's `BranchCheckoutRecord` are removed.
- New exports: `TurnFact` (the root's per-attempt facts), `TurnFindActorInput`, `TurnFindActorOutput` and `TurnWriteLeaseActorOutput` (the turn's `find` and `writeLease` effects), and `checkoutIgnoredEvents` and `turnIgnoredEvents` (the (state, event) pairs each machine ignores as stale, MC-R17).
- The root's `turnCompleted` and `turnAbandoned` take `legacy?: true`: an attempt adopted on such a verb is acknowledged by the root. The root never adopts an attempt it retired itself (`retiredAttempts`, kept until the registry drops the run). A trigger-only cut is declined at the root only for this root's own unsettled attempt; another holder's lease is answered by the fresh fence (`nothingToSave{heldBy}`).
- The registry's `retireLease` input takes the retiring attempt's `key?`, and the effect then retires the record only when it names that attempt and holder (`retirementKeys` in the registry context).

`host` mints the request ids and attempt keys its revision commands now need. Its own API is unchanged. Two behaviours change: `turn.finalized` (and every settlement) is now reported before the turn's lease record is removed, which follows the settlement's acknowledgement; and `close()` records the close revision even while the registry still lists a lease, leaving a live one to the fresh fence.
