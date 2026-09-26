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

`@taucad/host` drops `machineWorkspaceId` and `hostMachineWorkspaceId`, adds `readProjectId`, and takes a `projectId` for its print tools. Its daemon keeps serving without printers when another Tau app holds the store.

`@taucad/slicer` adds `printIntentSchema`, `readPrintIntent` and `serializePrintIntent` for a project's `.tau/machines/printer.json`.
