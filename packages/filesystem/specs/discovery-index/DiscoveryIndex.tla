--------------------------- MODULE DiscoveryIndex ---------------------------
(***************************************************************************)
(* The discovery index's own protocol: how evidence about one project      *)
(* directory reaches the authority's index, and when a read of the         *)
(* directory may install what it read as clean (project-library fast-path  *)
(* blueprint FW2, index-contract review A2, A4 and A6). `LibraryCatalog`   *)
(* treats "the index learns of a change" as one step; this module is what  *)
(* happens inside that step, between the authority, a sibling tab and an    *)
(* observer, which is a cross-process protocol under formal verification   *)
(* policy rule 1. It lands before `project-directory-index.ts`.            *)
(*                                                                         *)
(* Parties:                                                                *)
(*   disk       each directory's value: what a read of its `tau.json` and  *)
(*              `.tau/project.json` determines                             *)
(*   env        another program or tab changes a directory. The change     *)
(*              sends a fact (an observer record, a sibling notice, a poll *)
(*              diff) once the channel is armed, or, at most `MaxLost`     *)
(*              times, sends none: a tab that died between its write and   *)
(*              its notice, an observer that stopped                       *)
(*   transit    facts sent and not yet applied, a set: delivered in any    *)
(*              order, and up to `MaxRepeats` times twice                  *)
(*   authority  arms its channels, reads dirty directories (a pass, a      *)
(*              probe, an operation's own check), audits clean ones, and   *)
(*              writes directories itself through its provider             *)
(*   index      per directory a value or unknown, an evidence counter and  *)
(*              a dirty flag                                               *)
(*                                                                         *)
(* A reader takes the directory's counter before its first I/O and         *)
(* installs what it read as clean only if the counter has not moved and no *)
(* write of its own is in flight on the directory (A2 f). The value a read *)
(* captures is the disk's when it starts; a change during the read moves   *)
(* the counter once its fact is applied, and is exempt from the safety     *)
(* property while it is in transit. A read that fails (an I/O error other  *)
(* than not-found) installs nothing and is the same as one whose counter   *)
(* moved, so it is not a separate action.                                  *)
(*                                                                         *)
(* Knobs, each a witness of one rule:                                      *)
(*   ClearRule  "versioned" (A2 f), or "unconditional": a read clears the  *)
(*              directory whatever arrived while it ran (F5)               *)
(*   ArmOrder   "arm-first" (A2 e), or "read-first": the first read starts *)
(*              before the channel that would report a change is armed     *)
(*              (F4, the poll's baseline)                                  *)
(*   TapOrder   "before" (A2 a): the provider tap marks the directory when *)
(*              a write is issued and again when it settles, and refuses   *)
(*              an install while it is in flight; or "after": the write is *)
(*              heard only when it settles, as the change bus reports it   *)
(*              (F2, own writes)                                           *)
(*   AuditOn    the audit re-reads clean directories with no evidence (A4) *)
(*   InstallRule "monotone": an install leaves the counter where it is;   *)
(*              "reset": an install puts it back to its floor, so a slower *)
(*              reader that took the old floor installs older bytes (the   *)
(*              review's M1)                                               *)
(*                                                                         *)
(* Several readers may read one directory at once (`Readers`): a pass, a   *)
(* probe, an operation's own check and the audit do not wait for each      *)
(* other.                                                                  *)
(*                                                                         *)
(* Untimed: the poll period, the freshness window, the audit interval and  *)
(* timestamps are below the model. The racy-timestamp guard is checked by  *)
(* the differential test's 2 s granularity fixture instead.                *)
(***************************************************************************)
\* FW2 (2026-11-26): first version, before `packages/filesystem/src/project-directory-index.ts`. Its conformance
\* adapter is the differential test `project-directory-index.differential.test.ts`, which replays generated evidence
\* schedules against the index and checks `CleanIsCurrent` after every step.
\* FW2 acceptance tests (2026-11-26): `project-directory-index.ts` bounds `dirty` by the entries a root holds whether or
\* not its names are listed (A5), and orders its members; the protocol, every action and every verdict are unchanged.
\* D5 boundary (2026-11-26): the index keeps an opaque reading and looks only at its `kind`; the reading types and
\* their manifest vocabulary move back to `project-directories.ts`. Types only: every action and verdict is unchanged.
\* FW2 review M1 (2026-11-26): several readers per directory (`Readers`), and `InstallRule`. The index lowered a
\* directory's counter when it installed, so a slower reader that captured the old counter installed older bytes after
\* a faster reader installed newer ones; `reset-on-install` records that as a witness of `CleanIsCurrent`, and the
\* index now keeps every counter monotone. Every earlier configuration keeps its verdict with two readers.
EXTENDS Naturals, FiniteSets

CONSTANTS Dirs,         \* project directories: the immediate children of one root
          Values,       \* what a read of a directory can determine
          MaxChanges,   \* changes by another program or tab that send a fact
          MaxLost,      \* changes that send none
          MaxWrites,    \* this authority's own writes
          MaxRepeats,   \* facts delivered twice
          ClearRule,    \* "versioned" or "unconditional"
          ArmOrder,     \* "arm-first" or "read-first"
          TapOrder,     \* "before" or "after"
          AuditOn,      \* the audit runs
          Readers,      \* readers that may read one directory at once
          InstallRule   \* "monotone" or "reset"

ASSUME /\ Dirs # {} /\ Cardinality(Values) >= 2
       /\ \A b \in {MaxChanges, MaxLost, MaxWrites, MaxRepeats} : b \in Nat
       /\ ClearRule \in {"versioned", "unconditional"}
       /\ ArmOrder \in {"arm-first", "read-first"}
       /\ TapOrder \in {"before", "after"}
       /\ AuditOn \in BOOLEAN
       /\ Readers # {}
       /\ InstallRule \in {"monotone", "reset"}

Unknown == "unknown"
\* No read in flight. A read is a record either way, so TLC never compares a record with a string.
NoRead == [on |-> FALSE, val |-> Unknown, ver |-> 0]

VARIABLES
  disk,     \* each directory's value on storage
  idx,      \* each directory's value in the index, or Unknown
  ver,      \* each directory's evidence counter
  dirty,    \* directories with evidence since they were read
  transit,  \* facts sent and not yet applied
  reading,  \* each directory's reads in flight, one per reader: the value and counter each captured, or NoRead
  armed,    \* the observer, the notice subscription and the poll baseline are in place
  writing,  \* each directory's own write: "idle", "issued", or "landed" before it settles
  lost,     \* ghost: directories whose last change sent no fact and that no read has repaired; a read repairs it only
            \* when no other read of the directory is in flight, since one that began before the loss may install after
  n         \* bounds

vars == <<disk, idx, ver, dirty, transit, reading, armed, writing, lost, n>>

Init ==
  /\ disk \in [Dirs -> Values]
  /\ idx = [d \in Dirs |-> Unknown]
  /\ ver = [d \in Dirs |-> 0]
  /\ dirty = Dirs
  /\ transit = {}
  /\ reading = [d \in Dirs |-> [r \in Readers |-> NoRead]]
  /\ armed = FALSE
  /\ writing = [d \in Dirs |-> "idle"]
  /\ lost = {}
  /\ n = [change |-> 0, lost |-> 0, write |-> 0, repeat |-> 0]

\* Evidence about d: its counter moves and it is dirty.
Mark(d) == /\ ver' = [ver EXCEPT ![d] = @ + 1]
           /\ dirty' = dirty \cup {d}

-----------------------------------------------------------------------------
(* The environment *)

\* Another program or tab changes d. Once the channel is armed the change sends a fact.
Change(d) ==
  /\ n.change < MaxChanges
  /\ n' = [n EXCEPT !.change = @ + 1]
  /\ \E v \in Values \ {disk[d]} : disk' = [disk EXCEPT ![d] = v]
  /\ transit' = IF armed THEN transit \cup {d} ELSE transit
  /\ UNCHANGED <<idx, ver, dirty, reading, armed, writing, lost>>

\* A change whose fact is lost.
ChangeLost(d) ==
  /\ n.lost < MaxLost
  /\ n' = [n EXCEPT !.lost = @ + 1]
  /\ \E v \in Values \ {disk[d]} : disk' = [disk EXCEPT ![d] = v]
  /\ lost' = lost \cup {d}
  /\ UNCHANGED <<idx, ver, dirty, transit, reading, armed, writing>>

\* A fact is applied: d is marked. It may stay in transit and be applied again.
Deliver(d) ==
  /\ d \in transit
  /\ Mark(d)
  /\ \/ /\ transit' = transit \ {d}
        /\ n' = n
     \/ /\ n.repeat < MaxRepeats
        /\ transit' = transit
        /\ n' = [n EXCEPT !.repeat = @ + 1]
  /\ UNCHANGED <<disk, idx, reading, armed, writing, lost>>

-----------------------------------------------------------------------------
(* The authority *)

\* The root's observer, the notice subscription and the poll baseline are put in place.
Arm ==
  /\ ~armed
  /\ armed' = TRUE
  /\ UNCHANGED <<disk, idx, ver, dirty, transit, reading, writing, lost, n>>

CanRead(d, r) == /\ armed \/ ArmOrder = "read-first"
                 /\ ~reading[d][r].on

Capture(d, r) == reading' = [reading EXCEPT ![d][r] = [on |-> TRUE, val |-> disk[d], ver |-> ver[d]]]

\* A read of a directory with evidence: a pass, a probe, an operation's own check.
ReadStart(d, r) ==
  /\ CanRead(d, r)
  /\ d \in dirty
  /\ Capture(d, r)
  /\ UNCHANGED <<disk, idx, ver, dirty, transit, armed, writing, lost, n>>

\* The audit: a read of a clean directory that no evidence asked for (A4).
Audit(d, r) ==
  /\ AuditOn
  /\ CanRead(d, r)
  /\ d \notin dirty
  /\ Capture(d, r)
  /\ UNCHANGED <<disk, idx, ver, dirty, transit, armed, writing, lost, n>>

\* What the read captured is installed as clean only under the clear rule. A tap that hears a write only when it
\* settles cannot know that one is in flight.
Installs(d, r) ==
  \/ ClearRule = "unconditional"
  \/ /\ reading[d][r].ver = ver[d]
     /\ TapOrder = "after" \/ writing[d] = "idle"

\* An install leaves the counter where it is; the "reset" rule puts it back to its floor, 0.
ReadEnd(d, r) ==
  /\ reading[d][r].on
  /\ IF Installs(d, r)
       THEN /\ idx' = [idx EXCEPT ![d] = reading[d][r].val]
            /\ dirty' = dirty \ {d}
            /\ lost' = IF reading[d][r].val = disk[d] /\ \A o \in Readers \ {r} : ~reading[d][o].on
                        THEN lost \ {d} ELSE lost
            /\ ver' = IF InstallRule = "reset" THEN [ver EXCEPT ![d] = 0] ELSE ver
       ELSE UNCHANGED <<idx, dirty, lost, ver>>
  /\ reading' = [reading EXCEPT ![d][r] = NoRead]
  /\ UNCHANGED <<disk, transit, armed, writing, n>>

\* This authority writes d through the provider the registry hands out. "before": the tap marks d before the call is
\* issued; "after": nothing hears it yet.
WriteIssued(d) ==
  /\ n.write < MaxWrites
  /\ writing[d] = "idle"
  /\ n' = [n EXCEPT !.write = @ + 1]
  /\ writing' = [writing EXCEPT ![d] = "issued"]
  /\ IF TapOrder = "before" THEN Mark(d) ELSE UNCHANGED <<ver, dirty>>
  /\ UNCHANGED <<disk, idx, transit, reading, armed, lost>>

\* The bytes land, at some moment inside the call.
WriteLanded(d) ==
  /\ writing[d] = "issued"
  /\ \E v \in Values \ {disk[d]} : disk' = [disk EXCEPT ![d] = v]
  /\ writing' = [writing EXCEPT ![d] = "landed"]
  /\ UNCHANGED <<idx, ver, dirty, transit, reading, armed, lost, n>>

\* The call settles and the tap marks d.
WriteSettled(d) ==
  /\ writing[d] = "landed"
  /\ writing' = [writing EXCEPT ![d] = "idle"]
  /\ Mark(d)
  /\ UNCHANGED <<disk, idx, transit, reading, armed, lost, n>>

-----------------------------------------------------------------------------

EnvNext == \E d \in Dirs : Change(d) \/ ChangeLost(d) \/ Deliver(d)

AuthorityNext ==
  \/ Arm
  \/ \E d \in Dirs, r \in Readers : ReadStart(d, r) \/ Audit(d, r) \/ ReadEnd(d, r)
  \/ \E d \in Dirs : \/ WriteIssued(d) \/ WriteLanded(d) \/ WriteSettled(d)

Next == EnvNext \/ AuthorityNext

Spec == Init /\ [][Next]_vars

\* The authority's actions and the delivery of a fact already sent are fair; the environment's changes and the
\* person's writes are not.
Fairness ==
  /\ WF_vars(Arm)
  /\ \A d \in Dirs : /\ WF_vars(Deliver(d))
                     /\ \A r \in Readers : WF_vars(ReadStart(d, r)) /\ WF_vars(Audit(d, r)) /\ WF_vars(ReadEnd(d, r))
                     /\ WF_vars(WriteLanded(d)) /\ WF_vars(WriteSettled(d))

LiveSpec == Spec /\ Fairness

-----------------------------------------------------------------------------
(* Properties *)

TypeOK ==
  /\ disk \in [Dirs -> Values]
  /\ idx \in [Dirs -> Values \cup {Unknown}]
  /\ ver \in [Dirs -> Nat]
  /\ dirty \subseteq Dirs /\ transit \subseteq Dirs /\ lost \subseteq Dirs
  /\ \A d \in Dirs, r \in Readers :
       reading[d][r] = NoRead \/ (reading[d][r].on /\ reading[d][r].val \in Values /\ reading[d][r].ver \in Nat)
  /\ armed \in BOOLEAN
  /\ writing \in [Dirs -> {"idle", "issued", "landed"}]

\* S12, first half (index-contract review A2). A directory that is not dirty, not being read, has no fact in transit
\* and whose last change was not lost holds in the index what storage holds.
CleanIsCurrent ==
  \A d \in Dirs : (d \notin dirty /\ (\A r \in Readers : ~reading[d][r].on) /\ d \notin transit /\ d \notin lost)
                   => idx[d] = disk[d]

\* S12, second half (A4). Under weak fairness of delivery, the reads and the audit, once the bounded environment is
\* quiet the index comes to hold storage, a lost fact included. Quiescence: `Quiescent`.
\* `lost` is a safety exemption and not part of quiescence: overlapping audits may keep a read in flight for ever, while
\* every read after the environment falls quiet captures what the disk holds.
Quiescent == dirty = {} /\ transit = {}
EventuallyCurrent == <>[](Quiescent /\ \A d \in Dirs : idx[d] = disk[d])

=============================================================================
