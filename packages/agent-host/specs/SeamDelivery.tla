---------------------------- MODULE SeamDelivery ----------------------------
(***************************************************************************)
(* Commands and reads across one seam (W4 seam contract, T13).            *)
(*                                                                         *)
(* One client, one chat log, owner generations 1..MaxGen that can crash,   *)
(* hang, wake as zombies and be replaced. A connection is reliable while   *)
(* both ends live; messages are lost when a generation crashes or the      *)
(* client moves to another connection, and duplicated when the client      *)
(* re-sends after reconnecting.                                            *)
(*                                                                         *)
(* The storage fence is an operator (assume-guarantee with LogLeadership   *)
(* and W3's Lean model): a new generation fences the store before it reads *)
(* the log, and only the generation equal to `fence` can append.           *)
(*                                                                         *)
(* Switches: Keyed (the owner consults its applied set), Replay (the       *)
(* client re-sends unanswered commands with the same key after a           *)
(* reconnect), CheckCursor (a read whose cursor is ahead of the owner's    *)
(* view is refused and the reader resets to cursor 0, instead of a clamp), *)
(* Floor (after a stale-generation refusal the client never addresses that *)
(* generation again).                                                      *)
(*                                                                         *)
(* The model is untimed: liveness bounds are the Suspect actions, so the   *)
(* timeout table is not an input (RV3-F4). `SeamDeliveryTrace.tla` checks  *)
(* implementation traces against the target switches.                     *)
(***************************************************************************)
\* T6 catchUp refines atomic Read only after final validation. SeamCatchUp
\* models provisional pages, immutable capture and replacement/writer/abort refusal.
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS Keys, MaxGen, Keyed, Replay, CheckCursor, Floor

Gens == 1..MaxGen
Final == {"applied", "replayed", "refused"}

VARIABLES
  log,       \* durable rows <<[g, k]>>
  fence,     \* storage epoch: the only generation whose append is accepted
  up,        \* generations whose process runs (includes zombies)
  hung,      \* running but taking no steps
  everHung,  \* a generation hangs at most once (finitely many hangs)
  view,      \* view[g]: the rows generation g read at claim plus its own appends
  net,       \* messages in flight
  unacked,   \* <<g, k>>: row durable, answer not yet sent
  target,    \* the generation the client's connection addresses (0 = none)
  outbox,    \* keys sent and not yet answered
  done,      \* done[k]: "none", a final status, or "unknown"
  fs,        \* false suspicions so far (the detector is eventually accurate)
  floor,     \* lowest generation the client may address: a stale refusal raises it (SC-R10)
  cursor,    \* the client's read cursor
  proj       \* the rows the client's projection applied, in order

vars == <<log, fence, up, hung, everHung, view, net, unacked,
          target, outbox, done, fs, floor, cursor, proj>>

Cmd(k, g) == [t |-> "cmd", k |-> k, g |-> g]
Ans(k, s, g) == [t |-> "ans", k |-> k, s |-> s, g |-> g]
KeysOf(s) == {s[i].k : i \in DOMAIN s}
Live(g) == g \in up /\ g \notin hung
Known(g, k) == Keyed /\ k \in KeysOf(view[g])

TypeOK ==
  /\ fence \in Gens /\ up \subseteq Gens /\ hung \subseteq up
  /\ target \in 0..MaxGen /\ outbox \subseteq Keys
  /\ done \in [Keys -> Final \cup {"none", "unknown"}]

Init ==
  /\ log = <<>> /\ fence = 1 /\ up = {1} /\ hung = {} /\ everHung = {}
  /\ view = [g \in Gens |-> <<>>] /\ net = {} /\ unacked = {}
  /\ target = 1 /\ outbox = {} /\ done = [k \in Keys |-> "none"]
  /\ fs = 0 /\ floor = 1 /\ cursor = 0 /\ proj = <<>>

--------------------------------------------------------------------------
(* Client *)

Send(k) ==
  /\ target # 0 /\ done[k] = "none" /\ k \notin outbox
  /\ outbox' = outbox \cup {k}
  /\ net' = net \cup {Cmd(k, target)}
  /\ UNCHANGED <<log, fence, up, hung, everHung, view, unacked, target, done, fs, floor, cursor, proj>>

Receive(m) ==
  /\ m \in net /\ m.t = "ans" /\ m.g = target /\ m.k \in outbox
  /\ net' = net \ {m}
  /\ IF m.s = "fenced"
       THEN /\ target' = 0                   \* stale generation: re-address, same key
            /\ floor' = IF Floor THEN m.g + 1 ELSE floor  \* SC-R10
            /\ UNCHANGED <<outbox, done>>
       ELSE /\ outbox' = outbox \ {m.k}
            /\ done' = [done EXCEPT ![m.k] = m.s]
            /\ UNCHANGED <<target, floor>>
  /\ UNCHANGED <<log, fence, up, hung, everHung, view, unacked, fs, cursor, proj>>

Drop(m) ==                                  \* an answer on a dead connection, or a duplicate
  /\ m \in net /\ m.t = "ans" /\ (m.g # target \/ m.k \notin outbox)
  /\ net' = net \ {m}
  /\ UNCHANGED <<log, fence, up, hung, everHung, view, unacked, target, outbox, done, fs, floor, cursor, proj>>

LoseCmd(m) ==                               \* a command on a connection the client left
  /\ m \in net /\ m.t = "cmd" /\ m.g # target
  /\ net' = net \ {m}
  /\ UNCHANGED <<log, fence, up, hung, everHung, view, unacked, target, outbox, done, fs, floor, cursor, proj>>

SuspectDead ==                              \* the liveness bound on the addressed generation
  /\ target # 0 /\ ~Live(target)
  /\ target' = 0
  /\ UNCHANGED <<log, fence, up, hung, everHung, view, net, unacked, outbox, done, fs, floor, cursor, proj>>

SuspectFalsely ==
  /\ target # 0 /\ Live(target) /\ fs = 0
  /\ target' = 0 /\ fs' = 1
  /\ UNCHANGED <<log, fence, up, hung, everHung, view, net, unacked, outbox, done, floor, cursor, proj>>

Connect(g) ==                               \* placement may name a stale generation
  /\ target = 0 /\ Live(g) /\ g >= floor
  /\ target' = g
  /\ IF Replay
       THEN /\ net' = net \cup {Cmd(k, g) : k \in outbox}
            /\ UNCHANGED <<outbox, done>>
       ELSE /\ outbox' = {}                  \* today: only reads are replayed
            /\ done' = [k \in Keys |-> IF k \in outbox THEN "unknown" ELSE done[k]]
            /\ UNCHANGED net
  /\ UNCHANGED <<log, fence, up, hung, everHung, view, unacked, fs, floor, cursor, proj>>

Read ==
  /\ target # 0 /\ Live(target)
  /\ LET v == view[target] IN
       \/ /\ cursor <= Len(v)
          /\ proj' = proj \o SubSeq(v, cursor + 1, Len(v))
          /\ cursor' = Len(v)
          /\ UNCHANGED <<target, floor>>
       \/ /\ cursor > Len(v) /\ CheckCursor
          /\ proj' = <<>> /\ cursor' = 0     \* ef cursor-ahead: reset, reread from 0 (W3 CL-R13)
          /\ UNCHANGED <<target, floor>>
       \/ /\ cursor > Len(v) /\ ~CheckCursor
          /\ cursor' = Len(v)                \* today: the read window clamps silently
          /\ UNCHANGED <<proj, target, floor>>
  /\ UNCHANGED <<log, fence, up, hung, everHung, view, net, unacked, outbox, done, fs>>

--------------------------------------------------------------------------
(* Owner generations *)

Handle(g, m) ==
  /\ m \in net /\ m.t = "cmd" /\ m.g = g /\ Live(g)
  /\ \/ /\ Known(g, m.k)                     \* applied set: answer the original outcome
        /\ net' = (net \ {m}) \cup {Ans(m.k, "replayed", g)}
        /\ UNCHANGED <<log, view, unacked>>
     \/ /\ ~Known(g, m.k) /\ g # fence        \* the store refuses a closed epoch
        /\ net' = (net \ {m}) \cup {Ans(m.k, "fenced", g)}
        /\ UNCHANGED <<log, view, unacked>>
     \/ /\ ~Known(g, m.k) /\ g = fence        \* decide: apply, row stamped with the key
        /\ log' = Append(log, [g |-> g, k |-> m.k])
        /\ view' = [view EXCEPT ![g] = Append(@, [g |-> g, k |-> m.k])]
        /\ unacked' = unacked \cup {<<g, m.k>>}
        /\ net' = net \ {m}
     \/ /\ ~Known(g, m.k) /\ g = fence        \* decide: refuse, no record
        /\ net' = (net \ {m}) \cup {Ans(m.k, "refused", g)}
        /\ UNCHANGED <<log, view, unacked>>
  /\ UNCHANGED <<fence, up, hung, everHung, target, outbox, done, fs, floor, cursor, proj>>

Ack(g, k) ==                                \* answer only after the row is durable (I18)
  /\ <<g, k>> \in unacked /\ Live(g)
  /\ unacked' = unacked \ {<<g, k>>}
  /\ net' = net \cup {Ans(k, "applied", g)}
  /\ UNCHANGED <<log, fence, up, hung, everHung, view, target, outbox, done, fs, floor, cursor, proj>>

Claim(g) ==                                 \* fence first, then read (D5)
  /\ g = fence + 1 /\ g \in Gens
  /\ fence' = g /\ up' = up \cup {g}
  /\ view' = [view EXCEPT ![g] = log]
  /\ UNCHANGED <<log, hung, everHung, net, unacked, target, outbox, done, fs, floor, cursor, proj>>

Crash(g) ==                                 \* the last generation stays up: finitely many failures
  /\ g \in up /\ g < MaxGen
  /\ up' = up \ {g} /\ hung' = hung \ {g}
  /\ net' = {m \in net : m.g # g}
  /\ unacked' = {u \in unacked : u[1] # g}
  /\ UNCHANGED <<log, fence, everHung, view, target, outbox, done, fs, floor, cursor, proj>>

Hang(g) ==
  /\ g \in up /\ g \notin everHung /\ g < MaxGen
  /\ hung' = hung \cup {g} /\ everHung' = everHung \cup {g}
  /\ UNCHANGED <<log, fence, up, view, net, unacked, target, outbox, done, fs, floor, cursor, proj>>

Wake(g) ==
  /\ g \in hung /\ hung' = hung \ {g}
  /\ UNCHANGED <<log, fence, up, everHung, view, net, unacked, target, outbox, done, fs, floor, cursor, proj>>

ClaimAfterDeath == ~Live(fence) /\ \E g \in Gens : Claim(g)
ConnectOwner == Connect(fence)

Next ==
  \/ \E k \in Keys : Send(k)
  \/ \E m \in net : Receive(m) \/ Drop(m) \/ LoseCmd(m)
  \/ SuspectDead \/ SuspectFalsely \/ Read
  \/ \E g \in Gens : Connect(g) \/ Claim(g) \/ Crash(g) \/ Hang(g) \/ Wake(g)
  \/ \E g \in Gens : \E m \in net : Handle(g, m)
  \/ \E g \in Gens, k \in Keys : Ack(g, k)

Fairness ==
  /\ \A g \in Gens : WF_vars(\E m \in net : Handle(g, m))
  /\ \A g \in Gens, k \in Keys : WF_vars(Ack(g, k))
  /\ WF_vars(\E m \in net : Receive(m))
  /\ WF_vars(SuspectDead)
  /\ WF_vars(ClaimAfterDeath)
  /\ WF_vars(ConnectOwner)

Spec == Init /\ [][Next]_vars /\ Fairness

--------------------------------------------------------------------------
(* Properties *)

\* I14 (P, M): a command id yields at most one durable effect.
AtMostOneEffectPerKey ==
  \A k \in Keys : Cardinality({i \in DOMAIN log : log[i].k = k}) <= 1

\* I18 shape: an applied or replayed answer implies the row is durable.
AnswerAfterDurable ==
  \A k \in Keys : done[k] \in {"applied", "replayed"} => k \in KeysOf(log)

\* I4 (P, M): the projection never skips or double-applies a row.
ProjectionIsPrefix ==
  Len(proj) <= Len(log) /\ proj = SubSeq(log, 1, Len(proj))

\* I15 (M): every command is answered, or the client observes the addressed
\* generation dead (its connection ends). Liveness under fairness of live processes.
\* Quiescence: AnsweredOrDead(k).
AnsweredOrDead(k) == k \notin outbox \/ target = 0
AnsweredOrPeerDead ==
  \A k \in Keys : (k \in outbox) ~> AnsweredOrDead(k)

\* Target resolution: with replay by key, every command ends durable or refused.
\* Quiescence: Quiescent, which the trace spec checks on a `done` line (FM-R17).
Quiescent == outbox = {} /\ \A k \in Keys : done[k] # "unknown"
Resolved ==
  \A k \in Keys : (k \in outbox) ~> (done[k] \in Final)

\* Keeps the state space finite: at most three rows and three projected rows.
StateBound == Len(log) <= 3 /\ Len(proj) <= 3
=============================================================================
