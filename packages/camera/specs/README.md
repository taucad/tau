# Camera authority

`CameraAuthority.tla` models who may move one view's camera and which of its poses reach the view record. It encodes the graphics event-driven state charter's rulings D2, D15 and D20 and its invariants I2, I3, I6, I7 and I8. It was written before the camera states (G3) and the view-record binding (G6) exist, as formal-verification-policy rule 1 requires.

## Parties and abstraction

| Party               | In the model                                                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Camera              | `cam = {pose, source, revision, input}`, with `input` one of `idle`, `dragging`, `settling`. A pose is an opaque identifier; geometry is not modelled                                                   |
| Person              | `PoseObserved` (a drag of the view or the gizmo), `InteractionEnded`, and `Changed` with the sources `fov`, `up`, `fit` and `focus`                                                                     |
| Automatic changes   | `Changed` with the sources `framing`, `viewport` and `bounds`. Viewport and bounds changes bump the revision and keep the pose                                                                          |
| Clock               | `SettleElapsed` (`settling` to `idle`). The as-built emission quiet window is `QuietElapsed`                                                                                                            |
| Record              | `file = {pose, writer, source}`: the camera field on disk, who really wrote it, and the source of the pose a save carried                                                                               |
| Binding             | `Observe` handles one record publication: it ignores a record labelled `own` and sends `adoptPersistedPose` for a `foreign` one. `intent` is its edit that has not reached the file; `Landed` writes it |
| Another party       | `ForeignWrite`: a second window, an agent or an earlier session                                                                                                                                         |
| Driver and controls | `echo` is a controls update the driver caused and that is still in flight; `EchoObserved` delivers it                                                                                                   |

The record store is not modelled. The planned `RecordSync.tla` (formal methods blueprint, § Specs), which a sibling lane is adding under `apps/ui/specs/record-sync/`, will own its protocol. This module takes that module's planned `OwnWriteAttributed` (I5) as an assumption, switched by `AttributionSound`, and `misattributed` shows the assumption is needed.

## Properties

| Property                 | Charter      | Meaning                                                                                                                                                                                                                                                                                       |
| ------------------------ | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LocalInputWins`         | I2, D15      | A persisted pose that arrived while the person was dragging or settling never becomes the camera's pose, then or later                                                                                                                                                                        |
| `NothingQueued`          | I2, D15      | No persisted pose ever waits; the camera has no pending-adoption state                                                                                                                                                                                                                        |
| `IdleForeignApplies`     | D15          | A persisted pose is dropped or queued only when the camera is not idle, so one that arrives in `idle` applies at once                                                                                                                                                                         |
| `NoEchoLoop`             | I3           | A controls update the driver caused never changes the camera                                                                                                                                                                                                                                  |
| `OwnNeverAdopted`        | I6           | The binding never asks the camera to adopt a record this view wrote                                                                                                                                                                                                                           |
| `OnlyPersonPosesWritten` | I7, D20      | I7 over the source of the change that produced the written pose: every pose this view writes was produced by `input`, `gizmo`, `fov`, `up`, `fit` or `focus`. It is not stated over `lastChange.source` at the time of the write, which after a re-save on drop may be `viewport` or `bounds` |
| `AdoptOnlyWhenIdle`      | I8           | A persisted pose applies only in `input.idle`                                                                                                                                                                                                                                                 |
| `NoSnapBack`             | the incident | The camera never moves back to a pose this view saved earlier                                                                                                                                                                                                                                 |
| `PersonPoseSaved`        | D15, D20     | At rest, a pose a person made is the pose this view saved: once nothing is in flight and the camera's pose was made by a person source, the file holds that pose, written by this view. A foreign pose the camera dropped therefore does not stay on the file                                 |

`NoEchoLoop` and `NoSnapBack` compare a step's two states, so they are action properties (`PROPERTIES` in a configuration). The rest are state invariants; four of them read the step label `act`: `IdleForeignApplies`, `OwnNeverAdopted` and `AdoptOnlyWhenIdle` directly, and `PersonPoseSaved` through `Quiescent`. `PersonPoseSaved` holds in `Quiescent` states only, because the person's pose is still on its way to the file before then.

## Configurations

| Configuration                    | Tier    | Required result                  | What it shows                                                                                                                                                                                |
| -------------------------------- | ------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `target`                         | pr      | pass                             | All nine properties and `TypeOK`, at five camera changes and two foreign writes                                                                                                              |
| `target-wide`                    | nightly | pass                             | The same at eight camera changes and three foreign writes                                                                                                                                    |
| `export`                         | pr      | pass                             | The target at two camera changes and one foreign write, the source of `CameraAuthority/graph.json` and `suite.json`                                                                          |
| `today`                          | pr      | `NoSnapBack`, defect             | The orbit snap-back: after the first frame, this view's save of a drag pose is published as foreign and, the quiet window having passed, replaces the newer pose of the same drag            |
| `today-foreign-mid-drag`         | pr      | `LocalInputWins`, defect         | As built, a foreign pose that arrives during a drag is applied, not dropped                                                                                                                  |
| `today-held-drag`                | pr      | `AdoptOnlyWhenIdle`, defect      | As built, the quiet window counts from the last camera emission, so it opens during a drag that is held still                                                                                |
| `today-refit-saved`              | pr      | `OnlyPersonPosesWritten`, defect | As built, an automatic refit after the first frame is saved                                                                                                                                  |
| `queue-until-idle`               | pr      | `LocalInputWins`, witness        | D15's rejected alternative: queue a foreign pose and apply it when the drag has settled                                                                                                      |
| `misattributed`                  | pr      | `NoSnapBack`, witness            | The target binding and camera still snap back when the store labels an own write `foreign`                                                                                                   |
| `no-origin-guard`                | pr      | `OwnNeverAdopted`, witness       | A binding that ignores the origin label                                                                                                                                                      |
| `no-echo-stamp`                  | pr      | `NoEchoLoop`, witness            | A driver sync whose controls update carries no echo revision                                                                                                                                 |
| `no-resave-on-drop`              | pr      | `PersonPoseSaved`, witness       | A binding that does not save the person's pose again when the camera drops a foreign one: a drag lands, a foreign write arrives during the settle, the camera drops it and the file keeps it |
| `emission-gate`                  | pr      | `IdleForeignApplies`, witness    | The target with the as-built emission quiet window as its gate: a foreign pose that arrives in `idle` right after a command is dropped                                                       |
| `queue-until-idle-NothingQueued` | pr      | `NothingQueued`, witness         | `queue-until-idle`'s constants: a foreign pose that arrives during a drag waits for the gate                                                                                                 |

Each violating configuration checks exactly one property. The four `today` configurations are the as-built model: `Adoption = "queue"`, `QuietGate = "emission"` and `WriteRule = "value"`. `today` also sets `AttributionSound = FALSE`, the view store before taucad/tau#1602. They stay violated for as long as the switches exist. The package that removes the as-built code (G6b) changes their `kind` from `defect` to `witness` in `expected.json`.

Every property has a configuration that violates it: `NoSnapBack` by `today` and `misattributed`, `LocalInputWins` by `today-foreign-mid-drag` and `queue-until-idle`, `AdoptOnlyWhenIdle` by `today-held-drag`, `OnlyPersonPosesWritten` by `today-refit-saved`, `OwnNeverAdopted` by `no-origin-guard`, `NoEchoLoop` by `no-echo-stamp`, `PersonPoseSaved` by `no-resave-on-drop`, `IdleForeignApplies` by `emission-gate` and `NothingQueued` by `queue-until-idle-NothingQueued`.

`PersonPoseSaved` has its own switch, `ResaveOnDrop`, because no as-built configuration gives a real counterexample: the `today` configurations queue a foreign pose rather than drop it, and they violate the property only in states where the `value` rule has not yet captured the person's pose (it captures after the quiet window, not with the change) or, before the first frame, saves nothing by design. Neither is the lost save the property is about.

## What the as-built switches stand for

| Switch value               | As-built code                                                                                                                                                                                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Adoption = "queue"`       | `apps/ui/app/hooks/use-view-settings-sync.ts`: `pendingCameraRecordRef` and `cameraAdoptionPendingRef`; an own receipt clears them                                                                                                                                            |
| `QuietGate = "emission"`   | `apps/ui/app/hooks/use-view-settings-sync.ts`: `apply` waits until `poseSettle` passed since `lastCameraEmissionRef`, measured with `Date.now()`                                                                                                                              |
| `WriteRule = "value"`      | `apps/ui/app/hooks/use-view-settings-sync.ts`: `persist` writes no camera before the first frame (`session.framing.initialized`), runs when the settle timer fires and skips a pose equal to `previousSettingsRef`, `adoptedPoseRef` or the unconsumed `firstFrameReceiptRef` |
| `AttributionSound = FALSE` | `apps/ui/app/workbench-records/view-store.ts`, `createWorkbenchViewStore`'s `read`: a read that starts after the write reply publishes the store's own bytes without a local patch (root cause Finding 2)                                                                     |

## Rules the model fixes for G3, G4 and G6

- **Capture with the change.** Under the `provenance` rule the binding captures a person's pose in the same step as the camera change that produced it (`Touch`). `lastChange` holds only the latest source, so a binding that sampled it later, for example on entering `idle`, would lose a drag that a viewport, bounds or framing change followed inside the settle window.
- **One handling per publication.** The binding compares a publication with the last pose it handled (`seen`) and requests adoption once. A dropped pose is not requested again when the same record is published a second time, which is what makes `LocalInputWins` hold after the drag.
- **Drop is the only refusal.** In `dragging` and `settling` the camera answers `adoptPersistedPose` with `adoptionDropped` and keeps no state for it.
- **Re-save on drop.** When the camera answers `adoptPersistedPose` with `adoptionDropped`, the binding issues the camera's current pose as an edit again if a person made it (`poseBy` is a person source); the step is labelled `AdoptDropped:resaved` (plain `AdoptDropped` when the same edit is still in flight). The person's pose may already have landed before the foreign write, so without this the file would keep the dropped foreign pose (D15: "When the drag ends, the person's pose is saved over the foreign one"). The re-save is deliberately outside the G6 camera rule as worded (record-sync blueprint § G6: "The camera field is written only when `camera.lastChange.source` is input, gizmo, fov, up, fit or focus, and the revision is newer than `lastWrittenRevision`"): it may write again a revision that was already written, and `lastChange.source` may by then be `viewport` or `bounds`, which keep the pose. The binding therefore must itself hold the source of the last pose-changing change (the model's `poseBy`); `lastChange` alone does not give it. The charter's I7 wording, incident-path step 2 and the G6 camera rule need this one exception recorded; it is reported to programme control. If the pose at drop time is machine-made, for example a refit mid-drag, it is not saved because I7 forbids it, so the binding writes nothing and `PersonPoseSaved` is scoped to person-made poses; the file then holds the foreign pose until the next person command.
- **Any stamped update is an echo.** `echo` is one slot: a later driver sync replaces the stamp of an earlier one, and the camera ignores the update that carries it.

## Bridge

`CameraAuthority/graph.json` and `suite.json` are generated from `export` with the phase `cam.input` and the step label `act`. The two source-parameterised actions carry their source in the label (`PoseObserved:input`, `PoseObserved:gizmo`, `Changed:fov` to `Changed:bounds`), so the suite, which holds one shortest behaviour per (input state, step label) class, replays every source. No property reads those labels. G3 replays the suite on the live camera actor: `PoseObserved:*`, `InteractionEnded`, `SettleElapsed`, `Changed:*`, `AdoptApplied`, `AdoptDropped`, `AdoptDropped:resaved` and `EchoObserved` are camera events or its `after` transition, and the camera fields of each view are the expected snapshot. `AdoptDropped:resaved` is the same camera answer as `AdoptDropped` (`adoptionDropped`) plus the binding's re-issued edit of the person's pose, so the suite shows the re-save. `RecordOwn`, `Landed` and `ForeignWrite` do not touch the camera; the G6 binding conformance test replays those. The nightly tier also simulates `export` from a fresh seed and keeps the behaviours that reach `Quiescent` (camera idle, nothing in flight) under `out/test-results/formal/packages/camera/simulated/`, for replay beyond the suite.

No `drift.json` exists yet. `packages/camera/src/camera.machine.ts` exists, but it has no input states and no `meta.tla` actions for a manifest to hash, and the view-record binding does not exist. G3 adds the manifest with the camera's input states and G6 extends it with the binding.

Regenerate after any edit to the module or to `export`:

```bash
node tools/formal/src/cli.ts update packages/camera
```

## Bounds and limits

- TLC explores a bounded number of camera changes (`MaxRevision`) and foreign writes (`MaxForeign`). This is exhaustive checking inside that scope, not an unbounded proof. No fairness or liveness is claimed: the model does not assert that a person's pose is eventually saved.
- One view and one record. A second view of the same entry is another party's `ForeignWrite`.
- The write is abstracted to a capture and a landing. Debounce, checked-write conflicts, retries and the close fence belong to the planned `RecordSync.tla`.
- A foreign write always carries a new pose. A foreign write whose bytes equal one of this view's outstanding writes is the planned `RecordSync.tla`'s `foreign-identical-bytes` case.
- The first read of a record that an earlier session saved is a `ForeignWrite` followed by `Observe`. Framing's hold of that pose until the first frame (G5) is not modelled.
- Driver, controls adapter and gizmo internals are not modelled (formal methods blueprint, "What is not modelled"). In particular the model does not check that a person's controls update is never taken for an echo; adapter tests cover that.
- **View and file can disagree after an adoption.** If a foreign pose is adopted in `idle` while this view's own edit is still on its way to the file, the edit lands afterwards and the last writer wins: the camera shows the foreign pose and the file holds the person's earlier one until the next person command. The as-built code behaves the same way, no charter invariant covers it, and the model states no convergence property. It is recorded here so that G6 decides it deliberately. This is the idle-adoption mirror of the re-save on drop. The disagreement is reachable in the `target` model; it is only not asserted.

## Running

```bash
pnpm nx run formal:setup --tools=tlc
pnpm nx run camera:formal
pnpm nx run camera:formal:nightly
```
