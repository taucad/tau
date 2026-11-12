---
revisions: minor
cli: minor
---

A History row names who made it by type, not by string (B2). **Breaking:** `RevisionRow.actor` and `RevisionRow.trigger` are gone.

- `RevisionRow.who` is a `RevisionRowWho`: `{ kind: 'recorded', identity }` with the `RevisionIdentity` the trailer records, or `{ kind: 'unrecorded', authorName? }` with the git author of a commit Tau did not write. There is no `'unknown'` stand-in.
- `RevisionRow.capture` replaces `trigger`, as the trailer names it.
- `RevisionRow.trailer` carries the recorded `Tau-Metadata` trailer block, for diagnostics behind a debug setting.
- `tau revisions log` prints a commit's git author where it printed `unknown` for a commit Tau did not record.
