---
revisions: patch
---

A project with no revision no longer stays complete when a remote is attached to it. `readinessOf` gives the reading of a checkout with no revision and no remote a tree of its own, so once a remote is attached the next reading (`connected`, then `treeReady` while the remote's tree is written) replaces it in `settleReadiness` rather than being held below it. A cold Tau Cloud open that read its checkout before the remote was attached no longer opens the chats or the editor before the remote's entry closure lands. A local project with no revision and no remote is still complete, and a project that already has a revision reads as before.
