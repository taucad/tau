---
revisions: minor
host: minor
---

Safe mode reaches the native project host. `createProjectRevisions({ safeMode: true })` and `createProjectHost({ safeMode: true })` refuse every Tau Cloud leg before any request: fetch, push, ref listing and large-object reads for the Tau remote. The remote long poll, storage read, registration and publication are off. Other Git remotes and local history are unaffected. `@taucad/revisions` exports the shared gate, `withoutTauCloud(port)`, and its refusal, `safeModeRefusal()`.
