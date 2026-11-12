---
revisions: minor
host: minor
cli: minor
---

Restore and Switch act at once and offer Undo; neither asks first (I11).

Breaking:

- `restoreMachine` has no `confirming` state and takes no `confirm` or `cancel` event; `selectRestoreNeedsConfirmation` is removed. `computePlan` returns `{ planId, revisionId, revisionNumber }` only, and `toast.restored` carries `mode` (`restore` or `undoRestore`) and the `revisionId` whose files came back.
- `branchMachine` has no `confirming` state, no `asking` tag and takes no `confirm` or `cancel` event; `selectBranchNeedsConfirmation` is removed, `selectBranchFacet` drops `asking` and `question`, and `checkBranch` answers only where a verb lands. A _Switch_ first asks the root to cut the checkout it moves, so unsaved work is saved on the branch it leaves, then applies the other branch's tree. `toast.branch` for a switch carries `from` and `saved`.
- `RevisionStatusProjection` drops `restore.asking`, `restore.removedPathCount`, `restore.dirty`, `branchVerb.asking` and `branchVerb.question`. `switchResolved` carries `from`.
- `ProjectRevisions.switchTo(branch)` takes no `confirm` option and never answers `needs-confirmation`; the `confirm`, `cancel`, `confirmBranch` and `cancelBranch` channel requests are gone. A re-rooting switch now raises a `branch` toast.
- `tau revisions switch` has no `--force`: it saves unsaved changes on the current branch, then switches.
