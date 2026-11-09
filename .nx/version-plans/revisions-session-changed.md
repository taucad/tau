---
revisions: minor
host: minor
---

Add a `sessionChanged` event for when the person signed in to a client changes, and the matching `sessionChanged` revision command on the host, which routes it to both `sync.machine` and `remote.machine` through the root. `sync.machine` takes it like a reopen: with a remote it re-enters `opening` from any state, so an answer still in flight under the last session is dropped, the move stream is subscribed afresh (a stream refused under the last session is otherwise never re-read), the remote is fetched, and a project in `failed` opens again whatever the refusal. While quiescing it is held and read on release. `remote.machine` drops the stored-size figure the last session read and reads it again. A client no longer needs to close and reopen the root on a sign-in or sign-out.
