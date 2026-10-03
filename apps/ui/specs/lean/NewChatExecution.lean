/-!
NewChatExecution — the execution a new chat starts on (`apps/ui/app/utils/new-chat-execution.ts`).

A new chat with no execution of its own starts on the last execution used, of any agent: an external
agent (Codex, Claude Code) is kept as chosen, and a Tau execution keeps its host and level. The only
rewrite is a Tau model the loaded catalog no longer offers, which moves to the catalog's recommended
model (else its first). Without a usable catalog nothing is rewritten, and `readiness` says why a Tau
model cannot start — the reason the picker shows and admission refuses with.

Model ids, hosts, levels and external-agent selections are abstracted to `Nat`: the decision only ever
compares them for equality. The TypeScript is checked against this model through the goldens
`NewChatExecutionOracle.lean` writes (`new-chat-execution.differential.test.ts`).
-/
namespace NewChatExecution

/-- A Tau execution: model, optional pinned host, optional reasoning level. -/
structure Tau where
  model : Nat
  host : Option Nat
  effort : Option Nat
  deriving DecidableEq, Repr

inductive Exec where
  | tau (t : Tau)
  /-- An external agent's whole selection (host, agent, model, config), opaque to the decision. -/
  | acp (selection : Nat)
  deriving DecidableEq, Repr

structure Row where
  id : Nat
  recommended : Bool
  deriving DecidableEq, Repr

inductive Catalog where
  | loading
  | unavailable
  | loaded (rows : List Row)
  deriving DecidableEq, Repr

inductive Readiness where
  | ready
  | checking
  | catalogUnavailable
  | notOffered
  deriving DecidableEq, Repr

def offers (rows : List Row) (m : Nat) : Bool := rows.any (·.id == m)

def readiness (m : Nat) : Catalog → Readiness
  | .loading => .checking
  | .unavailable => .catalogUnavailable
  | .loaded [] => .catalogUnavailable
  | .loaded rows => if offers rows m then .ready else .notOffered

/-- The recommended row, else the first. -/
def fallback (rows : List Row) : Option Nat :=
  match rows.find? (·.recommended) with
  | some r => some r.id
  | none => rows.head?.map (·.id)

/-- A Tau execution whose model the loaded catalog does not offer moves to the fallback; nothing else changes. -/
def heal (t : Tau) : Catalog → Tau
  | .loaded rows =>
    match fallback rows with
    | some f => if offers rows t.model then t else { t with model := f }
    | none => t
  | _ => t

/-- The new chat's execution, from the last execution used, the last Tau choice and the catalog. -/
def resolve (last : Option Exec) (lastTau : Tau) (c : Catalog) : Exec :=
  match last.getD (.tau lastTau) with
  | .acp a => .acp a
  | .tau t => .tau (heal t c)

theorem fallback_offered (rows : List Row) (f : Nat) (h : fallback rows = some f) : offers rows f = true := by
  unfold fallback at h
  unfold offers
  split at h
  · rename_i r hr
    simp only [Option.some.injEq] at h
    subst h
    exact List.any_eq_true.mpr ⟨r, List.mem_of_find?_eq_some hr, by simp⟩
  · cases rows with
    | nil => simp at h
    | cons r rs =>
      simp only [List.head?_cons, Option.map_some, Option.some.injEq] at h
      subst h
      simp

theorem fallback_exists (rows : List Row) (h : rows ≠ []) : ∃ f, fallback rows = some f := by
  unfold fallback
  split
  · exact ⟨_, rfl⟩
  · cases rows with
    | nil => exact absurd rfl h
    | cons r rs => exact ⟨r.id, by simp⟩

/-- A remembered external agent is the new chat's execution, whatever the catalog says. -/
theorem acp_continuity (a : Nat) (lastTau : Tau) (c : Catalog) : resolve (some (.acp a)) lastTau c = .acp a := by
  simp [resolve, Option.getD]

/-- A remembered Tau execution whose model the loaded catalog offers is kept exactly. -/
theorem tau_continuity (t lastTau : Tau) (rows : List Row) (h : offers rows t.model = true) :
    resolve (some (.tau t)) lastTau (.loaded rows) = .tau t := by
  simp only [resolve, Option.getD, heal]
  split <;> simp [h]

/-- Without a loaded catalog the new chat starts on exactly what was remembered. -/
theorem loading_keeps (last : Option Exec) (lastTau : Tau) :
    resolve last lastTau .loading = last.getD (.tau lastTau) := by
  unfold resolve
  split <;> simp_all [heal]

theorem unavailable_keeps (last : Option Exec) (lastTau : Tau) :
    resolve last lastTau .unavailable = last.getD (.tau lastTau) := by
  unfold resolve
  split <;> simp_all [heal]

/-- With nothing remembered, the last Tau choice is resolved under the same rules. -/
theorem legacy_fallback (lastTau : Tau) (c : Catalog) : resolve none lastTau c = resolve (some (.tau lastTau)) lastTau c :=
  rfl

/-- Repair changes only the model: the host and the level survive. -/
theorem heal_keeps_host_effort (t : Tau) (c : Catalog) : (heal t c).host = t.host ∧ (heal t c).effort = t.effort := by
  unfold heal
  split
  · split
    · split <;> simp
    · simp
  · simp

theorem heal_offered (t : Tau) (rows : List Row) (h : rows ≠ []) : offers rows (heal t (.loaded rows)).model = true := by
  obtain ⟨f, hf⟩ := fallback_exists rows h
  simp only [heal, hf]
  by_cases ho : offers rows t.model = true
  · simp [ho]
  · simp [ho, fallback_offered rows f hf]

/-- With a loaded, non-empty catalog, a Tau default can start: no new chat opens on an unstartable model. -/
theorem startable_default (last : Option Exec) (lastTau t : Tau) (rows : List Row) (h : rows ≠ [])
    (hr : resolve last lastTau (.loaded rows) = .tau t) : readiness t.model (.loaded rows) = .ready := by
  unfold resolve at hr
  split at hr
  · simp at hr
  · rename_i t' _
    simp only [Exec.tau.injEq] at hr
    subst hr
    cases rows with
    | nil => exact absurd rfl h
    | cons r rs => simp [readiness, heal_offered t' (r :: rs) h]

theorem heal_idempotent (t : Tau) (c : Catalog) : heal (heal t c) c = heal t c := by
  cases c with
  | loaded rows =>
    cases hf : fallback rows with
    | none => simp [heal, hf]
    | some f =>
      by_cases ho : offers rows t.model = true
      · simp [heal, hf, ho]
      · simp [heal, hf, ho, fallback_offered rows f hf]
  | loading => simp [heal]
  | unavailable => simp [heal]

/-- Remembering the resolved default and resolving again changes nothing. -/
theorem resolve_idempotent (last : Option Exec) (lastTau : Tau) (c : Catalog) :
    resolve (some (resolve last lastTau c)) lastTau c = resolve last lastTau c := by
  cases h : last.getD (.tau lastTau) with
  | acp a => simp only [resolve, h, Option.getD_some]
  | tau t => simp only [resolve, h, Option.getD_some, heal_idempotent]

/-- As built at geospec `cd6ec2e40`: only Tau choices were remembered, and the catalog was never consulted. -/
def resolveToday (_last : Option Exec) (lastTau : Tau) (_c : Catalog) : Exec := .tau lastTau

/-- Today's counterexample (2026-10-03): after a Codex turn, the next new chat starts on Tau. -/
theorem today_drops_acp_continuity : resolveToday (some (.acp 0)) ⟨7, none, none⟩ .unavailable ≠ .acp 0 := by
  decide

/-- Today's counterexample: a retired Tau model is kept although the catalog cannot start it. -/
theorem today_keeps_unstartable_model :
    resolveToday none ⟨7, none, none⟩ (.loaded [⟨1, true⟩]) = .tau ⟨7, none, none⟩ ∧
      readiness 7 (.loaded [⟨1, true⟩]) = .notOffered := by
  decide

end NewChatExecution

#print axioms NewChatExecution.fallback_offered
#print axioms NewChatExecution.fallback_exists
#print axioms NewChatExecution.acp_continuity
#print axioms NewChatExecution.tau_continuity
#print axioms NewChatExecution.loading_keeps
#print axioms NewChatExecution.unavailable_keeps
#print axioms NewChatExecution.legacy_fallback
#print axioms NewChatExecution.heal_keeps_host_effort
#print axioms NewChatExecution.heal_offered
#print axioms NewChatExecution.startable_default
#print axioms NewChatExecution.heal_idempotent
#print axioms NewChatExecution.resolve_idempotent
#print axioms NewChatExecution.today_drops_acp_continuity
#print axioms NewChatExecution.today_keeps_unstartable_model
