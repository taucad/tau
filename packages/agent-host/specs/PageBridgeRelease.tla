---------------------------- MODULE PageBridgeRelease ----------------------------
(***************************************************************************)
(* I31 on the resident worker's control channel (W6 T3, RH-R4, RV3-F1),    *)
(* as implemented: the page mints each host incarnation's hostId, and the  *)
(* page's control calls reach the worker in order (one channel). One       *)
(* project P.                                                              *)
(*                                                                         *)
(*   page    provide{h, b} opens bridge b for a new incarnation h when P   *)
(*           has none; release{h} names the incarnation on the last        *)
(*           client's close, sent once its provide answered (the page      *)
(*           forgets h first, so a new client's provide may overtake it);  *)
(*           rebridge{h, b} gives an open incarnation a fresh bridge. It   *)
(*           disposes a bridge only on an answer: `replaced` (the old     *)
(*           host's), `failed` (the failed host's), `released`,            *)
(*           `rebridged` (the swapped-out one) and `needs` (the fresh one).*)
(*   worker  runs one call per project at a time. A provide opens h and    *)
(*           answers `replaced` synchronously, after closing the host it   *)
(*           replaced; a failed open leaves the previous host registered.  *)
(*           A release closes the registered host only if it is h. A       *)
(*           rebridge swaps bridges into h if h is registered, else closes *)
(*           the fresh port and answers `needs`; it never opens a host.    *)
(*                                                                         *)
(* Knobs (both TRUE is the implementation):                                *)
(*   CheckHost  a release closes only the host it names (I31)              *)
(*   Restore    a failed open leaves the previous host registered          *)
(*              (W6.r1 finding 8)                                          *)
(*                                                                         *)
(* A connect is not modelled: it opens no bridge, and the worker answers   *)
(* `needs` for any host that is not registered.                            *)
(***************************************************************************)
EXTENDS Naturals, Sequences

CONSTANTS MaxHosts, MaxBridges, CheckHost, Restore

VARIABLES
    reg,       \* the worker's registered host for P, or 0
    hstate,    \* host -> "unused" | "open" | "failed" | "closed"
    wb,        \* host -> the bridge the worker has it use (0 = none)
    closedBy,  \* host -> the host a release named when it closed that host (0 = not by a release)
    retired,   \* bridge -> the worker stopped using it, or never took it
    toWorker,  \* page -> worker calls, in order: [t, h, b]
    toPage,    \* worker -> page answers, in order: [t, h, r, b]
    owner,     \* bridge -> the host the page opened it for (0 = unused)
    disposed,  \* bridge -> the page disposed it, or the worker closed its port
    pb,        \* host -> the bridge the page holds for it
    pans,      \* host -> "none" | "ok" | "failed": the page's view of its provide
    pcur,      \* the incarnation the page's clients use now, or 0
    rel,       \* incarnations whose release the page began but has not sent
    nextH, nextB

vars == <<reg, hstate, wb, closedBy, retired, toWorker, toPage, owner, disposed, pb, pans, pcur, rel, nextH, nextB>>

Hosts == 1..MaxHosts
Bs == 1..MaxBridges

Init ==
    /\ reg = 0 /\ hstate = [h \in Hosts |-> "unused"] /\ wb = [h \in Hosts |-> 0]
    /\ closedBy = [h \in Hosts |-> 0] /\ retired = [b \in Bs |-> FALSE]
    /\ toWorker = <<>> /\ toPage = <<>>
    /\ owner = [b \in Bs |-> 0] /\ disposed = [b \in Bs |-> FALSE]
    /\ pb = [h \in Hosts |-> 0] /\ pans = [h \in Hosts |-> "none"]
    /\ pcur = 0 /\ rel = {} /\ nextH = 1 /\ nextB = 1

Answer(t, h, r, b) == Append(toPage, [t |-> t, h |-> h, r |-> r, b |-> b])

\* ---------------- page ----------------
PProvide ==   \* a client of P needs a host and the page has none
    /\ pcur = 0 /\ nextH <= MaxHosts /\ nextB <= MaxBridges
    /\ owner' = [owner EXCEPT ![nextB] = nextH] /\ pb' = [pb EXCEPT ![nextH] = nextB]
    /\ toWorker' = Append(toWorker, [t |-> "provide", h |-> nextH, b |-> nextB])
    /\ pcur' = nextH /\ nextH' = nextH + 1 /\ nextB' = nextB + 1
    /\ UNCHANGED <<reg, hstate, wb, closedBy, retired, toPage, disposed, pans, rel>>

PReleaseStart ==   \* the last client closed: the page forgets the incarnation first
    /\ pcur # 0
    /\ rel' = rel \cup {pcur} /\ pcur' = 0
    /\ UNCHANGED <<reg, hstate, wb, closedBy, retired, toWorker, toPage, owner, disposed, pb, pans, nextH, nextB>>

PReleaseSend(h) ==   \* once the provide answered; a failed provide has nothing to release
    /\ h \in rel /\ pans[h] # "none"
    /\ rel' = rel \ {h}
    /\ toWorker' = IF pans[h] = "ok" THEN Append(toWorker, [t |-> "release", h |-> h, b |-> 0]) ELSE toWorker
    /\ UNCHANGED <<reg, hstate, wb, closedBy, retired, toPage, owner, disposed, pb, pans, pcur, nextH, nextB>>

PRebridge(h) ==   \* a file-manager restart: any incarnation the page saw open (a superset of the snapshot it takes)
    /\ pans[h] = "ok" /\ nextB <= MaxBridges
    /\ owner' = [owner EXCEPT ![nextB] = h]
    /\ toWorker' = Append(toWorker, [t |-> "rebridge", h |-> h, b |-> nextB])
    /\ nextB' = nextB + 1
    /\ UNCHANGED <<reg, hstate, wb, closedBy, retired, toPage, disposed, pb, pans, pcur, rel, nextH>>

PAnswer ==
    /\ toPage # <<>>
    /\ LET m == Head(toPage) IN
         CASE m.t = "provided" ->
                /\ pans' = [pans EXCEPT ![m.h] = "ok"]
                /\ disposed' = IF m.r # 0 THEN [disposed EXCEPT ![pb[m.r]] = TRUE] ELSE disposed
                /\ UNCHANGED <<pb, pcur>>
           [] m.t = "failed" ->
                /\ pans' = [pans EXCEPT ![m.h] = "failed"]
                /\ disposed' = [disposed EXCEPT ![pb[m.h]] = TRUE]
                /\ pcur' = IF pcur = m.h THEN 0 ELSE pcur
                /\ UNCHANGED pb
           [] m.t = "released" ->
                /\ disposed' = [disposed EXCEPT ![pb[m.h]] = TRUE]
                /\ UNCHANGED <<pb, pans, pcur>>
           [] m.t = "rebridged" ->
                /\ disposed' = [disposed EXCEPT ![pb[m.h]] = TRUE]
                /\ pb' = [pb EXCEPT ![m.h] = m.b]
                /\ UNCHANGED <<pans, pcur>>
           [] OTHER ->   \* needs
                /\ disposed' = [disposed EXCEPT ![m.b] = TRUE]
                /\ UNCHANGED <<pb, pans, pcur>>
    /\ toPage' = Tail(toPage)
    /\ UNCHANGED <<reg, hstate, wb, closedBy, retired, toWorker, owner, rel, nextH, nextB>>

\* ---------------- worker: one call at a time ----------------
WProvide(ok) ==
    /\ toWorker # <<>> /\ Head(toWorker).t = "provide"
    /\ LET m == Head(toWorker) IN
         IF ok
         THEN /\ hstate' = [k \in Hosts |->
                              IF k = m.h THEN "open"
                              ELSE IF k = reg THEN "closed" ELSE hstate[k]]
              /\ wb' = [wb EXCEPT ![m.h] = m.b]
              /\ retired' = IF reg # 0 THEN [retired EXCEPT ![wb[reg]] = TRUE] ELSE retired
              /\ reg' = m.h
              /\ toPage' = Answer("provided", m.h, reg, 0)
         ELSE /\ hstate' = [hstate EXCEPT ![m.h] = "failed"]
              /\ retired' = [retired EXCEPT ![m.b] = TRUE]
              /\ reg' = IF Restore THEN reg ELSE 0
              /\ toPage' = Answer("failed", m.h, 0, 0)
              /\ UNCHANGED wb
    /\ toWorker' = Tail(toWorker)
    /\ UNCHANGED <<closedBy, owner, disposed, pb, pans, pcur, rel, nextH, nextB>>

WRelease ==
    /\ toWorker # <<>> /\ Head(toWorker).t = "release"
    /\ LET m == Head(toWorker)
           target == IF CheckHost THEN (IF reg = m.h THEN reg ELSE 0) ELSE reg
       IN /\ hstate' = IF target # 0 THEN [hstate EXCEPT ![target] = "closed"] ELSE hstate
          /\ closedBy' = IF target # 0 THEN [closedBy EXCEPT ![target] = m.h] ELSE closedBy
          /\ retired' = IF target # 0 THEN [retired EXCEPT ![wb[target]] = TRUE] ELSE retired
          /\ reg' = IF target # 0 THEN 0 ELSE reg
          /\ toPage' = Answer("released", m.h, 0, 0)
    /\ toWorker' = Tail(toWorker)
    /\ UNCHANGED <<wb, owner, disposed, pb, pans, pcur, rel, nextH, nextB>>

WRebridge ==
    /\ toWorker # <<>> /\ Head(toWorker).t = "rebridge"
    /\ LET m == Head(toWorker) IN
         IF reg = m.h
         THEN /\ wb' = [wb EXCEPT ![m.h] = m.b]
              /\ retired' = [retired EXCEPT ![wb[m.h]] = TRUE]
              /\ toPage' = Answer("rebridged", m.h, 0, m.b)
              /\ UNCHANGED disposed
         ELSE /\ retired' = [retired EXCEPT ![m.b] = TRUE]
              /\ disposed' = [disposed EXCEPT ![m.b] = TRUE]
              /\ toPage' = Answer("needs", m.h, 0, m.b)
              /\ UNCHANGED wb
    /\ toWorker' = Tail(toWorker)
    /\ UNCHANGED <<reg, hstate, closedBy, owner, pb, pans, pcur, rel, nextH, nextB>>

Next ==
    \/ PProvide \/ PReleaseStart \/ PAnswer
    \/ \E h \in Hosts : PReleaseSend(h) \/ PRebridge(h)
    \/ WProvide(TRUE) \/ WProvide(FALSE) \/ WRelease \/ WRebridge

Spec == Init /\ [][Next]_vars
LiveSpec == Spec /\ WF_vars(PAnswer) /\ WF_vars(WProvide(TRUE) \/ WProvide(FALSE)) /\ WF_vars(WRelease)
                 /\ WF_vars(WRebridge) /\ \A h \in Hosts : WF_vars(PReleaseSend(h))

\* ---------------- properties ----------------
\* No open host uses a bridge that was disposed.
NoLiveHostHoldsDeadBridge == \A h \in Hosts : hstate[h] = "open" => ~disposed[wb[h]]
\* A release never closes a host other than the one it names, such as a newer incarnation (I31).
ReleaseClosesOnlyItsHost == \A h \in Hosts : closedBy[h] \in {0, h}
\* Every open host is the registered one: none is left open with no way to close it (finding 8).
NoOrphanHost == \A h \in Hosts : hstate[h] = "open" => reg = h
\* Nothing leaks: a bridge the worker stopped using is eventually disposed.
NoLeak == \A b \in Bs : retired[b] ~> disposed[b]
=====================================================================================
