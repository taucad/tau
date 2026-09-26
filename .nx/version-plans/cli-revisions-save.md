---
cli: minor
host: minor
revisions: minor
---

Add `tau revisions save`, which records a project's files as a revision and backs it up through the same machines as the app's Save, and the `save()` verb on `openProjectRevisions` behind it. Revisions recorded through `openProjectRevisions` are now authored by the person running the host rather than `tau-host`.

- **`RevisionSaveOutcome`** has a `timedOut` status for a cut that did not answer in time, and a `saved` outcome's `backup` can be `timedOut` when the push did not answer in time: neither is a refusal or a failure, because the save may still land. `tau revisions save` exits `4` (unknown) with `SAVE_TIMED_OUT` or `BACKUP_TIMED_OUT` for them.
- **Project id default.** `createProjectRevisions` (`tau serve`), `openProjectRevisions` (`tau revisions`, `tau publish`) and `createProjectRevisionPort` now all default `projectId` to `tau.json`'s `id` when it matches `^[\w-]+$`, and to the directory name otherwise (a malformed id is warned about once). A project in a directory not named after its id therefore moves: its linked checkouts to `<config directory>/checkouts/<id>` (`~/.config/tau` on Linux), its remote-move stream to that id, and its Tau Cloud connect URL to `/v1/git/<id>.git`.
- **`tauRemoteUrl`** throws `RevisionPortError` `INVALID_TRANSPORT` for a project id outside `^[\w-]+$` (for example `../x`) instead of building a URL from it.
- **`RevisionStreamMove.heads`** is new: for each ref whose newest stream entry named it, the head it moved to. A device that already holds every announced head skips the fetch its own push's echo would otherwise cost.
- **Correlated `syncNow`.** A `syncNow { pushId }` that arrives while `sync.machine` is pushing or recording is now answered by the next push, which starts after the request and so carries the head current at it, rather than by the push already in flight. It is answered exactly once however the running push ends (settled, thrown, abandoned by `open`, or cut off by a disconnect).
- **Native tracking refs.** A native `push` now writes `refs/remotes/<remote>/*` for every accepted ref outside `refs/heads/*` (which git tracks itself), at the oid the ref named before the push was spawned, and reports each ref's `head` from that same oid, so a mint racing the push is never recorded as held by the remote.
