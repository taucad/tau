---
__default__: minor
---

Tau Cloud storage usage and quota refusals in `@taucad/revisions` and `@taucad/host` (charter D16–D18).

- **`isStorageRefusal`** is new beside `isCeilingRefusal`: it matches the hosted remote's repository ceiling or its plan-quota refusal (`quotaRefusalMarker`, `Tau: storage quota exceeded`), which the sync scheduler and the native leg both file as `quota`. `isCeilingRefusal` keeps its meaning (the ceiling only), which a surface uses to withhold _Upgrade_, since no plan raises the ceiling.
- **`readRemoteStorageOverHttp(apiBaseUrl, auth, projectId)`** reads `GET /v1/projects/:projectId/usage` as a `RemoteStorage`. `RemoteStorage` gains an optional `retained` figure: retired pack bytes kept for recovery, never counted against `quota`.
- **`remoteStorage`** is a new optional `RevisionEffectsOptions` supplier. `@taucad/host`'s `createProjectRevisions` supplies it for a Tau Cloud credential.
- **`remote.machine`** reads storage on every arrival at `connected` and again on the new `{ type: 'pushed' }` event, which `sync.machine` forwards after a push that moved a ref. A read that finishes after a `quotaRefused` carrying figures is dropped. `connected` now has `reading` and `settled` children; `selectRemoteFacet`'s `phase` is unchanged.
- The native leg names an over-quota push's large files largest first and at most ten, as the server does.

### Breaking changes

- **`RemoteActors`** requires a `readStorage` actor. A host that provides every remote actor itself adds one (`createAsyncLogic` resolving `RemoteStorage | undefined`); hosts built on `createRevisionEffects` get it from the effects.
- **`RemoteMachineEvent`** gains `pushed`, so an exhaustive `switch` over it needs a case.
