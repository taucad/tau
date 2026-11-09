---
revisions: minor
host: minor
---

Add a `sessionChanged` event to `sync.machine`, routed through the root as `{ type: 'sync', event: { type: 'sessionChanged' } }`, and the matching `sessionChanged` revision command on the host. A client sends it when the person signed in to it changes: the remote's move stream is watched afresh (a stream refused under the last session is never re-read otherwise), and a project in `failed` opens again whatever the refusal, as a freshly started root would. A client no longer needs to close and reopen the root on a sign-in or sign-out.
