------------------------- MODULE ProjectDeletion -------------------------
(* CPD-01: DB intent, manifest CAS, logical response, retained-byte purge. *)
(* Two previously admitted writers, one publication writer, and one crash. *)
(* SharedRefs includes one independently live fork's reference. Local and *)
(* neighbor bytes are outside the deletion capability and never mutated. *)
EXTENDS Naturals, FiniteSets
CONSTANTS Feature, FenceWrites, FreshDatabase, AtomicRelease, KeepFence, ReserveId
VARIABLES s, leases, finished
vars == <<s, leases, finished>>
Writers == {1, 2}
Init ==
  /\ s = [requested |-> FALSE, intent |-> FALSE, fenced |-> FALSE,
           complete |-> FALSE, due |-> FALSE, purged |-> FALSE,
           manifestLive |-> TRUE, registryLive |-> TRUE, publicationLive |-> TRUE,
           generation |-> 1, databaseReady |-> FALSE,
           sharedRefs |-> 2, released |-> FALSE, releasePhase |-> 0,
           up |-> TRUE, crashes |-> 1, localBytes |-> TRUE, neighborBytes |-> TRUE]
  /\ leases = [w \in Writers |-> 0]
  /\ finished = {}
Request == /\ ~s.requested /\ s' = [s EXCEPT !.requested = TRUE]
           /\ UNCHANGED <<leases, finished>>
Admit == /\ Feature /\ s.up /\ s.requested /\ ~s.intent
         /\ s' = [s EXCEPT !.intent = TRUE, !.registryLive = FALSE, !.publicationLive = FALSE]
         /\ UNCHANGED <<leases, finished>>
Acquire(w) == /\ ~s.intent /\ leases[w] = 0 /\ w \notin finished
              /\ leases' = [leases EXCEPT ![w] = s.generation]
              /\ UNCHANGED <<s, finished>>
Push(w) == /\ s.up /\ leases[w] > 0 /\ w \notin finished
           /\ (~FenceWrites \/ (~s.fenced /\ leases[w] = s.generation))
           /\ s' = [s EXCEPT !.generation = @ + 1, !.manifestLive = TRUE]
           /\ finished' = finished \cup {w}
           /\ UNCHANGED leases
Reject(w) == /\ leases[w] > 0 /\ w \notin finished
             /\ FenceWrites /\ (s.fenced \/ leases[w] # s.generation)
             /\ finished' = finished \cup {w}
             /\ UNCHANGED <<s, leases>>
ReadDatabase == /\ ~s.intent /\ ~s.databaseReady
                /\ s' = [s EXCEPT !.databaseReady = TRUE]
                /\ UNCHANGED <<leases, finished>>
Publish == /\ s.up /\ s.databaseReady /\ (~FreshDatabase \/ ~s.intent)
           /\ s' = [s EXCEPT !.publicationLive = TRUE, !.databaseReady = FALSE]
           /\ UNCHANGED <<leases, finished>>
Fence == /\ s.up /\ s.intent /\ ~s.fenced /\ ~s.purged
         /\ s' = [s EXCEPT !.fenced = TRUE, !.manifestLive = FALSE, !.generation = @ + 1]
         /\ UNCHANGED <<leases, finished>>
Complete == /\ s.up /\ s.intent /\ s.fenced /\ ~s.complete
            /\ s' = [s EXCEPT !.complete = TRUE]
            /\ UNCHANGED <<leases, finished>>
Due == /\ s.complete /\ ~s.due /\ s' = [s EXCEPT !.due = TRUE]
       /\ UNCHANGED <<leases, finished>>
Release == /\ s.up /\ s.complete /\ s.due /\ ~s.released /\ s.releasePhase = 0
           /\ s.sharedRefs > 0
           /\ s' = [s EXCEPT !.sharedRefs = @ - 1,
                            !.released = AtomicRelease,
                            !.releasePhase = IF AtomicRelease THEN 0 ELSE 1]
           /\ UNCHANGED <<leases, finished>>
FinishRelease == /\ s.up /\ s.releasePhase = 1
                 /\ s' = [s EXCEPT !.released = TRUE, !.releasePhase = 0]
                 /\ UNCHANGED <<leases, finished>>
Purge == /\ s.up /\ s.complete /\ s.due /\ s.released /\ ~s.purged
         /\ s' = [s EXCEPT !.purged = TRUE, !.fenced = KeepFence,
                          !.generation = @ + 1, !.manifestLive = FALSE]
         /\ UNCHANGED <<leases, finished>>
ReRegister == /\ s.up /\ s.purged /\ ~ReserveId /\ ~s.fenced /\ ~s.registryLive
              /\ s' = [s EXCEPT !.registryLive = TRUE, !.manifestLive = TRUE]
              /\ UNCHANGED <<leases, finished>>
Crash == /\ s.up /\ s.crashes > 0
         /\ s' = [s EXCEPT !.up = FALSE, !.crashes = @ - 1, !.releasePhase = 0]
         /\ UNCHANGED <<leases, finished>>
Recover == /\ ~s.up /\ s' = [s EXCEPT !.up = TRUE]
           /\ UNCHANGED <<leases, finished>>
Next == Request \/ Admit \/ ReadDatabase \/ Publish \/ Fence \/ Complete \/ Due
        \/ Release \/ FinishRelease \/ Purge \/ ReRegister \/ Crash \/ Recover
        \/ (\E w \in Writers: Acquire(w) \/ Push(w) \/ Reject(w))
Spec == Init /\ [][Next]_vars
        /\ WF_vars(Admit) /\ WF_vars(Fence) /\ WF_vars(Complete)
        /\ WF_vars(Due) /\ WF_vars(Release) /\ WF_vars(FinishRelease)
        /\ WF_vars(Purge) /\ WF_vars(Recover)
TypeOK == /\ s.sharedRefs \in 0..2 /\ s.generation \in 1..5
          /\ s.crashes \in 0..1 /\ finished \subseteq Writers
          /\ leases \in [Writers -> 0..5]
CompletionFenced == s.complete => (s.fenced /\ ~s.manifestLive /\ ~s.registryLive)
NoResurrection == s.complete => (~s.registryLive /\ ~s.manifestLive)
NoPostIntentPublication == s.intent => ~s.publicationLive
SharedForkSurvives == s.sharedRefs >= 1
LocalAndNeighborsSurvive == s.localBytes /\ s.neighborBytes
RetentionRespected == s.purged => (s.complete /\ s.due /\ s.released)
ReleaseExactlyOnce == s.released => s.sharedRefs = 1
Quiescent == s.complete /\ s.purged /\ s.released
DeletionSettles == s.requested ~> Quiescent
=============================================================================
