import ChatLedger

/-!
Executable oracle over a line-based trace file, line format v2 (no `Lean.Json` in a core-only toolchain). The
generator is `src/log/chat-ledger.differential.test.ts`; its output for each corpus must equal this oracle's.

A row is `<term> <seq> <run> <kind> <arg> <ms> <epoch> <attempt>` (`epoch`/`attempt` 0: absent); kinds
`L S H O R P V M U W C K`. Commands (`#` comments and blank lines ignored):
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
  MERGEB <bound>               the merge's terms started by `bound`        → `MB <keys>`
  MH                           the history the merge folds to (rows that only append messages: no `H`)
                                                                           → `MH <intact> <message ids>`
  TABLES                       the three legality tables                  → `TO … / TS … / TL …`
  ADMIT <verb> <takenOver> <wrote>   the host's admission of a start, resume or approval
                                                                           → `QA <admission>`
  TERMOF <admission> <slotHeld>   the term an admitted command's rows go under → `QT held|fresh`
  TERMS <wrote> <steps|->       a chat's terms on this host: from the incarnation's term `1`, written under or not,
                               steps `p<command>.<run>.<term>`, `w<run>.<heartbeat>`, `a<command>.<applied>`, and a
                               write split in two: `b<run>.<heartbeat>` begins it, `e` ends it (round 20)
                                                                           → `QM <written|-> <term> <heartbeat|->`
  XADMIT <verb> <takenOver> <wrote> <runs|->   the one admission of a start, resume or approval past other devices'
                               runs, each `<run>:<abandoned>:<said>:<words>` → `QX taken-over|held|<admission> <says|->`
  CARRY <steps|->              what admitted commands' first batches carry: steps `c<command>.<run>.<says, + apart|->`,
                               `w<run>.<heartbeat>`, `h<run>` (a batch with no place for them, round 21),
                               `a<command>.<applied>`   → `QC <each write's says, + apart|->,…>`
  PLAN <history|-> <says|-> <rows|->   where a batch's carried turns go (round 21): history messages `c<calls|->`,
                               `o<call>`, `s<id>`; rows those, `k<keep>` a rewind, `p<keep>` a turn's commit that
                               keeps that many and says the turn `1000` (round 24), `l` no message
                               → `QW <open calls|-> <place|-> <well formed after> <carried survive>`
  PLANT <history|-> <says|-> <rows|->   the same for a batch whose run says its person's turn next, past the batch
                               (round 23, `placeAhead`) → `QW …`
  RESUMEB <history|-> <cut>    a Resume's batch over that history, its last message rewound or not (round 21)
                               → `QZ <calls it closes|-> <well formed after>`
  APPENDM <device> <row>       the merged rows after this device appends the row to its segment (round 21)
                               → `MA <keys>`
  REFRESHM <device> <row>      the merged rows the appender folds after a refresh reads the row appended to that
                               device's segments, or in a new segment of it (round 26)
                                                                           → `MR <rows, as M prints them>`
  STAND <bound> <ask> <changed> <now> <quiet|-> <takenOver>   where another device's run stands
                                                                           → `QF <standing> [changesAt]`
  PULL <cap> <throttle> <clock:size:quiet|-> <now> <size>   a pull's record of one segment (chat-ref.ts `notePull`)
                                                                           → `QN <clock> <size> <quiet>`
  X                            end the trace
-/
open ChatLedger

def num (s : String) : Nat := s.toNat?.getD 0

def kindOf : String → Kind
  | "L" => .L | "S" => .S | "H" => .H | "O" => .O | "R" => .R
  | "P" => .P | "V" => .V | "M" => .M | "W" => .W | "C" => .C | "K" => .K | _ => .U

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
  | .failed .fatal => "failed:f" | .failed .gateway => "failed:g" | .failed .abandoned => "failed:a"
  | .failed .agentStop => "failed:s" | .cancelled true => "cancelled:u"
  | .cancelled false => "cancelled"

def outcomeName : Life → String
  | .failed _ => "failed"
  | .cancelled _ => "cancelled"
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

/-- A message id as the generator spells it: `m-<term>-<seq>`, `u-<term>-<seq>-<arg>`, `w-<arg>`. -/
def idText : Nat × Nat × Nat × Nat → String
  | (0, t, q, _) => s!"m-{t}-{q}"
  | (1, t, q, a) => s!"u-{t}-{q}-{a}"
  | (_, a, _, _) => s!"w-{a}"

def ledgerLines (L : Ledger) (prefix_ : String := "") : List String :=
  let runs := L.runs.map fun (r, en) =>
    let life := match en.life with | some l => lifeName l | none => "-"
    let settlements := en.settlements.map fun s => s!"{s.attempt}@{keyText (some s.row)}"
    let pending := (isort (fun a b => decLt a b) (en.pending.map Prod.fst)).map fun i => s!"i{i}"
    let inv := match en.openInv with | some a => s!"a{a}" | none => "-"
    let kind := if en.external then (if en.prompted then "xp" else "x") else "t"
    s!"R {r} {life} {kind} {en.attempt} {aName en.append} {bit en.committed} {bit en.unreadable} {listText settlements} {listText pending} {inv} {replayedName (replayedStart L r)}"
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

/-- A history message of a `PLAN` line: `c<calls, + apart|->`, `o<call>`, `s<id>`. -/
def msgOf (t : String) : Msg :=
  let rest := (t.drop 1).toString
  match (t.take 1).toString with
  | "c" => .call (if rest == "-" then [] else (rest.splitOn "+").map num)
  | "o" => .out (num rest)
  | _ => .say (num rest)

/-- A batch row of a `PLAN` line: a message, `k<keep>` a rewind, `p<keep>` the run's turn's commit (round 24), which
keeps that many messages and says the turn `1000` at once, `l` a row that is no message. -/
def opOf (t : String) : Op :=
  match (t.take 1).toString with
  | "k" => .rewind (num (t.drop 1).toString)
  | "p" => .commit (num (t.drop 1).toString) 1000
  | "l" => .other
  | _ => .msg (msgOf t)

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
  | ["MERGEB", b] =>
    (st, [s!"MB {listText ((mergeUpTo (num b) st.segs).map fun e => s!"{e.term}:{e.seq}")}"])
  | ["ADMIT", v, t, w] =>
    let verb : Verb := match v with | "resume" => .resume | "approve" => .approve | _ => .start
    let name := match admission verb (t == "1") (w == "1") with
      | .takenOver => "taken-over" | .newTerm => "new-term" | .sameTerm => "same-term"
    (st, [s!"QA {name}"])
  | ["TERMOF", a, h] =>
    let adm : Admission := match a with | "taken-over" => .takenOver | "new-term" => .newTerm | _ => .sameTerm
    (st, [s!"QT {if rowsTerm adm (h == "1") 1 2 = 2 then "fresh" else "held"}"])
  | ["TERMS", w, ops] =>
    let start : Terms := { held := 1, wrote := if w == "1" then some 1 else none }
    let steps := if ops == "-" then [] else ops.splitOn ","
    let (fin, written, _) := steps.foldl (fun (acc : Terms × List Nat × Option (Terms × Nat × Bool)) step =>
      let args := ((step.drop 1).toString.splitOn ".").map num
      let a := args.getD 0 0
      let b := args.getD 1 0
      match (step.take 1).toString with
      | "p" => (acc.1.step (.propose a b (args.getD 2 0)), acc.2.1, acc.2.2)
      | "w" => (acc.1.step (.write a (b == 1)), acc.2.1 ++ [acc.1.rowsTerm a (b == 1)], acc.2.2)
      | "b" => (acc.1, acc.2.1 ++ [acc.1.rowsTerm a (b == 1)], some (acc.1, a, b == 1))
      | "e" =>
        match acc.2.2 with
        | some (begun, r, hb) => (acc.1.finish begun r hb, acc.2.1, none)
        | none => acc
      | _ => (acc.1.step (.answer a (b == 1)), acc.2.1, acc.2.2)) (start, [], none)
    let hb := match fin.heartbeat with | some t => toString t | none => "-"
    (st, [s!"QM {if written.isEmpty then "-" else ",".intercalate (written.map toString)} {fin.term} {hb}"])
  | ["XADMIT", v, t, w, fs] =>
    let verb : Verb := match v with | "resume" => .resume | "approve" => .approve | _ => .start
    let foreign := (if fs == "-" then [] else fs.splitOn ",").map fun f =>
      match (f.splitOn ":").map num with
      | [r, a, s_, w_] => ({ run := r, abandoned := a == 1, said := s_ == 1, words := w_ == 1 } : Passed)
      | _ => { run := 0, abandoned := false, said := false, words := false }
    let text := match admit verb (t == "1") (w == "1") foreign with
      | .takenOver => "taken-over"
      | .held => "held"
      | .admitted a says =>
        let name := match a with | .takenOver => "taken-over" | .newTerm => "new-term" | .sameTerm => "same-term"
        s!"{name} {listText (says.map toString)}"
    (st, [s!"QX {text}"])
  | ["CARRY", ops] =>
    let steps := if ops == "-" then [] else ops.splitOn ","
    let (_, said) := steps.foldl (fun (acc : Carried × List String) step =>
      let args := (step.drop 1).toString.splitOn "."
      let a := num (args.getD 0 "")
      let b := args.getD 1 ""
      let op : CarryOp := match (step.take 1).toString with
        | "c" =>
          let says := args.getD 2 "-"
          .carry a (num b) (if says == "-" then [] else (says.splitOn "+").map num)
        | "w" => .write a (b == "1")
        | "h" => .hold a
        | "s" => .settle a
        | _ => .answer a (b == "1")
      let (next, out) := carryStep acc.1 op
      match op with
      | .write _ _ | .hold _ => (next, acc.2 ++ [if out.isEmpty then "-" else "+".intercalate (out.map toString)])
      | _ => (next, acc.2)) ([], [])
    (st, [s!"QC {listText said}"])
  | ["PLAN", hs, ss, os] | ["PLANT", hs, ss, os] =>
    let h := (if hs == "-" then [] else hs.splitOn ",").map msgOf
    let says := (if ss == "-" then [] else ss.splitOn "+").map num
    let ops := (if os == "-" then [] else os.splitOn ",").map opOf
    /- `PLANT` (round 23): the batch's run has not committed its turn, so it says that turn next, past the batch
    (`turnAhead`, round 24). -/
    let ahead := turnAhead (!line.startsWith "PLANT ")
    let place := if ahead then placeAhead h ops 1000 else placeAt h ops
    let after := applyAll h ((planFor ahead h says ops 1000).getD ops)
    let survive := place.isSome && says.all (fun s => after.contains (.say s))
    let at_ := match place with | some i => toString i | none => "-"
    (st, [s!"QW {listText ((openCalls h).map toString)} {at_} {bit (wf after)} {bit survive}"])
  | ["RESUMEB", hs, cut] =>
    let h := (if hs == "-" then [] else hs.splitOn ",").map msgOf
    let ops := (Batch.resume (cut == "1") 7).ops h
    let closed := ops.filterMap fun op => match op with | .msg (.out c) => some (toString c) | _ => none
    (st, [s!"QZ {listText closed} {bit (wf (applyAll h ops))}"])
  | "APPENDM" :: d :: rest =>
    let e := rowOf rest
    (st, [s!"MA {listText ((appendMerged st.segs (num d) (merge st.segs) e).map fun r => s!"{r.term}:{r.seq}")}"])
  | "REFRESHM" :: d :: rest =>
    let e := rowOf rest
    let dev := num d
    let next := if st.segs.any (fun s => decide (s.1 = dev)) then
        st.segs.map fun s => if s.1 = dev then (s.1, s.2 ++ [e]) else s
      else st.segs ++ [(dev, [e])]
    (st, [s!"MR {",".intercalate ((refreshMerged (merge st.segs) (merge next)).map fun e =>
      s!"{e.term}:{e.seq}:{e.run}:O{e.arg}:{e.ms}")}"])
  | ["PULL", cap, th, prior, n, sz] =>
    let rec_ := if prior == "-" then none else
      match (prior.splitOn ":").map num with
      | [c, s, q] => some ⟨c, s, q⟩
      | _ => none
    let r := notePull (num cap) (num th) rec_ (num n) (num sz)
    (st, [s!"QN {r.clock} {r.size} {r.quiet}"])
  | ["STAND", b, a, c, n, p, t] =>
    let text := match standing (num b) (num a) (num c) (num n) (if p == "-" then none else some (num p)) (t == "1") with
      | .holds at_ => s!"QF holds {at_}" | .awaitsPull => "QF awaits-pull" | .abandoned => "QF abandoned"
    (st, [text])
  | ["MH"] =>
    let text := match histOf (merge st.segs) with
      | some h => s!"MH 1 {listText (h.ids.map idText)}"
      | none => "MH 0 -"
    (st, [text])
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
