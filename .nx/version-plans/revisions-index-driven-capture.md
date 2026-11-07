---
revisions: minor
---

A cut or comparison on a checkout whose filesystem has a Project Index starts from the last capture and reads only what the index changed and removed since (S10), on hosts without a complete change feed too. The checkout's memos keep the index's epoch and generation from before each capture; a `rescan` (a reload past the cursor, another epoch), no cursor, a memo-bypassing capture, changed ignored paths, or a head whose modes disagree with the last capture walks everything, so an empty answer is never read as nothing changed. A complete change feed still wins where it names the paths.
