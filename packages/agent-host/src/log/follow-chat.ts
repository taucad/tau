/**
 * One reader's step and loop over a chat's durable rows (SC-R14): one outstanding long-poll read from the ledger's own
 * position, folded through {@link foldReadAnswer}. Every in-process and remote follower shares it, so a reset refolds
 * from row 0 (SC-R12) and a stale batch is read again in exactly one place.
 */

import { emptyChatLedger, foldReadAnswer } from '#log/chat-ledger.js';
import type { ChatLedger } from '#log/chat-ledger.js';
import { agentWireLimits } from '#wire/frames.schema.js';
import type { ReadAnswer, ReadInput } from '#wire/frames.schema.js';

/** A long-poll read of one chat: a launcher's, a host's or a channel client's. @public */
export type ChatRead = (input: ReadInput) => Promise<ReadAnswer>;

/** One folded read. `reset` and `stale` carry no rows; `refused` names why the owner would not read. @public */
export type FoldedRead =
  | Readonly<{ kind: 'folded'; ledger: ChatLedger; events: readonly unknown[]; endCursor: number }>
  | Readonly<{ kind: 'reset'; ledger: ChatLedger; endCursor: number }>
  | Readonly<{ kind: 'stale'; ledger: ChatLedger; endCursor: number }>
  | Readonly<{ kind: 'refused'; ledger: ChatLedger; reason: 'owner-fenced' | 'unreadable' }>;

/**
 * Read once from the ledger's position and fold the answer. A reset returns the empty ledger, so the next read
 * refolds from row 0.
 *
 * @param input - The long-poll read, the chat, the reader's ledger, and the signal that ends the wait (the read then
 * answers an empty batch).
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
  signal,
}: Readonly<{
  read: ChatRead;
  chatId: string;
  ledger: ChatLedger;
  signal?: AbortSignal | undefined;
}>): Promise<FoldedRead> => {
  const answer = await read({
    chatId,
    ...ledger.position,
    limit: agentWireLimits.batchRows,
    maxBytes: agentWireLimits.batchBytes,
    ...(signal === undefined ? {} : { signal }),
  });
  const fold = foldReadAnswer(ledger, answer);
  const endCursor = answer.status === 'batch' ? answer.endCursor : ledger.position.cursor;
  switch (fold.kind) {
    case 'folded': {
      return { kind: 'folded', ledger: fold.ledger, events: answer.status === 'batch' ? answer.events : [], endCursor };
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
 * Follow one chat from row 0, yielding the ledger after each batch that held rows. The follow ends when `until` holds
 * for the ledger once it has caught up with the log's end, when a read answers an empty batch (its signal ended the wait, or its owner closed), when the owner
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
  for (;;) {
    let step: FoldedRead;
    try {
      // oxlint-disable-next-line no-await-in-loop -- a long poll reads after each batch.
      step = await readFolded({ read, chatId, ledger, signal: options.signal });
    } catch (error) {
      // An owner that closed between two reads ends the follow, as one closing during a read does.
      if (error instanceof Error && 'code' in error && error.code === 'HOST_CLOSED') {
        return undefined;
      }
      throw error;
    }
    if (step.kind === 'refused') {
      return step.reason;
    }
    ledger = step.ledger;
    if (step.kind !== 'folded') {
      continue;
    }
    if (step.events.length === 0) {
      return undefined;
    }
    yield { ledger, events: step.events };
    // Checked only once caught up: an early batch of an older run must not end a follow its newer run needs.
    if (ledger.position.cursor >= step.endCursor && options.until?.(ledger) === true) {
      return undefined;
    }
  }
};
