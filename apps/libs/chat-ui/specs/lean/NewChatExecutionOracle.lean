import NewChatExecution

/-!
Oracle for `NewChatExecution`: replays a trace and prints what the model decides, one line per query.
`new-chat-execution.differential.test.ts` writes the traces and compares the TypeScript with these goldens.

Commands (`-` means absent):
- `T <name>` starts a case with an empty state and prints `T <name>`.
- `CAT loading` | `CAT unavailable` | `CAT loaded <id>:<0|1>,…` | `CAT loaded -` sets the catalog (`1` = recommended).
- `LASTTAU <model> <host> <effort>` sets the last Tau choice.
- `LAST none` | `LAST tau <model> <host> <effort>` | `LAST acp <selection>` sets the remembered execution.
- `RESOLVE` prints `R tau <model> <host> <effort>` or `R acp <selection>`.
- `READY <model>` prints `Q ready|checking|catalog-unavailable|not-offered`.
-/
open NewChatExecution

structure St where
  catalog : Catalog := .loading
  lastTau : Tau := ⟨0, none, none⟩
  last : Option Exec := none

def num (s : String) : Nat := s.toNat!

def opt (s : String) : Option Nat := if s == "-" then none else some (num s)

def optText : Option Nat → String
  | none => "-"
  | some n => toString n

def rowOf (s : String) : Row :=
  match s.splitOn ":" with
  | [id, r] => ⟨num id, r == "1"⟩
  | _ => ⟨0, false⟩

def readinessName : Readiness → String
  | .ready => "ready"
  | .checking => "checking"
  | .catalogUnavailable => "catalog-unavailable"
  | .notOffered => "not-offered"

def execText : Exec → String
  | .tau t => s!"R tau {t.model} {optText t.host} {optText t.effort}"
  | .acp a => s!"R acp {a}"

def runLine (st : St) (line : String) : St × List String :=
  match (line.splitOn " ").filter (· ≠ "") with
  | [] => (st, [])
  | ["T", name] => ({}, [s!"T {name}"])
  | ["CAT", "loading"] => ({ st with catalog := .loading }, [])
  | ["CAT", "unavailable"] => ({ st with catalog := .unavailable }, [])
  | ["CAT", "loaded", "-"] => ({ st with catalog := .loaded [] }, [])
  | ["CAT", "loaded", rows] => ({ st with catalog := .loaded ((rows.splitOn ",").map rowOf) }, [])
  | ["LASTTAU", m, h, e] => ({ st with lastTau := ⟨num m, opt h, opt e⟩ }, [])
  | ["LAST", "none"] => ({ st with last := none }, [])
  | ["LAST", "tau", m, h, e] => ({ st with last := some (.tau ⟨num m, opt h, opt e⟩) }, [])
  | ["LAST", "acp", a] => ({ st with last := some (.acp (num a)) }, [])
  | ["RESOLVE"] => (st, [execText (resolve st.last st.lastTau st.catalog)])
  | ["READY", m] => (st, [s!"Q {readinessName (readiness (num m) st.catalog)}"])
  | _ => (st, [s!"ERROR {line}"])

def main (args : List String) : IO Unit := do
  let lines ← IO.FS.lines (args.headD "trace.txt")
  let stdout ← IO.getStdout
  let mut st : St := {}
  for line in lines do
    let (st', out) := runLine st line
    st := st'
    for o in out do
      stdout.putStrLn o
