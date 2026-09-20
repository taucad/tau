# Revisions Cloud Architecture

The public contract for the server side of Tau Cloud sync: how a request flows, the constants the code
enforces, what each refusal means, and what is deliberately absent.

Operating the deployed system — status, per-environment configuration, process sizing, what to watch,
the runbooks, capacity and the deployment gates — is operational and lives in Tau's private operations
handbook at `docs/handbooks/cloud/` (`system/services/revisions-maintenance.md`,
`system/services/object-storage.md`, `operate/storage-maintenance.md`, `operate/verified-erasure.md`),
maintained with the `create-handbook` skill. That path resolves only in a checkout that has the
private handbook.

Tau Cloud sync is not open to users: the deployment gate of the
[git storage substrate charter](../research/git-storage-substrate-charter.md) is still open.

Architecture: [workspace filesystem and revisions](workspace-filesystem-and-revisions.md).
Normative rules: [revisions policy](../policy/revisions-policy.md).

---

## 1. What the system is, in one page

- A Tau project's cloud copy is a git repository. Its durable state is a set of immutable pack
  objects and one small manifest in the private object-storage bucket, under
  `tenants/<ownerId>/repos/<projectId>/`.
- The API's git endpoint is stock git. Each request copies the repository into a throwaway directory
  (a **lease**), runs `git upload-pack` or `receive-pack --stateless-rpc`, and, for a push, uploads
  new packs and replaces the manifest with a conditional write. The client is acknowledged only
  after that write.
- Any number of API workers serve any repository. There is no shared disk and no lock; a race is
  decided by the store (`412`), and the loser answers `503`, which the client retries.
- Large files are Git LFS objects, uploaded by the browser straight to the store on presigned URLs
  under `tenants/<ownerId>/lfs/<projectId>/`.
- Publications are a derived projection of a tagged revision into the public CDN bucket and the
  private bucket; they can be rebuilt from the repository. A publication is repaired by the first
  read of it, and its derived marker advances only on a git request.
- A repository **exists once its first push commits a manifest**. Registering a project no longer
  creates one, so a registered project with no push has no prefix and no bytes.
- Retired packs are kept 30 days, which is the recovery window for a logical error, and prefix
  deletion has one narrow gated path.
- Postgres holds ownership, collaborators, entitlement and accounting. It never holds file content
  or refs.

## 2. Request flows

### Push

1. `authorize`: session → user; project → owner or collaborator with `write`; owner's entitlement and
   quota. The answer is cached per process for 5 s, keyed by project and user; a membership change
   can be that stale on a replica that did not serve the write.
2. Read the manifest and its commit token.
3. Build the lease: empty bare directory, one `pre-receive` hook installed, packs fetched (with their
   stored `.idx` files), `packed-refs` written with peeled tags; `transfer.unpackLimit=1`,
   `receive.autogc=false`, `gc.auto=0`, `maintenance.auto=false`. Admission refuses the lease when
   `concurrent leases × 2.5 GiB` exceeds the free bytes `statfs` reports. Leases live under
   `tau-git-leases/<pid>/` in the machine's temporary storage, and **any** worker reclaims a **dead**
   worker's directories: `sweepAbandonedLeases()` (`apps/api/app/api/git/git.service.ts:709`) probes
   each sibling `<pid>` with signal 0 and removes only those answering `ESRCH`, counting `EPERM` as
   alive so two API processes on one machine never sweep each other. It runs on service init
   (`:238`) **and before every admission** (`:753`), logging the count and bytes it freed. So a worker
   killed mid-push leaks nothing for longer than the next admission anywhere on the machine, and the
   reclaim does not wait for the killed worker to come back. A normal push disposes of its lease
   itself.
4. Run `git receive-pack --stateless-rpc`; the hook enforces the ref allow-list, fast-forward-only for
   every ref family, the per-owner quota backstop and the per-repository byte ceiling. The HTTP
   response is withheld.
5. Compare the lease's refs with the manifest. Equal: relay git's report and stop.
6. Preconditions (no loose objects; connectivity over the refs and packs to be named); compaction if
   the live pack count exceeds 8; upload new packs under unique keys; owner-locked quota recheck;
   conditional manifest write with `committedBy`.
7. Relay git's report-status bytes **verbatim**. On a lost write: discard, answer `503`.
8. Derived state: `project_git` bytes and generation, LFS reachability marks, publication
   materialization for moved tags. A generation mismatch seen by any later request re-derives them;
   no job reconciles.

### Fetch and advertisement

Read the manifest, build the lease, run `git upload-pack`. Every POST re-reads the manifest; a worker
never serves refs it has not revalidated.

### Deletion

Account deletion writes a tombstone row before the owning rows cascade, and replaces the manifest
with a tombstone by conditional write. The purge job removes the tenant's prefixes after the window.
A tombstoned repository answers `410`.

## 3. Code constants

Configuration names are declared by `apps/api/app/config/environment.config.ts`; which value each
environment carries is operational and lives in the private handbook.

These are code constants rather than configuration, in
`apps/api/app/api/git/store/limits.ts` unless a row names another file:

| Constant                                                                     | Value               | Why                                                                                                    |
| ---------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------ |
| `repositoryByteCeiling`                                                      | 1 GiB (`1024 ** 3`) | D20. A hydration guard, not a billing guard — the owner's plan allowance binds the bill first          |
| `livePackBound`                                                              | 8                   | D33, from W0a                                                                                          |
| `leaseDiskBytesPerLease`                                                     | 2.5 GiB             | D33. Hydration peaks at 1.00× the repository, a full `repack -a -d` at 1.99×, plus quarantine headroom |
| `retentionWindowMilliseconds`                                                | 30 days             | Retired-pack retention and the tombstone wait                                                          |
| `lfsRetirementWindowMilliseconds` (`apps/api/app/api/git/lfs-retirement.ts`) | 30 days             | Unreachable finalized LFS objects                                                                      |
| `abandonedReservationWindowMilliseconds` (same file)                         | 24 h                | Unfinalized LFS reservations — the second half of what `retire-lfs` selects                            |

The deployed process groups are declared in `apps/api/fly.staging.toml` and `apps/api/fly.prod.toml`:
a stateless `app` group with no mount, and single-machine groups for maintenance and the billing
workers. `TAU_GIT_ROOT` is retired and boot refuses it. Sizing, counts and the reasoning behind them
are operational.

## 4. Refusals and what they mean

Server codes and the class each raises in `packages/revisions/src/remotes.ts`:

| Server code                       | Status                 | Client class                                                   | User sees                                                                                                                                                                                                                                                   |
| --------------------------------- | ---------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GIT_SERVICE_UNKNOWN`             | 400                    | —                                                              | `info/refs` without `?service=`. Dumb HTTP is gone; a stock client that lands here is misconfigured                                                                                                                                                         |
| `GIT_SYNC_NOT_ENTITLED`           | 403                    | `REMOTE_NOT_ENTITLED`                                          | _Upgrade_                                                                                                                                                                                                                                                   |
| `PROJECT_ROLE_INSUFFICIENT`       | 403                    | `REMOTE_FORBIDDEN` (terminal, `syncFailureReason` `forbidden`) | the server's own sentence from the transport, "This project needs write access."; on _Connect_, the registration route's "Only the project owner can back this project up to Tau Cloud." Never _Upgrade_ — the collaborator's plan is not what refused them |
| `PROJECT_NOT_FOUND`               | 404                    | `REMOTE_NOT_FOUND`, terminal                                   | a non-member is told the project does not exist, deliberately                                                                                                                                                                                               |
| `GIT_REPOSITORY_NOT_FOUND`        | 404                    | `REMOTE_NOT_FOUND`, terminal                                   | the project is registered but has never committed a manifest                                                                                                                                                                                               |
| `GIT_REPOSITORY_DELETED`          | 410                    | `REMOTE_NOT_FOUND`, terminal                                   | "This project has been deleted." The sync machine stops                                                                                                                                                                                                     |
| `GIT_QUOTA_EXCEEDED`              | 413                    | `REMOTE_QUOTA_EXCEEDED`                                        | the owner's plan allowance, with the shortfall                                                                                                                                                                                                              |
| `GIT_REPOSITORY_CEILING_EXCEEDED` | 413                    | `REMOTE_QUOTA_EXCEEDED`                                        | the server's sentence and the affected files                                                                                                                                                                                                                |
| `GIT_PUSH_NOT_COMMITTABLE`        | 422                    | `REMOTE_REJECTED`                                              | the remote's own words, action _Sync now_                                                                                                                                                                                                                   |
| `GIT_REPOSITORY_INCOMPLETE`       | 500                    | `REMOTE_UNAVAILABLE` (retried)                                 | _Not backed up_, queued — **but no retry can fix it**: the manifest names a pack the store does not hold. The repository has to be restored by an operator                                                                                                  |
| `GIT_PUSH_RACE_LOST`              | 503 + `Retry-After: 5` | `REMOTE_UNAVAILABLE` (retried)                                 | _Not backed up_, queued; clears on its own                                                                                                                                                                                                                  |
| `GIT_LEASE_DISK_FULL`             | 503 + `Retry-After: 5` | `REMOTE_UNAVAILABLE` (retried)                                 | _Not backed up_, queued; clears when a lease frees disk                                                                                                                                                                                                     |

A `pre-receive` refusal carries **no** HTTP status, so two rules hold together. The server relays the
hook's report-status bytes verbatim (NI13), and the client classifies the D20 ceiling refusal by the
fixed marker the hook opens it with:

```ts
// packages/revisions/src/refusal-markers.ts:20 — and apps/api/app/api/git/git.constants.ts:146,
// which names this leaf as its source. Two copies, because the API does not depend on the
// package; each is tested, and they change together.
const ceilingRefusalMarker = 'Tau: repository size limit exceeded';
```

A message carrying that marker becomes `REMOTE_QUOTA_EXCEEDED` (`syncFailureReason` `quota`, whose one
action is **Upgrade**), and carries the hook's own sentence plus the ten largest files the push adds,
printed under `Tau: the largest files it adds are:`. Every other hook refusal stays `REMOTE_REJECTED`,
whose action is _Sync now_.

The marker is read on **both** paths a `pre-receive` refusal can take, through one shared predicate:
`isCeilingRefusal` in `packages/revisions/src/refusal-markers.ts:33`, an import-free leaf re-exported
from the package index (`index.ts:104`) while the string itself stays module-private. On the native
leg the refusal arrives as a thrown transport error and `remotes.ts` classifies it (import at `:17`,
used at `:571`); on the `isomorphic-git` leg it comes back as a per-ref push result and the sync
scheduler applies the same predicate before settling the reason (`sync.machine.ts:33`, used at
`:1223`). Without that, a ceiling refusal on the browser leg would show the right sentence under the
wrong button — and _Sync now_ is the one thing that cannot clear a ceiling, because the retry pushes
the same bytes again.

## 5. Collaboration

A project has one owner; collaborators hold `read` or `write`. Bytes always land in the owner's
storage and count against the owner's plan. `committedBy` in the manifest names the pusher; the
commit author is the person the client recorded. To answer "who changed this", read the manifest for
the ref, then the commit. Registering, publishing and managing collaborators are the owner's alone —
a collaborator pressing _Connect_ is refused by role, not by plan. Revocation takes effect within the
authorization cache window (§2, step 1): 5 s per API process, and because any number of stateless
workers serve one repository, a revoked collaborator is refused by the first request after that
window on each worker. Only hits are cached, so nothing has to be invalidated across workers. A lease
in flight finishes.

Owner-facing routes: `GET`/`POST`/`PATCH`/`DELETE` `/v1/projects/:projectId/collaborators[/:email]`;
the invitee accepts at `POST /v1/invitations/:token`. Invitations are idempotent on
`(project, email)`, a re-invite un-revokes and re-issues, a `PATCH` changes a role without
invalidating a link the invitee already holds, and the rate limit is 200 invitations per owner per
day, **failing closed**.

## 6. Things that are deliberately not there

No volume, no snapshot policy, no repack cron, no nightly bundle, no `git bundle` transport, no dumb
HTTP, no `update-server-info`, no `post-receive` hook, no server-side `git gc`, no
`refs/tau/retention/records/*`, no process-local locks, no filesystem backend in development, and no
eager repository creation at registration. If a future change needs one of them, it is reopening a
ruling in the charter.
