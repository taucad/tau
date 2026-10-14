---
revisions: patch
agent-host: patch
---

Refuse a branch rename that would leave half of it behind. A rename moves only the branch's name, so it is now refused before anything is written when a linked checkout holds the branch (the checkout is named by its branch and would be left on a name with no revision) or when a configured remote already holds it (no push removes the old name there). A branch only this device holds renames as before.

- **`RevisionPortErrorCode`** (`@taucad/revisions`) gains `BRANCH_RENAME_LINKED` and `BRANCH_RENAME_PUSHED`.
- **`RefusalCode`** (`@taucad/agent-host/wire`) registers both, owned by `revisions` and never retried.
