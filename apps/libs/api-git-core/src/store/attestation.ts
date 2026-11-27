import { createHash } from 'node:crypto';
import { buffer } from 'node:stream/consumers';
import { z } from 'zod';
import type { SigningKey, VerificationKeys } from '#forwarding/contract/keys.js';
import { openToken, signToken } from '#forwarding/contract/signed-token.js';
import type { EnvelopeRejection } from '#forwarding/contract/signed-token.js';
import type { AttestationKeys } from '#store/attestation-keys.js';
import type { PushRecord } from '#store/manifest.js';
import type { RepositoryLocator, RepositoryStore } from '#store/port.js';

/**
 * The push attestation (cloud backup admission blueprint D3, I4, I5; contracts § 2): the storage worker's signed,
 * write-once statement of what one push first brought and which server bits each of those commits carries. It is
 * written beside the manifest, never inside it, under a key every reader can recompute from a decoded push record,
 * so the manifest's shape stays closed and nothing in it is rewritten.
 *
 * Every object here is a signed token in the storage contract's envelope (`v.kid.payload.signature`, Ed25519 over
 * canonical JSON, `signed-token.ts`) under a key pair of its own (`TAU_STORAGE_ATTESTATION_SIGNING_KEY`). No object
 * holds an address: per commit only bits and the `claimable` handle, which never leaves the server.
 */

/** This build's attestation and chunk format. */
export const attestationVersion = 1;

/** Who wrote an attestation: the commit itself, the repair run for a degraded one, or the one-time backfill. */
export const attestationOrigins = ['admission', 'repair', 'backfill'] as const;

export type AttestationOrigin = (typeof attestationOrigins)[number];

/** A push lists at most this many commits inline; more go into signed chunks. */
export const inlineCommitLimit = 500;

/** Commits per chunk object. */
export const chunkCommitLimit = 2000;

/**
 * The per-commit bits (contracts § 2). `foreignAddress` is any author, committer or trailer address of the foreign
 * class; `tauWrittenAddress` is a Tau-written commit whose author address is foreign (`address_class` label
 * `tau_written_foreign`).
 */
export const commitBits = {
  claim: 1,
  address: 2,
  forge: 4,
  committerAddress: 8,
  committerForge: 16,
  pseudonymous: 32,
  namesAccount: 64,
  tauOther: 128,
  foreignAddress: 256,
  tauWrittenAddress: 512,
} as const;

/* Distinct powers of two, so their sum is every bit set. */
const allBits = Object.values(commitBits).reduce((total, bit) => total + bit, 0);

/** One first-brought commit: its id, its bits, and its `claimable` handle when it has one. */
export type CommitEntry = readonly [oid: string, bits: number, claimable?: string];

/**
 * Whether an entry carries a bit. Bits are distinct powers of two, so this is a digit test, not a mask.
 *
 * @param entry - A commit entry.
 * @param bit - One of {@link commitBits}.
 * @returns True when set.
 */
export const hasBit = (entry: CommitEntry, bit: number): boolean => Math.floor(entry[1] / bit) % 2 === 1;

/** The attestation's payload (contracts § 2), without the envelope's kid. */
export type PushAttestation = Readonly<{
  v: typeof attestationVersion;
  record: string;
  kind: 'push' | 'removal';
  origin: AttestationOrigin;
  coverage: 'complete' | 'failed';
  sessionId?: string;
  client?: Readonly<{
    leg: 'native' | 'isomorphic' | 'cli' | 'git';
    build: string;
    rules: number;
  }>;
  claim?: Readonly<{ identities: readonly string[] }>;
  basisInputs: Readonly<{
    email: 'admission' | 'current' | 'none';
    forge: 'admission' | 'current' | 'none';
  }>;
  refs: ReadonlyArray<Readonly<{ ref: string; tip?: string }>>;
  commits: Readonly<{
    count: number;
    inline?: readonly CommitEntry[];
    chunks?: ReadonlyArray<Readonly<{ n: number; sha256: string }>>;
  }>;
  inferred?: true;
  reattestedFrom?: Readonly<{ kid: string; b2UploadedAt: string }>;
}>;

/** One chunk of a push that first brought more than {@link inlineCommitLimit} commits. */
export type AttestationChunk = Readonly<{
  v: typeof attestationVersion;
  record: string;
  n: number;
  commits: readonly CommitEntry[];
}>;

const objectId = z.string().regex(/^[\da-f]{40}(?:[\da-f]{24})?$/u);
const digest = z.string().regex(/^[\da-f]{64}$/u);
const identity = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[^<>\n\0]+$/u);
const commitEntry = z.union([
  z.tuple([objectId, z.number().int().min(0).max(allBits)]),
  z.tuple([objectId, z.number().int().min(0).max(allBits), identity]),
]);

const attestationSchema = z.object({
  v: z.literal(attestationVersion),
  kid: z.string().min(1),
  record: digest,
  kind: z.enum(['push', 'removal']),
  origin: z.enum(attestationOrigins),
  coverage: z.enum(['complete', 'failed']),
  sessionId: z.string().min(1).max(256).optional(),
  client: z
    .object({
      leg: z.enum(['native', 'isomorphic', 'cli', 'git']),
      build: z.string().min(1).max(128),
      rules: z.number().int().nonnegative(),
    })
    .optional(),
  claim: z.object({ identities: z.array(identity).min(1).max(8) }).optional(),
  basisInputs: z.object({
    email: z.enum(['admission', 'current', 'none']),
    forge: z.enum(['admission', 'current', 'none']),
  }),
  refs: z.array(z.object({ ref: z.string().min(1).max(1024), tip: objectId.optional() })).max(1_000_000),
  commits: z.object({
    count: z.number().int().nonnegative(),
    inline: z.array(commitEntry).max(inlineCommitLimit).optional(),
    chunks: z
      .array(z.object({ n: z.number().int().nonnegative(), sha256: digest }))
      .max(10_000)
      .optional(),
  }),
  inferred: z.literal(true).optional(),
  reattestedFrom: z.object({ kid: z.string().min(1), b2UploadedAt: z.string().min(1) }).optional(),
});

const chunkSchema = z.object({
  v: z.literal(attestationVersion),
  kid: z.string().min(1),
  record: digest,
  n: z.number().int().nonnegative(),
  commits: z.array(commitEntry).max(chunkCommitLimit),
});

const sha256Hex = (bytes: string): string => createHash('sha256').update(bytes).digest('hex');

/**
 * The attestation key of a push record: the SHA-256 (hex) of the record **without its generation**, in the
 * decoder's field order with absent optional fields omitted (contracts § 2). A rebase over a deferred compaction
 * reuses `committedAt` and the moved set, so every successor one commit attempts has the same key; a reader
 * recomputes it from any decoded record (I5).
 *
 * @param record - A push record, as decoded or as `succeedManifest` built it.
 * @returns The 64-hex key.
 */
export const recordKey = (record: PushRecord): string =>
  sha256Hex(
    JSON.stringify({
      committedAt: record.committedAt,
      committedBy: record.committedBy,
      ...(record.viaDevice === undefined ? {} : { viaDevice: record.viaDevice }),
      refs: record.refs.map((move) => (move.tip === undefined ? { ref: move.ref } : { ref: move.ref, tip: move.tip })),
      ...(record.omitted === undefined ? {} : { omitted: record.omitted }),
      ...(record.anonymous === true ? { anonymous: true } : {}),
    }),
  );

/** `attestations/<k>/`: everything written for one record. */
export const attestationPrefix = (record: string): string => `attestations/${record}/`;

/** `attestations/<k>/<kid>.<origin>.json`. */
export const attestationKey = (record: string, kid: string, origin: AttestationOrigin): string =>
  `${attestationPrefix(record)}${kid}.${origin}.json`;

/** `attestations/<k>/<kid>.<origin>/<n>.json`: chunk `n` of the attestation stored at `attestation`. */
export const chunkKey = (attestation: string, n: number): string =>
  `${attestation.slice(0, -'.json'.length)}/${String(n)}.json`;

/** One object to store, in the order it must be written. */
export type AttestationObject = Readonly<{ key: string; body: string }>;

/** What a writer decides; the commit list is split into inline entries or chunks here. */
export type AttestationDraft = Omit<PushAttestation, 'v' | 'commits'> & Readonly<{ commits: readonly CommitEntry[] }>;

/**
 * Signs an attestation and, when the push first brought more than {@link inlineCommitLimit} commits, its chunks.
 *
 * @param draft - The attestation with its full commit list.
 * @param key - The attestation signing key.
 * @returns The objects, chunks first and the attestation last: the write order (contracts § 2).
 */
export const signAttestation = (draft: AttestationDraft, key: SigningKey): readonly AttestationObject[] => {
  const { commits, ...rest } = draft;
  const chunks: AttestationObject[] = [];
  const digests: Array<{ n: number; sha256: string }> = [];
  if (commits.length > inlineCommitLimit) {
    for (let n = 0; n * chunkCommitLimit < commits.length; n += 1) {
      const body = signToken(
        {
          v: attestationVersion,
          kid: key.kid,
          record: draft.record,
          n,
          commits: commits.slice(n * chunkCommitLimit, (n + 1) * chunkCommitLimit),
        },
        key,
      );
      chunks.push({
        key: chunkKey(attestationKey(draft.record, key.kid, draft.origin), n),
        body,
      });
      digests.push({ n, sha256: sha256Hex(body) });
    }
  }
  const attestation: PushAttestation = {
    ...rest,
    v: attestationVersion,
    commits:
      commits.length > inlineCommitLimit
        ? { count: commits.length, chunks: digests }
        : { count: commits.length, inline: commits },
  };
  return [
    ...chunks,
    {
      key: attestationKey(draft.record, key.kid, draft.origin),
      body: signToken({ ...attestation, kid: key.kid }, key),
    },
  ];
};

/** Why a stored attestation or chunk was not accepted (`cause` of `tau_sync_attestation_invalid_total`). */
export type AttestationRejection = EnvelopeRejection | 'revoked_kid' | 'key_mismatch';

/** The `cause` label a rejection counts under. */
export const invalidCause = (
  reason: AttestationRejection,
): 'signature' | 'unknown_kid' | 'revoked_kid' | 'key_mismatch' =>
  reason === 'unknown_kid' || reason === 'revoked_kid' || reason === 'key_mismatch' ? reason : 'signature';

const verificationKeys = (keys: AttestationKeys, includeRevoked: boolean): VerificationKeys =>
  new Map(
    [...keys]
      .filter(([, entry]) => includeRevoked || entry.revokedAt === undefined)
      .map(([kid, entry]) => [kid, entry.key]),
  );

/**
 * Opens a stored attestation: signature under an unrevoked kid (or any kid when `includeRevoked`, for `reattest`),
 * a payload of this format, and a key whose record, kid and origin are the payload's.
 *
 * @param body - The object's text.
 * @param args - The verifier's keys, the object key it was read from, and whether a revoked kid counts.
 * @returns The attestation and its kid, or why it was refused.
 */
export const openAttestation = (
  body: string,
  args: {
    readonly keys: AttestationKeys;
    readonly key: string;
    readonly includeRevoked?: boolean;
  },
):
  | {
      readonly ok: true;
      readonly attestation: PushAttestation;
      readonly kid: string;
    }
  | { readonly ok: false; readonly reason: AttestationRejection } => {
  const opened = openToken(body, {
    keys: verificationKeys(args.keys, args.includeRevoked === true),
    acceptedVersions: new Set([attestationVersion]),
  });
  if (!opened.ok) {
    const kid = body.split('.', 2)[1] ?? '';
    return {
      ok: false,
      reason: opened.reason === 'unknown_kid' && args.keys.has(kid) ? 'revoked_kid' : opened.reason,
    };
  }
  const parsed = attestationSchema.safeParse(opened.payload);
  if (!parsed.success) {
    return { ok: false, reason: 'malformed' };
  }
  const { kid, ...attestation } = parsed.data;
  if (args.key !== attestationKey(attestation.record, kid, attestation.origin)) {
    return { ok: false, reason: 'key_mismatch' };
  }
  return { ok: true, attestation: attestation as PushAttestation, kid };
};

const openChunk = (
  body: string,
  args: {
    readonly keys: AttestationKeys;
    readonly record: string;
    readonly n: number;
    readonly includeRevoked?: boolean;
  },
): readonly CommitEntry[] | undefined => {
  const opened = openToken(body, {
    keys: verificationKeys(args.keys, args.includeRevoked === true),
    acceptedVersions: new Set([attestationVersion]),
  });
  if (!opened.ok) {
    return undefined;
  }
  const parsed = chunkSchema.safeParse(opened.payload);
  if (!parsed.success || parsed.data.record !== args.record || parsed.data.n !== args.n) {
    return undefined;
  }
  return parsed.data.commits as readonly CommitEntry[];
};

/**
 * The preference among verifying attestations of one record (contracts § 2): a complete admission, then repair,
 * then backfill, then anything whose coverage failed in the same origin order. Lower is better.
 *
 * @param attestation - A verified attestation.
 * @returns Its rank.
 */
export const attestationRank = (attestation: Pick<PushAttestation, 'origin' | 'coverage'>): number =>
  attestationOrigins.indexOf(attestation.origin) +
  (attestation.coverage === 'complete' ? 0 : attestationOrigins.length);

const readText = async (store: RepositoryStore, locator: RepositoryLocator, key: string): Promise<string> => {
  const bytes = await buffer(await store.getObject(locator, key));
  return bytes.toString('utf8');
};

/** Matches `<kid>.<origin>.json` directly under a record's prefix; chunks sit one level deeper. */
const attestationFile = /^[\w-]{1,64}\.(?:admission|repair|backfill)\.json$/u;

/** One verified attestation with every commit it lists. */
export type ReadAttestation = Readonly<{
  attestation: PushAttestation;
  kid: string;
  key: string;
  commits: readonly CommitEntry[];
}>;

/**
 * The best verifying attestation of one record, with its commits (chunks verified against the digests the
 * attestation signed). An object that fails verification is reported through `onInvalid` and skipped, never
 * trusted; a missing or unreadable chunk disqualifies its attestation.
 *
 * @param args - The store, the repository, the record key, the verifier's keys and an invalid-object observer.
 * @returns The attestation, or `undefined` when none verifies.
 */
export const readAttestation = async (args: {
  readonly store: RepositoryStore;
  readonly locator: RepositoryLocator;
  readonly record: string;
  readonly keys: AttestationKeys;
  readonly includeRevoked?: boolean;
  readonly onInvalid?: (reason: AttestationRejection, key: string) => void;
}): Promise<ReadAttestation | undefined> => {
  const prefix = attestationPrefix(args.record);
  const candidates: Array<{
    key: string;
    attestation: PushAttestation;
    kid: string;
  }> = [];
  for await (const object of args.store.listObjects(args.locator, prefix)) {
    if (!attestationFile.test(object.key.slice(prefix.length))) {
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- a record holds one object per kid and origin, rarely two
    const opened = openAttestation(await readText(args.store, args.locator, object.key), {
      keys: args.keys,
      key: object.key,
      ...(args.includeRevoked === undefined ? {} : { includeRevoked: args.includeRevoked }),
    });
    if (!opened.ok || opened.attestation.record !== args.record) {
      args.onInvalid?.(opened.ok ? 'key_mismatch' : opened.reason, object.key);
      continue;
    }
    candidates.push({
      key: object.key,
      attestation: opened.attestation,
      kid: opened.kid,
    });
  }
  candidates.sort((left, right) => attestationRank(left.attestation) - attestationRank(right.attestation));
  for (const candidate of candidates) {
    // oxlint-disable-next-line no-await-in-loop -- the first candidate whose chunks verify wins
    const commits = await commitsOf(args, candidate);
    if (commits !== undefined) {
      return { ...candidate, commits };
    }
  }
  return undefined;
};

const commitsOf = async (
  args: {
    readonly store: RepositoryStore;
    readonly locator: RepositoryLocator;
    readonly keys: AttestationKeys;
    readonly includeRevoked?: boolean;
    readonly onInvalid?: (reason: AttestationRejection, key: string) => void;
  },
  candidate: { key: string; attestation: PushAttestation; kid: string },
): Promise<readonly CommitEntry[] | undefined> => {
  const { attestation } = candidate;
  if (attestation.commits.chunks === undefined) {
    return attestation.commits.inline ?? [];
  }
  const commits: CommitEntry[] = [];
  for (const chunk of attestation.commits.chunks) {
    const key = chunkKey(candidate.key, chunk.n);
    let body: string;
    try {
      // oxlint-disable-next-line no-await-in-loop -- chunks are read in order; a large import has a few dozen
      body = await readText(args.store, args.locator, key);
    } catch {
      args.onInvalid?.('malformed', key);
      return undefined;
    }
    const entries =
      sha256Hex(body) === chunk.sha256
        ? openChunk(body, {
            keys: args.keys,
            record: attestation.record,
            n: chunk.n,
            ...(args.includeRevoked === undefined ? {} : { includeRevoked: args.includeRevoked }),
          })
        : undefined;
    if (entries === undefined) {
      args.onInvalid?.('signature', key);
      return undefined;
    }
    commits.push(...entries);
  }
  return commits.length === attestation.commits.count ? commits : undefined;
};

/**
 * Writes signed attestation objects once each (`createOnly`; an object already there is success and is left as it
 * is), chunks before the attestation, then reads the attestation back. A stored attestation whose bytes differ from
 * these is a **collision**: another push with the same account, millisecond and moved tips wrote first, and the
 * caller moves its `at` by 1 ms and writes again before any manifest write (contracts § 2, E10).
 *
 * @param args - The store, the repository, the objects in write order and the abort signal.
 * @returns `written`, or `collision` when the stored attestation is not these bytes.
 */
export const writeAttestation = async (args: {
  readonly store: RepositoryStore;
  readonly locator: RepositoryLocator;
  readonly objects: readonly AttestationObject[];
  readonly signal?: AbortSignal;
}): Promise<'written' | 'collision'> => {
  const last = args.objects.at(-1);
  if (last === undefined) {
    return 'written';
  }
  const put = async (object: AttestationObject): Promise<void> => {
    const bytes = new TextEncoder().encode(object.body);
    await args.store.putObject(
      args.locator,
      object.key,
      bytes,
      {
        contentLength: bytes.byteLength,
        sha256: createHash('sha256').update(bytes).digest('base64'),
        createOnly: true,
      },
      args.signal,
    );
  };
  await Promise.all(args.objects.slice(0, -1).map(async (object) => put(object)));
  await put(last);
  const stored = await readText(args.store, args.locator, last.key);
  return sha256Hex(stored) === sha256Hex(last.body) ? 'written' : 'collision';
};
