---
revisions: minor
---

A project with no revision no longer stays complete when a remote is attached to it. `readinessOf` gives the reading of a checkout with no revision and no remote a tree of its own, so once a remote is attached the next reading (`connected`, then `treeReady` while the remote's tree is written) replaces it in `settleReadiness` rather than being held below it. A cold Tau Cloud open that read its checkout before the remote was attached no longer opens the chats or the editor before the remote's entry closure lands.

A local project with no revision and no remote is still complete, and so is one whose connect failed and left no remote (a refused or offline _Back up to Tau Cloud_), which reads complete again rather than waiting for a remote that is not there. A project that already has a revision reads as before.

`RemoteFacet.reading` is `true` while the remotes list is still being read, or its read is waiting to be asked again: whether a remote is recorded is not known yet, and a checkout with no revision reads `connected` until it is, rather than complete.

`RemoteFacet` gains an optional `reading?: true` while the remotes list is still being read or retried; a checkout with no revision reads `connected` until that read settles, and a connect that fails and leaves no remote reads as local again.
