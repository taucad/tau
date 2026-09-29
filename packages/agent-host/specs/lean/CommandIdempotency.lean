/-!
CommandIdempotency — command idempotency through the ledger's applied set (W4 seam contract T14; I14, D15).

The log is abstracted to the list of command ids its decision rows carry; the applied set is membership in that
list (W3's fold derives it from the rows). The owner's decision (`decide`) is arbitrary: the theorems hold for every
decision function, so they hold for the owner's. `SeamDelivery.tla`'s `Known` assumes exactly this contract.

The theorems sit in `ChatLedger` because the Lean tier audits every theorem of this directory as
`ChatLedger.<name>`; the model's definitions stay in `ChatLedger.CommandIdempotency`.
-/
namespace ChatLedger.CommandIdempotency

inductive Status where
  | applied
  | replayed
  | refused
  deriving DecidableEq, Repr

/-- The command ids stamped on the log's decision rows, in order. -/
abbrev Log := List Nat

/-- One delivery: answer from the applied set, else decide and append one row. -/
def handle (decide : Log → Nat → Bool) (log : Log) (k : Nat) : Log × Status :=
  if k ∈ log then (log, .replayed)
  else if decide log k then (log ++ [k], .applied)
  else (log, .refused)

/-- Any sequence of deliveries, duplicates and re-sends included. -/
def run (decide : Log → Nat → Bool) : Log → List Nat → Log
  | log, [] => log
  | log, k :: ks => run decide (handle decide log k).1 ks

end ChatLedger.CommandIdempotency

namespace ChatLedger
open CommandIdempotency

/-- A refused command leaves no record (D15). -/
theorem refused_leaves_no_record (d : Log → Nat → Bool) (log : Log) (k : Nat)
    (h : (handle d log k).2 = .refused) : (handle d log k).1 = log := by
  unfold handle at *
  by_cases h1 : k ∈ log
  · simp [h1]
  · by_cases h2 : d log k = true
    · simp [h1, h2] at h
    · simp [h1, h2]

/-- A duplicate of an applied or replayed command answers `replayed` and changes nothing. -/
theorem duplicate_replays (d : Log → Nat → Bool) (log : Log) (k : Nat)
    (h : (handle d log k).2 ≠ .refused) :
    handle d (handle d log k).1 k = ((handle d log k).1, .replayed) := by
  unfold handle at *
  by_cases h1 : k ∈ log
  · simp [h1]
  · by_cases h2 : d log k = true
    · simp [h1, h2]
    · simp [h1, h2] at h

/-- Rows are never removed, so a recorded id stays recorded. -/
theorem mem_handle (d : Log → Nat → Bool) (log : Log) (j k : Nat)
    (h : k ∈ log) : k ∈ (handle d log j).1 := by
  unfold handle
  by_cases h1 : j ∈ log
  · simp [h1, h]
  · by_cases h2 : d log j = true
    · simp [h1, h2, h]
    · simp [h1, h2, h]

theorem mem_run (d : Log → Nat → Bool) (ks : List Nat) :
    ∀ (log : Log) (k : Nat), k ∈ log → k ∈ run d log ks := by
  induction ks with
  | nil => intro log k h; simpa [run] using h
  | cons j ks ih => intro log k h; exact ih _ k (mem_handle d log j k h)

/-- However late the re-send, an applied id answers `replayed`. -/
theorem replay_after_any_deliveries (d : Log → Nat → Bool) (log : Log) (ks : List Nat)
    (k : Nat) (h : k ∈ log) : (handle d (run d log ks) k).2 = .replayed := by
  have hm := mem_run d ks log k h
  unfold handle
  simp [hm]

/-- One delivery never records an id twice. -/
theorem handle_nodup (d : Log → Nat → Bool) (log : Log) (k : Nat)
    (h : log.Nodup) : (handle d log k).1.Nodup := by
  unfold handle
  by_cases h1 : k ∈ log
  · simp [h1, h]
  · by_cases h2 : d log k = true
    · simp only [h1, h2, ite_false, ite_true]
      simp only [List.nodup_append, h, List.nodup_cons, List.not_mem_nil, not_false_eq_true,
        List.nodup_nil, and_self, List.mem_singleton, true_and]
      intro a ha b hb hab
      subst hb
      subst hab
      exact h1 ha
    · simp [h1, h2, h]

/-- I14's safety core: under any delivery sequence, each id has at most one row. -/
theorem at_most_one_row_per_id (d : Log → Nat → Bool) (ks : List Nat) :
    ∀ (log : Log), log.Nodup → (run d log ks).Nodup := by
  induction ks with
  | nil => intro log h; simpa [run] using h
  | cons j ks ih => intro log h; exact ih _ (handle_nodup d log j h)

end ChatLedger

/-! Axiom audit: every result uses only Lean's standard axioms; none uses sorryAx. -/
#print axioms ChatLedger.refused_leaves_no_record
#print axioms ChatLedger.duplicate_replays
#print axioms ChatLedger.mem_handle
#print axioms ChatLedger.mem_run
#print axioms ChatLedger.replay_after_any_deliveries
#print axioms ChatLedger.handle_nodup
#print axioms ChatLedger.at_most_one_row_per_id
