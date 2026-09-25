import ChatLedger

/-!
ChatLedger proofs. Each theorem names the law it settles (T1–T7) and is stated over `ChatLedger`.
Counterexamples are closed by `decide` (kernel evaluation of the executable model).
-/
namespace ChatLedger

/-! ## T1, T2: the appender (event-sequence.ts) -/

/-- The appender state is a function of its rows. -/
structure Inv (L : Log) : Prop where
  keyed : ∀ x ∈ L.rows, L.rows.find? (sameKey x) = some x
  active : L.active = L.rows.head?.map (·.epoch)
  last : L.last = L.rows.head?.map (·.seq)
  closed : ∀ x ∈ L.rows, L.active ≠ some x.epoch → x.epoch ∈ L.closed
  contig : Contig L.rows
  nodup : (L.rows.map Event.key).Nodup

theorem inv_init : Inv ({} : Log) := by
  constructor <;> simp [Contig]

theorem sameKey_self (e : Event) : sameKey e e = true := by simp [sameKey]

theorem check_ok_false {L : Log} {e : Event} (h : check L e = .ok false) :
    L.rows.find? (sameKey e) = none ∧
    (L.active = some e.epoch → ∀ l, L.last = some l → e.seq = l + 1) ∧
    (L.active ≠ some e.epoch → ¬ (L.active.isSome = true ∧ e.epoch ∈ L.closed)) := by
  unfold check at h
  split at h
  · split at h <;> simp at h
  · rename_i hf
    refine ⟨hf, ?_, ?_⟩
    · intro ha l hl
      simp only [ha, ite_true, hl] at h
      split at h
      · assumption
      · simp at h
    · intro ha hc
      simp only [ha, ite_false] at h
      simp [hc] at h

theorem inv_commit {L : Log} {e : Event} (h : Inv L) (hc : check L e = .ok false) :
    Inv (commit L e) := by
  obtain ⟨hnone, hseq, hclosed⟩ := check_ok_false hc
  have hnot : ∀ x ∈ L.rows, sameKey e x = false := by
    intro x hx
    have := List.find?_eq_none.mp hnone x hx
    simpa using this
  constructor
  · -- keyed
    intro x hx
    simp only [commit, List.mem_cons] at hx ⊢
    rcases hx with rfl | hx
    · simp [sameKey_self]
    · have hk := h.keyed x hx
      have hne : sameKey x e = false := by
        have := hnot x hx
        simp [sameKey] at this ⊢
        intro h1 h2
        exact this h1.symm h2.symm
      simp [hne, hk]
  · simp [commit]
  · simp [commit]
  · -- closed
    intro x hx hne
    simp only [commit, List.mem_cons] at hx hne ⊢
    rcases hx with rfl | hx
    · simp at hne
    · by_cases ha : L.active = some e.epoch
      · simp only [ha, ite_true]
        apply h.closed x hx
        rw [ha]
        intro heq
        apply hne
        simp at heq
        simp [heq]
      · simp only [ha, ite_false]
        cases hact : L.active with
        | none =>
          have := h.active
          rw [hact] at this
          cases hrows : L.rows with
          | nil => simp [hrows] at hx
          | cons y ys => simp [hrows] at this
        | some a =>
          simp only [List.mem_cons]
          by_cases hxa : x.epoch = a
          · exact Or.inl hxa
          · right
            apply h.closed x hx
            rw [hact]
            intro heq
            apply hxa
            simp at heq
            exact heq.symm
  · -- contig
    have hc0 := h.contig
    simp only [commit]
    cases hrows : L.rows with
    | nil => simp [Contig]
    | cons x rest =>
      rw [hrows] at hc0
      have hact : L.active = some x.epoch := by rw [h.active, hrows]; rfl
      have hlast : L.last = some x.seq := by rw [h.last, hrows]; rfl
      refine ⟨hc0, ?_⟩
      by_cases heq : e.epoch = x.epoch
      · simp only [heq, ite_true]
        exact hseq (by rw [hact, heq]) x.seq hlast
      · simp only [heq, ite_false]
        intro z hz hze
        have hna : L.active ≠ some e.epoch := by
          rw [hact]; intro h'; apply heq; simp at h'; exact h'.symm
        apply hclosed hna
        refine ⟨by rw [hact]; rfl, ?_⟩
        rw [← hze]
        apply h.closed z (by rw [hrows]; exact hz)
        rw [hact, hze]
        intro h'; apply heq; simp at h'; exact h'.symm
  · -- nodup
    simp only [commit, List.map_cons, List.nodup_cons]
    refine ⟨?_, h.nodup⟩
    intro hm
    obtain ⟨x, hx, hkx⟩ := List.mem_map.mp hm
    have := hnot x hx
    simp [sameKey, Event.key] at this hkx
    exact this hkx.1 hkx.2

theorem inv_append {L L' : Log} {e : Event} {b : Bool} (h : Inv L)
    (ha : appendFenced L e = .ok (L', b)) : Inv L' := by
  unfold appendFenced at ha
  split at ha
  · simp at ha
  · simp at ha; rw [← ha.1]; exact h
  · rename_i hc
    simp at ha; rw [← ha.1]; exact inv_commit h hc

theorem reach_inv {L : Log} (h : Reach L) : Inv L := by
  induction h with
  | init => exact inv_init
  | step _ ha ih => exact inv_append ih ha

/-- **T1** (idempotency): re-appending any row the log already holds is `{appended: false}`
and leaves the appender unchanged. -/
theorem t1_reappend_noop {L : Log} (h : Reach L) {x : Event} (hx : x ∈ L.rows) :
    appendFenced L x = .ok (L, false) := by
  have hk := (reach_inv h).keyed x hx
  simp [appendFenced, check, hk]

/-- **T1'**: the same key with different content is `EVENT_MUTATED`. -/
theorem t1_mutated {L : Log} (h : Reach L) {x e : Event} (hx : x ∈ L.rows)
    (hkey : e.epoch = x.epoch ∧ e.seq = x.seq) (hne : x ≠ e) :
    appendFenced L e = .error .mutated := by
  have hk := (reach_inv h).keyed x hx
  have : sameKey e = sameKey x := by
    funext y; simp [sameKey, hkey.1, hkey.2]
  simp [appendFenced, check, this, hk, hne]

/-- **T2** (per-epoch contiguity): every reachable log is `Contig`. -/
theorem t2_contig {L : Log} (h : Reach L) : Contig L.rows := (reach_inv h).contig

/-- **T2'** (identity is the pair): two rows with one `(epoch, seq)` are the same row. -/
theorem t2_key_unique {L : Log} (h : Reach L) {x y : Event} (hx : x ∈ L.rows) (hy : y ∈ L.rows)
    (hkey : x.epoch = y.epoch ∧ x.seq = y.seq) : x = y := by
  have i := reach_inv h
  have hx' := i.keyed x hx
  have hy' := i.keyed y hy
  have : sameKey x = sameKey y := by funext z; simp [sameKey, hkey.1, hkey.2]
  rw [this, hy'] at hx'
  exact (Option.some.inj hx').symm

/-- **T2'** restated: the identity `(leaderEpoch, sequence)` never repeats in a reachable log. -/
theorem t2_keys_nodup {L : Log} (h : Reach L) : (L.rows.map Event.key).Nodup := (reach_inv h).nodup

/-- **T2''** (a closed epoch cannot reopen): once the log has moved past epoch `x.epoch`,
no append under that epoch changes the log. -/
theorem t2_closed_frozen {L L' : Log} (h : Reach L) {x e : Event} {b : Bool} (hx : x ∈ L.rows)
    (hmoved : L.active ≠ some x.epoch) (he : e.epoch = x.epoch)
    (ha : appendFenced L e = .ok (L', b)) : L' = L ∧ b = false := by
  have i := reach_inv h
  unfold appendFenced at ha
  split at ha
  · simp at ha
  · simp at ha; exact ⟨ha.1.symm, ha.2⟩
  · rename_i hc
    obtain ⟨_, _, hclosed⟩ := check_ok_false hc
    exfalso
    apply hclosed (by rw [he]; exact hmoved)
    refine ⟨?_, by rw [he]; exact i.closed x hx hmoved⟩
    rw [i.active]
    cases hr : L.rows with
    | nil => simp [hr] at hx
    | cons _ _ => rfl

/-! ## Ledger lemmas -/

@[simp] theorem entry_put_same (L : Ledger) (r : Nat) (v : Entry) : (L.put r v).entry r = v := by
  simp [Ledger.put, Ledger.entry]

@[simp] theorem entry_put_other (L : Ledger) {r r' : Nat} (v : Entry) (h : r' ≠ r) :
    (L.put r v).entry r' = L.entry r' := by
  simp [Ledger.put, Ledger.entry, h]

@[simp] theorem entry_setChat (L : Ledger) (c r : Nat) : (L.setChat c).entry r = L.entry r := rfl

theorem step_entry_other (L : Ledger) (e : Event) {r : Nat} (h : r ≠ e.run) :
    (step L e).entry r = L.entry r := by
  unfold step
  split <;> simp [h]

/-- Settlement rows of `r` newer than `r`'s newest `running` row (newest first). -/
def sinceRunning (r : Nat) : List Event → Nat
  | [] => 0
  | e :: rs =>
    if e.run = r then
      (match e.kind with
       | .life .running => 0
       | .settle _ => sinceRunning r rs + 1
       | _ => sinceRunning r rs)
    else sinceRunning r rs

/-- The ledger's settlement slot is exactly "a settlement since the last `running`". -/
theorem settle_isSome_iff (rs : List Event) (r : Nat) :
    ((ledger rs).entry r).settle.isSome = true ↔ 0 < sinceRunning r rs := by
  induction rs with
  | nil => simp [ledger, sinceRunning, Ledger.entry]
  | cons e rs ih =>
    by_cases he : e.run = r
    · subst he
      obtain ⟨ep, sq, run, kind, st⟩ := e
      cases kind with
      | life s =>
        cases s <;> simp [ledger, step, sinceRunning, ih]
      | settle c => simp [ledger, step, sinceRunning, keepFirst]; split <;> simp
      | commit c => simp [ledger, step, sinceRunning, ih]
      | other c => simp [ledger, step, sinceRunning, ih]
    · have : (ledger (e :: rs)).entry r = (ledger rs).entry r := step_entry_other _ _ (Ne.symm he)
      rw [this, ih]
      simp [sinceRunning, he]

theorem settleLegal_none {en : Entry} (h : settleLegal (appendStateOf en) = true) : en.settle = none := by
  unfold appendStateOf at h
  cases hs : en.settle with
  | none => rfl
  | some _ => simp [hs] at h; split at h <;> simp [settleLegal] at h

theorem settleLegal_of_some {en : Entry} (h : en.settle.isSome = true) :
    settleLegal (appendStateOf en) = false := by
  unfold appendStateOf
  split
  · rfl
  · simp [settleLegal]

/-! ## T3: at most one settlement per attempt -/

/-- Logs in which every settlement row passed `isHostSettlementLegal` when it was appended. -/
inductive SettleLegalLog : List Event → Prop where
  | nil : SettleLegalLog []
  | cons {rs : List Event} {e : Event} : SettleLegalLog rs →
      (∀ c, e.kind = .settle c → settleLegal (appendStateOf ((ledger rs).entry e.run)) = true) →
      SettleLegalLog (e :: rs)

/-- **T3** (fold level): if every settlement passed the legality check, no run ever holds two
settlements since its last `running` row. -/
theorem t3_at_most_one {rs : List Event} (h : SettleLegalLog rs) (r : Nat) : sinceRunning r rs ≤ 1 := by
  induction h with
  | nil => simp [sinceRunning]
  | @cons rs e _ hlegal ih =>
    by_cases he : e.run = r
    · obtain ⟨ep, sq, run, kind, st⟩ := e
      simp only at he; subst he
      cases kind with
      | life s => cases s <;> simp [sinceRunning, ih]
      | settle c =>
        have h0 := settleLegal_none (hlegal c rfl)
        have : ¬ 0 < sinceRunning run rs := by
          rw [← settle_isSome_iff]; simp [h0]
        simp [sinceRunning]; omega
      | commit c => simp [sinceRunning, ih]
      | other c => simp [sinceRunning, ih]
    · simp [sinceRunning, he, ih]

theorem sinceRunning_append_ge (r : Nat) (mid xs : List Event)
    (hmid : ∀ x ∈ mid, x.run = r → x.kind ≠ .life .running) :
    sinceRunning r xs ≤ sinceRunning r (mid ++ xs) := by
  induction mid with
  | nil => simp
  | cons m mid ih =>
    have ih' := ih (fun x hx => hmid x (List.mem_cons_of_mem _ hx))
    have hm := hmid m List.mem_cons_self
    obtain ⟨ep, sq, run, kind, st⟩ := m
    simp only [List.cons_append, sinceRunning]
    split
    · rename_i hr
      simp only at hr hm
      cases kind with
      | life s => cases s <;> simp_all
      | settle c => simp; omega
      | commit c => simpa using ih'
      | other c => simpa using ih'
    · exact ih'

theorem SettleLegalLog.suffix {newer rs : List Event} (h : SettleLegalLog (newer ++ rs)) :
    SettleLegalLog rs := by
  induction newer with
  | nil => simpa using h
  | cons e newer ih => cases h with
    | cons h' _ => exact ih h'

/-- **T3** (attempt form): in a settlement-legal log no two settlement rows of one run occur
without a `running` row of that run between them. -/
theorem t3_no_two_per_attempt {rs newer mid older : List Event} {s1 s2 : Event} {r c1 c2 : Nat}
    (h : SettleLegalLog rs) (hsplit : rs = newer ++ s1 :: (mid ++ s2 :: older))
    (h1 : s1.run = r ∧ s1.kind = .settle c1) (h2 : s2.run = r ∧ s2.kind = .settle c2)
    (hmid : ∀ x ∈ mid, x.run = r → x.kind ≠ .life .running) : False := by
  subst hsplit
  have hs := t3_at_most_one (SettleLegalLog.suffix h) r
  have hge := sinceRunning_append_ge r mid (s2 :: older) hmid
  simp [sinceRunning, h1.1, h1.2, h2.1, h2.2] at hs hge
  omega

/-- **T3** (host level): `appendRecords`' guards alone keep at most one settlement per attempt,
even through the `executing` bypass of the legality table. -/
theorem t3_host {rs : List Event} (h : HostReach rs) (r : Nat) : sinceRunning r rs ≤ 1 := by
  induction h with
  | nil => simp [sinceRunning]
  | @step rs rs' e x _ happ ih =>
    unfold hostAppend at happ
    obtain ⟨ep, sq, run, kind, st⟩ := e
    cases kind with
    | settle c =>
      simp only at happ
      split at happ
      · rename_i hset
        simp at happ; subst happ
        by_cases he : run = r
        · subst he
          have h0 : ((ledger rs).entry run).settle = none := by
            unfold hostSettle at hset
            simp only at hset
            split at hset
            · split at hset <;> simp [refusal] at hset <;> split at hset <;> simp at hset
            · assumption
          have : ¬ 0 < sinceRunning run rs := by rw [← settle_isSome_iff]; simp [h0]
          simp [sinceRunning]; omega
        · simp [sinceRunning, he, ih]
      · simp at happ; subst happ; exact ih
      · simp at happ
    | life s =>
      simp only at happ
      split at happ
      · simp at happ; subst happ
        by_cases he : run = r
        · subst he; cases s <;> simp [sinceRunning, ih]
        · simp [sinceRunning, he, ih]
      · simp at happ
    | commit c =>
      simp at happ; subst happ
      by_cases he : run = r <;> simp [sinceRunning, he, ih]
    | other c =>
      simp at happ; subst happ
      by_cases he : run = r <;> simp [sinceRunning, he, ih]

/-! ## T4: legality after a settlement -/

/-- **T4**: after a settlement row of run `r`, `isHostSettlementLegal` is false for `r` until a
`running` row of `r` arrives. -/
theorem t4_closed_until_running {s : Event} {c : Nat} (hs : s.kind = .settle c) (mid older : List Event)
    (hmid : ∀ x ∈ mid, x.run = s.run → x.kind ≠ .life .running) :
    settleLegal (appendStateOf ((ledger (mid ++ s :: older)).entry s.run)) = false := by
  apply settleLegal_of_some
  rw [settle_isSome_iff]
  have hge := sinceRunning_append_ge s.run mid (s :: older) hmid
  simp [sinceRunning, hs] at hge
  omega

/-- **T4** (converse): any `running` row of `r` makes a settlement legal again. -/
theorem t4_running_reopens (rs : List Event) (x : Event) (hx : x.kind = .life .running) :
    settleLegal (appendStateOf ((ledger (x :: rs)).entry x.run)) = true := by
  simp [ledger, step, hx, appendStateOf, hstate, settleLegal]

/-! ### Where the fold's reopen and the lifecycle table disagree -/

/-- A row builder for the concrete traces below (epoch 0, run 1). -/
def r1 (seq : Nat) (k : Kind) : Event := { epoch := 0, seq, run := 1, kind := k, stamp := 0 }

/-- **T4, strong reading, is false.** Physical log `admitted, running, S, running`: every row passes
`appendRecords`' guards, the second `running` is legal through the "still executing" clause of
`isHostLifecycleLegal` (not through its terminal-and-reopenable clause), yet the fold's reopen
clause clears `S` and a *second, different* settlement is then accepted for the same execution. -/
theorem t4_reopen_broader_than_legality :
    let a := r1 0 (.life .admitted); let b := r1 1 (.life .running)
    let s := r1 2 (.settle 5); let b2 := r1 3 (.life .running)
    hostLife [] 1 .admitted = true ∧ hostLife [a] 1 .running = true ∧
    hostSettle [b, a] 1 5 false = .append ∧
    hostLife [s, b, a] 1 .running = true ∧
    appendStateOf ((ledger [s, b, a]).entry 1) = .settled ∧
    hstate ((ledger [s, b, a]).entry 1).life ≠ .terminal ∧
    hostSettle [b2, s, b, a] 1 6 false = .append := by
  decide

/-- The `lifecycle === 'paused'` disjunct of `reopenable` can never change the answer: by the time
`isHostLifecycleLegal` reads `reopenable`, the lifecycle is already terminal. -/
theorem reopenable_paused_is_dead (next : Life) (st : AState) (life : Option Life) (r : Bool) :
    lifecycleLegal next st life (life == some .paused || r) = lifecycleLegal next st life r := by
  unfold lifecycleLegal
  split
  · rfl
  · split
    · rfl
    · split
      · rfl
      · rename_i h
        cases life with
        | none => simp [hstate] at h
        | some l => cases l <;> simp_all [hstate]

/-- **"Settlement records may never precede their run's admission" is false for
`appendRecords`**: the `executing` bypass accepts one before the first lifecycle row, and the
run's own first `running` row (written by `prompt` right after `admitted`) then discards it
through the reopen clause, so the turn that "really ran" ends unsettled and a second, different
settlement is accepted. -/
theorem t3_bypass_settlement_discarded :
    let s := r1 0 (.settle 5); let a := r1 1 (.life .admitted)
    let b := r1 2 (.life .running); let d := r1 3 (.life .completed)
    hostSettle [] 1 5 true = .append ∧ hostSettle [] 1 5 false = .withoutRun ∧
    appendStateOf ((ledger [a, s]).entry 1) = .settled ∧
    ((ledger [b, a, s]).entry 1).settle = none ∧
    hostSettle [d, b, a, s] 1 6 false = .append := by
  decide

/-- A `paused` row is refused once a terminal attempt is settled, yet `interrupt` writes
`cancelled` (the aborted session) and then `paused`: a settlement landing between the two makes
the host's own `paused` row illegal (`RUN_ID_TAKEN`) after its `interrupt.recorded` row landed. -/
theorem paused_after_settled_terminal_refused :
    hostLife [r1 3 (.settle 5), r1 2 (.life .cancelled), r1 1 (.life .running), r1 0 (.life .admitted)] 1 .paused = false ∧
    hostLife [r1 2 (.life .cancelled), r1 1 (.life .running), r1 0 (.life .admitted)] 1 .paused = true := by
  decide

theorem entry_life (rs : List Event) (r : Nat) : ((ledger rs).entry r).life = lastLife r rs := by
  induction rs with
  | nil => simp [ledger, lastLife, Ledger.entry]
  | cons e rs ih =>
    by_cases he : e.run = r
    · obtain ⟨ep, sq, run, kind, st⟩ := e
      simp only at he; subst he
      cases kind <;> simp [ledger, step, lastLife, ih]
    · rw [show ledger (e :: rs) = step (ledger rs) e from rfl, step_entry_other _ _ (Ne.symm he), ih]
      obtain ⟨ep, sq, run, kind, st⟩ := e
      simp only at he
      cases kind <;> simp [lastLife, he]

/-- `admitted` rows of `r` (newest first). -/
def admittedCount (r : Nat) : List Event → Nat
  | [] => 0
  | e :: rs => (if e.run = r ∧ e.kind = .life .admitted then 1 else 0) + admittedCount r rs

theorem admittedCount_zero (r : Nat) (rs : List Event) (h : lastLife r rs = none) : admittedCount r rs = 0 := by
  induction rs with
  | nil => rfl
  | cons e rs ih =>
    obtain ⟨ep, sq, run, kind, st⟩ := e
    cases kind with
    | life s =>
      by_cases hr : run = r
      · simp [lastLife, hr] at h
      · simp only [lastLife, hr, ite_false] at h; simp [admittedCount, hr, ih h]
    | settle c => simp only [lastLife] at h; simp [admittedCount, ih h]
    | commit c => simp only [lastLife] at h; simp [admittedCount, ih h]
    | other c => simp only [lastLife] at h; simp [admittedCount, ih h]

/-- Under the host's guards each run is admitted at most once, and only as its first
lifecycle row (a second `admitted` needs `unadmitted`, which no lifecycle row leaves). -/
theorem admitted_at_most_once {rs : List Event} (h : HostReach rs) (r : Nat) : admittedCount r rs ≤ 1 := by
  induction h with
  | nil => simp [admittedCount]
  | @step rs rs' e x _ happ ih =>
    unfold hostAppend at happ
    obtain ⟨ep, sq, run, kind, st⟩ := e
    cases kind with
    | life s =>
      simp only at happ
      split at happ
      · rename_i hl
        simp at happ; subst happ
        by_cases hadm : run = r ∧ s = .admitted
        · obtain ⟨rfl, rfl⟩ := hadm
          have : lastLife run rs = none := by
            unfold hostLife lifecycleLegal at hl
            simp only [↓reduceIte] at hl
            have hu : appendStateOf ((ledger rs).entry run) = .unadmitted := by simpa using hl
            rw [← entry_life]
            unfold appendStateOf at hu
            split at hu
            · rename_i hn
              cases hl' : ((ledger rs).entry run).life with
              | none => rfl
              | some l => rw [hl'] at hn; cases l <;> simp [hstate] at hn
            · exfalso
              revert hu
              split
              · simp
              · split <;> simp
          simp [admittedCount, admittedCount_zero run rs this]
        · have : ¬ (run = r ∧ Kind.life s = Kind.life .admitted) := by
            intro h'; apply hadm; exact ⟨h'.1, by cases h'.2; rfl⟩
          simp only [admittedCount, this, ite_false, Nat.zero_add]; exact ih
      · simp at happ
    | settle c =>
      simp only at happ
      split at happ
      · simp at happ; subst happ; simp [admittedCount, ih]
      · simp at happ; subst happ; exact ih
      · simp at happ
    | commit c => simp at happ; subst happ; simp [admittedCount, ih]
    | other c => simp at happ; subst happ; simp [admittedCount, ih]

/-- The appender does not require a term to start at sequence 0 (the host's convention). -/
theorem appender_any_start :
    appendFenced {} { epoch := 0, seq := 5, run := 1, kind := .other 0, stamp := 0 } =
      .ok (commit {} { epoch := 0, seq := 5, run := 1, kind := .other 0, stamp := 0 }, true) := rfl

/-! ## T6: determinism, incrementality, redelivery and monotonicity of the fold -/

theorem ledger_eq_foldr (rs : List Event) : ledger rs = rs.foldr (fun e L => step L e) {} := by
  induction rs <;> simp [ledger, *]

/-- The executable `runLedgerOf` (physical order) is the newest-first `ledger`. -/
theorem t6_physical (log : List Event) : runLedgerOf log = ledger log.reverse := by
  rw [ledger_eq_foldr, ← List.foldl_reverse, List.reverse_reverse]; rfl

/-- **T6a** (incremental = batch): folding a log in any chunking gives the same ledger, so
`fromTransition(step)` fed row by row equals `runLedgerOf` on the whole log. -/
theorem t6_incremental (p q : List Event) : runLedgerOf (p ++ q) = q.foldl step (runLedgerOf p) := by
  simp [runLedgerOf, List.foldl_append]

theorem put_self (L : Ledger) (r : Nat) (v : Entry) (h : L.runs r = some v) (ho : r ∈ L.order) :
    L.put r v = L := by
  cases L with
  | mk runs order chat =>
    simp only at h ho
    simp only [Ledger.put, ho, ite_true, Ledger.mk.injEq, and_true]
    funext r'
    by_cases hr : r' = r
    · subst hr; simp [h]
    · simp [hr]

/-- **T6b** (adjacent redelivery is harmless): each row's transition is idempotent. -/
theorem t6_step_idem (L : Ledger) (e : Event) : step (step L e) e = step L e := by
  obtain ⟨ep, sq, run, kind, st⟩ := e
  cases kind with
  | life s =>
    simp only [step]
    have hv : ((L.put run { life := some s, settle := if s = Life.running then none else (L.entry run).settle }).setChat run).entry run
        = { life := some s, settle := if s = Life.running then none else (L.entry run).settle } := by simp
    rw [hv]
    have hs : (if s = Life.running then none else (if s = Life.running then none else (L.entry run).settle))
        = (if s = Life.running then none else (L.entry run).settle) := by split <;> rfl
    simp only [hs]
    rw [put_self]
    · rfl
    · simp [Ledger.setChat, Ledger.put]
    · simp only [Ledger.setChat, Ledger.put]; split <;> simp_all
  | settle c =>
    simp only [step]
    rw [put_self] <;> simp [Ledger.put, Ledger.entry, keepFirst] <;> split <;> simp_all
  | commit c =>
    simp only [step]
    rw [put_self] <;> simp [Ledger.put, Ledger.entry] <;> split <;> simp_all
  | other c =>
    simp only [step]
    rw [put_self] <;> simp [Ledger.put, Ledger.entry] <;> split <;> simp_all

/-- **T6c** (non-adjacent redelivery is not harmless): replaying an earlier `running` row after
the run settled and ended reopens it in the reader's ledger. `runLedgerOf` is only safe on a
de-duplicated stream — true of `log.read()`, not of an at-least-once cursor feed. -/
theorem t6_redelivery_breaks :
    let log := [r1 0 (.life .admitted), r1 1 (.life .running), r1 2 (.settle 5), r1 3 (.life .completed)]
    appendStateOf ((runLedgerOf log).entry 1) = .settled ∧
    appendStateOf ((runLedgerOf (log ++ [r1 1 (.life .running)])).entry 1) = .open_ := by
  decide

/-- The L4 reducer's `applied` set: a row key applied once is never applied again. -/
structure Applied where
  keys : List (Nat × Nat) := []
  ledger : Ledger := {}

def applyOnce (A : Applied) (e : Event) : Applied :=
  if e.key ∈ A.keys then A else { keys := e.key :: A.keys, ledger := step A.ledger e }

/-- **T6d**: with an `applied` set, any redelivery of already-applied rows is a no-op. -/
theorem t6_applied_redelivery (A : Applied) (ys : List Event) (h : ∀ y ∈ ys, y.key ∈ A.keys) :
    ys.foldl applyOnce A = A := by
  induction ys with
  | nil => rfl
  | cons y ys ih =>
    simp only [List.foldl_cons]
    have hy : applyOnce A y = A := by simp [applyOnce, h y List.mem_cons_self]
    rw [hy]
    exact ih (fun z hz => h z (List.mem_cons_of_mem _ hz))

/-- **T6d'**: on a stream without repeated keys the `applied` set changes nothing. -/
theorem t6_applied_faithful (A : Applied) (xs : List Event) (hn : (xs.map Event.key).Nodup)
    (hd : ∀ x ∈ xs, x.key ∉ A.keys) : (xs.foldl applyOnce A).ledger = xs.foldl step A.ledger := by
  induction xs generalizing A with
  | nil => rfl
  | cons x xs ih =>
    simp only [List.map_cons, List.nodup_cons] at hn
    simp only [List.foldl_cons]
    have hx : applyOnce A x = { keys := x.key :: A.keys, ledger := step A.ledger x } := by
      simp [applyOnce, hd x List.mem_cons_self]
    rw [hx]
    apply ih _ hn.2
    intro y hy hmem
    simp only [List.mem_cons] at hmem
    rcases hmem with h | h
    · exact hn.1 (h ▸ List.mem_map_of_mem hy)
    · exact hd y (List.mem_cons_of_mem _ hy) h

/-- **T6d''**: so a reader that keeps `applied` computes exactly `runLedgerOf` of the appender's
log, however often rows are redelivered afterwards. -/
theorem t6_applied_matches_log {L : Log} (h : Reach L) (ys : List Event) (hy : ∀ y ∈ ys, y ∈ L.rows) :
    ((L.rows.reverse ++ ys).foldl applyOnce {}).ledger = runLedgerOf L.rows.reverse := by
  rw [List.foldl_append, t6_applied_redelivery]
  · exact t6_applied_faithful {} _ (by rw [List.map_reverse]; exact (List.reverse_perm _).nodup_iff.mpr (t2_keys_nodup h))
      (by simp)
  · intro y hyy
    have hy' := hy y hyy
    -- every key of the log is in the applied set after folding the log
    suffices ∀ (xs : List Event) (A : Applied), y ∈ xs → y.key ∈ (xs.foldl applyOnce A).keys by
      exact this _ _ (List.mem_reverse.mpr hy')
    intro xs
    induction xs with
    | nil => intro A hm; simp at hm
    | cons x xs ih =>
      intro A hm
      simp only [List.foldl_cons]
      rcases List.mem_cons.mp hm with rfl | hm
      · suffices ∀ (zs : List Event) (B : Applied), y.key ∈ B.keys → y.key ∈ (zs.foldl applyOnce B).keys from
          this xs _ (by unfold applyOnce; split <;> simp_all)
        intro zs
        induction zs with
        | nil => intro B hb; exact hb
        | cons z zs ihz =>
          intro B hb; simp only [List.foldl_cons]; apply ihz; unfold applyOnce; split <;> simp_all
      · exact ih _ hm

/-- The information order on ledgers that the fold respects: runs are only ever added, in
first-appearance order, and an admitted run never becomes unadmitted. -/
def LedgerLe (A B : Ledger) : Prop :=
  A.order <+: B.order ∧ ∀ r, (A.entry r).life.isSome = true → (B.entry r).life.isSome = true

theorem ledgerLe_refl (A : Ledger) : LedgerLe A A := ⟨List.prefix_refl _, fun _ h => h⟩

theorem ledgerLe_trans {A B C : Ledger} (h1 : LedgerLe A B) (h2 : LedgerLe B C) : LedgerLe A C :=
  ⟨h1.1.trans h2.1, fun r h => h2.2 r (h1.2 r h)⟩

theorem ledgerLe_step (L : Ledger) (e : Event) : LedgerLe L (step L e) := by
  constructor
  · unfold step
    split <;> simp only [Ledger.setChat, Ledger.put] <;> split <;>
      first | exact List.prefix_refl _ | exact List.prefix_append _ _
  · intro r h
    by_cases hr : r = e.run
    · subst hr
      unfold step
      split <;> simp_all
    · rw [step_entry_other _ _ hr]; exact h

/-- **T6e** (prefix monotonicity): extending the log only grows the ledger in `LedgerLe`. -/
theorem t6_monotone (rs newer : List Event) : LedgerLe (ledger rs) (ledger (newer ++ rs)) := by
  induction newer with
  | nil => exact ledgerLe_refl _
  | cons e newer ih => exact ledgerLe_trans ih (ledgerLe_step _ _)

/-- **T6e'**: settled-ness is not monotone — the reopen clause drops the first attempt's
settlement from the ledger (it stays in the log). -/
theorem t6_settled_not_monotone :
    let log := [r1 0 (.life .admitted), r1 1 (.life (.failed true)), r1 2 (.settle 5)]
    appendStateOf ((runLedgerOf log).entry 1) = .settled ∧
    ((runLedgerOf (log ++ [r1 3 (.life .running)])).entry 1).settle = none := by
  decide

/-! ## replayed-start.ts against the ledger -/

/-- `replayedStartOutcome` answers `settled` exactly for a committed run whose ledger lifecycle
is terminal — whether or not the ledger holds a settlement for it. -/
theorem replayed_settled_iff (rs : List Event) (r : Nat) :
    replayedStart rs r = .settled ↔
      (rs.any (isCommitOf r) = true ∧ hstate ((ledger rs).entry r).life = .terminal) := by
  rw [entry_life]
  unfold replayedStart
  cases hc : rs.any (isCommitOf r) with
  | false => simp
  | true =>
    cases hl : lastLife r rs with
    | none => simp [hstate]
    | some s => simp only [Bool.not_true, Bool.false_eq_true, ite_false, true_and]; split <;> simp_all

/-- ... so its `settled` is the ledger's `terminal`-or-`settled`, not the ledger's `settled`. -/
theorem replayed_settled_is_not_ledger_settled :
    let log := [r1 0 (.life .admitted), r1 1 (.commit 0), r1 2 (.life .running), r1 3 (.life .completed)]
    replayedStart log.reverse 1 = .settled ∧ appendStateOf ((runLedgerOf log).entry 1) = .terminal := by
  decide

/-! ## T5: cursor-based gap detection over the batch contract -/

/-- The reader-side check: the batch starts at the cursor the reader asked for, and
`nextCursor = cursor + events.length`. None of the four TS readers makes the first comparison. -/
def batchOk (asked : Nat) (b : Batch) : Bool := b.cursor == asked && b.next == b.cursor + b.events.length

/-- What `readBatch` promises whatever `limit` and `maxBytes` cut: a contiguous slice of the
physical log at the clamped cursor. -/
def Honest (log : List Event) (asked : Nat) (b : Batch) : Prop :=
  b.cursor = min asked log.length ∧ b.events = (log.drop b.cursor).take b.events.length ∧
  b.next = b.cursor + b.events.length ∧ b.finish = log.length

theorem byteBounded_prefix (sizes : Event → Nat) (m : Nat) (w : List Event) (t : Nat) (acc : List Event) :
    ∃ k, byteBounded sizes m w t acc = acc.reverse ++ w.take k := by
  induction w generalizing t acc with
  | nil => exact ⟨0, by simp [byteBounded]⟩
  | cons e es ih =>
    unfold byteBounded
    dsimp only
    split
    · exact ⟨0, by simp⟩
    · obtain ⟨k, hk⟩ := ih (t + sizes e) (e :: acc)
      exact ⟨k + 1, by rw [hk]; simp⟩

theorem take_length_take {α : Type} (D : List α) (j : Nat) : D.take (D.take j).length = D.take j := by
  rw [List.length_take]
  by_cases h : j ≤ D.length
  · rw [Nat.min_eq_left h]
  · rw [Nat.min_eq_right (by omega), List.take_length, List.take_of_length_le (by omega)]

/-- `readBatch` honours the contract, with or without a byte budget. -/
theorem t5_readBatch_honest (log : List Event) (c limit : Nat) (mb : Option Nat) (sizes : Event → Nat) :
    Honest log c (readBatch log c limit mb sizes) := by
  have key : ∀ (D evs : List Event), (∃ j, evs = D.take j) → evs = D.take evs.length := by
    rintro D evs ⟨j, rfl⟩; exact (take_length_take D j).symm
  unfold readBatch Honest
  dsimp only
  refine ⟨rfl, key _ _ ?_, rfl, rfl⟩
  cases mb with
  | none => exact ⟨limit, rfl⟩
  | some m =>
    obtain ⟨k, hk⟩ := byteBounded_prefix sizes m ((List.drop (min c log.length) log).take limit) 0 []
    exact ⟨min k limit, by dsimp only; rw [hk]; simp [List.take_take]⟩

/-- A reader's session: `(log_i, b_i)` oldest first; `b_i` answers the cursor the reader held. -/
def Session : Nat → List (List Event × Batch) → Prop
  | _, [] => True
  | c, (log, b) :: rest => Honest log c b ∧ Session b.next rest

def allOk : Nat → List (List Event × Batch) → Bool
  | _, [] => true
  | c, (_, b) :: rest => batchOk c b && allOk b.next rest

def delivered (reads : List (List Event × Batch)) : List Event := reads.flatMap (·.2.events)

def finalCursor : Nat → List (List Event × Batch) → Nat
  | c, [] => c
  | _, (_, b) :: rest => finalCursor b.next rest

/-- Append-only history: each read saw a prefix of the next read's log. -/
def Growing : List (List Event × Batch) → Prop
  | [] => True
  | [_] => True
  | (l1, _) :: (l2, b2) :: rest => l1 <+: l2 ∧ Growing ((l2, b2) :: rest)

theorem honest_len {log : List Event} {c : Nat} {b : Batch} (h : Honest log c b) :
    b.cursor + b.events.length ≤ log.length := by
  obtain ⟨h1, h2, _, _⟩ := h
  have := congrArg List.length h2
  rw [List.length_take, List.length_drop] at this
  have : b.cursor ≤ log.length := by rw [h1]; exact Nat.min_le_right _ _
  omega

/-- **T5 soundness** (no false alarm): on an append-only log, a reader that starts inside the
log never fails the check. -/
theorem t5_sound (reads : List (List Event × Batch)) : ∀ c, Session c reads → Growing reads →
    (∀ p, reads.head? = some p → c ≤ p.1.length) → allOk c reads = true := by
  induction reads with
  | nil => intro _ _ _ _; rfl
  | cons p rest ih =>
    obtain ⟨log, b⟩ := p
    intro c hs hg hc
    obtain ⟨hh, hrest⟩ := hs
    have hcl := hc (log, b) rfl
    have hcur : b.cursor = c := by rw [hh.1]; exact Nat.min_eq_left hcl
    have hlen := honest_len hh
    have hb : batchOk c b = true := by simp [batchOk, hcur, hh.2.2.1]
    simp only [allOk, hb, Bool.true_and]
    apply ih _ hrest
    · cases rest with
      | nil => trivial
      | cons q rest' => exact hg.2
    · intro q hq
      cases rest with
      | nil => simp at hq
      | cons q' rest' =>
        simp at hq; subst hq
        have hp := hg.1
        have := hp.length_le
        rw [hh.2.2.1]; omega

/-- **T5 completeness** (no missed row): if every batch passed the check, the rows delivered,
followed by what the log holds past the final cursor, are exactly the log from the first cursor —
nothing skipped, nothing twice. -/
theorem t5_complete (F : List Event) (reads : List (List Event × Batch)) : ∀ c, Session c reads →
    allOk c reads = true → (∀ p ∈ reads, p.1 <+: F) →
    delivered reads ++ F.drop (finalCursor c reads) = F.drop c := by
  induction reads with
  | nil => intro c _ _ _; simp [delivered, finalCursor]
  | cons p rest ih =>
    obtain ⟨log, b⟩ := p
    intro c hs hok hpre
    obtain ⟨hh, hrest⟩ := hs
    simp only [allOk, batchOk, Bool.and_eq_true, beq_iff_eq] at hok
    obtain ⟨⟨hcur, hnext⟩, hok'⟩ := hok
    have hlen := honest_len hh
    have hF : log <+: F := hpre (log, b) List.mem_cons_self
    obtain ⟨t, ht⟩ := hF
    have h2 := hh.2.1
    rw [hcur] at h2
    have hlog : (log.drop c).take b.events.length = (F.drop c).take b.events.length := by
      rw [← ht, List.drop_append_of_le_length (by omega),
        List.take_append_of_le_length (by rw [List.length_drop]; omega)]
    have hev := h2.trans hlog
    have ih' := ih b.next hrest hok' (fun q hq => hpre q (List.mem_cons_of_mem _ hq))
    simp only [delivered, List.flatMap_cons, finalCursor] at ih' ⊢
    rw [List.append_assoc, ih', hnext, hcur, ← List.drop_drop]
    generalize b.events.length = n at hev ⊢
    rw [hev, List.take_append_drop]

/-- The check is exactly the clamp detector: an honest batch starts elsewhere than asked iff the
reader asked past the end of the log. -/
theorem t5_clamp_iff {log : List Event} {c : Nat} {b : Batch} (h : Honest log c b) :
    b.cursor ≠ c ↔ log.length < c := by
  rw [h.1]; omega

/-- **T5, the TS readers' check** (`nextCursor` arithmetic only, then advance): a clamped read
passes it. A reader at cursor 3 of a 1-row log is handed `cursor 1, nextCursor 1` and silently
rewinds; whatever it folds next it may already have folded (T6c). -/
theorem t5_ts_readers_blind :
    let log := [r1 0 (.life .admitted)]
    let b := readBatch log 3 16 none
    b.next = b.cursor + b.events.length ∧ b.cursor ≠ 3 ∧ batchOk 3 b = false := by
  decide

/-- The L4 sketch's `lastSequenceByEpoch` gap check (physical order; a new epoch starts at 0, the
host's convention). -/
def seqGaps : List (Nat × Nat) → List Event → List (Nat × Nat)
  | _, [] => []
  | seen, e :: es =>
    let expected := match seen.lookup e.epoch with | some s => s + 1 | none => 0
    (if e.seq = expected then [] else [e.key]) ++ seqGaps ((e.epoch, e.seq) :: seen) es

def ek (epoch seq : Nat) : Event := { epoch, seq, run := 1, kind := .other seq, stamp := 0 }

/-- **T5, sequence-based `gaps` are incomplete**: a reader that missed the tail of a leadership
term, or a whole term, sees no hole in any epoch's sequence. Only the cursor check catches it. -/
theorem t5_seq_gaps_incomplete :
    seqGaps [] [ek 0 0, ek 0 1, ek 1 0] = [] ∧            -- log had ek 0 2 before ek 1 0
    seqGaps [] [ek 0 0, ek 2 0, ek 2 1] = [] ∧            -- log had all of epoch 1 between
    seqGaps [] [ek 0 0, ek 0 2] = [(0, 2)] := by          -- an interior hole is seen
  decide

/-! ## T7: mergeLogSegments -/

/-- Row `(epoch, seq)` at time `stamp` for the merge examples. -/
def mr (epoch seq stamp : Nat) : Event := { epoch, seq, run := 1, kind := .other 0, stamp }

/-- **T7, order independence is false**: when a leadership term is present in two segments (the
"twice-projected" case the code handles), the merged order depends on the order the segments are
listed in: the tie-break reads the device of whichever segment introduced the term. -/
theorem t7_segment_order_matters :
    let A := (0, [mr 1 0 10]); let B := (1, [mr 2 0 10, mr 1 0 10])
    (merge [A, B]).map Event.key = [(1, 0), (2, 0)] ∧
    (merge [B, A]).map Event.key = [(2, 0), (1, 0)] := by
  decide

/-- **T7, "one device's terms never out of its own file order" is false**, and so is
idempotence under a repeated segment: `holdFileOrder` clamps a term's start once, when its
segment introduces it, and a later copy of the same term lowers it again with `Math.min`. The
clock step (100 → 50) is exactly what `holdFileOrder` exists for. -/
theorem t7_duplicate_segment_breaks_file_order :
    let A := (0, [mr 1 0 100, mr 2 0 50])
    (merge [A]).map Event.key = [(1, 0), (2, 0)] ∧
    (merge [A, A]).map Event.key = [(2, 0), (1, 0)] := by
  decide

/-- **T7, a merged view is not append-only**: a segment that arrives later can place rows before
rows already read, so a cursor into a merged view is not a stable position (T5's premise). -/
theorem t7_merge_not_prefix_stable :
    let A := (0, [mr 1 0 100]); let B := (1, [mr 2 0 50])
    (merge [A]).map Event.key = [(1, 0)] ∧ (merge [A, B]).map Event.key = [(2, 0), (1, 0)] := by
  decide

/-- **T7, content of a key is first-read-wins**: two segments that disagree on one
`(epoch, sequence)` merge silently to whichever is listed first (the appender would refuse the
second copy with `EVENT_MUTATED`; the merge neither refuses nor reports it). -/
theorem t7_conflicting_copy_first_wins :
    let x0 : Event := { epoch := 1, seq := 0, run := 1, kind := .other 0, stamp := 10 }
    let x7 : Event := { epoch := 1, seq := 0, run := 1, kind := .other 7, stamp := 10 }
    merge [(0, [x0]), (1, [x7])] = [x0] ∧ merge [(1, [x7]), (0, [x0])] = [x7] := by
  decide

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

theorem perm_flatMap_left {α β : Type} (l : List α) (f g : α → List β)
    (h : ∀ a ∈ l, (f a).Perm (g a)) : (l.flatMap f).Perm (l.flatMap g) := by
  induction l with
  | nil => simp
  | cons a as ih =>
    simp only [List.flatMap_cons]
    exact List.Perm.append (h a List.mem_cons_self) (ih fun b hb => h b (List.mem_cons_of_mem _ hb))

def Term.keys (t : Term) : List (Nat × Nat) := t.events.map Event.key

def allKeys (ts : List Term) : List (Nat × Nat) := ts.flatMap Term.keys

/-- Every row a term holds is of that term's epoch. -/
def EpochOk (ts : List Term) : Prop := ∀ t ∈ ts, ∀ x ∈ t.events, x.epoch = t.epoch

theorem mem_allKeys {k : Nat × Nat} {ts : List Term} : k ∈ allKeys ts ↔ ∃ t ∈ ts, k ∈ t.keys := by
  simp [allKeys, List.mem_flatMap]

theorem addRow_spec (dev : Nat) (st : List Term × List Nat) (e : Event) (hok : EpochOk st.1) :
    EpochOk (addRow dev st e).1 ∧ ∀ k, k ∈ allKeys (addRow dev st e).1 ↔ (k ∈ allKeys st.1 ∨ k = e.key) := by
  unfold addRow
  split
  · constructor
    · intro t ht x hx
      simp only [List.mem_append, List.mem_singleton] at ht
      rcases ht with ht | rfl
      · exact hok t ht x hx
      · simp at hx; subst hx; rfl
    · intro k
      simp [allKeys, List.flatMap_append, Term.keys]
  · rename_i t0 hfind
    have ht0 := List.mem_of_find?_eq_some hfind
    have hep : t0.epoch = e.epoch := by simpa using List.find?_some hfind
    constructor
    · intro t ht x hx
      simp only [List.mem_map] at ht
      obtain ⟨t', ht', rfl⟩ := ht
      by_cases hm : (t'.epoch == e.epoch) = true
      · simp only [hm, ↓reduceIte] at hx ⊢
        by_cases hh : t'.has e.seq = true
        · simp only [hh, ↓reduceIte] at hx; exact hok t' ht' x hx
        · simp only [hh, Bool.false_eq_true, ↓reduceIte] at hx
          simp only [List.mem_append, List.mem_singleton] at hx
          rcases hx with hx | rfl
          · exact hok t' ht' x hx
          · exact (by simpa using hm : t'.epoch = x.epoch).symm
      · simp only [hm, Bool.false_eq_true, ↓reduceIte] at hx ⊢; exact hok t' ht' x hx
    · intro k
      simp only [mem_allKeys, List.mem_map]
      constructor
      · rintro ⟨t, ⟨t', ht', rfl⟩, hk⟩
        split at hk
        · simp only [Term.keys] at hk
          split at hk
          · exact Or.inl ⟨t', ht', hk⟩
          · simp only [List.map_append, List.mem_append, List.map_cons, List.map_nil,
              List.mem_singleton] at hk
            rcases hk with hk | hk
            · exact Or.inl ⟨t', ht', hk⟩
            · exact Or.inr hk
        · exact Or.inl ⟨t', ht', hk⟩
      · rintro (⟨t, ht, hk⟩ | rfl)
        · refine ⟨_, ⟨t, ht, rfl⟩, ?_⟩
          split
          · simp only [Term.keys] at hk ⊢
            split
            · exact hk
            · simp [hk]
          · exact hk
        · refine ⟨_, ⟨t0, ht0, rfl⟩, ?_⟩
          simp only [hep, beq_self_eq_true, ite_true, Term.keys]
          split
          · rename_i hhas
            simp only [Term.has, List.any_eq_true, beq_iff_eq] at hhas
            obtain ⟨x, hx, hxs⟩ := hhas
            have := hok t0 ht0 x hx
            exact List.mem_map.mpr ⟨x, hx, by simp [Event.key, this, hep, hxs]⟩
          · simp

theorem clamp_proj (intro : List Nat) (ts : List Term) :
    (clamp intro ts).map (fun t => (t.epoch, t.events)) = ts.map (fun t => (t.epoch, t.events)) := by
  unfold clamp
  suffices ∀ (acc : List Term × Option Nat),
      (intro.foldl (fun (acc : List Term × Option Nat) ep =>
        let cur := ((acc.1.find? (fun t => t.epoch == ep)).map (·.started)).getD 0
        let v := match acc.2 with | some f => max cur f | none => cur
        (acc.1.map (fun t => if t.epoch == ep then { t with started := v } else t), some v)) acc).1.map
          (fun t => (t.epoch, t.events)) = acc.1.map (fun t => (t.epoch, t.events)) from this _
  induction intro with
  | nil => intro acc; rfl
  | cons ep eps ih =>
    intro acc
    simp only [List.foldl_cons]
    rw [ih]
    simp only [List.map_map]
    congr 1
    funext t
    simp only [Function.comp]
    split <;> rfl

theorem proj_keys {ts ts' : List Term}
    (h : ts.map (fun t => (t.epoch, t.events)) = ts'.map (fun t => (t.epoch, t.events))) :
    allKeys ts = allKeys ts' ∧ (EpochOk ts ↔ EpochOk ts') := by
  have hk : allKeys ts = (ts.map (fun t => (t.epoch, t.events))).flatMap (fun p => p.2.map Event.key) := by
    simp only [allKeys, List.flatMap_map]; rfl
  have hk' : allKeys ts' = (ts'.map (fun t => (t.epoch, t.events))).flatMap (fun p => p.2.map Event.key) := by
    simp only [allKeys, List.flatMap_map]; rfl
  refine ⟨by rw [hk, hk', h], ?_⟩
  have he : ∀ (us : List Term), EpochOk us ↔ ∀ p ∈ us.map (fun t => (t.epoch, t.events)), ∀ x ∈ p.2, x.epoch = p.1 := by
    intro us; simp [EpochOk]
  rw [he, he, h]

theorem mergeSegment_spec (ts : List Term) (seg : Nat × List Event) (hok : EpochOk ts) :
    EpochOk (mergeSegment ts seg) ∧
      ∀ k, k ∈ allKeys (mergeSegment ts seg) ↔ (k ∈ allKeys ts ∨ k ∈ seg.2.map Event.key) := by
  have rows : ∀ (rs : List Event) (st : List Term × List Nat), EpochOk st.1 →
      EpochOk (rs.foldl (addRow seg.1) st).1 ∧
        ∀ k, k ∈ allKeys (rs.foldl (addRow seg.1) st).1 ↔ (k ∈ allKeys st.1 ∨ k ∈ rs.map Event.key) := by
    intro rs
    induction rs with
    | nil => intro st h; simp [h]
    | cons e es ih =>
      intro st h
      obtain ⟨h1, h2⟩ := addRow_spec seg.1 st e h
      obtain ⟨h3, h4⟩ := ih _ h1
      simp only [List.foldl_cons]
      refine ⟨h3, fun k => ?_⟩
      rw [h4, h2]
      simp only [List.map_cons, List.mem_cons]
      constructor
      · rintro ((h | h) | h)
        · exact Or.inl h
        · exact Or.inr (Or.inl h)
        · exact Or.inr (Or.inr h)
      · rintro (h | h | h)
        · exact Or.inl (Or.inl h)
        · exact Or.inl (Or.inr h)
        · exact Or.inr h
  obtain ⟨h1, h2⟩ := rows seg.2 (ts, []) hok
  obtain ⟨hk, he⟩ := proj_keys (clamp_proj (seg.2.foldl (addRow seg.1) (ts, [])).2 (seg.2.foldl (addRow seg.1) (ts, [])).1)
  unfold mergeSegment
  exact ⟨he.mpr h1, fun k => by rw [hk]; exact h2 k⟩

theorem segments_spec (segs : List (Nat × List Event)) : ∀ ts, EpochOk ts →
    EpochOk (segs.foldl mergeSegment ts) ∧
      ∀ k, k ∈ allKeys (segs.foldl mergeSegment ts) ↔ (k ∈ allKeys ts ∨ ∃ seg ∈ segs, k ∈ seg.2.map Event.key) := by
  induction segs with
  | nil => intro ts h; simp [h]
  | cons seg segs ih =>
    intro ts h
    obtain ⟨h1, h2⟩ := mergeSegment_spec ts seg h
    obtain ⟨h3, h4⟩ := ih _ h1
    simp only [List.foldl_cons]
    refine ⟨h3, fun k => ?_⟩
    rw [h4, h2]
    constructor
    · rintro ((h | h) | ⟨s, hs, hk⟩)
      · exact Or.inl h
      · exact Or.inr ⟨seg, List.mem_cons_self, h⟩
      · exact Or.inr ⟨s, List.mem_cons_of_mem _ hs, hk⟩
    · rintro (h | ⟨s, hs, hk⟩)
      · exact Or.inl (Or.inl h)
      · rcases List.mem_cons.mp hs with rfl | hs
        · exact Or.inl (Or.inr hk)
        · exact Or.inr ⟨s, hs, hk⟩

/-- **T7 (proved): set membership is exact.** A `(leaderEpoch, sequence)` is in the merged
view iff some segment holds it — whatever the segment order, duplicates or clock skew. -/
theorem t7_keys_exact (segs : List (Nat × List Event)) (k : Nat × Nat) :
    k ∈ (merge segs).map Event.key ↔ ∃ seg ∈ segs, k ∈ seg.2.map Event.key := by
  have hspec := (segments_spec segs [] (by simp [EpochOk])).2 k
  simp only [allKeys, List.flatMap_nil, List.not_mem_nil, false_or] at hspec
  rw [← hspec]
  unfold merge
  simp only [List.map_flatMap]
  have hperm := isort_perm termLt ((segs.foldl mergeSegment []).map fun t =>
    { t with events := isort (fun a b => a.seq < b.seq) t.events })
  rw [(List.Perm.flatMap_right (fun a => a.events.map Event.key) hperm).mem_iff]
  simp only [List.flatMap_map, List.mem_flatMap]
  constructor
  · rintro ⟨t, ht, hk⟩
    exact ⟨t, ht, ((isort_perm _ t.events).map Event.key).mem_iff.mp hk⟩
  · rintro ⟨t, ht, hk⟩
    exact ⟨t, ht, ((isort_perm _ t.events).map Event.key).mem_iff.mpr hk⟩

theorem nodup_of_map {α β : Type} (f : α → β) (m : List α) (h : (m.map f).Nodup) : m.Nodup := by
  induction m with
  | nil => exact List.nodup_nil
  | cons a as ih =>
    simp only [List.map_cons, List.nodup_cons] at h
    exact List.nodup_cons.mpr ⟨fun ha => h.1 (List.mem_map_of_mem ha), ih h.2⟩

/-- Terms have distinct epochs; a term's rows have distinct sequences. -/
def Distinct (ts : List Term) : Prop :=
  (ts.map (·.epoch)).Nodup ∧ ∀ t ∈ ts, (t.events.map (·.seq)).Nodup

theorem addRow_distinct (dev : Nat) (st : List Term × List Nat) (e : Event) (hd : Distinct st.1) :
    Distinct (addRow dev st e).1 := by
  unfold addRow
  split
  · rename_i hnone
    constructor
    · rw [List.map_append, List.nodup_append]
      refine ⟨hd.1, by simp, ?_⟩
      intro a ha b hb hab
      simp at hb; subst hb; subst hab
      obtain ⟨t, ht, hte⟩ := List.mem_map.mp ha
      exact List.find?_eq_none.mp hnone t ht (by simp [hte])
    · intro t ht
      simp only [List.mem_append, List.mem_singleton] at ht
      rcases ht with ht | rfl
      · exact hd.2 t ht
      · simp
  · constructor
    · have : (st.1.map fun t => if (t.epoch == e.epoch) = true then
          { t with events := if t.has e.seq = true then t.events else t.events ++ [e],
                   started := min t.started e.stamp } else t).map (·.epoch) = st.1.map (·.epoch) := by
        simp only [List.map_map]
        congr 1; funext t; simp only [Function.comp]; split <;> rfl
      rw [this]; exact hd.1
    · intro t ht
      simp only [List.mem_map] at ht
      obtain ⟨t', ht', rfl⟩ := ht
      by_cases hm : (t'.epoch == e.epoch) = true
      · simp only [hm, ↓reduceIte]
        by_cases hh : t'.has e.seq = true
        · simp only [hh, ↓reduceIte]; exact hd.2 t' ht'
        · simp only [hh, Bool.false_eq_true, ↓reduceIte, List.map_append, List.map_cons, List.map_nil]
          rw [List.nodup_append]
          refine ⟨hd.2 t' ht', by simp, ?_⟩
          intro a ha b hb hab
          simp at hb; subst hb; subst hab
          obtain ⟨x, hx, hxs⟩ := List.mem_map.mp ha
          apply hh
          simp only [Term.has, List.any_eq_true, beq_iff_eq]
          exact ⟨x, hx, hxs⟩
      · simp only [hm, Bool.false_eq_true, ↓reduceIte]; exact hd.2 t' ht'

theorem proj_distinct {ts ts' : List Term}
    (h : ts.map (fun t => (t.epoch, t.events)) = ts'.map (fun t => (t.epoch, t.events))) :
    Distinct ts ↔ Distinct ts' := by
  have he : ∀ (us : List Term), Distinct us ↔
      ((us.map (fun t => (t.epoch, t.events))).map Prod.fst).Nodup ∧
        ∀ p ∈ us.map (fun t => (t.epoch, t.events)), (p.2.map (·.seq)).Nodup := by
    intro us; simp [Distinct, List.map_map, Function.comp_def]
  rw [he, he, h]

theorem segments_distinct (segs : List (Nat × List Event)) : ∀ ts, Distinct ts →
    Distinct (segs.foldl mergeSegment ts) := by
  induction segs with
  | nil => intro ts h; exact h
  | cons seg segs ih =>
    intro ts h
    simp only [List.foldl_cons]
    apply ih
    have rows : ∀ (rs : List Event) (st : List Term × List Nat), Distinct st.1 →
        Distinct (rs.foldl (addRow seg.1) st).1 := by
      intro rs
      induction rs with
      | nil => intro st h; exact h
      | cons e es ihr => intro st h; exact ihr _ (addRow_distinct seg.1 st e h)
    unfold mergeSegment
    exact (proj_distinct (clamp_proj _ _)).mpr (rows seg.2 (ts, []) h)

theorem allKeys_nodup (ts : List Term) (hd : Distinct ts) (he : EpochOk ts) : (allKeys ts).Nodup := by
  induction ts with
  | nil => simp [allKeys]
  | cons t ts ih =>
    simp only [allKeys, List.flatMap_cons]
    rw [List.nodup_append]
    have hd' : Distinct ts := ⟨(List.nodup_cons.mp hd.1).2, fun u hu => hd.2 u (List.mem_cons_of_mem _ hu)⟩
    have he' : EpochOk ts := fun u hu => he u (List.mem_cons_of_mem _ hu)
    refine ⟨?_, ih hd' he', ?_⟩
    · apply nodup_of_map Prod.snd
      simp only [Term.keys, List.map_map]
      exact hd.2 t List.mem_cons_self
    · intro a ha b hb hab
      subst hab
      obtain ⟨x, hx, rfl⟩ := List.mem_map.mp ha
      obtain ⟨u, hu, hk⟩ := mem_allKeys.mp hb
      obtain ⟨y, hy, hyk⟩ := List.mem_map.mp hk
      have h1 := he t List.mem_cons_self x hx
      have h2 := he u (List.mem_cons_of_mem _ hu) y hy
      have : y.epoch = x.epoch := by simp [Event.key] at hyk; exact hyk.1
      have hne := (List.nodup_cons.mp hd.1).1
      apply hne
      exact List.mem_map.mpr ⟨u, hu, by rw [← h2, this, h1]⟩

/-- **T7 (proved): no row is duplicated.** Every `(leaderEpoch, sequence)` occurs at most once in
the merged view, whatever the segments — including a segment listed twice. -/
theorem t7_no_duplicates (segs : List (Nat × List Event)) : ((merge segs).map Event.key).Nodup := by
  have hd := segments_distinct segs [] (by simp [Distinct])
  have he := (segments_spec segs [] (by simp [EpochOk])).1
  have hn := allKeys_nodup _ hd he
  unfold merge
  simp only [List.map_flatMap]
  have hperm := isort_perm termLt ((segs.foldl mergeSegment []).map fun t =>
    { t with events := isort (fun a b => a.seq < b.seq) t.events })
  rw [(List.Perm.flatMap_right (fun a => a.events.map Event.key) hperm).nodup_iff]
  rw [List.flatMap_map]
  have hp : (List.flatMap (fun t => (isort (fun a b => a.seq < b.seq) t.events).map Event.key)
      (segs.foldl mergeSegment [])).Perm (allKeys (segs.foldl mergeSegment [])) :=
    perm_flatMap_left _ _ _ (fun t _ => (isort_perm _ t.events).map Event.key)
  exact hp.nodup_iff.mpr hn

end ChatLedger
