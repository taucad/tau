import { formatStorageLimit } from '@taucad/billing';

/** Inclusive project-file ceiling, shared by Git and LFS admission on every client. */
export const projectFileLimitBytes = 100 * 1024 * 1024;

/**
 * Server-side constants of the Tau Hosted Remote (architecture A16/A24/A39,
 * charter D15/D16, blueprint S25/S35/S36/S49).
 */

/**
 * Refs a client may push (A39). Host-local namespaces —
 * `refs/tau/{owners,workspaces,revisions,transactions,head}` and `refs/remotes/*`
 * — are refused by `pre-receive` and never leave a host (N28). Conflict lines,
 * `refs/heads/conflicts/*`, are branches and travel (charter D14). A device's
 * operation log, `refs/tau/ops/<device>`, is a Records ref and travels (D15).
 */
export const pushableRefPrefixes = [
  'refs/heads/',
  'refs/tags/',
  'refs/tau/chats/',
  'refs/tau/evidence/',
  'refs/tau/artifacts/',
  'refs/tau/ops/',
] as const;

/**
 * Refs the audited removal verb may remove (D24): conflict lines only (D14),
 * `refs/heads/conflicts/<line>`. A version, `refs/tags/v<n>`, is never removed
 * (a rename rewrites its tag at the same ref), and everything else only ever
 * moves forward (I2). The API and tau-storage both refuse through this one
 * predicate.
 */
export const isRemovableRef = (ref: string): boolean =>
  /^refs\/heads\/conflicts\/[\w.\-/]+$/u.test(ref) && !ref.includes('..') && !ref.endsWith('/');

/** The `GIT_REF_NOT_REMOVABLE` refusal's message, from the API and tau-storage alike. */
export const notRemovableMessage =
  'Only a conflict line (refs/heads/conflicts/*) can be removed; a version is never removed.';

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
 * Who a quota refusal is addressed to (charter D17, I12): the one action a
 * refused push offers depends on the caller's relationship to the project.
 * `owner` may grow the plan (*Upgrade*); `ownerAtTopTier` has no larger plan,
 * so the file list is the whole of what can be done; `collaborator` pushes
 * against a plan they cannot change, so the sentence directs them to the owner.
 */
export type QuotaAudience = 'owner' | 'ownerAtTopTier' | 'collaborator';

/**
 * The fixed first words of the pre-receive quota refusal. A `pre-receive`
 * refusal carries no HTTP status, so the client files it as a storage answer by
 * these words (`packages/revisions/src/refusal-markers.ts` holds the same
 * string), exactly as it does {@link ceilingRefusalMarker}.
 */
export const quotaRefusalMarker = 'Tau: storage quota exceeded';

/**
 * The one sentence a quota refusal says, on every leg (D17): the `413` of an
 * exhausted allowance, the LFS batch `413` with its file list, and the
 * `pre-receive` refusal. It names the allowance a person was sold — the figure
 * the Sync region renders as `x of 1 GB` — to the owner, and never the owner's
 * plan to a collaborator.
 *
 * @param audience - Who is being refused.
 * @param limitBytes - The owner's allowance.
 * @returns The sentence.
 */
export const quotaRefusalSentence = (audience: QuotaAudience, limitBytes: number): string => {
  switch (audience) {
    case 'owner': {
      return `This push needs more room than your ${formatStorageLimit(limitBytes)} storage plan has left, so it was not backed up.`;
    }
    case 'ownerAtTopTier': {
      return `This push needs more room than your ${formatStorageLimit(limitBytes)} storage plan has left, so it was not backed up. Remove or stop tracking the largest files to make room.`;
    }
    case 'collaborator': {
      return "This push needs more room than the project owner's storage plan has left, so it was not backed up. Ask the owner to make room.";
    }
  }
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
 * project may *hold* (`storageLimitBytesByTier` in `@taucad/billing`), and a second per-tier
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
 * The key is the account and the project, so every device of one account
 * shares it. Sized from the two-client tier's busiest 60 s (W13d): a desktop
 * and a browser editing one project at the tier's cadence made 235 `rpc`
 * requests and drew 24 `429`s before W13d, and 123 with none after it. 240
 * keeps that pair clear with room for the stream echo a peer's push still
 * costs. A loop that is not a client meets it and is answered `429` with
 * `Retry-After`.
 */
export const gitRequestsPerWindow = { rpc: 240, lfs: 1200 } as const;

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
 * The authorship refusals the hook printed before WP2a of the cloud backup admission blueprint (2026-11-27,
 * operator rulings OP1 and Q1): retired, never printed. A push is never refused for who a commit claims to be by
 * or for which record shape it carries.
 *
 * The sentences stay as data for one reader: tau-api's push log classifies an uncoded refusal carrying one of
 * them under its retired code, so the `backup-retired-code` alert fires when a `tau-storage` rolled back below
 * WP2a refuses a push (`hook-refusals.ts`).
 */
/* eslint-disable @typescript-eslint/naming-convention -- the keys are refusal codes, spelled as rule 19's ladder named them */
export const retiredAuthorshipRefusals = {
  GIT_PUSH_ACTOR_NOT_PUSHER:
    'it does not name the account pushing it. Tau backs up a revision only for the account that recorded it, or the account an agent worked for.',
  GIT_PUSH_AUTHOR_ADDRESS:
    'Tau recorded it with an email address as its author, and Tau keeps only its own no-reply addresses. Start a new project to back up this work.',
  GIT_PUSH_NOT_RECORDED_BY_TAU:
    'Tau did not record it, and it was not made with your Tau identity. Commit with your Tau identity to back it up: set git user.email to your Tau no-reply address, then make the commit again (git commit --amend --reset-author redoes the last one).',
  GIT_PUSH_RECORD_UNREADABLE: 'its Tau record could not be read, so the server refused it rather than guess.',
} as const;
/* eslint-enable @typescript-eslint/naming-convention -- end of the refusal codes */

export type RetiredAuthorshipRefusal = keyof typeof retiredAuthorshipRefusals;

/**
 * The fixed first words of every terminal hook refusal (contracts § 5).
 *
 * A terminal refusal is one a retry carrying the same history cannot clear. Shipped clients match these words
 * in `packages/revisions/src/refusal-markers.ts` and file a refused **history** ref as fatal, so they stop
 * retrying; that package does not depend on this app, so those two copies, each tested, are the only ones, and
 * changing one changes the other.
 */
export const commitRefusalMarker = 'Tau: refused commit';

/**
 * The first words of a terminal hook sentence: the marker, `history`, and the ref when one is named.
 *
 * @param ref - The refused ref, or nothing when the refusal is about the whole push.
 * @returns The sentence's opening, up to the dash.
 */
export const terminalRefusalOpening = (ref?: string): string =>
  `${commitRefusalMarker} history${ref === undefined ? '' : ` on ${ref}`}`;

/** The one sentence of every hook check that could not finish: retryable, and never terminal. */
export const checkFailedSentence = 'Tau: a check could not finish. Try again.';

/** The prefix of the hook's machine-readable lines, one per distinct code: `Tau-Code: <CODE> <count>`. */
export const hookCodeLinePrefix = 'Tau-Code: ';

/**
 * How a client handles a hook code (contracts § 5, § 6): `terminal` no retry clears; `quota` the plan or the
 * repository ceiling; `clears` the client clears by itself (renumber, or fetch and merge); `retryable` a check
 * that could not finish.
 */
export type HookRefusalClass = 'terminal' | 'quota' | 'clears' | 'retryable';

/**
 * Every code the `pre-receive` hook prints, with its rank and class (contracts § 5). The hook prints one
 * `Tau-Code: <CODE> <count>` line per distinct code, lowest rank first, because a client keeps only the first
 * code line (`packages/revisions/src/remotes.ts`). `libs/telemetry`'s `hookRefusalCodes` declares each of them,
 * so a refusal counts under its own code, never `other`.
 */
/* eslint-disable @typescript-eslint/naming-convention -- the keys are refusal codes, spelled as rule 19's ladder names them */
export const hookRefusalCodes = {
  GIT_PUSH_NOT_ADMITTED: { rank: 1, class: 'terminal' },
  GIT_PUSH_REF_NOT_PUSHABLE: { rank: 2, class: 'terminal' },
  GIT_PUSH_REF_DELETION: { rank: 2, class: 'terminal' },
  GIT_PUSH_RECORD_REWRITTEN: { rank: 2, class: 'terminal' },
  GIT_PUSH_CONFLICT_REF_INVALID: { rank: 2, class: 'terminal' },
  GIT_PUSH_CONFLICT_OFF_LINE: { rank: 2, class: 'terminal' },
  GIT_PUSH_VERSION_TAG_INVALID: { rank: 2, class: 'terminal' },
  GIT_PUSH_VERSION_MOVED: { rank: 2, class: 'terminal' },
  GIT_PUSH_FILE_TOO_LARGE: { rank: 2, class: 'terminal' },
  GIT_PUSH_QUOTA: { rank: 3, class: 'quota' },
  GIT_PUSH_CEILING: { rank: 3, class: 'quota' },
  GIT_PUSH_VERSION_NUMBER_TAKEN: { rank: 4, class: 'clears' },
  GIT_PUSH_NOT_FAST_FORWARD: { rank: 4, class: 'clears' },
  GIT_PUSH_CHECK_FAILED: { rank: 5, class: 'retryable' },
} as const satisfies Record<string, { rank: number; class: HookRefusalClass }>;
/* eslint-enable @typescript-eslint/naming-convention -- end of the refusal codes */

export type HookRefusalCode = keyof typeof hookRefusalCodes;

/**
 * The two refusals git itself makes before the hook runs (contracts § 5): `receive.maxInputSize` stopping the
 * pack, and an unpack or `receive.fsckObjects` failure. Git prints its own words; the client classifies them and
 * tau-api counts them beside the hook's codes.
 */
export const gitReceiveRefusalCodes = ['GIT_PUSH_TOO_LARGE', 'GIT_PUSH_OBJECT_INVALID'] as const;

export type GitReceiveRefusalCode = (typeof gitReceiveRefusalCodes)[number];

/**
 * The version of the kept guards a current client's preflight checks before it uploads (blueprint D7). A client
 * sends it as `Tau-Client-Rules`; tau-api labels a refused push `current` when it matches, `older` when it does
 * not, and `none` when the header is absent, which is every build released before WP6. Raise it with any change
 * to a kept guard.
 */
export const hookRulesRevision = '1';

/**
 * The fixed first words of the taken-number refusal (blueprint B6).
 *
 * The one hook refusal a client clears by itself: it gives its own version
 * that is not backed up the next free number and pushes again. The client
 * matches on it in `packages/revisions/src/refusal-markers.ts`, which holds the
 * same string because that package does not depend on this app: those two
 * copies, each tested, are the only ones, and changing one changes the other.
 */
export const versionNumberTakenMarker = 'Tau: version number taken';

/**
 * Why `pre-receive` refuses a version tag (blueprint B6, Q6, Q13, I6; Revisions
 * Policy rule 19). A version is an annotated tag at `refs/tags/v<number>`, V2
 * onward (V1 is the Start entry, which has no tag): the ref is the number, and
 * the name is free text in the tag's message. Each name is a row of rule 19's
 * ladder.
 */
/* eslint-disable @typescript-eslint/naming-convention -- the keys are refusal codes, spelled as rule 19's ladder names them */
export const versionNumberRefusals = {
  /** Another version on Tau Cloud already holds the number, or it is V1, which Start holds. */
  GIT_PUSH_VERSION_NUMBER_TAKEN:
    'another version already holds its number. Tau gives a version that is not backed up yet the next free number and backs it up again.',
  /** The ref is a version's, but what it names is not a version: not an annotated tag with a valid Tau-Tag record. */
  GIT_PUSH_VERSION_TAG_INVALID:
    'a version tag must be an annotated tag with its Tau-Tag record. Only Tau writes version tags at refs/tags/v<number>.',
  /** The push re-points a backed-up version at another entry; a version keeps its entry (I6, Q13). */
  GIT_PUSH_VERSION_MOVED:
    'a backed-up version always names the entry it was made on. Renaming it keeps that entry; make a new version for another entry.',
} as const;
/* eslint-enable @typescript-eslint/naming-convention -- end of the refusal codes */

export type VersionNumberRefusal = keyof typeof versionNumberRefusals;

/**
 * The version-number check `pre-receive` runs over the tags a push brings (B6).
 * A Node program, because a `Tau-Tag` record is JSON. `argv[1]` is the
 * push's tag updates as `<old> <new> <ref>` triples, `argv[2]` the
 * repository's tags as `<oid> <ref>` lines, and stdin `git cat-file --batch`
 * over every object the updates name, which the hook's shell reads (the
 * quarantine is visible to it) so the program spawns nothing; an object
 * missing from stdin is a check that could not finish.
 *
 * It prints one `<CODE> <sentence>` line on stdout per refusal and exits 0;
 * the hook's shell files each under its code (contracts § 5). A non-zero exit
 * is a check that did not finish, which the shell refuses as
 * `GIT_PUSH_CHECK_FAILED`.
 *
 * Only a version may hold `refs/tags/v<n>`: an annotated tag whose message
 * ends in a valid `Tau-Tag` record (`{ version: 2, id, name, … }`). Anything
 * else there — a lightweight tag, a tag another tool wrote, a record without
 * its id — is `GIT_PUSH_VERSION_TAG_INVALID`, because once it landed it would
 * hold a number no reader can show and no push can clear.
 *
 * The number is the ref's, so a pushed version is refused
 * (`GIT_PUSH_VERSION_NUMBER_TAKEN`, printed after the fixed marker the client
 * matches) when:
 *
 * - `n` is 1, which Start holds;
 * - it creates a number Tau Cloud already holds;
 * - it replaces the tag there with another version: a record with another
 *   `id`, or anything over a tag that is not a version. A rename keeps the id
 *   and passes, so a backed-up number never changes (I6).
 *
 * A rename that names another object than the held tag does is
 * `GIT_PUSH_VERSION_MOVED`: a version keeps its entry (I6, Q13). Git's own
 * fast-forward rule would let it move to any later entry.
 *
 * An object that cannot be read is `GIT_PUSH_CHECK_FAILED`. A tag under
 * any other name is not a version and passes. Written without template
 * literals so it embeds in the hook's quoted heredoc unchanged.
 */
export const versionNumberCheckScript = String.raw`'use strict';
const refusals = ${JSON.stringify(versionNumberRefusals)};
const opening = ${JSON.stringify(terminalRefusalOpening())};
const checkFailed = ${JSON.stringify(checkFailedSentence)};
const marker = ${JSON.stringify(versionNumberTakenMarker)};
const words = (process.argv[1] || '').split(' ').filter(Boolean);
const zero = /^0+$/;
const versionRef = /^refs\/tags\/v([1-9][0-9]*)$/;
const refuse = (code, sentence) => {
  process.stdout.write(code + ' ' + sentence + '\n');
};
try {
  const held = new Set();
  for (const line of (process.argv[2] || '').split('\n')) {
    const space = line.indexOf(' ');
    if (space > 0) {
      held.add(line.slice(space + 1));
    }
  }
  const trailerPrefix = 'Tau-Tag: ';
  const versionId = /^[0-9a-f]{32}$/;
  /* The object a tag names: its first header line. */
  const objectOf = (body) => {
    const line = body.slice(0, body.indexOf('\n'));
    return line.startsWith('object ') ? line.slice('object '.length) : null;
  };
  const objects = new Map();
  /* A version's id, or null for an object that is not a version. */
  const versionOf = (type, body) => {
    if (type !== 'tag') {
      return null;
    }
    const split = body.indexOf('\n\n');
    const lines = (split === -1 ? '' : body.slice(split + 2)).split('\n');
    let line;
    for (const candidate of lines) {
      if (candidate.startsWith(trailerPrefix)) {
        line = candidate;
      }
    }
    if (line === undefined) {
      return null;
    }
    let record;
    try {
      record = JSON.parse(line.slice(trailerPrefix.length));
    } catch {
      return null;
    }
    return record !== null &&
      typeof record === 'object' &&
      record.version === 2 &&
      typeof record.id === 'string' &&
      versionId.test(record.id) &&
      typeof record.name === 'string' &&
      record.name.length > 0
      ? record.id
      : null;
  };
  const versions = new Map();
  const batch = require('node:fs').readFileSync(0);
  {
    let offset = 0;
    while (offset < batch.length) {
      const end = batch.indexOf(10, offset);
      const header = batch.toString('latin1', offset, end === -1 ? batch.length : end).split(' ');
      if (end === -1 || header.length !== 3) {
        break;
      }
      const size = Number(header[2]);
      const body = batch.toString('utf8', end + 1, end + 1 + size);
      offset = end + 2 + size;
      versions.set(header[0], versionOf(header[1], body));
      objects.set(header[0], header[1] === 'tag' ? objectOf(body) : null);
    }
  }
  for (let index = 0; index + 2 < words.length; index += 3) {
    const old = words[index];
    const now = words[index + 1];
    const ref = words[index + 2];
    const match = versionRef.exec(ref);
    if (match === null) {
      continue;
    }
    if (!versions.has(now) || (!zero.test(old) && !versions.has(old))) {
      refuse('GIT_PUSH_CHECK_FAILED', checkFailed);
    } else if (versions.get(now) === null) {
      refuse('GIT_PUSH_VERSION_TAG_INVALID', opening + ' on ' + ref + ' — ' + refusals.GIT_PUSH_VERSION_TAG_INVALID);
    } else if (
      match[1] === '1' ||
      (zero.test(old) ? held.has(ref) : versions.get(old) === null || versions.get(old) !== versions.get(now))
    ) {
      refuse(
        'GIT_PUSH_VERSION_NUMBER_TAKEN',
        marker + ' — ' + ref + ' names V' + match[1] + ': ' + refusals.GIT_PUSH_VERSION_NUMBER_TAKEN,
      );
    } else if (!zero.test(old) && objects.get(old) !== objects.get(now)) {
      refuse('GIT_PUSH_VERSION_MOVED', opening + ' on ' + ref + ' — ' + refusals.GIT_PUSH_VERSION_MOVED);
    }
  }
} catch {
  refuse('GIT_PUSH_CHECK_FAILED', checkFailed);
}
`;

/** The forges a Tau Cloud project can be linked to: `project.origin` names one, and the grant carries it. */
export const linkedForges = ['github'] as const;
export type LinkedForge = (typeof linkedForges)[number];

/** The `case` arms that give each hook code its rank, so the shell and {@link hookRefusalCodes} cannot disagree. */
const rankArms = [...new Set(Object.values(hookRefusalCodes).map(({ rank }) => rank))]
  .map((rank) => {
    const codes = Object.entries(hookRefusalCodes).filter(([, entry]) => entry.rank === rank);
    return `    ${codes.map(([code]) => code).join('|')}) echo ${String(rank)} ;;`;
  })
  .join('\n');

/**
 * `pre-receive`: the ref allow-list (A39), a fail-closed admission flag,
 * compare-and-swap for every ref family (I7/I9, ruling OQ4), append-only chat
 * and operation log segments (charter I9, D22, ruling R4), conflicted revisions
 * on conflict lines only (charter D14), version numbers (B6), the per-file
 * size, and the two byte bounds measured on the quarantine directory
 * receive-pack has already written: the owner's plan headroom, and D20's
 * per-repository ceiling with the file list that makes it actionable. A
 * non-zero exit rejects the whole push and git discards the quarantine, so a
 * refusal is never a partial write (D17).
 *
 * It judges no authorship (cloud backup admission blueprint D2, operator
 * rulings OP1 and Q1): no commit is refused for who it claims to be by or for
 * which record shape it carries. Every refusal is buffered under its code
 * (contracts § 5) and printed at the end: one `Tau-Code: <CODE> <count>` line
 * per distinct code, lowest rank first, then the sentences, then
 * `Tau: nothing was written.` Every terminal sentence opens with
 * {@link commitRefusalMarker}; the quota, ceiling and taken-number markers stay
 * byte-identical.
 *
 * The lease imports it (`store/lease.ts`); no repository on any disk owns a
 * copy of it, so a deployment that changes this string changes every push.
 */
export const preReceiveHookScript = `#!/bin/sh
# Tau Hosted Remote pre-receive hook — written by apps/api GitService.
# Do not edit in place: every push through the API rewrites it.
set -eu

# Contracts § 5: each refusal is filed under its code and printed by \`finish\`,
# codes first (lowest rank first, because a client keeps only the first code
# line), then the sentences, then the one closing line.
codes=''
sentences=''
refuse() {
  codes="$codes
$1"
  sentences="$sentences
$2"
}
say() {
  sentences="$sentences
$1"
}
rank_of() {
  case "$1" in
${rankArms}
    *) echo 9 ;;
  esac
}
finish() {
  printf '%s\\n' "$codes" | awk 'NF' | sort | uniq -c | while read -r count code; do
    printf '%s %s %s\\n' "$(rank_of "$code")" "$code" "$count"
  done | sort -k1,1n -k2,2 | while read -r _rank code count; do
    echo "${hookCodeLinePrefix}$code $count" >&2
  done
  printf '%s\\n' "$sentences" | awk 'NF' >&2
  echo "Tau: nothing was written." >&2
  exit 1
}

if [ "\${TAU_GIT_PUSH_ADMITTED:-}" != "1" ]; then
  refuse GIT_PUSH_NOT_ADMITTED "${terminalRefusalOpening()} — this repository accepts pushes only through the Tau API."
  finish
fi

# I9 (D22): a device's chat log only grows, and so does its operation log
# (ruling R4). Between the old and the new tip of a chat or \`refs/tau/ops/*\`
# ref, every change under \`events/\` must be a regular file
# (\`100644\`) that was one before and whose old bytes are a byte prefix of
# its new blob, or a new \`100644\` file; a deletion, a mode or type change
# (a symlink, an executable, a submodule, a tree) and any rewrite are refused
# (L6-F13, RV-W9 M2). A tree with duplicate or unsorted entries never reaches
# this hook: \`receive.fsckObjects\` refuses it first (\`store/lease.ts\`).
# \`diff-tree\` names each change by modes and object ids, so nothing here
# parses a path, and a path git quotes cannot slip past. \`head -c 0\` is not
# portable, so an empty old segment is a prefix of anything without reading it.
# Exit 0: only grows; 1: rewritten; 2: the comparison failed, which the caller
# refuses as a check that could not finish (fail closed).
segments_only_grow() {
  if ! changes=$(git diff-tree -r --no-renames "$1" "$2" -- events/ 2>/dev/null); then
    return 2
  fi
  printf '%s\\n' "$changes" | {
    rewritten=0
    while read -r was_mode now_mode was now change rest; do
      case "$change" in
        '') continue ;;
        A) [ "$now_mode" = "100644" ] && continue ;;
        M)
          if [ "$was_mode" = ":100644" ] && [ "$now_mode" = "100644" ]; then
            size=$(git cat-file -s "$was" 2>/dev/null) || exit 2
            git cat-file -e "$now" 2>/dev/null || exit 2
            prefix=$(git cat-file blob "$now" 2>/dev/null | head -c "$size" | git hash-object --stdin) || exit 2
            if [ "$size" -eq 0 ] || [ "$prefix" = "$was" ]; then
              continue
            fi
          fi
          ;;
      esac
      rewritten=1
    done
    exit "$rewritten"
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

# The Node check below, as a function that prints its source. A here-document
# inside \`$( … )\` is scanned as shell by bash 3.2, which is macOS's \`/bin/sh\`:
# an apostrophe or parenthesis in the JavaScript ends the substitution early
# ("unexpected EOF while looking for matching \`)'"), so the here-document
# lives in a function body and the substitution only calls it.
version_check_source() {
  cat <<'TAU_VERSION_CHECK'
${versionNumberCheckScript}
TAU_VERSION_CHECK
}

# The objects the version check reads: each non-zero id among the \`<old> <new> <ref>\`
# words in \`$versions\`. A function, not a loop inside \`$( … )\`: bash 3.2 reads the
# \`)\` that ends a \`case\` pattern there as the end of the substitution.
version_object_ids() {
  for word in $versions; do
    case "$word" in
      refs/*) ;;
      *[!0]*) printf '%s\\n' "$word" ;;
    esac
  done
}

status=0
arriving=''
versions=''
while read -r _old _new ref; do
  case "$ref" in
    refs/remotes|refs/remotes/?*|refs/tau/owners|refs/tau/owners/?*|refs/tau/workspaces|refs/tau/workspaces/?*|refs/tau/revisions|refs/tau/revisions/?*|refs/tau/transactions|refs/tau/transactions/?*|refs/tau/head|refs/tau/head/?*|refs/tau/retention|refs/tau/retention/?*)
      refuse GIT_PUSH_REF_NOT_PUSHABLE "${terminalRefusalOpening('$ref')} — host-local refs never leave a host."
      status=1
      continue
      ;;
    ${pushableRefPrefixes.map((prefix) => `${prefix}?*`).join('|')}) ;;
    *)
      refuse GIT_PUSH_REF_NOT_PUSHABLE "${terminalRefusalOpening('$ref')} — host-local refs never leave a host."
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
      refuse GIT_PUSH_REF_DELETION "${terminalRefusalOpening('$ref')} — Tau never deletes a ref; retention is decided on the server."
      status=1
      continue
      ;;
  esac
  case "$_old" in
    *[!0]*)
      if ! git merge-base --is-ancestor "$_old^{commit}" "$_new^{commit}" 2>/dev/null; then
        refuse GIT_PUSH_NOT_FAST_FORWARD "Tau: refused $ref — it does not fast-forward $_old; fetch and merge first."
        status=1
        continue
      fi
      case "$ref" in
        # Ruling R4: a device's operation log has the chat segment's shape.
        refs/tau/chats/?*|refs/tau/ops/?*)
          grows=0
          segments_only_grow "$_old" "$_new" || grows=$?
          if [ "$grows" -eq 1 ]; then
            refuse GIT_PUSH_RECORD_REWRITTEN "${terminalRefusalOpening('$ref')} — it rewrites a log that only grows."
            status=1
          elif [ "$grows" -ne 0 ]; then
            refuse GIT_PUSH_CHECK_FAILED "${checkFailedSentence}"
            status=1
          fi
          ;;
      esac
      ;;
  esac
  case "$ref" in
    refs/heads/conflicts/?*/?*) ;;
    refs/heads/conflicts|refs/heads/conflicts/*)
      # RV-W6 F8: \`conflicts\` itself would shadow every device's lines.
      refuse GIT_PUSH_CONFLICT_REF_INVALID "${terminalRefusalOpening('$ref')} — conflicts/ is kept for decisions that travel between devices, as refs/heads/conflicts/<branch>/<device>."
      status=1
      continue
      ;;
    *)
      verdict=0
      carries_conflict "$_new" || verdict=$?
      if [ "$verdict" -eq 0 ]; then
        refuse GIT_PUSH_CONFLICT_OFF_LINE "${terminalRefusalOpening('$ref')} — ${conflictedRevisionRefusal}. Decide it in Tau; a conflict travels only on refs/heads/conflicts/."
        status=1
      elif [ "$verdict" -ne 1 ]; then
        refuse GIT_PUSH_CHECK_FAILED "${checkFailedSentence}"
        status=1
      fi
      ;;
  esac
  arriving="$arriving $_new"
  case "$ref" in
    refs/tags/?*) versions="$versions $_old $_new $ref" ;;
  esac
done
if [ "$status" -ne 0 ]; then
  say "Tau: pushable refs are ${pushableRefPrefixes.map((prefix) => `${prefix}*`).join(', ')}."
  finish
fi

# B6 (Q6, I6): a version's number, its ref \`refs/tags/v<n>\`, is held by one
# version on Tau Cloud and never changes once backed up. Set by the storage
# worker for every push it admits; a hook run without a pusher is a test or a
# maintenance push, which the admission flag above already gates. Fail closed:
# a check that cannot finish refuses the push as one that may be retried.
if [ -n "\${TAU_GIT_PUSHER:-}" ] && [ -n "$versions" ]; then
  if [ -z "\${TAU_GIT_NODE:-}" ]; then
    refuse GIT_PUSH_CHECK_FAILED "${checkFailedSentence}"
    finish
  fi
  version_check=$(version_check_source)
  if ! held_tags=$(git for-each-ref --format='%(objectname) %(refname)' refs/tags/ 2>/dev/null); then
    refuse GIT_PUSH_CHECK_FAILED "${checkFailedSentence}"
    finish
  fi
  version_objects=$(version_object_ids | sort -u)
  if ! version_verdicts=$(printf '%s\\n' "$version_objects" | git cat-file --batch 2>/dev/null | "$TAU_GIT_NODE" -e "$version_check" "$versions" "$held_tags"); then
    refuse GIT_PUSH_CHECK_FAILED "${checkFailedSentence}"
    finish
  fi
  if [ -n "$version_verdicts" ]; then
    while IFS= read -r verdict_line; do
      [ -n "$verdict_line" ] || continue
      refuse "\${verdict_line%% *}" "\${verdict_line#* }"
    done <<TAU_VERSION_VERDICTS
$version_verdicts
TAU_VERSION_VERDICTS
    finish
  fi
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
    | awk '{ rest = $0; sub(/^[^ ]+ /, "", rest); printf "Tau:   %s (%s bytes)\\n", rest, $1 }' || true
}

# Admission measures each uncompressed blob, not just the compressed pack.
# Object IDs avoid treating newlines or spaces in filenames as size records.
if [ -n "$arriving" ]; then
  objects=$(git rev-list --objects --no-object-names $arriving --not --all) || {
    refuse GIT_PUSH_CHECK_FAILED "${checkFailedSentence}"
    finish
  }
  if [ -n "$objects" ]; then
    sizes=$(printf '%s\\n' "$objects" | git cat-file --batch-check='%(objecttype) %(objectsize)') || {
      refuse GIT_PUSH_CHECK_FAILED "${checkFailedSentence}"
      finish
    }
    if ! printf '%s\\n' "$sizes" | awk '
      NF != 2 || $2 !~ /^[0-9]+$/ { invalid = 1 }
      $1 == "blob" && $2 > ${projectFileLimitBytes} { oversized = 1 }
      END { exit (invalid || oversized) ? 1 : 0 }
    '; then
      refuse GIT_PUSH_FILE_TOO_LARGE "${terminalRefusalOpening()} — individual project files must be 100 MiB or smaller."
      say "$(arriving_files)"
      finish
    fi
  fi
fi

remaining="\${TAU_GIT_QUOTA_REMAINING_BYTES:-}"
ceiling="\${TAU_GIT_CEILING_REMAINING_BYTES:-}"
quarantine="\${GIT_QUARANTINE_PATH:-}"
if [ -n "$quarantine" ] && [ -d "$quarantine" ]; then
  incoming=$(du -sk "$quarantine" | cut -f1)
  incoming=$((incoming * 1024))
  # D17: the plan's refusal says who can act on it and carries the file list,
  # because a free allowance equals the D20 ceiling and this is tested first
  # (L6-F2) — without the list here, a free owner would never see one.
  if [ -n "$remaining" ] && [ "$incoming" -gt "$remaining" ]; then
    refuse GIT_PUSH_QUOTA "${quotaRefusalMarker} — this push needs $((incoming - remaining)) bytes more than the plan allows."
    if [ -n "\${TAU_GIT_QUOTA_SENTENCE:-}" ]; then
      say "Tau: $TAU_GIT_QUOTA_SENTENCE"
    fi
    say "Tau: the largest files it adds are:"
    say "$(arriving_files)"
    finish
  fi
  # D20: the per-repository ceiling on non-LFS bytes. A hydration guard rather
  # than a billing guard — the plan above binds the bill first — so it is a
  # separate sentence with the file list that makes it actionable.
  if [ -n "$ceiling" ] && [ "$incoming" -gt "$ceiling" ]; then
    refuse GIT_PUSH_CEILING "${ceilingRefusalMarker} — this push needs $((incoming - ceiling)) bytes more than this repository may hold."
    say "Tau: the largest files it adds are:"
    say "$(arriving_files)"
    finish
  fi
elif [ -n "$remaining" ] || [ -n "$ceiling" ]; then
  # Fail closed, like the admission flag above (review F6): a bound that cannot
  # measure what is arriving has not been satisfied. Reached only by a git
  # without object quarantine, which this service does not deploy.
  refuse GIT_PUSH_CHECK_FAILED "${checkFailedSentence}"
  finish
fi
exit 0
`;
