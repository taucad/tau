--------------------------- MODULE CameraAuthority ---------------------------
(***************************************************************************)
(* Who may move one view's camera, and which of its poses reach the view   *)
(* record: the person (drags, the gizmo, field of view, up direction, Fit  *)
(* view, focus), automatic framing, the persisted record (another window's *)
(* edit, or this view's own save read back), and the settle clock.         *)
(*                                                                         *)
(* Written from the graphics event-driven state charter (D2, D15, D20;     *)
(* I2, I3, I6, I7, I8), before the camera states and the view-record       *)
(* binding exist. The camera is abstracted to {pose, source, revision,     *)
(* input}; a pose is an opaque identifier, so only "which pose" and "who   *)
(* made it" are modelled, never geometry.                                  *)
(*                                                                         *)
(* The record store is abstracted to what the binding observes: the file's *)
(* camera pose with an origin label. `RecordSync.tla` owns the store's     *)
(* protocol; its `OwnWriteAttributed` (I5) is this module's assumption,    *)
(* switched by `AttributionSound`.                                         *)
(*                                                                         *)
(* Switches (the target value first):                                      *)
(*   Adoption          "drop": a persisted pose that cannot apply now is   *)
(*                     dropped (D15). "queue": it waits for the gate       *)
(*                     (as built, and D15's rejected alternative).         *)
(*   QuietGate         "input": adoption applies in input.idle (I8).       *)
(*                     "emission": it applies once no camera emission      *)
(*                     happened for poseSettle (as built: `Date.now()`     *)
(*                     against `lastCameraEmissionRef`).                   *)
(*   WriteRule         "provenance": a pose is saved when the change that  *)
(*                     produced it has a person source (I7, D20).          *)
(*                     "value": a settled pose is saved unless it equals   *)
(*                     the last saved, the last adopted or the first-frame *)
(*                     pose (as built: `previousSettingsRef`,              *)
(*                     `adoptedPoseRef`, `firstFrameReceiptRef`).          *)
(*   AttributionSound  the store labels every read of this view's own      *)
(*                     write `own` (RecordSync I5). FALSE: it may label    *)
(*                     one `foreign` (the view store before taucad/tau     *)
(*                     #1602).                                             *)
(*   OriginGuard       the binding adopts only records labelled `foreign`  *)
(*                     (I6).                                               *)
(*   EchoStamp         a controls update caused by the driver carries the  *)
(*                     driver's echo revision and the camera ignores it    *)
(*                     (I3).                                               *)
(*                                                                         *)
(* Correspondence (target names; the as-built seam in brackets):           *)
(*   PoseObserved     camera `poseObserved{source: input | gizmo}`         *)
(*   InteractionEnded camera `interactionEnded`                            *)
(*   SettleElapsed    camera `settling --after(poseSettle)--> idle`        *)
(*   Changed          `setVerticalFieldOfView` (fov), `setUpDirection`     *)
(*                    (up), `frameGeometry` (fit, framing), `frameBounds`  *)
(*                    (focus), `setViewport`, `setBounds`                  *)
(*   Observe          a `recordSync` publication reaching the binding,     *)
(*                    then `adoptPersistedPose` and the camera's answer:   *)
(*                    AdoptApplied `adoptionApplied`, AdoptDropped         *)
(*                    `adoptionDropped` [the record effect of              *)
(*                    `useViewSettingsSync` and its `apply`]               *)
(*   Captured, Landed the binding's `edit` and the store's checked write   *)
(*                    [`persist` and `writeRecord`]                        *)
(*   EchoObserved     `poseObserved{echoRevision}` from the controls       *)
(*                    adapter after a driver sync                          *)
(*   QuietElapsed     [poseSettle since `lastCameraEmissionRef`]           *)
(***************************************************************************)
EXTENDS Naturals

CONSTANTS MaxRevision,       \* camera changes explored
          MaxForeign,        \* writes by another party explored
          Adoption,
          QuietGate,
          WriteRule,
          AttributionSound,
          OriginGuard,
          EchoStamp

ASSUME /\ MaxRevision \in 1..99
       /\ MaxForeign \in Nat
       /\ Adoption \in {"drop", "queue"}
       /\ QuietGate \in {"input", "emission"}
       /\ WriteRule \in {"provenance", "value"}
       /\ AttributionSound \in BOOLEAN
       /\ OriginGuard \in BOOLEAN
       /\ EchoStamp \in BOOLEAN

VARIABLES
  cam,          \* the camera: [pose, source, revision, input]
  poseBy,       \* the source of the change that produced cam.pose (viewport and bounds changes keep the pose)
  file,         \* the view record's camera field on disk: [pose, writer, source]
  seen,         \* the pose of the last record publication the binding handled
  intent,       \* the binding's edit that has not reached the file yet: [pose, source]
  pending,      \* a persisted pose waiting for the gate ("queue" only): [pose, writer]
  saved,        \* "value" rule: the last pose this view captured for saving
  adoptedPose,  \* "value" rule: the last persisted pose applied
  firstPose,    \* "value" rule: the pose of the first automatic frame
  quiet,        \* "emission" gate: poseSettle passed since the last camera emission
  echo,         \* the revision of a driver sync whose controls update is still in flight; 0 when none
  arrivedBusy,  \* persisted poses whose adoption was requested while the camera was dragging or settling
  foreignCount, \* writes by another party so far
  act           \* the step's label, for traces and the graph export

vars == <<cam, poseBy, file, seen, intent, pending, saved, adoptedPose, firstPose, quiet, echo,
          arrivedBusy, foreignCount, act>>

\* Charter D20: what a person commanded. `fit` is Fit view; `framing` is automatic.
PersonSources == {"input", "gizmo", "fov", "up", "fit", "focus"}
MachineSources == {"framing", "persisted", "viewport", "bounds"}
Sources == PersonSources \cup MachineSources

\* The opening rig pose. Local poses take the revision that made them; another party's poses start at 101.
Rig == 0
ForeignPose(k) == 100 + k
Poses == 0..MaxRevision \cup {ForeignPose(k) : k \in 1..MaxForeign}

NoIntent == [pose |-> Rig, source |-> "none"]
NoPending == [pose |-> Rig, writer |-> "none"]

TypeOK ==
  /\ cam \in [pose : Poses, source : Sources, revision : 0..MaxRevision, input : {"idle", "dragging", "settling"}]
  /\ poseBy \in Sources
  /\ file \in [pose : Poses, writer : {"none", "self", "foreign"}, source : Sources \cup {"none"}]
  /\ seen \in Poses
  /\ intent \in [pose : Poses, source : Sources \cup {"none"}]
  /\ pending \in [pose : Poses, writer : {"none", "self", "foreign"}]
  /\ saved \in Poses
  /\ adoptedPose \in Poses
  /\ firstPose \in Poses
  /\ quiet \in BOOLEAN
  /\ echo \in 0..MaxRevision
  /\ arrivedBusy \subseteq Poses
  /\ foreignCount \in 0..MaxForeign
  /\ act \in {"Init", "PoseObserved", "InteractionEnded", "SettleElapsed", "Changed", "RecordOwn",
              "AdoptApplied", "AdoptDropped", "AdoptQueued", "PendingApplied", "Captured", "Landed",
              "ForeignWrite", "EchoObserved", "QuietElapsed"}

Init ==
  /\ cam = [pose |-> Rig, source |-> "framing", revision |-> 0, input |-> "idle"]
  /\ poseBy = "framing"
  /\ file = [pose |-> Rig, writer |-> "none", source |-> "none"]
  /\ seen = Rig
  /\ intent = NoIntent
  /\ pending = NoPending
  /\ saved = Rig
  /\ adoptedPose = Rig
  /\ firstPose = Rig
  /\ quiet = TRUE
  /\ echo = 0
  /\ arrivedBusy = {}
  /\ foreignCount = 0
  /\ act = "Init"

\* The gate a persisted pose must pass to apply.
Gate == IF QuietGate = "input" THEN cam.input = "idle" ELSE quiet

\* One camera change: one revision, one source (I1). The driver syncs the controls for every source but
\* `input`, and the controls answer with an update. Under the "provenance" rule the binding captures a
\* person's pose with the change itself, so a later machine change cannot hide it.
Touch(pose, source, input) ==
  /\ cam.revision < MaxRevision
  /\ cam' = [pose |-> pose, source |-> source, revision |-> cam.revision + 1, input |-> input]
  /\ poseBy' = IF pose = cam.pose THEN poseBy ELSE source
  /\ quiet' = (QuietGate = "input")
  /\ echo' = IF source = "input" THEN echo ELSE cam.revision + 1
  /\ intent' = IF WriteRule = "provenance" /\ source \in PersonSources
               THEN [pose |-> pose, source |-> source]
               ELSE intent

Still == UNCHANGED <<cam, poseBy, quiet, echo, intent>>

\* The person drags the view or the gizmo: every observed pose is a new pose and the gesture is live.
PoseObserved(source) ==
  /\ source \in {"input", "gizmo"}
  /\ Touch(cam.revision + 1, source, "dragging")
  /\ UNCHANGED <<file, seen, pending, saved, adoptedPose, firstPose, arrivedBusy, foreignCount>>
  /\ act' = "PoseObserved"

\* The person releases the gesture.
InteractionEnded ==
  /\ cam.input = "dragging"
  /\ cam' = [cam EXCEPT !.input = "settling"]
  /\ UNCHANGED <<poseBy, quiet, echo, intent, file, seen, pending, saved, adoptedPose, firstPose,
                 arrivedBusy, foreignCount>>
  /\ act' = "InteractionEnded"

\* poseSettle passed since the release with no new pose.
SettleElapsed ==
  /\ cam.input = "settling"
  /\ cam' = [cam EXCEPT !.input = "idle"]
  /\ UNCHANGED <<poseBy, quiet, echo, intent, file, seen, pending, saved, adoptedPose, firstPose,
                 arrivedBusy, foreignCount>>
  /\ act' = "SettleElapsed"

\* A command or an automatic change, in any input state. Viewport and bounds changes keep the pose.
Changed(source) ==
  /\ source \in {"fov", "up", "fit", "focus", "framing", "viewport", "bounds"}
  /\ Touch(IF source \in {"viewport", "bounds"} THEN cam.pose ELSE cam.revision + 1, source, cam.input)
  /\ firstPose' = IF WriteRule = "value" /\ source = "framing" /\ firstPose = Rig
                  THEN cam.revision + 1
                  ELSE firstPose
  /\ UNCHANGED <<file, seen, pending, saved, adoptedPose, arrivedBusy, foreignCount>>
  /\ act' = "Changed"

\* A persisted pose becomes the camera's pose in one change.
Apply(pose) ==
  /\ Touch(pose, "persisted", cam.input)
  /\ adoptedPose' = IF WriteRule = "value" THEN pose ELSE adoptedPose

\* The labels the store may give the file's current content.
Labels ==
  IF file.writer = "self"
  THEN IF AttributionSound THEN {"own"} ELSE {"own", "foreign"}
  ELSE {"foreign"}

\* The store publishes the file's camera pose and the binding handles it once. An `own` record is not
\* adopted (I6). A `foreign` one is sent to the camera, which applies it at the gate and otherwise drops
\* it (D15) or, as built, queues it.
Observe(label) ==
  /\ file.pose # seen
  /\ label \in Labels
  /\ seen' = file.pose
  /\ UNCHANGED <<file, saved, firstPose, foreignCount>>
  /\ IF label = "own" /\ OriginGuard
     THEN /\ Still
          /\ pending' = NoPending
          /\ UNCHANGED <<adoptedPose, arrivedBusy>>
          /\ act' = "RecordOwn"
     ELSE /\ arrivedBusy' = IF cam.input = "idle" THEN arrivedBusy ELSE arrivedBusy \cup {file.pose}
          /\ IF Gate
             THEN /\ Apply(file.pose)
                  /\ pending' = NoPending
                  /\ act' = "AdoptApplied"
             ELSE /\ Still
                  /\ UNCHANGED adoptedPose
                  /\ IF Adoption = "drop"
                     THEN /\ pending' = NoPending
                          /\ act' = "AdoptDropped"
                     ELSE /\ pending' = [pose |-> file.pose, writer |-> file.writer]
                          /\ act' = "AdoptQueued"

\* "queue" only: the gate opens and the waiting pose applies.
PendingApplied ==
  /\ pending # NoPending
  /\ Gate
  /\ Apply(pending.pose)
  /\ pending' = NoPending
  /\ UNCHANGED <<file, seen, saved, firstPose, arrivedBusy, foreignCount>>
  /\ act' = "PendingApplied"

\* "value" rule only: the settled pose is captured for saving unless a value heuristic excludes it.
Captured ==
  /\ WriteRule = "value"
  /\ Gate
  /\ pending = NoPending
  /\ cam.pose \notin {saved, adoptedPose, firstPose}
  /\ intent' = [pose |-> cam.pose, source |-> poseBy]
  /\ saved' = cam.pose
  /\ UNCHANGED <<cam, poseBy, quiet, echo, file, seen, pending, adoptedPose, firstPose, arrivedBusy,
                 foreignCount>>
  /\ act' = "Captured"

\* The store's debounced write reaches the file; the last writer wins.
Landed ==
  /\ intent # NoIntent
  /\ file' = [pose |-> intent.pose, writer |-> "self", source |-> intent.source]
  /\ intent' = NoIntent
  /\ UNCHANGED <<cam, poseBy, quiet, echo, seen, pending, saved, adoptedPose, firstPose, arrivedBusy,
                 foreignCount>>
  /\ act' = "Landed"

\* Another window, an agent or an earlier session wrote the record.
ForeignWrite ==
  /\ foreignCount < MaxForeign
  /\ foreignCount' = foreignCount + 1
  /\ file' = [pose |-> ForeignPose(foreignCount + 1), writer |-> "foreign", source |-> "none"]
  /\ UNCHANGED <<cam, poseBy, quiet, echo, intent, seen, pending, saved, adoptedPose, firstPose,
                 arrivedBusy>>
  /\ act' = "ForeignWrite"

\* The controls report the pose the driver wrote. Stamped, the camera ignores it. Unstamped, it is
\* taken for the person's input: a new revision with the source `input`, which the binding then saves.
EchoObserved ==
  /\ echo # 0
  /\ echo' = 0
  /\ IF EchoStamp
     THEN UNCHANGED <<cam, poseBy, quiet, intent>>
     ELSE /\ cam.revision < MaxRevision
          /\ cam' = [cam EXCEPT !.source = "input", !.revision = cam.revision + 1, !.input = "dragging"]
          /\ quiet' = (QuietGate = "input")
          /\ intent' = IF WriteRule = "provenance"
                       THEN [pose |-> cam.pose, source |-> "input"]
                       ELSE intent
          /\ UNCHANGED poseBy
  /\ UNCHANGED <<file, seen, pending, saved, adoptedPose, firstPose, arrivedBusy, foreignCount>>
  /\ act' = "EchoObserved"

\* "emission" gate only: poseSettle passed since the last camera emission, whatever the gesture is doing.
QuietElapsed ==
  /\ QuietGate = "emission"
  /\ ~quiet
  /\ quiet' = TRUE
  /\ UNCHANGED <<cam, poseBy, echo, intent, file, seen, pending, saved, adoptedPose, firstPose,
                 arrivedBusy, foreignCount>>
  /\ act' = "QuietElapsed"

Next ==
  \/ \E source \in {"input", "gizmo"} : PoseObserved(source)
  \/ InteractionEnded
  \/ SettleElapsed
  \/ \E source \in {"fov", "up", "fit", "focus", "framing", "viewport", "bounds"} : Changed(source)
  \/ \E label \in {"own", "foreign"} : Observe(label)
  \/ PendingApplied
  \/ Captured
  \/ Landed
  \/ ForeignWrite
  \/ EchoObserved
  \/ QuietElapsed

Spec == Init /\ [][Next]_vars

AdoptionRequests == {"AdoptApplied", "AdoptDropped", "AdoptQueued"}
AdoptionApplies == {"AdoptApplied", "PendingApplied"}

\* I2, D15: a persisted pose that arrived while the person was dragging or settling never becomes the
\* camera's pose, then or later.
LocalInputWins == cam.pose \notin arrivedBusy

\* I2, D15: nothing waits. The camera has no pending-adoption state.
NothingQueued == pending = NoPending

\* D15: a persisted pose that arrives while the camera is idle applies at once.
IdleForeignApplies == act \in {"AdoptDropped", "AdoptQueued"} => cam.input # "idle"

\* I6: the binding never asks the camera to adopt a record this view wrote.
OwnNeverAdopted == act \in AdoptionRequests => file.writer # "self"

\* I7, D20: this view writes only poses a person commanded.
OnlyPersonPosesWritten == file.writer = "self" => file.source \in PersonSources

\* I8: a persisted pose applies only in input.idle.
AdoptOnlyWhenIdle == act \in AdoptionApplies => cam.input = "idle"

\* I3: a controls update the driver caused never changes the camera.
NoEchoLoop == [][act' = "EchoObserved" => cam' = cam]_vars

\* The incident (taucad/tau#1602): the camera never moves back to a pose this view saved earlier.
AppliedWriter == IF act' = "PendingApplied" THEN pending.writer ELSE file.writer
NoSnapBack == [][(act' \in AdoptionApplies /\ AppliedWriter = "self") => cam'.pose = cam.pose]_vars

\* Nothing is in flight: the gesture has settled, every edit has landed, every publication is handled
\* and no controls update is pending. The nightly simulation keeps the behaviours that reach it.
Quiescent ==
  /\ act # "Init"
  /\ cam.input = "idle"
  /\ quiet
  /\ intent = NoIntent
  /\ pending = NoPending
  /\ echo = 0
  /\ seen = file.pose

=============================================================================
