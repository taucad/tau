---
filesystem: minor
---

A linked import's control plane goes from its staging into the project as `.git` (W7.3, charter D12, I6). `importControlDirectory(operationId)` names where the revisions authority writes it, inside the import's staging directory, so a discard or a sweep removes it with the staging; `commitPendingProjectDirectory` moves it into the project directory with one rename, before `tau.json` and never through the mutation pipeline, and `placeStagedControl` finishes a move a commit stopped partway through, file by file. `ImportSourcePin` takes the `linked` kind. A facts request may pass `measure: false` to be answered only from what the Project Index already holds and trusts (a committed import's recorded facts among them), reading no file.
