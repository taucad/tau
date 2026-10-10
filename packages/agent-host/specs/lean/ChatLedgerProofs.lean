import ChatLedger

/-!
ChatLedger proofs for the W3 code. Each theorem names the law it settles (T1–T9 of the chat-log blueprint) and is
stated over the executable model in `ChatLedger.lean`, which the committed goldens tie to the TypeScript.
Concrete witnesses are closed by `decide` (kernel evaluation of the model).
-/
namespace ChatLedger

/-! ## Association lists -/

theorem lookup_upsert {β : Type} (k r : Nat) (v : β) (l : List (Nat × β)) :
    lookup r (upsert k v l) = if k = r then some v else lookup r l := by
  induction l with
  | nil => simp [upsert, lookup]
  | cons p rest ih =>
    obtain ⟨k', v'⟩ := p
    by_cases h : k' = k
    · subst h; by_cases hr : k' = r <;> simp [upsert, lookup, hr]
    · by_cases h2 : k' = r
      · subst h2; simp [upsert, lookup, h, Ne.symm h]
      · simp [upsert, lookup, h, h2, ih]

theorem lookup_append_single {β : Type} (k r : Nat) (v : β) (l : List (Nat × β)) :
    lookup r (l ++ [(k, v)]) = match lookup r l with
      | some w => some w
      | none => if k = r then some v else none := by
  induction l with
  | nil => simp [lookup]
  | cons p rest ih =>
    obtain ⟨k', v'⟩ := p
    by_cases h : k' = r <;> simp [lookup, h, ih]

/-! ## event-sequence.ts -/

/-- The sequence half of the tolerant replay. -/
def Seq.replay (S : Seq) (e : Row) : Seq :=
  match S.verdict e with
  | .dup => S
  | .mutated => S
  | _ => S.commit e

theorem replay_seq (R : Reducer) (e : Row) : (R.replay e).1.seq = R.seq.replay e := by
  unfold Reducer.replay Seq.replay
  cases R.seq.verdict e <;> simp
  all_goals (split <;> (try split) <;> simp)

theorem replayLog_seq (R : Reducer) (rs : List Row) : (replayLog R rs).1.seq = rs.foldl Seq.replay R.seq := by
  induction rs generalizing R with
  | nil => rfl
  | cons e es ih => simp [replayLog, ih, replay_seq]

theorem replayLog_append (R : Reducer) (rs : List Row) (e : Row) :
    replayLog R (rs ++ [e]) =
      (((replayLog R rs).1.replay e).1, (replayLog R rs).2 ++ ((replayLog R rs).1.replay e).2.toList) := by
  induction rs generalizing R with
  | nil => simp [replayLog]
  | cons x xs ih => simp [replayLog, ih]

/-- The sequence a file's rows replay to. -/
def seqOf (rows : List Row) : Seq := rows.foldl Seq.replay {}

/-- `cursorFingerprints` holds one row per key. -/
def Seq.Keyed (S : Seq) : Prop := (S.rows.map Row.key).Nodup

theorem verdict_found {S : Seq} {e : Row} {f : Row}
    (hf : S.rows.find? (fun x => decide (x.key = e.key)) = some f) :
    S.verdict e = (if f.fp = e.fp then .dup else .mutated) := by
  simp [Seq.verdict, hf]

theorem find_none_of_verdict {S : Seq} {e : Row} (h : S.verdict e = .fresh ∨ S.verdict e = .order) :
    S.rows.find? (fun x => decide (x.key = e.key)) = none := by
  cases hf : S.rows.find? (fun x => decide (x.key = e.key)) with
  | none => rfl
  | some f => rw [verdict_found hf] at h; split at h <;> simp at h

theorem keyed_commit {S : Seq} {e : Row} (hk : S.Keyed)
    (hf : S.rows.find? (fun x => decide (x.key = e.key)) = none) : (S.commit e).Keyed := by
  unfold Seq.Keyed Seq.commit at *
  rw [List.find?_eq_none] at hf
  simp only [List.map_append, List.map_cons, List.map_nil]
  refine List.nodup_append.2 ⟨hk, by simp, ?_⟩
  intro a ha b hb
  simp only [List.mem_singleton] at hb
  subst hb
  simp only [List.mem_map] at ha
  obtain ⟨x, hx, rfl⟩ := ha
  have := hf x hx
  simpa using this

theorem keyed_replay {S : Seq} (e : Row) (hk : S.Keyed) : (S.replay e).Keyed := by
  unfold Seq.replay
  cases hv : S.verdict e <;> simp only
  all_goals first
    | exact hk
    | exact keyed_commit hk (find_none_of_verdict (by simp [hv]))

theorem keyed_seqOf (rows : List Row) : (seqOf rows).Keyed := by
  unfold seqOf
  suffices ∀ S : Seq, S.Keyed → (rows.foldl Seq.replay S).Keyed from this {} (by simp [Seq.Keyed])
  induction rows with
  | nil => intro S h; exact h
  | cons e es ih => intro S h; exact ih _ (keyed_replay e h)

theorem key_held_of_verdict {S : Seq} {e : Row} (h : S.verdict e = .dup ∨ S.verdict e = .mutated) :
    e.key ∈ S.rows.map Row.key := by
  cases hf : S.rows.find? (fun x => decide (x.key = e.key)) with
  | none =>
    unfold Seq.verdict at h
    rw [hf] at h
    revert h
    simp only
    repeat' split
    all_goals simp
  | some f =>
    have hm := List.mem_of_find?_eq_some hf
    have hp := List.find?_some hf
    simp only [decide_eq_true_eq] at hp
    exact List.mem_map.2 ⟨f, hm, hp⟩

theorem key_mem_replay (S : Seq) (e : Row) (k : Key) :
    k ∈ (S.replay e).rows.map Row.key ↔ k ∈ S.rows.map Row.key ∨ k = e.key := by
  unfold Seq.replay
  cases hv : S.verdict e
  · simp [Seq.commit]
  · have := key_held_of_verdict (Or.inl hv)
    constructor
    · exact Or.inl
    · rintro (h | rfl) <;> assumption
  · have := key_held_of_verdict (Or.inr hv)
    constructor
    · exact Or.inl
    · rintro (h | rfl) <;> assumption
  · simp [Seq.commit]

/-- Every key of the file's rows is held by the replayed sequence (the first copy of the key). -/
theorem key_mem_seqOf (rows : List Row) (x : Row) (hx : x ∈ rows) : x.key ∈ (seqOf rows).rows.map Row.key := by
  unfold seqOf
  suffices ∀ S : Seq, ∀ k, k ∈ S.rows.map Row.key ∨ k ∈ rows.map Row.key →
      k ∈ (rows.foldl Seq.replay S).rows.map Row.key from
    this {} x.key (Or.inr (List.mem_map.2 ⟨x, hx, rfl⟩))
  clear hx
  induction rows with
  | nil => intro S k h; simpa using h
  | cons e es ih =>
    intro S k h
    apply ih
    rcases h with h | h
    · exact Or.inl ((key_mem_replay S e k).2 (Or.inl h))
    · simp only [List.map_cons, List.mem_cons] at h
      rcases h with h | h
      · exact Or.inl ((key_mem_replay S e k).2 (Or.inr h))
      · exact Or.inr h

theorem eq_of_key_eq {l : List Row} (hk : (l.map Row.key).Nodup) {a b : Row} (ha : a ∈ l) (hb : b ∈ l)
    (h : a.key = b.key) : a = b := by
  induction l with
  | nil => simp at ha
  | cons x xs ih =>
    simp only [List.map_cons, List.nodup_cons, List.mem_map] at hk
    simp only [List.mem_cons] at ha hb
    rcases ha with rfl | ha <;> rcases hb with rfl | hb
    · rfl
    · exact absurd ⟨b, hb, h.symm⟩ hk.1
    · exact absurd ⟨a, ha, h⟩ hk.1
    · exact ih hk.2 ha hb

/-- **T1** (sequence form): a row identical to a held row is a duplicate. -/
theorem t1_duplicate {S : Seq} (hk : S.Keyed) {x e : Row} (hx : x ∈ S.rows) (hkey : e.key = x.key)
    (hfp : e.fp = x.fp) : S.verdict e = .dup := by
  cases hf : S.rows.find? (fun y => decide (y.key = e.key)) with
  | none =>
    rw [List.find?_eq_none] at hf
    exact absurd (by simp [hkey]) (hf x hx)
  | some f =>
    have hp := List.find?_some hf
    simp only [decide_eq_true_eq] at hp
    have : f = x := eq_of_key_eq hk (List.mem_of_find?_eq_some hf) hx (hp.trans hkey)
    subst this
    rw [verdict_found hf]; simp [hfp]

/-- **T1** (sequence form): the same key with different content is `EVENT_MUTATED`. -/
theorem t1_mutated {S : Seq} (hk : S.Keyed) {x e : Row} (hx : x ∈ S.rows) (hkey : e.key = x.key)
    (hfp : e.fp ≠ x.fp) : S.verdict e = .mutated := by
  cases hf : S.rows.find? (fun y => decide (y.key = e.key)) with
  | none =>
    rw [List.find?_eq_none] at hf
    exact absurd (by simp [hkey]) (hf x hx)
  | some f =>
    have hp := List.find?_some hf
    simp only [decide_eq_true_eq] at hp
    have : f = x := eq_of_key_eq hk (List.mem_of_find?_eq_some hf) hx (hp.trans hkey)
    subst this
    rw [verdict_found hf]; simp [Ne.symm hfp]

/-- A held key is never fresh: its row is a duplicate or a mutation. -/
theorem verdict_held {S : Seq} {e : Row} (h : e.key ∈ S.rows.map Row.key) :
    S.verdict e = .dup ∨ S.verdict e = .mutated := by
  cases hf : S.rows.find? (fun y => decide (y.key = e.key)) with
  | none =>
    rw [List.find?_eq_none] at hf
    obtain ⟨x, hx, hxk⟩ := List.mem_map.1 h
    exact absurd (by simp [hxk]) (hf x hx)
  | some f => rw [verdict_found hf]; split <;> simp

/-! ## The appender over a shared file (event-log-appender.ts) -/

theorem rowsOf_append (a b : List Line) : rowsOf (a ++ b) = rowsOf a ++ rowsOf b := by
  induction a with
  | nil => rfl
  | cons l ls ih => cases l <;> simp [rowsOf, ih]

@[simp] theorem rows_write_row (F : File) (e : Row) : (F.write (.row e)).rows = F.rows ++ [e] := by
  simp [File.write, File.rows, rowsOf_append, rowsOf]

@[simp] theorem rows_write_junk (F : File) : (F.write .junk).rows = F.rows := by
  simp [File.write, File.rows, rowsOf_append, rowsOf]

@[simp] theorem rows_tear (F : File) : F.tear.rows = F.rows := rfl

/-- The reducer a file's rows replay to: what an open holds. -/
def X (F : File) : Reducer := (replayLog {} F.rows).1

theorem X_seq (F : File) : (X F).seq = seqOf F.rows := by
  simp [X, replayLog_seq, seqOf]

theorem prepare_ok {R R' : Reducer} {e : Row} (h : R.prepare e = .ok (some R')) :
    R.seq.verdict e = .fresh ∧ R'.seq = R.seq.commit e ∧ R'.intact = R.intact ∧
    (e.isOpaque = true → R'.hist = R.hist) ∧ (e.isOpaque = false → R.hist.transition e = some R'.hist) := by
  unfold Reducer.prepare at h
  cases hv : R.seq.verdict e <;> simp only [hv, reduceCtorEq] at h
  · simp only [true_and]
    split at h
    · rename_i ho
      simp only [Except.ok.injEq, Option.some.injEq] at h
      subst h
      simp [ho]
    · rename_i ho
      split at h
      · rename_i hh ht
        simp only [Except.ok.injEq, Option.some.injEq] at h
        subst h
        simp_all
      · simp at h
  all_goals simp at h

/-- What one `append` did: nothing to the file (any refusal or a duplicate; the appender keeps its view), or the
guarded append of a current appender's prepared row. -/
theorem append_cases (F : File) (A : App) (e : Row) :
    ((append F A e).1 = F ∧ (append F A e).2.2 ≠ .appended ∧ (append F A e).2.1.red = A.red ∧
      (append F A e).2.1.view = A.view ∧ (append F A e).2.1.lines = A.lines) ∨
    (current F A = true ∧ A.fenced = false ∧ (append F A e).2.2 = .appended ∧
      (append F A e).1 = { lines := F.lines ++ [.row e], torn := 0 } ∧
      ∃ R', A.red.prepare e = .ok (some R') ∧
        (append F A e).2.1 = { A with red := R', view := A.view ++ [e], lines := A.lines + 1, torn := 0 }) := by
  unfold append
  by_cases hf : A.fenced = true
  · simp [hf]
  · simp only [hf, Bool.false_eq_true, ite_false]
    by_cases hi : e.invalid = true
    · simp [hi]
    · simp only [hi, Bool.false_eq_true, ite_false]
      cases hp : A.red.prepare e with
      | error r => simp
      | ok o =>
        cases o with
        | none => simp
        | some R' =>
          simp only
          by_cases hc : current F A = true
          · simp only [hc, ite_true]
            right
            exact ⟨by simp, by simp, by simp, by simp, R', by simp, by simp⟩
          · simp [hc]

/-- **T9** (a refused append writes nothing): any outcome but `appended` leaves the file as it was. -/
theorem t9_refused_writes_nothing (F : File) (A : App) (e : Row) (h : (append F A e).2.2 ≠ .appended) :
    (append F A e).1 = F := by
  rcases append_cases F A e with h1 | h1
  · exact h1.1
  · exact absurd h1.2.2.1 h

/-- **T9** (a stale view writes nothing): an appender whose view is not the file — another writer appended, or a
torn tail it did not see — never writes. -/
theorem t9_stale_writes_nothing (F : File) (A : App) (e : Row) (h : current F A = false) :
    (append F A e).1 = F ∧ (append F A e).2.2 ≠ .appended := by
  rcases append_cases F A e with h1 | h1
  · exact ⟨h1.1, h1.2.1⟩
  · simp [h] at h1

/-- An appender's view agrees with the file whenever it covers every line: the file's rows, their sequence, and
(while the history is intact) their history. -/
def Good (F : File) (A : App) : Prop :=
  A.lines ≤ F.lines.length ∧
  (A.lines = F.lines.length → A.view = F.rows ∧ A.red.seq = (X F).seq ∧ A.red.intact = (X F).intact ∧
    ((X F).intact = true → A.red.hist = (X F).hist))

theorem good_open (F : File) : Good F (openApp F) := by
  refine ⟨Nat.le_refl _, fun _ => ⟨rfl, rfl, rfl, fun _ => rfl⟩⟩

theorem good_write {F : File} {A : App} (l : Line) (h : Good F A) : Good (F.write l) A := by
  refine ⟨?_, fun he => ?_⟩
  · simp [File.write]; exact Nat.le_succ_of_le h.1
  · simp [File.write] at he; have := h.1; omega

theorem good_tear {F : File} {A : App} (h : Good F A) : Good F.tear A := h

theorem X_append_row (F : File) (e : Row) (t : Nat) :
    X { lines := F.lines ++ [.row e], torn := t } = ((X F).replay e).1 := by
  have : ({ lines := F.lines ++ [.row e], torn := t } : File).rows = F.rows ++ [e] := by
    simp [File.rows, rowsOf_append, rowsOf]
  simp [X, this, replayLog_append]

theorem good_append_other {F : File} {A B : App} (e : Row) (h : Good F B) : Good (append F A e).1 B := by
  rcases append_cases F A e with h1 | h1
  · rw [h1.1]; exact h
  · rw [h1.2.2.2.1]
    refine ⟨?_, fun he => ?_⟩
    · simp; exact Nat.le_succ_of_le h.1
    · simp at he; have := h.1; omega

theorem good_append_self {F : File} {A : App} (e : Row) (h : Good F A) :
    Good (append F A e).1 (append F A e).2.1 := by
  rcases append_cases F A e with h1 | ⟨hc, _, _, hF, R', hp, hA⟩
  · rw [h1.1]
    refine ⟨h1.2.2.2.2 ▸ h.1, fun he => ?_⟩
    rw [h1.2.2.2.2] at he
    obtain ⟨h2, h3, h4, h5⟩ := h.2 he
    exact ⟨h1.2.2.2.1 ▸ h2, h1.2.2.1 ▸ h3, h1.2.2.1 ▸ h4, h1.2.2.1 ▸ h5⟩
  · rw [hF, hA]
    simp only [current, Bool.and_eq_true, decide_eq_true_eq] at hc
    obtain ⟨hv, hs, hi, hh⟩ := h.2 hc.1.symm
    obtain ⟨hfr, hseq, hint, hop, htr⟩ := prepare_ok hp
    rw [hs] at hfr
    refine ⟨by simp [hc.1], fun _ => ⟨?_, ?_⟩⟩
    · simp [File.rows, rowsOf_append, rowsOf, hv]
    · rw [X_append_row]
      simp only [Reducer.replay, hfr]
      cases ho : e.isOpaque
      · cases hx : (X F).intact
        · simp [hseq, hs, hint, hi, hx]
        · have ht := htr ho
          rw [hh hx] at ht
          simp [ht, hseq, hs, hint, hi, hx]
      · simp [hseq, hs, hint, hi, hop ho] <;> exact hh

/-- The file and every appender opened on it. -/
structure Sys where
  file : File
  apps : List App

/-- Reachable systems. Appenders open at any time, append in any interleaving (stale ones included) and a torn
fragment may land at any time; with `raw`, other writers' lines (rows or junk) may land too. -/
inductive Reach (raw : Bool) : Sys → Prop
  | init (F : File) : (raw = true ∨ F = {}) → Reach raw ⟨F, []⟩
  | openStep {s : Sys} : Reach raw s → Reach raw ⟨s.file, s.apps ++ [openApp s.file]⟩
  | appendStep {s : Sys} (i : Nat) (hi : i < s.apps.length) (e : Row) : Reach raw s →
      Reach raw ⟨(append s.file s.apps[i] e).1, s.apps.set i (append s.file s.apps[i] e).2.1⟩
  | tearStep {s : Sys} : Reach raw s → Reach raw ⟨s.file.tear, s.apps⟩
  | writeStep {s : Sys} (l : Line) : raw = true → Reach raw s → Reach raw ⟨s.file.write l, s.apps⟩

theorem reach_good {raw : Bool} {s : Sys} (h : Reach raw s) : ∀ A ∈ s.apps, Good s.file A := by
  induction h with
  | init F _ => simp
  | openStep _ ih =>
    intro A hA
    simp only [List.mem_append, List.mem_singleton] at hA
    rcases hA with hA | rfl
    · exact ih A hA
    · exact good_open _
  | appendStep i hi e _ ih =>
    intro A hA
    rcases List.mem_or_eq_of_mem_set hA with hA | rfl
    · exact good_append_other e (ih A hA)
    · exact good_append_self e (ih _ (List.getElem_mem hi))
  | tearStep _ ih => intro A hA; exact good_tear (ih A hA)
  | writeStep l _ _ ih => intro A hA; exact good_write l (ih A hA)

/-- **T1** (across reloads and appenders): once the file holds a row, no appender — freshly reopened, current or
stale — ever writes another row under its key, whatever other writers did. -/
theorem t1_held_key_never_writes {raw : Bool} {s : Sys} (h : Reach raw s) {A : App} (hA : A ∈ s.apps)
    {x e : Row} (hx : x ∈ s.file.rows) (hkey : e.key = x.key) : (append s.file A e).1 = s.file := by
  rcases append_cases s.file A e with h1 | ⟨hc, _, _, _, R', hp, _⟩
  · exact h1.1
  · exfalso
    simp only [current, Bool.and_eq_true, decide_eq_true_eq] at hc
    have hg := (reach_good h A hA).2 hc.1.symm
    have hfr := (prepare_ok hp).1
    rw [hg.2.1, X_seq] at hfr
    have hk := key_mem_seqOf s.file.rows x hx
    rw [← hkey] at hk
    rcases verdict_held hk with hv | hv <;> rw [hv] at hfr <;> cases hfr

/-! ## T2: the term rules on a log written only through the appenders -/

theorem snoc_induction {α : Type} {motive : List α → Prop} (nil : motive [])
    (append_singleton : ∀ l a, motive l → motive (l ++ [a])) (l : List α) : motive l := by
  rw [← List.reverse_reverse l]
  induction l.reverse with
  | nil => exact nil
  | cons a t ih => rw [List.reverse_cons]; exact append_singleton _ _ ih

/-- Every row passed the strict term rules against the rows before it. -/
def StrictRows : Seq → List Row → Prop
  | _, [] => True
  | S, e :: es => S.verdict e = .fresh ∧ StrictRows (S.commit e) es

def commitAll (S : Seq) (rs : List Row) : Seq := rs.foldl Seq.commit S

theorem commitAll_snoc (S : Seq) (rs : List Row) (e : Row) :
    commitAll S (rs ++ [e]) = (commitAll S rs).commit e := by
  simp [commitAll, List.foldl_append]

theorem strict_append (S : Seq) (rs : List Row) (e : Row) :
    StrictRows S (rs ++ [e]) ↔ StrictRows S rs ∧ (commitAll S rs).verdict e = .fresh := by
  induction rs generalizing S with
  | nil => simp [StrictRows, commitAll]
  | cons x xs ih =>
    simp only [List.cons_append, StrictRows, ih, commitAll, List.foldl_cons]
    constructor
    · rintro ⟨h1, h2, h3⟩; exact ⟨⟨h1, h2⟩, h3⟩
    · rintro ⟨⟨h1, h2⟩, h3⟩; exact ⟨h1, h2, h3⟩

theorem strict_replay {S : Seq} {rs : List Row} (h : StrictRows S rs) : rs.foldl Seq.replay S = commitAll S rs := by
  induction rs generalizing S with
  | nil => rfl
  | cons e es ih =>
    simp only [StrictRows] at h
    simp only [List.foldl_cons, commitAll]
    have : S.replay e = S.commit e := by simp [Seq.replay, h.1]
    rw [this]; exact ih h.2

theorem commitAll_rows (S : Seq) (rs : List Row) : (commitAll S rs).rows = S.rows ++ rs := by
  induction rs generalizing S with
  | nil => simp [commitAll]
  | cons e es ih => simp [commitAll] at ih ⊢; rw [ih]; simp [Seq.commit]

theorem commitAll_max {rs : List Row} {x : Row} (hx : x ∈ rs) : x.epoch ≤ (commitAll {} rs).maxEpoch := by
  induction rs using snoc_induction with
  | nil => simp at hx
  | append_singleton rs e ih =>
    rw [commitAll_snoc]
    simp only [List.mem_append, List.mem_singleton] at hx
    simp only [Seq.commit]
    rcases hx with hx | rfl
    · exact Nat.le_trans (ih hx) (Nat.le_max_left _ _)
    · exact Nat.le_max_right _ _

theorem commitAll_epochs_isSome (rs : List Row) (t : Nat) :
    (lookup t (commitAll {} rs).epochs).isSome = true ↔ ∃ x ∈ rs, x.term = t := by
  induction rs using snoc_induction with
  | nil => simp [commitAll, lookup]
  | append_singleton rs e ih =>
    rw [commitAll_snoc]
    simp only [Seq.commit, List.mem_append, List.mem_singleton]
    split
    · rename_i hs
      rw [ih]
      constructor
      · rintro ⟨x, hx, rfl⟩; exact ⟨x, Or.inl hx, rfl⟩
      · rintro ⟨x, hx | rfl, rfl⟩
        · exact ⟨x, hx, rfl⟩
        · exact ih.1 hs
    · rw [lookup_append_single]
      cases hl : lookup t (commitAll {} rs).epochs with
      | some w =>
        simp only [Option.isSome_some, true_iff]
        obtain ⟨x, hx, rfl⟩ := ih.1 (by simp [hl])
        exact ⟨x, Or.inl hx, rfl⟩
      | none =>
        have hn : ¬ ∃ x ∈ rs, x.term = t := fun h => by simpa [hl] using ih.2 h
        by_cases ht : e.term = t
        · simp [ht]
        · simp only [ht, ite_false, Option.isSome_none, Bool.false_eq_true, false_iff]
          rintro ⟨x, hx | rfl, hxt⟩
          · exact hn ⟨x, hx, hxt⟩
          · exact ht hxt

theorem verdict_fresh {S : Seq} {e : Row} (h : S.verdict e = .fresh) :
    (S.active = some e.term ∧ e.seq = S.last + 1 ∧ lookup e.term S.epochs = some e.epoch) ∨
    (S.active ≠ some e.term ∧ lookup e.term S.epochs = none ∧ e.seq = 0 ∧ claims S.maxEpoch e.epoch = true) := by
  have hf := find_none_of_verdict (Or.inl h)
  simp only [Seq.verdict, hf] at h
  by_cases ha : S.active = some e.term
  · simp only [ha, ite_true] at h
    split at h
    · rename_i hc; exact Or.inl ⟨ha, hc.1, hc.2⟩
    · cases h
  · simp only [ha, ite_false] at h
    split at h
    · cases h
    · rename_i hs
      split at h
      · rename_i hc
        refine Or.inr ⟨ha, ?_, hc.1, hc.2⟩
        cases hl : lookup e.term S.epochs with
        | none => rfl
        | some _ => simp [hl] at hs
      · cases h

theorem strict_epoch {rs : List Row} (h : StrictRows {} rs) {x : Row} (hx : x ∈ rs) :
    lookup x.term (commitAll {} rs).epochs = some x.epoch := by
  induction rs using snoc_induction with
  | nil => simp at hx
  | append_singleton rs e ih =>
    rw [strict_append] at h
    rw [commitAll_snoc]
    simp only [Seq.commit]
    simp only [List.mem_append, List.mem_singleton] at hx
    rcases hx with hx | rfl
    · have := ih h.1 hx
      split
      · exact this
      · rw [lookup_append_single, this]
    · rcases verdict_fresh h.2 with ⟨_, _, hl⟩ | ⟨_, hl, _, _⟩
      · simp [hl]
      · simp [hl, lookup_append_single]

/-- **T2** (a term starts at 0, and a claim exceeds every epoch): the first row of a term on a strictly written log
has sequence 0 and an epoch above every earlier row's, unless the whole log so far is legacy (no epochs). -/
theorem t2_new_term {rs : List Row} {e : Row} (h : StrictRows {} (rs ++ [e])) (hn : ∀ x ∈ rs, x.term ≠ e.term) :
    e.seq = 0 ∧ ((∀ x ∈ rs, x.epoch < e.epoch) ∨ (e.epoch = 0 ∧ ∀ x ∈ rs, x.epoch = 0)) := by
  rw [strict_append] at h
  have hnone : lookup e.term (commitAll {} rs).epochs = none := by
    cases hl : lookup e.term (commitAll {} rs).epochs with
    | none => rfl
    | some w =>
      obtain ⟨x, hx, ht⟩ := (commitAll_epochs_isSome rs e.term).1 (by simp [hl])
      exact absurd ht (hn x hx)
  rcases verdict_fresh h.2 with ⟨_, _, hl⟩ | ⟨_, _, hs, hc⟩
  · rw [hnone] at hl; cases hl
  · refine ⟨hs, ?_⟩
    simp only [claims, Bool.or_eq_true, decide_eq_true_eq, Bool.and_eq_true, beq_iff_eq] at hc
    rcases hc with hc | ⟨h0, hm⟩
    · exact Or.inl fun x hx => Nat.lt_of_le_of_lt (commitAll_max hx) hc
    · exact Or.inr ⟨h0, fun x hx => by have := commitAll_max hx; omega⟩

/-- **T2** (a term is contiguous and repeats its epoch): a later row of a term directly follows the log's last row,
which is of the same term, with the next sequence and the term's epoch. -/
theorem t2_contiguous {rs : List Row} {e x : Row} (h : StrictRows {} (rs ++ [e])) (hx : x ∈ rs)
    (ht : x.term = e.term) :
    ∃ l, rs.getLast? = some l ∧ l.term = e.term ∧ e.seq = l.seq + 1 ∧ e.epoch = x.epoch := by
  rw [strict_append] at h
  have hsome := strict_epoch h.1 hx
  rw [ht] at hsome
  rcases verdict_fresh h.2 with ⟨ha, hs, hl⟩ | ⟨_, hl, _, _⟩
  · obtain ⟨rs', l, rfl⟩ : ∃ rs' l, rs = rs' ++ [l] := by
      rcases List.eq_nil_or_concat rs with h0 | ⟨rs', l, h1⟩
      · subst h0; simp at hx
      · exact ⟨rs', l, by simpa using h1⟩
    rw [commitAll_snoc] at ha hs
    simp only [Seq.commit, Option.some.injEq] at ha hs
    refine ⟨l, by simp, ha, hs, ?_⟩
    rw [hl] at hsome; exact Option.some.inj hsome
  · rw [hl] at hsome; cases hsome

/-! ## T9 and T2 for the system: any interleaving of appenders keeps the log strict and clean -/

/-- The file is strictly written and opens with no anomaly. -/
def Clean (F : File) : Prop := StrictRows {} F.rows ∧ openAnomalies F = [] ∧ (X F).intact = true

theorem clean_empty : Clean ({} : File) := by
  refine ⟨trivial, rfl, rfl⟩

theorem clean_append {F : File} {A : App} (e : Row) (hc : Clean F) (hg : Good F A) : Clean (append F A e).1 := by
  rcases append_cases F A e with h1 | ⟨hcur, _, _, hF, R', hp, _⟩
  · rw [h1.1]; exact hc
  · rw [hF]
    simp only [current, Bool.and_eq_true, decide_eq_true_eq] at hcur
    obtain ⟨_, hs, _, hh⟩ := hg.2 hcur.1.symm
    obtain ⟨hfr, _, _, _, htr⟩ := prepare_ok hp
    obtain ⟨hstrict, hanom, hint⟩ := hc
    have hseqX : (X F).seq = commitAll {} F.rows := by rw [X_seq, seqOf, strict_replay hstrict]
    rw [hs, hseqX] at hfr
    have hrows : ({ lines := F.lines ++ [.row e], torn := 0 } : File).rows = F.rows ++ [e] := by
      simp [File.rows, rowsOf_append, rowsOf]
    have hfrX : (X F).seq.verdict e = .fresh := by rw [hseqX]; exact hfr
    have hrep : ((X F).replay e).2 = none ∧ ((X F).replay e).1.intact = true := by
      simp only [Reducer.replay, hfrX]
      cases ho : e.isOpaque
      · have ht := htr ho
        rw [hh hint] at ht
        simp [ht, hint]
      · simp [hint]
    unfold openAnomalies at hanom
    rw [List.append_eq_nil_iff] at hanom
    refine ⟨?_, ?_, ?_⟩
    · rw [hrows, strict_append]; exact ⟨hstrict, hfr⟩
    · have h2 : (replayLog {} F.rows).2 = [] := hanom.2
      have h1 : List.filter (fun l => decide (l = Line.junk)) F.lines = [] := by
        have := hanom.1; simpa using this
      have h3 : ((replayLog {} F.rows).1.replay e).2 = none := hrep.1
      unfold openAnomalies
      rw [hrows, replayLog_append, h2]
      simp [List.filter_append, h1, h3]
    · rw [X_append_row]; exact hrep.2

theorem reach_clean {s : Sys} (h : Reach false s) : Clean s.file := by
  induction h with
  | init F hF => simp at hF; subst hF; exact clean_empty
  | openStep _ ih => exact ih
  | appendStep i hi e hr ih => exact clean_append e ih (reach_good hr _ (List.getElem_mem hi))
  | tearStep _ ih => exact ih
  | writeStep _ hraw => cases hraw

/-- **T9** (the log stays readable after any interleaving of stale appends): however many appenders open, at
whatever times, and however their appends, torn fragments and reopenings interleave, the file opens with no
anomaly — no quarantined line, no broken term rule, no conflicting copy, no rejected history. -/
theorem t9_log_stays_clean {s : Sys} (h : Reach false s) : openAnomalies s.file = [] := (reach_clean h).2.1

/-- **T2** (appender-enforced): every file the appenders write satisfies the term rules row by row, so
`t2_new_term` and `t2_contiguous` hold of it. -/
theorem t2_appender_enforced {s : Sys} (h : Reach false s) : StrictRows {} s.file.rows := (reach_clean h).1

/-- **T1** (idempotency across reloads): on such a file, an appender whose view covers the file answers a row
identical to a held row `duplicate` and a differing row under a held key `EVENT_MUTATED`; neither writes. -/
theorem t1_identical_is_noop {s : Sys} (h : Reach false s) {A : App} (hA : A ∈ s.apps)
    (hcov : A.lines = s.file.lines.length) (hlive : A.fenced = false) {x e : Row} (hx : x ∈ s.file.rows)
    (hkey : e.key = x.key) (hvalid : e.invalid = false) :
    (append s.file A e).2.2 = (if e.fp = x.fp then .duplicate else .refused .mutated) := by
  have hg := (reach_good h A hA).2 hcov
  have hc := reach_clean h
  have hseq : A.red.seq = commitAll {} s.file.rows := by rw [hg.2.1, X_seq, seqOf, strict_replay hc.1]
  have hk : (commitAll {} s.file.rows).Keyed := by
    rw [← strict_replay hc.1]; exact keyed_seqOf _
  have hmem : x ∈ (commitAll {} s.file.rows).rows := by rw [commitAll_rows]; simpa using hx
  unfold append
  simp only [hlive, hvalid, Bool.false_eq_true, ite_false, Reducer.prepare, hseq]
  by_cases hfp : e.fp = x.fp
  · simp [t1_duplicate hk hmem hkey hfp, hfp]
  · simp [t1_mutated hk hmem hkey hfp, hfp]

/-! ## T3: one settlement per attempt, and none discarded (chat-ledger.ts) -/

theorem entry_put (L : Ledger) (r r' : Nat) (en : Entry) :
    (L.put r en).entry r' = if r = r' then en else L.entry r' := by
  simp only [Ledger.put, Ledger.entry, lookup_upsert]; split <;> rfl

/-- Every run's settlements are unchanged. -/
def SameSettle (L L' : Ledger) : Prop := ∀ r, (L'.entry r).settlements = (L.entry r).settlements

/-- A run's settlements name distinct attempts. -/
def NodupAtt (en : Entry) : Prop := (en.settlements.map (·.attempt)).Nodup

/-- Every run keeps its settlements, in order, and gains only settlements of attempts it had none for. -/
def Grows (L L' : Ledger) : Prop :=
  ∀ r, (L.entry r).settlements <+: (L'.entry r).settlements ∧ (NodupAtt (L.entry r) → NodupAtt (L'.entry r))

theorem grows_of_same {L L' : Ledger} (h : SameSettle L L') : Grows L L' := fun r =>
  ⟨by rw [h r]; exact List.prefix_refl _, fun hn => by unfold NodupAtt at *; rw [h r]; exact hn⟩

theorem grows_trans {A B C : Ledger} (h1 : Grows A B) (h2 : Grows B C) : Grows A C := fun r =>
  ⟨(h1 r).1.trans (h2 r).1, fun h => (h2 r).2 ((h1 r).2 h)⟩

theorem same_trans {A B C : Ledger} (h1 : SameSettle A B) (h2 : SameSettle B C) : SameSettle A C := fun r =>
  (h2 r).trans (h1 r)

theorem same_put {L : Ledger} {r : Nat} {en : Entry} (h : en.settlements = (L.entry r).settlements) :
    SameSettle L (L.put r en) := by
  intro r'; rw [entry_put]; split
  · subst_vars; exact h
  · rfl

theorem same_note (L : Ledger) (k : AnomalyKind) (key : Key) : SameSettle L (L.note k key) := fun _ => rfl

theorem same_ite {L A B : Ledger} (c : Prop) [Decidable c] (ha : SameSettle L A) (hb : SameSettle L B) :
    SameSettle L (if c then A else B) := by
  split
  · exact ha
  · exact hb

theorem same_closeInv (L : Ledger) (run a : Nat) : SameSettle L (L.closeInv run a) := by
  unfold Ledger.closeInv
  split
  · rename_i en hl
    split
    · apply same_put; simp [Ledger.entry, hl]
    · exact fun _ => rfl
  · exact fun _ => rfl

theorem same_markShown (L : Ledger) (a : Nat) : SameSettle L (L.markShown a) := by
  unfold Ledger.markShown
  split
  · exact fun _ => rfl
  · split
    · exact fun _ => rfl
    · exact same_trans (fun _ => rfl) (same_closeInv _ _ _)

theorem same_lifecycle (L : Ledger) (e : Row) : SameSettle L (L.lifecycle e) := by
  unfold Ledger.lifecycle
  apply same_ite
  · apply same_ite
    · exact same_trans (same_put rfl) (same_note _ _ _)
    · exact same_put rfl
  · have h1 : ∀ c : Bool, SameSettle L (if c = true then ({ L with current := some e.run } : Ledger).note .order e.key
        else { L with current := some e.run }) := fun c => same_ite _ (fun _ => rfl) (fun _ => rfl)
    apply same_ite
    · exact same_trans (same_trans (h1 _) (same_put (by rw [h1 _ e.run]))) (fun _ => rfl)
    · exact same_trans (h1 _) (same_put (by rw [h1 _ e.run]))

theorem grows_settle (L : Ledger) (e : Row) : Grows L (L.settle e) := by
  unfold Ledger.settle
  dsimp only
  split
  · apply grows_of_same
    apply same_ite
    · exact same_put rfl
    · exact same_trans (same_put rfl) (same_note _ _ _)
  · rename_i hf
    unfold Entry.settlementOf at hf
    rw [List.find?_eq_none] at hf
    intro r
    rw [entry_put]
    split
    · subst_vars
      refine ⟨List.prefix_append _ _, fun hn => ?_⟩
      unfold NodupAtt Entry.addSettlement
      simp only [List.map_append, List.map_cons, List.map_nil]
      refine List.nodup_append.2 ⟨hn, by simp, ?_⟩
      intro a ha b hb
      simp only [List.mem_singleton] at hb
      subst hb
      obtain ⟨x, hx, rfl⟩ := List.mem_map.1 ha
      have := hf x hx
      simpa using this
    · exact ⟨List.prefix_refl _, id⟩

theorem grows_known (L : Ledger) (e : Row) : Grows L (L.known e) := by
  unfold Ledger.known
  split
  · exact grows_of_same (same_lifecycle L e)
  · exact grows_settle L e
  · exact grows_of_same (same_put rfl)
  · exact grows_of_same (same_put rfl)
  · exact grows_of_same (same_put rfl)
  · split
    · exact grows_of_same (same_note _ _ _)
    · exact grows_of_same (fun r =>
        same_put (L := L) (r := e.run) (en := { L.entry e.run with openInv := some (e.arg % 4) }) rfl r)
  · split
    · exact grows_of_same (same_note _ _ _)
    · split
      · exact grows_of_same (same_note _ _ _)
      · exact grows_of_same (same_trans (fun _ => rfl) (same_closeInv _ _ _))
  · split
    · exact grows_of_same (same_markShown _ _)
    · exact grows_of_same fun _ => rfl
  · exact grows_of_same fun _ => rfl

theorem same_book (L : Ledger) (e : Row) (broken : Bool) (ep : Nat) : SameSettle L (L.book e broken ep) := by
  unfold Ledger.book
  intro r
  split <;> rfl

theorem same_markOpaque (L : Ledger) (e : Row) : SameSettle L (L.markOpaque e) := by
  unfold Ledger.markOpaque
  have h : SameSettle L ((L.put e.run { L.entry e.run with unreadable := true }).note .opaqueRow e.key) :=
    same_trans (same_put (en := { L.entry e.run with unreadable := true }) rfl) (same_note _ _ _)
  exact same_ite _ (same_trans h (fun _ => rfl)) h

theorem grows_stepD (L : Ledger) (e : Row) : Grows L (L.stepD e) := by
  unfold Ledger.stepD Ledger.step
  split
  · split
    · exact grows_of_same fun _ => rfl
    · simp only [Option.getD_some]
      unfold Ledger.advance
      split
      · exact grows_of_same (same_trans (same_book _ _ _ _) (same_markOpaque _ _))
      · exact grows_trans (grows_of_same (same_book _ _ _ _)) (grows_known _ _)
  · simp only [Option.getD_some]
    unfold Ledger.advance
    split
    · exact grows_of_same (same_trans (same_book _ _ _ _) (same_markOpaque _ _))
    · exact grows_trans (grows_of_same (same_book _ _ _ _)) (grows_known _ _)

theorem grows_fold (L : Ledger) (rows : List Row) : Grows L (fold L rows) := by
  induction rows generalizing L with
  | nil => exact grows_of_same fun _ => rfl
  | cons e es ih => exact grows_trans (grows_stepD L e) (ih _)

/-- **T3** (nothing discards an accepted settlement): folding more rows only appends to a run's settlements. -/
theorem t3_never_discarded (L : Ledger) (rows : List Row) (r : Nat) :
    (L.entry r).settlements <+: ((fold L rows).entry r).settlements := (grows_fold L rows r).1

/-- **T3** (at most one settlement per `(runId, attempt)`): whatever the rows, the fold keeps one settlement per
attempt of each run. -/
theorem t3_one_per_attempt (rows : List Row) (r : Nat) :
    (((fold {} rows).entry r).settlements.map (·.attempt)).Nodup :=
  (grows_fold {} rows r).2 (by simp [NodupAtt, Ledger.entry, lookup])

theorem stamp_S (L : Ledger) (term run arg ms : Nat) :
    (stamp L term run .S arg ms).kind = .S ∧ (stamp L term run .S arg ms).run = run ∧
    (stamp L term run .S arg ms).arg = arg ∧ (stamp L term run .S arg ms).attempt = (L.entry run).attempt := by
  unfold stamp; split <;> simp

theorem attemptOf_self (en : Entry) : en.attemptOf en.attempt = en.attempt := by
  unfold Entry.attemptOf; split <;> simp_all

/-- **T3** (host): the host's settlement append (`appendChatRows`) stamps the run's current attempt, appends only when that attempt has no
settlement, skips an identical repeat and refuses a differing one `SETTLEMENT_CONFLICT`: the host never writes a
second settlement for an attempt. -/
theorem t3_host (F : File) (run c : Nat) (p : Settlement)
    (hp : ((fold {} (openApp F).view).entry run).settlementOf ((fold {} (openApp F).view).entry run).attempt = some p) :
    hostSettle F run c = (if p.body = c then .skipped else .code .settlementConflict) := by
  obtain ⟨hk, hr, ha, hat⟩ := stamp_S (fold {} (openApp F).view) 99 run c 999999
  unfold hostSettle
  dsimp only
  generalize hL : fold {} (openApp F).view = L at hp hk hr ha hat
  generalize he : stamp L 99 run .S c 999999 = e at hk hr ha hat
  have hg : gateCode L e false = (if p.body = c then .ok else .settlementConflict) := by
    unfold gateCode; rw [hk, hr, hat]; dsimp only; rw [attemptOf_self, hp]; simp [ha]
  have hrep : isRepeat L e = decide (p.body = c) := by
    unfold isRepeat; rw [hk, hr, hat]; dsimp only; rw [attemptOf_self, hp]; simp [ha]
  rw [hg]
  by_cases hb : p.body = c
  · simp [hb, hrep]
  · simp [hb]

/-! ## T4: one reopen predicate for the fold, the gate and the stamp -/

theorem reopens_def (en : Entry) (s : Life) (x : Nat) :
    reopens en s x = true ↔ s = .running ∧ (x = 0 ∨ x = en.attempt + 1) ∧ reopenable en = true := by
  unfold reopens; simp [and_assoc]

/-- **T4** (the gate reopens by the predicate): a run the table holds `reopenable` reopens on `running` — the S5 D2
gap (a `running` row reopening a run the table held `settled`) is closed. -/
theorem t4_reopenable_reopens (en : Entry) (h : condition en = .reopenable) : reopens en .running 0 = true := by
  rw [reopens_def]
  refine ⟨rfl, Or.inl rfl, ?_⟩
  unfold condition at h
  by_cases h1 : en.life.isNone = true
  · simp [h1] at h
  · by_cases h2 : en.append = .settled
    · by_cases h3 : attemptEnded en = true
      · by_cases h4 : reopenable en = true
        · exact h4
        · simp [h1, h2, h3, h4] at h
      · simp [h1, h2, h3] at h
    · cases ha : attemptEnded en <;> simp [h1, h2, ha] at h

/-- **T4** (the gate admits every reopening row): whenever a `running` row reopens the run, the table admits it. -/
theorem t4_reopens_legal (en : Entry) (h : reopens en .running 0 = true) :
    lifecycleTable (condition en) .running = .ok := by
  rw [reopens_def] at h
  have hr : reopenable en = true := h.2.2
  have he : attemptEnded en = true := by
    unfold reopenable at hr; simp only [Bool.and_eq_true] at hr; exact hr.1
  have h1 : en.life.isNone = false := by
    unfold attemptEnded at he; cases hl : en.life <;> simp_all
  have hc : lifecycleTable (reopenableCond en) .running = .ok := by
    unfold reopenableCond; split <;> rfl
  unfold condition
  by_cases h2 : en.append = .settled
  · simp [h1, h2, he, hr, hc]
  · simp [h1, h2, he, lifecycleTable]

/-- The table admits `running` on a run exactly when it is not `settled` or it reopens. -/
theorem t4_running_legal (en : Entry) :
    lifecycleTable (condition en) .running = .ok ↔ condition en ≠ .unadmitted ∧ condition en ≠ .settled := by
  cases condition en <;> simp [lifecycleTable]

/-- **T4** (the fold reopens by the predicate): a lifecycle row other than `admitted` on an admitted run leaves it
on the next attempt exactly when `reopens` holds, else on the current one. -/
theorem t4_fold_attempt (L : Ledger) (e : Row) (hk : e.kind = .L) (ha : lifeOf e.arg ≠ .admitted)
    (hl : (L.entry e.run).life.isSome = true) :
    ((L.known e).entry e.run).attempt =
      if reopens (L.entry e.run) (lifeOf e.arg) e.attempt then (L.entry e.run).attempt + 1
      else (L.entry e.run).attempt := by
  unfold Ledger.known
  rw [hk]
  dsimp only
  unfold Ledger.lifecycle
  dsimp only
  simp only [ha, ↓reduceIte]
  simp only [Ledger.entry] at hl ⊢
  have hn : ((lookup e.run L.runs).getD {}).life ≠ none := by intro h; simp [h] at hl
  split <;> simp [Ledger.put, lookup_upsert, nextAttempt, hn] <;> rfl

theorem reopens_stamped (en : Entry) (s : Life) :
    reopens en s (if reopens en s 0 then en.attempt + 1 else en.attempt) = reopens en s 0 := by
  cases h : reopens en s 0
  · simp only [Bool.false_eq_true, ite_false]
    cases h2 : reopens en s en.attempt
    · rfl
    · rw [reopens_def] at h2
      have : ¬ (reopens en s 0 = true) := by simp [h]
      rw [reopens_def] at this
      rcases h2 with ⟨h2a, h2b | h2b, h2c⟩
      · exact absurd ⟨h2a, Or.inl rfl, h2c⟩ this
      · omega
  · simp only [ite_true]
    rw [reopens_def] at h ⊢
    exact ⟨h.1, Or.inr rfl, h.2.2⟩

/-- **T4** (stamp and fold agree): the attempt `stampRows` writes on a lifecycle row of an admitted run is the
attempt the fold leaves the run on, and the fold notes no anomaly for it. -/
theorem t4_stamp_fold_agree (L : Ledger) (term run arg ms : Nat) (ha : lifeOf arg ≠ .admitted)
    (hl : (L.entry run).life.isSome = true) :
    ((L.known (stamp L term run .L arg ms)).entry run).attempt = (stamp L term run .L arg ms).attempt := by
  have hr : (stamp L term run .L arg ms).run = run := by unfold stamp; split <;> rfl
  have hk : (stamp L term run .L arg ms).kind = .L := by unfold stamp; split <;> rfl
  have hg : (stamp L term run .L arg ms).arg = arg := by unfold stamp; split <;> rfl
  have hat : (stamp L term run .L arg ms).attempt =
      if reopens (L.entry run) (lifeOf arg) 0 then (L.entry run).attempt + 1 else (L.entry run).attempt := by
    unfold stamp; split <;> simp [ha]
  have := t4_fold_attempt L (stamp L term run .L arg ms) hk (by rw [hg]; exact ha) (by rw [hr]; exact hl)
  rw [hr, hg, hat, reopens_stamped] at this
  rw [this, hat]

/-- **T4** (a pause awaiting a person continues): on a native pause with a pending request, `running` does not
reopen, so the paused attempt continues. -/
theorem t4_paused_continues (en : Entry) (hp : en.life = some .paused) (hq : en.pending ≠ []) :
    reopens en .running 0 = false := by
  cases h : reopens en .running 0
  · rfl
  · rw [reopens_def] at h
    have := h.2.2
    simp [reopenable, rests, hp, hq] at this

/-- **T4** (a resolved pause reopens): a native pause with no pending request reopens on `running`, settled or not,
and the table admits the row (the paused disjunct is live, unlike S5's `reopenable_paused_is_dead`). -/
theorem t4_paused_reopens (en : Entry) (hp : en.life = some .paused) (hq : en.pending = [])
    (hk : en.external = false) :
    lifecycleTable (condition en) .running = .ok ∧ reopens en .running 0 = true := by
  have : reopens en .running 0 = true := by
    rw [reopens_def]; simp [reopenable, attemptEnded, rests, hp, hq, hk]
  exact ⟨t4_reopens_legal en this, this⟩

/-- **T4** (an external pause keeps its attempt; CL-R9): an external agent waiting on a person has not ended its
attempt, so `running` never reopens it — the agent's own answer continues the same attempt. -/
theorem t4_external_pause_open (en : Entry) (hp : en.life = some .paused) (hk : en.external = true) :
    attemptEnded en = false ∧ reopens en .running 0 = false := by
  have he : attemptEnded en = false := by simp [attemptEnded, hp, hk]
  refine ⟨he, ?_⟩
  cases h : reopens en .running 0
  · rfl
  · rw [reopens_def] at h
    have := h.2.2
    simp [reopenable, he] at this

/-- **T4** (a resolved pause may be cancelled; V8, W8.a2 round 3): a native pause with no pending request admits
`cancelled`, settled or not, so a denial's or a cancel's `cancelled` row ends the paused attempt without reopening it. -/
theorem t4_paused_cancels (en : Entry) (hp : en.life = some .paused) (hq : en.pending = [])
    (hk : en.external = false) : lifecycleTable (condition en) .cancelled = .ok := by
  unfold condition
  by_cases h2 : en.append = .settled
  · simp [hp, hq, hk, h2, attemptEnded, reopenable, rests, reopenableCond, lifecycleTable]
  · simp [hp, hk, h2, attemptEnded, lifecycleTable]

/-- **T4** (a settled failure stays ended): the `paused-reopenable` state admits `cancelled`, but a settled failure,
resumable or not, still refuses it `RUN_ID_TAKEN`. -/
theorem t4_failed_cancel_refused (en : Entry) (c : Fail) (hf : en.life = some (.failed c))
    (hs : en.append = .settled) : lifecycleTable (condition en) .cancelled = .runIdTaken := by
  unfold condition
  cases c <;> cases hx : en.external <;>
    simp [hf, hs, hx, attemptEnded, Life.ended, reopenable, rests, failRests, reopenableCond, lifecycleTable]

/-- **T4** (a deliberate Stop resumes; `isUserStoppedRun`): a `USER_STOPPED` cancel of a committed turn reopens on
`running`, settled or not, and the table admits the row — the Resume a stopped turn's card offers is one the gate
takes. -/
theorem t4_user_stop_reopens (en : Entry) (hs : en.life = some (.cancelled true)) (hc : en.committed = true)
    (hk : en.external = false) : lifecycleTable (condition en) .running = .ok ∧ reopens en .running 0 = true := by
  have : reopens en .running 0 = true := by
    rw [reopens_def]; simp [reopenable, attemptEnded, Life.ended, rests, hs, hc, hk]
  exact ⟨t4_reopens_legal en this, this⟩

/-- **T4** (an external Stop resumes once prompted; `isUserStoppedRun`): an external agent's committed `USER_STOPPED`
cancel reopens when its prompt was issued — the session holds the turn the continuation nudges on. -/
theorem t4_external_prompted_stop_reopens (en : Entry) (hs : en.life = some (.cancelled true))
    (hc : en.committed = true) (hp : en.prompted = true) :
    lifecycleTable (condition en) .running = .ok ∧ reopens en .running 0 = true := by
  have : reopens en .running 0 = true := by
    rw [reopens_def]; simp [reopenable, attemptEnded, Life.ended, rests, hs, hc, hp]
  exact ⟨t4_reopens_legal en this, this⟩

/-- **T4** (an external Stop before its prompt stays ended): the vendor session never saw the turn, so there is
nothing for a continuation to resume. -/
theorem t4_external_unprompted_stop_ended (en : Entry) (hs : en.life = some (.cancelled true))
    (hk : en.external = true) (hp : en.prompted = false) : reopens en .running 0 = false := by
  cases h : reopens en .running 0
  · rfl
  · rw [reopens_def] at h
    have := h.2.2
    simp [reopenable, rests, hs, hk, hp] at this

/-- **T4** (an abandoned driver resumes, whatever the kind; resume everywhere): `RUN_ABANDONED` — a close, a crash
while streaming, or a restart while an external agent waited on approval — reopens on `running` and the table admits
the row. -/
theorem t4_abandoned_reopens (en : Entry) (hf : en.life = some (.failed .abandoned)) :
    lifecycleTable (condition en) .running = .ok ∧ reopens en .running 0 = true := by
  have : reopens en .running 0 = true := by
    rw [reopens_def]; simp [reopenable, attemptEnded, Life.ended, rests, failRests, hf]
  exact ⟨t4_reopens_legal en this, this⟩

/-- **T4** (kind-aware failures): an external run never reopens on a gateway failure, and a Tau run never on an agent
stop — the ACP runner continues neither, so the gate refuses the Resume no card offers. -/
theorem t4_failure_kind_refused (en : Entry) (c : Fail) (hf : en.life = some (.failed c))
    (hk : (en.external = true ∧ c = .gateway) ∨ (en.external = false ∧ c = .agentStop)) :
    reopens en .running 0 = false := by
  cases h : reopens en .running 0
  · rfl
  · rw [reopens_def] at h
    have := h.2.2
    rcases hk with ⟨hx, rfl⟩ | ⟨hx, rfl⟩ <;> simp [reopenable, rests, failRests, hf, hx] at this

/-- **T4** (a Stop before the turn committed stays ended): with nothing durable to continue, a `USER_STOPPED` cancel
does not reopen. -/
theorem t4_uncommitted_stop_ended (en : Entry) (hs : en.life = some (.cancelled true)) (hc : en.committed = false) :
    reopens en .running 0 = false := by
  cases h : reopens en .running 0
  · rfl
  · rw [reopens_def] at h
    have := h.2.2
    simp [reopenable, rests, hs, hc] at this

/-- **T4** (any other cancel stays ended): a cancel that is not a deliberate Stop never reopens. -/
theorem t4_cancel_ended (en : Entry) (hs : en.life = some (.cancelled false)) : reopens en .running 0 = false := by
  cases h : reopens en .running 0
  · rfl
  · rw [reopens_def] at h
    have := h.2.2
    simp [reopenable, rests, hs] at this

/-! ## T5: a reader detects every clamp, refusal and stale batch (foldReadAnswer) -/

/-- **T5** (refusals): a refused read is never folded; the reader resets. -/
theorem t5_refusal_resets (L : Ledger) (ahead : Bool) (f : Nat) (last : Option Key) :
    foldRead L (.refused ahead f last) = .reset (if ahead then .cursorAhead else .identityMismatch) := rfl

/-- **T5** (stale batches): only a batch that starts at the reader's cursor, with consistent cursors, is folded;
every other batch is reported `stale` or as a clamp. -/
theorem t5_folded_aligned {L L' : Ledger} {a : Answer} (h : foldRead L a = .folded L') :
    ∃ n f evs, a = .batch L.cursor n f evs ∧ n = L.cursor + evs.length ∧ n ≤ f := by
  cases a with
  | refused ahead f last => cases h
  | batch c n f evs =>
    simp only [foldRead] at h
    by_cases hc : c = L.cursor
    · subst hc
      refine ⟨n, f, evs, rfl, ?_⟩
      by_cases hn : n = L.cursor + evs.length ∧ n ≤ f
      · exact hn
      · exfalso
        have : ¬n = L.cursor + evs.length ∨ f < n := by omega
        simp [this] at h
    · simp only [ne_eq, hc, not_false_eq_true, ↓reduceIte] at h
      split at h <;> cases h

/-- **T5** (clamps): a version-1 server's clamp of a cursor past the end of its log is detected, and the reader
resets instead of rewinding silently (S5's `t5_ts_readers_blind`, fixed). -/
theorem t5_clamp_detected (view : List Row) (L : Ledger) (lim : Nat) (h : view.length < L.cursor) :
    foldRead L (v1Read view L.cursor lim) = .reset .clamped := by
  have hm : min L.cursor view.length = view.length := Nat.min_eq_right (Nat.le_of_lt h)
  simp only [v1Read, hm, List.drop_length, List.take_nil, List.length_nil, Nat.add_zero, foldRead]
  simp [Nat.ne_of_lt h, h]

/-- **T5** (cursor ahead): a read past the end of the log is refused with the end cursor, never clamped. -/
theorem t5_ahead_refused (view : List Row) (c lim : Nat) (mb : Option Nat) (last : Option Key)
    (size : Nat → Nat) (h : view.length < c) :
    readBatch view c lim mb last size = .refused true view.length none := by
  simp [readBatch, h]

/-- **T5** (identity): a read whose `last` is not the key of the row before its cursor is refused with that row's
key. -/
theorem t5_mismatch_refused (view : List Row) (c lim : Nat) (mb : Option Nat) (k : Key) (size : Nat → Nat)
    (hc : c ≤ view.length) (hne : (if c = 0 then none else (view[c - 1]?).map Row.key) ≠ some k) :
    readBatch view c lim mb (some k) size =
      .refused false view.length (if c = 0 then none else (view[c - 1]?).map Row.key) := by
  simp [readBatch, Nat.not_lt.2 hc, hne]

theorem getElem_of_prefix {l l' : List Row} (hp : l <+: l') {i : Nat} (hi : i < l.length) : l'[i]? = l[i]? := by
  obtain ⟨t, rfl⟩ := hp
  simp [List.getElem?_append_left hi]

/-- **T5** (no false alarm and no missed row on an append-only log): a reader at cursor `c` holding the key of the
row before it reads, from any extension of the log it read, exactly the next rows, and folds them. -/
theorem t5_append_only (view view' : List Row) (hp : view <+: view') (c lim : Nat) (hc : c ≤ view.length) :
    readBatch view' c lim none (if c = 0 then none else (view[c - 1]?).map Row.key) =
      .batch c (c + ((view'.drop c).take lim).length) view'.length ((view'.drop c).take lim) := by
  have hc' : c ≤ view'.length := Nat.le_trans hc (List.IsPrefix.length_le hp)
  by_cases h0 : c = 0
  · subst h0; simp [readBatch]
  · have hi : c - 1 < view.length := by omega
    have hg := getElem_of_prefix hp hi
    simp [readBatch, Nat.not_lt.2 hc', h0, hg]

/-- **T5** (the fold of an aligned read): a batch at the reader's cursor is folded, and the position moves to the
batch's end and last row. -/
theorem t5_folds_aligned (L : Ledger) (evs : List Row) (f : Nat) (hf : L.cursor + evs.length ≤ f) (x : Row)
    (hx : evs.getLast? = some x) :
    foldRead L (.batch L.cursor (L.cursor + evs.length) f evs) =
      .folded { fold L evs with cursor := L.cursor + evs.length, last := some x.key } := by
  simp only [foldRead, ne_eq, not_true_eq_false, ite_false, Nat.not_lt.2 hf, or_false, hx]

/-! ## T6: the fold is chunk-invariant, and redelivery is a no-op -/

/-- **T6** (chunk invariance): folding a log in any chunks gives one ledger. -/
theorem t6_chunk_invariant (L : Ledger) (xs ys : List Row) : fold L (xs ++ ys) = fold (fold L xs) ys := by
  simp [fold, List.foldl_append]

/-- The row's term has been folded at least to the row's sequence. -/
def Covers (L : Ledger) (x : Row) : Prop := ∃ ep ls, lookup x.term L.terms = some (ep, ls) ∧ x.seq ≤ ls

theorem terms_closeInv (L : Ledger) (run a : Nat) : (L.closeInv run a).terms = L.terms := by
  unfold Ledger.closeInv; split <;> (try split) <;> rfl

theorem terms_markShown (L : Ledger) (a : Nat) : (L.markShown a).terms = L.terms := by
  unfold Ledger.markShown; split
  · rfl
  · split
    · rfl
    · exact terms_closeInv _ _ _

theorem terms_lifecycle (L : Ledger) (e : Row) : (L.lifecycle e).terms = L.terms := by
  unfold Ledger.lifecycle; dsimp only; split
  · split <;> rfl
  · split <;> split <;> rfl

theorem terms_settle (L : Ledger) (e : Row) : (L.settle e).terms = L.terms := by
  unfold Ledger.settle; dsimp only; split
  · split <;> rfl
  · rfl

theorem terms_known (L : Ledger) (e : Row) : (L.known e).terms = L.terms := by
  unfold Ledger.known
  split
  · exact terms_lifecycle _ _
  · exact terms_settle _ _
  · rfl
  · rfl
  · rfl
  · split <;> rfl
  · split
    · rfl
    · split
      · rfl
      · exact terms_closeInv _ _ _
  · split
    · exact terms_markShown _ _
    · rfl
  · rfl

theorem terms_markOpaque (L : Ledger) (e : Row) : (L.markOpaque e).terms = L.terms := by
  unfold Ledger.markOpaque; dsimp only; split <;> rfl

theorem terms_advance (L : Ledger) (e : Row) (b : Bool) (ep : Nat) :
    (L.advance e b ep).terms = upsert e.term (ep, e.seq) L.terms := by
  have hb : (L.book e b ep).terms = upsert e.term (ep, e.seq) L.terms := by
    unfold Ledger.book; dsimp only; split <;> rfl
  unfold Ledger.advance
  split
  · rw [terms_markOpaque, hb]
  · rw [terms_known, hb]

theorem covers_stepD (L : Ledger) (e x : Row) (h : Covers L x ∨ x = e) : Covers (L.stepD e) x := by
  unfold Ledger.stepD Ledger.step
  cases hl : lookup e.term L.terms with
  | some p =>
    obtain ⟨ep, ls⟩ := p
    simp only
    by_cases hs : e.seq ≤ ls
    · simp only [hs, ite_true, Option.getD_none]
      rcases h with h | rfl
      · exact h
      · exact ⟨ep, ls, hl, hs⟩
    · simp only [hs, ite_false, Option.getD_some]
      unfold Covers
      rw [terms_advance, lookup_upsert]
      rcases h with ⟨ep0, ls0, h0, hle⟩ | rfl
      · by_cases ht : e.term = x.term
        · simp only [ht, ↓reduceIte]; rw [← ht, hl] at h0; cases h0; exact ⟨_, _, rfl, by omega⟩
        · simp only [ht, ↓reduceIte]; exact ⟨ep0, ls0, h0, hle⟩
      · exact ⟨ep, x.seq, by simp, Nat.le_refl _⟩
  | none =>
    simp only [Option.getD_some]
    unfold Covers
    rw [terms_advance, lookup_upsert]
    rcases h with ⟨ep0, ls0, h0, hle⟩ | rfl
    · by_cases ht : e.term = x.term
      · rw [← ht, hl] at h0; cases h0
      · simp only [ht, ↓reduceIte]; exact ⟨ep0, ls0, h0, hle⟩
    · exact ⟨x.epoch, x.seq, by simp, Nat.le_refl _⟩

theorem covers_fold (L : Ledger) (xs : List Row) (x : Row) (h : Covers L x ∨ x ∈ xs) : Covers (fold L xs) x := by
  induction xs generalizing L with
  | nil => simpa [fold] using h
  | cons e es ih =>
    apply ih
    rcases h with h | h
    · exact Or.inl (covers_stepD L e x (Or.inl h))
    · simp only [List.mem_cons] at h
      rcases h with rfl | h
      · exact Or.inl (covers_stepD L x x (Or.inr rfl))
      · exact Or.inr h

theorem stepD_covered (L : Ledger) (x : Row) (h : Covers L x) : L.stepD x = L := by
  obtain ⟨ep, ls, hl, hs⟩ := h
  simp [Ledger.stepD, Ledger.step, hl, hs]

/-- **T6** (redelivery is a no-op): after folding rows, redelivering any of them changes nothing (S5's
`t6_redelivery_breaks`, fixed by the per-term `lastSequence` skip). -/
theorem t6_redelivered_noop (L : Ledger) (xs : List Row) (x : Row) (hx : x ∈ xs) :
    (fold L xs).stepD x = fold L xs := stepD_covered _ _ (covers_fold L xs x (Or.inr hx))

/-- **T6** (at-least-once delivery): folding again any rows already folded leaves the ledger as it was. -/
theorem t6_redelivery_idempotent (L : Ledger) (xs ys : List Row) (h : ∀ y ∈ ys, y ∈ xs) :
    fold (fold L xs) ys = fold L xs := by
  suffices ∀ M : Ledger, (∀ y ∈ ys, Covers M y) → fold M ys = M from
    this _ fun y hy => covers_fold L xs y (Or.inr (h y hy))
  clear h
  induction ys with
  | nil => intro M _; rfl
  | cons y ys ih =>
    intro M hc
    simp only [fold, List.foldl_cons]
    rw [stepD_covered M y (hc y (by simp))]
    exact ih M fun z hz => hc z (by simp [hz])

/-- D26: a duplicate physical boundary cannot reopen an earlier semantic term across pages. -/
theorem d26_duplicate_boundary_keeps_semantic_term :
    let a : Row := ⟨0, 0, 0, .U, 0, 0, 1, 0⟩
    let b : Row := ⟨1, 0, 0, .U, 0, 1, 2, 0⟩
    let next : Row := { a with seq := 1 }
    let pageLedger := { fold {} [a, b, a] with cursor := 3, last := some a.key }
    pageLedger.last = some a.key ∧ pageLedger.semanticTerm = some b.term ∧
      ((pageLedger.stepD next).anomalies.contains (.order, next.key)) = true := by
  decide

/-! ## T8: the legality tables are total, and every refusal is a registry code -/

/-- The run-refusal registry (W4's codes for the three tables and the host gate). -/
def registry : List Code := [.chatRunLive, .noRunAdmitted, .runIdTaken, .settlementWithoutRun,
  .settlementConflict, .interruptAlreadyResolved]

theorem t8_lifecycle_registry (c : Cond) (o : LOp) : lifecycleTable c o = .ok ∨ lifecycleTable c o ∈ registry := by
  cases c <;> cases o <;> decide

theorem t8_operation_registry (h : HState) (o : ROp) :
    operationTable h o = .ok ∨ operationTable h o ∈ registry := by
  cases h <;> cases o <;> decide

theorem t8_settlement_registry (a : AState) : settlementTable a = .ok ∨ settlementTable a ∈ registry := by
  cases a <;> decide

/-- **T8** (the host gate): every code `appendRecords`' gate (`invocations: false`) answers is `ok` or a registry
code. -/
theorem t8_gate_registry (L : Ledger) (e : Row) : gateCode L e false = .ok ∨ gateCode L e false ∈ registry := by
  unfold gateCode
  dsimp only
  split
  · split
    · exact t8_lifecycle_registry _ _
    · split
      · right; decide
      · left; rfl
  · split
    · split
      · left; rfl
      · right; decide
    · exact t8_settlement_registry _
  · by_cases h : e.arg ∈ (L.entry e.run).resolved <;> simp [h, registry]
  · simp
  · left; rfl

/-- A resolved interrupt id cannot be resolved again, even when the payload differs. -/
theorem t8_interrupt_resolved_once (L : Ledger) (e : Row) (hk : e.kind = .R)
    (seen : e.arg ∈ (L.entry e.run).resolved) : gateCode L e false = .interruptAlreadyResolved := by
  simp [gateCode, hk, seen]

/-- **T8** (the gate reads the table): a lifecycle row's refusal other than `CHAT_RUN_LIVE` is its table cell. -/
theorem t8_gate_is_table (L : Ledger) (e : Row) (inv : Bool) (hk : e.kind = .L)
    (h : gateCode L e inv ≠ .ok) (h2 : gateCode L e inv ≠ .chatRunLive) :
    gateCode L e inv = lifecycleTable (condition (L.entry e.run)) (lifeOf e.arg).op := by
  revert h h2
  unfold gateCode
  rw [hk]
  dsimp only
  split
  · intros; rfl
  · split <;> simp_all

/-- **T8** (the invocation gate, a later prepare): a generation prepare that is not the first of its attempt is
refused `INVOCATION_UNRESOLVED` exactly when an unresolved (neither shown nor settled) generation invocation of the
same run exists. -/
theorem t8_prepare_gate_later (L : Ledger) (e : Row) (hk : e.kind = .P) (ha : e.arg < 4)
    (hn : L.invs.any (fun x => decide (x.2.run = e.run ∧ x.2.attempt = (L.entry e.run).attempt)) = true) :
    gateCode L e true = if L.invs.any (fun (_, i) => !i.shown && i.settled.isNone && decide (i.run = e.run) &&
      i.generation) then .invocationUnresolved else .ok := by
  unfold gateCode
  rw [hk]
  simp only [ha, and_true, ↓reduceIte]
  split
  · exfalso; rename_i h; simp at h hn; obtain ⟨a, b, hm, h1, h2⟩ := hn; exact h a b hm h1 h2
  · rfl

/-- **T8** (the invocation gate, the first prepare of an attempt): any unresolved invocation of the chat refuses it. -/
theorem t8_prepare_gate_first (L : Ledger) (e : Row) (hk : e.kind = .P) (ha : e.arg < 4)
    (hn : L.invs.any (fun x => decide (x.2.run = e.run ∧ x.2.attempt = (L.entry e.run).attempt)) = false) :
    gateCode L e true = if L.invs.any (fun (_, i) => !i.shown && i.settled.isNone) then .invocationUnresolved
      else .ok := by
  unfold gateCode
  rw [hk]
  simp only [ha, and_true, ↓reduceIte]
  split
  · rfl
  · exfalso; rename_i h; simp at h hn; obtain ⟨a, b, hm, h1, h2⟩ := h; exact hn a b hm h1 h2

/-! ## T7: the merge (segments.ts) -/

theorem insertBy_perm {α : Type} (lt : α → α → Bool) (x : α) (l : List α) :
    (insertBy lt x l).Perm (x :: l) := by
  induction l with
  | nil => simp [insertBy]
  | cons y ys ih =>
    unfold insertBy
    split
    · exact (List.Perm.cons y ih).trans (List.Perm.swap x y ys)
    · exact List.Perm.refl _

theorem isort_perm {α : Type} (lt : α → α → Bool) (l : List α) : (isort lt l).Perm l := by
  induction l with
  | nil => simp [isort]
  | cons x xs ih => exact (insertBy_perm lt x _).trans (List.Perm.cons x ih)

theorem inj_of_nodup_map {α β : Type} {f : α → β} {l : List α} (h : (l.map f).Nodup) {a b : α} (ha : a ∈ l)
    (hb : b ∈ l) (hab : f a = f b) : a = b := by
  induction l with
  | nil => simp at ha
  | cons x xs ih =>
    simp only [List.map_cons, List.nodup_cons, List.mem_map] at h
    simp only [List.mem_cons] at ha hb
    rcases ha with rfl | ha <;> rcases hb with rfl | hb
    · rfl
    · exact absurd ⟨b, hb, hab.symm⟩ h.1
    · exact absurd ⟨a, ha, hab⟩ h.1
    · exact ih h.2 ha hb

theorem upsert_keys {β : Type} (k : Nat) (v : β) (l : List (Nat × β)) :
    (upsert k v l).map Prod.fst = if k ∈ l.map Prod.fst then l.map Prod.fst else l.map Prod.fst ++ [k] := by
  induction l with
  | nil => simp [upsert]
  | cons p rest ih =>
    obtain ⟨k', v'⟩ := p
    by_cases h : k' = k
    · subst h; simp [upsert]
    · simp only [upsert, h, ↓reduceIte, List.map_cons, ih, List.mem_cons]
      by_cases hk : k ∈ rest.map Prod.fst
      · simp [hk]
      · simp [hk, Ne.symm h]

theorem upsert_nodup {β : Type} (k : Nat) (v : β) (l : List (Nat × β)) (h : (l.map Prod.fst).Nodup) :
    ((upsert k v l).map Prod.fst).Nodup := by
  rw [upsert_keys]
  split
  · exact h
  · rename_i hk
    refine List.nodup_append.2 ⟨h, by simp, ?_⟩
    intro a ha b hb
    simp only [List.mem_singleton] at hb
    subst hb
    intro he; subst he; exact hk ha

theorem mem_upsert {β : Type} {k : Nat} {v : β} {l : List (Nat × β)} (h : (l.map Prod.fst).Nodup)
    (p : Nat × β) : p ∈ upsert k v l ↔ p = (k, v) ∨ (p ∈ l ∧ p.1 ≠ k) := by
  induction l with
  | nil => simp [upsert]
  | cons q rest ih =>
    obtain ⟨k', v'⟩ := q
    simp only [List.map_cons, List.nodup_cons] at h
    by_cases hq : k' = k
    · subst hq
      simp only [upsert, ↓reduceIte, List.mem_cons]
      constructor
      · rintro (rfl | hp)
        · exact Or.inl rfl
        · exact Or.inr ⟨Or.inr hp, fun he => h.1 (he ▸ List.mem_map_of_mem hp)⟩
      · rintro (rfl | ⟨rfl | hp, hne⟩)
        · exact Or.inl rfl
        · exact absurd rfl hne
        · exact Or.inr hp
    · simp only [upsert, hq, ↓reduceIte, List.mem_cons, ih h.2]
      constructor
      · rintro (rfl | rfl | ⟨hp, hne⟩)
        · exact Or.inr ⟨Or.inl rfl, hq⟩
        · exact Or.inl rfl
        · exact Or.inr ⟨Or.inr hp, hne⟩
      · rintro (rfl | ⟨rfl | hp, hne⟩)
        · exact Or.inr (Or.inl rfl)
        · exact Or.inl rfl
        · exact Or.inr (Or.inr ⟨hp, hne⟩)

theorem lookup_eq_some {β : Type} {k : Nat} {v : β} {l : List (Nat × β)} (h : (l.map Prod.fst).Nodup) :
    lookup k l = some v ↔ (k, v) ∈ l := by
  induction l with
  | nil => simp [lookup]
  | cons q rest ih =>
    obtain ⟨k', v'⟩ := q
    simp only [List.map_cons, List.nodup_cons] at h
    by_cases hq : k' = k
    · subst hq
      simp only [lookup, ↓reduceIte, Option.some.injEq, List.mem_cons, Prod.mk.injEq, true_and]
      constructor
      · rintro rfl; exact Or.inl rfl
      · rintro (rfl | hp)
        · rfl
        · exact absurd (List.mem_map_of_mem (f := Prod.fst) hp) h.1
    · simp only [lookup, hq, ↓reduceIte, ih h.2, List.mem_cons, Prod.mk.injEq]
      constructor
      · exact Or.inr
      · rintro (⟨rfl, _⟩ | hp)
        · exact absurd rfl hq
        · exact hp

/-- A term's copies are keyed by sequence, nonempty, and each of the term's key. -/
def MTerm.WF (t : MTerm) : Prop :=
  (t.copies.map Prod.fst).Nodup ∧ ∀ sc ∈ t.copies, sc.2 ≠ [] ∧ ∀ c ∈ sc.2, c.row.term = t.term ∧ c.row.seq = sc.1

/-- Terms are keyed by term id, and each is well formed. -/
def TermsWF (ts : List MTerm) : Prop := (ts.map (·.term)).Nodup ∧ ∀ t ∈ ts, t.WF

/-- `c` is one of the copies read. -/
def Holds (ts : List MTerm) (c : Copy) : Prop := ∃ t ∈ ts, ∃ sc ∈ t.copies, c ∈ sc.2

theorem add_copies (t : MTerm) (dev : Nat) (o : Option Nat) (e : Row) :
    (t.add dev o e).copies = upsert e.seq (((lookup e.seq t.copies).getD []) ++ [⟨e, dev⟩]) t.copies := rfl

theorem add_term (t : MTerm) (dev : Nat) (o : Option Nat) (e : Row) : (t.add dev o e).term = t.term := rfl

theorem add_wf (t : MTerm) (dev : Nat) (o : Option Nat) (e : Row) (hw : t.WF) (ht : t.term = e.term) :
    (t.add dev o e).WF := by
  refine ⟨by rw [add_copies]; exact upsert_nodup _ _ _ hw.1, ?_⟩
  intro sc hsc
  rw [add_copies, mem_upsert hw.1] at hsc
  rw [add_term]
  rcases hsc with rfl | ⟨hsc, _⟩
  · refine ⟨by simp, ?_⟩
    intro c hc
    simp only [List.mem_append, List.mem_singleton] at hc
    rcases hc with hc | rfl
    · cases hl : lookup e.seq t.copies with
      | none => simp [hl] at hc
      | some old =>
        rw [hl] at hc
        have := (hw.2 _ ((lookup_eq_some hw.1).1 hl)).2 c hc
        exact this
    · exact ⟨ht.symm, rfl⟩
  · exact hw.2 sc hsc

theorem add_holds (t : MTerm) (dev : Nat) (o : Option Nat) (e : Row) (hw : t.WF) (c : Copy) :
    (∃ sc ∈ (t.add dev o e).copies, c ∈ sc.2) ↔ (∃ sc ∈ t.copies, c ∈ sc.2) ∨ c = ⟨e, dev⟩ := by
  rw [add_copies]
  constructor
  · rintro ⟨sc, hsc, hc⟩
    rw [mem_upsert hw.1] at hsc
    rcases hsc with rfl | ⟨hsc, _⟩
    · simp only [List.mem_append, List.mem_singleton] at hc
      rcases hc with hc | rfl
      · cases hl : lookup e.seq t.copies with
        | none => simp [hl] at hc
        | some old => rw [hl] at hc; exact Or.inl ⟨_, (lookup_eq_some hw.1).1 hl, hc⟩
      · exact Or.inr rfl
    · exact Or.inl ⟨sc, hsc, hc⟩
  · rintro (⟨sc, hsc, hc⟩ | rfl)
    · by_cases hs : sc.1 = e.seq
      · refine ⟨_, (mem_upsert hw.1 _).2 (Or.inl rfl), ?_⟩
        have : lookup e.seq t.copies = some sc.2 := by
          rw [lookup_eq_some hw.1, ← hs]; exact hsc
        simp [this, hc]
      · exact ⟨sc, (mem_upsert hw.1 _).2 (Or.inr ⟨hsc, hs⟩), hc⟩
    · exact ⟨_, (mem_upsert hw.1 _).2 (Or.inl rfl), by simp⟩

theorem empty_wf (e : Row) (ms : Nat) : ({ term := e.term, orders := [], copies := [], started := ms } : MTerm).WF :=
  ⟨by simp, by simp⟩

theorem addRow_spec (dev : Nat) (st : List MTerm × List Nat) (e : Row) (h : TermsWF st.1) :
    TermsWF (addRow dev st e).1 ∧ ∀ c, Holds (addRow dev st e).1 c ↔ Holds st.1 c ∨ c = ⟨e, dev⟩ := by
  unfold addRow
  dsimp only
  split
  · rename_i hany
    obtain ⟨t0, ht0, ht0e⟩ := List.any_eq_true.1 hany
    simp only [decide_eq_true_eq] at ht0e
    refine ⟨⟨?_, ?_⟩, ?_⟩
    · have : (st.1.map fun t => if t.term = e.term then t.add dev
          (if (!st.2.contains e.term) = true then some ((if (!st.2.contains e.term) = true then
            st.2 ++ [e.term] else st.2).length - 1) else none) e else t).map (·.term) = st.1.map (·.term) := by
        simp only [List.map_map]
        congr 1; funext t; simp only [Function.comp]; split <;> rfl
      rw [this]; exact h.1
    · intro t ht
      obtain ⟨t', ht', rfl⟩ := List.mem_map.1 ht
      split
      · rename_i hte; exact add_wf _ _ _ _ (h.2 t' ht') hte
      · exact h.2 t' ht'
    · intro c
      constructor
      · rintro ⟨t, ht, hc⟩
        obtain ⟨t', ht', rfl⟩ := List.mem_map.1 ht
        split at hc
        · rcases (add_holds _ _ _ _ (h.2 t' ht') c).1 hc with hc | hc
          · exact Or.inl ⟨t', ht', hc⟩
          · exact Or.inr hc
        · exact Or.inl ⟨t', ht', hc⟩
      · rintro (⟨t, ht, hc⟩ | rfl)
        · refine ⟨_, List.mem_map_of_mem ht, ?_⟩
          split
          · exact (add_holds _ _ _ _ (h.2 t ht) c).2 (Or.inl hc)
          · exact hc
        · refine ⟨_, List.mem_map_of_mem ht0, ?_⟩
          simp only [ht0e, ↓reduceIte]
          exact (add_holds _ _ _ _ (h.2 t0 ht0) _).2 (Or.inr rfl)
  · rename_i hany
    have hnone : ∀ t ∈ st.1, t.term ≠ e.term := by
      intro t ht hte
      exact hany (List.any_eq_true.2 ⟨t, ht, by simp [hte]⟩)
    refine ⟨⟨?_, ?_⟩, ?_⟩
    · simp only [List.map_append, List.map_cons, List.map_nil]
      refine List.nodup_append.2 ⟨h.1, by simp, ?_⟩
      intro a ha b hb
      simp only [List.mem_singleton] at hb
      obtain ⟨t, ht, rfl⟩ := List.mem_map.1 ha
      rw [hb, add_term]
      exact hnone t ht
    · intro t ht
      simp only [List.mem_append, List.mem_singleton] at ht
      rcases ht with ht | rfl
      · exact h.2 t ht
      · exact add_wf _ _ _ _ (empty_wf e e.ms) rfl
    · intro c
      simp only [Holds, List.mem_append, List.mem_singleton]
      constructor
      · rintro ⟨t, ht | rfl, hc⟩
        · exact Or.inl ⟨t, ht, hc⟩
        · rcases (add_holds _ _ _ _ (empty_wf e e.ms) c).1 hc with ⟨sc, hsc, _⟩ | hc
          · simp at hsc
          · exact Or.inr hc
      · rintro (⟨t, ht, hc⟩ | rfl)
        · exact ⟨t, Or.inl ht, hc⟩
        · exact ⟨_, Or.inr rfl, (add_holds _ _ _ _ (empty_wf e e.ms) _).2 (Or.inr rfl)⟩

theorem segment_spec (dev : Nat) (rows : List Row) : ∀ st : List MTerm × List Nat, TermsWF st.1 →
    TermsWF (rows.foldl (addRow dev) st).1 ∧
      ∀ c, Holds (rows.foldl (addRow dev) st).1 c ↔ Holds st.1 c ∨ (c.device = dev ∧ c.row ∈ rows) := by
  induction rows with
  | nil => intro st h; simp [h]
  | cons e es ih =>
    intro st h
    obtain ⟨h1, h2⟩ := addRow_spec dev st e h
    obtain ⟨h3, h4⟩ := ih _ h1
    refine ⟨h3, fun c => ?_⟩
    simp only [List.foldl_cons]
    rw [h4, h2]
    constructor
    · rintro ((hc | rfl) | ⟨hd, hr⟩)
      · exact Or.inl hc
      · exact Or.inr ⟨rfl, List.mem_cons_self⟩
      · exact Or.inr ⟨hd, List.mem_cons_of_mem _ hr⟩
    · rintro (hc | ⟨hd, hr⟩)
      · exact Or.inl (Or.inl hc)
      · rcases List.mem_cons.1 hr with he | hr
        · left; right; cases c; simp_all
        · exact Or.inr ⟨hd, hr⟩

theorem segments_spec (segs : List (Nat × List Row)) : ∀ ts, TermsWF ts →
    TermsWF (segs.foldl mergeSegment ts) ∧
      ∀ c, Holds (segs.foldl mergeSegment ts) c ↔ Holds ts c ∨ ∃ seg ∈ segs, c.device = seg.1 ∧ c.row ∈ seg.2 := by
  induction segs with
  | nil => intro ts h; simp [h]
  | cons seg segs ih =>
    intro ts h
    obtain ⟨h1, h2⟩ := segment_spec seg.1 seg.2 (ts, []) h
    obtain ⟨h3, h4⟩ := ih _ h1
    simp only [List.foldl_cons, mergeSegment]
    refine ⟨h3, fun c => ?_⟩
    rw [h4, h2]
    constructor
    · rintro ((hc | hc) | ⟨s, hs, hc⟩)
      · exact Or.inl hc
      · exact Or.inr ⟨seg, List.mem_cons_self, hc⟩
      · exact Or.inr ⟨s, List.mem_cons_of_mem _ hs, hc⟩
    · rintro (hc | ⟨s, hs, hc⟩)
      · exact Or.inl (Or.inl hc)
      · rcases List.mem_cons.1 hs with rfl | hs
        · exact Or.inl (Or.inr hc)
        · exact Or.inr ⟨s, hs, hc⟩

/-- The merge's terms. -/
def mergedTerms (segs : List (Nat × List Row)) : List MTerm := segs.foldl mergeSegment []

theorem mergedTerms_spec (segs : List (Nat × List Row)) :
    TermsWF (mergedTerms segs) ∧
      ∀ c, Holds (mergedTerms segs) c ↔ ∃ seg ∈ segs, c.device = seg.1 ∧ c.row ∈ seg.2 := by
  obtain ⟨h1, h2⟩ := segments_spec segs [] ⟨by simp, by simp⟩
  exact ⟨h1, fun c => by unfold mergedTerms; rw [h2]; simp [Holds]⟩

theorem keySort_perm {α : Type} (κ : α → List (List Nat)) (l : List α) : (keySort κ l).Perm l :=
  isort_perm _ l

theorem keptCopy_mem (d : Nat) (cs : List Copy) (h : cs ≠ []) : keptCopy d cs ∈ cs := by
  unfold keptCopy
  dsimp only
  generalize hpool : (if (cs.filter fun c => decide (c.device = d)).isEmpty = true then cs
      else cs.filter fun c => decide (c.device = d)) = pool
  have hsub : ∀ x ∈ pool, x ∈ cs := by
    intro x hx; rw [← hpool] at hx; split at hx
    · exact hx
    · exact (List.mem_filter.1 hx).1
  have hne : pool ≠ [] := by
    rw [← hpool]; split
    · exact h
    · rename_i hf; simpa using hf
  apply hsub
  have hp := keySort_perm copyKey pool
  cases hs : keySort copyKey pool with
  | nil => rw [hs] at hp; exact absurd (List.Perm.nil_eq hp).symm hne
  | cons x xs => rw [hs] at hp; exact hp.mem_iff.1 List.mem_cons_self

/-- The kept copy is the term device's own whenever that device holds a copy of the key. -/
theorem keptCopy_own (d : Nat) (cs : List Copy) (h : ∃ c ∈ cs, c.device = d) : (keptCopy d cs).device = d := by
  unfold keptCopy
  dsimp only
  obtain ⟨c, hc, hcd⟩ := h
  have hne : (cs.filter fun c => decide (c.device = d)).isEmpty = false := by
    cases he : (cs.filter fun c => decide (c.device = d)).isEmpty
    · rfl
    · rw [List.isEmpty_iff, List.filter_eq_nil_iff] at he
      exact absurd (by simpa using hcd) (he c hc)
  simp only [hne, Bool.false_eq_true, ↓reduceIte]
  have hp := keySort_perm copyKey (cs.filter fun c => decide (c.device = d))
  cases hs : keySort copyKey (cs.filter fun c => decide (c.device = d)) with
  | nil =>
    rw [hs] at hp
    have := (List.Perm.nil_eq hp).symm
    rw [this] at hne; simp at hne
  | cons x xs =>
    rw [hs] at hp
    have := hp.mem_iff.1 List.mem_cons_self
    simpa using (List.mem_filter.1 this).2

theorem dropScan_sub (k : Copy) (xs acc : List Copy) :
    ∀ a ∈ xs.foldl (fun (acc : List Copy) c =>
      if c.row.fp = k.row.fp ∨ acc.any (fun d => decide (d.row.fp = c.row.fp)) then acc else acc ++ [c]) acc,
      a ∈ acc ∨ (a ∈ xs ∧ a.row.fp ≠ k.row.fp) := by
  induction xs generalizing acc with
  | nil => intro a ha; exact Or.inl ha
  | cons x xs ih =>
    intro a ha
    simp only [List.foldl_cons] at ha
    rcases ih _ a ha with ha | ⟨ha, hf⟩
    · split at ha
      · exact Or.inl ha
      · rename_i hc
        simp only [List.mem_append, List.mem_singleton] at ha
        rcases ha with ha | rfl
        · exact Or.inl ha
        · exact Or.inr ⟨List.mem_cons_self, fun he => hc (Or.inl he)⟩
    · exact Or.inr ⟨List.mem_cons_of_mem _ ha, hf⟩

theorem dropScan_ne (k : Copy) (xs acc : List Copy) (h : acc ≠ [] ∨ ∃ c ∈ xs, c.row.fp ≠ k.row.fp) :
    xs.foldl (fun (acc : List Copy) c =>
      if c.row.fp = k.row.fp ∨ acc.any (fun d => decide (d.row.fp = c.row.fp)) then acc else acc ++ [c]) acc ≠ [] := by
  induction xs generalizing acc with
  | nil => simpa using h
  | cons x xs ih =>
    simp only [List.foldl_cons]
    apply ih
    rcases h with h | ⟨c, hc, hf⟩
    · left; split
      · exact h
      · simp
    · rcases List.mem_cons.1 hc with rfl | hc
      · left; split
        · rename_i hcond
          rcases hcond with hcond | hcond
          · exact absurd hcond hf
          · intro he; rw [he] at hcond; simp at hcond
        · simp
      · exact Or.inr ⟨c, hc, hf⟩

/-- Each reported dropped copy is a copy of the key whose content differs from the kept one. -/
theorem dropped_sound (k : Copy) (cs : List Copy) (a : Copy) (ha : a ∈ dropped k cs) :
    a ∈ cs ∧ a.row.fp ≠ k.row.fp := by
  unfold dropped at ha
  rcases dropScan_sub k _ [] a ha with ha | ⟨ha, hf⟩
  · simp at ha
  · exact ⟨(isort_perm _ cs).mem_iff.1 ha, hf⟩

/-- A key whose copies differ from the kept one reports at least one conflict. -/
theorem dropped_complete (k : Copy) (cs : List Copy) (h : ∃ c ∈ cs, c.row.fp ≠ k.row.fp) : dropped k cs ≠ [] := by
  unfold dropped
  obtain ⟨c, hc, hf⟩ := h
  exact dropScan_ne k _ [] (Or.inr ⟨c, (isort_perm _ cs).mem_iff.2 hc, hf⟩)

/-- The merged keys before projection: one `(kept row, conflicts)` per key, in merged order. -/
def mergeKeys (segs : List (Nat × List Row)) : List (Row × List (Key × Nat × Nat)) :=
  (keySort (placedKey (clampStarts ((mergedTerms segs).map place))) ((mergedTerms segs).map place)).flatMap fun p =>
    (keySort (fun sc => [[sc.1]]) p.1.copies).map (mergeKey p)

theorem mergeFull_eq (segs : List (Nat × List Row)) :
    mergeFull segs = ((mergeKeys segs).map Prod.fst, (mergeKeys segs).flatMap Prod.snd) := rfl

theorem mem_mergeKeys (segs : List (Nat × List Row)) (q : Row × List (Key × Nat × Nat)) :
    q ∈ mergeKeys segs ↔ ∃ t ∈ mergedTerms segs, ∃ sc ∈ t.copies, q = mergeKey (place t) sc := by
  unfold mergeKeys
  simp only [List.mem_flatMap, List.mem_map]
  constructor
  · rintro ⟨p, hp, sc, hsc, rfl⟩
    obtain ⟨t, ht, rfl⟩ := List.mem_map.1 ((isort_perm _ _).mem_iff.1 hp)
    exact ⟨t, ht, sc, (isort_perm _ _).mem_iff.1 hsc, rfl⟩
  · rintro ⟨t, ht, sc, hsc, rfl⟩
    exact ⟨place t, (isort_perm _ _).mem_iff.2 (List.mem_map_of_mem ht), sc, (isort_perm _ _).mem_iff.2 hsc, rfl⟩

theorem perm_flatMap_left {α β : Type} (l : List α) (f g : α → List β)
    (h : ∀ a ∈ l, (f a).Perm (g a)) : (l.flatMap f).Perm (l.flatMap g) := by
  induction l with
  | nil => simp
  | cons a as ih =>
    simp only [List.flatMap_cons]
    exact List.Perm.append (h a List.mem_cons_self) (ih fun b hb => h b (List.mem_cons_of_mem _ hb))

/-- Every key the merge reads: `(term, sequence)` of each term's copies. -/
def allKeys (ts : List MTerm) : List Key := ts.flatMap fun t => t.copies.map fun sc => (t.term, sc.1)

theorem mergeKey_key (t : MTerm) (hw : t.WF) (sc : Nat × List Copy) (hsc : sc ∈ t.copies) :
    (mergeKey (place t) sc).1.key = (t.term, sc.1) ∧ keptCopy (deviceOf t) sc.2 ∈ sc.2 := by
  have hm := keptCopy_mem (deviceOf t) sc.2 (hw.2 sc hsc).1
  have := (hw.2 sc hsc).2 _ hm
  refine ⟨?_, hm⟩
  simp [mergeKey, keep, place, Row.key, this.1, this.2]

theorem merge_keys_perm (segs : List (Nat × List Row)) :
    ((merge segs).map Row.key).Perm (allKeys (mergedTerms segs)) := by
  have hw := (mergedTerms_spec segs).1
  unfold merge
  rw [mergeFull_eq]
  simp only [List.map_map]
  unfold mergeKeys allKeys
  rw [List.map_flatMap]
  refine ((isort_perm _ _).flatMap_right _).trans ?_
  rw [List.flatMap_map]
  apply perm_flatMap_left
  intro t ht
  rw [List.map_map]
  refine ((isort_perm _ _).map _).trans ?_
  apply List.Perm.of_eq
  apply List.map_congr_left
  intro sc hsc
  simp only [Function.comp]
  exact (mergeKey_key t (hw.2 t ht) sc hsc).1

theorem nodup_map_of_inj {α β : Type} {f : α → β} {l : List α} (hf : ∀ a b, f a = f b → a = b)
    (h : l.Nodup) : (l.map f).Nodup := by
  induction l with
  | nil => simp
  | cons a as ih =>
    simp only [List.map_cons, List.nodup_cons, List.mem_map] at h ⊢
    exact ⟨fun ⟨b, hb, he⟩ => h.1 (hf _ _ he ▸ hb), ih h.2⟩

theorem allKeys_nodup (ts : List MTerm) (hw : TermsWF ts) : (allKeys ts).Nodup := by
  induction ts with
  | nil => simp [allKeys]
  | cons t ts ih =>
    simp only [allKeys, List.flatMap_cons]
    obtain ⟨hw1, hw2⟩ := hw
    simp only [List.map_cons, List.nodup_cons] at hw1
    have hw' : TermsWF ts := ⟨hw1.2, fun u hu => hw2 u (List.mem_cons_of_mem _ hu)⟩
    have hwt := hw2 t List.mem_cons_self
    refine List.nodup_append.2 ⟨?_, ih hw', ?_⟩
    · have : (t.copies.map fun sc => (t.term, sc.1)) = (t.copies.map Prod.fst).map (fun q => (t.term, q)) := by
        simp [List.map_map, Function.comp_def]
      rw [this]
      exact nodup_map_of_inj (f := fun q => (t.term, q)) (fun a b h => by simpa using h) hwt.1
    · intro a ha b hb hab
      subst hab
      obtain ⟨sc, _, rfl⟩ := List.mem_map.1 ha
      simp only [List.mem_flatMap, List.mem_map] at hb
      obtain ⟨u, hu, sc', _, he⟩ := hb
      simp only [Prod.mk.injEq] at he
      exact hw1.1 (List.mem_map.2 ⟨u, hu, he.1⟩)

/-- **T7** (no row is duplicated): every `(leaderEpoch, sequence)` occurs once in the merged view, whatever the
segments — including a segment read twice or a term copied into another segment. -/
theorem t7_no_duplicates (segs : List (Nat × List Row)) : ((merge segs).map Row.key).Nodup :=
  (merge_keys_perm segs).nodup_iff.2 (allKeys_nodup _ (mergedTerms_spec segs).1)

/-- **T7** (the exact union): a key is in the merged view iff some segment holds a row with it. -/
theorem t7_exact_union (segs : List (Nat × List Row)) (k : Key) :
    k ∈ (merge segs).map Row.key ↔ ∃ seg ∈ segs, ∃ x ∈ seg.2, x.key = k := by
  obtain ⟨hw, hh⟩ := mergedTerms_spec segs
  rw [(merge_keys_perm segs).mem_iff]
  simp only [allKeys, List.mem_flatMap, List.mem_map]
  constructor
  · rintro ⟨t, ht, sc, hsc, rfl⟩
    obtain ⟨c, hc⟩ := List.exists_mem_of_ne_nil _ ((hw.2 t ht).2 sc hsc).1
    obtain ⟨seg, hseg, _, hx⟩ := (hh c).1 ⟨t, ht, sc, hsc, hc⟩
    have := ((hw.2 t ht).2 sc hsc).2 c hc
    exact ⟨seg, hseg, c.row, hx, by simp [Row.key, this.1, this.2]⟩
  · rintro ⟨seg, hseg, x, hx, rfl⟩
    obtain ⟨t, ht, sc, hsc, hc⟩ := (hh ⟨x, seg.1⟩).2 ⟨seg, hseg, rfl, hx⟩
    have := ((hw.2 t ht).2 sc hsc).2 _ hc
    simp only at this
    exact ⟨t, ht, sc, hsc, by simp [Row.key, this.1, this.2]⟩

/-- **T7** (nothing invented): every merged row is a row some segment holds. -/
theorem t7_rows_are_read (segs : List (Nat × List Row)) (y : Row) (hy : y ∈ merge segs) :
    ∃ seg ∈ segs, y ∈ seg.2 := by
  obtain ⟨hw, hh⟩ := mergedTerms_spec segs
  unfold merge at hy
  rw [mergeFull_eq] at hy
  obtain ⟨q, hq, rfl⟩ := List.mem_map.1 hy
  obtain ⟨t, ht, sc, hsc, rfl⟩ := (mem_mergeKeys segs q).1 hq
  have hm := (mergeKey_key t (hw.2 t ht) sc hsc).2
  obtain ⟨seg, hseg, _, hx⟩ := (hh _).1 ⟨t, ht, sc, hsc, hm⟩
  exact ⟨seg, hseg, hx⟩

/-- **T7** (conflicts are real): each reported `(key, kept, dropped)` names a row of that key, read from the dropped
device, whose content differs from the merged row of the key. -/
theorem t7_conflicts_sound (segs : List (Nat × List Row)) (k : Key) (kd dd : Nat)
    (h : (k, kd, dd) ∈ (mergeFull segs).2) :
    ∃ seg ∈ segs, seg.1 = dd ∧ ∃ x ∈ seg.2, x.key = k ∧ ∃ y ∈ merge segs, y.key = k ∧ x.fp ≠ y.fp := by
  obtain ⟨hw, hh⟩ := mergedTerms_spec segs
  rw [mergeFull_eq] at h
  obtain ⟨q, hq, hk⟩ := List.mem_flatMap.1 h
  obtain ⟨t, ht, sc, hsc, rfl⟩ := (mem_mergeKeys segs q).1 hq
  simp only [mergeKey, keep, List.map_map, List.mem_map, Function.comp_def, Prod.mk.injEq] at hk
  obtain ⟨a, ha, rfl, _, rfl⟩ := hk
  obtain ⟨ha1, ha2⟩ := dropped_sound _ _ a ha
  obtain ⟨seg, hseg, hdev, hx⟩ := (hh a).1 ⟨t, ht, sc, hsc, ha1⟩
  have hak := ((hw.2 t ht).2 sc hsc).2 a ha1
  obtain ⟨hkey, hkm⟩ := mergeKey_key t (hw.2 t ht) sc hsc
  refine ⟨seg, hseg, hdev.symm, a.row, hx, by simp [Row.key, hak.1, hak.2, place], _, ?_, hkey, ?_⟩
  · unfold merge; rw [mergeFull_eq]; exact List.mem_map.2 ⟨_, hq, rfl⟩
  · simpa [mergeKey, keep, place] using ha2

/-- **T7** (every conflict is reported): two segments' rows with one key and different content report a conflict
for that key. -/
theorem t7_conflicts_complete (segs : List (Nat × List Row)) (s1 s2 : Nat × List Row) (hs1 : s1 ∈ segs)
    (hs2 : s2 ∈ segs) (x y : Row) (hx : x ∈ s1.2) (hy : y ∈ s2.2) (hk : x.key = y.key) (hf : x.fp ≠ y.fp) :
    ∃ kd dd, (x.key, kd, dd) ∈ (mergeFull segs).2 := by
  obtain ⟨hw, hh⟩ := mergedTerms_spec segs
  obtain ⟨t1, ht1, sc1, hsc1, hc1⟩ := (hh ⟨x, s1.1⟩).2 ⟨s1, hs1, rfl, hx⟩
  obtain ⟨t2, ht2, sc2, hsc2, hc2⟩ := (hh ⟨y, s2.1⟩).2 ⟨s2, hs2, rfl, hy⟩
  have e1 := ((hw.2 t1 ht1).2 sc1 hsc1).2 _ hc1
  have e2 := ((hw.2 t2 ht2).2 sc2 hsc2).2 _ hc2
  simp only [Row.key, Prod.mk.injEq] at hk
  have htt : t1 = t2 := inj_of_nodup_map hw.1 ht1 ht2 (by simp only at e1 e2; rw [← e1.1, ← e2.1, hk.1])
  subst htt
  have hss : sc1 = sc2 := inj_of_nodup_map (hw.2 t1 ht1).1 hsc1 hsc2 (by simp only at e1 e2; rw [← e1.2, ← e2.2, hk.2])
  subst hss
  have hne : dropped (keptCopy (deviceOf t1) sc1.2) sc1.2 ≠ [] := by
    apply dropped_complete
    by_cases hkx : x.fp = (keptCopy (deviceOf t1) sc1.2).row.fp
    · exact ⟨⟨y, s2.1⟩, hc2, fun h => hf (hkx.trans h.symm)⟩
    · exact ⟨⟨x, s1.1⟩, hc1, hkx⟩
  obtain ⟨a, ha⟩ := List.exists_mem_of_ne_nil _ hne
  refine ⟨(keptCopy (deviceOf t1) sc1.2).device, a.device, ?_⟩
  rw [mergeFull_eq]
  refine List.mem_flatMap.2 ⟨_, (mem_mergeKeys segs _).2 ⟨t1, ht1, sc1, hsc1, rfl⟩, ?_⟩
  simp only [mergeKey, keep, place, List.map_map, List.mem_map, Function.comp_def]
  refine ⟨a, ha, ?_⟩
  simp only at e1
  simp [Row.key, e1.1, e1.2]

/-! ### T7 order theory: the comparators are strict total orders -/

/-- A strict total order. -/
structure StrictTotal {β : Type} (lt : β → β → Bool) : Prop where
  irrefl : ∀ a, lt a a = false
  trans : ∀ a b c, lt a b = true → lt b c = true → lt a c = true
  total : ∀ a b, a = b ∨ lt a b = true ∨ lt b a = true

theorem StrictTotal.asymm {β : Type} {lt : β → β → Bool} (h : StrictTotal lt) (a b : β) (hab : lt a b = true) :
    lt b a = false := by
  cases hba : lt b a
  · rfl
  · have := h.trans _ _ _ hab hba; rw [h.irrefl] at this; exact absurd this (by simp)

theorem lexBy_st {α : Type} [DecidableEq α] {lt : α → α → Bool} (h : StrictTotal lt) : StrictTotal (lexBy lt) where
  irrefl := by
    intro a
    induction a with
    | nil => rfl
    | cons x xs ih => simp [lexBy, h.irrefl, ih]
  trans := by
    intro a
    induction a with
    | nil =>
      intro b c h1 h2
      cases b with
      | nil => simp [lexBy] at h1
      | cons y ys => cases c with
        | nil => simp [lexBy] at h2
        | cons z zs => rfl
    | cons x xs ih =>
      intro b c h1 h2
      cases b with
      | nil => simp [lexBy] at h1
      | cons y ys =>
        cases c with
        | nil => simp [lexBy] at h2
        | cons z zs =>
          simp only [lexBy, Bool.or_eq_true, Bool.and_eq_true, decide_eq_true_eq] at h1 h2 ⊢
          rcases h1 with h1 | ⟨rfl, h1⟩ <;> rcases h2 with h2 | ⟨rfl, h2⟩
          · exact Or.inl (h.trans _ _ _ h1 h2)
          · exact Or.inl h1
          · exact Or.inl h2
          · exact Or.inr ⟨rfl, ih _ _ h1 h2⟩
  total := by
    intro a
    induction a with
    | nil => intro b; cases b <;> simp [lexBy]
    | cons x xs ih =>
      intro b
      cases b with
      | nil => simp [lexBy]
      | cons y ys =>
        simp only [lexBy, Bool.or_eq_true, Bool.and_eq_true, decide_eq_true_eq, List.cons.injEq]
        rcases h.total x y with rfl | hxy | hyx
        · rcases ih ys with rfl | h1 | h1
          · exact Or.inl ⟨rfl, rfl⟩
          · exact Or.inr (Or.inl (Or.inr ⟨rfl, h1⟩))
          · exact Or.inr (Or.inr (Or.inr ⟨rfl, h1⟩))
        · exact Or.inr (Or.inl (Or.inl hxy))
        · exact Or.inr (Or.inr (Or.inl hyx))

theorem lexLt_st : StrictTotal lexLt :=
  lexBy_st ⟨fun a => by simp, fun a b c h1 h2 => by simp at h1 h2 ⊢; omega, fun a b => by
    rcases Nat.lt_trichotomy a b with h | h | h <;> simp [h]⟩

theorem keyLt_st : StrictTotal keyLt := lexBy_st lexLt_st

/-! ### T7: decimal ids are injective -/

/-- The value of a digit string. -/
def ofD (l : List Nat) : Nat := l.foldl (fun a d => 10 * a + d) 0

theorem ofD_snoc (l : List Nat) (d : Nat) : ofD (l ++ [d]) = 10 * ofD l + d := by
  simp [ofD, List.foldl_append]

theorem digitsAux_spec : ∀ fuel n (acc : List Nat), n < fuel → ∃ ds, digitsAux fuel n acc = ds ++ acc ∧ ofD ds = n
  | 0, _, _, h => absurd h (Nat.not_lt_zero _)
  | fuel + 1, n, acc, h => by
    unfold digitsAux
    split
    · exact ⟨[n], rfl, by simp [ofD]⟩
    · rename_i hn
      obtain ⟨ds, h1, h2⟩ := digitsAux_spec fuel (n / 10) (n % 10 :: acc) (by omega)
      refine ⟨ds ++ [n % 10], by rw [h1]; simp, ?_⟩
      rw [ofD_snoc, h2]; omega

theorem ofD_digits (n : Nat) : ofD (digits n) = n := by
  obtain ⟨ds, h1, h2⟩ := digitsAux_spec (n + 1) n [] (by omega)
  unfold digits; rw [h1]; simpa using h2

theorem digits_inj {a b : Nat} (h : digits a = digits b) : a = b := by
  rw [← ofD_digits a, ← ofD_digits b, h]

theorem ofD_zeros (k : Nat) (l : List Nat) : ofD (List.replicate k 0 ++ l) = ofD l := by
  unfold ofD
  rw [List.foldl_append]
  congr 1
  induction k with
  | zero => rfl
  | succ k ih => rw [List.replicate_succ', List.foldl_append, ih]; rfl

theorem ofD_termId (n : Nat) : ofD (termId n) = n := by
  unfold termId pad2
  split
  · rw [ofD_zeros, ofD_digits]
  · exact ofD_digits n

theorem termId_inj {a b : Nat} (h : termId a = termId b) : a = b := by
  rw [← ofD_termId a, ← ofD_termId b, h]

theorem Kind.ix_inj {a b : Kind} (h : a.ix = b.ix) : a = b := by
  cases a <;> cases b <;> first | rfl | (simp [Kind.ix] at h)

theorem canonKey_inj {r r' : Row} (h : canonKey r = canonKey r') : r = r' := by
  cases r; cases r'
  simp only [canonKey, List.cons.injEq, and_true] at h
  obtain ⟨h1, h2, h3, h4, h5, h6, h7, h8⟩ := h
  rw [digits_inj h1, digits_inj h2, termId_inj h3, h4, digits_inj h5, digits_inj h6, Kind.ix_inj h7, h8]

theorem copyKey_inj {c c' : Copy} (h : copyKey c = copyKey c') : c.row.fp = c'.row.fp ∧ c.device = c'.device := by
  simp only [copyKey, canonKey, List.cons_append, List.nil_append, List.cons.injEq, and_true] at h
  obtain ⟨h1, h2, h3, h4, h5, h6, h7, h8, h9⟩ := h
  refine ⟨canonKey_inj ?_, digits_inj h9⟩
  simp only [canonKey, h1, h2, h3, h4, h5, h6, h7, h8]

/-! ### T7: sorting -/

theorem insertBy_sorted {α β : Type} {LT : β → β → Bool} (hs : StrictTotal LT) (κ : α → β) (x : α) (l : List α)
    (h : l.Pairwise (fun a b => LT (κ b) (κ a) = false)) :
    (insertBy (fun a b => LT (κ a) (κ b)) x l).Pairwise (fun a b => LT (κ b) (κ a) = false) := by
  induction l with
  | nil => simp [insertBy]
  | cons y ys ih =>
    rw [List.pairwise_cons] at h
    unfold insertBy
    split
    · rename_i hyx
      refine List.pairwise_cons.2 ⟨fun z hz => ?_, ih h.2⟩
      rcases List.mem_cons.1 ((insertBy_perm _ x ys).mem_iff.1 hz) with rfl | hz
      · exact hs.asymm _ _ hyx
      · exact h.1 z hz
    · rename_i hyx
      simp only [Bool.not_eq_true] at hyx
      refine List.pairwise_cons.2 ⟨fun z hz => ?_, List.pairwise_cons.2 h⟩
      rcases List.mem_cons.1 hz with rfl | hz
      · exact hyx
      · cases hzx : LT (κ z) (κ x)
        · rfl
        · rcases hs.total (κ y) (κ z) with he | hl | hl
          · rw [he, hzx] at hyx; exact absurd hyx (by simp)
          · rw [hs.trans _ _ _ hl hzx] at hyx; exact absurd hyx (by simp)
          · rw [h.1 z hz] at hl; exact absurd hl (by simp)

theorem isort_sorted {α β : Type} {LT : β → β → Bool} (hs : StrictTotal LT) (κ : α → β) (l : List α) :
    (isort (fun a b => LT (κ a) (κ b)) l).Pairwise (fun a b => LT (κ b) (κ a) = false) := by
  induction l with
  | nil => simp [isort]
  | cons x xs ih => exact insertBy_sorted hs κ x _ ih

theorem keySort_sorted {α : Type} (κ : α → List (List Nat)) (l : List α) :
    (keySort κ l).Pairwise (fun a b => keyLt (κ b) (κ a) = false) :=
  isort_sorted keyLt_st κ l

/-- A sorted list whose keys are distinct is strictly sorted. -/
theorem sorted_strict {α β : Type} {LT : β → β → Bool} (hs : StrictTotal LT) (κ : α → β) (l : List α)
    (h : l.Pairwise (fun a b => LT (κ b) (κ a) = false)) (hd : (l.map κ).Nodup) :
    l.Pairwise (fun a b => LT (κ a) (κ b) = true) := by
  rw [List.Nodup, List.pairwise_map] at hd
  refine (h.and hd).imp fun ⟨h1, h2⟩ => ?_
  rcases hs.total (κ _) (κ _) with he | hl | hl
  · exact absurd he h2
  · exact hl
  · rw [h1] at hl; exact absurd hl (by simp)

/-- Two strictly sorted lists with the same members are equal. -/
theorem eq_of_sorted {α : Type} {R : α → α → Prop} (hirr : ∀ a, ¬ R a a) (has : ∀ a b, R a b → ¬ R b a) :
    ∀ l l' : List α, l.Pairwise R → l'.Pairwise R → (∀ x, x ∈ l ↔ x ∈ l') → l = l'
  | [], [], _, _, _ => rfl
  | [], b :: _, _, _, hm => absurd ((hm b).2 List.mem_cons_self) (by simp)
  | a :: _, [], _, _, hm => absurd ((hm a).1 List.mem_cons_self) (by simp)
  | a :: as, b :: bs, h, h', hm => by
    rw [List.pairwise_cons] at h h'
    have hab : a = b := by
      apply Classical.byContradiction
      intro hne
      have ha : a ∈ bs := by
        rcases List.mem_cons.1 ((hm a).1 List.mem_cons_self) with he | ha
        · exact absurd he hne
        · exact ha
      have hb : b ∈ as := by
        rcases List.mem_cons.1 ((hm b).2 List.mem_cons_self) with he | hb
        · exact absurd he.symm hne
        · exact hb
      exact has _ _ (h.1 b hb) (h'.1 a ha)
    subst hab
    rw [eq_of_sorted hirr has as bs h.2 h'.2 fun x => ?_]
    constructor
    · intro hx
      rcases List.mem_cons.1 ((hm x).1 (List.mem_cons_of_mem _ hx)) with rfl | hx'
      · exact absurd (h.1 _ hx) (hirr _)
      · exact hx'
    · intro hx
      rcases List.mem_cons.1 ((hm x).2 (List.mem_cons_of_mem _ hx)) with rfl | hx'
      · exact absurd (h'.1 _ hx) (hirr _)
      · exact hx'

/-- Two sorted permutations are equal when equal keys mean equal elements. -/
theorem eq_of_sorted_perm {α : Type} {R : α → α → Prop} (hanti : ∀ a b, R a b → R b a → a = b) :
    ∀ l l' : List α, l.Pairwise R → l'.Pairwise R → l.Perm l' → l = l'
  | [], _, _, _, hp => (List.Perm.nil_eq hp)
  | a :: as, [], _, _, hp => absurd hp.symm (by simp)
  | a :: as, b :: bs, h, h', hp => by
    rw [List.pairwise_cons] at h h'
    by_cases hab : a = b
    · subst hab
      rw [eq_of_sorted_perm hanti as bs h.2 h'.2 hp.cons_inv]
    · have ha : a ∈ bs := by
        rcases List.mem_cons.1 (hp.mem_iff.1 List.mem_cons_self) with he | ha
        · exact absurd he hab
        · exact ha
      have hb : b ∈ as := by
        rcases List.mem_cons.1 (hp.mem_iff.2 List.mem_cons_self) with he | hb
        · exact absurd he.symm hab
        · exact hb
      exact absurd (hanti _ _ (h.1 b hb) (h'.1 a ha)) hab

/-- The head of a sorted list is a minimum. -/
theorem keySort_head_min {α : Type} (κ : α → List (List Nat)) (l : List α) (h : α) (t : List α)
    (hs : keySort κ l = h :: t) : h ∈ l ∧ ∀ z ∈ l, keyLt (κ z) (κ h) = false := by
  have hp := keySort_perm κ l
  have hsort := keySort_sorted κ l
  rw [hs] at hp hsort
  refine ⟨hp.mem_iff.1 List.mem_cons_self, fun z hz => ?_⟩
  rcases List.mem_cons.1 (hp.mem_iff.2 hz) with rfl | hz
  · exact keyLt_st.irrefl _
  · exact (List.pairwise_cons.1 hsort).1 z hz

/-- The sorted head's key depends only on the members. -/
theorem keySort_head_key {α : Type} (κ : α → List (List Nat)) (l l' : List α) (dflt : α)
    (hm : ∀ x, x ∈ l ↔ x ∈ l') : κ ((keySort κ l).headD dflt) = κ ((keySort κ l').headD dflt) := by
  cases hs : keySort κ l with
  | nil =>
    have : l = [] := by have := keySort_perm κ l; rw [hs] at this; exact (List.Perm.nil_eq this).symm
    have : l' = [] := List.eq_nil_iff_forall_not_mem.2 fun x hx => by
      rw [← hm, this] at hx; simp at hx
    have : keySort κ l' = [] := by rw [this]; rfl
    rw [this]
  | cons h t =>
    cases hs' : keySort κ l' with
    | nil =>
      have h1 := (keySort_head_min κ l h t hs).1
      have : l' = [] := by have := keySort_perm κ l'; rw [hs'] at this; exact (List.Perm.nil_eq this).symm
      rw [hm, this] at h1; simp at h1
    | cons h' t' =>
      obtain ⟨hm1, hmin1⟩ := keySort_head_min κ l h t hs
      obtain ⟨hm2, hmin2⟩ := keySort_head_min κ l' h' t' hs'
      simp only [List.headD_cons]
      rcases keyLt_st.total (κ h) (κ h') with he | hl | hl
      · exact he
      · rw [hmin2 h ((hm h).1 hm1)] at hl; exact absurd hl (by simp)
      · rw [hmin1 h' ((hm h').2 hm2)] at hl; exact absurd hl (by simp)

theorem minOpt_congr {l l' : List Nat} (hm : ∀ x, x ∈ l ↔ x ∈ l') : l.min? = l'.min? := by
  cases h1 : l.min? with
  | none =>
    rw [List.min?_eq_none_iff] at h1
    subst h1
    have : l' = [] := List.eq_nil_iff_forall_not_mem.2 fun x hx => by rw [← hm] at hx; simp at hx
    rw [this]; rfl
  | some a =>
    rw [List.min?_eq_some_iff] at h1
    symm; rw [List.min?_eq_some_iff]
    exact ⟨(hm a).1 h1.1, fun b hb => h1.2 b ((hm b).2 hb)⟩

theorem maxOpt_congr {l l' : List Nat} (hm : ∀ x, x ∈ l ↔ x ∈ l') : l.max? = l'.max? := by
  cases h1 : l.max? with
  | none =>
    rw [List.max?_eq_none_iff] at h1
    subst h1
    have : l' = [] := List.eq_nil_iff_forall_not_mem.2 fun x hx => by rw [← hm] at hx; simp at hx
    rw [this]; rfl
  | some a =>
    rw [List.max?_eq_some_iff] at h1
    symm; rw [List.max?_eq_some_iff]
    exact ⟨(hm a).1 h1.1, fun b hb => h1.2 b ((hm b).2 hb)⟩

theorem minOpt_snoc (l : List Nat) (x : Nat) :
    (l ++ [x]).min? = some (match l.min? with | some m => min m x | none => x) := by
  rw [List.min?_eq_some_iff]
  cases h : l.min? with
  | none =>
    rw [List.min?_eq_none_iff] at h; subst h; simp
  | some m =>
    rw [List.min?_eq_some_iff] at h
    dsimp only
    refine ⟨?_, fun b hb => ?_⟩
    · rcases Nat.le_total m x with hl | hl
      · rw [Nat.min_eq_left hl]; exact List.mem_append_left _ h.1
      · rw [Nat.min_eq_right hl]; simp
    · simp only [List.mem_append, List.mem_singleton] at hb
      rcases hb with hb | rfl
      · exact Nat.le_trans (Nat.min_le_left _ _) (h.2 b hb)
      · exact Nat.min_le_right _ _

/-! ### T7: the kept copy and the dropped copies depend only on the copies read -/

theorem isEmpty_congr {α : Type} {l l' : List α} (hm : ∀ x, x ∈ l ↔ x ∈ l') : l.isEmpty = l'.isEmpty := by
  have : l = [] ↔ l' = [] := by
    rw [List.eq_nil_iff_forall_not_mem, List.eq_nil_iff_forall_not_mem]
    exact ⟨fun h x hx => h x ((hm x).2 hx), fun h x hx => h x ((hm x).1 hx)⟩
  rw [Bool.eq_iff_iff, List.isEmpty_iff, List.isEmpty_iff]
  exact this

/-- The kept copy's content and device depend only on which copies were read (not their order or multiplicity). -/
theorem keptCopy_det (d : Nat) (cs cs' : List Copy) (hm : ∀ c, c ∈ cs ↔ c ∈ cs') :
    (keptCopy d cs).row.fp = (keptCopy d cs').row.fp ∧ (keptCopy d cs).device = (keptCopy d cs').device := by
  unfold keptCopy
  dsimp only
  have hown : ∀ x, x ∈ cs.filter (fun c => decide (c.device = d)) ↔ x ∈ cs'.filter (fun c => decide (c.device = d)) := by
    intro x; simp only [List.mem_filter, hm]
  rw [isEmpty_congr hown]
  apply copyKey_inj
  apply keySort_head_key
  by_cases hc : (cs'.filter (fun c => decide (c.device = d))).isEmpty = true
  · simp only [hc, ↓reduceIte]; exact hm
  · simp only [hc, Bool.false_eq_true, ↓reduceIte]; exact hown

/-- The dropped scan's step. -/
def dropStep (k : Copy) (acc : List Copy) (c : Copy) : List Copy :=
  if c.row.fp = k.row.fp ∨ acc.any (fun d => decide (d.row.fp = c.row.fp)) then acc else acc ++ [c]

/-- The dropped scan's device key. -/
def devKey (c : Copy) : List (List Nat) := [digits c.device]

theorem dropped_eq (k : Copy) (cs : List Copy) : dropped k cs = (keySort devKey cs).foldl (dropStep k) [] := rfl

theorem dropScan_spec (k : Copy) : ∀ (l acc : List Copy), l.Pairwise (fun a b => keyLt (devKey b) (devKey a) = false) →
    ∃ tail, l.foldl (dropStep k) acc = acc ++ tail ∧ tail.Sublist l ∧
      (∀ c ∈ tail, c.row.fp ≠ k.row.fp ∧ (∀ a ∈ acc, a.row.fp ≠ c.row.fp) ∧
        ∀ c' ∈ l, c'.row.fp = c.row.fp → keyLt (devKey c') (devKey c) = false) ∧
      ((acc.map (·.row.fp)).Nodup → ((acc ++ tail).map (·.row.fp)).Nodup) ∧
      (∀ c ∈ l, c.row.fp ≠ k.row.fp → ∃ c'' ∈ acc ++ tail, c''.row.fp = c.row.fp)
  | [], acc, _ => ⟨[], by simp, by simp, by simp, by simp, by simp⟩
  | x :: xs, acc, h => by
    rw [List.pairwise_cons] at h
    simp only [List.foldl_cons]
    by_cases hx : x.row.fp = k.row.fp ∨ acc.any (fun d => decide (d.row.fp = x.row.fp)) = true
    · have hs : dropStep k acc x = acc := by unfold dropStep; simp only [hx, ↓reduceIte]
      rw [hs]
      obtain ⟨tail, h1, h2, h3, h4, h5⟩ := dropScan_spec k xs acc h.2
      refine ⟨tail, h1, h2.cons x, fun c hc => ⟨(h3 c hc).1, (h3 c hc).2.1, fun c' hc' he => ?_⟩, h4, fun c hc hf => ?_⟩
      · rcases List.mem_cons.1 hc' with rfl | hc'
        · exfalso
          rcases hx with hx | hx
          · exact (h3 c hc).1 (he ▸ hx)
          · obtain ⟨a, ha, hae⟩ := List.any_eq_true.1 hx
            exact (h3 c hc).2.1 a ha (by simpa [he] using hae)
        · exact (h3 c hc).2.2 c' hc' he
      · rcases List.mem_cons.1 hc with rfl | hc
        · rcases hx with hx | hx
          · exact absurd hx hf
          · obtain ⟨a, ha, hae⟩ := List.any_eq_true.1 hx
            exact ⟨a, List.mem_append_left _ ha, by simpa using hae⟩
        · exact h5 c hc hf
    · have hs : dropStep k acc x = acc ++ [x] := by unfold dropStep; simp only [hx, ↓reduceIte]
      rw [hs]
      simp only [not_or, Bool.not_eq_true, List.any_eq_false, decide_eq_true_eq] at hx
      obtain ⟨tail, h1, h2, h3, h4, h5⟩ := dropScan_spec k xs (acc ++ [x]) h.2
      refine ⟨x :: tail, by rw [h1]; simp, h2.cons_cons x, fun c hc => ?_, fun hn => ?_, fun c hc hf => ?_⟩
      · rcases List.mem_cons.1 hc with rfl | hc
        · refine ⟨hx.1, fun a ha he => hx.2 a ha he, fun c' hc' _ => ?_⟩
          rcases List.mem_cons.1 hc' with rfl | hc'
          · exact keyLt_st.irrefl _
          · exact h.1 c' hc'
        · obtain ⟨g1, g2, g3⟩ := h3 c hc
          refine ⟨g1, fun a ha => g2 a (List.mem_append_left _ ha), fun c' hc' he => ?_⟩
          rcases List.mem_cons.1 hc' with rfl | hc'
          · exact absurd he (g2 _ (by simp))
          · exact g3 c' hc' he
      · have := h4 (by
          rw [List.map_append, List.nodup_append]
          refine ⟨hn, by simp, fun a ha b hb => ?_⟩
          simp only [List.map_cons, List.map_nil, List.mem_singleton] at hb
          obtain ⟨a', ha', rfl⟩ := List.mem_map.1 ha
          rw [hb]; exact hx.2 a' ha')
        simpa using this
      · rcases List.mem_cons.1 hc with rfl | hc
        · exact ⟨c, by simp, rfl⟩
        · obtain ⟨c'', hc'', he⟩ := h5 c hc hf
          exact ⟨c'', by simpa using hc'', he⟩

/-- The dropped copies, as `(device, content)` pairs: one per content other than the kept one, from the smallest
device holding it. -/
theorem dropped_pairs (k : Copy) (cs : List Copy) :
    ((dropped k cs).map (fun c => (c.device, c.row.fp))).Nodup ∧
      (∀ d f, (d, f) ∈ (dropped k cs).map (fun c => (c.device, c.row.fp)) ↔
        f ≠ k.row.fp ∧ (∃ c ∈ cs, c.row.fp = f ∧ c.device = d) ∧
          ∀ c ∈ cs, c.row.fp = f → keyLt [digits c.device] [digits d] = false) ∧
      ((dropped k cs).map (·.device)).Pairwise (fun a b => keyLt [digits b] [digits a] = false) := by
  rw [dropped_eq]
  have hp := keySort_perm devKey cs
  have hsort := keySort_sorted devKey cs
  obtain ⟨tail, h1, h2, h3, h4, h5⟩ := dropScan_spec k _ [] hsort
  simp only [List.nil_append] at h1 h4 h5
  rw [h1]
  have hnd := h4 (by simp)
  refine ⟨?_, fun d f => ?_, ?_⟩
  · rw [List.Nodup, List.pairwise_map]
    rw [List.Nodup, List.pairwise_map] at hnd
    exact hnd.imp fun h he => h (congrArg Prod.snd he)
  · constructor
    · intro hm
      obtain ⟨c, hc, he⟩ := List.mem_map.1 hm
      simp only [Prod.mk.injEq] at he
      obtain ⟨rfl, rfl⟩ := he
      obtain ⟨g1, _, g3⟩ := h3 c hc
      refine ⟨g1, ⟨c, hp.mem_iff.1 (h2.subset hc), rfl, rfl⟩, fun c' hc' he => g3 c' (hp.mem_iff.2 hc') he⟩
    · rintro ⟨hf, ⟨c, hc, rfl, rfl⟩, hmin⟩
      obtain ⟨c'', hc'', he⟩ := h5 c (hp.mem_iff.2 hc) hf
      obtain ⟨_, _, g3⟩ := h3 c'' hc''
      have e1 := g3 c (hp.mem_iff.2 hc) he.symm
      have e2 := hmin c'' (hp.mem_iff.1 (h2.subset hc'')) he
      refine List.mem_map.2 ⟨c'', hc'', ?_⟩
      rcases keyLt_st.total [digits c''.device] [digits c.device] with hk | hk | hk
      · simp only [List.cons.injEq, and_true] at hk; rw [digits_inj hk, he]
      · simp [devKey] at e1 e2; rw [e2] at hk; exact absurd hk (by simp)
      · simp [devKey] at e1 e2; rw [e1] at hk; exact absurd hk (by simp)
  · rw [List.pairwise_map]
    exact (hsort.sublist h2).imp id

/-- The dropped devices depend only on which copies were read and on the kept content. -/
theorem dropped_det (k k' : Copy) (cs cs' : List Copy) (hm : ∀ c, c ∈ cs ↔ c ∈ cs') (hk : k.row.fp = k'.row.fp) :
    (dropped k cs).map (·.device) = (dropped k' cs').map (·.device) := by
  obtain ⟨n1, m1, s1⟩ := dropped_pairs k cs
  obtain ⟨n2, m2, s2⟩ := dropped_pairs k' cs'
  have hperm := (List.perm_ext_iff_of_nodup n1 n2).2 fun ⟨d, f⟩ => by
    rw [m1, m2, hk]
    simp only [hm]
  have := hperm.map Prod.fst
  simp only [List.map_map] at this
  refine eq_of_sorted_perm (fun a b h1 h2 => ?_) _ _ s1 s2 this
  rcases keyLt_st.total [digits a] [digits b] with he | he | he
  · simp only [List.cons.injEq, and_true] at he; exact digits_inj he
  · rw [h2] at he; exact absurd he (by simp)
  · rw [h1] at he; exact absurd he (by simp)

/-! ### T7: each merged term's data in closed form over the segments read -/

/-- A segment's `introduced`: its terms in first-appearance order. -/
def introduced (rows : List Row) : List Nat :=
  rows.foldl (fun acc r => if acc.contains r.term then acc else acc ++ [r.term]) []

theorem introduced_snoc (p : List Row) (e : Row) : introduced (p ++ [e]) =
    if (introduced p).contains e.term then introduced p else introduced p ++ [e.term] := by
  unfold introduced
  rw [List.foldl_append]
  rfl

theorem mem_introduced (p : List Row) (τ : Nat) : τ ∈ introduced p ↔ ∃ r ∈ p, r.term = τ := by
  induction p using snoc_induction with
  | nil => simp [introduced]
  | append_singleton p e ih =>
    have hr : (∃ r ∈ p ++ [e], r.term = τ) ↔ (∃ r ∈ p, r.term = τ) ∨ e.term = τ := by
      constructor
      · rintro ⟨r, hr, hrt⟩
        rcases List.mem_append.1 hr with hr | hr
        · exact Or.inl ⟨r, hr, hrt⟩
        · obtain rfl := List.mem_singleton.1 hr; exact Or.inr hrt
      · rintro (⟨r, hr, hrt⟩ | hrt)
        · exact ⟨r, List.mem_append_left _ hr, hrt⟩
        · exact ⟨e, by simp, hrt⟩
    rw [hr, introduced_snoc, ← ih]
    split
    · rename_i hc
      constructor
      · exact Or.inl
      · rintro (h | rfl)
        · exact h
        · exact List.contains_iff_mem.1 hc
    · simp only [List.mem_append, List.mem_singleton]
      constructor
      · rintro (h | rfl)
        · exact Or.inl h
        · exact Or.inr rfl
      · rintro (h | rfl)
        · exact Or.inl h
        · exact Or.inr rfl

/-- The file orders of term `τ` on device `d`: its place in `introduced` of each segment of `d` holding it. -/
def ordsOf (segs : List (Nat × List Row)) (d τ : Nat) : List Nat :=
  segs.filterMap fun s => if s.1 = d ∧ τ ∈ introduced s.2 then some ((introduced s.2).idxOf τ) else none

/-- The times of term `τ`'s rows. -/
def msOf (segs : List (Nat × List Row)) (τ : Nat) : List Nat :=
  segs.flatMap fun s => (s.2.filter fun r => decide (r.term = τ)).map (·.ms)

/-- The merge's per-term data in closed form: the terms read, each device's file order, and the start. -/
def TermChar (segs : List (Nat × List Row)) (ts : List MTerm) : Prop :=
  (∀ τ, (∃ t ∈ ts, t.term = τ) ↔ ∃ s ∈ segs, ∃ r ∈ s.2, r.term = τ) ∧
  (∀ t ∈ ts, ∀ d, lookup d t.orders = (ordsOf segs d t.term).min?) ∧
  (∀ t ∈ ts, (msOf segs t.term).min? = some t.started)

theorem ordsOf_seg (segs : List (Nat × List Row)) (dev : Nat) (q : List Row) (d τ : Nat) :
    ordsOf (segs ++ [(dev, q)]) d τ =
      ordsOf segs d τ ++ (if dev = d ∧ τ ∈ introduced q then [(introduced q).idxOf τ] else []) := by
  unfold ordsOf
  rw [List.filterMap_append]
  simp only [List.filterMap_cons, List.filterMap_nil]
  by_cases h : dev = d ∧ τ ∈ introduced q <;> simp [h]

theorem msOf_seg (segs : List (Nat × List Row)) (dev : Nat) (q : List Row) (τ : Nat) :
    msOf (segs ++ [(dev, q)]) τ = msOf segs τ ++ (q.filter fun r => decide (r.term = τ)).map (·.ms) := by
  simp [msOf, List.flatMap_append]

theorem ordsOf_step_other (segs : List (Nat × List Row)) (dev : Nat) (p : List Row) (e : Row) (d τ : Nat)
    (h : τ ≠ e.term) : ordsOf (segs ++ [(dev, p ++ [e])]) d τ = ordsOf (segs ++ [(dev, p)]) d τ := by
  rw [ordsOf_seg, ordsOf_seg, introduced_snoc]
  split
  · rfl
  · have hm : τ ∈ introduced p ++ [e.term] ↔ τ ∈ introduced p := by simp [h]
    simp only [hm]
    split
    · rename_i hc; rw [List.idxOf_append, ite_eq_left hc.2]
    · rfl

theorem ordsOf_step_new (segs : List (Nat × List Row)) (dev : Nat) (p : List Row) (e : Row) (d : Nat)
    (h : e.term ∉ introduced p) : ordsOf (segs ++ [(dev, p ++ [e])]) d e.term =
      ordsOf (segs ++ [(dev, p)]) d e.term ++ (if dev = d then [(introduced p).length] else []) := by
  rw [ordsOf_seg, ordsOf_seg, introduced_snoc]
  have hc : (introduced p).contains e.term = false := by
    cases hc : (introduced p).contains e.term
    · rfl
    · exact absurd (List.contains_iff_mem.1 hc) h
  simp only [hc, Bool.false_eq_true, ↓reduceIte, h, and_false, List.append_nil]
  by_cases hd : dev = d
  · simp [hd, List.idxOf_append, h]
  · simp [hd]

theorem msOf_step (segs : List (Nat × List Row)) (dev : Nat) (p : List Row) (e : Row) (τ : Nat) :
    msOf (segs ++ [(dev, p ++ [e])]) τ = msOf (segs ++ [(dev, p)]) τ ++ (if e.term = τ then [e.ms] else []) := by
  rw [msOf_seg, msOf_seg]
  simp only [List.filter_append, List.map_append, List.append_assoc]
  congr 2
  simp only [List.filter_cons, List.filter_nil]
  split <;> simp_all

theorem rows_step (segs : List (Nat × List Row)) (dev : Nat) (p : List Row) (e : Row) (τ : Nat) :
    (∃ s ∈ segs ++ [(dev, p ++ [e])], ∃ r ∈ s.2, r.term = τ) ↔
      (∃ s ∈ segs ++ [(dev, p)], ∃ r ∈ s.2, r.term = τ) ∨ e.term = τ := by
  simp only [List.mem_append, List.mem_singleton]
  constructor
  · rintro ⟨s, hs | rfl, r, hr, rfl⟩
    · exact Or.inl ⟨s, Or.inl hs, r, hr, rfl⟩
    · rcases List.mem_append.1 hr with hr | hr
      · exact Or.inl ⟨_, Or.inr rfl, r, hr, rfl⟩
      · rw [List.mem_singleton.1 hr]; exact Or.inr rfl
  · rintro (⟨s, hs | rfl, r, hr, rfl⟩ | rfl)
    · exact ⟨s, Or.inl hs, r, hr, rfl⟩
    · exact ⟨_, Or.inr rfl, r, List.mem_append_left _ hr, rfl⟩
    · exact ⟨_, Or.inr rfl, e, by simp, rfl⟩

theorem minOpt_step (l : List Nat) (x : Nat) : (l ++ [x]).min? = some (min ((l.min?).getD x) x) := by
  rw [minOpt_snoc]
  cases l.min? <;> simp

theorem addRow_char (segs : List (Nat × List Row)) (dev : Nat) (p : List Row) (st : List MTerm × List Nat) (e : Row)
    (h2 : st.2 = introduced p) (hc : TermChar (segs ++ [(dev, p)]) st.1) :
    (addRow dev st e).2 = introduced (p ++ [e]) ∧ TermChar (segs ++ [(dev, p ++ [e])]) (addRow dev st e).1 := by
  obtain ⟨c1, c2, c3⟩ := hc
  have hintro : (if (!st.2.contains e.term) = true then st.2 ++ [e.term] else st.2) = introduced (p ++ [e]) := by
    rw [introduced_snoc, h2]; cases (introduced p).contains e.term <;> rfl
  -- An unchanged term keeps its closed form.
  have keep : ∀ t ∈ st.1, t.term ≠ e.term →
      (∀ d, lookup d t.orders = (ordsOf (segs ++ [(dev, p ++ [e])]) d t.term).min?) ∧
        (msOf (segs ++ [(dev, p ++ [e])]) t.term).min? = some t.started := by
    intro t ht hne
    refine ⟨fun d => by rw [ordsOf_step_other _ _ _ _ _ _ hne, c2 t ht d], ?_⟩
    rw [msOf_step, ite_eq_right (Ne.symm hne), List.append_nil, c3 t ht]
  -- The order `addRow` passes.
  have horder : (if (!st.2.contains e.term) = true then some ((if (!st.2.contains e.term) = true then st.2 ++ [e.term]
      else st.2).length - 1) else none) =
      if e.term ∈ introduced p then none else some (introduced p).length := by
    rw [h2]
    by_cases hm : e.term ∈ introduced p
    · simp [hm]
    · have : (introduced p).contains e.term = false := by
        cases hh : (introduced p).contains e.term
        · rfl
        · exact absurd (List.contains_iff_mem.1 hh) hm
      simp [hm]
  -- The term of `e`, after `add`, has the closed form for the new segments.
  have upd : ∀ t : MTerm, t.term = e.term → (∀ d, lookup d t.orders = (ordsOf (segs ++ [(dev, p)]) d t.term).min?) →
      (msOf (segs ++ [(dev, p)]) t.term).min? = some t.started ∨ (t.orders = [] ∧ t.started = e.ms ∧
        msOf (segs ++ [(dev, p)]) t.term = [] ∧ e.term ∉ introduced p) →
      let t' := t.add dev (if e.term ∈ introduced p then none else some (introduced p).length) e
      (∀ d, lookup d t'.orders = (ordsOf (segs ++ [(dev, p ++ [e])]) d t'.term).min?) ∧
        (msOf (segs ++ [(dev, p ++ [e])]) t'.term).min? = some t'.started := by
    intro t hte hord hms
    dsimp only
    rw [add_term, hte]
    rw [hte] at hord hms
    refine ⟨fun d => ?_, ?_⟩
    · by_cases hm : e.term ∈ introduced p
      · simp only [MTerm.add, hm, ↓reduceIte]
        rw [hord d]
        have : introduced (p ++ [e]) = introduced p := by
          rw [introduced_snoc, ite_eq_left (List.contains_iff_mem.2 hm)]
        rw [ordsOf_seg, ordsOf_seg, this]
      · simp only [MTerm.add, hm, ↓reduceIte]
        rw [lookup_upsert, ordsOf_step_new _ _ _ _ _ hm]
        by_cases hd : dev = d
        · subst hd; simp only [↓reduceIte]; rw [minOpt_step, ← hord dev]
          cases lookup dev t.orders <;> simp [Nat.min_comm]
        · simp [hd, hord d]
    · simp only [MTerm.add]
      rw [msOf_step, ite_eq_left rfl, minOpt_step]
      rcases hms with hms | ⟨_, hst, hnil, _⟩
      · rw [hms]; simp
      · rw [hnil, hst]; simp
  unfold addRow
  dsimp only
  split
  · rename_i hany
    refine ⟨hintro, ?_, ?_, ?_⟩
    · intro τ
      rw [rows_step, ← c1]
      constructor
      · rintro ⟨t, ht, rfl⟩
        obtain ⟨t0, ht0, rfl⟩ := List.mem_map.1 ht
        split
        · rename_i he; right; rw [add_term, he]
        · left; exact ⟨t0, ht0, rfl⟩
      · rintro (⟨t0, ht0, rfl⟩ | rfl)
        · refine ⟨_, List.mem_map_of_mem ht0, ?_⟩
          split
          · rfl
          · rfl
        · obtain ⟨t0, ht0, hte⟩ := List.any_eq_true.1 hany
          refine ⟨_, List.mem_map_of_mem ht0, ?_⟩
          simp only [decide_eq_true_eq] at hte
          simp [hte, add_term]
    · intro t ht d
      obtain ⟨t0, ht0, rfl⟩ := List.mem_map.1 ht
      split
      · rename_i he
        rw [horder]
        exact (upd t0 he (c2 t0 ht0) (Or.inl (c3 t0 ht0))).1 d
      · rename_i he; exact (keep t0 ht0 he).1 d
    · intro t ht
      obtain ⟨t0, ht0, rfl⟩ := List.mem_map.1 ht
      split
      · rename_i he
        rw [horder]
        exact (upd t0 he (c2 t0 ht0) (Or.inl (c3 t0 ht0))).2
      · rename_i he; exact (keep t0 ht0 he).2
  · rename_i hany
    have hnone : ∀ t ∈ st.1, t.term ≠ e.term := by
      intro t ht hte
      exact hany (List.any_eq_true.2 ⟨t, ht, by simp [hte]⟩)
    have hnot : ¬ ∃ s ∈ segs ++ [(dev, p)], ∃ r ∈ s.2, r.term = e.term := by
      rw [← c1]; rintro ⟨t, ht, hte⟩; exact hnone t ht hte
    have hfresh : e.term ∉ introduced p := by
      rw [mem_introduced]; rintro ⟨r, hr, hre⟩
      exact hnot ⟨(dev, p), by simp, r, hr, hre⟩
    have hords : ∀ d, ordsOf (segs ++ [(dev, p)]) d e.term = [] := by
      intro d
      unfold ordsOf
      rw [List.filterMap_eq_nil_iff]
      intro s hs
      rw [ite_eq_right]
      rintro ⟨_, hm⟩
      rw [mem_introduced] at hm
      obtain ⟨r, hr, hre⟩ := hm
      exact hnot ⟨s, hs, r, hr, hre⟩
    have hmsn : msOf (segs ++ [(dev, p)]) e.term = [] := by
      unfold msOf
      rw [List.flatMap_eq_nil_iff]
      intro s hs
      rw [List.map_eq_nil_iff, List.filter_eq_nil_iff]
      intro r hr hre
      exact hnot ⟨s, hs, r, hr, by simpa using hre⟩
    have hnew := upd ⟨e.term, [], [], e.ms⟩ rfl (fun d => by simp [hords d, lookup])
      (Or.inr ⟨rfl, rfl, hmsn, hfresh⟩)
    refine ⟨hintro, ?_, ?_, ?_⟩
    · intro τ
      rw [rows_step, ← c1]
      simp only [List.mem_append, List.mem_singleton]
      constructor
      · rintro ⟨t, ht | rfl, rfl⟩
        · exact Or.inl ⟨t, ht, rfl⟩
        · right; rfl
      · rintro (⟨t, ht, rfl⟩ | rfl)
        · exact ⟨t, Or.inl ht, rfl⟩
        · exact ⟨_, Or.inr rfl, rfl⟩
    · intro t ht d
      simp only [List.mem_append, List.mem_singleton] at ht
      rcases ht with ht | rfl
      · exact (keep t ht (hnone t ht)).1 d
      · rw [horder]; exact hnew.1 d
    · intro t ht
      simp only [List.mem_append, List.mem_singleton] at ht
      rcases ht with ht | rfl
      · exact (keep t ht (hnone t ht)).2
      · rw [horder]; exact hnew.2

theorem segment_char (segs : List (Nat × List Row)) (dev : Nat) : ∀ (rows p : List Row) (st : List MTerm × List Nat),
    st.2 = introduced p → TermChar (segs ++ [(dev, p)]) st.1 →
      TermChar (segs ++ [(dev, p ++ rows)]) (rows.foldl (addRow dev) st).1
  | [], p, st, _, hc => by simpa using hc
  | e :: es, p, st, h2, hc => by
    obtain ⟨h2', hc'⟩ := addRow_char segs dev p st e h2 hc
    have := segment_char segs dev es (p ++ [e]) _ h2' hc'
    simpa using this

theorem char_empty_seg (segs : List (Nat × List Row)) (dev : Nat) (ts : List MTerm) (h : TermChar segs ts) :
    TermChar (segs ++ [(dev, [])]) ts := by
  obtain ⟨c1, c2, c3⟩ := h
  refine ⟨fun τ => ?_, fun t ht d => ?_, fun t ht => ?_⟩
  · rw [c1]; simp
  · rw [ordsOf_seg, c2 t ht d]; simp [introduced]
  · rw [msOf_seg]; simp [c3 t ht]

/-- **T7** (closed form): each merged term's terms, per-device file orders and start are those of the rows read. -/
theorem mergedTerms_char (segs : List (Nat × List Row)) : TermChar segs (mergedTerms segs) := by
  induction segs using snoc_induction with
  | nil => exact ⟨by simp [mergedTerms], by simp [mergedTerms], by simp [mergedTerms]⟩
  | append_singleton segs seg ih =>
    have : mergedTerms (segs ++ [seg]) = mergeSegment (mergedTerms segs) seg := by
      unfold mergedTerms; rw [List.foldl_append]; rfl
    rw [this]
    have := segment_char segs seg.1 seg.2 [] (mergedTerms segs, []) rfl (char_empty_seg _ _ _ ih)
    simpa [mergeSegment] using this

theorem lookup_isSome {β : Type} (k : Nat) (l : List (Nat × β)) : (lookup k l).isSome ↔ k ∈ l.map Prod.fst := by
  induction l with
  | nil => simp [lookup]
  | cons q rest ih =>
    obtain ⟨k', v⟩ := q
    simp only [lookup, List.map_cons, List.mem_cons]
    by_cases h : k' = k
    · subst h; simp
    · simp [h, ih, Ne.symm h]

theorem deviceOf_eq (t : MTerm) : deviceOf t = (keySort (fun d => [digits d]) (t.orders.map Prod.fst)).headD 0 := by
  unfold deviceOf; split <;> simp_all

/-- Segment lists with the same members. -/
def SameSegs (segs segs' : List (Nat × List Row)) : Prop := ∀ s, s ∈ segs ↔ s ∈ segs'

theorem ordsOf_congr {segs segs' : List (Nat × List Row)} (hS : SameSegs segs segs') (d τ : Nat) :
    (ordsOf segs d τ).min? = (ordsOf segs' d τ).min? :=
  minOpt_congr fun x => by unfold SameSegs at hS; simp only [ordsOf, List.mem_filterMap, hS]

theorem msOf_congr {segs segs' : List (Nat × List Row)} (hS : SameSegs segs segs') (τ : Nat) :
    (msOf segs τ).min? = (msOf segs' τ).min? :=
  minOpt_congr fun x => by unfold SameSegs at hS; simp only [msOf, List.mem_flatMap, hS]

theorem holds_congr {segs segs' : List (Nat × List Row)} (hS : SameSegs segs segs') (c : Copy) :
    Holds (mergedTerms segs) c ↔ Holds (mergedTerms segs') c := by
  unfold SameSegs at hS
  rw [(mergedTerms_spec segs).2, (mergedTerms_spec segs').2]
  simp only [hS]

theorem match_term {segs segs' : List (Nat × List Row)} (hS : SameSegs segs segs') (t : MTerm)
    (ht : t ∈ mergedTerms segs) : ∃ t' ∈ mergedTerms segs', t'.term = t.term := by
  unfold SameSegs at hS
  have h1 := ((mergedTerms_char segs).1 t.term).1 ⟨t, ht, rfl⟩
  simp only [hS] at h1
  exact ((mergedTerms_char segs').1 t.term).2 h1

/-- A term's copies are exactly the copies read of rows of that term. -/
theorem term_copies (segs : List (Nat × List Row)) (t : MTerm) (ht : t ∈ mergedTerms segs) (c : Copy) :
    (∃ sc ∈ t.copies, c ∈ sc.2) ↔ Holds (mergedTerms segs) c ∧ c.row.term = t.term := by
  have hw := (mergedTerms_spec segs).1
  constructor
  · rintro ⟨sc, hsc, hc⟩
    exact ⟨⟨t, ht, sc, hsc, hc⟩, ((hw.2 t ht).2 sc hsc).2 c hc |>.1⟩
  · rintro ⟨⟨t0, ht0, sc, hsc, hc⟩, hct⟩
    have : t0 = t := inj_of_nodup_map hw.1 ht0 ht (by rw [← hct, ((hw.2 t0 ht0).2 sc hsc).2 c hc |>.1])
    subst this
    exact ⟨sc, hsc, hc⟩

theorem key_copies (t : MTerm) (hw : t.WF) (sc : Nat × List Copy) (hsc : sc ∈ t.copies) (c : Copy) :
    c ∈ sc.2 ↔ (∃ sc' ∈ t.copies, c ∈ sc'.2) ∧ c.row.seq = sc.1 := by
  constructor
  · intro hc; exact ⟨⟨sc, hsc, hc⟩, ((hw.2 sc hsc).2 c hc).2⟩
  · rintro ⟨⟨sc', hsc', hc⟩, hs⟩
    have : sc' = sc := inj_of_nodup_map hw.1 hsc' hsc (by rw [← hs, ((hw.2 sc' hsc').2 c hc).2])
    exact this ▸ hc

/-- Two terms of the same id, merged from the same segments in any order, carry the same data. -/
theorem term_data {segs segs' : List (Nat × List Row)} (hS : SameSegs segs segs') (t t' : MTerm)
    (ht : t ∈ mergedTerms segs) (ht' : t' ∈ mergedTerms segs') (he : t.term = t'.term) :
    (∀ d, lookup d t.orders = lookup d t'.orders) ∧ t.started = t'.started ∧
      (∀ c, (∃ sc ∈ t.copies, c ∈ sc.2) ↔ (∃ sc ∈ t'.copies, c ∈ sc.2)) := by
  obtain ⟨_, a2, a3⟩ := mergedTerms_char segs
  obtain ⟨_, b2, b3⟩ := mergedTerms_char segs'
  refine ⟨fun d => by rw [a2 t ht, b2 t' ht', ordsOf_congr hS, he], ?_, fun c => ?_⟩
  · have := a3 t ht
    rw [msOf_congr hS, he, b3 t' ht'] at this
    exact (Option.some.inj this).symm
  · rw [term_copies segs t ht, term_copies segs' t' ht', holds_congr hS, he]

theorem place_data {segs segs' : List (Nat × List Row)} (hS : SameSegs segs segs') (t t' : MTerm)
    (ht : t ∈ mergedTerms segs) (ht' : t' ∈ mergedTerms segs') (he : t.term = t'.term) :
    (place t).2 = (place t').2 := by
  obtain ⟨h1, _, _⟩ := term_data hS t t' ht ht' he
  have hd : deviceOf t = deviceOf t' := by
    rw [deviceOf_eq, deviceOf_eq]
    have := keySort_head_key (fun d => [digits d]) (t.orders.map Prod.fst) (t'.orders.map Prod.fst) 0
      (fun x => by rw [← lookup_isSome, ← lookup_isSome, h1])
    simp only [List.cons.injEq, and_true] at this
    exact digits_inj this
  simp only [place, hd, h1]

/-- Two copies of one key, merged from the same segments in any order, have the same copies read. -/
theorem key_data {segs segs' : List (Nat × List Row)} (hS : SameSegs segs segs') (t t' : MTerm)
    (ht : t ∈ mergedTerms segs) (ht' : t' ∈ mergedTerms segs') (he : t.term = t'.term)
    (sc : Nat × List Copy) (hsc : sc ∈ t.copies) :
    ∃ sc' ∈ t'.copies, sc'.1 = sc.1 ∧ ∀ c, c ∈ sc.2 ↔ c ∈ sc'.2 := by
  have hw := (mergedTerms_spec segs).1.2 t ht
  have hw' := (mergedTerms_spec segs').1.2 t' ht'
  obtain ⟨_, _, h3⟩ := term_data hS t t' ht ht' he
  obtain ⟨c, hc⟩ := List.exists_mem_of_ne_nil _ (hw.2 sc hsc).1
  obtain ⟨sc', hsc', hc'⟩ := (h3 c).1 ⟨sc, hsc, hc⟩
  have hs : sc'.1 = sc.1 := by rw [← ((hw'.2 sc' hsc').2 c hc').2, ((hw.2 sc hsc).2 c hc).2]
  refine ⟨sc', hsc', hs, fun x => ?_⟩
  rw [key_copies t hw sc hsc, key_copies t' hw' sc' hsc', h3, hs]

/-! ### T7: the per-device clamp in closed form -/

/-- The clamp's order within a device: file order, then term. -/
def clampKey (p : MTerm × Nat × Nat) : List (List Nat) := [[p.2.2], termId p.1.term]

def clampFloor (o : Option Nat) (s : Nat) : Nat :=
  match o with
  | some f => max f s
  | none => s

/-- The clamp's scan over one device's terms. -/
def crun : Option Nat → List (MTerm × Nat × Nat) → List (Nat × Nat)
  | _, [] => []
  | o, q :: qs => (q.1.term, clampFloor o q.1.started) :: crun (some (clampFloor o q.1.started)) qs

/-- The devices of the placed terms, in first-appearance order. -/
def clampDevices (placed : List (MTerm × Nat × Nat)) : List Nat :=
  placed.foldl (fun ds p => if ds.contains p.2.1 then ds else ds ++ [p.2.1]) []

theorem clampStarts_eq (placed : List (MTerm × Nat × Nat)) : clampStarts placed =
    (clampDevices placed).flatMap fun d => crun none (keySort clampKey (placed.filter fun p => decide (p.2.1 = d))) := by
  have hf : ∀ (m : List (MTerm × Nat × Nat)) (o : Option Nat) (acc : List (Nat × Nat)),
      (m.foldl (fun (acc : Option Nat × List (Nat × Nat)) (p : MTerm × Nat × Nat) =>
        (some (match acc.1 with | some f => max f p.1.started | none => p.1.started),
          acc.2 ++ [(p.1.term, match acc.1 with | some f => max f p.1.started | none => p.1.started)])) (o, acc)).2 =
        acc ++ crun o m := by
    intro m
    induction m with
    | nil => intro o acc; simp [crun]
    | cons q qs ih =>
      intro o acc
      simp only [List.foldl_cons]
      rw [ih]
      cases o <;> simp [crun, clampFloor]
  unfold clampStarts clampDevices
  dsimp only
  congr 1
  funext d
  exact (hf _ none []).trans (List.nil_append _)

theorem clampDevices_mem_aux (placed : List (MTerm × Nat × Nat)) : ∀ (acc : List Nat) (d : Nat),
    d ∈ placed.foldl (fun ds p => if ds.contains p.2.1 then ds else ds ++ [p.2.1]) acc ↔
      d ∈ acc ∨ ∃ p ∈ placed, p.2.1 = d := by
  induction placed with
  | nil => simp
  | cons q qs ih =>
    intro acc d
    simp only [List.foldl_cons]
    rw [ih]
    split
    · rename_i hc
      constructor
      · rintro (h | ⟨p, hp, rfl⟩)
        · exact Or.inl h
        · exact Or.inr ⟨p, List.mem_cons_of_mem _ hp, rfl⟩
      · rintro (h | ⟨p, hp, rfl⟩)
        · exact Or.inl h
        · rcases List.mem_cons.1 hp with rfl | hp
          · exact Or.inl (List.contains_iff_mem.1 hc)
          · exact Or.inr ⟨p, hp, rfl⟩
    · rw [List.mem_append, List.mem_singleton]
      constructor
      · rintro ((h | rfl) | ⟨p, hp, rfl⟩)
        · exact Or.inl h
        · exact Or.inr ⟨q, List.mem_cons_self, rfl⟩
        · exact Or.inr ⟨p, List.mem_cons_of_mem _ hp, rfl⟩
      · rintro (h | ⟨p, hp, rfl⟩)
        · exact Or.inl (Or.inl h)
        · rcases List.mem_cons.1 hp with rfl | hp
          · exact Or.inl (Or.inr rfl)
          · exact Or.inr ⟨p, hp, rfl⟩

theorem clampDevices_mem (placed : List (MTerm × Nat × Nat)) (d : Nat) :
    d ∈ clampDevices placed ↔ ∃ p ∈ placed, p.2.1 = d := by
  unfold clampDevices; rw [clampDevices_mem_aux]; simp

theorem crun_spec : ∀ (m : List (MTerm × Nat × Nat)) (o : Option Nat),
    m.Pairwise (fun a b => keyLt (clampKey a) (clampKey b) = true) → ∀ x ∈ crun o m,
      ∃ q ∈ m, x.1 = q.1.term ∧ (∀ v, o = some v → v ≤ x.2) ∧
        (∀ q' ∈ m, keyLt (clampKey q) (clampKey q') = false → q'.1.started ≤ x.2) ∧
        (o = some x.2 ∨ ∃ q' ∈ m, keyLt (clampKey q) (clampKey q') = false ∧ q'.1.started = x.2)
  | [], _, _, x, hx => by simp [crun] at hx
  | q :: qs, o, h, x, hx => by
    rw [List.pairwise_cons] at h
    have hfl : (∀ v, o = some v → v ≤ clampFloor o q.1.started) ∧ q.1.started ≤ clampFloor o q.1.started ∧
        (o = some (clampFloor o q.1.started) ∨ q.1.started = clampFloor o q.1.started) := by
      cases o with
      | none => simp [clampFloor]
      | some f =>
        simp only [clampFloor, Option.some.injEq, forall_eq']
        refine ⟨Nat.le_max_left _ _, Nat.le_max_right _ _, ?_⟩
        rcases Nat.le_total f q.1.started with hl | hl
        · right; rw [Nat.max_eq_right hl]
        · left; rw [Nat.max_eq_left hl]
    simp only [crun, List.mem_cons] at hx
    rcases hx with rfl | hx
    · refine ⟨q, List.mem_cons_self, rfl, hfl.1, fun q' hq' hk => ?_, ?_⟩
      · rcases List.mem_cons.1 hq' with rfl | hq'
        · exact hfl.2.1
        · rw [h.1 q' hq'] at hk; exact absurd hk (by simp)
      · rcases hfl.2.2 with h1 | h1
        · exact Or.inl h1
        · exact Or.inr ⟨q, List.mem_cons_self, keyLt_st.irrefl _, h1⟩
    · obtain ⟨q1, hq1, h1, h2, h3, h4⟩ := crun_spec qs _ h.2 x hx
      have hfx := h2 _ rfl
      refine ⟨q1, List.mem_cons_of_mem _ hq1, h1, fun v hv => Nat.le_trans (hfl.1 v hv) hfx, fun q' hq' hk => ?_, ?_⟩
      · rcases List.mem_cons.1 hq' with rfl | hq'
        · exact Nat.le_trans hfl.2.1 hfx
        · exact h3 q' hq' hk
      · have hk : keyLt (clampKey q1) (clampKey q) = false := keyLt_st.asymm _ _ (h.1 q1 hq1)
        rcases h4 with h4 | ⟨q', hq', hk', he⟩
        · have h4 := Option.some.inj h4
          rcases hfl.2.2 with h5 | h5
          · exact Or.inl (h5.trans (congrArg some h4))
          · exact Or.inr ⟨q, List.mem_cons_self, hk, h5.trans h4⟩
        · exact Or.inr ⟨q', List.mem_cons_of_mem _ hq', hk', he⟩

theorem crun_mem : ∀ (m : List (MTerm × Nat × Nat)) (o : Option Nat) (q : MTerm × Nat × Nat), q ∈ m →
    ∃ v, (q.1.term, v) ∈ crun o m
  | [], _, _, hq => by simp at hq
  | q0 :: qs, o, q, hq => by
    rcases List.mem_cons.1 hq with rfl | hq
    · exact ⟨clampFloor o q.1.started, by simp only [crun]; exact List.mem_cons_self⟩
    · obtain ⟨v, hv⟩ := crun_mem qs _ q hq
      exact ⟨v, by simp only [crun]; exact List.mem_cons_of_mem _ hv⟩

theorem lookup_of_all {β : Type} (k : Nat) (w : Option β) : ∀ l : List (Nat × β), (∃ v, (k, v) ∈ l) →
    (∀ v, (k, v) ∈ l → some v = w) → lookup k l = w
  | [], ⟨_, hv⟩, _ => by simp at hv
  | (k', v') :: rest, ⟨v, hv⟩, h => by
    simp only [lookup]
    split
    · rename_i hk; subst hk; exact h v' List.mem_cons_self
    · rename_i hk
      rcases List.mem_cons.1 hv with he | hv
      · simp only [Prod.mk.injEq] at he; exact absurd he.1.symm hk
      · exact lookup_of_all k w rest ⟨v, hv⟩ fun v hv => h v (List.mem_cons_of_mem _ hv)

/-- The terms at or before `p` in its device's file order. -/
def clampSet (placed : List (MTerm × Nat × Nat)) (p : MTerm × Nat × Nat) : List Nat :=
  (placed.filter fun q => decide (q.2.1 = p.2.1) && !keyLt (clampKey p) (clampKey q)).map (·.1.started)

/-- **T7** (the clamp in closed form): a term's clamped start is the latest start among its device's terms at or
before it in that device's file order. -/
theorem clamp_lookup (placed : List (MTerm × Nat × Nat)) (hn : (placed.map (·.1.term)).Nodup)
    (p : MTerm × Nat × Nat) (hp : p ∈ placed) :
    lookup p.1.term (clampStarts placed) = (clampSet placed p).max? := by
  rw [clampStarts_eq]
  have hsorted : ∀ d, (keySort clampKey (placed.filter fun p => decide (p.2.1 = d))).Pairwise
      (fun a b => keyLt (clampKey a) (clampKey b) = true) := by
    intro d
    apply sorted_strict keyLt_st
    · exact keySort_sorted _ _
    · have hn' : ((keySort clampKey (placed.filter fun p => decide (p.2.1 = d))).map (·.1.term)).Nodup :=
        (((keySort_perm _ _).map _).nodup_iff).2 ((List.filter_sublist.map _).nodup hn)
      rw [List.Nodup, List.pairwise_map] at hn' ⊢
      exact hn'.imp fun h he => h (termId_inj (by simp only [clampKey, List.cons.injEq] at he; exact he.2.1))
  apply lookup_of_all
  · have hd : p.2.1 ∈ clampDevices placed := (clampDevices_mem placed _).2 ⟨p, hp, rfl⟩
    obtain ⟨v, hv⟩ := crun_mem (keySort clampKey (placed.filter fun q => decide (q.2.1 = p.2.1))) none p
      ((keySort_perm _ _).mem_iff.2 (List.mem_filter.2 ⟨hp, by simp⟩))
    exact ⟨v, List.mem_flatMap.2 ⟨_, hd, hv⟩⟩
  · intro v hv
    obtain ⟨d, _, hv⟩ := List.mem_flatMap.1 hv
    obtain ⟨q, hq, h1, _, h3, h4⟩ := crun_spec _ none (hsorted d) _ hv
    have hq' := List.mem_filter.1 ((keySort_perm _ _).mem_iff.1 hq)
    have hqp : q = p := inj_of_nodup_map hn hq'.1 hp h1.symm
    subst hqp
    have hdq : d = q.2.1 := (by simpa using hq'.2 : q.2.1 = d).symm
    subst hdq
    symm
    rw [List.max?_eq_some_iff]
    refine ⟨?_, fun b hb => ?_⟩
    · rcases h4 with h4 | ⟨q', hq'', hk, he⟩
      · simp at h4
      · have := List.mem_filter.1 ((keySort_perm _ _).mem_iff.1 hq'')
        exact List.mem_map.2 ⟨q', List.mem_filter.2 ⟨this.1, by simpa [hk] using this.2⟩, he⟩
    · obtain ⟨q', hq'', rfl⟩ := List.mem_map.1 hb
      have := List.mem_filter.1 hq''
      simp only [Bool.and_eq_true, decide_eq_true_eq, Bool.not_eq_true'] at this
      exact h3 q' ((keySort_perm _ _).mem_iff.2 (List.mem_filter.2 ⟨this.1, by simp [this.2.1]⟩)) this.2.2

/-! ### T7: the merged view is invariant under segment order and duplication -/

theorem SameSegs.symm {segs segs' : List (Nat × List Row)} (h : SameSegs segs segs') : SameSegs segs' segs :=
  fun s => (h s).symm

/-- What the merge emits for one key: its sequence, the kept content, and the conflicts. -/
def keyObs (p : MTerm × Nat × Nat) (sc : Nat × List Copy) : Nat × Row × List (Key × Nat × Nat) :=
  (sc.1, (mergeKey p sc).1.fp, (mergeKey p sc).2)

/-- What the merge emits for one term: its final-order key, and its keys in sequence order. -/
def termObs (cl : List (Nat × Nat)) (p : MTerm × Nat × Nat) :
    List (List Nat) × List (Nat × Row × List (Key × Nat × Nat)) :=
  (placedKey cl p, (keySort (fun sc => [[sc.1]]) p.1.copies).map (keyObs p))

theorem placed_nodup (segs : List (Nat × List Row)) :
    (((mergedTerms segs).map place).map (·.1.term)).Nodup := by
  rw [List.map_map]
  exact (mergedTerms_spec segs).1.1

theorem keyObs_eq {segs segs' : List (Nat × List Row)} (hS : SameSegs segs segs') (t t' : MTerm)
    (ht : t ∈ mergedTerms segs) (ht' : t' ∈ mergedTerms segs') (he : t.term = t'.term)
    (sc sc' : Nat × List Copy) (hs : sc'.1 = sc.1) (hm : ∀ c, c ∈ sc.2 ↔ c ∈ sc'.2) :
    keyObs (place t) sc = keyObs (place t') sc' := by
  have hd : deviceOf t = deviceOf t' := congrArg Prod.fst (place_data hS t t' ht ht' he)
  obtain ⟨k1, k2⟩ := keptCopy_det (deviceOf t) sc.2 sc'.2 hm
  have hdr := dropped_det (keptCopy (deviceOf t) sc.2) (keptCopy (deviceOf t) sc'.2) sc.2 sc'.2 hm k1
  simp only [keyObs, mergeKey, keep, place]
  rw [hdr, k1, k2, hd, he, hs]

theorem keys_obs_eq {segs segs' : List (Nat × List Row)} (hS : SameSegs segs segs') (t t' : MTerm)
    (ht : t ∈ mergedTerms segs) (ht' : t' ∈ mergedTerms segs') (he : t.term = t'.term) :
    (keySort (fun sc => [[sc.1]]) t.copies).map (keyObs (place t)) =
      (keySort (fun sc => [[sc.1]]) t'.copies).map (keyObs (place t')) := by
  have hw := (mergedTerms_spec segs).1.2 t ht
  have hw' := (mergedTerms_spec segs').1.2 t' ht'
  have sorted : ∀ u : MTerm, u.WF → ((keySort (fun sc => [[sc.1]]) u.copies).map (keyObs (place u))).Pairwise
      (fun x y => keyLt [[x.1]] [[y.1]] = true) := by
    intro u hu
    rw [List.pairwise_map]
    apply sorted_strict keyLt_st (fun sc : Nat × List Copy => [[sc.1]]) _ (keySort_sorted _ _)
    have : ((keySort (fun sc : Nat × List Copy => [[sc.1]]) u.copies).map Prod.fst).Nodup :=
      (((keySort_perm _ _).map _).nodup_iff).2 hu.1
    rw [List.Nodup, List.pairwise_map] at this ⊢
    exact this.imp fun h he => h (by simpa using he)
  apply eq_of_sorted (fun a => by rw [keyLt_st.irrefl]; simp)
    (fun a b h1 h2 => by rw [keyLt_st.asymm _ _ h1] at h2; exact absurd h2 (by simp)) _ _ (sorted t hw) (sorted t' hw')
  intro x
  simp only [List.mem_map]
  constructor
  · rintro ⟨sc, hsc, rfl⟩
    obtain ⟨sc', hsc', hs, hm⟩ := key_data hS t t' ht ht' he sc ((keySort_perm _ _).mem_iff.1 hsc)
    exact ⟨sc', (keySort_perm _ _).mem_iff.2 hsc', (keyObs_eq hS t t' ht ht' he sc sc' hs hm).symm⟩
  · rintro ⟨sc', hsc', rfl⟩
    obtain ⟨sc, hsc, hs, hm⟩ := key_data hS.symm t' t ht' ht he.symm sc' ((keySort_perm _ _).mem_iff.1 hsc')
    exact ⟨sc, (keySort_perm _ _).mem_iff.2 hsc, keyObs_eq hS t t' ht ht' he sc sc' hs.symm fun c => (hm c).symm⟩

theorem clampSet_congr {segs segs' : List (Nat × List Row)} (hS : SameSegs segs segs') (t t' : MTerm)
    (ht : t ∈ mergedTerms segs) (ht' : t' ∈ mergedTerms segs') (he : t.term = t'.term) (y : Nat) :
    y ∈ clampSet ((mergedTerms segs).map place) (place t) → y ∈ clampSet ((mergedTerms segs').map place) (place t') := by
  have hp := place_data hS t t' ht ht' he
  unfold clampSet
  simp only [List.mem_map, List.mem_filter, Bool.and_eq_true, decide_eq_true_eq, Bool.not_eq_true']
  rintro ⟨q, ⟨⟨u, hu, rfl⟩, hq1, hq2⟩, rfl⟩
  obtain ⟨u', hu', hue⟩ := match_term hS u hu
  have hpu := place_data hS u u' hu hu' hue.symm
  have hst := (term_data hS u u' hu hu' hue.symm).2.1
  refine ⟨place u', ⟨⟨u', hu', rfl⟩, ?_, ?_⟩, ?_⟩
  · rw [← hpu, ← hp]; exact hq1
  · have e1 : clampKey (place u') = clampKey (place u) := by
      unfold clampKey; rw [← hpu]; simp only [place]; rw [hue]
    have e2 : clampKey (place t') = clampKey (place t) := by
      unfold clampKey; rw [← hp]; simp only [place]; rw [he]
    rw [e1, e2]; exact hq2
  · simp only [place]; exact hst.symm

theorem termObs_eq {segs segs' : List (Nat × List Row)} (hS : SameSegs segs segs') (t t' : MTerm)
    (ht : t ∈ mergedTerms segs) (ht' : t' ∈ mergedTerms segs') (he : t.term = t'.term) :
    termObs (clampStarts ((mergedTerms segs).map place)) (place t) =
      termObs (clampStarts ((mergedTerms segs').map place)) (place t') := by
  have hp := place_data hS t t' ht ht' he
  have hc : lookup t.term (clampStarts ((mergedTerms segs).map place)) =
      lookup t'.term (clampStarts ((mergedTerms segs').map place)) := by
    have h1 := clamp_lookup _ (placed_nodup segs) (place t) (List.mem_map_of_mem ht)
    have h2 := clamp_lookup _ (placed_nodup segs') (place t') (List.mem_map_of_mem ht')
    simp only [place] at h1 h2
    rw [h1, h2]
    exact maxOpt_congr fun y => ⟨clampSet_congr hS t t' ht ht' he y, clampSet_congr hS.symm t' t ht' ht he.symm y⟩
  unfold termObs
  rw [show (place t).1 = t from rfl, show (place t').1 = t' from rfl, keys_obs_eq hS t t' ht ht' he]
  simp only [placedKey, place] at hp ⊢
  simp only [Prod.mk.injEq] at hp
  rw [hc, hp.2, hp.1, he]

/-- The merge's output through the per-term observations. -/
theorem mergeFull_obs (segs : List (Nat × List Row)) :
    let placed := (mergedTerms segs).map place
    let obs := (keySort (placedKey (clampStarts placed)) placed).map (termObs (clampStarts placed))
    (merge segs).map Row.fp = obs.flatMap (fun o => o.2.map fun k => k.2.1) ∧
      (mergeFull segs).2 = obs.flatMap (fun o => o.2.flatMap fun k => k.2.2) := by
  dsimp only
  refine ⟨?_, ?_⟩
  · unfold merge
    rw [mergeFull_eq]
    unfold mergeKeys
    simp [List.map_flatMap, List.flatMap_map, termObs, keyObs, Function.comp_def]
  · rw [mergeFull_eq]
    unfold mergeKeys
    simp [List.flatMap_assoc, List.flatMap_map, termObs, keyObs]

theorem obs_eq {segs segs' : List (Nat × List Row)} (hS : SameSegs segs segs') :
    let placed := (mergedTerms segs).map place
    let placed' := (mergedTerms segs').map place
    (keySort (placedKey (clampStarts placed)) placed).map (termObs (clampStarts placed)) =
      (keySort (placedKey (clampStarts placed')) placed').map (termObs (clampStarts placed')) := by
  dsimp only
  have sorted : ∀ sg : List (Nat × List Row), ((keySort (placedKey (clampStarts ((mergedTerms sg).map place)))
      ((mergedTerms sg).map place)).map (termObs (clampStarts ((mergedTerms sg).map place)))).Pairwise
      (fun x y => keyLt x.1 y.1 = true) := by
    intro sg
    rw [List.pairwise_map]
    apply sorted_strict keyLt_st _ _ (keySort_sorted _ _)
    have := (((keySort_perm (placedKey (clampStarts ((mergedTerms sg).map place)))
      ((mergedTerms sg).map place)).map (·.1.term)).nodup_iff).2 (placed_nodup sg)
    rw [List.Nodup, List.pairwise_map] at this ⊢
    exact this.imp fun h he => h (termId_inj (by simp only [termObs, placedKey, List.cons.injEq] at he; exact he.2.2.2.1))
  apply eq_of_sorted (fun a => by rw [keyLt_st.irrefl]; simp)
    (fun a b h1 h2 => by rw [keyLt_st.asymm _ _ h1] at h2; exact absurd h2 (by simp)) _ _ (sorted segs) (sorted segs')
  intro x
  simp only [List.mem_map, (keySort_perm _ _).mem_iff]
  constructor
  · rintro ⟨_, ⟨t, ht, rfl⟩, rfl⟩
    obtain ⟨t', ht', he⟩ := match_term hS t ht
    exact ⟨place t', ⟨t', ht', rfl⟩, (termObs_eq hS t t' ht ht' he.symm).symm⟩
  · rintro ⟨_, ⟨t', ht', rfl⟩, rfl⟩
    obtain ⟨t, ht, he⟩ := match_term hS.symm t' ht'
    exact ⟨place t, ⟨t, ht, rfl⟩, termObs_eq hS t t' ht ht' he⟩

/-- **T7** (segment-set invariance): merging the same segments — in any order, any of them repeated — yields the
same rows (up to canonical form) in the same order, and the same conflict reports in the same order. -/
theorem t7_same_segments (segs segs' : List (Nat × List Row)) (hS : ∀ s, s ∈ segs ↔ s ∈ segs') :
    (merge segs).map Row.fp = (merge segs').map Row.fp ∧ (mergeFull segs).2 = (mergeFull segs').2 := by
  obtain ⟨a1, a2⟩ := mergeFull_obs segs
  obtain ⟨b1, b2⟩ := mergeFull_obs segs'
  have := obs_eq (segs := segs) (segs' := segs') hS
  dsimp only at a1 a2 b1 b2 this
  rw [a1, a2, b1, b2, this]
  exact ⟨rfl, rfl⟩

/-- **T7** (segment order): the merged view does not depend on the order the segments are read in. -/
theorem t7_segment_order (segs segs' : List (Nat × List Row)) (h : segs.Perm segs') :
    (merge segs).map Row.fp = (merge segs').map Row.fp ∧ (mergeFull segs).2 = (mergeFull segs').2 :=
  t7_same_segments segs segs' fun _ => h.mem_iff

/-- **T7** (duplicated segment): reading a segment twice changes nothing. -/
theorem t7_duplicate_segment (l1 l2 : List (Nat × List Row)) (s : Nat × List Row) (hs : s ∈ l1 ++ l2) :
    (merge (l1 ++ s :: l2)).map Row.fp = (merge (l1 ++ l2)).map Row.fp ∧
      (mergeFull (l1 ++ s :: l2)).2 = (mergeFull (l1 ++ l2)).2 :=
  t7_same_segments _ _ fun x => by
    simp only [List.mem_append, List.mem_cons]
    constructor
    · rintro (h | rfl | h)
      · exact Or.inl h
      · exact List.mem_append.1 hs
      · exact Or.inr h
    · rintro (h | h)
      · exact Or.inl h
      · exact Or.inr (Or.inr h)

/-! ### T7: each device's file order is kept (the per-device clamp) -/

/-- **T7** (file order): a merged term's order is its first place among the terms its device's segments introduce. -/
theorem t7_file_order (segs : List (Nat × List Row)) (t : MTerm) (ht : t ∈ mergedTerms segs) :
    (place t).2.2 ∈ ordsOf segs (deviceOf t) t.term ∧ ∀ o ∈ ordsOf segs (deviceOf t) t.term, (place t).2.2 ≤ o := by
  obtain ⟨c1, c2, _⟩ := mergedTerms_char segs
  obtain ⟨s, hs, r, hr, hrt⟩ := (c1 t.term).1 ⟨t, ht, rfl⟩
  have hsome : (lookup s.1 t.orders).isSome := by
    rw [c2 t ht]
    cases h : (ordsOf segs s.1 t.term).min? with
    | some _ => rfl
    | none =>
      rw [List.min?_eq_none_iff] at h
      have : (introduced s.2).idxOf t.term ∈ ordsOf segs s.1 t.term :=
        List.mem_filterMap.2 ⟨s, hs, by rw [ite_eq_left ⟨rfl, (mem_introduced _ _).2 ⟨r, hr, hrt⟩⟩]⟩
      rw [h] at this; simp at this
  have hdev : (lookup (deviceOf t) t.orders).isSome := by
    rw [lookup_isSome, deviceOf_eq]
    have hne : t.orders.map Prod.fst ≠ [] := by
      intro h; rw [lookup_isSome, h] at hsome; simp at hsome
    cases hk : keySort (fun d => [digits d]) (t.orders.map Prod.fst) with
    | nil =>
      have := keySort_perm (fun d => [digits d]) (t.orders.map Prod.fst)
      rw [hk] at this; exact absurd (List.Perm.nil_eq this).symm hne
    | cons d _ => exact (keySort_head_min _ _ d _ hk).1
  rw [c2 t ht] at hdev
  obtain ⟨m, hm⟩ := Option.isSome_iff_exists.1 hdev
  have hpl : (place t).2.2 = m := by simp only [place]; rw [c2 t ht, hm]; rfl
  rw [hpl]
  exact List.min?_eq_some_iff.1 hm

theorem placed_sorted (segs : List (Nat × List Row)) :
    let placed := (mergedTerms segs).map place
    (keySort (placedKey (clampStarts placed)) placed).Pairwise
      (fun a b => keyLt (placedKey (clampStarts placed) a) (placedKey (clampStarts placed) b) = true) := by
  dsimp only
  apply sorted_strict keyLt_st _ _ (keySort_sorted _ _)
  have := (((keySort_perm (placedKey (clampStarts ((mergedTerms segs).map place)))
    ((mergedTerms segs).map place)).map (·.1.term)).nodup_iff).2 (placed_nodup segs)
  rw [List.Nodup, List.pairwise_map] at this ⊢
  exact this.imp fun h he => h (termId_inj (by simp only [placedKey, List.cons.injEq] at he; exact he.2.2.2.1))

/-- **T7** (the per-device clamp keeps file order): of two terms on one device, the one earlier in that device's
file has every merged row before every merged row of the later one. -/
theorem t7_device_file_order (segs : List (Nat × List Row)) (t1 t2 : MTerm) (h1 : t1 ∈ mergedTerms segs)
    (h2 : t2 ∈ mergedTerms segs) (hd : deviceOf t1 = deviceOf t2) (ho : (place t1).2.2 < (place t2).2.2) :
    ∃ A B, merge segs = A ++ B ∧ (∀ r ∈ A, r.term ≠ t2.term) ∧ (∀ r ∈ B, r.term ≠ t1.term) := by
  have hw := (mergedTerms_spec segs).1
  have hn := placed_nodup segs
  have hsort := placed_sorted segs
  dsimp only at hsort
  generalize hpl : (mergedTerms segs).map place = placed at hn hsort
  have hp1 : place t1 ∈ placed := hpl ▸ List.mem_map_of_mem h1
  have hp2 : place t2 ∈ placed := hpl ▸ List.mem_map_of_mem h2
  -- The clamp orders them.
  have hck : keyLt (clampKey (place t1)) (clampKey (place t2)) = true := by
    simp [clampKey, keyLt, lexBy, lexLt, ho]
  have hsub : ∀ y ∈ clampSet placed (place t1), y ∈ clampSet placed (place t2) := by
    intro y hy
    unfold clampSet at hy ⊢
    obtain ⟨q, hq, rfl⟩ := List.mem_map.1 hy
    simp only [List.mem_filter, Bool.and_eq_true, decide_eq_true_eq, Bool.not_eq_true'] at hq
    refine List.mem_map.2 ⟨q, List.mem_filter.2 ⟨hq.1, ?_⟩, rfl⟩
    simp only [Bool.and_eq_true, decide_eq_true_eq, Bool.not_eq_true']
    refine ⟨by rw [hq.2.1]; simp [place, hd], ?_⟩
    cases h : keyLt (clampKey (place t2)) (clampKey q)
    · rfl
    · rw [keyLt_st.trans _ _ _ hck h] at hq; exact absurd hq.2.2 (by simp)
  have hself : ∀ p ∈ placed, p.1.started ∈ clampSet placed p := fun p hp =>
    List.mem_map.2 ⟨p, List.mem_filter.2 ⟨hp, by simp [keyLt_st.irrefl]⟩, rfl⟩
  have hcl : (lookup (place t1).1.term (clampStarts placed)).getD 0 ≤
      (lookup (place t2).1.term (clampStarts placed)).getD 0 := by
    rw [clamp_lookup placed hn _ hp1, clamp_lookup placed hn _ hp2]
    have ne : ∀ p ∈ placed, (clampSet placed p).max? ≠ none := fun p hp h => by
      rw [List.max?_eq_none_iff] at h; have := hself p hp; rw [h] at this; simp at this
    obtain ⟨m1, hm1⟩ := Option.ne_none_iff_exists'.1 (ne _ hp1)
    obtain ⟨m2, hm2⟩ := Option.ne_none_iff_exists'.1 (ne _ hp2)
    rw [hm1, hm2]
    rw [List.max?_eq_some_iff] at hm1 hm2
    exact hm2.2 m1 (hsub m1 hm1.1)
  have hκ : keyLt (placedKey (clampStarts placed) (place t1)) (placedKey (clampStarts placed) (place t2)) = true := by
    have hd' : (place t1).2.1 = (place t2).2.1 := by simp [place, hd]
    unfold placedKey
    rw [hd']
    rcases Nat.lt_or_eq_of_le hcl with hlt | heq
    · simp [keyLt, lexBy, lexLt, hlt]
    · rw [heq]; simp [keyLt, lexBy, lexLt, ho]
  -- Split the final order at the earlier term.
  generalize hS : keySort (placedKey (clampStarts placed)) placed = S at hsort
  have hSn : (S.map (·.1.term)).Nodup := by
    rw [← hS]; exact (((keySort_perm _ _).map _).nodup_iff).2 hn
  obtain ⟨l1, l2, hsplit⟩ := List.append_of_mem ((hS ▸ keySort_perm _ placed).mem_iff.2 hp1)
  have hq2 : place t2 ∈ l2 := by
    have := (hS ▸ keySort_perm _ placed).mem_iff.2 hp2
    rw [hsplit] at this hsort
    rcases List.mem_append.1 this with h | h
    · have := (List.pairwise_append.1 hsort).2.2 _ h _ List.mem_cons_self
      rw [keyLt_st.asymm _ _ hκ] at this; exact absurd this (by simp)
    · rcases List.mem_cons.1 h with h | h
      · rw [h, keyLt_st.irrefl] at hκ; exact absurd hκ (by simp)
      · exact h
  rw [hsplit] at hSn
  simp only [List.map_append, List.map_cons, List.nodup_append, List.nodup_cons, List.mem_map] at hSn
  -- Every row of a placed term's block is of that term.
  have hblock : ∀ q ∈ placed, ∀ r ∈ ((keySort (fun sc => [[sc.1]]) q.1.copies).map (mergeKey q)).map Prod.fst,
      r.term = q.1.term := by
    intro q hq r hr
    rw [← hpl] at hq
    obtain ⟨u, hu, rfl⟩ := List.mem_map.1 hq
    obtain ⟨_, ⟨sc, hsc, rfl⟩, rfl⟩ := by simpa only [List.mem_map] using hr
    have := (mergeKey_key u (hw.2 u hu) sc ((keySort_perm _ _).mem_iff.1 hsc)).1
    simp only [Row.key, Prod.mk.injEq] at this
    exact this.1
  have hmemS : ∀ q ∈ S, q ∈ placed := fun q hq => (hS ▸ keySort_perm _ placed).mem_iff.1 hq
  refine ⟨((l1 ++ [place t1]).flatMap fun p => (keySort (fun sc => [[sc.1]]) p.1.copies).map (mergeKey p)).map
    Prod.fst, (l2.flatMap fun p => (keySort (fun sc => [[sc.1]]) p.1.copies).map (mergeKey p)).map Prod.fst, ?_, ?_, ?_⟩
  · unfold merge
    rw [mergeFull_eq]
    unfold mergeKeys
    rw [hpl, hS, hsplit]
    simp
  · intro r hr hrt
    simp only [List.map_flatMap, List.mem_flatMap] at hr
    obtain ⟨q, hq, hr⟩ := hr
    have hqt := hblock q (hmemS q (by rw [hsplit]; simp at hq ⊢; rcases hq with h | h <;> simp [h])) r hr
    rcases List.mem_append.1 hq with hq | hq
    · exact hSn.2.2 _ ⟨q, hq, rfl⟩ _ (List.mem_cons_of_mem _ (List.mem_map_of_mem hq2)) (hqt.symm.trans hrt)
    · rw [List.mem_singleton.1 hq] at hqt
      exact hSn.2.1.1 ⟨_, hq2, hrt.symm.trans hqt⟩
  · intro r hr hrt
    simp only [List.map_flatMap, List.mem_flatMap] at hr
    obtain ⟨q, hq, hr⟩ := hr
    have hqt := hblock q (hmemS q (by rw [hsplit]; simp [hq])) r hr
    exact hSn.2.1.1 ⟨q, hq, by rw [← hqt, hrt]; rfl⟩

/-! ## S5's "Today" witnesses, rerun on the fixed code

Each S5 counterexample trace, evaluated by the kernel on the W3 model: the defect it showed is gone. The D5
witnesses are instances; the general laws are `t7_segment_order`, `t7_duplicate_segment` and
`t7_device_file_order`. -/

/-- A row of run 1 in term 0 (epoch 1). -/
def r1 (seq : Nat) (k : Kind) (arg : Nat) : Row :=
  { term := 0, seq, run := 1, kind := k, arg, ms := 0, epoch := 1, attempt := 0 }

theorem t8_duplicate_interrupt_resolution :
    let L := fold {} [r1 0 .L 0, r1 1 .O 1, r1 2 .R 1]
    gateCode L (r1 3 .R 1) false = .interruptAlreadyResolved := by
  decide

/-- S5 D2 (`t4_reopen_broader_than_legality`), fixed: after `admitted, running, S, running` the second `running`
does not reopen the settled attempt, and a second, different settlement is refused. -/
theorem t4_d2_second_running_keeps_attempt :
    let L := fold {} [r1 0 .L 0, r1 1 .L 1, r1 2 .S 5, r1 3 .L 1]
    (L.entry 1).attempt = 1 ∧ (L.entry 1).append = .settled ∧
      gateCode L (stamp L 99 1 .S 6 0) false = .settlementConflict := by
  decide

/-- S5 D3 (`t3_bypass_settlement_discarded`), fixed: the host refuses a settlement before admission, and a
settlement the log holds before its run's admission survives `admitted, running, completed`. -/
theorem t3_d3_settlement_survives :
    let L := fold {} [r1 0 .S 5, r1 1 .L 0, r1 2 .L 1, r1 3 .L 3]
    (L.entry 1).settlements.map (·.body) = [5] ∧ (L.entry 1).append = .settled ∧
      gateCode ({} : Ledger) (stamp {} 99 1 .S 5 0) false = .settlementWithoutRun := by
  decide

/-- S5 D7 (`t6_redelivery_breaks`), fixed: redelivering the earlier `running` row after the run settled and
ended leaves it settled. -/
theorem t6_d7_redelivery_keeps_settled :
    let L := fold {} [r1 0 .L 0, r1 1 .L 1, r1 2 .S 5, r1 3 .L 3]
    (L.entry 1).append = .settled ∧ ((fold L [r1 1 .L 1]).entry 1).append = .settled := by
  decide

def ReadFold.isClamp : ReadFold → Bool
  | .reset .clamped => true
  | _ => false

/-- S5 D6 (`t5_ts_readers_blind`), fixed: the reader at cursor 3 of a one-row log handed a version-1 clamp resets. -/
theorem t5_d6_clamp_resets :
    (foldRead { cursor := 3 } (v1Read [r1 0 .L 0] 3 16)).isClamp = true := by
  decide

/-- A merge-corpus row: term `t` (epoch `t + 1`), sequence `q`, recorded at `ms`, interrupt `i<a>`. -/
def mr (t q ms : Nat) (a : Nat := 0) : Row :=
  { term := t, seq := q, run := 1, kind := .O, arg := a, ms, epoch := t + 1, attempt := 0 }

/-- S5 D5 (`t7_segment_order_matters`), fixed: a term held in two segments merges the same whichever segment is
listed first. -/
theorem t7_d5_segment_order :
    merge [(0, [mr 1 0 10]), (1, [mr 2 0 10, mr 1 0 10])] = merge [(1, [mr 2 0 10, mr 1 0 10]), (0, [mr 1 0 10])] ∧
      (merge [(0, [mr 1 0 10]), (1, [mr 2 0 10, mr 1 0 10])]).map Row.key = [(1, 0), (2, 0)] := by
  decide

/-- S5 D5 (`t7_duplicate_segment_breaks_file_order`), fixed: a segment read twice merges as once, and the device's
backwards clock step does not reorder its own terms. -/
theorem t7_d5_duplicate_segment :
    merge [(0, [mr 1 0 100, mr 2 0 50])] = merge [(0, [mr 1 0 100, mr 2 0 50]), (0, [mr 1 0 100, mr 2 0 50])] ∧
      (merge [(0, [mr 1 0 100, mr 2 0 50])]).map Row.key = [(1, 0), (2, 0)] := by
  decide

/-- S5 D5 (`t7_conflicting_copy_first_wins`), fixed: two segments that disagree on one key keep the term device's
copy whichever is listed first, and the conflict is reported `(key, kept device, dropped device)`. -/
theorem t7_d5_conflict_kept_and_reported :
    mergeFull [(0, [mr 1 0 10 0]), (1, [mr 1 0 10 7])] = ([mr 1 0 10 0], [((1, 0), 0, 1)]) ∧
      mergeFull [(1, [mr 1 0 10 7]), (0, [mr 1 0 10 0])] = ([mr 1 0 10 0], [((1, 0), 0, 1)]) := by
  decide

/-- **T7 limit** (kept from S5's `t7_merge_not_prefix_stable`; still true, by design): a merged view is not
append-only. A segment that arrives later can order rows before rows already read, so a reader of a merged view
refolds it rather than holding a cursor into it. -/
theorem t7_merge_not_prefix_stable :
    (merge [(0, [mr 1 0 100])]).map Row.key = [(1, 0)] ∧
      (merge [(0, [mr 1 0 100]), (1, [mr 2 0 50])]).map Row.key = [(2, 0), (1, 0)] := by
  decide

end ChatLedger
