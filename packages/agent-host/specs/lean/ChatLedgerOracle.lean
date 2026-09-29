import ChatLedger

/-!
Executable oracle over a line-based trace file, line format v2 (no `Lean.Json` in a core-only toolchain). The
generator is `src/log/chat-ledger.differential.test.ts`; its output for each corpus must equal this oracle's.

A row is `<term> <seq> <run> <kind> <arg> <ms> <epoch> <attempt>` (`epoch`/`attempt` 0: absent); kinds
`L S H O R P V M U`. Commands (`#` comments and blank lines ignored):
  T <name>                     start a trace: an empty file, an appender open on it, an empty reader
  E <row>                      append through the appender              → `A <i> <outcome>`
  W <row> / WJ / TEAR          another writer's row, a junk line, a torn fragment (no output)
  RELOAD                       reopen the appender                        → `O <quarantined> <order> <conflict> <history>`
  LEDGER                       fold the appender's view                   → `R … / I … / C … / P … / N … / U …`
  SETTLE <run> <content>       the host's settlement append on a copy     → `QS <outcome>`
  LIFE <run> <state>           gate one stamped lifecycle body            → `QL <code>`
  RESOLVE <run> <interrupt>    gate one stamped interrupt resolution      → `QR <code>`
  PREP <run> <arg>             gate one stamped prepared body             → `QP <code>`
  BATCH <c> <limit> <maxBytes|-> <last|-> <sizes|->   the appender's `readBatch` → `QB …`
  READER                       reset the reader
  READ <limit>                 read the file at the reader's position     → `D <fold>`
  DELIVER <cursor> <limit>     a batch at any cursor                      → `D <fold>`
  DELIVER1 <requested> <limit> a version-1 clamp of the writer's view     → `D <fold>`
  RLEDGER                      the reader's ledger, each line prefixed `r`
  SEG <device> / ROW <row> / MERGE   segments                             → `M …`, `MC …`
  TABLES                       the three legality tables                  → `TO … / TS … / TL …`
  X                            end the trace
-/
open ChatLedger

def num (s : String) : Nat := s.toNat?.getD 0

def kindOf : String → Kind
  | "L" => .L | "S" => .S | "H" => .H | "O" => .O | "R" => .R
  | "P" => .P | "V" => .V | "M" => .M | _ => .U

def rowOf (ws : List String) : Row :=
  match ws with
  | [t, s, r, k, a, ms, ep, at_] =>
    { term := num t, seq := num s, run := num r, kind := kindOf k, arg := num a, ms := num ms, epoch := num ep,
      attempt := num at_ }
  | _ => default

def keyText : Option Key → String
  | some (t, s) => s!"{t}:{s}"
  | none => "-"

def listText (xs : List String) : String := if xs.isEmpty then "-" else ",".intercalate xs

def refusalName : Refusal → String
  | .invalid => "EVENT_INVALID" | .mutated => "EVENT_MUTATED" | .order => "EVENT_OUT_OF_ORDER"
  | .history => "HISTORY_INVALID" | .fenced => "LOG_FENCED"

def codeName : Code → String
  | .ok => "ok" | .chatRunLive => "CHAT_RUN_LIVE" | .noRunAdmitted => "NO_RUN_ADMITTED"
  | .runIdTaken => "RUN_ID_TAKEN" | .settlementWithoutRun => "SETTLEMENT_WITHOUT_RUN"
  | .settlementConflict => "SETTLEMENT_CONFLICT" | .invocationUnresolved => "INVOCATION_UNRESOLVED"
  | .interruptAlreadyResolved => "INTERRUPT_ALREADY_RESOLVED"

def lifeName : Life → String
  | .admitted => "admitted" | .running => "running" | .paused => "paused" | .completed => "completed"
  | .failed true => "failed:r" | .failed false => "failed:f" | .cancelled => "cancelled"

def outcomeName : Life → String
  | .failed _ => "failed"
  | l => lifeName l

def aName : AState → String
  | .unadmitted => "unadmitted" | .open_ => "open" | .terminal => "terminal" | .settled => "settled"

def hName : HState → String
  | .none => "none" | .reserved => "reserved" | .admitted => "admitted"
  | .running => "running" | .paused => "paused" | .terminal => "terminal"

def replayedName : Replayed → String
  | .admit => "admit" | .resume => "resume" | .settled => "settled" | .recover => "recover"

def settledName (i : Nat) : String :=
  match i with
  | 0 => "settled" | 1 => "released" | 2 => "absorbed" | _ => "voided"

def anomalyName : AnomalyKind → String
  | .opaqueRow => "opaque" | .quarantined => "quarantined" | .order => "order" | .conflict => "conflict"

def bit (b : Bool) : String := if b then "1" else "0"

def ledgerLines (L : Ledger) (prefix_ : String := "") : List String :=
  let runs := L.runs.map fun (r, en) =>
    let life := match en.life with | some l => lifeName l | none => "-"
    let settlements := en.settlements.map fun s => s!"{s.attempt}@{keyText (some s.row)}"
    let pending := (isort (fun a b => decLt a b) (en.pending.map Prod.fst)).map fun i => s!"i{i}"
    let inv := match en.openInv with | some a => s!"a{a}" | none => "-"
    s!"R {r} {life} {en.attempt} {aName en.append} {bit en.committed} {bit en.unreadable} {listText settlements} {listText pending} {inv} {replayedName (replayedStart L r)}"
  let invs := L.invs.map fun (a, i) =>
    let outcome := match i.settled with | some o => settledName o | none => "-"
    s!"I a{a} {i.run} {i.attempt} {if i.generation then "g" else "c"} {bit i.shown} {outcome}"
  let cur := match L.current with | some r => toString r | none => "-"
  let term := match L.lastTerminal with | some (r, l) => s!"{r}:{outcomeName l}" | none => "-"
  let lines := runs ++ invs ++ [
    s!"C {cur} {hName (chatRunState L)} {term}",
    s!"P {L.cursor} {keyText L.last} {L.maxEpoch} {bit L.intact}",
    s!"N {listText (L.anomalies.map fun (k, key) => s!"{anomalyName k}@{keyText (some key)}")}",
    s!"U {listText ((unsettled L).map fun (r, a) => s!"{r}:{a}")}"]
  lines.map (prefix_ ++ ·)

def tables : List String :=
  let hs := [(HState.none, "none"), (.reserved, "reserved"), (.admitted, "admitted"), (.running, "running"),
    (.paused, "paused"), (.terminal, "terminal")]
  let to := hs.flatMap fun (h, n) =>
    [(ROp.admit, "admit"), (.resume, "resume")].map fun (o, on) => s!"TO {n} {on} {codeName (operationTable h o)}"
  let ts := [(AState.unadmitted, "unadmitted"), (.open_, "open"), (.terminal, "terminal"), (.settled, "settled")].map
    fun (a, n) => s!"TS {n} settle {codeName (settlementTable a)}"
  let conds := [(Cond.unadmitted, "unadmitted"), (.open_, "open"), (.ended, "ended"), (.settledOpen, "settled-open"),
    (.settled, "settled"), (.reopenable, "reopenable"), (.pausedReopenable, "paused-reopenable")]
  let ops := [(LOp.admitted, "admitted"), (.running, "running"), (.paused, "paused"), (.completed, "completed"),
    (.failed, "failed"), (.cancelled, "cancelled")]
  let tl := conds.flatMap fun (c, n) => ops.map fun (o, on) => s!"TL {n} {on} {codeName (lifecycleTable c o)}"
  to ++ ts ++ tl

def foldName : ReadFold → String
  | .folded _ => "folded"
  | .stale => "stale"
  | .reset .cursorAhead => "reset:cursor-ahead"
  | .reset .identityMismatch => "reset:identity-mismatch"
  | .reset .clamped => "reset:clamped"

structure St where
  file : File := {}
  app : App := {}
  reader : Ledger := {}
  appends : Nat := 0
  segs : List (Nat × List Row) := []

def parseKey (s : String) : Option Key :=
  match s.splitOn ":" with
  | [t, q] => some (num t, num q)
  | _ => none

def count (xs : List Anomaly) (a : Anomaly) : Nat := (xs.filter (· == a)).length

def readOut (st : St) (answer : Answer) : St × List String :=
  let r := foldRead st.reader answer
  let reader := match r with
    | .folded L => L
    | .reset _ => {}
    | .stale => st.reader
  ({ st with reader }, [s!"D {foldName r}"])

def runLine (st : St) (line : String) : St × List String :=
  let ws := (line.splitOn " ").filter (· ≠ "")
  match ws with
  | [] => (st, [])
  | "#" :: _ => (st, [])
  | ["T", name] => ({}, [s!"T {name}"])
  | ["X"] => (st, ["X"])
  | ["TABLES"] => (st, tables)
  | "E" :: rest =>
    let (F, A, o) := append st.file st.app (rowOf rest)
    let text := match o with
      | .appended => "appended" | .duplicate => "duplicate" | .refused r => refusalName r
    ({ st with file := F, app := A, appends := st.appends + 1 }, [s!"A {st.appends} {text}"])
  | "W" :: rest => ({ st with file := st.file.write (.row (rowOf rest)) }, [])
  | ["WJ"] => ({ st with file := st.file.write .junk }, [])
  | ["TEAR"] => ({ st with file := st.file.tear }, [])
  | ["RELOAD"] =>
    let xs := openAnomalies st.file
    ({ st with app := openApp st.file },
     [s!"O {count xs .quarantined} {count xs .order} {count xs .conflict} {count xs .history}"])
  | ["LEDGER"] => (st, ledgerLines (fold {} st.app.view))
  | ["SETTLE", run, c] =>
    let text := match hostSettle st.file (num run) (num c) with
      | .code c => codeName c | .appended => "appended" | .skipped => "skipped" | .refused r => refusalName r
    (st, [s!"QS {text}"])
  | ["LIFE", run, s] =>
    let L := fold {} st.app.view
    (st, [s!"QL {codeName (gateCode L (stamp L 99 (num run) .L (num s) 0) true)}"])
  | ["RESOLVE", run, i] =>
    let L := fold {} st.app.view
    (st, [s!"QR {codeName (gateCode L (stamp L 99 (num run) .R (num i) 0) true)}"])
  | ["PREP", run, a] =>
    let L := fold {} st.app.view
    (st, [s!"QP {codeName (gateCode L (stamp L 99 (num run) .P (num a) 0) true)}"])
  | ["BATCH", c, lim, mb, last, sz] =>
    let sizes := if sz == "-" then [] else (sz.splitOn ",").map num
    let answer := readBatch st.app.view (num c) (num lim) (if mb == "-" then none else some (num mb))
      (parseKey last) (fun i => sizes.getD i 0)
    let text := match answer with
      | .batch c n f evs => s!"QB batch {c} {n} {f} {listText (evs.map fun e => keyText (some e.key))}"
      | .refused ahead f l =>
        s!"QB refused {if ahead then "cursor-ahead" else "identity-mismatch"} {f} {keyText l}"
    (st, [text])
  | ["READER"] => ({ st with reader := {} }, [])
  | ["READ", lim] =>
    readOut st (readBatch st.file.rows st.reader.cursor (num lim) none st.reader.last)
  | ["DELIVER", c, lim] => readOut st (readBatch st.file.rows (num c) (num lim) none none)
  | ["DELIVER1", c, lim] => readOut st (v1Read st.app.view (num c) (num lim))
  | ["RLEDGER"] => (st, ledgerLines st.reader "r")
  | ["SEG", d] => ({ st with segs := st.segs ++ [(num d, [])] }, [])
  | "ROW" :: rest =>
    match st.segs.reverse with
    | (d, rows) :: older => ({ st with segs := older.reverse ++ [(d, rows ++ [rowOf rest])] }, [])
    | [] => (st, ["ERROR ROW before SEG"])
  | ["MERGE"] =>
    let (rows, conflicts) := mergeFull st.segs
    (st, [s!"M {",".intercalate (rows.map fun e => s!"{e.term}:{e.seq}:{e.run}:O{e.arg}:{e.ms}")}",
          s!"MC {listText (conflicts.map fun ((t, q), k, d) => s!"{t}:{q}:{k}:{d}")}"])
  | _ => (st, [s!"ERROR {line}"])

def main (args : List String) : IO Unit := do
  let path := args.headD "trace.txt"
  let lines ← IO.FS.lines path
  let stdout ← IO.getStdout
  let mut st : St := {}
  for line in lines do
    let (st', out) := runLine st line
    st := st'
    for o in out do
      stdout.putStrLn o
