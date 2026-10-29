import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { SigningKey, VerificationKeys } from '#api/git/forwarding/contract/keys.js';
import type { ReplayGuard } from '#api/git/forwarding/contract/replay-guard.js';
import { acceptedVersions, openToken, signToken } from '#api/git/forwarding/contract/signed-token.js';
import type { EnvelopeRejection } from '#api/git/forwarding/contract/signed-token.js';

/**
 * The storage grant: what tau-api tells tau-storage about one forwarded
 * request, signed with a key only tau-api holds (DC1; W9 Finding 2, "Grant
 * and receipt specification"; review FR2).
 *
 * tau-storage holds no database and no Redis (Z1), so every fact it needs to
 * serve the request is here: whose repository, who is asking, what the plan
 * still allows, the sentence a quota refusal speaks, the generation the API
 * last derived (so any RPC can repair a lost receipt, FR5), and the route the
 * API admitted it under. The mode is never carried: it is the forwarded path's.
 */

/** This build's grant contract version. A verifier accepts it and the one before (FR12). */
export const grantContractVersion = 1;

/** The request header the grant travels in, API to storage only. Never logged (FR20). */
export const grantHeader = 'tau-storage-grant';

/** A grant's life: checked at admission only, so a long push is not cut by its own grant. */
export const grantLifetimeSeconds = 60;

/** How far a grant's `iat` may sit from the worker's clock, either way. */
export const maximumGrantClockSkewSeconds = 30;

/**
 * The paths tau-storage serves under `/v1/storage/<project>/`, each one mode.
 * `git-read` is the publication materializer's read-only git (until DC3).
 */
export const storageOperations = [
  'git-upload-pack',
  'git-receive-pack',
  'remove-ref',
  'derive',
  'git-read',
  'tombstone',
  'preview',
] as const;

export type StorageOperation = (typeof storageOperations)[number];

/**
 * The path a request for `operation` on `project` is forwarded to, and the
 * path its grant names: a grant minted for one path verifies on no other.
 *
 * @param project - The project id.
 * @param operation - The storage operation.
 * @returns The request path.
 */
export const storagePath = (project: string, operation: StorageOperation): string =>
  `/v1/storage/${encodeURIComponent(project)}/${operation}`;

/** Where tau-storage answers the dialect of its git (DB1), with no grant. */
export const dialectPath = '/v1/dialect';

/** Where tau-storage lists the deployed members tau-api ranks over (DC2), with no grant: ids are not secrets. */
export const membersPath = '/v1/members';

/** The response header naming the tau-storage Machine that answered (DC2): how tau-api sees a spill or a cold member. */
export const memberHeader = 'tau-storage-member';

/** The Fly Proxy request header that prefers one Machine and falls back to any other when it is unavailable. */
export const preferInstanceHeader = 'fly-prefer-instance-id';

const identifier = z.string().min(1).max(256);
const bytes = z.number().int().nonnegative();

const factsSchema = z.object({
  method: z.literal('POST'),
  path: z.string().min(1).max(512),
  owner: identifier,
  project: identifier,
  /** The project's storage account when it is not Tau's default (D26). */
  account: identifier.optional(),
  /** Who is asking: keys owner fairness on the worker, as it keyed the hydrate budget on the API. */
  callerId: identifier,
  /** The authenticated pusher, from the session and never the body (D28, NI16). */
  committedBy: identifier,
  /** The cloud host the request came through (D21), recorded on the push (EQ11). */
  viaDevice: identifier.optional(),
  /** Bytes the owner's plan still allows (D16); 0 on a read. */
  remainingBytes: bytes,
  storageLimitBytes: bytes,
  /** D17: the sentence a quota refusal speaks to this caller. */
  quotaSentence: z.string().max(1024).optional(),
  /** `project_git.derived_generation` as the API last recorded it (FR5). */
  recordedGeneration: bytes,
  route: z.object({
    store: identifier,
    /** Epoch seconds the route's freeze holds until, when it was frozen at minting. */
    frozenUntil: z.number().nonnegative().optional(),
    /** Whether the API read the route past its cache, as it does for every write (FR13). */
    authoritative: z.boolean(),
  }),
  /** `preview` only: the SHA-256 (hex) of the body, so the grant covers the bytes it carries. */
  bodySha256: z
    .string()
    .regex(/^[\da-f]{64}$/u)
    .optional(),
  /** `preview` only: refuse to replace an existing preview. */
  createOnly: z.boolean().optional(),
  /** `remove-ref` only: the ref to remove and the tip the API saw it at. */
  ref: z.string().min(1).max(1024).optional(),
  tip: z
    .string()
    .regex(/^[\da-f]{40}(?:[\da-f]{24})?$/u)
    .optional(),
});

const grantSchema = factsSchema.extend({
  v: z.number().int().positive(),
  kid: z.string().min(1),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().nonnegative(),
  rid: z.string().regex(/^[\da-f]{32}$/u),
});

/** What the API knows about a request before it is forwarded. */
export type StorageGrantFacts = z.infer<typeof factsSchema>;

/** A minted grant: the facts and its envelope. */
export type StorageGrant = z.infer<typeof grantSchema>;

/**
 * Mints a grant.
 *
 * @param facts - The request's facts.
 * @param options - The signing key, and for tests and rollouts the clock, the version and the lifetime.
 * @returns The header value and the grant it carries.
 */
export const mintGrant = (
  facts: StorageGrantFacts,
  options: {
    readonly key: SigningKey;
    readonly now?: number;
    readonly version?: number;
    readonly lifetimeSeconds?: number;
    readonly rid?: string;
  },
): { readonly token: string; readonly grant: StorageGrant } => {
  const iat = Math.floor((options.now ?? Date.now()) / 1000);
  const grant: StorageGrant = {
    ...facts,
    v: options.version ?? grantContractVersion,
    kid: options.key.kid,
    iat,
    exp: iat + (options.lifetimeSeconds ?? grantLifetimeSeconds),
    rid: options.rid ?? randomBytes(16).toString('hex'),
  };
  return { token: signToken(grant, options.key), grant };
};

/** Why a worker refused a grant: the `reason` label of `tau.git.grants.rejected`. */
export type GrantRejection = EnvelopeRejection | 'iat_skew' | 'expired' | 'method' | 'path' | 'replay';

/**
 * Verifies a grant before a byte of the request body is read: signature under
 * `kid`, `v` in {N, N-1}, `iat` within 30 s of this clock, `exp` not passed,
 * `method` and `path` the request's own, and `rid` unseen on this worker. The
 * request id is claimed only once everything else holds, so a refused grant
 * never burns it.
 *
 * @param token - The header value.
 * @param args - The verifier's keys, the request's method and path, the clock, the replay guard and the version.
 * @returns The grant, or why it was refused.
 */
export const verifyGrant = (
  token: string,
  args: {
    readonly keys: VerificationKeys;
    readonly method: string;
    readonly path: string;
    readonly now?: number;
    readonly replay: ReplayGuard;
    readonly version?: number;
  },
): { readonly ok: true; readonly grant: StorageGrant } | { readonly ok: false; readonly reason: GrantRejection } => {
  const opened = openToken(token, {
    keys: args.keys,
    acceptedVersions: acceptedVersions(args.version ?? grantContractVersion),
  });
  if (!opened.ok) {
    return opened;
  }
  const parsed = grantSchema.safeParse(opened.payload);
  if (!parsed.success) {
    return { ok: false, reason: 'malformed' };
  }
  const grant = parsed.data;
  const nowSeconds = (args.now ?? Date.now()) / 1000;
  if (Math.abs(nowSeconds - grant.iat) > maximumGrantClockSkewSeconds) {
    return { ok: false, reason: 'iat_skew' };
  }
  if (nowSeconds > grant.exp) {
    return { ok: false, reason: 'expired' };
  }
  if (grant.method !== args.method) {
    return { ok: false, reason: 'method' };
  }
  if (grant.path !== args.path) {
    return { ok: false, reason: 'path' };
  }
  if (!args.replay.claim(grant.rid)) {
    return { ok: false, reason: 'replay' };
  }
  return { ok: true, grant };
};

/** Revisions a `git-read` may name: refs, oids and peel suffixes, never an option. */
const revision = /^(?!-)[\w./{}^~@-]{1,1024}$/u;

/**
 * Whether `args` is one of the read-only git commands `git-read` serves: the
 * three the publication materializer runs. Anything else, including any
 * option that writes or executes, is refused on both sides of the hop.
 *
 * @param args - The arguments after `git`.
 * @returns True for `rev-parse <rev>…`, `ls-tree -r -l -z --full-tree <rev>` or `cat-file --batch`.
 */
export const isReadOnlyGitCommand = (args: readonly string[]): boolean => {
  const [command, ...rest] = args;
  switch (command) {
    case 'rev-parse': {
      return rest.length > 0 && rest.length <= 10_000 && rest.every((argument) => revision.test(argument));
    }
    case 'ls-tree': {
      return rest.length === 5 && rest.slice(0, 4).join(' ') === '-r -l -z --full-tree' && revision.test(rest[4] ?? '');
    }
    case 'cat-file': {
      return rest.length === 1 && rest[0] === '--batch';
    }
    default: {
      return false;
    }
  }
};
