import type { MyUIMessage } from '@taucad/chat';
import { messageRole } from '@taucad/chat/constants';

/**
 * One conversational turn rendered as a single Virtuoso row. A turn always
 * starts with either the first message of the chat or a user message, and
 * absorbs every following non-user message (assistant reply, tool calls,
 * reasoning) until the next user message starts a new turn. Only the last
 * turn in the chat reserves viewport-height (`min-h-(--chat-live-turn-min-h)`)
 * to pin its first message at the scroller top while content streams in.
 */
export type TurnGroup = { readonly messageIds: readonly string[] };

const emptyGroups: readonly TurnGroup[] = Object.freeze([]);
const cache = new WeakMap<readonly MyUIMessage[], readonly TurnGroup[]>();

/**
 * Group chat messages into turn groups. A new group starts at index 0 and
 * at every user message; all other messages join the preceding group.
 *
 * Memoised on the `messages` array reference so equivalent reads return
 * the same `TurnGroup[]` reference (needed so React.memo'd `TurnGroup`
 * children don't re-render when only assistant tokens stream in within
 * existing messages).
 */
export function buildTurnGroups(messages: readonly MyUIMessage[]): readonly TurnGroup[] {
  if (messages.length === 0) {
    return emptyGroups;
  }
  const cached = cache.get(messages);
  if (cached) {
    return cached;
  }
  const draft: Array<{ messageIds: string[] }> = [];
  for (const message of messages) {
    if (message.role === messageRole.user || draft.length === 0) {
      draft.push({ messageIds: [message.id] });
    } else {
      draft.at(-1)!.messageIds.push(message.id);
    }
  }
  const frozen: readonly TurnGroup[] = Object.freeze(
    draft.map((group): TurnGroup => ({ messageIds: Object.freeze([...group.messageIds]) })),
  );
  cache.set(messages, frozen);
  return frozen;
}
