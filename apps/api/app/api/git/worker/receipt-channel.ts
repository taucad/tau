import { setTimeout as delay } from 'node:timers/promises';
import type { SigningKey } from '#api/git/forwarding/contract/keys.js';
import { maximumPostedReceiptLength, signReceipt } from '#api/git/forwarding/contract/receipt.js';
import type { StorageReceiptFacts } from '#api/git/forwarding/contract/receipt.js';
import type { ReceiptChannel } from '#api/git/worker/storage-git.service.js';

/** The API's receipt route, relative to its base URL. */
export const receiptRoutePath = '/v1/internal/storage/receipts';

/** Attempts per posted receipt; a lost one is repaired by the next grant's `recordedGeneration`. */
const postAttempts = 3;

/** One attempt's bound. */
const postTimeoutMilliseconds = 10_000;

/** The longest `Retry-After` a rate-limited post waits; the receipt stays acceptable for 600 s. */
const maximumRetryAfterMilliseconds = 60_000;

/** A `429`'s `Retry-After` in milliseconds, capped; one second when absent or unreadable. */
const retryAfterMilliseconds = (response: Response): number => {
  const seconds = Number(response.headers.get('retry-after'));
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, maximumRetryAfterMilliseconds) : 1000;
};

/**
 * How tau-storage's receipts leave it (DC1).
 *
 * Most receipts ride back on the response the API is waiting for, so only a
 * receipt known after the reply — a deferred compaction's `commit`, and the
 * `retained` bytes a compacting commit's sweep kept (D18) — is posted. The post goes to the API's own URL and is
 * accepted on the signature alone, so it needs no other credential.
 *
 * @param args - The receipt signing key, the API's receipt URL (unset: posts are dropped and logged), the logger and, for tests, `fetch`.
 * @returns The channel.
 */
export const createReceiptChannel = (args: {
  readonly key: SigningKey;
  readonly receiptUrl: string | undefined;
  readonly logger: { warn(fields: Record<string, unknown>, message: string): void };
  readonly fetch?: typeof fetch;
}): ReceiptChannel => {
  const send = args.fetch ?? fetch;
  return {
    sign: (facts: StorageReceiptFacts): string => signReceipt(facts, { key: args.key }),
    async post(facts: StorageReceiptFacts): Promise<void> {
      if (args.receiptUrl === undefined) {
        args.logger.warn(
          { kind: facts.kind, projectId: facts.project },
          'No receipt URL is configured; a posted receipt was dropped',
        );
        return;
      }
      let receipt: string;
      try {
        receipt = signReceipt(facts, { key: args.key });
      } catch (error) {
        /* Never rejects: a caller posts after a durable commit, with its sweep still to run. */
        args.logger.warn(
          { kind: facts.kind, projectId: facts.project, err: error },
          'A receipt could not be signed for posting; it was dropped',
        );
        return;
      }
      if (receipt.length > maximumPostedReceiptLength) {
        /* The route would refuse it; the next grant's recorded generation repairs what it says. */
        args.logger.warn(
          { kind: facts.kind, projectId: facts.project, length: receipt.length },
          'A posted receipt is longer than the receipt route reads; it was dropped',
        );
        return;
      }
      for (let attempt = 1; attempt <= postAttempts; attempt += 1) {
        let wait = attempt * 500;
        try {
          // oxlint-disable-next-line no-await-in-loop -- retries are sequential by design
          const response = await send(args.receiptUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ receipt }),
            signal: AbortSignal.timeout(postTimeoutMilliseconds),
          });
          if (response.ok) {
            return;
          }
          if (response.status === 429) {
            /* The route's per-address budget: wait as told, then try again. */
            wait = retryAfterMilliseconds(response);
          } else if (response.status < 500) {
            args.logger.warn(
              { kind: facts.kind, projectId: facts.project, status: response.status },
              'The API refused a posted receipt',
            );
            return;
          }
        } catch {
          /* Retried below. */
        }
        if (attempt < postAttempts) {
          // oxlint-disable-next-line no-await-in-loop -- as above
          await delay(wait);
        }
      }
      args.logger.warn({ kind: facts.kind, projectId: facts.project }, 'A posted receipt could not be delivered');
    },
  };
};
