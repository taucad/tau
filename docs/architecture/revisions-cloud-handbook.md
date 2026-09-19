# Revisions Cloud Handbook

## Status

**Current** (2026-09-18) — the operating manual for Tau Cloud sync's server side, promoted from
[docs/research/git-storage-substrate-handbook.md](../research/git-storage-substrate-handbook.md) by
work package W9 of the [git storage substrate charter](../research/git-storage-substrate-charter.md),
with the measured values filled in from W0a, W0b, W2, W4, W6 and W8.

The application layer is complete and proven locally and in CI. The charter's **deployment gate
(DG1–DG4)** is open: there is no independent second copy, no staging proof, and nothing has been
applied. **Sync is not open to users until that gate closes** (§9). Every number below was measured
on a developer machine, or against the staging scratch bucket, and none of it comes from the deployed
region — which is exactly what DG2 and DG3 are for. W10's proof run (2026-09-18) closed S1, S2, S5–S11
locally and wrote the staging re-run script the gate executes; §9 step 11 is that script.

Architecture: [workspace filesystem and revisions](workspace-filesystem-and-revisions.md).
Normative rules: [revisions policy](../policy/revisions-policy.md).

---

## 1. What the system is, in one page

- A Tau project's cloud copy is a git repository. Its durable state is a set of immutable pack
  objects and one small manifest in the private R2 bucket, under
  `tenants/<ownerId>/repos/<projectId>/`.
- The API's git endpoint is stock git. Each request copies the repository into a throwaway directory
  (a **lease**), runs `git upload-pack` or `receive-pack --stateless-rpc`, and, for a push, uploads
  new packs and replaces the manifest with a conditional write. The client is acknowledged only
  after that write.
- Any number of API workers serve any repository. There is no shared disk and no lock; a race is
  decided by the store (`412`), and the loser answers `503`, which the client retries.
- Large files are Git LFS objects, uploaded by the browser straight to R2 on presigned URLs under
  `tenants/<ownerId>/lfs/<projectId>/`.
- Publications are a derived projection of a tagged revision into the public CDN bucket and the
  private bucket; they can be rebuilt from the repository. A publication is repaired by the first
  read of it, and its derived marker advances only on a git request.
- A repository **exists once its first push commits a manifest**. Registering a project no longer
  creates one, so a registered project with no push has no prefix and no bytes.
- **There is no second copy yet.** R2 is the only store. Retired packs are kept 30 days, which is the
  recovery window for a logical error, and prefix deletion has one narrow gated path. Loss of the
  Cloudflare account has no answer until the deferred copy is built.
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
   `tau-git-leases/<pid>/` in the Machine's temporary storage, and **any** worker reclaims a **dead**
   worker's directories: `sweepAbandonedLeases()` (`apps/api/app/api/git/git.service.ts:709`) probes
   each sibling `<pid>` with signal 0 and removes only those answering `ESRCH`, counting `EPERM` as
   alive so two API processes on one Machine never sweep each other. It runs on service init
   (`:238`) **and before every admission** (`:753`), logging the count and bytes it freed. So a worker
   killed mid-push leaks nothing for longer than the next admission anywhere on the Machine, and the
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

## 3. Configuration

Names confirmed against `apps/api/app/config/environment.config.ts` on 2026-09-18.

| Setting                                                                                                                                                                               | Meaning                                                                                                                                                                          | Local                                                             | Staging / prod                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| `TAU_S3_ENDPOINT`, `TAU_S3_REGION`, `TAU_S3_ACCESS_KEY_ID`, `TAU_S3_SECRET_ACCESS_KEY`, `TAU_S3_BUCKET`, `TAU_S3_PRIVATE_BUCKET`, `TAU_S3_PUBLIC_BASE_URL`, `TAU_S3_FORCE_PATH_STYLE` | Tau's default storage account                                                                                                                                                    | MinIO from `pnpm infra:up`                                        | Fly secrets pushed by `module.fly_api_secrets` in `repos/tau-cloud` |
| `TAU_S3_RESTORE_ENDPOINT`, `_BUCKET`, `_ACCESS_KEY_ID`, `_SECRET_ACCESS_KEY`, optional `_REGION` (default `auto`) and `_FORCE_PATH_STYLE` (default true)                              | A store the `restore` command may read from. Read by `maintenance-command.ts` alone, deliberately **not** in the boot schema, so an `app` replica never carries them             | the `tau-content-restore` MinIO bucket, used by `restore.test.ts` | unset until the copy exists (DG1)                                   |
| `TAU_S3_CONFORMANCE_*`                                                                                                                                                                | Optional credentials that un-skip the port conformance suite's R2 half. Absent in CI by policy (D32)                                                                             | unset                                                             | never set in GitHub Actions                                         |
| `TAU_GIT_ROOT`                                                                                                                                                                        | **Removed.** Present, boot refuses with "TAU_GIT_ROOT is retired: repositories live in object storage and leases are ephemeral. Remove it, and remove the volume mount with it." | —                                                                 | —                                                                   |
| `TAU_GIT_BACKUP_INTERVAL_HOURS`                                                                                                                                                       | **Removed** with the bundle job                                                                                                                                                  | —                                                                 | —                                                                   |

Values that are code constants rather than configuration, in
`apps/api/app/api/git/store/limits.ts` unless a row names another file:

| Constant                                                                     | Value               | Why                                                                                                    |
| ---------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------ |
| `repositoryByteCeiling`                                                      | 1 GiB (`1024 ** 3`) | D20. A hydration guard, not a billing guard — the owner's plan allowance binds the bill first          |
| `livePackBound`                                                              | 8                   | D33, from W0a                                                                                          |
| `leaseDiskBytesPerLease`                                                     | 2.5 GiB             | D33. Hydration peaks at 1.00× the repository, a full `repack -a -d` at 1.99×, plus quarantine headroom |
| `retentionWindowMilliseconds`                                                | 30 days             | Retired-pack retention and the tombstone wait                                                          |
| `lfsRetirementWindowMilliseconds` (`apps/api/app/api/git/lfs-retirement.ts`) | 30 days             | Unreachable finalized LFS objects                                                                      |
| `abandonedReservationWindowMilliseconds` (same file)                         | 24 h                | Unfinalized LFS reservations — the second half of what `retire-lfs` selects                            |

Process groups on Fly (`apps/api/fly.staging.toml`, `fly.prod.toml`):

- `app` — N ≥ 2, stateless, **no `[[mounts]]`**. The rootfs is the capacity knob the volume used to
  be: at 2.5 GiB per lease, Fly's default 8 GiB rootfs is three ceiling-sized leases by arithmetic
  and two in practice once the image and the pruned deploy tree are subtracted. Admission reads the
  real free bytes, so the figure self-corrects and is not a contract. Raise the rootfs before raising
  the ceiling. A `rolling` deploy replaces a Machine, but a _crash_ restarts it in place on the same
  rootfs, which is why the lease parent is `tau-git-leases/<pid>/` and every worker sweeps dead
  workers' directories at boot and before each admission (§2, step 3).
- `revisions-maintenance` — exactly one Machine, a loop of `purge`, `retire-lfs` and `collect-blobs`, in that order
  with a 24 h `sleep`. `assertSingletonProcessGroup` refuses every subcommand in the `app` group.
  Deliberately outside `[[metrics]]` and with no health check: its only failure signal is a non-zero
  exit into Fly's restart policy.
- `billing-operations`, `billing-recovery` — unchanged, one Machine each.
- `[deploy] strategy = 'rolling'`. Not `bluegreen`: a green set would run two maintenance Machines
  for the length of a deploy, which D21 forbids.

## 4. What to watch

| Signal                                                                           | Healthy                                                                                                                                                                                                                                                    | Investigate                                                                                                                                                                          |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Push acknowledgement latency p50 / p95                                           | within Rule 20 (mint → push issued ≤ 2.1 s). The server's own share, measured by W10 under sustained load on a developer machine over MinIO: **p50 541 ms, p95 620 ms, max 716 ms**, well inside the budget. **The deployed-region figure is owed at DG2** | p95 above budget for 10 minutes                                                                                                                                                      |
| Manifest write outcomes: committed / lost (`412`) / throttled (`429`) per minute | lost and throttled well under 1% of committed. W0b saw **zero** `429`s across 193 sequential CAS writes and 8 × 50 concurrent racers on one key                                                                                                            | either above 1%, or any repository above 5 per minute                                                                                                                                |
| Store errors (5xx, timeouts) from R2                                             | zero                                                                                                                                                                                                                                                       | any sustained run: see runbook R1                                                                                                                                                    |
| Hydration time p95                                                               | warm fetch settles in **131–233 ms** at 100 ms injected latency (W0a); W2 measured a small repository's hydrate at **85–100 ms**. A cold hydrate at the 1 GiB ceiling is **≈4–5 s**, download-bound, after D33's stored indexes                            | p95 near the cold figure for repositories that are not at the ceiling                                                                                                                |
| Packs per repository p99                                                         | at or under 8                                                                                                                                                                                                                                              | p99 pinned at 8 means compaction is not running                                                                                                                                      |
| Orphan bytes (unlisted objects older than threshold)                             | near zero, sweeps keep it flat                                                                                                                                                                                                                             | growing: see runbook R3                                                                                                                                                              |
| Retired-pack age spread                                                          | oldest retired pack under 30 days                                                                                                                                                                                                                          | older: the sweep is not running, and the recovery window is silently longer than it looks                                                                                            |
| Purge job outcomes                                                               | plans and deletes only what a tombstone authorized                                                                                                                                                                                                         | any refusal for exceeding the 10 000-object bound: stop and read runbook R6 before confirming                                                                                        |
| `project_git` generation behind manifest                                         | transient only. W10 measured the repair's read cost as immaterial at this size: an advertisement through the worker that did _not_ push took **138 ms** against **134 ms** warm                                                                            | persistent rows: derived-state repair is failing                                                                                                                                     |
| Postgres authorization query rate and pool wait                                  | W10's S9 run held **87.7 transactions/s ≈ 22 per push** at 3.97 pushes/s across two workers, with no pool wait recorded. That ratio is what D22's 5 s cache buys; read it again on staging                                                                 | a rate materially above 22 per push means the cache is missing; pool waits mean lengthen the cache before adding workers                                                             |
| `tau-git-leases/<pid>/` siblings whose process is gone                           | none for longer than the next admission: any worker sweeps dead workers' directories at boot and before every admission, and logs what it freed                                                                                                            | a `<pid>` directory surviving admissions on a live Machine: the sweep is not firing, and at D20's ceiling each stale lease is up to 1 GiB of admission nobody gets back              |
| `GIT_REPOSITORY_INCOMPLETE` (500) per repository                                 | zero                                                                                                                                                                                                                                                       | any at all: that repository is structurally broken — the manifest names a pack the store does not hold — and every client is retrying it silently on the 5 s→300 s backoff. Go to R5 |
| Lease disk in use per worker                                                     | under `concurrent leases × 2.5 GiB`                                                                                                                                                                                                                        | at the bound: the worker refuses with `GIT_LEASE_DISK_FULL` (503, `Retry-After: 5`); scale out                                                                                       |
| `revisions-maintenance` Machine restarts                                         | zero                                                                                                                                                                                                                                                       | a restart is the group's only failure signal — read `fly logs -p revisions-maintenance`                                                                                              |

## 5. Refusals and what they mean

Server codes and the class each raises in `packages/revisions/src/remotes.ts`:

| Server code                       | Status                 | Client class                                                   | User sees                                                                                                                                                                                                                                                   |
| --------------------------------- | ---------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GIT_SERVICE_UNKNOWN`             | 400                    | —                                                              | `info/refs` without `?service=`. Dumb HTTP is gone; a stock client that lands here is misconfigured                                                                                                                                                         |
| `GIT_SYNC_NOT_ENTITLED`           | 403                    | `REMOTE_NOT_ENTITLED`                                          | _Upgrade_                                                                                                                                                                                                                                                   |
| `PROJECT_ROLE_INSUFFICIENT`       | 403                    | `REMOTE_FORBIDDEN` (terminal, `syncFailureReason` `forbidden`) | the server's own sentence from the transport, "This project needs write access."; on _Connect_, the registration route's "Only the project owner can back this project up to Tau Cloud." Never _Upgrade_ — the collaborator's plan is not what refused them |
| `PROJECT_NOT_FOUND`               | 404                    | `REMOTE_NOT_FOUND`, terminal                                   | a non-member is told the project does not exist, deliberately                                                                                                                                                                                               |
| `GIT_REPOSITORY_NOT_FOUND`        | 404                    | `REMOTE_NOT_FOUND`, terminal                                   | the project is registered but has never committed a manifest                                                                                                                                                                                                |
| `GIT_REPOSITORY_DELETED`          | 410                    | `REMOTE_NOT_FOUND`, terminal                                   | "This project has been deleted." The sync machine stops                                                                                                                                                                                                     |
| `GIT_QUOTA_EXCEEDED`              | 413                    | `REMOTE_QUOTA_EXCEEDED`                                        | the owner's plan allowance, with the shortfall                                                                                                                                                                                                              |
| `GIT_REPOSITORY_CEILING_EXCEEDED` | 413                    | `REMOTE_QUOTA_EXCEEDED`                                        | the server's sentence and the affected files                                                                                                                                                                                                                |
| `GIT_PUSH_NOT_COMMITTABLE`        | 422                    | `REMOTE_REJECTED`                                              | the remote's own words, action _Sync now_                                                                                                                                                                                                                   |
| `GIT_REPOSITORY_INCOMPLETE`       | 500                    | `REMOTE_UNAVAILABLE` (retried)                                 | _Not backed up_, queued — **but no retry can fix it**: the manifest names a pack the store does not hold. Restore the repository (R5)                                                                                                                       |
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

## 6. Runbooks

### R1. R2 is failing writes or reads

Nothing to do to the data: pushes fail closed and clients show "Not backed up" and queue; fetches
fail and open renders local state. Confirm on the Cloudflare status page; confirm that the `503` rate
rises and the `412` rate does not (a rising `412` rate is a Tau bug, not an outage). When R2
recovers, queued clients drain on their own. Do not restart workers.

### R2. Lost-write (`412`) or throttle (`429`) storm on one repository

Expected in small numbers when two devices or two collaborators push at once. R2's same-key limit is
a **concurrency** bound, not a rate bound: W0b's `429` bodies read "Reduce your concurrent request
rate for the same object" with `retry-after: 5`, surfaced by the SDK as `ServiceUnavailable`, and a
CAS chain never trips it. **The effective retry budget for a rate-limited manifest key is nine store
calls, not three** (W10): the AWS SDK's own three attempts are consumed inside each of the protocol's
three `manifestWriteAttempts`, so three `429`s are absorbed and the push still wins, and nine exhaust
the budget and answer `503`. At R2's `retry-after: 5` that is a long time to hold a push whose
response is withheld until the commit, which is the reason to watch the `429` rate rather than trust
the budget. Sustained on one repository: read `committedBy` in the manifest to see who
is racing; a single client looping is a client bug. Sustained across many repositories: the retry
budget is wrong or compaction is committing too often; check the pack bound.

### R3. Orphan bytes growing

Orphans are packs uploaded by pushes that lost their commit or died. The lease holder sweeps its own
prefix at compaction; growth means compaction is not running (see R2) or the sweep threshold is
misconfigured. Never lower the threshold below the commit deadline plus clock skew.

### R4. There is no second copy

A standing condition, not an incident. While DG1 is open, the recovery point for anything short of
account loss is the 30-day retired-pack window, and account loss is unrecoverable. Two consequences:
never grant a delete-capable R2 token to anything but the purge path, and treat any unexplained drop
in object count as an incident rather than a metric.

### R5. Restore a repository

```
node /app/dist/maintenance-command.js restore --project <id> --owner <id> [--operator <you>]
```

It reads the newest manifest for the repository from the restore source (`TAU_S3_RESTORE_*`), fetches
the packs it names, writes a **new** manifest into the primary with a fresh incarnation nonce and a
generation higher than any seen, and verifies with a lease (`git fsck --strict` and `for-each-ref`
against the copied manifest). It never deletes and never rewrites an old manifest in place, so a
wrong restore is corrected by restoring again. Follow it with a hydrate — a clone or fetch — to
confirm the repository serves. There is no way to name a generation: `restore` always reads the
source's current manifest. Restoring from `manifests/<n>-…` arrives with DG1's copy job, which is
what writes those keys (`maintenance/restore.ts:103-109`).

W10's local run: **473 ms**, `committedBy: "restore:w10-proof"`, **generation 1 → 2**, a fresh
incarnation nonce, `tombstone: null` — and the repository was then rebuilt from its packs and that
manifest alone with stock git, `git fsck --strict` exit 0 and `for-each-ref` carrying `refs/heads/main`
and `refs/tags/v1` with its peel, head equal to the one the client was acknowledged for. The copy into
the restore bucket that preceded it took **662 ms**.

Without `TAU_S3_RESTORE_*` the subcommand refuses; purge and collection are unaffected.

### R6. Purge a tenant on a verified erasure request

Order matters, and the first step refuses out of order:

1. `mark-erasure --owner <id>` — **only after the account is deleted**. The command _updates_ an
   existing tombstone and refuses to create one, because a tombstone for a live owner would aim the
   purge at a live tenant, which is exactly what D31 exists to prevent.
2. `purge --dry-run` — read the plan. It lists `tenants/<ownerId>/repos/` and
   `tenants/<ownerId>/lfs/`, counts objects and bytes, and derives project ids **from the storage
   keys**, because the tombstone outlives the rows the cascade removed.
3. `purge`, or `purge --confirm <ownerId>` when the plan is above 10 000 objects for that owner.
   Above the bound an unnamed owner is skipped and recorded as `refused`, and the pass continues.
4. Verify the tenant prefix lists empty in the primary.

Shapes and timings from W10's local run, so a slow step is recognisable: `mark-erasure` **524 ms**
(it collapses a `purge_after` that was 30 days out to now), `purge --dry-run` **485 ms** returning
`status: "planned"`, `deleted: 0` with the objects still listed, and `purge` **475 ms** removing
**3 objects / 2 341 bytes** across `…/repos/` and `…/lfs/`, after which `aws s3 ls` on the tenant
prefix is empty. A real tenant is larger; the shapes are what to match, not the milliseconds.

**Before go-live, run the LFS relocation first** (R7); until a tenant's objects are under its tenant
prefix, purge misses that tenant's legacy bytes under `blobs/git-lfs/<projectId>/…`. The fix is the
relocation run, not a purge change.

### R7. Relocate legacy LFS objects (once, before go-live)

Every project with rows in `project_git_lfs_object` written before the tenant layout needs
`relocateLegacyLfsObjects({ database, storage }, { ownerId, projectId })` once. It is safe to repeat
and safe while serving. Inventory:

```sql
select p.owner_id, o.project_id, count(*)
from project_git_lfs_object o
join project p on p.id = o.project_id
group by 1, 2;
```

There is no inventory of orphan legacy keys (bytes with no row); those are left to the tenant purge,
which is another reason to run the relocation before the first purge.

### R8. LFS retirement

`retire-lfs [--dry-run]`. Due rows are those whose `unreachable_at` is older than the 30-day window,
plus unfinalized reservations older than the abandoned-reservation window. It is in the maintenance
loop and has **no other caller anywhere in the app** — no `@Cron`, no scheduler — so a loop that
omits it is a retirement that never happens. `--dry-run` selects and prints the due rows without
hydrating a lease or deleting anything.

### R9. Rotate storage credentials

Rotate the Cloudflare account token in Terraform (`repos/tau-cloud`), apply under the manual-apply
policy, redeploy the API — secrets are read at boot. Old leases finish with old credentials; new
requests use the new.

### R10. Scale

Add `app` Machines (`fly scale count app=N`; `min_machines_running` governs autostop, not the count).
Nothing else changes. If Postgres pool waits rise first, lengthen the D22 authorization cache before
adding workers. Never scale `revisions-maintenance` above one.

### R11. Incident checklist

1. Which rate moved: `503` (store or lease disk), `412` (race), `429` (concurrency on one key), 5xx
   from Tau (bug)?
2. Is it one tenant, one repository, or global?
3. Has any acknowledged push been lost? Compare a client's advertised refs with the manifest; if the
   manifest is behind an acknowledged push, that is a P0: stop the purge and collection jobs and
   preserve the prefix. W10 killed a worker on the wire at **four of the commit protocol's five fault
   points** — after the pack upload, before the manifest commit, after it, and mid-compaction — and
   after every kill the surviving process accepted the retry, a fresh clone was `git fsck --strict`
   clean, and the head acknowledged before the kill was still an ancestor of the head served
   afterwards. The fifth, **mid-sweep, is not reachable from outside a process**: no `DELETE` is
   issued unless a compaction retires a pack, so it is covered in-process by
   `commit.integration.test.ts` and belongs to DG3 against a repository that has retired packs.
4. Record the incident in the artifact tree with the manifests involved.

## 7. Capacity and cost

Storage cost follows bytes; request cost follows pushes (about two writes and two reads each). See
the north star's [cost model](../research/git-storage-substrate-north-star.md#scale-and-cost-model).

Two measured facts that change the arithmetic:

- **Thin packs inflate.** A chat-turn push sent 1 158 B on the wire and stored 59 941 B after
  `--fix-thin` — 51.8×. Accounting charges **stored** bytes, and compaction re-deltifies them later,
  so a fresh repository's byte count runs ahead of what its history will eventually cost.
- **Compaction is cheap at the ceiling.** `repack -a -d --keep-pack=<largest>` restores the pack bound
  in 2.8 s at the 1 GiB ceiling and uploads ~1.4 MiB rather than the gigabyte a full rewrite would.
  `--geometric=2` on git 2.55 rewrites the whole repository and is rejected.
- Round-trip times from New Zealand to staging R2, W0b: conditional `PUT` p50 697 ms, `GET` p50
  216 ms. These anchor W0a's injected-latency curve; **the figure for the deployed region (`syd`) is
  owed at DG2**.

**Sustained rate, measured (W10, S9).** 45.3 s of continuous pushing across eight repositories with
four in flight, alternating two API workers over one MinIO: **180 pushes, 0 failures**, a requested
4/s **achieved at 3.97/s**, **p50 541 ms, p95 620 ms, max 716 ms**, and Postgres at **87.7
transactions/s ≈ 22 per push**. The rate is justified as eight continuously edited projects: the push
path is three store round trips plus ~100 ms of `receive-pack`, and Rule 9 debounces each mint by 2 s.

This is a correctness and headroom check on a laptop, not a production capacity number — the store is
MinIO on the same machine, so it omits the round trip the deployed region pays. **DG2 reads the
Fly-to-R2 figure off the same run repeated from a Machine in the region** (`dg3-rerun.md` §5).

## 8. Collaboration

A project has one owner; collaborators hold `read` or `write`. Bytes always land in the owner's
storage and count against the owner's plan. `committedBy` in the manifest names the pusher; the
commit author is the person the client recorded. To answer "who changed this", read the manifest for
the ref, then the commit. Registering, publishing and managing collaborators are the owner's alone —
a collaborator pressing _Connect_ is refused by role, not by plan. Revocation takes effect within the authorization cache window (§2,
step 1): 5 s per API process, and because any number of stateless workers serve one repository, a
revoked collaborator is refused by the first request after that window on each worker. Only hits are
cached, so nothing has to be invalidated across workers. A lease in flight finishes. W10 measured it:
a revoked collaborator was refused **5 759 ms** after the revocation, which is the 5 s window plus the
request, and the refusal was `Project not found` / 404 — P55's "not yours is 404", not a 403.

Owner-facing routes: `GET`/`POST`/`PATCH`/`DELETE` `/v1/projects/:projectId/collaborators[/:email]`;
the invitee accepts at `POST /v1/invitations/:token`. Invitations are idempotent on
`(project, email)`, a re-invite un-revokes and re-issues, a `PATCH` changes a role without
invalidating a link the invitee already holds, and the rate limit is 200 invitations per owner per
day, **failing closed**.

## 9. Not built yet

Deferred by the operator on 2026-09-18 and tracked as the charter's deployment gate. Until these
close, **sync is not open to users**.

| Gate | What is missing                                                                                                                                       | What it means for you                                                                                                                                                    |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DG1  | The independent immutable copy (Backblaze B2 under compliance-mode Object Lock, per D23), its lag metric and the weekly drill                         | No backstop for account loss or a deliberate delete. The restore _mechanism_ exists and is proven against a second local bucket; DG1 adds a destination, not a mechanism |
| DG2  | Measurements needing compute in the deployed region: Fly-to-R2 latency from `syd`, and whether the Fly proxy's idle timeout cuts a buffered long push | Latency figures here are a New-Zealand round trip plus an injected-delay curve, not observed from the region                                                             |
| DG3  | Staging proof from the deployed region, plus four rows no developer machine could run                                                                 | Correctness is proven locally and in CI; deployed behaviour is not                                                                                                       |

DG3's four unrunnable rows, with the reason each was skipped and the command that closes it:

| Row                                                                        | Why it could not run locally                                                                                                                                                                                                                                          | DG3's command                                                                                                                               |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Packaged desktop tier**, and the `electron` half of the two-client suite | `desktop:build` needs `ui:build:desktop`, which was killed under load, and the two builds took free disk from 24 GiB to 19 GiB against the ≥ 25 GiB watchdog rule. W10 ran the **browser-hosted variant of the same spec** instead and that is the evidence on record | `pnpm nx run desktop-e2e:test:e2e:two-client` and the packaged tier, on a machine with headroom                                             |
| **Docker image build** with the pinned `git` / `git-lfs` on amd64          | ≈ 37 GiB per cold monorepo image build; W8 recorded the same refusal at 23 GiB free                                                                                                                                                                                   | `DOCKER_BUILDKIT=1 docker build -f apps/api/Dockerfile .`, then `apt-cache policy git git-lfs` inside the image. This is DG4 step 1 as well |
| **`fly config validate`**                                                  | `flyctl` is installed but this machine holds no token                                                                                                                                                                                                                 | `flyctl config validate -c apps/api/fly.staging.toml` and `fly.prod.toml`                                                                   |
| **The `mid-sweep` fault point**                                            | no `DELETE` is issued in the local corpus, so the injector never fires; W10 recorded it _not reached_ rather than green. The other four of W2's five fault points were killed and repaired. It is covered in-process by `commit.integration.test.ts`                  | kill a Machine during a compacting push on a repository that has retired packs                                                              |
| DG4                                                                        | Terraform apply and deploy                                                                                                                                                                                                                                            | The configuration exists and has never been applied                                                                                         |

### DG4, step by step

1. **Build the image once** and let `apt-get install` prove the two Dockerfile pins
   (`GIT_VERSION`, `GIT_LFS_VERSION`) on amd64. A rolled Debian point release fails here; bump the
   two `ARG`s and rebuild. W8 could not build it — the memory rule gates a cold monorepo image build
   on ≥ 40 GiB free and the machine had 23 GiB — so this is the first real build.
2. **`fly config validate`** for staging and prod, authenticated. W8 could not: the CLI held no
   token, and the TOMLs were asserted structurally with `tomllib` instead.
3. **Set the restore secrets** if a restore source exists:
   `fly secrets set TAU_S3_RESTORE_ENDPOINT=… TAU_S3_RESTORE_BUCKET=… TAU_S3_RESTORE_ACCESS_KEY_ID=…
TAU_S3_RESTORE_SECRET_ACCESS_KEY=…`. Fly secrets are app-wide, which is why the maintenance group
   needs nothing of its own.
4. **Deploy staging first** (`fly deploy --config apps/api/fly.staging.toml`). The release command
   still runs the billing migration; rolling replaces `app` Machines one at a time. Staging deploys
   itself on a merge to `main`, so the operator's window for step 5 is **before** the merge, not
   after.
5. **Scale**:
   `fly scale count app=2 revisions-maintenance=1 billing-operations=1 billing-recovery=1`.
   `min_machines_running = 2` governs autostop, not the count — both are needed.
6. **Confirm the singleton**: `fly machine list` shows exactly one `revisions-maintenance`, and
   `fly logs -p revisions-maintenance` shows a purge plan (`[]` on a clean tenant set) rather than the
   `app`-group refusal.
7. **Confirm the `app` group boots without a root directory**: `fly ssh console -C env | grep TAU_GIT`
   is empty on each Machine.
8. **Run the LFS relocation** (R7) for every tenant the inventory lists, before any purge.
9. **Destroy the orphaned volumes by hand**: `fly volumes list`, then `fly volumes destroy <id>` for
   each `tau_git_data`. `fly deploy` will not remove them and Fly bills their provisioned size. **Only
   after** a push and a clone have been verified against the deployed API.
10. **Repeat 4–9 for `prod-us`**, which is out of scope for every apply in this charter and belongs to
    operator item O4.
11. **Re-run DG3's list.** W10 ran the whole of it locally on 2026-09-18 and wrote the staging
    substitutions down, so DG3 is execution rather than design. The script is
    `execution/W10/dg3-rerun.md` in the charter's artifact tree; its shape, with **[staging]** marking
    every line that changes and why:

    | #   | Row                                                         | Local run and result                                                     | What changes on staging                                                                                                                                                                                                                                                                                                                                                                                    |
    | --- | ----------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
    | 0   | Preconditions                                               | `pnpm infra:up`, `api:db-migrate`, two API processes on `:4014`/`:4016`  | **[staging]** `flyctl auth whoami`; `flyctl status`; the step-5 scale and the `env \| grep TAU_GIT` and `volumes list` checks above — all **before** the merge to `main`, which is itself the staging apply                                                                                                                                                                                                |
    | 1   | **S2** two processes over one store                         | `pnpm nx run api-e2e:test:git` → 3 files, 21 tests, 43.89 s              | **[staging]** the suite seeds accounts with `docker exec psql` and cannot be pointed at the deployed API. Run the **stock-client half by hand**: clone and push through Machine A with a real bearer token, then clone through Machine B over `flyctl proxy` and compare `rev-parse HEAD`                                                                                                                  |
    | 2   | **S11** collaborator, attribution, role refusal, revocation | `collaborator.spec.ts`, 3 tests                                          | **[staging]** by hand with two real accounts over `/v1/projects/:id/collaborators` and `/v1/invitations/:token`; read attribution with `git log -1 --format='%an <%ae>'`; the revoked collaborator must answer 404                                                                                                                                                                                         |
    | 3   | Browser leg — 503 retried, 410 terminal, ceiling → `quota`  | `sync-refusals.spec.ts` against the browser-hosted variant               | **[staging]** the refusals are injected on the client's own wire, so the suite runs unchanged with `TAU_E2E_API_URL=…` — but its seeding is the same `psql` path. The row that genuinely needs staging is the **un-injected** 503 from a real lost race, which row 5 produces                                                                                                                              |
    | 4   | Faults — 412, 429, outage — and chaos at each fault point   | `fault-injection.spec.ts`, 10 of 11 green through an S3 proxy on `:4018` | **[staging]** no proxy can sit between a Machine and R2. 412 comes from two concurrent pushes through the two Machines; 429 is recorded "not observed" unless R2's bound is actually hit; the outage is a deliberately mis-pointed `TAU_S3_ENDPOINT` on one Machine, restored afterwards; chaos is `flyctl machine stop --signal SIGKILL` mid-push; then `ls /tmp/tau-git-leases` on the restarted Machine |
    | 5   | **S9** sustained rate                                       | `sustained-rate.spec.ts`, the numbers in §7                              | **[staging]** drive the same loop from `flyctl ssh console` **in the region**, or the number measures the operator's home link. DG2's Fly-to-R2 figure is read off this run                                                                                                                                                                                                                                |
    | 6   | **S5, S6, S10** purge and restore of a real tenant          | `lifecycle.spec.ts` against the built maintenance command                | **[staging]** on the `revisions-maintenance` Machine against a real deleted test tenant: `mark-erasure` → `purge --dry-run` → `purge` → `restore`. Until DG1 closes there is no second bucket, so the copy the restore reads is made by hand — **never into a content bucket** (D32). Expected shapes are in §6 R5 and R6                                                                                  |
    | 7   | Rows W10 could not run at all                               | —                                                                        | the image build, `fly config validate`, the packaged desktop tier, the Fly proxy idle timeout and copy lag — listed in §9 as DG3 items                                                                                                                                                                                                                                                                     |

    Two rows W8 proved locally and DG3 repeats deployed: both `app` Machines serving the same
    repository, and the boot with no root directory (step 7 above).

## 10. Things that are deliberately not there

No volume, no snapshot policy, no repack cron, no nightly bundle, no `git bundle` transport, no dumb
HTTP, no `update-server-info`, no `post-receive` hook, no server-side `git gc`, no
`refs/tau/retention/records/*`, no process-local locks, no filesystem backend in development, and no
eager repository creation at registration. If a future change needs one of them, it is reopening a
ruling in the charter.

## 11. Open operator items

| Item                                                                                    | State                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O1 staging Machine access; HCP variable inventory                                       | deferred (DG2, DG3)                                                                                                                                                                                                                                                                                                                                                       |
| O2 Tau Backblaze B2 account; master key in HCP                                          | deferred (DG1)                                                                                                                                                                                                                                                                                                                                                            |
| O3 confirm D23 when DG1 is picked up                                                    | deferred                                                                                                                                                                                                                                                                                                                                                                  |
| O4 approve `terraform apply` and the deploy                                             | deferred (DG4)                                                                                                                                                                                                                                                                                                                                                            |
| O7 cold hydrate at the 1 GiB ceiling stays ≈4–5 s after D33's fallbacks                 | **accepted** as a first-request cost at the worst case. Typical repositories are KiB–MiB and interactive; the warm fetch — D14's actual test — settles in 131–233 ms. The alternatives, if the figure ever bites, are a lower ceiling or project affinity / a lease cache (D7 defers it until measurement asks)                                                           |
| Linked-GitHub import deposits the fetched `.git/**` into the created project unfiltered | **open, unruled.** `apps/ui/app/lib/github-linked-import.ts` walks the bootstrap provider unfiltered and `apps/ui/app/routes/import.$/route.tsx` hands the result to `createProject`. Pre-existing and unchanged in kind by D29 — before it, the same bytes landed under `.tau/revisions/**`. Deciding it means deciding whether a linked import _should_ carry its store |
| `apps/api/.env.example` is insufficient for a new developer                             | **open, unruled.** It documents that there is no root directory to configure, but the restore family is deliberately outside the boot schema, so a developer reading only the example cannot configure `restore`                                                                                                                                                          |
| The 24 h maintenance interval is a guess                                                | **open.** Nothing measures how long a purge takes at scale; a pass that outruns its sleep simply starts the next one late                                                                                                                                                                                                                                                 |
| `revisions-maintenance` has no health check and no metrics                              | **open.** A Machine whose loop has died looks identical to one that is sleeping; the only signal is a restart                                                                                                                                                                                                                                                             |
