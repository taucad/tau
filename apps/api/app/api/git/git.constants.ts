import type { BillingTier } from '@taucad/billing';

/**
 * Server-side constants of the Tau Hosted Remote (architecture A16/A24/A39,
 * charter D15/D16, blueprint S25/S35/S36/S49).
 */

/**
 * Refs a client may push (A39). Host-local namespaces —
 * `refs/tau/{owners,workspaces,revisions,transactions,head}` and `refs/remotes/*`
 * — are refused by `pre-receive` and never leave a host (N28). Conflict lines,
 * `refs/heads/conflicts/*`, are branches and travel (charter D14).
 */
export const pushableRefPrefixes = [
  'refs/heads/',
  'refs/tags/',
  'refs/tau/chats/',
  'refs/tau/evidence/',
  'refs/tau/artifacts/',
] as const;

/**
 * Refs the audited removal verb may remove (D24): named versions, and conflict
 * lines (D14). Everything else only ever moves forward (I2).
 */
export const isRemovableRef = (ref: string): boolean =>
  /^refs\/(?:tags|heads\/conflicts)\/[\w.\-/]+$/u.test(ref) && !ref.includes('..') && !ref.endsWith('/');

/**
 * DI token for the `RepositoryStore` port.
 *
 * The module binds the S3 adapter to it; nothing that injects the port names a
 * provider, which is NI14 expressed in the container rather than in prose.
 */
export const repositoryStoreKey = Symbol('repositoryStore');

/** The two smart-HTTP services git asks for by name. */
export const gitServices = ['git-upload-pack', 'git-receive-pack'] as const;
export type GitService = (typeof gitServices)[number];

export const isGitService = (value: string | undefined): value is GitService =>
  value !== undefined && (gitServices as readonly string[]).includes(value);

/**
 * Repository storage allowance per billing tier. The free tier cannot sync at
 * all (`canSyncFiles`), so its allowance is zero and the entitlement refusal
 * always fires first; Pro's 10 GB is the number the Sync region renders
 * (`2.1 GB of 10 GB`, architecture "Large-object policy").
 */
export const storageLimitBytesByTier: Readonly<Record<BillingTier, number>> = {
  free: 0,
  pro: 10 * 1024 ** 3,
  enterprise: 100 * 1024 ** 3,
};

/**
 * How many projects one account may register on the Tau Hosted Remote (P51,
 * review R5).
 *
 * Before P51, a repository could only come into being through a publish, which
 * costs a push and a materialization. `PUT /v1/projects/:projectId` makes
 * registration reachable by any signed-in account, so it needs a ceiling: each
 * registration is a row, and every row is a tenant prefix a later push fills.
 *
 * One flat number rather than a per-tier table: the plan already bounds what a
 * project may *hold* (`storageLimitBytesByTier`), and a second per-tier
 * dimension would be a product decision nobody has made. It is a constant rather
 * than an operator environment value for the same reason `storageLimitBytesByTier`
 * is — none of the Hosted Remote's plan numbers is env-tunable today, and one
 * that is would be the odd one out. Moving it is a one-line change when an
 * operator first needs to.
 */
export const registeredProjectLimitPerOwner = 200;

/**
 * Daily ceiling on `PUT /v1/projects/:projectId` calls per account.
 *
 * Separate from the cap above because the route is idempotent: a caller who is
 * already at the cap can still re-register projects it owns. Set well above any human's day — a
 * person connecting every one of their projects twice over is still inside it —
 * so it only ever catches a script.
 */
export const projectRegistrationsPerOwnerPerDay = 1000;

/**
 * The window every per-`(user, project)` git request budget is counted in (D22,
 * charter I11).
 */
export const gitRequestWindowSeconds = 60;

/**
 * Requests one account may make against one project per window, per route
 * family (D22, L6-F3). `rpc` is the three smart-HTTP routes, each of which
 * hydrates a whole lease; `lfs` is the batch and verify API, which touches the
 * database and presigns but hydrates nothing, and which a push of many large
 * files calls once per object.
 *
 * Sized so one always-on client never meets them: a push is two `rpc` requests
 * and a fetch two to four, against a 2 s push debounce. A loop that is not a
 * client does, and is answered `429` with `Retry-After`.
 */
export const gitRequestsPerWindow = { rpc: 120, lfs: 1200 } as const;

/**
 * Requests one account may make per window across every project and route
 * family together (D22, I11). Spent ahead of authorization with the
 * per-project budget, so cycling project ids cannot buy unbounded
 * authorization reads. Twice one project's `lfs` budget, so one project's
 * large push never meets it.
 */
export const gitRequestsPerUserPerWindow = 2400;

/**
 * Leases one caller may hydrate from one owner's repositories per UTC day (D22,
 * coordinator ruling 2026-09-25).
 *
 * Sized from the always-on case: a push is two hydrates (`info/refs` and
 * `receive-pack`), and a client pushing on the 2 s debounce all day makes
 * 43 200 pushes, or 86 400 hydrates, before its fetches. So a caller that is a
 * client never meets it, and a loop that is not one does. The owner's own
 * requests have a bucket of their own, which nobody else can spend.
 */
export const hydratesPerCallerPerDay = 100_000;

/**
 * Leases everybody who is not the owner may hydrate, together, from one owner's
 * repositories per UTC day (D22, coordinator ruling 2026-09-25): three
 * always-on collaborators' worth. Every lease is a full read billed to the
 * owner, so third parties together must not make that egress unbounded;
 * exhausting it refuses them and never the owner.
 */
export const hydratesFromOthersPerOwnerPerDay = 300_000;

/**
 * The fixed first words of the `GIT_REPOSITORY_INCOMPLETE` refusal (D22,
 * L6-F8): the manifest names a pack the store does not hold, which no retry can
 * repair. A leg that reads the JSON envelope keys on the body `code`; stock git
 * sees only the `text/plain` sentence, so the client matches this marker the
 * way it matches {@link ceilingRefusalMarker}.
 */
export const incompleteRepositoryMarker = "Tau: this project's cloud copy is damaged";

/**
 * Where one large object lives in the private bucket. Same `oid` layout
 * git-lfs itself uses (`packages/revisions/src/lfs.ts#lfsObjectPath`), under a
 * per-project prefix so quota accounting and deletion are per repository. The
 * two-line duplication is deliberate: `apps/api` does not depend on
 * `@taucad/revisions`, and adding the dependency to serve one template literal
 * is a manifest change this lane may not make. `git.constants.test.ts` pins
 * the two spellings together.
 */
export const gitLfsObjectKey = (projectId: string, oid: string): string =>
  `git-lfs/${projectId}/lfs/objects/${oid.slice(0, 2)}/${oid.slice(2, 4)}/${oid}`;

/**
 * Slack above the remaining allowance that `receive.maxInputSize` allows the
 * incoming pack to use. The bound exists so a push cannot fill the lease's
 * disk before any hook runs; the slack exists so an ordinary over-quota push is
 * still refused by `pre-receive` with the shortfall rather than by git's own
 * blunt "pack exceeds maximum allowed size".
 */
export const quotaOverrunSlackBytes = 64 * 1024 * 1024;

/**
 * The ceiling on a `git-upload-pack` request body.
 *
 * A fetch's body is `want`/`have` negotiation, never a pack, so this is orders
 * of magnitude above the largest real one — it exists because git has no
 * `receive.maxInputSize` equivalent for `upload-pack` and Fastify's `bodyLimit`
 * does not reach a streamed content-type parser, so the fetch RPC had no bound
 * at all (review C32). The same figure as the push path's slack, for the same
 * reason: it is the size at which a request stopped being a plausible one.
 */
export const negotiationInputLimitBytes = quotaOverrunSlackBytes;

/**
 * Project ids are `proj_<nanoid>`; anything else never reaches a storage key.
 * Both halves of a locator go through this predicate (`store/locator.ts`), so
 * no separator and no traversal can leave a tenant prefix (NI15).
 */
export const isProjectRepositoryId = (value: string): boolean => /^[A-Za-z\d][\w-]{0,63}$/u.test(value);

/** `<repo>` as a client spells it, with or without the conventional suffix. */
export const projectIdFromRepository = (repository: string): string | undefined => {
  const projectId = repository.endsWith('.git') ? repository.slice(0, -4) : repository;
  return isProjectRepositoryId(projectId) ? projectId : undefined;
};

/** Responses git must never cache (`git http-backend`'s own header set). */
export const noCacheHeaders: Readonly<Record<string, string>> = {
  expires: 'Fri, 01 Jan 1980 00:00:00 GMT',
  pragma: 'no-cache',
  'cache-control': 'no-cache, max-age=0, must-revalidate',
};

/** One pkt-line: four hex length digits (payload + 4) then the payload. */
export const pktLine = (payload: string): string => `${(payload.length + 4).toString(16).padStart(4, '0')}${payload}`;

/** The advertisement prefix `info/refs?service=` answers with. */
export const serviceAdvertisementPrefix = (service: GitService): string => `${pktLine(`# service=${service}\n`)}0000`;

/**
 * The fixed first words of D20's ceiling refusal.
 *
 * A `pre-receive` refusal carries no HTTP status, so this sentence is the only
 * thing that tells a client its push was refused for the *repository* ceiling
 * rather than for a rewind or a host-local ref. The client matches on it in
 * `packages/revisions/src/refusal-markers.ts`, which holds the same string
 * because that package does not depend on this app: those two copies, each
 * tested, are the only ones, and changing one changes the other.
 */
export const ceilingRefusalMarker = 'Tau: repository size limit exceeded';

/**
 * The words that refuse a conflicted revision outside a conflict line (charter D14).
 *
 * A conflicted revision still needs a person's decision, so it travels only on
 * `refs/heads/conflicts/<branch>/<device>`; `main` and every named branch
 * advance only by the merge that lands a decision, which has the conflicted
 * revision as a parent, never on its first-parent line.
 */
export const conflictedRevisionRefusal = 'it carries a revision that still needs your decision';

/**
 * `pre-receive`: the ref allow-list (A39), a fail-closed admission flag,
 * compare-and-swap for every ref family (I7/I9, ruling OQ4), append-only chat
 * log segments (charter I9, D22), conflicted revisions on conflict lines only
 * (charter D14), and the two byte
 * bounds measured on the quarantine directory receive-pack has already written:
 * the owner's plan headroom, and D20's per-repository ceiling with the file
 * list that makes it actionable. A non-zero exit rejects the whole push and git
 * discards the quarantine, so a refusal is never a partial write (D17).
 *
 * The lease imports it (`store/lease.ts`); no repository on any disk owns a
 * copy of it, so a deployment that changes this string changes every push.
 */
export const preReceiveHookScript = `#!/bin/sh
# Tau Hosted Remote pre-receive hook — written by apps/api GitService.
# Do not edit in place: every push through the API rewrites it.
set -eu

if [ "\${TAU_GIT_PUSH_ADMITTED:-}" != "1" ]; then
  echo "Tau: this repository accepts pushes only through the Tau API." >&2
  exit 1
fi

# I9 (D22): a device's chat log only grows. Between the old and the new tip of
# a chat ref, every change under \`events/\` must be a regular file
# (\`100644\`) that was one before and whose old bytes are a byte prefix of
# its new blob, or a new \`100644\` file; a deletion, a mode or type change
# (a symlink, an executable, a submodule, a tree) and any rewrite are refused
# (L6-F13, RV-W9 M2). A tree with duplicate or unsorted entries never reaches
# this hook: \`receive.fsckObjects\` refuses it first (\`store/lease.ts\`).
# \`diff-tree\` names each change by modes and object ids, so nothing here
# parses a path, and a path git quotes cannot slip past. \`head -c 0\` is not
# portable, so an empty old segment is a prefix of anything without reading it.
segments_only_grow() {
  if ! changes=$(git diff-tree -r --no-renames "$1" "$2" -- events/ 2>/dev/null); then
    echo "Tau: refused $3 — its chat log could not be compared with the one it replaces." >&2
    return 1
  fi
  printf '%s\\n' "$changes" | {
    refused=0
    while read -r was_mode now_mode was now change rest; do
      case "$change" in
        '') continue ;;
        A) [ "$now_mode" = "100644" ] && continue ;;
        M)
          if [ "$was_mode" = ":100644" ] && [ "$now_mode" = "100644" ]; then
            size=$(git cat-file -s "$was")
            if [ "$size" -eq 0 ] || [ "$(git cat-file blob "$now" 2>/dev/null | head -c "$size" | git hash-object --stdin)" = "$was" ]; then
              continue
            fi
          fi
          ;;
      esac
      echo "Tau: refused $3 — it rewrites $rest, and a device's chat log only grows." >&2
      refused=1
    done
    exit "$refused"
  }
}

# D14: a conflicted revision — a commit with a \`jj:trees\` header — travels only
# on a conflict line. Any other ref is refused when its new tip is one, or when
# one sits on the tip's first-parent line among the commits this push brings:
# the walk stops at anything a ref other than a conflict line already reaches,
# so N tags at \`main\` read N tips and no history (RV-W6 F4). The merge that
# lands a decision has the conflicted revision as a later parent, so it passes,
# and \`main := C\` or a child of it does not. Only a commit's header block is
# read, up to the blank line that ends it. Exit 0: carries one; 1: clean;
# 2: the walk failed, which the caller refuses (fail closed — \`sh\` may have no
# \`pipefail\`, so the walk's own status is read before anything is piped).
carries_conflict() {
  if ! walked=$(git rev-list --first-parent "$1" --not --exclude='refs/heads/conflicts/*' --all 2>/dev/null); then
    return 2
  fi
  { printf '%s\\n' "$1"; [ -z "$walked" ] || printf '%s\\n' "$walked"; } \\
    | git cat-file --batch 2>/dev/null \\
    | awk '
        /^[0-9a-f]+ commit [0-9]+$/ { header = 1; next }
        header && /^$/ { header = 0; next }
        header && /^jj:trees / { found = 1 }
        END { exit found ? 0 : 1 }
      '
}

status=0
arriving=''
while read -r _old _new ref; do
  case "$ref" in
    refs/remotes|refs/remotes/?*|refs/tau/owners|refs/tau/owners/?*|refs/tau/workspaces|refs/tau/workspaces/?*|refs/tau/revisions|refs/tau/revisions/?*|refs/tau/transactions|refs/tau/transactions/?*|refs/tau/head|refs/tau/head/?*|refs/tau/retention|refs/tau/retention/?*)
      echo "Tau: refused $ref — host-local refs never leave a host." >&2
      status=1
      continue
      ;;
    ${pushableRefPrefixes.map((prefix) => `${prefix}?*`).join('|')}) ;;
    *)
      echo "Tau: refused $ref — host-local refs never leave a host." >&2
      status=1
      continue
      ;;
  esac
  # Compare-and-swap, for every ref family (charter I7/I9, ruling OQ4).
  # \`receive.denyDeletes\` and \`receive.denyNonFastForwards\` are set on the
  # spawn too, but git applies both only to \`refs/heads/*\` — measured: a tag
  # and a \`refs/tau/chats/*\` ref could still be deleted and force-rewound with
  # them on. So the rule lives here, where every family is already read, and the
  # refusal is a sentence the client can read rather than git's own
  # "deletion prohibited".
  case "$_new" in
    *[!0]*) ;;
    *)
      echo "Tau: refused $ref — Tau Cloud never deletes a ref; retention is decided on the server." >&2
      status=1
      continue
      ;;
  esac
  case "$_old" in
    *[!0]*)
      if ! git merge-base --is-ancestor "$_old^{commit}" "$_new^{commit}" 2>/dev/null; then
        echo "Tau: refused $ref — it does not fast-forward $_old; fetch and merge first." >&2
        status=1
        continue
      fi
      case "$ref" in
        refs/tau/chats/?*)
          segments_only_grow "$_old" "$_new" "$ref" || status=1
          ;;
      esac
      ;;
  esac
  case "$ref" in
    refs/heads/conflicts/?*/?*) ;;
    refs/heads/conflicts|refs/heads/conflicts/*)
      # RV-W6 F8: \`conflicts\` itself would shadow every device's lines.
      echo "Tau: refused $ref — conflicts/ is kept for decisions that travel between devices, as refs/heads/conflicts/<branch>/<device>." >&2
      status=1
      continue
      ;;
    *)
      verdict=0
      carries_conflict "$_new" || verdict=$?
      if [ "$verdict" -eq 0 ]; then
        echo "Tau: refused $ref — ${conflictedRevisionRefusal}. Decide it in Tau; a conflict travels only on refs/heads/conflicts/." >&2
        status=1
      elif [ "$verdict" -ne 1 ]; then
        echo "Tau: refused $ref — its history could not be checked for undecided revisions. Try again." >&2
        status=1
      fi
      ;;
  esac
  arriving="$arriving $_new"
done
if [ "$status" -ne 0 ]; then
  echo "Tau: pushable refs are ${pushableRefPrefixes.map((prefix) => `${prefix}*`).join(', ')}." >&2
  exit "$status"
fi

# The blobs this push brings that no existing ref already reaches, largest
# first. \`rev-list --objects\` prints "<oid> <path>"; \`cat-file --batch-check\`
# turns each line into "<type> <size> <path>". This is the "affected file list"
# D20 asks the ceiling refusal to carry — the answer to "what do I remove?".
arriving_files() {
  git rev-list --objects $arriving --not --all 2>/dev/null \\
    | git cat-file --batch-check='%(objecttype) %(objectsize) %(rest)' 2>/dev/null \\
    | awk '$1 == "blob" && NF > 2 { rest = $0; sub(/^[^ ]+ [^ ]+ /, "", rest); printf "%s %s\\n", $2, rest }' \\
    | sort -rn \\
    | head -n 10 \\
    | awk '{ rest = $0; sub(/^[^ ]+ /, "", rest); printf "Tau:   %s (%s bytes)\\n", rest, $1 }' >&2 || true
}

remaining="\${TAU_GIT_QUOTA_REMAINING_BYTES:-}"
ceiling="\${TAU_GIT_CEILING_REMAINING_BYTES:-}"
quarantine="\${GIT_QUARANTINE_PATH:-}"
if [ -n "$quarantine" ] && [ -d "$quarantine" ]; then
  incoming=$(du -sk "$quarantine" | cut -f1)
  incoming=$((incoming * 1024))
  if [ -n "$remaining" ] && [ "$incoming" -gt "$remaining" ]; then
    echo "Tau: storage quota exceeded — this push needs $((incoming - remaining)) bytes more than the plan allows." >&2
    echo "Tau: nothing was written." >&2
    exit 1
  fi
  # D20: the per-repository ceiling on non-LFS bytes. A hydration guard rather
  # than a billing guard — the plan above binds the bill first — so it is a
  # separate sentence with the file list that makes it actionable.
  if [ -n "$ceiling" ] && [ "$incoming" -gt "$ceiling" ]; then
    echo "${ceilingRefusalMarker} — this push needs $((incoming - ceiling)) bytes more than this repository may hold." >&2
    echo "Tau: the largest files it adds are:" >&2
    arriving_files
    echo "Tau: nothing was written." >&2
    exit 1
  fi
elif [ -n "$remaining" ] || [ -n "$ceiling" ]; then
  # Fail closed, like the admission flag above (review F6): a bound that cannot
  # measure what is arriving has not been satisfied. Reached only by a git
  # without object quarantine, which this service does not deploy.
  echo "Tau: this push cannot be measured — the server refused it rather than guess." >&2
  echo "Tau: nothing was written." >&2
  exit 1
fi
exit 0
`;
