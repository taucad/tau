import { useSelector } from '@xstate/react';
import { useChatContext } from '#hooks/use-chat.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { useChatSessionSnapshot } from '#hooks/use-chat-session.js';
import type { ChatMessageQueueActor } from '#machines/chat-message-queue.machine.js';
import { ChatMessageQueueView } from '#components/chat/chat-message-queue-view.js';

function ConnectedQueue({
  actor,
  chatId,
}: {
  readonly actor: ChatMessageQueueActor;
  readonly chatId: string;
}): React.JSX.Element {
  const store = useChatSessionStore();
  const context = useSelector(actor, (snapshot) => snapshot.context);
  return (
    <ChatMessageQueueView
      items={context.items}
      {...(context.sendingId === undefined ? {} : { sendingId: context.sendingId })}
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
