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
(*   Present      `openRunWatch` drain -> SDK `processUIMessageStream`     *)
(***************************************************************************)
EXTENDS Naturals, Sequences

CONSTANTS Tools,         \* the step's tool calls, each with one durable result
          Deltas,        \* how many live reasoning deltas the next step streams
          GuardBoundary

VARIABLES
  folded,   \* tool results the projection has folded from durable reads
  live,     \* the next step's live block: "none", "open" or "closed"
  sent,     \* live deltas folded so far
  active,   \* the SDK still tracks the reasoning part as active
  errored,  \* the SDK rejected the presented stream
  shown     \* tool calls the SDK presents as concluded

vars == <<folded, live, sent, active, errored, shown>>

TypeOK ==
  /\ folded \subseteq Tools
  /\ live \in {"none", "open", "closed"}
  /\ sent \in 0..Deltas
  /\ active \in BOOLEAN
  /\ errored \in BOOLEAN
  /\ shown \subseteq Tools

Init ==
  /\ folded = {}
  /\ live = "none"
  /\ sent = 0
  /\ active = FALSE
  /\ errored = FALSE
  /\ shown = {}

\* The chunks a durable tool result presents: the output, then its step boundary unless the guard holds it back.
Boundary == ~(GuardBoundary /\ live = "open")

\* The durable read delivers one tool result; the SDK applies the output, then the boundary forgets the active part.
FoldOutput(t) ==
  /\ t \in Tools \ folded
  /\ folded' = folded \cup {t}
  /\ shown' = IF errored THEN shown ELSE shown \cup {t}
  /\ active' = IF Boundary THEN FALSE ELSE active
  /\ UNCHANGED <<live, sent, errored>>

\* The live channel opens the next step's reasoning block: `reasoning-start`.
LiveStart ==
  /\ live = "none"
  /\ live' = "open"
  /\ active' = (~errored)
  /\ UNCHANGED <<folded, sent, errored, shown>>

\* One live delta: `reasoning-delta` of a part the SDK no longer tracks is a stream error.
LiveDelta ==
  /\ live = "open"
  /\ sent < Deltas
  /\ sent' = sent + 1
  /\ errored' = (errored \/ ~active)
  /\ UNCHANGED <<folded, live, active, shown>>

\* The block ends: `reasoning-end` of a forgotten part is a stream error too.
LiveEnd ==
  /\ live = "open"
  /\ sent = Deltas
  /\ live' = "closed"
  /\ errored' = (errored \/ ~active)
  /\ active' = FALSE
  /\ UNCHANGED <<folded, sent, shown>>

Next ==
  \/ \E t \in Tools : FoldOutput(t)
  \/ LiveStart
  \/ LiveDelta
  \/ LiveEnd

Spec == Init /\ [][Next]_vars

\* The SDK accepts every chunk the watch presents.
StreamAccepted == ~errored

\* A tool result the projection folded is presented as concluded: no call keeps spinning after its result is read.
FoldedToolConcluded == folded \subseteq shown

=============================================================================
