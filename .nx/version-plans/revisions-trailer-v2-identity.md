---
revisions: minor
host: minor
---

Every revision names who made it, how it was captured and where (B1). **Breaking:** the `Tau-Metadata` commit trailer is version 2, and a version 1 trailer is no longer read: such a commit reads as an import with no actor.

- `provenance.actor`, `provenance.capture` and `provenance.via` are required on `RevisionProvenance`, and `actorId` and `trigger` are gone. `actor` is a `RevisionIdentity`: a user, or an agent with its `runId` and the user it acted `onBehalfOf`. `via` is `'browser' | 'desktop' | 'cli' | 'serve' | 'cloud'`.
- `createRevisionActors` and `createProjectRevisionsActor` take a required `identity: RevisionCaptureIdentity` (`{ via, resolve({ runId, trigger }) }`) in place of `actorId` and `actor`; there is no fallback id. The ops log and chat refs are attributed to the same person.
- History entries carry `RecordedProvenance`, whose `actor`, `capture` and `via` are absent on a commit Tau did not write.
- `host`'s `createProjectRevisions` and `createProjectHost` take a required `via`, and `createProjectRevisions` no longer takes `actorId`. The host daemon records `serve`, or `cloud` for a cloud-owned host; `openProjectRevisions` records `cli`.
