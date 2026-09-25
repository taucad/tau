---- MODULE AttachGeneration ----
\* I31: desktop agent-host attach generations (L6; promoted by W1, owned by W0.11 then W6).
\* One project root, two Electron processes:
\*   main    - apps/desktop/src/main/services-broker.ts: retainAgentHost bumps the per-root
\*             generation, connect copies it into the agent-host concern, releaseAgentHost
\*             posts agent-host-release{generation}, waits with a deadline, then deletes it.
\*   utility - apps/desktop/src/tau/services-host.impl.ts: connect records the generation and
\*             reuses the root's launcher; release checks the generation, awaits close(),
\*             re-checks and deletes, in an async block while later frames are handled.
\* Switches for W0.11's fix: FixMain keeps the per-root generation monotone (MainFinish never
\* deletes it); FixUtil defers a connect that arrives while a release is closing. Both FALSE is
\* L6's as-built model (N2: reuse of a closing launcher; N3: a stale release after the deadline).
\* Ghost variables (epoch, lEp, boundEp, bad, served) only observe; they never gate behaviour.
EXTENDS Naturals, Sequences

CONSTANTS Ids, MaxGen, MaxEpoch, MaxL, MaxMsgs, Deadline, FixMain, FixUtil

VARIABLES gen, holders, rel, replied, epoch, connected, msgs,
          lGen, lEp, launcher, lstate, boundEp, nextL, upc, uRel, bad, served
vars == <<gen, holders, rel, replied, epoch, connected, msgs,
          lGen, lEp, launcher, lstate, boundEp, nextL, upc, uRel, bad, served>>

Ls == 1..MaxL
NoRel == [active |-> FALSE, g |-> 0, ep |-> 0]

Init == /\ gen = 0 /\ holders = {} /\ rel = NoRel /\ replied = FALSE
        /\ epoch = 0 /\ connected = {} /\ msgs = << >>
        /\ lGen = 0 /\ lEp = 0 /\ launcher = 0
        /\ lstate = [l \in Ls |-> "unused"] /\ boundEp = [l \in Ls |-> 0] /\ nextL = 1
        /\ upc = "idle" /\ uRel = [g |-> 0, ep |-> 0, L |-> 0] /\ bad = "none"
        /\ served = {}

UtilVars == <<lGen, lEp, launcher, lstate, boundEp, nextL, upc, uRel, served>>

\* ---------------- main process ----------------
Retain(a) == /\ gen < MaxGen /\ epoch < MaxEpoch
             /\ (a \notin holders \/ rel.active)
             /\ gen' = gen + 1
             /\ epoch' = IF holders = {} THEN epoch + 1 ELSE epoch
             /\ holders' = holders \cup {a}
             /\ UNCHANGED <<rel, replied, connected, msgs, bad>> /\ UNCHANGED UtilVars

Connect == /\ holders # {} /\ epoch \notin connected /\ Len(msgs) < MaxMsgs
           /\ msgs' = Append(msgs, [type |-> "connect", g |-> gen, ep |-> epoch])
           /\ connected' = connected \cup {epoch}
           /\ UNCHANGED <<gen, holders, rel, replied, epoch, bad>> /\ UNCHANGED UtilVars

Release(a) == /\ a \in holders /\ ~rel.active /\ Len(msgs) < MaxMsgs
              /\ holders' = holders \ {a}
              /\ IF holders' = {}
                   THEN /\ rel' = [active |-> TRUE, g |-> gen, ep |-> epoch]
                        /\ msgs' = Append(msgs, [type |-> "release", g |-> gen, ep |-> epoch])
                        /\ replied' = FALSE
                   ELSE UNCHANGED <<rel, msgs, replied>>
              /\ UNCHANGED <<gen, epoch, connected, bad>> /\ UNCHANGED UtilVars

MainFinish == /\ rel.active /\ (replied \/ Deadline)
              /\ gen' = IF ~FixMain /\ gen = rel.g THEN 0 ELSE gen
              /\ rel' = NoRel /\ replied' = FALSE
              /\ UNCHANGED <<holders, epoch, connected, msgs, bad>> /\ UNCHANGED UtilVars

\* ---------------- services utility ----------------
UConnect == /\ msgs # << >> /\ Head(msgs).type = "connect"
            /\ FixUtil => upc = "idle"
            /\ LET m == Head(msgs) IN
               /\ msgs' = Tail(msgs)
               /\ lGen' = IF m.g > 0 THEN m.g ELSE lGen
               /\ lEp' = m.ep
               /\ IF launcher # 0
                    THEN /\ UNCHANGED <<launcher, lstate, nextL>>
                         /\ boundEp' = [boundEp EXCEPT ![launcher] = m.ep]
                         /\ bad' = IF lstate[launcher] # "open" THEN "reuse-closing" ELSE bad
                         /\ served' = IF lstate[launcher] = "open" THEN served \cup {m.ep} ELSE served
                    ELSE /\ nextL <= MaxL
                         /\ launcher' = nextL /\ nextL' = nextL + 1
                         /\ lstate' = [lstate EXCEPT ![nextL] = "open"]
                         /\ boundEp' = [boundEp EXCEPT ![nextL] = m.ep]
                         /\ served' = served \cup {m.ep}
                         /\ UNCHANGED bad
            /\ UNCHANGED <<gen, holders, rel, replied, epoch, connected, upc, uRel>>

URelStart == /\ msgs # << >> /\ Head(msgs).type = "release" /\ upc = "idle"
             /\ LET m == Head(msgs) IN
                /\ msgs' = Tail(msgs)
                /\ IF lGen # m.g
                     THEN /\ replied' = TRUE
                          /\ UNCHANGED <<upc, uRel, lstate, bad>>
                     ELSE /\ uRel' = [g |-> m.g, ep |-> m.ep, L |-> launcher]
                          /\ lstate' = IF launcher # 0 THEN [lstate EXCEPT ![launcher] = "closing"] ELSE lstate
                          /\ upc' = "closing"
                          /\ bad' = IF m.ep # lEp THEN "aba-start" ELSE bad
                          /\ UNCHANGED replied
             /\ UNCHANGED <<gen, holders, rel, epoch, connected, lGen, lEp, launcher, boundEp, nextL, served>>

UCloseDone == /\ upc = "closing"
              /\ lstate' = IF uRel.L # 0 THEN [lstate EXCEPT ![uRel.L] = "closed"] ELSE lstate
              /\ upc' = "check"
              /\ UNCHANGED <<gen, holders, rel, replied, epoch, connected, msgs, bad,
                             lGen, lEp, launcher, boundEp, nextL, uRel, served>>

UCheck == /\ upc = "check"
          /\ upc' = "idle" /\ replied' = TRUE
          /\ IF lGen # uRel.g \/ (uRel.L # 0 /\ launcher # uRel.L)
               THEN UNCHANGED <<launcher, lGen, bad>>
               ELSE /\ launcher' = 0 /\ lGen' = 0
                    /\ bad' = IF uRel.ep # lEp THEN "aba-delete" ELSE bad
          /\ UNCHANGED <<gen, holders, rel, epoch, connected, msgs, lEp, lstate, boundEp, nextL, uRel, served>>

Next == \/ \E a \in Ids : Retain(a) \/ Release(a)
        \/ Connect \/ MainFinish
        \/ UConnect \/ URelStart \/ UCloseDone \/ UCheck
Spec == Init /\ [][Next]_vars
LiveSpec == Spec /\ WF_vars(MainFinish) /\ WF_vars(UConnect) /\ WF_vars(URelStart)
                 /\ WF_vars(UCloseDone) /\ WF_vars(UCheck)

NoReuseOfClosingLauncher == bad # "reuse-closing"
NoStaleReleaseAcceptedAtStart == bad # "aba-start"
NoStaleReleaseDeletesNewEpoch == bad # "aba-delete"
ConnectServed == \A e \in 1..MaxEpoch : (e \in connected) ~> (e \in served)
====
