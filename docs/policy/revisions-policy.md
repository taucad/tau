---
title: 'Revisions Policy'
description: 'Rules for revision identity, checkouts, RevisionPort parity, actor composition, sync, records, remotes, refusal classification, latency budgets, conflicts, publication, and project liveness.'
status: active
created: '2026-09-14'
updated: '2026-09-16'
related:
  - docs/research/revisions-sync-closeout-blueprint.md
  - docs/architecture/workspace-filesystem-and-revisions.md
  - docs/architecture/github-repository-integration.md
  - docs/research/github-repository-import-and-linked-revisions-blueprint.md
  - docs/research/workspace-filesystem-revisions-charter.md
  - docs/policy/filesystem-authority-policy.md
  - docs/policy/filesystem-policy.md
  - docs/policy/xstate-policy.md
---

# Revisions Policy

Internal reference for revision graphs, checkout lifecycle, synchronization, and the machines that expose the same behavior on every Tau host.

## Rationale

Files, history, chats, and UI state must not become competing authorities. One graph, one selected checkout, one filesystem authority, and one portable actor composition make every surface agree while preserving ordinary Git interoperability.

## Rules

### 1. Use the canonical vocabulary

Use each term for exactly one concept and keep engineering terms out of product copy.

| Term            | Meaning                                                                                             |
| --------------- | --------------------------------------------------------------------------------------------------- |
| Workspace       | Directory served by one authority and the unit a client binds to; Home is a workspace               |
| Project         | Directory containing `tau.json`; unit of export, portability, and revision history                  |
| Revision        | Immutable authored tree plus parents, provenance, and summary, addressed by commit id               |
| Revision graph  | Revisions and named refs of one project; one repository per project                                 |
| Branch          | Movable named ref; `main` is the default for a new project, while an import may select another line |
| Head            | Revision named by a branch or applied to a checkout                                                 |
| Checkout        | Addressable working copy of one branch; never a revision                                            |
| Live checkout   | The project directory, tracking `main` for a new project or the selected imported branch            |
| Linked checkout | Additional private working copy, one per branch                                                     |
| Turn            | One agent run against one checkout; produces at most one revision                                   |
| Lease           | Host record attaching a run to a checkout, stored under `.tau/runs/`                                |
| Backend         | Local revision engine behind `RevisionPort`                                                         |
| Remote          | Peer Git revision graph; refs and objects move, never working trees                                 |
| Named version   | Annotated tag with note, actor, and creation time                                                   |
| Publication     | Share record pointing at a named version synced to Tau Cloud                                        |
| Project session | All resources held for one live project on one client                                               |

Use **Revision**, **Branch**, **Current**, **Restore**, **Switch**, **Merge**, **Discard**, **Work in**, **Sync**, **Tau Cloud**, **system**, and **Read-only** in operator-facing UI. Never expose checkout, lease, backend, worktree, ref, or HEAD as product vocabulary.

### 2. Keep one immutable graph per project

Store exactly one repository per project. Treat the workspace as the binding and authority unit and the project as the history and portability unit.

A revision id is its commit id. Its `treeId` is the content identity of exactly the paths whose registry answer is `versioned: true`; its parents encode graph topology. Hosts mint revisions and advance refs by compare-and-swap. Agents edit checkout files and never call `RevisionPort`.

Carry a structured actor, trigger, summary, and provenance on every revision. Include `provenance.turnId` in the `Tau-Metadata` trailer and change-id preimage so `log(branch)` alone can rebuild a chat revision card after reload. Admit only host-attested `turn.finalized`, `turn.conflicted`, and `turn.failed` settlements to revision UI.

Derive `Rev N` as a first-parent ordinal on the selected branch. Derive dirty, **Current**, branch labels, and **Follow chat** from the graph and selected checkout at read time. Never persist those projections or derive them from a chat transcript.

Show the workbench checkout in one always-visible header chip. Make it the only branch label outside the Revisions pane and show **Follow chat** only when the active chat and workbench select different checkouts.

### 3. Make one checkout the workbench root

Issue every file-bearing pane, chat link, tool, editor, viewer, parameter surface, and revision action from `composeView(selectedCheckout)`. A write observed in an agent view must reach every user view of the same checkout through the rooted watch plane.

Keep the live checkout at the project directory. Place linked checkouts outside it: use persistent `/checkouts/<id>` routes over the same storage root in browser authorities and the host data directory on disk hosts. Never place a linked checkout inside a served project, expose it in project discovery, or exclude it by an ignore rule. Keep at most one checkout per branch.

Attach chats and workbenches by checkout id. Default every chat and concurrent chat to the live checkout's current branch; that is `main` for a new project and may be another branch for an imported project. Create a branch only for an explicit user branch action. Make subagents inherit the parent chat's checkout.

Implement **Switch** as one verb:

| Condition                                                                 | Result                                       |
| ------------------------------------------------------------------------- | -------------------------------------------- |
| Target branch has no linked checkout and no lease holds the live checkout | Apply the branch to the live checkout        |
| Target has a linked checkout, or the live checkout is leased              | Re-root the workbench at the linked checkout |

Never re-base a running turn. Apply **Restore** to the selected checkout; track the restored branch only when no other checkout tracks it, otherwise detach. Keep undo inside unsaved checkout state and revisions across it.

### 4. Classify the project layout once

Use `classify()` as the sole answer for storage class, versioning, agent access, watch plane, and generated ignore membership. The filesystem authority policy owns placement and admission; this policy owns what enters revisions and transport refs.

| Project-relative path                                                                                                                                                                   | Class               | Versioned | Agent access          | Writer                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | --------- | --------------------- | -------------------------------------------------- |
| `tau.json`, sources, inputs, `.tau/config.*`, `.tau/parameters/**`, `.tau/AGENTS.md`, `.tau/skills/**`, `.tau/parts`, `.tau/machines`, `.tau/export/**`, `.gitignore`, `.gitattributes` | authored            | yes       | read-write            | user or agent; generated ignore/attributes by host |
| `.tau/types/**`, `.tau/tsconfig.generated.json`, `.tau/lockfile.json`                                                                                                                   | authored, generated | no        | read-write            | tooling                                            |
| `.tau/cache/**`                                                                                                                                                                         | cache               | no        | read-write; unwatched | host                                               |
| any `node_modules/**`                                                                                                                                                                   | cache               | no        | read-write            | host or tooling                                    |
| `.tau/chats/**`, `.tau/runs/**`, `.tau/artifacts/**`, `.tau/tool-results/**`, `.tau/offloaded-tool-results/**`, `exports/**`, `thumbnail.webp`                                          | records             | no        | read-only             | host through the selected checkout authority       |
| `.tau/revisions/**`, `.git/**`, `.jj/**`, `.tau/binding.json`                                                                                                                           | control-plane       | never     | hidden                | revision or workspace authority                    |

Keep all record families readable and non-writable to agents and dimmed for users. Hide the control plane from both composed views. Exclude both classes from revisions and project exports. Derive `.gitignore` and `.gitattributes` from the registry; never maintain a second prefix or glob list. Refuse a linked import before materialization when its selected tree contains a tracked path that the registry cannot version; never make that path disappear from the next revision.

Compose read-only overlays above the authority rather than storing them: system skills at `.agents/skills/<slug>` and dependencies at `node_modules`. Keep that overlay distinct from project-authored `.tau/skills/**`; both may be visible in one composed tree, but only the latter belongs to project identity. Let a project-authored path override an entire overlay bundle and carry `{ source, versioned, agentAccess, identity?, overrides? }` as provenance. Keep labels in one UI catalog and describe the overlay as `system skill · read-only` without a redundant lock glyph.

Derive user mutation gates from `source` and dimming from `versioned`; never use the agent-facing `agentAccess` field to gate user actions. Preserve host UI record editing through the protected host writer. Exclude immutable composed dependency overlays from ordinary content watches, but preserve live runtime dependency watches required by filesystem policy Rule 26.

### 5. Put every backend behind `RevisionPort`

Choose one backend per project per host from control-plane configuration. No layer above revisions may name or bypass the backend.

| Host                             | Backend                                                                                 |
| -------------------------------- | --------------------------------------------------------------------------------------- |
| Browser                          | `isomorphic-git` over the authority, with a standard Git layout under `.tau/revisions/` |
| Desktop, `tau serve`, CLI, cloud | Native Git through `RevisionPort`                                                       |
| Future disk host                 | jj over colocated Git only after its blockers close, through the same port              |

Keep commit identity, regular-file mode, refs, log, diff, merge, tags, checkouts, remote operations, and LFS clean/smudge behind the port. Never put clean/smudge in the composed view. Preserve `100644` and `100755` modes in the immutable tree, hashing, capture, merge, restore, and every port; refuse symlinks, gitlinks, and unknown modes before applying them. Require browser and native conformance to produce identical tree and revision identities for identical inputs and to expose the same L2–L4 behavior; the CLI exposes the same verbs headlessly.

Keep remote transport to `listRemoteRefs`, `fetch`, and `push`; do not add bundle or import-bundle wires.

### 6. Compose one revision actor system per project

Run one `project-revisions.machine` actor system per live project. Run the revision tree in the file-manager worker beside filesystem authority and hashing, and publish one coalesced `RevisionStatus` projection per project.

| Machine                                          | Cardinality and ownership                                                  |
| ------------------------------------------------ | -------------------------------------------------------------------------- |
| `project-revisions`                              | one root per project; owns selection, routing, and revision children       |
| `checkouts`                                      | one invoked child; owns checkout registry and stale-lease sweep            |
| `checkout`                                       | one spawned child per checkout; the only revision minter for that checkout |
| `turn`                                           | one spawned child per admitted turn                                        |
| `sync`, `remote`, `branch`, `restore`, `publish` | one invoked child each per project                                         |
| `resolution`                                     | one spawned child per conflicted revision                                  |

Start `remote.machine` in `reading` and rehydrate it from Git's remotes list. Accept `connect { kind, url? }`; route its connected/disconnected facts through the root to `sync.machine`. Keep the over-quota path list in `remote.machine`, including refusals forwarded from later sync pushes.

Apply these composition constraints:

- Invoke always-on children for the root lifetime. Spawn variable-count children with stored typed refs; stop them with `stopChild` on removal and root exit.
- Pass `parentRef` through input and route sibling communication through the parent. Never use `systemId`; several live projects share one XState system.
- Keep one minter per checkout and a monotonically increasing write generation so a write during minting leaves the checkout dirty.
- Hold the checkout lease with a `fromCallback` actor. Supply all one-shot effects as abortable promise actors over `RevisionPort` or protected record writers.
- Give every invoked effect a failure edge. Never store functions or service callbacks in machine context.
- Coalesce content changes at the adapter seam, debounce policy inside the owning machine, and emit only settled projection values. Never send token deltas or retry ticks through project machines.
- Keep revision machines free of filesystem, Git, React, and DOM imports. Connect UI machines by events, not shared context.
- Rehydrate from graph, remote configuration, run records, and durable queues. Never persist XState snapshots.
- Admit a remote bootstrap as one exclusive project-root state. Reuse pending-project quarantine, let only the checkout actor mint its zero-or-one setup revision, and keep ordinary open, writers, turns, and sync outside the provisional root until manifest-last publication verifies. A remote push is queued after local publication and never decides whether project creation succeeded.

### 7. Mint revisions only at declared triggers

Apply one tree-hash gate: mint only when the checkout's versioned `treeId` differs from its head. A no-change turn or save mints nothing. If concurrent cuts pass the gate, the compare-and-swap loser drops its candidate and re-reads.

| Trigger                              | When                                      | Display                              |
| ------------------------------------ | ----------------------------------------- | ------------------------------------ |
| `save`                               | `Mod+S` after editor buffers flush        | normal row                           |
| `idle`                               | 5 minutes after the last checkout write   | fold with consecutive automatic rows |
| `hidden`                             | browser becomes hidden after a write      | fold with automatic rows             |
| `turn`                               | turn finalizes                            | normal row and chat card             |
| `merge`, `restore`, `switch`, `sync` | before or after the operation as required | normal row                           |
| `close`                              | page unload or desktop quit after a write | fold with automatic rows             |
| `import`                             | project import                            | normal row                           |

Keep the idle window configurable per workspace, never per project. Keep every automatic revision immutable and append-only; fold only in display. `Mod+S` means **Save revision** everywhere in the workbench.

### 8. Keep turn, branch, and conflict state explicit

Write leases and run records under `.tau/runs/<runId>.json` through the host record writer. Retire a lease at turn end, keep its checkout, and use the authority epoch to retire stale leases on next prepare. Never add heartbeat leases.

Mint a turn revision from the entire checkout's versioned tree and identify all active leases in provenance. A turn produces at most one revision. Do not let turn completion delete a checkout.

Create conflicts only from branch merge or sync divergence. Record a conflicted revision on the source branch, never on `main` and never as unowned loose files. Refuse to push conflicted revisions. Offer explicit per-file **Keep mine**, **Keep theirs**, **Open in editor**, and **Ask chat to resolve** for text; offer choose-one only for binary and parametric files. Let **Ask chat to resolve** seed a turn on that branch. Mint a normal revision after resolution and require an explicit merge or sync retry.

### 9. Synchronize continuously and bound lifecycle work

When a remote is connected with recorded synchronization consent and current write authority, schedule every minted revision for push within a 2-second debounce. **Sync now** only sets that debounce to zero and never bypasses consent or authority. Keep every unacknowledged push in the durable control-plane queue, bind it to the exact remote identity and configuration generation, retry it on the next open only after revalidation, and expose **Not backed up** until acknowledged. Replacing or disconnecting a remote pauses the old destination's queue; it never retargets queued bytes.

Open a project by fetching before its first tree render under these bounds:

| Condition                      | Action                                                  |
| ------------------------------ | ------------------------------------------------------- |
| Offline                        | Render local state and pull on the next online event    |
| Fetch settles within 3 seconds | Apply fast-forward or ordinary merge before render      |
| Still pending after 3 seconds  | Render local state and continue in background           |
| Still pending after 10 seconds | Abort that request, queue retry, and render local state |

Never re-base a leased live checkout. Fast-forward a clean checkout; route dirty divergence through the conflict path.

Treat `visibilitychange: hidden` as browser close preparation: flush editors and chats, mint the gated `close` revision, precompute the push, then start zero-debounce sync while awaits still work. On `pagehide`, send only an already serialized history-set POST of at most 64 KiB with `keepalive`; never begin smart-HTTP negotiation, chat upload, object reads, or LFS transfer there.

On desktop, hold `before-quit` while all live project sessions flush and the registry reaches `quiesced`, under a visible bounded wait with **Quit anyway**. Never share the browser `pagehide` resend path with native Git.

### 10. Separate history refs, record refs, and host-local refs

| Ref set    | Members                                                                                                                   | Push contract                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| History    | Project-owned `refs/heads/*`, `refs/tags/*`                                                                               | Atomic on native Git; ref-by-ref in browser with the active live branch last and the set retried as a unit |
| Records    | `refs/tau/{chats,evidence,artifacts}/*`                                                                                   | Per ref, append-only; rejection never blocks history                                                       |
| Host-local | `refs/remotes/*`, `refs/heads/sync/*`, `refs/tau/{owners,workspaces,revisions,transactions,retention}/*`, `refs/tau/head` | Never push; server rejects                                                                                 |

Make `RevisionPort.push()` return per-ref results. Carry the expected old value on every pushed ref: native uses `--force-with-lease=<ref>:<expected>` and browser checks the advertisement before returning `rejected: leaseLost`. Never use plain force. Upload every referenced LFS object before moving its ref.

### 11. Make Git the only remote protocol

Use Git smart HTTP plus Git LFS for every remote. Disk hosts use native Git; browsers use `isomorphic-git` and reach third-party Git endpoints only through the Tau API's Git-endpoint CORS proxy. Keep third-party credentials browser-held and send them in `x-tau-proxy-authorization`, not as the Tau API `Authorization` header. Keep credentials as host-resolved references and never write secrets under a workspace or project.

Use a dedicated GitHub App user connection for first-class GitHub repository discovery and transport. Keep Tau sign-in and Gist authorization separate; never broaden Better Auth account linking or request `public_repo`/`repo` for this capability. Store App access and refresh tokens only in the encrypted user connection store. Bind every in-memory Git credential to one normalized GitHub repository URL, stable repository id, connection generation, and expiry. Refuse authenticated redirects; resolve repository moves through authenticated catalog selection. Permit GitHub LFS only through the repository batch endpoint and server-issued, short-lived action handles that cannot name an arbitrary target or inherit the batch credential.

Expose one remote per project for now—**No remote**, **Tau Cloud**, or **Git remote**—while retaining Git's remotes list as the data model. Never model blob stores as client-side remotes.

Implement the Tau Hosted Remote as a standard Git server in the API: bare repositories on the durable volume, allow-listed `receive-pack`, LFS objects in R2, server-side publication materialization, and nightly Git bundle backups. Keep the proxy Git-endpoint-only and send Tau LFS objects directly from the browser to R2 using the batch API's authorized URLs.

Create backups through bounded storage operations. Stream large bundles as checksum-verified multipart uploads, copy them to the dated final key only after every part and finalized LFS object succeeds, and abort incomplete uploads. A final backup marker must therefore identify a complete recoverable set rather than a partially uploaded bundle.

### 12. Carry chats on record refs

Store the readable checkout projection at `.tau/chats/<chatId>/chat.json` plus `events/<deviceId>.jsonl`; derive messages from the log. Store `refs/tau/chats/<chatId>` as an orphan-parented chain whose trees carry the chat record and per-device segments. Write local chat records and refs through protected host writers and revision object plumbing. When materializing records received from a remote, only the fetch path writes the checkout projection through the host-owned record authority.

Validate a complete fetched chat tree before writing any record. Admit the chat metadata and foreign per-device segments only; never overwrite the local root append log, this device's segment, or newer local metadata. Combine stale-parent record refs without projecting their old bytes back onto the checkout. Isolate every record preparation, transport, and replay failure so it cannot block authored history or a sibling record ref.

Use the project's remote as the only chat sync plane. Include chats when a remote is connected unless the per-project **Sync chats** toggle is off. Never add a chat database table, chat endpoint, second sync transport, or IndexedDB chat authority.

### 13. Use Git LFS for large authored objects

Generate `.gitattributes` from the registry for new Tau-authored content. Track new binary formats and files at or above 1 MiB with LFS. Preserve an unchanged imported Git entry's existing blob or LFS pointer representation; do not convert an external repository merely by opening or saving it. A later changed entry follows its reviewed effective attributes, and every generated attribute or representation change appears in the revision delta. Always sync large authored inputs; classify large generated outputs and `thumbnail.webp` as records/evidence and keep them local unless **Sync large exports** is enabled.

Hide LFS terminology from users. Show storage usage against the plan in Sync, surface Git-host LFS limits before first push, and reject an over-quota push atomically with the affected file list. Let `remote.machine` alone own and present that list.

When `tau.json.syncLargeExports` is `true`, record the allowed generated paths under the exact `refs/tau/evidence/exports` ref and transfer their LFS objects independently from authored history. The allowed set is `exports/**`, `thumbnail.webp`, `.tau/artifacts/**`, `.tau/tool-results/**`, and `.tau/offloaded-tool-results/**`. Restore only absent local files on fetch. The default and an explicit `false` transfer no evidence; disabling the preference never deletes local or remote bytes.

### 14. Publish named graph versions

Represent a named version as an annotated tag. Publish only a named version whose graph and large objects are synced to the Tau Hosted Remote. Have the API materialize its tagged tree into the existing publication blob store; preserve public CDN and private grant-checking proxy behavior. Never upload a second project snapshot.

Push the tag through the leased ref path before creating or re-pointing the publication. Keep names unique per project and allow rename or deletion without changing the revision. Do not retain the multipart upload path or an upload-era compatibility reader.

### 15. Preserve attribution and retention

Use the signed-in user's stable identity when available. For anonymous work, use a stable per-workspace pseudonym with no email. For agents, record model, run id, and the user on whose behalf the agent acted. Map Git author to the user, committer to `Tau <noreply@tau.new>`, and preserve Tau actor, trigger, and metadata trailers. Never rewrite history when anonymity settings change.

Keep revisions and tags immutable while any ref reaches them. Do no local object garbage collection in this program; chat cards, run records, restore-by-id, and conflict evidence may retain revisions outside branches. Remove a linked checkout only through **Discard** after proving its tree equals its head. Offer merged checkouts for later removal; never remove them silently.

Before server Git garbage collection, refresh host-local `refs/tau/retention/records/*` for revision ids embedded in reachable record refs. Keep finalized LFS objects reachable from any retained Git tree. Keep pending uploads and orphan blobs for at least 24 hours, and unreachable finalized objects for at least 30 days; delete only after an owner-serialized recheck confirms the object is still eligible. Update quota only with the matching database row and object deletion.

Open **Compare** in the existing text `DiffViewer` from History, chat cards, and conflict rows. Treat geometry comparison as a later capability over the same revision or checkout inputs.

### 16. Make liveness explicit and route-independent

Create one app-singleton `sessions.machine` with `createActor`, not a route hook. Spawn one `project-session.machine` per live project and one `chat-session.machine` per live or viewed chat.

| Machine           | Required state and ownership                                                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sessions`        | `ready → quitting → quiesced`; owns live-set budget and all project-session refs                                                                                                     |
| `project-session` | `opening → live.idle \| live.busy → closing → closed`, with failure per owned region; owns views, runtime, agent host, compute admission, watchers, revision root, and chat sessions |
| `chat-session`    | parallel `run`, `read`, and `revision` facets; owns run holds, settlement, and unread record                                                                                         |

Use the complete chat facets: `run.idle → queued → running.generating | running.tool | running.waiting.approval | running.waiting.input | running.reconnecting → finishing → done | failed | stopped`; `read.read | read.unread`; and revision line (`onMain | onBranch`), tree (`clean | dirty`), and sync (`synced | pending | conflicted`) regions. Add a source signal to this vocabulary before showing a new state.

Navigation opens a closed project but never closes a live one. Close only by an explicit user action or a visible idle/budget policy. Require explicit confirmation before a user close cancels any running agent. After confirmation, cancel or quiesce and await producer runs, flush their final editor, chat, and record bytes and sync, then release leases and stop project resources. Never policy-close a project with a running agent, dirty checkout, or unacknowledged push. Close a chat by cancelling its run and releasing its lease while retaining its record.

Use this project-close order: cancel and settle runs; flush editor, chat, and record producers; quiesce revision and sync persistence; release leases and the project-owned agent host; then stop the remaining project resources. A failed local persistence or release step keeps the session live with a visible recoverable failure. A remote failure may close only after the durable local queue records the unacknowledged work.

On `hidden`, await editor, chat, and record flush registrants before delivering `hidden` to session registrants. Keep `pagehide` synchronous and precomputed-only: it may send the prepared best-effort payload, but never awaits or starts a fresh flush. Never use registration insertion order as lifecycle ordering.

Limit the browser to eight live projects. On a ninth open, close the least recently touched eligible idle project and report why; refuse with close suggestions when none is eligible. Apply the 30-minute hidden idle-close window per workspace. Keep desktop bounded by available memory rather than this fixed count.

Run these same liveness machines in browser and desktop with host-specific injected actors. Keep the desktop launcher as the project session's `agentHost` child, present only while that project is live.

### 17. Derive sidebar state from actor snapshots

Render liveness, run progress, attention, failures, branches, and sync only as selectors over `sessions`, `project-session`, `chat-session`, and `project-revisions` snapshots. Persist only per-client unread state.

| Machine signal                          | User state                                                       |
| --------------------------------------- | ---------------------------------------------------------------- |
| admitted                                | **Queued**                                                       |
| running without tool                    | **Working…**                                                     |
| tool in flight                          | **Running _tool_**                                               |
| approval interrupt                      | **Needs your approval**                                          |
| paused for answer                       | **Waiting for you**                                              |
| durable reattach or retry               | **Reconnecting…**                                                |
| run complete before revision settlement | **Finishing…**                                                   |
| finalized and unread                    | **Done**                                                         |
| failed and unread                       | **Failed · _reason_**                                            |
| cancelled or stopping                   | **Stopped**                                                      |
| branch checkout                         | branch chip; add a ring when dirty                               |
| project sync pending or queued          | **Backing up _n_** or **Not backed up · _n_** on the project row |
| sync or merge conflict                  | **Needs resolution**                                             |

Use glyph plus accessible text, never hue alone. Aggregate project rows from their chat children. Apply progressive disclosure: keep older History groups and autosaves collapsed, hide Branches and the composer picker until a user branch exists, remove merged branches from the active list, and hide Sync until a remote exists.

### 18. Make replacements clean cuts

Delete replaced code in the same wave. Do not keep migrations, compatibility shims, dual readers, feature flags, transcript-derived revision state, `.tau/workspaces`, bundle transports, hand-rolled browser Git codecs, or upload-based publication paths.

Keep only revision modules reachable from a package barrel and only barrel exports with consumers. Preserve the port contract and conformance suite, bounded Git command runner, metadata and digest helpers, graph authority, three-way merge, and native Git worktree/ref-transaction code where they remain reachable.

### 19. Classify every remote refusal

A server answer is never a network error. Classify every remote refusal once, in `packages/revisions/src/remotes.ts`, and let both the `isomorphic-git` and native legs raise the same typed `RevisionPortError`:

| `code`                            | Raised for                                      |
| --------------------------------- | ----------------------------------------------- |
| `REMOTE_UNAUTHORIZED`             | 401                                             |
| `REMOTE_NOT_ENTITLED`             | 403 `GIT_SYNC_NOT_ENTITLED`                     |
| `REMOTE_NOT_FOUND`                | 404                                             |
| `REMOTE_QUOTA_EXCEEDED`           | 413, carrying the affected file list            |
| `REMOTE_REJECTED`                 | A per-ref refusal, carrying the server's reason |
| `REMOTE_REAUTHORIZATION_REQUIRED` | An expired or revoked third-party connection    |

Carry the server's own sentence as the error `message` whenever the answer has one, and render that sentence rather than replacing it with generic copy. Reserve `ENGINE_FAILED 'could not be reached'` for a failure that produced no HTTP status at all.

Treat `REMOTE_UNAUTHORIZED`, `REMOTE_NOT_ENTITLED`, `REMOTE_NOT_FOUND`, and `REMOTE_REAUTHORIZATION_REQUIRED` as terminal in `sync.machine`: enter `failed` or `reconnectRequired`, resume only on **Sync now**, a remote change, or a session change, and never re-enter a fetch-push cycle without passing through the queue's backoff.

Render the reason on every surface showing **Not backed up**, `failed`, `reconnectRequired`, or a connect error, with exactly one action matching the class — _Sign in_, _Upgrade_, _Reconnect GitHub_, _Sync now_, _Open Revisions_, or _Retry_.

Consult `canSyncFiles` and `canConnectGitHub` before offering Tau Cloud or a Git remote. Show an unentitled account the existing upgrade affordance and never issue a connect on its behalf. Register nothing on the server before the plan admits it: a failed connect must leave no remote in Git config, no durable-queue mutation, and no server row.

Answer git-facing refusals as `text/plain` when the request carries no `Origin`, so stock Git prints the sentence; keep the JSON envelope for browsers and carry CORS headers on every 401.

Enforce the lease invariant server-side as well as in the client. Refuse every ref deletion and every non-fast-forward update in the Hosted Remote's `pre-receive` hook, for every ref family. Git's `receive.denyDeletes` and `receive.denyNonFastForwards` are a backstop for `refs/heads/*` only and never a substitute: Git applies neither outside that namespace, so record refs stay rewindable under both flags alone.

### 20. Hold revision work to a latency budget

Revision interactions are interactive UI, not batch work. Every operation below has a budget; a change that regresses one is a defect whether or not it is correct.

| Operation                                            | Budget                                                      |
| ---------------------------------------------------- | ----------------------------------------------------------- |
| Save → **Saved** visible                             | 100 ms browser, 150 ms native                               |
| Tree-hash gate after a one-file edit                 | Hash one blob plus that path's tree objects, never the tree |
| History pane open                                    | 50 ms browser, 100 ms native                                |
| `readRevisionLog({ limit: 50 })` native              | At most 5 `git` spawns                                      |
| `readTree` native                                    | At most 3 `git` spawns; at most 16 concurrent children      |
| Restore                                              | 300 ms browser, 500 ms native                               |
| Turn marker flips to **Saved** after settlement      | One frame, with no graph re-walk                            |
| `useRevisions()` across renders with no store change | The same view reference                                     |
| Mint → push request issued, connected and online     | 2.1 s, the debounce plus 100 ms                             |

Spend work once: memoize object ids across a cut, batch native object reads through one `cat-file --batch`, and key a derived log on its head rather than recomputing it per mint. Return a referentially stable view from every revision hook so a marker flip costs one render, not a re-walk.

## Summary Checklist

- [ ] Every surface reads one composed view of the selected checkout.
- [ ] Registry answers alone determine revision membership and agent access.
- [ ] Hosts mint through one checkout machine and one `RevisionPort` per project.
- [ ] Browser and native adapters pass the same conformance behavior.
- [ ] History and record ref failures remain independent.
- [ ] Open, hidden, pagehide, close, and quit follow their bounded paths.
- [ ] Records, not XState snapshots or transcripts, rehydrate machines and UI.
- [ ] Sidebar states are accessible selectors, not persisted flags.
- [ ] Every remote refusal is typed, carries the server's sentence, and offers one matching action.
- [ ] Entitlement is checked before a connect is offered, and nothing is registered before the plan admits it.
- [ ] Deletions and non-fast-forward updates are refused server-side for every ref family.
- [ ] Each budgeted revision operation is measured against its budget, not assumed.

## References

- Architecture: `docs/architecture/workspace-filesystem-and-revisions.md`
- Ratification and acceptance: `docs/research/workspace-filesystem-revisions-charter.md`
- Storage ownership: `docs/policy/filesystem-authority-policy.md`
- Machine conventions: `docs/policy/xstate-policy.md`
