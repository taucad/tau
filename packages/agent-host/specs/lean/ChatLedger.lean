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

Every list is in PHYSICAL (file) order. A row is the trace's `<term> <seq> <run> <kind> <arg> <ms> <epoch>
<attempt>`: `term` is the `leaderEpoch` `e<NN>`, `epoch`/`attempt` 0 mean absent, and `(kind, arg)` names the
row's body (`bodyOf` in the generator). Bytes are abstracted to line counts: a file is its lines and the count of
torn fragments after them, and the appender's size comparison is a comparison of those counts (the file only
grows by whole lines, and only a torn tail is ever truncated).
-/
namespace ChatLedger

/-! ## Rows -/

inductive Kind where
  | L | S | H | O | R | P | V | M | U
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

/-- A provider message id: `m-<term>-<seq>` (assistant reply) or `u-<term>-<seq>-<arg>` (committed user turn). -/
def msgId (e : Row) : Option (Nat × Nat × Nat × Nat) :=
  match e.kind with
  | .M => some (0, e.term, e.seq, 0)
  | .H => some (1, e.term, e.seq, e.arg)
  | _ => none

/-- `knownMessageIds`, `preparedInvocations`, `settledInvocations` (attempt ids `a<n>` as `n`). -/
structure Hist where
  ids : List (Nat × Nat × Nat × Nat) := []
  prepared : List Nat := []
  settled : List Nat := []

/-- `transitionOf`: `none` is `HISTORY_INVALID`. -/
def Hist.transition (h : Hist) (e : Row) : Option Hist :=
  match msgId e with
  | some id => if id ∈ h.ids then none else some { h with ids := h.ids ++ [id] }
  | none =>
    match e.kind with
    | .P => if e.arg % 4 ∈ h.prepared then none else some { h with prepared := h.prepared ++ [e.arg % 4] }
    | .V =>
      if e.arg % 4 ∈ h.prepared ∧ e.arg % 4 ∉ h.settled then some { h with settled := h.settled ++ [e.arg % 4] }
      else none
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

/-! ## segments.ts: `mergeLogSegments` (CL-R14) -/

structure Copy where
  row : Row
  device : Nat
  deriving DecidableEq, Repr, Inhabited

/-- A term across segments: `orders` is `orderByDevice`, `copies` maps a sequence to every copy read. -/
structure MTerm where
  term : Nat
  orders : List (Nat × Nat)
  copies : List (Nat × List Copy)
  started : Nat
  deriving Repr

def Kind.ix : Kind → Nat
  | .L => 0 | .S => 1 | .H => 2 | .O => 3 | .R => 4 | .P => 5 | .V => 6 | .M => 7 | .U => 8

/-- A row's `canonicalJson` as a sort key. For the merge's interrupt rows (keys sorted: epoch, interruptId,
leaderEpoch, phase, reason, recordedAt, runId, sequence, type, version) the first six fields are exactly its code-unit
order; kind and attempt only complete it to a total order on canonical forms. -/
def canonKey (r : Row) : List (List Nat) :=
  [digits r.epoch, digits r.arg, termId r.term, [r.ms], digits r.run, digits r.seq, [r.kind.ix], [r.attempt]]

/-- The kept copy's comparator: canonical form, then device id. -/
def copyKey (c : Copy) : List (List Nat) := canonKey c.row.fp ++ [digits c.device]

/-- Record one copy of `e` read from device `dev`; `order` is the term's place in this segment when the segment
introduces it here. -/
def MTerm.add (t : MTerm) (dev : Nat) (order : Option Nat) (e : Row) : MTerm :=
  { t with
    orders := match order with
      | some o => upsert dev (min o ((lookup dev t.orders).getD o)) t.orders
      | none => t.orders
    started := min t.started e.ms
    copies := upsert e.seq (((lookup e.seq t.copies).getD []) ++ [⟨e, dev⟩]) t.copies }

/-- One row of one segment; `st.2` is this segment's `introduced`, in order. -/
def addRow (dev : Nat) (st : List MTerm × List Nat) (e : Row) : List MTerm × List Nat :=
  let fresh := !st.2.contains e.term
  let intro := if fresh then st.2 ++ [e.term] else st.2
  let order := if fresh then some (intro.length - 1) else none
  if st.1.any (fun t => decide (t.term = e.term)) then
    (st.1.map (fun t => if t.term = e.term then t.add dev order e else t), intro)
  else (st.1 ++ [MTerm.add ⟨e.term, [], [], e.ms⟩ dev order e], intro)

def mergeSegment (terms : List MTerm) (seg : Nat × List Row) : List MTerm :=
  (seg.2.foldl (addRow seg.1) (terms, [])).1

/-- `deviceOf(term)`: the smallest device id holding the term. -/
def deviceOf (t : MTerm) : Nat :=
  match keySort (fun d => [digits d]) (t.orders.map Prod.fst) with
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

/-- The kept copy of one key: the smallest canonical form (then device id) among the term device's own copies, or
among all copies when that device holds none. -/
def keptCopy (device : Nat) (copies : List Copy) : Copy :=
  let own := copies.filter (fun c => decide (c.device = device))
  (keySort copyKey (if own.isEmpty then copies else own)).headD default

/-- One copy per distinct content other than the kept one, from the smallest device holding it. -/
def dropped (kept : Copy) (copies : List Copy) : List Copy :=
  (keySort (fun c => [digits c.device]) copies).foldl (fun (acc : List Copy) c =>
    if c.row.fp = kept.row.fp ∨ acc.any (fun d => decide (d.row.fp = c.row.fp)) then acc else acc ++ [c]) []

/-- The kept copy of one key and the devices of the distinct dropped copies. -/
def keep (device : Nat) (copies : List Copy) : Copy × List Nat :=
  (keptCopy device copies, (dropped (keptCopy device copies) copies).map (·.device))

/-- One merged key: the kept row, and the conflicts `(key, kept device, dropped device)` it reports. -/
def mergeKey (p : MTerm × Nat × Nat) (sc : Nat × List Copy) : Row × List (Key × Nat × Nat) :=
  let k := keep p.2.1 sc.2
  (k.1.row, k.2.map fun d => ((p.1.term, sc.1), k.1.device, d))

/-- The final order's key of a placed term: clamped start, device, file order, term. -/
def placedKey (clamped : List (Nat × Nat)) (p : MTerm × Nat × Nat) : List (List Nat) :=
  [[(lookup p.1.term clamped).getD 0], digits p.2.1, [p.2.2], termId p.1.term]

/-- `mergeLogSegments(segments, {onConflict})`: the merged rows and the conflicts `(key, kept, dropped)`. -/
def mergeFull (segs : List (Nat × List Row)) : List Row × List (Key × Nat × Nat) :=
  let placed := (segs.foldl mergeSegment []).map place
  let keys := (keySort (placedKey (clampStarts placed)) placed).flatMap fun p =>
    (keySort (fun sc => [[sc.1]]) p.1.copies).map (mergeKey p)
  (keys.map Prod.fst, keys.flatMap Prod.snd)

def merge (segs : List (Nat × List Row)) : List Row := (mergeFull segs).1

end ChatLedger
