import { z } from 'zod';
import type { SigningKey, VerificationKeys } from '#api/git/forwarding/contract/keys.js';
import { acceptedVersions, openToken, signToken } from '#api/git/forwarding/contract/signed-token.js';
import type { EnvelopeRejection } from '#api/git/forwarding/contract/signed-token.js';

/**
 * The storage receipt: what tau-storage tells tau-api after a committed push,
 * a removal, or a repair, signed with a key only tau-storage holds (DC1; W9
 * Finding 2, "Receipt"; review FR2).
 *
 * The API applies a receipt only after it re-reads `manifest.json` with its own
 * read credential and finds the digest and generation the receipt names, so a
 * compromised worker can delay derived state but cannot write a generation, a
 * publication row or an LFS mark the committed manifest does not justify.
 */

/** This build's receipt contract version. The API accepts it and the one before (FR12). */
export const receiptContractVersion = 1;

/** Ahead of the API's clock by more than this, a receipt is refused. */
export const maximumReceiptClockSkewSeconds = 30;

/**
 * Older than this, a receipt is refused. A receipt is posted before the push
 * it follows answers, so ten minutes is the RPC timeout, and anything older is
 * stale work the next grant's `recordedGeneration` repairs anyway.
 */
export const maximumReceiptAgeSeconds = 600;

/**
 * The longest receipt the API's receipt route reads, and so the longest one
 * tau-storage posts. A posted receipt is a `retained` one, which carries no oid
 * list, or a deferred compaction's `commit`, which carries the push's whole LFS
 * walk: 1 MiB holds about eleven thousand LFS oids once signed. tau-storage
 * drops a longer one, and the next grant's recorded generation repairs what it
 * would have said.
 */
export const maximumPostedReceiptLength = 1024 * 1024;

/**
 * What the receipt is for: a committed push, removal or deferred compaction
 * (`commit`; a compaction's names the push's moved refs and LFS walk), derived
 * state a worker found the API behind on (`repair`), or the retired bytes a
 * compacting commit's sweep kept (`retained`, D18), which is known only after
 * the reply.
 */
export const receiptKinds = ['commit', 'repair', 'retained'] as const;

const objectName = z.string().regex(/^[\da-f]{40}(?:[\da-f]{24})?$/u);

const factsSchema = z.object({
  /** The grant's request id; with `kind`, what makes the receipt route idempotent. */
  rid: z.string().regex(/^[\da-f]{32}$/u),
  kind: z.enum(receiptKinds),
  owner: z.string().min(1).max(256),
  project: z.string().min(1).max(256),
  account: z.string().min(1).max(256).optional(),
  generation: z.number().int().positive(),
  incarnation: z.string().regex(/^[\da-f]{32}$/u),
  /** SHA-256 of the manifest bytes the compare-and-swap wrote (or the repair read). */
  manifestSha256: z.string().regex(/^[\da-f]{64}$/u),
  movedRefs: z
    .array(z.object({ ref: z.string().min(1).max(1024), before: objectName.optional(), after: objectName.optional() }))
    .max(100_000),
  /**
   * Publication manifests a worker already wrote. Empty in DC1: the API still
   * materializes (DC3 moves it to workers and fills this).
   */
  materializedTags: z.array(z.object({ ref: z.string().min(1).max(1024), manifestKey: z.string().min(1) })).max(10_000),
  /** Every LFS object id the committed refs reach: a whole walk, never a difference. */
  reachableLfsOids: z.array(z.string().regex(/^[\da-f]{64}$/u)).max(1_000_000),
  /** `retained` only: the retired bytes the store still keeps (D18). */
  retainedBytes: z.number().int().nonnegative().optional(),
});

const receiptSchema = factsSchema.extend({
  v: z.number().int().positive(),
  kid: z.string().min(1),
  iat: z.number().int().nonnegative(),
});

export type StorageReceiptFacts = z.infer<typeof factsSchema>;

export type StorageReceipt = z.infer<typeof receiptSchema>;

/** Why the API refused a receipt's envelope. */
export type ReceiptRejection = EnvelopeRejection | 'iat_skew' | 'expired';

/**
 * Signs a receipt.
 *
 * @param facts - What the worker reports.
 * @param options - The receipt signing key, and for tests and rollouts the clock and the version.
 * @returns The token.
 */
export const signReceipt = (
  facts: StorageReceiptFacts,
  options: { readonly key: SigningKey; readonly now?: number; readonly version?: number },
): string =>
  signToken(
    {
      ...facts,
      v: options.version ?? receiptContractVersion,
      kid: options.key.kid,
      iat: Math.floor((options.now ?? Date.now()) / 1000),
    },
    options.key,
  );

/**
 * Verifies a receipt's signature, version, shape and age. Replay and the
 * manifest check are the receipt route's, which holds the state for both.
 *
 * @param token - The receipt as posted.
 * @param args - The API's receipt keys, the clock and the version.
 * @returns The receipt, or why it was refused.
 */
export const verifyReceipt = (
  token: string,
  args: { readonly keys: VerificationKeys; readonly now?: number; readonly version?: number },
):
  | { readonly ok: true; readonly receipt: StorageReceipt }
  | { readonly ok: false; readonly reason: ReceiptRejection } => {
  const opened = openToken(token, {
    keys: args.keys,
    acceptedVersions: acceptedVersions(args.version ?? receiptContractVersion),
  });
  if (!opened.ok) {
    return opened;
  }
  const parsed = receiptSchema.safeParse(opened.payload);
  if (!parsed.success) {
    return { ok: false, reason: 'malformed' };
  }
  const nowSeconds = (args.now ?? Date.now()) / 1000;
  if (parsed.data.iat - nowSeconds > maximumReceiptClockSkewSeconds) {
    return { ok: false, reason: 'iat_skew' };
  }
  if (nowSeconds - parsed.data.iat > maximumReceiptAgeSeconds) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true, receipt: parsed.data };
};
