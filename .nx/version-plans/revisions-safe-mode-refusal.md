---
revisions: minor
---

A host can refuse its Tau Cloud remote while the app runs in safe mode. The new `RevisionPortError` code `REMOTE_SAFE_MODE` is terminal: the sync machine fails once without retrying, and reports the new `SyncFailureReason` `'safeMode'`.
