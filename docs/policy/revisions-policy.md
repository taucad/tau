---
title: 'Revisions Policy'
description: 'Rules for revision identity, checkouts, RevisionPort parity, actor composition, sync, records, remotes, refusal classification, latency budgets, conflicts, publication, and project liveness.'
status: active
created: '2026-09-14'
updated: '2026-09-27'
related:
  - docs/research/revisions-always-on-sync-charter.md
  - docs/research/git-storage-substrate-charter.md
  - docs/research/project-git-index-always-empty.md
  - docs/architecture/revisions-cloud-handbook.md
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

Carry a refusal across the worker boundary as a `RevisionPortErrorCode`, never as a sentence: the page owns the words (`apps/ui/app/lib/revision-failure-copy.ts`) and a port or machine message is a diagnostic for logs and tests. `tau-lint/no-engineering-vocabulary-in-copy` enforces the banned vocabulary in toast copy.

### 2. Keep one immutable graph per project

Store exactly one repository per project. Treat the workspace as the binding and authority unit and the project as the history and portability unit.

A revision id is its commit id. Its `treeId` is the content identity of exactly the paths whose registry answer is `versioned: true`; its parents encode graph topology. Hosts mint revisions and advance refs by compare-and-swap. Agents edit checkout files and never call `RevisionPort`.

Carry a structured actor, trigger, summary, and provenance on every revision. Include `provenance.turnId` in the `Tau-Metadata` trailer and change-id preimage so `log(branch)` alone can rebuild a chat revision card after reload. Admit only host-attested `turn.finalized`, `turn.conflicted`, and `turn.failed` settlements to revision UI.

Derive `Rev N` as a first-parent ordinal on the selected branch. Derive dirty, **Current**, branch labels, and **Follow chat** from the graph and selected checkout at read time. Never persist those projections or derive them from a chat transcript.

Show the workbench checkout in one always-visible header chip. Make it the only branch label outside the Revisions pane and show **Follow chat** only when the active chat and workbench select different checkouts.

### 3. Make one checkout the workbench root

Issue every file-bearing pane, chat link, tool, editor, viewer, parameter surface, and revision action from `composeView(selectedCheckout)`. A write observed in an agent view must reach every user view of the same checkout through the rooted watch plane.

Keep the live checkout at the project directory. Place linked checkouts outside it: use persistent `/checkouts/<id>` routes over the same storage root in browser authorities and the host data directory on disk hosts. Never place a linked checkout inside a served project, expose it in project discovery, or exclude it by an ignore rule. Keep at most one checkout per branch.

Attach chats and workbenches by checkout id. Default every chat and concurrent chat to the live checkout's current branch; that is `main` for a new project and may be another branch for an imported project. Create a branch only for an explicit user branch action, from the selected checkout's recorded tree: cut a dirty selected checkout (`switch`) first, then branch from the resulting head, and refuse a branch of a checkout that has no revision and nothing to record. Make the chat workspace authority the one writer of a chat's checkout id; a turn admitted while that id is still settling waits for it or is refused with the same reason. Make subagents inherit the parent chat's checkout.

Implement **Switch** as one verb:

| Condition                                                                 | Result                                       |
| ------------------------------------------------------------------------- | -------------------------------------------- |
| Target branch has no linked checkout and no lease holds the live checkout | Apply the branch to the live checkout        |
| Target has a linked checkout, or the live checkout is leased              | Re-root the workbench at the linked checkout |

Never re-base a running turn. Refuse a **Restore**, with **Switch**'s sentence and before any cut, while a turn holds the checkout; a turn admitted during a restore waits until the restore revision lands. Apply **Restore** to the selected checkout it was planned against and keep that checkout on its line, never moving its branch: cut a dirty checkout first, then apply the target tree and cut a revision with trigger `restore` and provenance `restoredFrom`, so the line fast-forwards and no working-tree byte becomes unreachable. Re-check the head's tree and the lease inside the checkout fence before applying, and apply nothing when either moved. A restore to the current tree mints nothing. A checkout is on a branch or unborn and is never detached; viewing an older revision read-only is a separate verb (a compare view or a linked checkout), never a state of the selected checkout. Offer **Undo restore** as another restore whose target is the restored revision's first parent. Implement **Undo** as the scoped inverse of one operation recorded under rule 10's operation log: mint the reverse of that operation's own tree delta as a new revision, apply it as a three-way merge when the line has moved since, and refuse with a named reason when it cannot apply cleanly; never undo by restoring a whole earlier tree over other work. The editor's undo stack stays inside unsaved checkout state.

### 4. Classify the project layout once

Use `classify()` as the sole answer for storage class, versioning, agent access, watch plane, and generated ignore membership. The filesystem authority policy owns placement and admission; this policy owns what enters revisions and transport refs.

| Project-relative path                                                                                                                                                                   | Class               | Versioned | Agent access          | Writer                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | --------- | --------------------- | -------------------------------------------------- |
| `tau.json`, sources, inputs, `.tau/config.*`, `.tau/parameters/**`, `.tau/AGENTS.md`, `.tau/skills/**`, `.tau/parts`, `.tau/machines`, `.tau/export/**`, `.gitignore`, `.gitattributes` | authored            | yes       | read-write            | user or agent; generated ignore/attributes by host |
| `.tau/types/**`, `.tau/tsconfig.generated.json`, `.tau/lockfile.json`                                                                                                                   | authored, generated | no        | read-write            | tooling                                            |
| `.tau/cache/**`                                                                                                                                                                         | cache               | no        | read-write; unwatched | host                                               |
| any `node_modules/**`                                                                                                                                                                   | cache               | no        | read-write            | host or tooling                                    |
| `.tau/chats/**`, `.tau/runs/**`, `.tau/artifacts/**`, `.tau/tool-results/**`, `.tau/offloaded-tool-results/**`, `exports/**`, `thumbnail.webp`                                          | records             | no        | read-only             | host through the selected checkout authority       |
| `.git/**`, `.jj/**`, `.tau/binding.json`                                                                                                                                                | control-plane       | never     | hidden                | revision or workspace authority                    |

Keep all record families readable and non-writable to agents and dimmed for users. Hide the control plane from both composed views, at any depth: a nested repository's `.git/**` or `.jj/**` (a vendored dependency, a submodule checkout) is control plane exactly as the project's own is, so it is never captured and never agent-writable. A project recorded before this rule that carried such files records their removal at its next revision; history is not rewritten. Exclude both classes from revisions and project exports. Derive `.gitignore` and `.gitattributes` from the registry; never maintain a second prefix or glob list. Refuse a linked import before materialization when its selected tree contains a tracked path that the registry cannot version; never make that path disappear from the next revision.

Compose read-only overlays above the authority rather than storing them: system skills at `.agents/skills/<slug>` and dependencies at `node_modules`. Keep that overlay distinct from project-authored `.tau/skills/**`; both may be visible in one composed tree, but only the latter belongs to project identity. Let a project-authored path override an entire overlay bundle and carry `{ source, versioned, agentAccess, identity?, overrides? }` as provenance. Keep labels in one UI catalog and describe the overlay as `system skill · read-only` without a redundant lock glyph.

Derive user mutation gates from `source` and dimming from `versioned`; never use the agent-facing `agentAccess` field to gate user actions. Preserve host UI record editing through the protected host writer. Exclude immutable composed dependency overlays from ordinary content watches, but preserve live runtime dependency watches required by filesystem policy Rule 26.

### 5. Put every backend behind `RevisionPort`

Choose one backend per project per host from control-plane configuration. No layer above revisions may name or bypass the backend.

| Host                             | Backend                                                                       |
| -------------------------------- | ----------------------------------------------------------------------------- |
| Browser                          | `isomorphic-git` over the authority, with a standard Git layout under `.git/` |
| Desktop, `tau serve`, CLI, cloud | Native Git through `RevisionPort`                                             |
| Future disk host                 | jj over colocated Git only after its blockers close, through the same port    |

Keep commit identity, regular-file mode, refs, log, diff, merge, tags, checkouts, remote operations, and LFS clean/smudge behind the port. Never put clean/smudge in the composed view. Preserve `100644` and `100755` modes in the immutable tree, hashing, capture, merge, restore, and every port; refuse symlinks, gitlinks, and unknown modes before applying them. Require browser and native conformance to produce identical tree and revision identities for identical inputs and to expose the same L2–L4 behavior; the CLI exposes the same verbs headlessly.

Keep each worktree's Git index naming its branch's head tree, for stock Git only. Tau never reads the index and decides dirtiness by capture, so the port refreshes it after every branch move, every `HEAD` switch, and at open when no index exists, and never fails the move because of it. Leave an existing index alone at open: an adopted repository may hold the person's staged work. A person's staging is folded into the next revision.

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

- Invoke always-on children for the root lifetime. Spawn variable-count children with stored typed refs; stop them with `enq.stop` on removal and root exit.
- Pass `parentRef` through input and route sibling communication through the parent. Never use `systemId`; several live projects share one XState system.
- Keep one minter per checkout and a monotonically increasing write generation so a write during minting leaves the checkout dirty.
- Hold the checkout lease with a `createCallbackLogic` actor. Supply all one-shot effects as abortable promise actors over `RevisionPort` or protected record writers.
- Give every invoked effect a failure edge. Never store functions or service callbacks in machine context.
- Coalesce content changes at the adapter seam, debounce policy inside the owning machine, and emit only settled projection values. Never send token deltas or retry ticks through project machines.
- Keep revision machines free of filesystem, Git, React, and DOM imports. Connect UI machines by events, not shared context.
- Rehydrate from graph, remote configuration, run records, and durable queues. Never persist XState snapshots.
- Admit a remote bootstrap as one exclusive project-root state. Reuse pending-project quarantine, let only the checkout actor mint its zero-or-one setup revision, and keep ordinary open, writers, turns, and sync outside the provisional root until manifest-last publication verifies. A remote push is queued after local publication and never decides whether project creation succeeded.

### 7. Mint revisions only at declared triggers

Apply one tree-hash gate: mint only when the checkout's versioned `treeId` differs from its head. A no-change turn or save mints nothing. If concurrent cuts pass the gate, the compare-and-swap loser drops its candidate and re-reads.

| Trigger          | When                                                                                           | Display                                 |
| ---------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------- |
| `save`           | `Mod+S` after editor buffers flush                                                             | normal row                              |
| `idle`           | 5 minutes after the last checkout write                                                        | fold with consecutive automatic rows    |
| `hidden`         | browser becomes hidden after a write                                                           | fold with automatic rows                |
| `turn`           | turn finalizes                                                                                 | normal row and chat card                |
| `restore`        | before a restore, a dirty checkout; after it, the restored tree with provenance `restoredFrom` | normal row naming the restored revision |
| `merge`          | before a fetch or branch merge touches a dirty checkout; after it, the merge revision          | normal row                              |
| `switch`, `sync` | before or after the operation as required                                                      | normal row                              |
| `close`          | page unload or desktop quit after a write                                                      | fold with automatic rows                |
| `import`         | project import                                                                                 | normal row                              |

Keep the idle window configurable per workspace, never per project. Keep every automatic revision immutable and append-only; fold only in display. "Always committed" means the working copy is always within one trigger of a revision; never amend, squash, or rebase a revision to get there. `Mod+S` means **Save revision** everywhere in the workbench.

### 8. Keep turn, branch, and conflict state explicit

Write leases and run records under `.tau/runs/<runId>.json` through the host record writer. Retire a lease at turn end, keep its checkout, and use the authority epoch to retire stale leases on next prepare. Never add heartbeat leases.

Mint a turn revision from the entire checkout's versioned tree and identify all active leases in provenance. A turn produces at most one revision. Do not let turn completion delete a checkout.

Create conflicts only from a branch merge or sync divergence whose changes overlap; rule 9 merges the rest. Record a conflicted revision on its conflict line `refs/heads/conflicts/<branch>/<device>`, where `<branch>` is the line the decision lands on and `<device>` is the recording device's record device (rule 10), and parent it on the two diverged heads and on the conflict line's current tip so that line always fast-forwards. Never record a conflicted revision on `main` or a named branch, and never as unowned loose files. Reserve `conflicts` and every name under it: refuse them as user branch names. Push this device's conflict lines with the history set and never re-push another device's line; the Hosted Remote admits a conflicted commit on a conflict line and refuses it on every other line. Render the same resolution surface for a fetched conflict as for a local one, under the one sentence **Needs your decision** naming `<branch>`. Offer explicit per-file **Keep mine**, **Keep theirs**, **Open in editor**, and **Ask chat to resolve** for text; offer choose-one only for binary and parametric files. Let **Ask chat to resolve** seed a turn on that line. Resolve by minting a merge revision on `<branch>` with the conflicted revision among its parents; that lands the decision with no further merge or sync retry. Derive "resolved" from that ancestry and hide resolved conflict lines from listings. Remove an abandoned foreign conflict line only through the audited removal verb of rule 14.

### 9. Synchronize continuously and bound lifecycle work

When a remote is connected with recorded synchronization consent and current write authority, schedule every minted revision for push within a 2-second debounce. The debounce restarts on each mint, so cap a burst at `syncDebounceMaxWaitMilliseconds`, 4 seconds (two windows): a device that keeps minting still pushes at least once per ceiling. **Sync now** only sets that debounce to zero and never bypasses consent or authority. Keep every unacknowledged push in the durable control-plane queue, bind it to the exact remote identity and configuration generation, retry it on the next open only after revalidation, and expose **Not backed up** until acknowledged. Replacing or disconnecting a remote pauses the old destination's queue; it never retargets queued bytes.

Open a project by fetching before its first tree render under these bounds:

| Condition                      | Action                                                  |
| ------------------------------ | ------------------------------------------------------- |
| Offline                        | Render local state and pull on the next online event    |
| Fetch settles within 3 seconds | Apply fast-forward or ordinary merge before render      |
| Still pending after 3 seconds  | Render local state and continue in background           |
| Still pending after 10 seconds | Abort that request, queue retry, and render local state |

Nest every lifecycle bound strictly inside the wait that awaits it, so the person hears the inner operation's own reason rather than the outer wait's generic one: the sync pull deadline is shorter than the close-path sync quiesce, and a turn's base-cut settlement is shorter than the host's turn admission. Declare each constant beside its owner — the pull deadline in `packages/revisions/src/sync.machine.ts` or `sync.types.ts`, the cut settlement in `turn.machine.ts`, the quiesce and admission waits in `revision-effects.ts` — and pin the ordering with a unit assertion there.

While a project is open, learn that the remote moved from the project's `revision` entry on the existing durable-events long poll, which carries only the manifest generation, the moved ref names and each moved ref's new object id, and is authorized by project `read` access; fetch the bytes over Git. A device that already holds every announced head, as its own ref or its tracking ref, makes no request at all; an entry without heads, or with a head the device does not hold, pulls. Never add a head-only Git route, a socket namespace, or another transport for this.

Integrate on every fetch, not only on open. Fast-forward a clean checkout. Auto-merge a diverged clean checkout whose changes do not overlap and land the merge revision: a path changed on one side takes that side, and a text file changed on both sides merges by line when no hunk overlaps. Cut a dirty checkout first through its checkout child (trigger `merge`), then treat it as clean. Merge `.tau/parameters/**` per key and let a binary choose one side. Route only overlapping changes to a conflicted revision on the conflict line (rule 8). Never re-base a leased live checkout: the merge waits for the lease to retire, then applies.

Check every editor save against the bytes the editor's text was made from, so an apply that lands while a person types is never reverted by a blind write: a refused save rebases the typed text onto the arrived bytes, or records a conflict when they cannot merge. Above the checked-write limit (a save whose base and bytes together pass 8 MiB) the check is a read, a compare and then a write, which leaves one read-to-write window; a digest precondition on the checked write is the named follow-up that closes it.

Treat `visibilitychange: hidden` as browser close preparation: flush editors and chats, mint the gated `close` revision, precompute the push, then start zero-debounce sync while awaits still work. On `pagehide`, send only an already serialized history-set POST of at most 64 KiB with `keepalive`; never begin smart-HTTP negotiation, chat upload, object reads, or LFS transfer there.

On desktop, hold `before-quit` while all live project sessions flush and the registry reaches `quiesced`, under a visible bounded wait with **Quit anyway**. Never share the browser `pagehide` resend path with native Git.

### 10. Separate history refs, record refs, and host-local refs

| Ref set    | Members                                                                                                                          | Push contract                                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| History    | Project-owned `refs/heads/*`, including this device's conflict lines `refs/heads/conflicts/<branch>/<device>`, and `refs/tags/*` | Atomic on both legs: one advertisement and one receive-pack, the active live branch last                         |
| Records    | `refs/tau/{chats,evidence,artifacts,ops}/*`                                                                                      | Append-only; one non-atomic push after history, each ref keeping its own verdict; rejection never blocks history |
| Host-local | `refs/remotes/*`, `refs/tau/{owners,workspaces,revisions,transactions,retention}/*`, `refs/tau/head`                             | Never push; server rejects                                                                                       |

Push history first, atomically. Then push every record ref in one non-atomic push, so each ref keeps its own verdict. A server that refuses that set as a whole (the Hosted Remote's `pre-receive` answers every ref `rejected` for one ref's sake), or a push that throws, gives no verdict: re-offer each record ref alone. A rate-limited answer (429) is the whole push's: rethrow it to the scheduler to wait out, never split it into one push per ref.

Append every settled operation that moves a head (mint, restore, switch, merge, branch, resolve, sync-apply) to this device's operation log `refs/tau/ops/<device>`. Give the log the chat segment's shape — per device, append-only — and give each entry the actor in the same form its revision carries. The append is queued behind the head move, not awaited on the save path: one log commit costs about 60 ms on `isomorphic-git` and about 100 ms on native Git, which alone would spend B1. It is queued before any machine hears of the move, and every log read waits for the pending appends. The accepted residual is a crash within about 0.1 s of a head move, which can lose that one entry, and with it _Undo_ of that operation. The push is never lost: after a crash, derive the owed pushes from the heads themselves (every branch the push would offer that its push remote has not taken), not from the log, so the next open still pushes the head. Writing the log commit and the head move in one ref transaction is the named upgrade that closes the residual.

Name every pushed record that names a device — the operation log, conflict lines (rule 8) and chat segments (rule 12) — by a _record device_, never the host's device id. A record device is a random id the host keeps per (device, actor form), where the actor form is the person a revision is attributed to or their pseudonym. Keep the ids in `.git/ops-devices.json`, which no tree records, so no pushed name carries a machine or account and no one name lists an account's operations and a pseudonym's together. When a remote refuses an own log as a rewrite (two hosts sharing one record device after a copied `.git`), move that form to a new record device and re-offer the log; the retired id stays this host's own. The host's device id from before record devices also counts as its own, so a segment written under it is never projected back as another device's. A chat continued across a sign-in holds both forms' segments in one chat, which links those two actor forms through the chat's content. This is accepted (EQ10): record devices keep names unlinkable, not the content a person chose to continue.

Make `RevisionPort.push()` return per-ref results. Carry the expected old value on every pushed ref: native uses `--force-with-lease=<ref>:<expected>` and browser checks the advertisement before returning `rejected: leaseLost`. Never use plain force. Upload every referenced LFS object before moving its ref.

### 11. Make Git the only remote protocol

Use Git smart HTTP plus Git LFS for every remote. Disk hosts use native Git; browsers use `isomorphic-git` and reach third-party Git endpoints only through the Tau API's Git-endpoint CORS proxy. Keep third-party credentials browser-held and send them in `x-tau-proxy-authorization`, not as the Tau API `Authorization` header. Keep credentials as host-resolved references and never write secrets under a workspace or project.

Use a dedicated GitHub App user connection for first-class GitHub repository discovery and transport. Keep Tau sign-in and Gist authorization separate; never broaden Better Auth account linking or request `public_repo`/`repo` for this capability. Store App access and refresh tokens only in the encrypted user connection store. Bind every in-memory Git credential to one normalized GitHub repository URL, stable repository id, connection generation, and expiry. Refuse authenticated redirects; resolve repository moves through authenticated catalog selection. Permit GitHub LFS only through the repository batch endpoint and server-issued, short-lived action handles that cannot name an arbitrary target or inherit the batch credential.

Expose one remote per project for now—**No remote**, **Tau Cloud**, or **Git remote**—while retaining Git's remotes list as the data model. Never model blob stores as client-side remotes. For a signed-in, entitled account, back a project up to Tau Cloud from its first revision with a one-line notice and a per-project opt-out, with no Connect step; keep the chooser for GitHub, any Git address, and reconnection.

Give a Tau Cloud project one owner and any number of collaborators holding `read` or `write`. Authorize every git request and every project route through one access service rather than an owner comparison, answer 404 for a non-member and a role refusal for a member below the need, and reserve registering, publishing and managing collaborators to the owner. A collaborator's bytes land in the owner's storage and count against the owner's plan; the server attributes every repository write to the authenticated pusher, while the commit author stays the person the client recorded. Revocation takes effect within the authorization cache window (5 s per API process; hits only are cached, so a revoked collaborator is refused by the first request after that window on each worker). A lease already in flight finishes.

Implement the Tau Hosted Remote as a standard Git server in the API whose durable state is object storage and never a host disk. A repository is immutable packfiles plus one manifest under the owner's tenant prefix; a request hydrates a disposable lease from them, runs stock `upload-pack` or `receive-pack --stateless-rpc` over it, and acknowledges a push only after the manifest commit succeeds by conditional write. Any number of stateless workers may serve one repository, so a lost commit race is a refusal the client retries rather than a lock. Keep exactly one hook, `pre-receive`, carrying the allow-list, the fast-forward rule for every ref family, the conflict-line admission rule of rule 8, the owner's quota backstop and the per-repository byte ceiling. Speak git smart HTTP only: there is no dumb-HTTP read layout, no `update-server-info` and no `post-receive`. Keep LFS objects in the owner's tenant prefix, materialize publications server-side from a lease, keep the proxy Git-endpoint-only, and send Tau LFS objects directly from the browser to R2 using the batch API's authorized URLs.

Make durable state copy-ready instead of snapshotted. Write objects once under keys unique to their upload, retain retired packs through the reconstruction window, and keep every manifest addressable, so a second store is a destination a copier adds and never a mechanism it invents. Take no bundle and no nightly snapshot. Restore reads a manifest and the packs it names from any store the port can reach and rolls the primary forward with a fresh incarnation and a higher generation; it never rewrites a manifest in place. Until an independent second copy exists, retired-pack retention is the only recovery window, prefix deletion has exactly one tombstone-gated caller, and sync does not open to users. Open sync to every account only when all four deployment gates of the git storage substrate charter hold: DG1's second copy exists (or, for a bounded beta only, the operator has accepted its risk in writing), DG2's regional figures exist, DG3's staging proof has run, and DG4's production apply is done. Ship the free-tier entitlement of rule 19 undeployable behind that gate.

### 12. Carry chats on record refs

Store the readable checkout projection at `.tau/chats/<chatId>/chat.json` plus `events/<device>.jsonl`, one segment per record device (rule 10), and sent attachments at `attachments/<64 hex>.<jpg|png|webp|gif|pdf>`; derive messages from the log. Store `refs/tau/chats/<chatId>` as an orphan-parented chain whose closed trees carry exactly the chat record, per-device segments and those content-addressed attachment blobs (`assertChatTree` in `packages/revisions/src/chat-ref.ts` refuses any other entry). Record a chat ref with `WriteRevisionInput.largeObjects: false`: its tree is stored verbatim as plain blobs and never cleaned into LFS pointers, because a closed tree cannot carry the `.gitattributes` a pointer needs and attachments are capped (4 MiB images, 20 MiB PDFs) where plain git carries them on any remote. Every other writer keeps the default `true`. Write local chat records and refs through protected host writers and revision object plumbing. When materializing records received from a remote, only the fetch path writes the checkout projection through the host-owned record authority.

Validate a complete fetched chat tree before writing any record. Admit the chat metadata and foreign per-device segments only; never overwrite the local root append log, this device's segment, or newer local metadata. Combine stale-parent record refs without projecting their old bytes back onto the checkout. Isolate every record preparation, transport, and replay failure so it cannot block authored history or a sibling record ref.

Use the project's remote as the only chat sync plane. Include chats when a remote is connected unless the per-project **Sync chats** toggle is off. Never add a chat database table, chat endpoint, second sync transport, or IndexedDB chat authority.

### 13. Use Git LFS for large authored objects

Generate `.gitattributes` from the registry for new Tau-authored content. Track new binary formats and files at or above 1 MiB with LFS. Preserve an unchanged imported Git entry's existing blob or LFS pointer representation; do not convert an external repository merely by opening or saving it. A later changed entry follows its reviewed effective attributes, and every generated attribute or representation change appears in the revision delta. Always sync large authored inputs; classify large generated outputs and `thumbnail.webp` as records/evidence and keep them local unless **Sync large exports** is enabled.

Hide LFS terminology from users. Show storage usage against the plan in Sync, surface Git-host LFS limits before first push, and reject an over-quota push atomically with the affected file list. Let `remote.machine` alone own and present that list.

When `tau.json.syncLargeExports` is `true`, record the allowed generated paths under the exact `refs/tau/evidence/exports` ref and transfer their LFS objects independently from authored history. The allowed set is `exports/**`, `thumbnail.webp`, `.tau/artifacts/**`, `.tau/tool-results/**`, and `.tau/offloaded-tool-results/**`. Restore only absent local files on fetch. The default and an explicit `false` transfer no evidence; disabling the preference never deletes local or remote bytes.

### 14. Publish named graph versions

Represent a named version as an annotated tag. Publish only a named version whose graph and large objects are synced to the Tau Hosted Remote. Have the API materialize its tagged tree into the existing publication blob store; preserve public CDN and private grant-checking proxy behavior. Never upload a second project snapshot.

Push the tag through the leased ref path before creating or re-pointing the publication. Keep names unique per project and allow rename without changing the revision. Remove a name only through the audited server-side removal verb, which shows the publication the name serves before it removes the tag and never changes the revision. That verb is also the only way to remove an abandoned foreign conflict line (rule 8), at the owner's request; the push hook keeps refusing every deletion (rule 19). Do not retain the multipart upload path or an upload-era compatibility reader.

### 15. Preserve attribution and retention

Use the signed-in user's stable identity when available. For anonymous work, use a stable per-workspace pseudonym with no email; for a signed-in account, derive it from the per-`(workspace, account)` salt the API serves the authenticated user, cache that salt in host state, and never write it to the tree. For agents, record model, run id, and the user on whose behalf the agent acted. Map Git author to the user, committer to `Tau <noreply@tau.new>`, and never write the account email: the author address is `<user-id>@users.noreply.tau.new`, or the linked forge's no-reply address for a project linked to one (GitHub refuses pushes that expose a private address), and preserve Tau actor, trigger, and metadata trailers. Never rewrite history when anonymity settings change. Name pushed records by record device (rule 10), so no record name joins a pseudonym to an account; a chat continued across a sign-in still links the two through its content, which is accepted.

Keep revisions and tags immutable while any ref reaches them. Do no local object garbage collection in this program; chat cards, run records, restore-by-id, and conflict evidence may retain revisions outside branches. Remove a linked checkout only through **Discard** after proving its tree equals its head. Offer merged checkouts for later removal; never remove them silently.

Run no server-side Git garbage collection and keep no server-local retention refs. The manifest is the reachability statement: it names the live packs, and compaction is a writer-side step inside the same conditional write. Before that write drops a pack, mark it retired with an empty time-keyed marker object; a retired pack stays readable for 30 days after its newest marker — that window, not a ref, is what protects a revision id embedded only in a record. Sweep only keys the just-committed manifest does not name: a marked pack once its window has passed, an unmarked one as an orphan after 24 hours. Keep finalized LFS objects reachable from any retained Git tree. Keep pending uploads and orphan blobs for at least 24 hours, and unreachable finalized objects for at least 30 days; delete only after an owner-serialized recheck confirms the object is still eligible. Update quota only with the matching database row and object deletion.

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
| sync or merge conflict                  | **Needs your decision**                                          |

Use glyph plus accessible text, never hue alone. Aggregate project rows from their chat children. Apply progressive disclosure: keep older History groups and autosaves collapsed, hide Branches and the composer picker until a user branch exists, remove merged branches from the active list, and hide Sync until a remote exists.

### 18. Make replacements clean cuts

Delete replaced code in the same wave. Do not keep migrations, compatibility shims, dual readers, feature flags, transcript-derived revision state, `.tau/workspaces`, bundle transports, hand-rolled browser Git codecs, or upload-based publication paths.

Keep only revision modules reachable from a package barrel and only barrel exports with consumers. Preserve the port contract and conformance suite, bounded Git command runner, metadata and digest helpers, graph authority, three-way merge, and native Git worktree/ref-transaction code where they remain reachable.

### 19. Classify every remote refusal

A server answer is never a network error. Classify every remote refusal once, in `packages/revisions/src/remotes.ts`, and let both the `isomorphic-git` and native legs raise the same typed `RevisionPortError`:

| `code`                            | Raised for                                                                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `REMOTE_UNAUTHORIZED`             | 401                                                                                                                                              |
| `REMOTE_NOT_ENTITLED`             | 403 `GIT_SYNC_NOT_ENTITLED`                                                                                                                      |
| `REMOTE_FORBIDDEN`                | A 403 that is not `GIT_SYNC_NOT_ENTITLED`                                                                                                        |
| `REMOTE_NOT_FOUND`                | 404                                                                                                                                              |
| `REMOTE_QUOTA_EXCEEDED`           | 413, or a ceiling refusal, with the file list                                                                                                    |
| `REMOTE_REJECTED`                 | A per-ref refusal, carrying the server's reason                                                                                                  |
| `REMOTE_REAUTHORIZATION_REQUIRED` | An expired or revoked third-party connection                                                                                                     |
| `REMOTE_MOVED`                    | 409 `GIT_PROXY_REDIRECTED_CREDENTIAL`: the repository moved or was renamed; re-resolve it by stable id and re-point only after the user confirms |
| `REMOTE_DAMAGED`                  | 500 `GIT_REPOSITORY_INCOMPLETE`: the hosted repository's manifest names a pack the store does not hold                                           |
| `REMOTE_UNAVAILABLE`              | 429 or any other 5xx; a 429 also carries its `Retry-After` wait, or a 30-second default on a leg that cannot read the header                     |

Carry the server's own sentence as the error `message` whenever the answer has one, and render that sentence rather than replacing it with generic copy. Reserve `ENGINE_FAILED 'could not be reached'` for a failure that produced no HTTP status at all.

Map the Hosted Remote's own refusals onto those classes. The table is exhaustive for the Hosted Remote's routes in `apps/api/app/api/git/` (`git-transport.ts`, `git.controller.ts`, `git.service.ts`, `git-lfs.service.ts`, `usage.controller.ts`); add a row in the same change as a new code. The third-party Git-endpoint proxy's codes (`GIT_PROXY_*`, `GIT_LFS_HANDLE_*`, `GIT_LFS_ACTION_REFUSED`, `GIT_LFS_OBJECT_TOO_LARGE`, `GIT_LFS_OBJECT_SIZE_MISMATCH`) are owned by `git-proxy.controller.ts` and classified by status alone.

| Server code                       | Status                                 | Client class                                                                          |
| --------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------- |
| `UNAUTHORIZED`                    | 401                                    | `REMOTE_UNAUTHORIZED`                                                                 |
| `GIT_SERVICE_UNKNOWN`             | 400                                    | none; stock git only                                                                  |
| `GIT_SYNC_NOT_ENTITLED`           | 403                                    | `REMOTE_NOT_ENTITLED`                                                                 |
| `PROJECT_ROLE_INSUFFICIENT`       | 403                                    | `REMOTE_FORBIDDEN`                                                                    |
| `PROJECT_NOT_FOUND`               | 404                                    | `REMOTE_NOT_FOUND`                                                                    |
| `GIT_REPOSITORY_NOT_FOUND`        | 404                                    | `REMOTE_NOT_FOUND`                                                                    |
| `GIT_REPOSITORY_DELETED`          | 410                                    | `REMOTE_NOT_FOUND`, terminal                                                          |
| `GIT_QUOTA_EXCEEDED`              | 413                                    | `REMOTE_QUOTA_EXCEEDED`                                                               |
| `GIT_REPOSITORY_CEILING_EXCEEDED` | 413                                    | `REMOTE_QUOTA_EXCEEDED`                                                               |
| `GIT_LFS_QUOTA_EXCEEDED`          | 413 on the LFS batch                   | `LfsQuotaError` with the largest files; settled per ref as a storage refusal          |
| `GIT_LFS_SIZE_MISMATCH`           | 400 on the LFS batch                   | none; the push fails and is retried                                                   |
| `GIT_LFS_OBJECT_MISSING`          | 404 on LFS verify                      | none; the push fails and is retried                                                   |
| `GIT_PUSH_NOT_COMMITTABLE`        | 422                                    | `REMOTE_REJECTED`                                                                     |
| `GIT_RATE_LIMITED`                | 429 + `Retry-After`                    | `REMOTE_UNAVAILABLE`; waits out `Retry-After` without escalating the backoff          |
| `GIT_HYDRATE_BUDGET_EXHAUSTED`    | 429 + `Retry-After`                    | `REMOTE_UNAVAILABLE`; waits out `Retry-After` (the rest of the daily window)          |
| `GIT_REPOSITORY_INCOMPLETE`       | 500                                    | `REMOTE_DAMAGED`, terminal — operator repair                                          |
| `GIT_PUSH_RACE_LOST`              | 503 + `Retry-After: 5`                 | `REMOTE_UNAVAILABLE`; retried and self-clearing                                       |
| `GIT_LEASE_DISK_FULL`             | 503 + `Retry-After: 5`                 | `REMOTE_UNAVAILABLE`; retried and self-clearing                                       |
| `GIT_LEASE_OWNER_BUSY`            | 503 + `Retry-After: 5`                 | `REMOTE_UNAVAILABLE`; retried and self-clearing                                       |
| `SERVICE_UNAVAILABLE`             | 503 + `Retry-After: 5`                 | `REMOTE_UNAVAILABLE`; a cloud host's credential could not be checked                  |
| `GIT_REF_REMOVAL_OWNER_ONLY`      | 403 on the removal verb                | none; the removal surface's own sentence (`apps/ui/app/lib/revision-failure-copy.ts`) |
| `GIT_REF_NOT_REMOVABLE`           | 400 on the removal verb                | none; the removal surface's own sentence                                              |
| `GIT_REF_NOT_FOUND`               | 404 on the removal verb                | none; the name or line is already gone                                                |
| `GIT_REF_PUBLISHED`               | 409 on the removal verb                | none; the confirmation showing the publication the name serves (rule 14)              |
| `USAGE_RATE_LIMITED`              | 429 + `Retry-After` on the usage route | none; the Sync row shows no usage figure until the next read                          |

`GIT_REPOSITORY_INCOMPLETE` is the one server answer no retry clears: the manifest names a pack the store does not hold, so only an operator restore repairs the repository. Keep it terminal and watch for it.

A `pre-receive` refusal carries no HTTP status, so relay the hook's report-status bytes verbatim and classify the per-repository ceiling refusal and the plan-quota refusal on the fixed markers the hook opens them with (`Tau: repository size limit exceeded` and `Tau: storage quota exceeded`), raising `REMOTE_QUOTA_EXCEEDED` carrying that sentence and its ten-largest-files list. Every other hook refusal stays `REMOTE_REJECTED`. Each marker has exactly two copies — the hook's constant in the API and the client's in `packages/revisions` — because the API does not depend on that package; each carries its own test, the client's names the API as the source, and they change together.

Apply that classification on both paths a hook refusal can take, through one shared predicate owned by an import-free leaf module (`packages/revisions/src/refusal-markers.ts`, whose `isStorageRefusal` — either marker — and `isCeilingRefusal` — the ceiling alone — the package index re-exports): the thrown transport error on the native leg, and the per-ref push result on the `isomorphic-git` leg, which the sync scheduler tests before it settles a refused ref as `rejected`. A quota class that holds on only one leg gives the same refusal two different actions, and _Sync now_ cannot clear a ceiling.

Treat `REMOTE_UNAUTHORIZED`, `REMOTE_NOT_ENTITLED`, `REMOTE_FORBIDDEN`, `REMOTE_NOT_FOUND`, `REMOTE_QUOTA_EXCEEDED`, `REMOTE_MOVED`, `REMOTE_DAMAGED`, and `REMOTE_REAUTHORIZATION_REQUIRED` as terminal in `sync.machine`: enter `failed` or `reconnectRequired`, resume only on **Sync now**, a remote change, or a session change, and never re-enter a fetch-push cycle without passing through the queue's backoff.

Render the reason on every surface showing **Not backed up**, `failed`, `reconnectRequired`, or a connect error, with exactly one action matching the class — _Sign in_, _Upgrade_, _Reconnect GitHub_, _Sync now_, _Open Revisions_, or _Retry_.

Render a storage refusal with its largest-files list and choose its one action by the caller's relationship to the project: the owner on Free gets _Upgrade_; the owner on the top tier gets the file-list action only; a collaborator gets the owner-directed sentence with the file list and no plan action. The per-repository ceiling is a hydration guard that no plan raises, so a ceiling refusal (`isCeilingRefusal`) gets the file list and no plan action whoever asks. Render a revoked collaborator's refusal as the calm **Access removed** state with the same owner-directed sentence, never as a backup failure.

Consult `canSyncFiles` before offering Tau Cloud or creating it by default (rule 11); a Git remote, GitHub included, is offered on every plan. Every plan carries an account storage allowance (`storageLimitBytesByTier` in `@taucad/billing`): 1 GiB on Free, 10 GiB on Pro, 100 GiB on Enterprise. The upgrade affordance answers that allowance, never the tier. Free carries `canSyncFiles` only behind the D23 gate `TAU_FREE_TIER_SYNC_ENABLED` (default closed), which the API ignores under `NODE_ENV=production` until the go-live commit removes that guard; until then a Free push is refused `GIT_SYNC_NOT_ENTITLED` (rule 11). Show the existing upgrade affordance to an account the entitlement does not admit, and never issue a connect on its behalf. Register nothing on the server before the plan admits it: a failed connect must leave no remote in Git config, no durable-queue mutation, and no server row.

Answer git-facing refusals as `text/plain` when the request carries no `Origin`, so stock Git prints the sentence; keep the JSON envelope for browsers and carry CORS headers on every 401.

Enforce the lease invariant server-side as well as in the client. Refuse every ref deletion and every non-fast-forward update in the Hosted Remote's `pre-receive` hook, for every ref family. A ref leaves the Hosted Remote only through rule 14's audited removal verb, never through a push. Git's `receive.denyDeletes` and `receive.denyNonFastForwards` are a backstop for `refs/heads/*` only and never a substitute: Git applies neither outside that namespace, so record refs stay rewindable under both flags alone.

### 20. Hold revision work to a latency budget

Revision interactions are interactive UI, not batch work. Every operation below has a budget and a fixture; a change that regresses one is a defect whether or not it is correct. Budgets tighten and never loosen. A budget with no reading at its fixture is owed, never assumed met.

| ID  | Operation                                              | Fixture                                                                                        | Budget                                                                                                                     | Reading (2026-09-25 run)                                                                                                     |
| --- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| B1  | Save → **Saved** visible                               | 1 000 files and one 5 MiB export, warm save                                                    | 100 ms browser, 150 ms native                                                                                              | Browser 61.5 and 57.9 ms; native 124.9 and 103.6 ms through the host                                                         |
| B2  | Mint → push request issued, connected and online       | Any                                                                                            | 2.1 s for a lone mint (the debounce plus 100 ms); a burst within `syncDebounceMaxWaitMilliseconds` (4 s) of its first mint | Pinned on the sync machine's clock                                                                                           |
| B3  | Restore                                                | 1 000 files                                                                                    | 300 ms browser, 500 ms native                                                                                              | Owed end to end; the restore plan reads one tree in 135.8 ms browser                                                         |
| B4  | History pane open                                      | 500 revisions on `main` and 8 branches, built through the product's own saves and _New branch_ | 50 ms browser, 100 ms native                                                                                               | Browser 31.6 ms; native owed                                                                                                 |
| B5  | One-revision push accepted by the Hosted Remote        | Deployed region                                                                                | 1 s p50                                                                                                                    | Owed: DG2's regional figure (go-live STO-10). Loopback with local object storage: 484 ms p50, 515 ms over 25 runs, 100 files |
| B6  | A second live device shows the new head                | Project open on both devices                                                                   | 5 s p95                                                                                                                    | Owed: the staging two-client run of DG3 (go-live STO-11). One local two-client reading settled in 3.7 s                      |
| B7  | A second device applies a fast-forward after the fetch | 1 000 files                                                                                    | 300 ms                                                                                                                     | Owed                                                                                                                         |
| B8  | Chat refs projected after a pull                       | 20 chats                                                                                       | 200 ms                                                                                                                     | Owed; needs a multi-chat fixture                                                                                             |

Read B1 and B4 in `apps/ui-e2e/src/revision-latency.spec.ts` on the page's own clock, from the trigger event's timestamp to the frame after the budgeted surface changes, as the median of five warm saves and of three History reopens after a reload. Assert both the budget and a ceiling of 1.5 times the recorded loaded baseline; record the harness's wall time beside the reading and never gate on it. Take readings only below a one-minute load of 15, and ratchet a baseline down only from a new reading at the same fixture.

Hold these costs, which the budgets above depend on:

| Operation                                            | Cost budget                                                                             |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Tree-hash gate after a one-file edit                 | Read one file; hash one blob plus that path's tree objects, never the tree              |
| Mint after a one-file edit                           | Write one blob plus that path's tree objects                                            |
| Spawn-time tree comparison at 1 000 files            | Never holds the first render: the checkout spawns clean and turns dirty when it answers |
| `readRevisionLog({ limit: 50 })`                     | At most 51 commits read; at most 5 `git` spawns native                                  |
| `readTree` native                                    | At most 3 `git` spawns; at most 16 concurrent children                                  |
| History push, any number of refs                     | One advertisement and one receive-pack on both legs                                     |
| Hosted Remote lease hydrate                          | One manifest read and one parallel round over the live packs; never a listing           |
| Turn marker flips to **Saved** after settlement      | One frame, with no graph re-walk                                                        |
| `useRevisions()` across renders with no store change | The same view reference                                                                 |

Spend work once: memoize object ids across a cut, capture only the paths a complete change feed names, batch native object reads through one `cat-file --batch`, and key a derived log on its head rather than recomputing it per mint. Return a referentially stable view from every revision hook so a marker flip costs one render, not a re-walk.

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
