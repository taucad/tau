----------------------------- MODULE LiveOverlay -----------------------------
(***************************************************************************)
(* One watched run's presented chunk stream: the durable rows and the live *)
(* preview merged into the one stream the AI SDK reduces.                  *)
(*                                                                         *)
(* `SeamDelivery.tla` proves the projection applies durable rows as a      *)
(* prefix of the log (`ProjectionIsPrefix`). It does not model the second  *)
(* subscription: live deltas travel on their own channel and the overlay   *)
(* appends both to one stream. The host makes every tool result of a step  *)
(* durable before the next model request starts, but the page observes the *)
(* two channels independently, so the next step's live reasoning can be    *)
(* presented before those results are read.                                *)
(*                                                                         *)
(* A durable tool result closes its step: it projects as an output chunk,  *)
(* then `finish-step` and `start-step`. The SDK reducer forgets its active *)
(* text and reasoning parts on `finish-step` without closing them, and     *)
(* rejects the next delta of a forgotten part; the watch stream then       *)
(* errors and later tool results never reach the page, so their calls keep *)
(* spinning until something re-materializes the transcript.                *)
(*                                                                         *)
(* Switch: GuardBoundary (a durable row presents no step boundary while a  *)
(* live text or reasoning block is open; the paused lifecycle row already  *)
(* keeps that rule). FALSE is the as-built projection.                     *)
(*                                                                         *)
(* Correspondence:                                                         *)
(*   FoldOutput   `foldLiveRow` -> `projectAgentHostEvent` `tool-output`   *)
(*   LiveStart/LiveDelta/LiveEnd  `reduceChatProjection` `live` event ->   *)
(*                `projectAgentHostLiveEvent` `thinking-*`                 *)
(*   Present      `selectTranscript` -> `reduceChunks` of the projection  *)
(*                                                                         *)
(* Frame clock (chat performance WP-06 step 5). Readers of the projection  *)
(* (the transcript selectors, the sidebar) see `vis`, the state as of the  *)
(* last publish. Switch: FrameClock. TRUE, a change that touches only the  *)
(* live preview is published from the next animation frame, and a durable *)
(* row publishes at once together with any live change still waiting.     *)
(* FALSE is the as-built store, which wakes readers on every live event.   *)
(*   Frame        `ChatSessionStore` `#projectionOf` frame callback        *)
(*   wakes        projection topic emits since the last frame              *)
(***************************************************************************)
EXTENDS Naturals, Sequences

CONSTANTS Tools,         \* the step's tool calls, each with one durable result
          Deltas,        \* how many live reasoning deltas the next step streams
          GuardBoundary,
          FrameClock     \* live-only changes publish once per animation frame

VARIABLES
  folded,   \* tool results the projection has folded from durable reads
  live,     \* the next step's live block: "none", "open" or "closed"
  sent,     \* live deltas folded so far
  active,   \* the SDK still tracks the reasoning part as active
  errored,  \* the SDK rejected the presented stream
  shown,    \* tool calls the SDK presents as concluded
  vis,      \* what readers last saw: the folded state as of the last publish
  pending,  \* a live-only change is folded and not yet published
  wakes     \* reader wakes caused by live events since the last frame

vars == <<folded, live, sent, active, errored, shown, vis, pending, wakes>>

\* The folded state readers would see if it were published now.
Cur == [folded |-> folded, live |-> live, sent |-> sent]

TypeOK ==
  /\ folded \subseteq Tools
  /\ live \in {"none", "open", "closed"}
  /\ sent \in 0..Deltas
  /\ active \in BOOLEAN
  /\ errored \in BOOLEAN
  /\ shown \subseteq Tools
  /\ vis \in [folded : SUBSET Tools, live : {"none", "open", "closed"}, sent : 0..Deltas]
  /\ pending \in BOOLEAN
  /\ wakes \in 0..(Deltas + 2)

Init ==
  /\ folded = {}
  /\ live = "none"
  /\ sent = 0
  /\ active = FALSE
  /\ errored = FALSE
  /\ shown = {}
  /\ vis = [folded |-> {}, live |-> "none", sent |-> 0]
  /\ pending = FALSE
  /\ wakes = 0

\* A live event's publish: deferred to the frame under the clock, a reader wake now without it. `next` is the
\* folded state after the event.
PublishLive(next) ==
  IF FrameClock
  THEN /\ pending' = TRUE /\ UNCHANGED <<vis, wakes>>
  ELSE /\ vis' = next /\ wakes' = wakes + 1 /\ UNCHANGED pending

\* The chunks a durable tool result presents: the output, then its step boundary unless the guard holds it back.
Boundary == ~(GuardBoundary /\ live = "open")

\* The durable read delivers one tool result; the SDK applies the output, then the boundary forgets the active part.
FoldOutput(t) ==
  /\ t \in Tools \ folded
  /\ folded' = folded \cup {t}
  /\ shown' = IF errored THEN shown ELSE shown \cup {t}
  /\ active' = IF Boundary THEN FALSE ELSE active
  /\ vis' = [Cur EXCEPT !.folded = folded \cup {t}]
  /\ pending' = FALSE
  /\ UNCHANGED <<live, sent, errored, wakes>>

\* The live channel opens the next step's reasoning block: `reasoning-start`.
LiveStart ==
  /\ live = "none"
  /\ live' = "open"
  /\ active' = (~errored)
  /\ PublishLive([Cur EXCEPT !.live = "open"])
  /\ UNCHANGED <<folded, sent, errored, shown>>

\* One live delta: `reasoning-delta` of a part the SDK no longer tracks is a stream error.
LiveDelta ==
  /\ live = "open"
  /\ sent < Deltas
  /\ sent' = sent + 1
  /\ errored' = (errored \/ ~active)
  /\ PublishLive([Cur EXCEPT !.sent = sent + 1])
  /\ UNCHANGED <<folded, live, active, shown>>

\* The block ends: `reasoning-end` of a forgotten part is a stream error too.
LiveEnd ==
  /\ live = "open"
  /\ sent = Deltas
  /\ live' = "closed"
  /\ errored' = (errored \/ ~active)
  /\ active' = FALSE
  /\ PublishLive([Cur EXCEPT !.live = "closed"])
  /\ UNCHANGED <<folded, sent, shown>>

\* An animation frame: the store publishes what is waiting in one wake, and a new frame's wake budget starts.
Frame ==
  /\ vis' = Cur
  /\ pending' = FALSE
  /\ wakes' = 0
  /\ UNCHANGED <<folded, live, sent, active, errored, shown>>

Next ==
  \/ \E t \in Tools : FoldOutput(t)
  \/ LiveStart
  \/ LiveDelta
  \/ LiveEnd
  \/ Frame

Spec == Init /\ [][Next]_vars

\* Frames keep coming while the document is visible.
FairSpec == Spec /\ WF_vars(Frame)

\* The SDK accepts every chunk the watch presents.
StreamAccepted == ~errored

\* A tool result the projection folded is presented as concluded: no call keeps spinning after its result is read.
FoldedToolConcluded == folded \subseteq shown

\* Live events wake readers at most once between two frames: the frame callback's one wake is the only one.
OneLiveWakePerFrame == wakes <= 1

\* A durable row is never held for a frame: readers see every folded tool result at once.
DurableAtOnce == vis.folded = folded

\* Readers see a state the fold passed through, all of it: never more live content than folded, and nothing
\* missing once nothing is waiting.
FrameAtomic ==
  /\ vis.sent <= sent
  /\ (~pending) => vis = Cur

\* Every live change reaches readers by the next frame.
LivePublished == pending ~> ~pending

=============================================================================
