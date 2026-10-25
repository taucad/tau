/-
ChatLedger — executable Lean 4 model (core only) of Tau's chat log core after W3 (CL-S3, CL-S4, CL-S5, CL-S7).

Modelled as the TypeScript behaves; the differential test (`src/log/chat-ledger.differential.test.ts`) pins it to
the code through the committed goldens `corpus/*.expected`:

  log/event-sequence.ts      createEventSequence: check/commit/replay        → `Seq.verdict`, `Seq.commit`
  log/reducer.ts             prepare (strict), replay (tolerant)             → `Reducer.prepare`, `Reducer.replay`
  log/event-log-appender.ts  open, append (guarded), readBatch, byteBounded  → `openApp`, `append`, `readBatch`
  log/chat-ledger.ts         foldChatLedger, foldReadAnswer, reopens,
                             gateRows/gateCode, stampRows, the three tables → `Ledger.step`, `fold`, `foldRead`,
                                                                             `reopens`, `gateCode`, `stamp`, tables
  host/tau-agent-host.ts     appendChatRows (M1's append) of a settlement    → `hostSettle`
  log/segments.ts            mergeLogSegments (CL-R14)                        → `merge`
  log/foreign-runs.ts        foreignRunStanding (XD3)                         → `standing`
  revisions chat-ref.ts      notePull (XD3, round 19)                         → `notePull`, `recordOf`
  host/tau-agent-host.ts     the chat's terms (round 19)                      → `Terms`

Every list is in PHYSICAL (file) order. A row is the trace's `<term> <seq> <run> <kind> <arg> <ms> <epoch>
<attempt>`: `term` is the `leaderEpoch` `e<NN>`, `epoch`/`attempt` 0 mean absent, and `(kind, arg)` names the
row's body (`bodyOf` in the generator). Bytes are abstracted to line counts: a file is its lines and the count of
torn fragments after them, and the appender's size comparison is a comparison of those counts (the file only
grows by whole lines, and only a torn tail is ever truncated).
-/
namespace ChatLedger

/-! ## Rows -/

/-- `W` is the person's turn appended as its run settled before committing it (`abandonedTurnOf`): a user
`message.appended` row whose message id `w-<arg>` names its content, so two devices that append it append the same
message. `C` is that turn as the run's own device said it (a person's `message.appended` with no internal kind): the
row a copy `W` repeats, which merges after the copy when its device's clock ran far ahead. `K` is a history rewind
that retains nothing (`history.rewound` with no retained ids): it removes every message the history holds. `C` and `K`
rows appear only in merge traces. -/
inductive Kind where
  | L | S | H | O | R | P | V | M | U | W | C | K
  deriving DecidableEq, Repr, Inhabited

structure Row where
  term : Nat
  seq : Nat
  run : Nat
  kind : Kind
  arg : Nat
  ms : Nat
  epoch : Nat
  attempt : Nat
  deriving DecidableEq, Repr, Inhabited

abbrev Key := Nat × Nat

/-- `(leaderEpoch, sequence)`. -/
def Row.key (r : Row) : Key := (r.term, r.seq)

/-- Which `arg`s name the same body: `P`/`M` keep `a<arg % 4>` and `arg < 4`, `V` keeps `arg % 16`, `U` has three
bodies. Every other kind's body is injective in `arg`. -/
def canonArg : Kind → Nat → Nat
  | .P, a => if a < 4 then a else 4 + a % 4
  | .M, a => if a < 4 then a else 4 + a % 4
  | .V, a => a % 16
  | .U, a => min a 2
  | .K, _ => 0
  | _, a => a

/-- The row's canonical form (`canonicalJson`): two rows are the same row iff their `fp`s are equal. -/
def Row.fp (r : Row) : Row := { r with arg := canonArg r.kind r.arg }

/-- `classifyLogRow(row).class === 'opaque'`: a newer build's row. -/
def Row.isOpaque (r : Row) : Bool :=
  match r.kind with
  | .U => true
  | _ => false

/-- `parseLogEvent` (the strict write gate) refuses it: a newer version or an unknown value of a known type. An
unknown type (`U 0`) passes whole and is appended as an opaque row. -/
def Row.invalid (r : Row) : Bool := r.isOpaque && canonArg .U r.arg != 0

/-! ## Association lists (JS `Map`/object: lookup, and insertion order) -/

def lookup {β : Type} (k : Nat) : List (Nat × β) → Option β
  | [] => none
  | (k', v) :: rest => if k' = k then some v else lookup k rest

/-- `map.set(k, v)`: in place when present, else at the end. -/
def upsert {β : Type} (k : Nat) (v : β) : List (Nat × β) → List (Nat × β)
  | [] => [(k, v)]
  | (k', v') :: rest => if k' = k then (k, v) :: rest else (k', v') :: upsert k v rest

/-- `delete map[k]`. -/
def erase {β : Type} (k : Nat) : List (Nat × β) → List (Nat × β)
  | [] => []
  | (k', v) :: rest => if k' = k then rest else (k', v) :: erase k rest

/-! ## Code-unit order of generated ids (`i<n>`, `d<n>`, `e<NN>`) -/

def digitsAux : Nat → Nat → List Nat → List Nat
  | 0, _, acc => acc
  | fuel + 1, n, acc => if n < 10 then n :: acc else digitsAux fuel (n / 10) (n % 10 :: acc)

/-- Decimal digits, most significant first. -/
def digits (n : Nat) : List Nat := digitsAux (n + 1) n []

/-- Lexicographic order by an element order; a proper prefix is smaller. -/
def lexBy {α : Type} [DecidableEq α] (lt : α → α → Bool) : List α → List α → Bool
  | [], [] => false
  | [], _ :: _ => true
  | _ :: _, [] => false
  | a :: as, b :: bs => lt a b || (decide (a = b) && lexBy lt as bs)

/-- Code-unit order of digit strings: a proper prefix is smaller (the closing quote or comma sorts below every
digit). -/
def lexLt : List Nat → List Nat → Bool := lexBy (fun a b => decide (a < b))

/-- The order of sort keys: tuples of digit strings, field by field (a number `n` is the field `[n]`). -/
def keyLt : List (List Nat) → List (List Nat) → Bool := lexBy lexLt

/-- `String(a) < String(b)`. -/
def decLt (a b : Nat) : Bool := lexLt (digits a) (digits b)

/-- `padStart(2, '0')`. -/
def pad2 (ds : List Nat) : List Nat := if ds.length < 2 then List.replicate (2 - ds.length) 0 ++ ds else ds

/-- The digits of `e<NN>`. -/
def termId (n : Nat) : List Nat := pad2 (digits n)

/-- `e<NN>` order. -/
def termLt (a b : Nat) : Bool := lexLt (termId a) (termId b)

/-- Stable insertion sort (`toSorted` is stable). -/
def insertBy {α : Type} (lt : α → α → Bool) (x : α) : List α → List α
  | [] => [x]
  | y :: ys => if lt y x then y :: insertBy lt x ys else x :: y :: ys

def isort {α : Type} (lt : α → α → Bool) : List α → List α
  | [] => []
  | x :: xs => insertBy lt x (isort lt xs)

/-- `toSorted` by a comparator that compares a key, field by field. -/
def keySort {α : Type} (κ : α → List (List Nat)) (l : List α) : List α := isort (fun a b => keyLt (κ a) (κ b)) l

/-! ## event-sequence.ts -/

/-- A new term's claim: an epoch above every epoch, or (legacy) none while the whole log is legacy. -/
def claims (maxEpoch epoch : Nat) : Bool := decide (maxEpoch < epoch) || (epoch == 0 && maxEpoch == 0)

inductive Verdict where
  | fresh | dup | mutated | order
  deriving DecidableEq, Repr

/-- `createEventSequence()`. `rows` is `cursorFingerprints` (each committed row, keys unique); `epochs` is
`termEpochs`; `last` is `lastSequence` (read only while `active` is set). -/
structure Seq where
  rows : List Row := []
  epochs : List (Nat × Nat) := []
  active : Option Nat := none
  last : Nat := 0
  maxEpoch : Nat := 0

/-- `violation`: `.dup` is `'duplicate'`, `.mutated` `EVENT_MUTATED`, `.order` `EVENT_OUT_OF_ORDER`. -/
def Seq.verdict (S : Seq) (e : Row) : Verdict :=
  match S.rows.find? (fun x => decide (x.key = e.key)) with
  | some f => if f.fp = e.fp then .dup else .mutated
  | none =>
    if S.active = some e.term then
      if e.seq = S.last + 1 ∧ lookup e.term S.epochs = some e.epoch then .fresh else .order
    else if (lookup e.term S.epochs).isSome then .order
    else if e.seq = 0 ∧ claims S.maxEpoch e.epoch = true then .fresh else .order

/-- `commit`. -/
def Seq.commit (S : Seq) (e : Row) : Seq :=
  { rows := S.rows ++ [e]
    epochs := if (lookup e.term S.epochs).isSome then S.epochs else S.epochs ++ [(e.term, e.epoch)]
    active := some e.term
    last := e.seq
    maxEpoch := max S.maxEpoch e.epoch }

/-! ## reducer.ts: the history rules the generated rows reach -/

/-- A provider message id: `m-<term>-<seq>` (assistant reply), `u-<term>-<seq>-<arg>` (committed user turn) or
`w-<arg>` (a person's turn appended as its run settled, the same id from every device that appends it, and the id of
the run's own row of that turn). -/
def msgId (e : Row) : Option (Nat × Nat × Nat × Nat) :=
  match e.kind with
  | .M => some (0, e.term, e.seq, 0)
  | .H => some (1, e.term, e.seq, e.arg)
  | .W => some (2, e.arg, 0, 0)
  | .C => some (2, e.arg, 0, 0)
  | _ => none

/-- `knownMessageIds`, `preparedInvocations`, `settledInvocations` (attempt ids `a<n>` as `n`), and `copiedTurns`:
the ids the history first took from a copy `W`. `ids` is also the history's messages, in order: every row these traces
reach that removes a message (`K`) removes it from both. `copied` is never cleared, a rewind's included, and keeps
each turn with the run whose copy it was: a later run's row of the same turn (a Retry) is a new message. -/
structure Hist where
  ids : List (Nat × Nat × Nat × Nat) := []
  prepared : List Nat := []
  settled : List Nat := []
  copied : List ((Nat × Nat × Nat × Nat) × Nat) := []

/-- `transitionOf`: `none` is `HISTORY_INVALID`. A person's turn said again is the same message (`turnSaidAgain`, XD3):
a copy `W` of a turn the history holds, or any row of that run's turn it first took from a copy, `W` or the run's own
`C`, changes nothing, whether that turn is still held or a rewind has removed it since (round 17). Another run's row of
the turn after a rewind removed it (a Retry re-admits the person's message) is the message again. A rewind `K` removes
every message. -/
def Hist.transition (h : Hist) (e : Row) : Option Hist :=
  match msgId e with
  | some id =>
    if (e.kind = .W ∨ e.kind = .C) ∧ (id, e.run) ∈ h.copied then some h
    else if id ∈ h.ids then (if e.kind = .W then some h else none)
    else some { h with ids := h.ids ++ [id], copied := if e.kind = .W then h.copied ++ [(id, e.run)] else h.copied }
  | none =>
    match e.kind with
    | .P => if e.arg % 4 ∈ h.prepared then none else some { h with prepared := h.prepared ++ [e.arg % 4] }
    | .V =>
      if e.arg % 4 ∈ h.prepared ∧ e.arg % 4 ∉ h.settled then some { h with settled := h.settled ++ [e.arg % 4] }
      else none
    | .K => some { h with ids := [] }
    | _ => some h

structure Reducer where
  seq : Seq := {}
  hist : Hist := {}
  intact : Bool := true

inductive Anomaly where
  | quarantined | order | conflict | history
  deriving DecidableEq, Repr

/-- `replay` (tolerant): never refuses. A conflicting copy is reported and not committed; after the first rejected
history row the history state is frozen; an opaque row only takes its place in the sequence. -/
def Reducer.replay (R : Reducer) (e : Row) : Reducer × Option Anomaly :=
  match R.seq.verdict e with
  | .dup => (R, none)
  | .mutated => (R, some .conflict)
  | v =>
    let R1 := { R with seq := R.seq.commit e }
    let a := if v = .order then some Anomaly.order else none
    if e.isOpaque || !R.intact then (R1, a)
    else
      match R.hist.transition e with
      | some h => ({ R1 with hist := h }, a)
      | none => ({ R1 with intact := false }, some .history)

inductive Refusal where
  | invalid | mutated | order | history | fenced
  deriving DecidableEq, Repr

/-- `prepare` + `commit` (strict): `.ok none` is a duplicate. -/
def Reducer.prepare (R : Reducer) (e : Row) : Except Refusal (Option Reducer) :=
  match R.seq.verdict e with
  | .dup => .ok none
  | .mutated => .error .mutated
  | .order => .error .order
  | .fresh =>
    if e.isOpaque then .ok (some { R with seq := R.seq.commit e })
    else
      match R.hist.transition e with
      | some h => .ok (some { R with seq := R.seq.commit e, hist := h })
      | none => .error .history

/-! ## event-log-appender.ts and serialization.ts -/

inductive Line where
  | row (r : Row)
  | junk
  deriving DecidableEq, Repr

/-- The log file: complete lines, then `torn` torn fragments (an unterminated tail). -/
structure File where
  lines : List Line := []
  torn : Nat := 0
  deriving DecidableEq, Repr

/-- `parseEventLogBytes(...).events`: the kept rows (junk is quarantined, the torn tail discarded). -/
def rowsOf : List Line → List Row
  | [] => []
  | .row r :: ls => r :: rowsOf ls
  | .junk :: ls => rowsOf ls

def File.rows (F : File) : List Row := rowsOf F.lines

/-- Another writer's line: its own guarded append first repairs the torn tail. -/
def File.write (F : File) (l : Line) : File := { lines := F.lines ++ [l], torn := 0 }

/-- A torn append: a fragment with no newline. -/
def File.tear (F : File) : File := { F with torn := F.torn + 1 }

/-- One appender. `lines` is `byteLength` (the lines its view covers), `torn` the torn tail it saw at open. -/
structure App where
  red : Reducer := {}
  view : List Row := []
  lines : Nat := 0
  torn : Nat := 0
  fenced : Bool := false

/-- Replay rows in order (the open's loop): the reducer after them, and each row's anomaly. -/
def replayLog : Reducer → List Row → Reducer × List Anomaly
  | R, [] => (R, [])
  | R, e :: es =>
    let (R1, a) := R.replay e
    let (R2, as) := replayLog R1 es
    (R2, a.toList ++ as)

/-- `createEventLogAppender`: tolerant, writes nothing. -/
def openApp (F : File) : App :=
  { red := (replayLog {} F.rows).1, view := F.rows, lines := F.lines.length, torn := F.torn }

/-- The anomalies an open reports: quarantined lines, then each row's replay anomaly. -/
def openAnomalies (F : File) : List Anomaly :=
  (F.lines.filter (fun l => decide (l = .junk))).map (fun _ => Anomaly.quarantined) ++ (replayLog {} F.rows).2

/-- The guarded section's test: the file is exactly this appender's view, or that plus the torn tail it saw. -/
def current (F : File) (A : App) : Bool :=
  decide (F.lines.length = A.lines) && (decide (F.torn = 0) || decide (F.torn = A.torn))

inductive Outcome where
  | appended | duplicate | refused (r : Refusal)
  deriving DecidableEq, Repr

/-- `append`: the fenced flag, the strict parse, the term rules (a duplicate returns before any fence check), the
history rules, then the guarded append. A stale view is `LOG_FENCED` for good. -/
def append (F : File) (A : App) (e : Row) : File × App × Outcome :=
  if A.fenced then (F, A, .refused .fenced)
  else if e.invalid then (F, A, .refused .invalid)
  else
    match A.red.prepare e with
    | .error r => (F, A, .refused r)
    | .ok none => (F, A, .duplicate)
    | .ok (some R') =>
      if current F A then
        ({ lines := F.lines ++ [.row e], torn := 0 },
         { A with red := R', view := A.view ++ [e], lines := A.lines + 1, torn := 0 }, .appended)
      else (F, { A with fenced := true }, .refused .fenced)

/-- One read's answer: a batch, or a refusal (`ahead` is `cursor-ahead`, else `identity-mismatch`). -/
inductive Answer where
  | batch (cursor next finish : Nat) (events : List Row)
  | refused (ahead : Bool) (finish : Nat) (last : Option Key)

/-- `byteBounded`: the longest prefix within `budget`, always at least one row; `size i` is row `i`'s bytes. -/
def byteBounded (size : Nat → Nat) (budget : Nat) : Nat → Nat → List Row → List Row → List Row
  | _, _, taken, [] => taken
  | i, total, taken, e :: es =>
    if total + size i > budget ∧ taken ≠ [] then taken
    else byteBounded size budget (i + 1) (total + size i) (taken ++ [e]) es

/-- `readBatch({cursor, limit, maxBytes, last})` over a view. -/
def readBatch (view : List Row) (cursor limit : Nat) (maxBytes : Option Nat) (last : Option Key)
    (size : Nat → Nat := fun _ => 0) : Answer :=
  if cursor > view.length then .refused true view.length none
  else
    let prior := if cursor = 0 then none else (view[cursor - 1]?).map Row.key
    if last.isSome ∧ prior ≠ last then .refused false view.length prior
    else
      let window := (view.drop cursor).take limit
      let events := match maxBytes with
        | none => window
        | some m => byteBounded size m cursor 0 [] window
      .batch cursor (cursor + events.length) view.length events

/-- A version-1 server's read of `view` (`DELIVER1`): a cursor past the end is clamped. -/
def v1Read (view : List Row) (requested limit : Nat) : Answer :=
  let at_ := min requested view.length
  let events := (view.drop at_).take limit
  .batch at_ (at_ + events.length) view.length events

/-! ## chat-ledger.ts -/

/-- A failure's class, as `isResumableRun` reads its code: `fatal` never resumes; `gateway` is a registry-resumable
model-call failure; `abandoned` is `RUN_ABANDONED`, the host's record that the run's driver is gone; `agentStop` is an
external agent's own stop whose actions say it can retry (`externalStopIsResumable`). -/
inductive Fail where
  | fatal | gateway | abandoned | agentStop
  deriving DecidableEq, Repr, Inhabited

/-- `RunLifecycleState`; `failed c`: `c` classes the row's `detail`; `cancelled u`: `u` is a deliberate Stop, the row's
`detail.code` is `USER_STOPPED`. -/
inductive Life where
  | admitted | running | paused | completed | failed (cls : Fail) | cancelled (userStopped : Bool)
  deriving DecidableEq, Repr, Inhabited

/-- The generator's `lifeStates[arg]` (4: `FATAL_TEST`, 5: `RATE_LIMITED`, 7: `USER_STOPPED`, 8: `RUN_ABANDONED`,
9: `EXTERNAL_AGENT_FAILED` with a `retry` action). -/
def lifeOf : Nat → Life
  | 0 => .admitted
  | 1 => .running
  | 2 => .paused
  | 3 => .completed
  | 4 => .failed .fatal
  | 5 => .failed .gateway
  | 7 => .cancelled true
  | 8 => .failed .abandoned
  | 9 => .failed .agentStop
  | _ => .cancelled false

/-- `endedStates`. -/
def Life.ended : Life → Bool
  | .completed => true
  | .failed _ => true
  | .cancelled _ => true
  | _ => false

inductive AState where
  | unadmitted | open_ | terminal | settled
  deriving DecidableEq, Repr

structure Settlement where
  attempt : Nat
  row : Key
  body : Nat
  deriving DecidableEq, Repr

/-- `RunEntry`. `external` is `kind: 'external'` and `prompted` its `externalPrompted`, both from the last external
turn marker; `pending` maps `i<n>` to its row. -/
structure Entry where
  attempt : Nat := 1
  life : Option Life := none
  append : AState := .unadmitted
  committed : Bool := false
  external : Bool := false
  prompted : Bool := false
  settlements : List Settlement := []
  pending : List (Nat × Key) := []
  resolved : List Nat := []
  openInv : Option Nat := none
  unreadable : Bool := false
  deriving Repr

/-- `InvocationEntry`; `settled` is the outcome's index in `settled, released, absorbed, voided`. -/
structure Invocation where
  run : Nat
  attempt : Nat
  generation : Bool
  shown : Bool := false
  settled : Option Nat := none
  deriving DecidableEq, Repr

inductive AnomalyKind where
  | opaqueRow | quarantined | order | conflict
  deriving DecidableEq, Repr

/-- `ChatLedger`. `terms` maps a term to `(epoch, lastSequence)`. -/
structure Ledger where
  /-- Last nonduplicate semantic term; independent of the physical read boundary. -/
  semanticTerm : Option Nat := none
  cursor : Nat := 0
  last : Option Key := none
  terms : List (Nat × (Nat × Nat)) := []
  maxEpoch : Nat := 0
  current : Option Nat := none
  runs : List (Nat × Entry) := []
  invs : List (Nat × Invocation) := []
  lastTerminal : Option (Nat × Life) := none
  intact : Bool := true
  anomalies : List (AnomalyKind × Key) := []

/-- `runs[r] ?? stubEntry()`. -/
def Ledger.entry (L : Ledger) (r : Nat) : Entry := (lookup r L.runs).getD {}

/-- `entryOf(r)` written back. -/
def Ledger.put (L : Ledger) (r : Nat) (en : Entry) : Ledger := { L with runs := upsert r en L.runs }

def Ledger.note (L : Ledger) (k : AnomalyKind) (key : Key) : Ledger :=
  { L with anomalies := L.anomalies ++ [(k, key)] }

/-- `attemptEnded`: a terminal row, or a native pause (an external agent's pause keeps its attempt open). -/
def attemptEnded (en : Entry) : Bool :=
  match en.life with
  | some .paused => !en.external
  | some l => l.ended
  | none => false

/-- Which failures `continue` resumes, by run kind (`isResumableRun`): a Tau run resumes a gateway failure or an
abandoned driver; an external run resumes an abandoned driver or the agent's own retryable stop — exactly what the ACP
runner continues (`stopRecorded`), so no surface offers a Resume the runner refuses. -/
def failRests (external : Bool) : Fail → Bool
  | .abandoned => true
  | .gateway => !external
  | .agentStop => external
  | .fatal => false

/-- The lifecycle half of the reopen predicate: a resumable failure, a deliberate Stop that kept its committed turn
(`isUserStoppedRun`: an external one only once its prompt was issued), or a pause with no pending request. -/
def rests (en : Entry) : Bool :=
  match en.life with
  | some (.failed c) => failRests en.external c
  | some (.cancelled true) => en.committed && (!en.external || en.prompted)
  | some .paused => en.pending.isEmpty
  | _ => false

def reopenable (en : Entry) : Bool := attemptEnded en && rests en

/-- `reopens(entry, row)`: THE reopen predicate (I10, CL-R9); `attempt` 0 is a legacy row's absent attempt. Settled or
not: every reopening row opens the next attempt (`ChatRunSlot.tla`'s `Att(T)+1`; W7.r1 finding 1). -/
def reopens (en : Entry) (state : Life) (attempt : Nat) : Bool :=
  decide (state = .running) && (decide (attempt = 0) || decide (attempt = en.attempt + 1)) && reopenable en

def settledFor (en : Entry) (a : Nat) : Bool := en.settlements.any (fun s => decide (s.attempt = a))

/-- The attempt a non-`admitted` lifecycle row leaves the run on: a first row takes its stated attempt (or 1), a
reopening row the next attempt, any other row the current one. -/
def nextAttempt (en : Entry) (s : Life) (stated : Nat) : Nat :=
  if en.life.isNone then (if stated = 0 then 1 else stated)
  else if reopens en s stated then en.attempt + 1 else en.attempt

/-- `lifecycle(event, key)`. -/
def Ledger.lifecycle (L0 : Ledger) (e : Row) : Ledger :=
  let en := L0.entry e.run
  let L := { L0 with current := some e.run }
  let s := lifeOf e.arg
  if s = .admitted then
    if en.life.isSome then (L.put e.run en).note .order e.key
    else L.put e.run { en with attempt := 1, life := some .admitted,
                               append := if settledFor en 1 then .settled else .open_ }
  else
    let att := nextAttempt en s e.attempt
    let bad := en.life.isNone || (!reopens en s e.attempt && e.attempt != 0 && e.attempt != en.attempt)
    let L1 := if bad then L.note .order e.key else L
    let en1 : Entry := { en with attempt := att, life := some s }
    let en2 : Entry := { en1 with
      append := if settledFor en1 att then .settled else if attemptEnded en1 then .terminal else .open_ }
    let L2 := L1.put e.run en2
    if s.ended then { L2 with lastTerminal := some (e.run, s) } else L2

/-- The attempt a settlement row names: its own, or (legacy) the run's current one. -/
def Entry.attemptOf (en : Entry) (stated : Nat) : Nat := if stated = 0 then en.attempt else stated

/-- The recorded settlement of attempt `a`, if any. -/
def Entry.settlementOf (en : Entry) (a : Nat) : Option Settlement := en.settlements.find? (fun s => decide (s.attempt = a))

/-- Push a settlement; it settles the current attempt of an admitted run. -/
def Entry.addSettlement (en : Entry) (s : Settlement) : Entry :=
  { en with settlements := en.settlements ++ [s],
            append := if s.attempt = en.attempt ∧ en.life.isSome then .settled else en.append }

/-- `settlement(event, key)`: one settlement per attempt; a differing second is a conflict and is not kept. -/
def Ledger.settle (L : Ledger) (e : Row) : Ledger :=
  let en := L.entry e.run
  match en.settlementOf (en.attemptOf e.attempt) with
  | some p =>
    let L := L.put e.run en
    if p.body = e.arg then L else L.note .conflict e.key
  | none => L.put e.run (en.addSettlement ⟨en.attemptOf e.attempt, e.key, e.arg⟩)

/-- Drop the run's `openInvocation` when it is `a`. -/
def Ledger.closeInv (L : Ledger) (run a : Nat) : Ledger :=
  match lookup run L.runs with
  | some en => if en.openInv = some a then L.put run { en with openInv := none } else L
  | none => L

/-- `markShown(a)`. -/
def Ledger.markShown (L : Ledger) (a : Nat) : Ledger :=
  match lookup a L.invs with
  | none => L
  | some inv => if inv.shown then L else (({ L with invs := upsert a { inv with shown := true } L.invs } : Ledger).closeInv inv.run a)

/-- `known(event, key)`. -/
def Ledger.known (L : Ledger) (e : Row) : Ledger :=
  match e.kind with
  | .L => L.lifecycle e
  | .S => L.settle e
  | .H =>
    let en := L.entry e.run
    L.put e.run { en with committed := true, external := en.external || decide (e.arg ≥ 3),
                          prompted := if e.arg ≥ 3 then decide (e.arg = 4) else en.prompted }
  | .O => let en := L.entry e.run; L.put e.run { en with pending := upsert e.arg e.key en.pending }
  | .R =>
    let en := L.entry e.run
    let en := { en with pending := erase e.arg en.pending }
    L.put e.run { en with resolved := e.arg :: en.resolved }
  | .P =>
    match lookup (e.arg % 4) L.invs with
    | some _ => L.note .conflict e.key
    | none =>
      let en := L.entry e.run
      { L.put e.run { en with openInv := some (e.arg % 4) } with
        invs := upsert (e.arg % 4) ⟨e.run, en.attempt, decide (e.arg < 4), false, none⟩ L.invs }
  | .V =>
    match lookup (e.arg % 4) L.invs with
    | none => L.note .conflict e.key
    | some inv =>
      if inv.settled.isSome then L.note .conflict e.key
      else ({ L with invs := upsert (e.arg % 4) { inv with settled := some (e.arg / 4 % 4) } L.invs } : Ledger).closeInv
        inv.run (e.arg % 4)
  | .M => if e.arg < 4 then L.markShown (e.arg % 4) else L
  | .U => L
  | .W => let en := L.entry e.run; L.put e.run { en with committed := true }
  | .C => L
  | .K => L

/-- The term rules' bookkeeping for a row that is not a redelivery: its anomaly, its term, the position. -/
def Ledger.book (L0 : Ledger) (e : Row) (broken : Bool) (ep : Nat) : Ledger :=
  let L1 := if broken then L0.note .order e.key else L0
  { L1 with terms := upsert e.term (ep, e.seq) L1.terms, maxEpoch := max L1.maxEpoch e.epoch,
            cursor := L1.cursor + 1, last := some e.key, semanticTerm := some e.term }

/-- An opaque row: its run is unreadable, and an opaque history row breaks the history. -/
def Ledger.markOpaque (L : Ledger) (e : Row) : Ledger :=
  let en := L.entry e.run
  let L2 := (L.put e.run { en with unreadable := true }).note .opaqueRow e.key
  if canonArg .U e.arg = 1 then { L2 with intact := false } else L2

/-- The bookkeeping, then the row's facts. -/
def Ledger.advance (L : Ledger) (e : Row) (broken : Bool) (ep : Nat) : Ledger :=
  if e.isOpaque then (L.book e broken ep).markOpaque e else (L.book e broken ep).known e

/-- One `step`: `none` is a redelivery (a sequence at or below its term's last folded one), which changes nothing. -/
def Ledger.step (L : Ledger) (e : Row) : Option Ledger :=
  match lookup e.term L.terms with
  | some (ep, ls) =>
    if e.seq ≤ ls then none
    else some (L.advance e (L.semanticTerm ≠ some e.term ∨ e.seq ≠ ls + 1 ∨ e.epoch ≠ ep) ep)
  | none => some (L.advance e (e.seq ≠ 0 ∨ claims L.maxEpoch e.epoch = false) e.epoch)

def Ledger.stepD (L : Ledger) (e : Row) : Ledger := (L.step e).getD L

/-- `foldChatLedger(ledger, rows)`. -/
def fold (L : Ledger) (rows : List Row) : Ledger := rows.foldl Ledger.stepD L

inductive Reset where
  | cursorAhead | identityMismatch | clamped
  deriving DecidableEq, Repr

inductive ReadFold where
  | folded (L : Ledger)
  | stale
  | reset (r : Reset)

/-- `foldReadAnswer`: fold only a batch that starts at the reader's cursor; detect a clamp; reset on a refusal. -/
def foldRead (L : Ledger) : Answer → ReadFold
  | .refused ahead _ _ => .reset (if ahead then .cursorAhead else .identityMismatch)
  | .batch c n f evs =>
    if c ≠ L.cursor then (if c < L.cursor ∧ c = f ∧ evs = [] then .reset .clamped else .stale)
    else if n ≠ c + evs.length ∨ f < n then .stale
    else
      match evs.getLast? with
      | none => .folded L
      | some x => .folded { fold L evs with cursor := n, last := some x.key }

inductive HState where
  | none | reserved | admitted | running | paused | terminal
  deriving DecidableEq, Repr

/-- `chatRunState`. -/
def chatRunState (L : Ledger) : HState :=
  match L.current with
  | none => .none
  | some r =>
    match (L.entry r).life with
    | none => .none
    | some .admitted => .admitted
    | some .running => .running
    | some .paused => .paused
    | some _ => .terminal

inductive Replayed where
  | admit | resume | settled | recover
  deriving DecidableEq, Repr

/-- `replayedStartOutcome`. -/
def replayedStart (L : Ledger) (r : Nat) : Replayed :=
  let en := L.entry r
  match en.life with
  | none => .admit
  | some l =>
    if en.committed then (if l.ended then .settled else .resume) else (if l.ended then .resume else .recover)

/-- `unsettledAttempts`. -/
def unsettled (L : Ledger) : List (Nat × Nat) :=
  L.runs.filterMap fun (r, en) => if en.append = .terminal then some (r, en.attempt) else none

/-! ### The legality tables (`run-*.legality.json`) -/

/-- Refusal codes (the registry) and `ok`. -/
inductive Code where
  | ok | chatRunLive | noRunAdmitted | runIdTaken | settlementWithoutRun | settlementConflict | invocationUnresolved
  | interruptAlreadyResolved
  deriving DecidableEq, Repr

inductive Cond where
  | unadmitted | open_ | ended | settledOpen | settled | reopenable | pausedReopenable
  deriving DecidableEq, Repr

inductive LOp where
  | admitted | running | paused | completed | failed | cancelled
  deriving DecidableEq, Repr

inductive ROp where
  | admit | resume
  deriving DecidableEq, Repr

def Life.op : Life → LOp
  | .admitted => .admitted
  | .running => .running
  | .paused => .paused
  | .completed => .completed
  | .failed _ => .failed
  | .cancelled _ => .cancelled

/-- `run-lifecycle.legality.json`. -/
def lifecycleTable : Cond → LOp → Code
  | .unadmitted, .admitted => .ok
  | .unadmitted, _ => .noRunAdmitted
  | .settled, _ => .runIdTaken
  | .reopenable, .running => .ok
  | .reopenable, _ => .runIdTaken
  | .pausedReopenable, .running => .ok
  | .pausedReopenable, .cancelled => .ok
  | .pausedReopenable, _ => .runIdTaken
  | _, .admitted => .runIdTaken
  | _, _ => .ok

/-- `run-operation.legality.json`. -/
def operationTable : HState → ROp → Code
  | .none, .admit => .ok
  | .none, .resume => .noRunAdmitted
  | .reserved, _ => .chatRunLive
  | .terminal, _ => .ok
  | _, .admit => .chatRunLive
  | _, .resume => .ok

/-- `run-settlement.legality.json`. -/
def settlementTable : AState → Code
  | .unadmitted => .settlementWithoutRun
  | .open_ => .ok
  | .terminal => .ok
  | .settled => .settlementConflict

/-- A settled reopenable run's state: a native pause with nothing pending may also be cancelled (V8). -/
def reopenableCond (en : Entry) : Cond :=
  match en.life with
  | some .paused => .pausedReopenable
  | _ => .reopenable

/-- `lifecycleCondition`. -/
def condition (en : Entry) : Cond :=
  if en.life.isNone then .unadmitted
  else if en.append ≠ .settled then (if attemptEnded en then .ended else .open_)
  else if !attemptEnded en then .settledOpen
  else if reopenable en then reopenableCond en else .settled

/-- `gateCode(ledger, row, invocations)`. -/
def gateCode (L : Ledger) (e : Row) (invocations : Bool) : Code :=
  let en := L.entry e.run
  match e.kind with
  | .L =>
    let s := lifeOf e.arg
    let c := lifecycleTable (condition en) s.op
    if c ≠ .ok then c
    else
      let opens := decide (s = .admitted) || reopens en s e.attempt
      if opens ∧ L.current.isSome ∧ L.current ≠ some e.run ∧ chatRunState L ≠ .none ∧ chatRunState L ≠ .terminal
      then .chatRunLive else .ok
  | .S =>
    let a := en.attemptOf e.attempt
    match en.settlementOf a with
    | some p => if p.body = e.arg then .ok else .settlementConflict
    | none =>
      settlementTable (if en.life.isNone ∨ a > en.attempt then .unadmitted
        else if a < en.attempt ∨ en.append = .settled then .settled else en.append)
  | .R => if e.arg ∈ en.resolved then .interruptAlreadyResolved else .ok
  | .P =>
    if invocations ∧ e.arg < 4 then
      let first := !L.invs.any (fun (_, i) => decide (i.run = e.run ∧ i.attempt = en.attempt))
      let blocked := if first then L.invs.any (fun (_, i) => !i.shown && i.settled.isNone)
        else L.invs.any (fun (_, i) => !i.shown && i.settled.isNone && decide (i.run = e.run) && i.generation)
      if blocked then .invocationUnresolved else .ok
    else .ok
  | _ => .ok

/-- `isRepeatSettlement`. -/
def isRepeat (L : Ledger) (e : Row) : Bool :=
  match e.kind with
  | .S =>
    let en := L.entry e.run
    match en.settlementOf (en.attemptOf e.attempt) with
    | some p => decide (p.body = e.arg)
    | none => false
  | _ => false

/-- `stampRows` for one body `(kind, arg)` of run `run` under a new writer's term `term`. -/
def stamp (L : Ledger) (term run : Nat) (kind : Kind) (arg ms : Nat) : Row :=
  let (epoch, seq) := match lookup term L.terms with
    | none => (L.maxEpoch + 1, 0)
    | some (ep, ls) => (ep, ls + 1)
  let en := L.entry run
  let attempt := match kind with
    | .L => if lifeOf arg = .admitted then 1 else if reopens en (lifeOf arg) 0 then en.attempt + 1 else en.attempt
    | .S => en.attempt
    | _ => 0
  { term, seq, run, kind, arg, ms, epoch, attempt }

inductive Settled where
  | code (c : Code)
  | appended
  | skipped
  | refused (r : Refusal)

/-- The host's `appendChatRows` (M1's append) of one settlement row under a new term: stamp (`e99`), gate
`{invocations: false}`, drop an exact repeat, then append through the appender. -/
def hostSettle (F : File) (run c : Nat) : Settled :=
  let A := openApp F
  let L := fold {} A.view
  let e := stamp L 99 run .S c 999999
  match gateCode L e false with
  | .ok =>
    if isRepeat L e then .skipped
    else
      match (append F A e).2.2 with
      | .appended => .appended
      | .duplicate => .skipped
      | .refused r => .refused r
  | c => .code c

/-! ## tau-agent-host.ts: a command that runs or continues a run, across devices (XD1, XD3; round 17) -/

/-- The commands admitted across devices: a turn's start, a Resume, and an approval of a paused run's request (a
denial or a cancellation ends the run, and a Stop is never held back). -/
inductive Verb where
  | start | resume | approve
  deriving DecidableEq, Repr

/-- `TermAdmission`: refused `RUN_TAKEN_OVER`; admitted under a new term opened before its rows (`rowsTerm`); or admitted
under the term the incarnation holds. -/
inductive Admission where
  | takenOver | newTerm | sameTerm
  deriving DecidableEq, Repr

/-- `termAdmission(verb, {takenOver, foreignWrote})`. `takenOver`: another device's segment says the run's turn
(`runTakenOver`): it found the run abandoned and went on, so an approval would let the tool act on a project that
device has changed since. `wrote`: this device read another device's rows since the incarnation's term began
(`foreignWroteSinceTermBegan`), so rows under that term would merge ahead of them. An approval continues the run: past
the takeover it is admitted exactly as a Resume is. -/
def admission (v : Verb) (takenOver wrote : Bool) : Admission :=
  if v = .approve ∧ takenOver = true then .takenOver
  else if wrote then .newTerm else .sameTerm

/-- The term an admitted command's rows are written under (round 18): `held` is the term the chat's incarnation holds,
`fresh` one this device opens after what it read. A new term is opened before the command's rows whether or not the
incarnation holds its run's slot (an external agent waiting on its person does), and never falls back to the old one;
nothing here closes the incarnation. -/
def rowsTerm (a : Admission) (_slotHeld : Bool) (held fresh : Nat) : Nat :=
  match a with
  | .newTerm => fresh
  | _ => held

/-! ## tau-agent-host.ts: a chat's terms on this host (round 19) -/

/-- A chat's terms while its incarnation stays open (`ChatTerms`): `held` is the incarnation's own term; `opened` a term
this host opened in its place, which a row written under it committed; `proposed` the terms admitted commands opened
for their runs' rows, each `(admission, run, term)` (round 22: keyed by the admission that proposed it, never by the
command's id, which a re-sent copy shares), which only that run's first row (never a heartbeat) commits;
`wrote` the term this host last wrote the chat under. -/
structure Terms where
  held : Nat
  opened : Option Nat := none
  proposed : List (Nat × Nat × Nat) := []
  wrote : Option Nat := none
  deriving DecidableEq, Repr

/-- `chatTermOf`: the chat's term now, the one heartbeats and the term check read. A proposal is no part of it. -/
def Terms.term (s : Terms) : Nat := s.opened.getD s.held

/-- The proposal a batch of `run`'s rows (`heartbeat`: a lone `run.heartbeat`) commits: the first for its run. -/
def Terms.taken (s : Terms) (run : Nat) (heartbeat : Bool) : Option (Nat × Nat × Nat) :=
  if heartbeat then none else s.proposed.find? (fun p => p.2.1 == run)

/-- `writtenTermOf`: the term a batch is written under. -/
def Terms.rowsTerm (s : Terms) (run : Nat) (heartbeat : Bool) : Nat :=
  match s.taken run heartbeat with
  | some p => p.2.2
  | none => s.term

inductive TermOp where
  /-- An admission opens `fresh` for its `run`'s rows (`rehome`). -/
  | propose (admission run fresh : Nat)
  /-- A batch of `run`'s rows is written. -/
  | write (run : Nat) (heartbeat : Bool)
  /-- The admitted command is answered: `applied`, or refused or superseded. -/
  | answer (admission : Nat) (applied : Bool)
  deriving DecidableEq, Repr

/-- `termsAfterWrite` (round 20): a batch of `run`'s rows written from `begun`, the terms as its write began
(`termWriteOf`), ends on `s`, the terms now. It commits exactly what it decided as it began: the proposal it was written
under, which is the chat's term from then on, and the term it was written under as the one this host last wrote, however
many proposals were made or withdrawn while it was written. -/
def Terms.finish (s begun : Terms) (run : Nat) (heartbeat : Bool) : Terms :=
  match begun.taken run heartbeat with
  | some p => { s with opened := some p.2.2, proposed := s.proposed.erase p, wrote := some p.2.2 }
  | none => { s with wrote := some begun.term }

/-- `termsAfter…`: one step. A batch's write commits the proposal it is written under; a command answered other than
applied withdraws its proposal, so nothing of it is left, and nothing of any other command's. -/
def Terms.step (s : Terms) : TermOp → Terms
  | .propose c r f => { s with proposed := s.proposed ++ [(c, r, f)] }
  | .write r hb => s.finish s r hb
  | .answer c applied => if applied then s else { s with proposed := s.proposed.filter (fun p => p.1 != c) }

def Terms.run (s : Terms) (ops : List TermOp) : Terms := ops.foldl Terms.step s

/-- `heartbeatTarget`'s term: a heartbeat is written only under the chat's term, and only once this host wrote under it
(a heartbeat never opens a term). -/
def Terms.heartbeat (s : Terms) : Option Nat := if s.wrote = some s.term then some s.term else none

/-! ## tau-agent-host.ts: one admission for every command that starts or continues a run (round 20) -/

/-- Another device's unsettled run as an admission reads it (`PassedRun`): abandoned or not (`standing`), whether a
device already said its turn (`takenOver`), and whether its person's words are known. -/
structure Passed where
  run : Nat
  abandoned : Bool
  said : Bool
  words : Bool
  deriving DecidableEq, Repr

/-- What the one admission answers (`CommandAdmission`): refused `RUN_TAKEN_OVER`; refused while another device's run
holds the chat (`RUN_ACTIVE_ON_ANOTHER_DEVICE`); or admitted, with the runs whose turns its first batch says. -/
inductive Admit where
  | takenOver
  | held
  | admitted (a : Admission) (says : List Nat)
  deriving DecidableEq, Repr

/-- `commandAdmission`: the one admission of a start, a Resume and an approval. It checks where the run and the other
devices' runs stand, decides the term (`admission`), and names the abandoned foreign runs it goes on past whose turns
no device said yet: the command's first batch says each, so every device then reads that run taken over. -/
def admit (v : Verb) (takenOver wrote : Bool) (foreign : List Passed) : Admit :=
  match admission v takenOver wrote with
  | .takenOver => .takenOver
  | a =>
    if foreign.any (fun f => !f.abandoned) then .held
    else .admitted a ((foreign.filter (fun f => f.words && !f.said)).map Passed.run)

/-- What admitted commands' runs' first batches carry (`ChatStore.carried`): each `(admission, run, says)`, keyed by the
admission that derived it (round 22), never by the command's id, which a re-sent copy of the command shares. -/
abbrev Carried := List (Nat × Nat × List Nat)

/-- The entry a batch of `run`'s rows carries: the first for its run, never for a lone heartbeat. -/
def carriedTaken (c : Carried) (run : Nat) (heartbeat : Bool) : Option (Nat × Nat × List Nat) :=
  if heartbeat then none else c.find? (fun p => p.2.1 == run)

inductive CarryOp where
  /-- An admission's run's first batch is to say `says` (`rehome`). -/
  | carry (admission run : Nat) (says : List Nat)
  /-- A batch of `run`'s rows is written, with a place for what it carries (`carriedPlace`, round 21). -/
  | write (run : Nat) (heartbeat : Bool)
  /-- A batch of `run`'s rows is written that has no place for what it carries: every place in it leaves a tool call
  open (an approval's rows before its tool returns), so its turns wait for the run's next batch (round 21). -/
  | hold (run : Nat)
  /-- A row settles `run` (round 22): nothing writes its rows again. -/
  | settle (run : Nat)
  /-- The admitted command is answered. -/
  | answer (admission : Nat) (applied : Bool)
  deriving DecidableEq, Repr

/-- One step (`carriedAfterRow`, `carriedAfterAnswer`), and the runs whose turns its batch says: a write with a place
says what its run's entry carries and spends it; a batch with none keeps it; a row that settles a run drops every entry
for it, which the chat's next admission derives afresh (round 22); a command answered other than applied withdraws its
own admission's entry. -/
def carryStep (c : Carried) : CarryOp → Carried × List Nat
  | .carry k r says => (c ++ [(k, r, says)], [])
  | .write r hb =>
    match carriedTaken c r hb with
    | some p => (c.erase p, p.2.2)
    | none => (c, [])
  | .hold _ => (c, [])
  | .settle r => (c.filter (fun p => p.2.1 != r), [])
  | .answer k applied => (if applied then c else c.filter (fun p => p.1 != k), [])

/-- A command as it reaches this host's admission (`execute`, round 22). `seen`: the commands this host sent on that
are in flight or applied. A command among them is a replay: it is never admitted, so it carries nothing and holds no
admission its answer could withdraw, and it shares its original's answer. Any other is admitted as the fresh admission
`next`. Answers the admission, if any, and what admitted commands carry then. -/
def admitCarry (c : Carried) (seen : List Nat) (next command run : Nat) (says : List Nat) : Option Nat × Carried :=
  if seen.contains command then (none, c) else (some next, (carryStep c (.carry next run says)).1)

/-- A dispatch's answer (`withdrawAdmission`): by its own admission, and nothing for a dispatch this host never
admitted (a replay). -/
def answerCarry (c : Carried) (admission : Option Nat) (applied : Bool) : Carried :=
  match admission with
  | none => c
  | some k => (carryStep c (.answer k applied)).1

/-- What an approval's check answers when another device's segment could not be read (round 22): refused
`SEGMENTS_UNREADABLE` (`wait`), whatever the pause's hold. Another device judges this device's paused run abandoned on
its own pulls of the remote's copy of this device's segment, and this device cannot know when its rows last reached
that copy (a publish is answered once queued), so the hold is no evidence that no device has. -/
inductive Unread where
  | refused
  | admitted
  deriving DecidableEq, Repr

def approveUnread (_pauseHeld : Bool) : Unread := .refused

/-! ## run-history.ts and tau-agent-host.ts: the history is well formed (round 21)

The model's history is a list of messages the provider reads in order. It is well formed when every tool output
follows its call directly: it answers a call of the assistant turn that only outputs follow, before any other message.
A call left open when another message follows is answered by the provider's adapter as having no result
(`transformMessages`), but an output written after that message is a stray result every provider rejects. A batch's
own rows keep the history well formed by their kinds; the turns a command carries go where no call is open, after
every rewind of the batch. -/

/-- A history message as the provider reads it (`ProviderMessage`): an assistant turn calling the tools `calls` (none:
a reply), a tool's output for call `c`, or any other message `id` (a person's words, a reminder). -/
inductive Msg where
  | call (calls : List Nat)
  | out (c : Nat)
  | say (id : Nat)
  deriving DecidableEq, Repr

/-- The calls open after one more message (`openToolCalls`): an assistant turn opens its own and leaves any before it
to the adapter; an output closes its call; any other message leaves every open call to the adapter. -/
def openAfter (o : List Nat) : Msg → List Nat
  | .call cs => cs
  | .out c => o.erase c
  | .say _ => []

/-- `openToolCalls`: the calls the history leaves open at its tail. -/
def openCalls (h : List Msg) : List Nat := h.foldl openAfter []

/-- Whether a message may follow a history whose open calls are `o`: an output only for an open call. -/
def Msg.fits (o : List Nat) : Msg → Bool
  | .out c => o.contains c
  | _ => true

/-- `historyWellFormed`, from the open calls `o`. -/
def wfFrom : List Nat → List Msg → Bool
  | _, [] => true
  | o, m :: rest => m.fits o && wfFrom (openAfter o m) rest

def wf (h : List Msg) : Bool := wfFrom [] h

/-- A batch's row as it changes the history: a message appended; a rewind that keeps the first `keep` messages it
names (`history.rewound`, and a turn's projection commit or a compaction, which drop what they do not keep); or a row
that is no message (a lifecycle or interrupt row). A rewind names the messages it keeps when its batch is built, before
anything is carried into it. -/
inductive Op where
  | msg (m : Msg)
  | rewind (keep : Nat)
  | other
  deriving DecidableEq, Repr

def Op.apply (h : List Msg) : Op → List Msg
  | .msg m => h ++ [m]
  | .rewind k => h.take k
  | .other => h

def Op.isRewind : Op → Bool
  | .rewind _ => true
  | _ => false

def applyAll (h : List Msg) (ops : List Op) : List Msg := ops.foldl Op.apply h

/-- `saysNext` (round 23): whether the next message the rows append is a say. A say leaves every open call to the
adapter, so turns carried just before it leave the same calls to the adapter it did, and no output follows them. -/
def nextSays : List Op → Bool
  | [] => false
  | .msg (.say _) :: _ => true
  | .msg _ :: _ => false
  | _ :: rest => nextSays rest

/-- `carriedPlace`: where a batch's carried turns go. The first place after every rewind the batch holds at which the
history leaves no call open, so they follow the outputs that close the calls a Resume found open and are never cut by
the batch's own rewind, or at which a say comes next (round 23), so a person's turn the batch says stays last, after
them, even past a call no output answers; none when every place in the batch leaves a call open that the batch's run
still answers, and they wait for the run's next batch (`CarryOp.hold`). The host splits a turn into its admission's
batch and its commit's: a run whose turn is not committed has a say next past its batch (`turnAhead`), which is this
over the batch followed by that say (`placeAhead`). -/
def placeAt (h : List Msg) (ops : List Op) : Option Nat :=
  (List.range (ops.length + 1)).find? fun i =>
    (ops.drop i).all (fun op => !op.isRewind) &&
      ((openCalls (applyAll h (ops.take i))).isEmpty || nextSays (ops.drop i))

/-- `carriedPlace(history, bodies, true)`: the place in a batch whose run says its person's turn `t` next. -/
def placeAhead (h : List Msg) (ops : List Op) (t : Nat) : Option Nat := placeAt h (ops ++ [.msg (.say t)])

/-- The batch written with its carried turns `says` at their place. -/
def plan (h : List Msg) (says : List Nat) (ops : List Op) : Option (List Op) :=
  (placeAt h ops).map fun i => ops.take i ++ says.map (fun s => Op.msg (.say s)) ++ ops.drop i

/-- The batch of a run whose turn `t` is still ahead, written with its carried turns at their place (`placeAhead`). -/
def planAhead (h : List Msg) (says : List Nat) (ops : List Op) (t : Nat) : Option (List Op) :=
  (placeAhead h ops t).map fun i => ops.take i ++ says.map (fun s => Op.msg (.say s)) ++ ops.drop i

/-- A batch the host writes, by the kinds of its rows: a person's turn (a start, or a run settling before it committed
its turn); a Retry, which rewinds to `keep` messages first; the model's reply calling `calls`; a tool's output; a
Resume, which rewinds a transport failure's marker (`cut`, the history's last message), then writes an output for each
call the history leaves open (`CLIENT_DISCONNECTED`) and a reminder `r` when there are any; any other rows. -/
inductive Batch where
  | turn (id : Nat)
  | retry (keep id : Nat)
  | reply (calls : List Nat)
  | output (c : Nat)
  | resume (cut : Bool) (r : Nat)
  | other
  deriving DecidableEq, Repr

/-- The rows of a batch written over `h`, before anything is carried into it. -/
def Batch.ops (h : List Msg) : Batch → List Op
  | .turn id => [.other, .msg (.say id)]
  | .retry k id => [.other, .rewind k, .msg (.say id)]
  | .reply cs => [.msg (.call cs)]
  | .output c => [.msg (.out c)]
  | .resume cut r =>
    let kept := if cut then h.take (h.length - 1) else h
    let outs := (openCalls kept).map fun c => Op.msg (.out c)
    [.other] ++ (if cut then [.rewind (h.length - 1)] else []) ++ outs ++
      (if outs.isEmpty then [] else [.msg (.say r)])
  | .other => [.other]

/-- What the host writes only where it may: a tool's output only for a call the history leaves open (its driver runs
the calls of the reply it just wrote). -/
def Batch.legal (h : List Msg) : Batch → Bool
  | .output c => (openCalls h).contains c
  | _ => true

/-- The histories the host's batches reach: each batch is written over the history it lands after, with the turns its
run's command carries at their place, or without them when it has none (they wait). That the history a batch is planned
over is the one it lands after is the merge's (`t7_projection_after_visible`) and the appender's (`appendMerged`). -/
inductive Reached : List Msg → Prop
  | nil : Reached []
  | step {h : List Msg} (b : Batch) (says : List Nat) :
      Reached h → b.legal h = true → Reached (applyAll h ((plan h says (b.ops h)).getD (b.ops h)))


/-! ## foreign-runs.ts and chat-ref.ts: where another device's run stands (XD3, rounds 18 and 19) -/

/-- `foreignRunStanding`: the run still holds the chat until a moment (`changesAt`); it holds it and its reader asks
for pulls (`awaitsPull`); or it is abandoned. -/
inductive Standing where
  | holds (changesAt : Nat)
  | awaitsPull
  | abandoned
  deriving DecidableEq, Repr

/-- One chat segment's entry in a pull record (`events/pulled-at`): the device clock of the last recorded pull (`clock`),
the segment's size here after it, and the quiet this device's pulls evidenced for exactly those bytes. -/
structure PullRec where
  clock : Nat
  size : Nat
  quiet : Nat
  deriving DecidableEq, Repr

/-- `notePull` (chat-ref.ts, round 19): a pull at device clock `now` that left the segment `size` bytes long here.
Quiet is never one clock reading against another: it is the sum of the gaps between recorded pulls that found the
same bytes, each gap counted at most `cap` and a gap the clock ran backwards across counted as nothing (`Nat`
subtraction), so a backward jump only shortens it and a forward jump adds at most `cap`. A pull under `throttle`
after the recorded one that changed nothing records nothing. Any change of size starts it again. -/
def notePull (cap throttle : Nat) (prior : Option PullRec) (now size : Nat) : PullRec :=
  match prior with
  | none => ⟨now, size, 0⟩
  | some r =>
    if r.size = size then
      if r.clock ≤ now ∧ now - r.clock < throttle then r
      else ⟨now, size, r.quiet + min cap (now - r.clock)⟩
    else ⟨now, size, 0⟩

/-- The record after the pulls `ps`, newest first, each `(clock, size)`. -/
def recordOf (cap throttle : Nat) : List (Nat × Nat) → Option PullRec
  | [] => none
  | p :: older => some (notePull cap throttle (recordOf cap throttle older) p.1 p.2)

/-- How many of the newest pulls found the segment `size` bytes long, in a row. -/
def quietPulls : List (Nat × Nat) → Nat → Nat
  | [], _ => 0
  | p :: older, s => if p.2 = s then quietPulls older s + 1 else 0

/-- `pulledQuietOf`: the quiet a record evidences for the segment as this reader read it (`size`), none for any other
bytes. -/
def quietFor (r : Option PullRec) (size : Nat) : Option Nat :=
  match r with
  | some r => if r.size = size then some r.quiet else none
  | none => none

/-- `foreignRunStanding(run, now, bound)`. `quiet`: what this device's pulls evidenced for the run's segment as read
(`pulledQuiet`); `changed`: when the segment last changed here (`observedAt`); `now`: this device's clock; `ask`: how
long a run may be quiet here before its reader asks for pulls; `takenOver`: another device said the run's turn.
Abandoned only on the evidence of pulls: their quiet past `bound`. The clock decides only when pulls are asked for,
and a clock behind `changed` asks at once. -/
def standing (bound ask changed now : Nat) (quiet : Option Nat) (takenOver : Bool) : Standing :=
  if takenOver || decide (quiet.getD 0 > bound) then .abandoned
  else if now > changed + ask ∨ now < changed then .awaitsPull
  else .holds (changed + ask + 1)

/-! ## segments.ts: `mergeLogSegments` (CL-R14) -/

structure Copy where
  row : Row
  device : Nat
  deriving DecidableEq, Repr, Inhabited

/-- A term across segments: `orders` maps a writer (the first term of a segment holding it, `firstTerm`) to its
place in that writer's file; `copies` maps a sequence to every copy read. -/
structure MTerm where
  term : Nat
  orders : List (Nat × Nat)
  copies : List (Nat × List Copy)
  started : Nat
  deriving Repr

def Kind.ix : Kind → Nat
  | .L => 0 | .S => 1 | .H => 2 | .O => 3 | .R => 4 | .P => 5 | .V => 6 | .M => 7 | .U => 8 | .W => 9 | .C => 10
  | .K => 11

/-- A row's `canonicalJson` as a sort key. For the merge's interrupt rows (keys sorted: epoch, interruptId,
leaderEpoch, phase, reason, recordedAt, runId, sequence, type, version) the first six fields are exactly its code-unit
order; kind and attempt only complete it to a total order on canonical forms. -/
def canonKey (r : Row) : List (List Nat) :=
  [digits r.epoch, digits r.arg, termId r.term, [r.ms], digits r.run, digits r.seq, [r.kind.ix], [r.attempt]]

/-- The kept copy's comparator: canonical form, then device id. -/
def copyKey (c : Copy) : List (List Nat) := canonKey c.row.fp ++ [digits c.device]

/-- Record one copy of `e` read from device `dev`; `order` is `(writer, place)`, the segment's first term and the
term's place in it, when the segment introduces it here. -/
def MTerm.add (t : MTerm) (dev : Nat) (order : Option (Nat × Nat)) (e : Row) : MTerm :=
  { t with
    orders := match order with
      | some (w, o) => upsert w (min o ((lookup w t.orders).getD o)) t.orders
      | none => t.orders
    started := min t.started e.ms
    copies := upsert e.seq (((lookup e.seq t.copies).getD []) ++ [⟨e, dev⟩]) t.copies }

/-- One row of one segment; `st.2` is this segment's `introduced`, in order. The segment's writer is the first term it
introduces: the same row in every copy of one file, whatever the segment is called. -/
def addRow (dev : Nat) (st : List MTerm × List Nat) (e : Row) : List MTerm × List Nat :=
  let fresh := !st.2.contains e.term
  let intro := if fresh then st.2 ++ [e.term] else st.2
  let order := if fresh then some (st.2.headD e.term, intro.length - 1) else none
  if st.1.any (fun t => decide (t.term = e.term)) then
    (st.1.map (fun t => if t.term = e.term then t.add dev order e else t), intro)
  else (st.1 ++ [MTerm.add ⟨e.term, [], [], e.ms⟩ dev order e], intro)

def mergeSegment (terms : List MTerm) (seg : Nat × List Row) : List MTerm :=
  (seg.2.foldl (addRow seg.1) (terms, [])).1

/-- `writerOf(term)`: the smallest writer (in term order) of the segments holding the term. It reads no segment id:
a writer reads its own file under no id and others read it under theirs, and a device whose id changed leaves two
overlapping files on one machine and one on another. -/
def deviceOf (t : MTerm) : Nat :=
  match keySort (fun d => [termId d]) (t.orders.map Prod.fst) with
  | d :: _ => d
  | [] => 0

/-- A placed term: `(term, device, order)`. -/
def place (t : MTerm) : MTerm × Nat × Nat := (t, deviceOf t, (lookup (deviceOf t) t.orders).getD 0)

/-- The per-device clamp, in each device's own file order. -/
def clampStarts (placed : List (MTerm × Nat × Nat)) : List (Nat × Nat) :=
  let devices := placed.foldl (fun ds p => if ds.contains p.2.1 then ds else ds ++ [p.2.1]) []
  devices.flatMap fun d =>
    let mine := keySort (fun p => [[p.2.2], termId p.1.term]) (placed.filter (fun p => decide (p.2.1 = d)))
    (mine.foldl (fun (acc : Option Nat × List (Nat × Nat)) p =>
      let floor := match acc.1 with | some f => max f p.1.started | none => p.1.started
      (some floor, acc.2 ++ [(p.1.term, floor)])) (none, [])).2

/-- The kept copy of one key: the smallest canonical form among all copies, whichever segment holds it (then device id,
which only names the copy reported kept). -/
def keptCopy (copies : List Copy) : Copy :=
  (keySort copyKey copies).headD default

/-- One copy per distinct content other than the kept one, from the smallest device holding it. -/
def dropped (kept : Copy) (copies : List Copy) : List Copy :=
  (keySort (fun c => [digits c.device]) copies).foldl (fun (acc : List Copy) c =>
    if c.row.fp = kept.row.fp ∨ acc.any (fun d => decide (d.row.fp = c.row.fp)) then acc else acc ++ [c]) []

/-- The kept copy of one key and the devices of the distinct dropped copies. -/
def keep (copies : List Copy) : Copy × List Nat :=
  (keptCopy copies, (dropped (keptCopy copies) copies).map (·.device))

/-- One merged key: the kept row, and the conflicts `(key, kept device, dropped device)` it reports. -/
def mergeKey (p : MTerm × Nat × Nat) (sc : Nat × List Copy) : Row × List (Key × Nat × Nat) :=
  let k := keep sc.2
  (k.1.row, k.2.map fun d => ((p.1.term, sc.1), k.1.device, d))

/-- The final order's key of a placed term: clamped start, writer, file order, term. -/
def placedKey (clamped : List (Nat × Nat)) (p : MTerm × Nat × Nat) : List (List Nat) :=
  [[(lookup p.1.term clamped).getD 0], termId p.2.1, [p.2.2], termId p.1.term]

/-- `mergeLogSegments(segments, {onConflict})`: the merged rows and the conflicts `(key, kept, dropped)`. -/
def mergeFull (segs : List (Nat × List Row)) : List Row × List (Key × Nat × Nat) :=
  let placed := (segs.foldl mergeSegment []).map place
  let keys := (keySort (placedKey (clampStarts placed)) placed).flatMap fun p =>
    (keySort (fun sc => [[sc.1]]) p.1.copies).map (mergeKey p)
  (keys.map Prod.fst, keys.flatMap Prod.snd)

def merge (segs : List (Nat × List Row)) : List Row := (mergeFull segs).1

/-- A term's clamped start in the merge of `segs` (0 for a term it does not hold). -/
def clampOf (segs : List (Nat × List Row)) (τ : Nat) : Nat :=
  (lookup τ (clampStarts ((segs.foldl mergeSegment []).map place))).getD 0

/-- `mergeSegmentsUpTo(segments, B)`: the merge's terms whose clamped start is at most `B`, in merge order. A reader
folds this at `B` = its wall clock plus `foreignClockAheadMilliseconds` (or its own newest row, if later), and stamps
its next term after the newest start kept: a hybrid logical clock bounded by its own. -/
def mergeUpTo (B : Nat) (segs : List (Nat × List Row)) : List Row :=
  let placed := (segs.foldl mergeSegment []).map place
  let cl := clampStarts placed
  ((keySort (placedKey cl) placed).filter (fun p => decide ((lookup p.1.term cl).getD 0 ≤ B))).flatMap fun p =>
    (keySort (fun sc => [[sc.1]]) p.1.copies).map fun sc => (mergeKey p sc).1

/-- The history a fold of `rows` reaches from nothing (`createEventLogReducer('history')`), `none` once invalid. -/
def histOf (rows : List Row) : Option Hist := rows.foldlM Hist.transition {}

/-- The merged rows the appender holds after this device appends `e` to its own segment `dev`
(`EventLogAppender.append`, round 21): at the merge's tail when the merge ends in `e`'s term, which the new row
extends, and otherwise the whole merge again, since a row under an older term merges before every later term. -/
def appendMerged (segs : List (Nat × List Row)) (dev : Nat) (merged : List Row) (e : Row) : List Row :=
  if merged.getLast?.map Row.term = some e.term then merged ++ [e]
  else merge (segs.map fun s => if s.1 = dev then (s.1, s.2 ++ [e]) else s)

end ChatLedger
