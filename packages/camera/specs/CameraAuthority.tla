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
(* camera pose with an origin label. The planned `RecordSync.tla` (formal  *)
(* methods blueprint, § Specs) will own the store's protocol; its planned  *)
(* `OwnWriteAttributed` (I5) is this module's assumption, switched by      *)
(* `AttributionSound`.                                                     *)
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
(*                     write `own` (the planned RecordSync's I5). FALSE:   *)
(*                     it may label one `foreign` (the view store before   *)
(*                     taucad/tau #1602).                                  *)
(*   OriginGuard       the binding adopts only records labelled `foreign`  *)
(*                     (I6).                                               *)
(*   EchoStamp         a controls update caused by the driver carries the  *)
(*                     driver's echo revision and the camera ignores it    *)
(*                     (I3).                                               *)
(*   ResaveOnDrop      when the camera drops a foreign pose and its        *)
(*                     current pose is person-made, the binding saves that *)
(*                     pose again, so the file ends with the person's pose *)
(*                     (D15). FALSE: nothing is saved, and the file keeps  *)
(*                     the dropped foreign pose.                           *)
(*                                                                         *)
(* Correspondence (target names; the as-built seam in brackets):           *)
(*   PoseObserved     camera `poseObserved{source: input | gizmo}`; the    *)
(*                    step label carries the source (`PoseObserved:input`) *)
(*   InteractionEnded camera `interactionEnded`                            *)
(*   SettleElapsed    camera `settling --after(poseSettle)--> idle`        *)
(*   Changed          `setVerticalFieldOfView` (fov), `setUpDirection`     *)
(*                    (up), `frameGeometry` (fit, framing), `frameBounds`  *)
(*                    (focus), `setViewport`, `setBounds`; the step label  *)
(*                    carries the source (`Changed:fov`)                   *)
(*   Observe          a `recordSync` publication reaching the binding,     *)
(*                    then `adoptPersistedPose` and the camera's answer:   *)
(*                    AdoptApplied `adoptionApplied`, AdoptDropped         *)
(*                    `adoptionDropped`; AdoptDropped:resaved is the same  *)
(*                    `adoptionDropped` plus the binding's re-issued edit  *)
(*                    of the person's current pose [the record effect of   *)
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
          EchoStamp,
          ResaveOnDrop

ASSUME /\ MaxRevision \in 1..99
       /\ MaxForeign \in Nat
       /\ Adoption \in {"drop", "queue"}
       /\ QuietGate \in {"input", "emission"}
       /\ WriteRule \in {"provenance", "value"}
       /\ AttributionSound \in BOOLEAN
       /\ OriginGuard \in BOOLEAN
       /\ EchoStamp \in BOOLEAN
       /\ ResaveOnDrop \in BOOLEAN

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

\* The sources of a drag and of a command or automatic change. The step label carries the source, so the
\* covering suite replays every source; no property reads these labels.
DragSources == {"input", "gizmo"}
ChangeSources == {"fov", "up", "fit", "focus", "framing", "viewport", "bounds"}
DragLabel == [input |-> "PoseObserved:input", gizmo |-> "PoseObserved:gizmo"]
ChangeLabel == [fov |-> "Changed:fov", up |-> "Changed:up", fit |-> "Changed:fit",
                focus |-> "Changed:focus", framing |-> "Changed:framing",
                viewport |-> "Changed:viewport", bounds |-> "Changed:bounds"]

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
  /\ act \in {"Init", "InteractionEnded", "SettleElapsed", "RecordOwn", "AdoptApplied", "AdoptDropped",
              "AdoptDropped:resaved", "AdoptQueued", "PendingApplied", "Captured", "Landed", "ForeignWrite",
              "EchoObserved", "QuietElapsed"}
              \cup {DragLabel[s] : s \in DragSources} \cup {ChangeLabel[s] : s \in ChangeSources}

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
  /\ source \in DragSources
  /\ Touch(cam.revision + 1, source, "dragging")
  /\ UNCHANGED <<file, seen, pending, saved, adoptedPose, firstPose, arrivedBusy, foreignCount>>
  /\ act' = DragLabel[source]

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
  /\ source \in ChangeSources
  /\ Touch(IF source \in {"viewport", "bounds"} THEN cam.pose ELSE cam.revision + 1, source, cam.input)
  /\ firstPose' = IF WriteRule = "value" /\ source = "framing" /\ firstPose = Rig
                  THEN cam.revision + 1
                  ELSE firstPose
  /\ UNCHANGED <<file, seen, pending, saved, adoptedPose, arrivedBusy, foreignCount>>
  /\ act' = ChangeLabel[source]

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
\* it (D15) or, as built, queues it. On a drop the binding re-issues the camera's current pose as an edit
\* when a person made it, so the person's pose is saved over the foreign one (D15, last writer wins); the
\* step is labelled `AdoptDropped:resaved` unless that edit is already in flight. This re-save is deliberately outside the G6 camera rule
\* as worded (written only when `lastChange.source` is a person source and the revision is newer than
\* `lastWrittenRevision`): it may write again a revision that was already written, and the camera's
\* latest source may by then be `viewport` or `bounds`, which keep the pose. The binding must therefore
\* hold the source of the last pose-changing change itself (`poseBy`); `lastChange` alone does not give
\* it. The charter's I7 wording, incident-path step 2 and the G6 camera rule need this one exception
\* recorded.
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
             ELSE /\ UNCHANGED <<cam, poseBy, quiet, echo, adoptedPose>>
                  /\ IF Adoption = "drop"
                     THEN LET resave == IF ResaveOnDrop /\ WriteRule = "provenance" /\ poseBy \in PersonSources
                                        THEN [pose |-> cam.pose, source |-> poseBy]
                                        ELSE intent
                          IN /\ intent' = resave
                             /\ pending' = NoPending
                             /\ act' = IF resave # intent THEN "AdoptDropped:resaved" ELSE "AdoptDropped"
                     ELSE /\ UNCHANGED intent
                          /\ pending' = [pose |-> file.pose, writer |-> file.writer]
                          /\ act' = "AdoptQueued"

\* "queue" only: the gate opens and the waiting pose applies.
PendingApplied ==
  /\ pending # NoPending
  /\ Gate
  /\ Apply(pending.pose)
  /\ pending' = NoPending
  /\ UNCHANGED <<file, seen, saved, firstPose, arrivedBusy, foreignCount>>
  /\ act' = "PendingApplied"

\* "value" rule only: the settled pose is captured for saving unless a value heuristic excludes it. Nothing
\* is saved before the first automatic frame (`persist` checks `framing.initialized`).
Captured ==
  /\ WriteRule = "value"
  /\ Gate
  /\ pending = NoPending
  /\ firstPose # Rig
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
  \/ \E source \in DragSources : PoseObserved(source)
  \/ InteractionEnded
  \/ SettleElapsed
  \/ \E source \in ChangeSources : Changed(source)
  \/ \E label \in {"own", "foreign"} : Observe(label)
  \/ PendingApplied
  \/ Captured
  \/ Landed
  \/ ForeignWrite
  \/ EchoObserved
  \/ QuietElapsed

Spec == Init /\ [][Next]_vars

AdoptDrops == {"AdoptDropped", "AdoptDropped:resaved"}
AdoptionRequests == {"AdoptApplied", "AdoptQueued"} \cup AdoptDrops
AdoptionApplies == {"AdoptApplied", "PendingApplied"}

\* I2, D15: a persisted pose that arrived while the person was dragging or settling never becomes the
\* camera's pose, then or later.
LocalInputWins == cam.pose \notin arrivedBusy

\* I2, D15: nothing waits. The camera has no pending-adoption state.
NothingQueued == pending = NoPending

\* D15: a persisted pose that arrives while the camera is idle applies at once.
IdleForeignApplies == act \in AdoptDrops \cup {"AdoptQueued"} => cam.input # "idle"

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

\* D15, D20: at rest, a pose a person made is the pose this view saved.
PersonPoseSaved == Quiescent /\ poseBy \in PersonSources => file.pose = cam.pose /\ file.writer = "self"

\* I6: the binding never asks the camera to adopt a record this view wrote.
OwnNeverAdopted == act \in AdoptionRequests => file.writer # "self"

\* I7, D20: this view writes only poses a person commanded. `file.source` is the source of the change that
\* produced the written pose, not the camera's latest source at the time of the write (see the re-save).
OnlyPersonPosesWritten == file.writer = "self" => file.source \in PersonSources

\* I8: a persisted pose applies only in input.idle.
AdoptOnlyWhenIdle == act \in AdoptionApplies => cam.input = "idle"

\* I3: a controls update the driver caused never changes the camera.
NoEchoLoop == [][act' = "EchoObserved" => cam' = cam]_vars

\* The incident (taucad/tau#1602): the camera never moves back to a pose this view saved earlier.
AppliedWriter == IF act' = "PendingApplied" THEN pending.writer ELSE file.writer
NoSnapBack == [][(act' \in AdoptionApplies /\ AppliedWriter = "self") => cam'.pose = cam.pose]_vars

=============================================================================
