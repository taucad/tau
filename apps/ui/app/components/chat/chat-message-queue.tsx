import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useSelector } from '@xstate/react';
import { useChatContext } from '#hooks/use-chat.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { useChatSessionSnapshot } from '#hooks/use-chat-session.js';
import type { ChatMessageQueueActor } from '@taucad/chat-ui/machines/chat-message-queue.machine';
import { ChatMessageQueueView } from '@taucad/chat-ui/components/chat-message-queue-view';

function ConnectedQueue({
  actor,
  chatId,
}: {
  readonly actor: ChatMessageQueueActor;
  readonly chatId: string;
}): React.JSX.Element {
  const store = useChatSessionStore();
  const context = useSelector(actor, (snapshot) => snapshot.context);
  /* A send nothing runs ahead of is in the thread, not queued: the strip shows only work waiting behind a turn. */
  const subscribe = useCallback((listener: () => void) => store.subscribeChat(chatId, listener), [chatId, store]);
  const readDeparting = useCallback(() => store.departingSendOf(chatId), [chatId, store]);
  const departingId = useSyncExternalStore(subscribe, readDeparting, readDeparting);
  const items = useMemo(
    () => (departingId === undefined ? context.items : context.items.filter((item) => item.id !== departingId)),
    [context.items, departingId],
  );
  /* Still delivering, though it is not drawn: the rows behind it stay in their order until it is handed over. */
  const sendingId =
    context.sendingId ??
    (context.items.some((item) => item.id === departingId && item.command !== undefined) ? departingId : undefined);
  return (
    <ChatMessageQueueView
      items={items}
      {...(sendingId === undefined ? {} : { sendingId })}
      {...(context.error === undefined ? {} : { error: context.error })}
      onEdit={async (id, text) => store.editQueuedMessage(chatId, id, text)}
      onSteer={async (id) => store.steerQueuedMessage(chatId, id)}
      onMove={async (id, beforeId) => store.moveQueuedMessage(chatId, id, beforeId)}
      onRetry={() => {
        store.retryMessageQueue(chatId);
      }}
    />
  );
}

/** Subscribe to the retained session's outbox independently of streamed text. */
export function ChatMessageQueue(): React.JSX.Element | undefined {
  const { activeChatId } = useChatContext();
  const actor = useChatSessionSnapshot(activeChatId, (session) => session?.messageQueueRef);
  return actor === undefined ? undefined : <ConnectedQueue key={activeChatId} actor={actor} chatId={activeChatId} />;
}
