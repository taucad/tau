/**
 * One reader's step and loop over a chat's durable rows (SC-R14): one outstanding long-poll read from the ledger's own
 * position, folded through {@link foldReadAnswer}. Every in-process and remote follower shares it, so a reset refolds
 * from row 0 (SC-R12) and a stale batch is read again in exactly one place.
 */

import { emptyChatLedger, foldReadAnswer } from '#log/chat-ledger.js';
import type { ChatLedger } from '#log/chat-ledger.js';
import { sameSourceHealth } from '#log/projection-facts.js';
import type { ProjectionSourceHealth } from '#log/projection-facts.js';
import { agentWireLimits } from '#wire/limits.js';
import type { ReadAnswer, ReadInput } from '#wire/frames.schema.js';

/** A long-poll read of one chat: a launcher's, a host's or a channel client's. @public */
export type ChatRead = (input: ReadInput) => Promise<ReadAnswer>;

/** One folded read. `reset` and `stale` carry no rows; `refused` names why the owner would not read. @public */
export type FoldedRead =
  | Readonly<{
      kind: 'folded';
      ledger: ChatLedger;
      events: readonly unknown[];
      endCursor: number;
      sourceHealth: ProjectionSourceHealth;
    }>
  | Readonly<{ kind: 'reset'; ledger: ChatLedger; endCursor: number }>
  | Readonly<{ kind: 'stale'; ledger: ChatLedger; endCursor: number }>
  | Readonly<{ kind: 'refused'; ledger: ChatLedger; reason: 'owner-fenced' | 'unreadable' }>;

/**
 * Read once from the ledger's position and fold the answer. A reset returns the empty ledger, so the next read
 * refolds from row 0.
 *
 * @param input - The long-poll read, chat, ledger, last authoritative health observation, and cancellation signal.
 * @returns The folded read.
 * @public
 *
 * @example <caption>One step</caption>
 * ```typescript
 * import { emptyChatLedger, readFolded } from '@taucad/agent-host';
 * import type { ChatRead } from '@taucad/agent-host';
 *
 * declare const read: ChatRead;
 * const step = await readFolded({ read, chatId: 'chat-1', ledger: emptyChatLedger });
 * ```
 */
export const readFolded = async ({
  read,
  chatId,
  ledger,
  sourceHealth,
  signal,
}: Readonly<{
  read: ChatRead;
  chatId: string;
  ledger: ChatLedger;
  sourceHealth?: ProjectionSourceHealth | undefined;
  signal?: AbortSignal | undefined;
}>): Promise<FoldedRead> => {
  const answer = await read({
    chatId,
    ...ledger.position,
    ...(sourceHealth === undefined ? {} : { sourceHealth }),
    limit: agentWireLimits.batchRows,
    maxBytes: agentWireLimits.batchBytes,
    ...(signal === undefined ? {} : { signal }),
  });
  const fold = foldReadAnswer(ledger, answer);
  const endCursor = answer.status === 'batch' ? answer.endCursor : ledger.position.cursor;
  switch (fold.kind) {
    case 'folded': {
      if (answer.status !== 'batch') {
        return { kind: 'stale', ledger, endCursor };
      }
      return {
        kind: 'folded',
        ledger: fold.ledger,
        events: answer.events,
        endCursor,
        sourceHealth: answer.sourceHealth,
      };
    }
    case 'reset': {
      return { kind: 'reset', ledger: emptyChatLedger, endCursor };
    }
    case 'stale': {
      return { kind: 'stale', ledger, endCursor };
    }
    case 'refused': {
      return { kind: 'refused', ledger, reason: fold.reason };
    }
  }
};

/**
 * Follow one chat from row 0, yielding the ledger after each batch that held rows or changed source health. The follow ends when `until` holds
 * for the ledger once it has caught up with the log's end, when cancellation ends the wait, when the owner
 * closed between reads (`HOST_CLOSED`), or on a refusal, which it returns rather than throws.
 *
 * @param read - The long-poll read.
 * @param chatId - The chat.
 * @param options - The signal that ends the follow, and the ledger condition that completes it.
 * @returns The refusal that ended the follow, if one did.
 * @public
 *
 * @example <caption>Follow until the current run ends</caption>
 * ```typescript
 * import { followChat } from '@taucad/agent-host';
 * import type { ChatRead } from '@taucad/agent-host';
 *
 * declare const read: ChatRead;
 * for await (const { ledger } of followChat(read, 'chat-1', { signal: AbortSignal.timeout(1000) })) {
 *   console.log(ledger.position.cursor);
 * }
 * ```
 */
export const followChat = async function* (
  read: ChatRead,
  chatId: string,
  options: Readonly<{ signal: AbortSignal; until?: (ledger: ChatLedger) => boolean }>,
): AsyncGenerator<
  Readonly<{ ledger: ChatLedger; events: readonly unknown[] }>,
  'owner-fenced' | 'unreadable' | undefined
> {
  let ledger = emptyChatLedger;
  let sourceHealth: ProjectionSourceHealth | undefined;
  for (;;) {
    if (options.signal.aborted) {
      return undefined;
    }
    let step: FoldedRead;
    try {
      // oxlint-disable-next-line no-await-in-loop -- a long poll reads after each batch.
      step = await readFolded({ read, chatId, ledger, sourceHealth, signal: options.signal });
    } catch (error) {
      // An owner that closed between two reads ends the follow, as one closing during a read does.
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- The awaited read can reject after an external abort changes this signal.
      if (options.signal.aborted || (error instanceof Error && 'code' in error && error.code === 'HOST_CLOSED')) {
        return undefined;
      }
      throw error;
    }
    if (step.kind === 'refused') {
      return step.reason;
    }
    ledger = step.ledger;
    if (step.kind !== 'folded') {
      if (step.kind === 'reset') {
        sourceHealth = undefined;
      }
      continue;
    }
    const healthChanged = !sameSourceHealth(sourceHealth, step.sourceHealth);
    sourceHealth = step.sourceHealth;
    if (step.events.length === 0 && !healthChanged) {
      // A source wake may overtake an acquired empty snapshot; the next read observes that wake's bytes.
      continue;
    }
    yield { ledger, events: step.events };
    // Checked only once caught up: an early batch of an older run must not end a follow its newer run needs.
    if (ledger.position.cursor >= step.endCursor && options.until?.(ledger) === true) {
      return undefined;
    }
  }
};
