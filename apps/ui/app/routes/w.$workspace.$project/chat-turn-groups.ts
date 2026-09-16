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
const cache = new WeakMap<
  MyUIMessage,
  {
    readonly ids: readonly string[];
    readonly roles: ReadonlyArray<MyUIMessage['role']>;
    readonly groups: readonly TurnGroup[];
  }
>();

/**
 * Group chat messages into turn groups. A new group starts at index 0 and
 * at every user message; all other messages join the preceding group.
 *
 * Memoised on the first message plus structural boundaries so replacing the
 * active assistant object during streaming keeps the same group reference.
 */
export function buildTurnGroups(messages: readonly MyUIMessage[]): readonly TurnGroup[] {
  if (messages.length === 0) {
    return emptyGroups;
  }
  const firstMessage = messages[0]!;
  const cached = cache.get(firstMessage);
  if (
    cached &&
    cached.ids.length === messages.length &&
    messages.every((message, index) => cached.ids[index] === message.id && cached.roles[index] === message.role)
  ) {
    return cached.groups;
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
  cache.set(firstMessage, {
    ids: Object.freeze(messages.map((message) => message.id)),
    roles: Object.freeze(messages.map((message) => message.role)),
    groups: frozen,
  });
  return frozen;
}
