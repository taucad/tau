import ChatLedger

/-!
Executable oracle over a line-based trace file (no `Lean.Json` in a core-only toolchain).

Input, one command per line (`#` comments and blank lines ignored):
  T <name>                                  start a trace (fresh appender, no segments)
  E <epoch> <seq> <run> <kind> <arg> <ms>   append through `appendFenced`; kind L|S|H|O
  LEDGER                                    print `runLedgerOf` + `replayedStartOutcome` of the log
  SETTLE <run> <content>                    print the host's `recordSettlement` decision
  BATCH <cursor> <limit> <maxBytes|-> <sizes|->   print `readBatch`
  SEG <device> / ROW <epoch> <seq> <run> <kind> <arg> <ms> / MERGE
  TABLES                                    print the four legality tables
  RELOAD                                    reopen the appender from its bytes (a no-op in the model)
  X                                         end the trace
Life codes for kind L: 0 admitted 1 running 2 paused 3 completed 4 failed 5 failed(resumable) 6 cancelled.
-/
open ChatLedger

def lifeOf : Nat → Life
  | 0 => .admitted | 1 => .running | 2 => .paused | 3 => .completed
  | 4 => .failed false | 5 => .failed true | _ => .cancelled

def lifeName : Life → String
  | .admitted => "admitted" | .running => "running" | .paused => "paused"
  | .completed => "completed" | .failed _ => "failed" | .cancelled => "cancelled"

def hName : HState → String
  | .none => "none" | .reserved => "reserved" | .admitted => "admitted"
  | .running => "running" | .paused => "paused" | .terminal => "terminal"

def aName : AState → String
  | .unadmitted => "unadmitted" | .open_ => "open" | .terminal => "terminal" | .settled => "settled"

def kindOf (k : String) (arg : Nat) : Kind :=
  match k with
  | "L" => .life (lifeOf arg)
  | "S" => .settle arg
  | "H" => .commit arg
  | _ => .other arg

def kindCode : Kind → String
  | .life s => s!"L{match s with
      | .admitted => 0 | .running => 1 | .paused => 2 | .completed => 3
      | .failed false => 4 | .failed true => 5 | .cancelled => 6}"
  | .settle c => s!"S{c}"
  | .commit c => s!"H{c}"
  | .other c => s!"O{c}"

def num (s : String) : Nat := s.toNat?.getD 0

def eventOf (ws : List String) : Event :=
  match ws with
  | [ep, sq, run, k, arg, ms] => { epoch := num ep, seq := num sq, run := num run, kind := kindOf k (num arg), stamp := num ms }
  | _ => default

def keyStr (e : Event) : String := s!"{e.epoch}:{e.seq}"
def rowStr (e : Event) : String := s!"{e.epoch}:{e.seq}:{e.run}:{kindCode e.kind}:{e.stamp}"

def outcomeName : SettleOutcome → String
  | .append => "appended" | .skip => "skipped"
  | .conflict => "SETTLEMENT_CONFLICT" | .withoutRun => "SETTLEMENT_WITHOUT_RUN"

def replayedName : Replayed → String
  | .admit => "admit" | .resume => "resume" | .settled => "settled"

def ledgerLines (rows : List Event) : List String :=
  let L := runLedgerOf rows.reverse
  let runsOut := L.order.map fun r =>
    let en := L.entry r
    let life := match en.life with | some s => lifeName s | none => "-"
    let st := match en.settle with | some e => keyStr e | none => "-"
    s!"R {r} {life} {st} {aName (appendStateOf en)} {replayedName (replayedStart rows r)}"
  let chat := match L.chatState with
    | some (r, h) => s!"C {r} {hName h}"
    | none => "C -"
  runsOut ++ [chat]

def allLives : List (Option Life) :=
  [none, some .admitted, some .running, some .paused, some .completed, some (.failed false), some .cancelled]

def lifeOptName : Option Life → String
  | some s => lifeName s
  | none => "-"

def tables : List String :=
  let hs := allLives.map fun l => s!"HS {lifeOptName l} {hName (hstate l)}"
  let hstates := [HState.none, .reserved, .admitted, .running, .paused, .terminal]
  let ops := [(Op.admit, "admit"), (Op.resume, "resume")].flatMap fun (o, n) =>
    hstates.map fun h => s!"OP {n} {hName h} {opLegal o h}"
  let astates := [AState.unadmitted, .open_, .terminal, .settled]
  let sl := astates.map fun a => s!"SL {aName a} {settleLegal a}"
  let nexts := [Life.admitted, .running, .paused, .completed, .failed false, .cancelled]
  let ll := nexts.flatMap fun n => astates.flatMap fun a => allLives.flatMap fun l =>
    [false, true].map fun r => s!"LL {lifeName n} {aName a} {lifeOptName l} {r} {lifecycleLegal n a l r}"
  hs ++ ops ++ sl ++ ll

structure St where
  log : Log := {}
  segs : List (Nat × List Event) := []
  appends : Nat := 0

def parseSizes (s : String) : List Nat :=
  if s == "-" then [] else (s.splitOn ",").map num

def runLine (st : St) (line : String) : St × List String :=
  let ws := (line.splitOn " ").filter (· ≠ "")
  match ws with
  | [] => (st, [])
  | "#" :: _ => (st, [])
  | ["T", name] => ({}, [s!"T {name}"])
  | ["X"] => (st, ["X"])
  | ["RELOAD"] => (st, [])   -- the appender state is a function of its rows (`Inv`): reopening changes nothing
  | "E" :: rest =>
    let e := eventOf rest
    let i := st.appends
    match appendFenced st.log e with
    | .ok (L', true) => ({ st with log := L', appends := i + 1 }, [s!"A {i} appended"])
    | .ok (_, false) => ({ st with appends := i + 1 }, [s!"A {i} duplicate"])
    | .error .mutated => ({ st with appends := i + 1 }, [s!"A {i} EVENT_MUTATED"])
    | .error _ => ({ st with appends := i + 1 }, [s!"A {i} EVENT_OUT_OF_ORDER"])
  | ["LEDGER"] => (st, ledgerLines st.log.rows)
  | ["SETTLE", run, c] => (st, [s!"QS {outcomeName (hostSettle st.log.rows (num run) (num c) false)}"])
  | ["BATCH", c, lim, mb, sz] =>
    let physical := st.log.rows.reverse
    let sizes := parseSizes sz
    let sizeOf (e : Event) : Nat :=
      match physical.findIdx? (· == e) with
      | some i => sizes.getD i 0
      | none => 0
    let maxBytes := if mb == "-" then none else some (num mb)
    let b := readBatch physical (num c) (num lim) maxBytes sizeOf
    (st, [s!"QB {b.cursor} {b.next} {b.finish} {",".intercalate (b.events.map keyStr)}"])
  | ["SEG", d] => ({ st with segs := st.segs ++ [(num d, [])] }, [])
  | "ROW" :: rest =>
    let e := eventOf rest
    match st.segs.reverse with
    | (d, rows) :: older => ({ st with segs := (older.reverse ++ [(d, rows ++ [e])]) }, [])
    | [] => (st, ["ERROR ROW before SEG"])
  | ["MERGE"] => (st, [s!"M {",".intercalate ((merge st.segs).map rowStr)}"])
  | ["TABLES"] => (st, tables)
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
