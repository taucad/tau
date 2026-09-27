---
runtime: major
host: major
slicer: major
---

Give printers a per-user machine store. `createNodeMachineHost` in `@taucad/runtime` now keeps each printer in its own folder under `storeRoot`: a strict `machine.json`, a write-ahead `operations.jsonl`, and one file per preparation and request. That replaces one journal under a synthetic workspace scope. The host imports bindings once from `legacyStoreRoots` and keeps a removed printer's history under `<machineId>.removed-<epochMs>/`.

The runtime API changes:

- `authorityRoot`, `generation` and `attachments` are removed.
- New `NodeMachineHost.issueSession` mints channel sessions.
- Channels, cursors and requests no longer carry a workspace id.
- `MachineArtifactReference` names its artifact by `projectId`, rooted `path` and SHA-256 `digest`, instead of a `revision` block.
- Request lists and watches can filter by `projectId`.
- `MachineReconcileInput` gains an optional `transferId`, which the host passes when it reconciles a start.

`@taucad/host` drops `machineWorkspaceId` and `hostMachineWorkspaceId`, adds `readProjectId`, and takes a `projectId` for its print tools. Its daemon keeps serving without printers when another Tau app holds the store.

`@taucad/slicer` adds `printIntentSchema`, `readPrintIntent` and `serializePrintIntent` for a project's `.tau/machines/printer.json`, also exported from the kernel-free `@taucad/slicer/print-intent` subpath. `buildBambuSettingsSchema` no longer marks inferred settings with `x-tau-inferred`, which parameter schema admission rejects; they remain grouped under "All other settings". `ToolpathProgram` gains `preambleSegmentCount` (the start sequence before the first layer annotation; parser version 2), and `readBambuContainer` returns the plate's recorded `bedType`. `sliceWithBambuStudio` takes an optional `filamentColor`, which the `glb → gcode.3mf` transcoder fills from the model's first material, so the sliced file records the model's colour.
