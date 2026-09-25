/-
ChatLedger — executable Lean 4 model (core only) of Tau's chat-log fencing and run ledger, promoted from spike S5.

Modelled as the TypeScript behaves (S5 at 6f8b77392; the differential test pins it to the current code):
  log/event-sequence.ts      createEventSequence().check/commit      → `check`, `commit`
  log/event-log-appender.ts  append, readBatch (+ byteBounded)        → `appendFenced`, `readBatch`
  host/tau-agent-host.ts     runLedgerOf, appendStateOf, the three
                             legality tables, appendRecords' guards   → `step`, `ledger`, `appendStateOf`,
                                                                        `settleLegal`, `lifecycleLegal`,
                                                                        `opLegal`, `hostSettle`, `hostLife`
  host/replayed-start.ts     replayedStartOutcome                     → `replayedStart`
  log/segments.ts            mergeLogSegments                         → `merge`

Lists of rows are NEWEST FIRST (`rows.head?` is the log's tail) except where a name says
"physical"; the physical log is `rows.reverse`.
-/
namespace ChatLedger

/-- `RunLifecycleState`. `failed r`: `r` is `isResumableRunFailure(detail)`. -/
inductive Life where
  | admitted | running | paused | completed | failed (resumable : Bool) | cancelled
  deriving DecidableEq, Repr, Inhabited

/-- What the ledger distinguishes about a row. `settle c` is `turn.finalized|conflicted|failed`
with body `c`; `commit c` is `turn.history-projection-committed`; `other c` is any other row.
`c` stands for the rest of the row's content. -/
inductive Kind where
  | life (s : Life)
  | settle (c : Nat)
  | commit (c : Nat)
  | other (c : Nat)
  deriving DecidableEq, Repr, Inhabited

/-- One durable row. `(epoch, seq)` = `(leaderEpoch, sequence)`; `stamp` = `recordedAt` in ms.
The fingerprint (`canonicalJson` of the whole row) is the row itself. -/
structure Event where
  epoch : Nat
  seq : Nat
  run : Nat
  kind : Kind
  stamp : Nat
  deriving DecidableEq, Repr, Inhabited

def Event.key (e : Event) : Nat × Nat := (e.epoch, e.seq)

/-! ## Appender: event-sequence.ts + event-log-appender.ts `append` -/

/-- `rows`: the appender's `events`, newest first. `cursorFingerprints` is `rows` itself: the map
and the array are updated in lockstep (`transition.commit()` then `events.push`). -/
structure Log where
  rows : List Event := []
  closed : List Nat := []
  active : Option Nat := none
  last : Option Nat := none

inductive Err where
  | mutated      -- EVENT_MUTATED
  | outOfOrder   -- EVENT_OUT_OF_ORDER (gap)
  | closedEpoch  -- EVENT_OUT_OF_ORDER (closed epoch)
  deriving DecidableEq, Repr

/-- `cursorKey(x) === cursorKey(e)`. -/
def sameKey (e x : Event) : Bool := decide (x.epoch = e.epoch ∧ x.seq = e.seq)

/-- `check`; `.ok true` is `{ duplicate: true }`. -/
def check (L : Log) (e : Event) : Except Err Bool :=
  match L.rows.find? (sameKey e) with
  | some f => if f = e then .ok true else .error .mutated
  | none =>
    if L.active = some e.epoch then
      match L.last with
      | some l => if e.seq = l + 1 then .ok false else .error .outOfOrder
      | none => .ok false
    else if L.active.isSome ∧ e.epoch ∈ L.closed then .error .closedEpoch
    else .ok false

/-- `commit` and `events.push`. -/
def commit (L : Log) (e : Event) : Log :=
  { rows := e :: L.rows
    closed := if L.active = some e.epoch then L.closed else
      (match L.active with | some a => a :: L.closed | none => L.closed)
    active := some e.epoch
    last := some e.seq }

/-- `append`: `.ok (L', true)` is `{appended: true}`, `.ok (L, false)` is `{appended: false}`. -/
def appendFenced (L : Log) (e : Event) : Except Err (Log × Bool) :=
  match check L e with
  | .error err => .error err
  | .ok true => .ok (L, false)
  | .ok false => .ok (commit L e, true)

/-- Logs an appender can hold: built from empty by successful appends. -/
inductive Reach : Log → Prop where
  | init : Reach {}
  | step {L L' : Log} {e : Event} {b : Bool} : Reach L → appendFenced L e = .ok (L', b) → Reach L'

/-- Per-epoch contiguity (newest first): within an epoch sequences step by one, and an epoch
change goes to an epoch never seen before. -/
def Contig : List Event → Prop
  | [] => True
  | [_] => True
  | y :: x :: rest => Contig (x :: rest) ∧
      (if y.epoch = x.epoch then y.seq = x.seq + 1 else ∀ z ∈ x :: rest, z.epoch ≠ y.epoch)

/-! ## Run ledger: `runLedgerOf` and the legality tables -/

structure Entry where
  life : Option Life := none
  settle : Option Event := none
  deriving DecidableEq, Repr, Inhabited

/-- The `runs` Map (lookup + insertion order) and `chatRunId`. -/
structure Ledger where
  runs : Nat → Option Entry := fun _ => none
  order : List Nat := []
  chat : Option Nat := none

def Ledger.entry (L : Ledger) (r : Nat) : Entry := (L.runs r).getD {}

/-- `runs.set(r, v)`. -/
def Ledger.put (L : Ledger) (r : Nat) (v : Entry) : Ledger :=
  { L with runs := fun r' => if r' = r then some v else L.runs r'
           order := if r ∈ L.order then L.order else L.order ++ [r] }

/-- `chatRunId = r`. -/
def Ledger.setChat (L : Ledger) (r : Nat) : Ledger := { L with chat := some r }

/-- `entry.settlement ??= event`. -/
def keepFirst : Option Event → Event → Option Event
  | some s, _ => some s
  | none, e => some e

/-- One iteration of `runLedgerOf`'s loop, including the reopen clause. -/
def step (L : Ledger) (e : Event) : Ledger :=
  match e.kind with
  | .life s =>
      (L.put e.run { life := some s,
                     settle := if s = .running then none else (L.entry e.run).settle }).setChat e.run
  | .settle _ => L.put e.run { L.entry e.run with settle := keepFirst (L.entry e.run).settle e }
  | .commit _ => L.put e.run (L.entry e.run)
  | .other _ => L.put e.run (L.entry e.run)

/-- The fold over a newest-first row list. -/
def ledger : List Event → Ledger
  | [] => {}
  | e :: rs => step (ledger rs) e

/-- `runLedgerOf(events)` over the physical log. -/
def runLedgerOf (physical : List Event) : Ledger := physical.foldl step {}

inductive HState where
  | none | reserved | admitted | running | paused | terminal
  deriving DecidableEq, Repr

inductive AState where
  | unadmitted | open_ | terminal | settled
  deriving DecidableEq, Repr

/-- `hostRunStateOfLifecycle`. -/
def hstate : Option Life → HState
  | none => .none
  | some .admitted => .admitted
  | some .running => .running
  | some .paused => .paused
  | some _ => .terminal

/-- `appendStateOf`. -/
def appendStateOf (en : Entry) : AState :=
  if hstate en.life = .none then .unadmitted
  else if en.settle.isSome then .settled
  else if hstate en.life = .terminal then .terminal else .open_

/-- `runSettlementLegality` / `isHostSettlementLegal`. -/
def settleLegal : AState → Bool
  | .open_ => true
  | .terminal => true
  | _ => false

inductive Op where
  | admit | resume
  deriving DecidableEq, Repr

/-- `chatRunOperationLegality` / `isHostRunOperationLegal`. -/
def opLegal : Op → HState → Bool
  | .admit, .none => true
  | .admit, .terminal => true
  | .admit, _ => false
  | .resume, .admitted => true
  | .resume, .running => true
  | .resume, .paused => true
  | .resume, .terminal => true
  | .resume, _ => false

/-- `isHostLifecycleLegal`. -/
def lifecycleLegal (next : Life) (st : AState) (life : Option Life) (reopenable : Bool) : Bool :=
  if next = .admitted then st = .unadmitted
  else if st ≠ .settled then true
  else if hstate life ≠ .terminal then true
  else next = .running ∧ reopenable

/-- The chat's current run and its state (`runLedgerOf(...).chat`). -/
def Ledger.chatState (L : Ledger) : Option (Nat × HState) :=
  L.chat.map fun r => (r, hstate (L.entry r).life)

/-! ## appendRecords: the host's guards for one body -/

inductive SettleOutcome where
  | append | skip | conflict | withoutRun
  deriving DecidableEq, Repr

/-- `settlementRefusal`: the code depends only on whether the state is `settled`. -/
def refusal (st : AState) : SettleOutcome := if st = .settled then .conflict else .withoutRun

/-- `appendRecords` for one settlement body `c` of run `r` (the `recordSettlement` path when
`executing = false`); `rows` newest first. Identity of settlements is `isSameSettlement`
(all non-envelope keys), i.e. equal `c`. -/
def hostSettle (rows : List Event) (r c : Nat) (executing : Bool) : SettleOutcome :=
  let en := (ledger rows).entry r
  match en.settle with
  | some s => if s.kind = .settle c then .skip else refusal (appendStateOf en)
  | none => if !executing && !settleLegal (appendStateOf en) then refusal (appendStateOf en) else .append

/-- `refusedResumably(existing, r)`: the run's last lifecycle row is a resumable failure. -/
def refusedResumably (rows : List Event) (r : Nat) : Bool :=
  ((ledger rows).entry r).life == some (.failed true)

/-- `appendRecords`' lifecycle guard for one `run.lifecycle` body. -/
def hostLife (rows : List Event) (r : Nat) (next : Life) : Bool :=
  let en := (ledger rows).entry r
  lifecycleLegal next (appendStateOf en) en.life (en.life == some .paused || refusedResumably rows r)

/-- `appendRecords` for one body (the appender below it only refuses more). -/
def hostAppend (rows : List Event) (e : Event) (executing : Bool) : Option (List Event) :=
  match e.kind with
  | .settle c =>
      match hostSettle rows e.run c executing with
      | .append => some (e :: rows)
      | .skip => some rows
      | _ => none
  | .life s => if hostLife rows e.run s then some (e :: rows) else none
  | _ => some (e :: rows)

/-- Logs the host's single writer can produce, whatever `executing` was at each append. -/
inductive HostReach : List Event → Prop where
  | nil : HostReach []
  | step {rs rs' : List Event} {e : Event} {x : Bool} :
      HostReach rs → hostAppend rs e x = some rs' → HostReach rs'

/-! ## replayed-start.ts -/

inductive Replayed where
  | admit | resume | settled
  deriving DecidableEq, Repr

def isCommitOf (r : Nat) (e : Event) : Bool :=
  e.run == r && (match e.kind with | .commit _ => true | _ => false)

/-- The run's newest `run.lifecycle` state (`findLast(e => e.runId === r && e.type === 'run.lifecycle')`). -/
def lastLife (r : Nat) : List Event → Option Life
  | [] => none
  | e :: rs => match e.kind with
    | .life s => if e.run = r then some s else lastLife r rs
    | _ => lastLife r rs

/-- `replayedStartOutcome`. -/
def replayedStart (rows : List Event) (r : Nat) : Replayed :=
  if !(rows.any (isCommitOf r)) then .admit
  else match lastLife r rows with
    | some s => if hstate (some s) = .terminal then .settled else .resume
    | none => .resume

/-! ## readBatch -/

structure Batch where
  cursor : Nat
  next : Nat
  finish : Nat
  events : List Event
  deriving DecidableEq, Repr

/-- `byteBounded`: the longest prefix within `maxBytes`, always at least one row. -/
def byteBounded (sizes : Event → Nat) (maxBytes : Nat) : List Event → Nat → List Event → List Event
  | [], _, taken => taken.reverse
  | e :: es, total, taken =>
    let total' := total + sizes e
    if total' > maxBytes ∧ taken ≠ [] then taken.reverse else byteBounded sizes maxBytes es total' (e :: taken)

/-- `readBatch({cursor, limit, maxBytes})` over the physical log. -/
def readBatch (physical : List Event) (cursor limit : Nat) (maxBytes : Option Nat)
    (sizes : Event → Nat := fun _ => 0) : Batch :=
  let c := min cursor physical.length
  let window := (physical.drop c).take limit
  let evs := match maxBytes with
    | none => window
    | some m => byteBounded sizes m window 0 []
  ⟨c, c + evs.length, physical.length, evs⟩

/-! ## mergeLogSegments -/

structure Term where
  device : Nat
  epoch : Nat
  order : Nat
  started : Nat
  events : List Event
  deriving DecidableEq, Repr

def Term.has (t : Term) (s : Nat) : Bool := t.events.any (fun x => x.seq == s)

/-- One row of one segment (`terms` in Map insertion order; `intro` = this segment's `introduced`). -/
def addRow (dev : Nat) (st : List Term × List Nat) (e : Event) : List Term × List Nat :=
  match st.1.find? (fun t => t.epoch == e.epoch) with
  | none => (st.1 ++ [{ device := dev, epoch := e.epoch, order := st.2.length, started := e.stamp,
                         events := [e] }], st.2 ++ [e.epoch])
  | some _ => (st.1.map fun t => if t.epoch == e.epoch then
        { t with events := if t.has e.seq then t.events else t.events ++ [e],
                 started := min t.started e.stamp } else t, st.2)

/-- `holdFileOrder(introduced)`. -/
def clamp (intro : List Nat) (terms : List Term) : List Term :=
  (intro.foldl (fun (acc : List Term × Option Nat) ep =>
      let cur := ((acc.1.find? (fun t => t.epoch == ep)).map (·.started)).getD 0
      let v := match acc.2 with | some f => max cur f | none => cur
      (acc.1.map (fun t => if t.epoch == ep then { t with started := v } else t), some v))
    (terms, none)).1

def mergeSegment (terms : List Term) (seg : Nat × List Event) : List Term :=
  let st := seg.2.foldl (addRow seg.1) (terms, [])
  clamp st.2 st.1

/-- Stable insertion sort (`toSorted` is stable; every key used here is unique anyway). -/
def insertBy {α : Type} (lt : α → α → Bool) (x : α) : List α → List α
  | [] => [x]
  | y :: ys => if lt y x then y :: insertBy lt x ys else x :: y :: ys

def isort {α : Type} (lt : α → α → Bool) : List α → List α
  | [] => []
  | x :: xs => insertBy lt x (isort lt xs)

/-- `startedAt - ... || deviceId.localeCompare || order - ... || leaderEpoch.localeCompare`
(device and epoch ids are generated so that `localeCompare` is numeric order). -/
def termLt (a b : Term) : Bool :=
  a.started < b.started || (a.started == b.started && (a.device < b.device ||
    (a.device == b.device && (a.order < b.order || (a.order == b.order && a.epoch < b.epoch)))))

/-- `mergeLogSegments`; each segment is `(deviceId, physical rows)`. -/
def merge (segs : List (Nat × List Event)) : List Event :=
  let terms := segs.foldl mergeSegment []
  let sorted := isort termLt (terms.map fun t => { t with events := isort (fun a b => a.seq < b.seq) t.events })
  sorted.flatMap (·.events)

end ChatLedger
