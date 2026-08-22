/**
 * ProjectChatRpcBindings
 *
 * Project-scoped sibling primitive that wires Socket.IO RPC join/leave for
 * every chat session live in the app-shell `ChatSessionStore`. Mounted only
 * inside the project route subtree, where the project providers
 * (`ChatRpcSocketProvider`, `useProject`, `useFileManager`, and
 * `HeadlessImageProvider`) are present. Routes
 * without those providers (homepage, marketing, library) do not mount this
 * component, so chat sessions stay universally creatable while RPC
 * remains a project concern.
 *
 * Each row's binding stays disabled until the matching session's
 * persistence actor reports `isLoadingChat: false`, mirroring the gate
 * the prior `<ChatRpcBinding>` enforced inline. When membership changes
 * (a chat session disappears from the store) the corresponding binding
 * unmounts and its RPC room is left cleanly via `useChatRpcConnection`'s
 * own cleanup.
 *
 * Returns `null` — purely a side-effect primitive.
 */

import type { ReactNode } from 'react';
import { useCallback, useSyncExternalStore } from 'react';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import type { ChatSessionStore } from '#services/chat-session-store.js';
import { useChatRpcConnection } from '#hooks/use-chat-rpc-socket.js';

export function ProjectChatRpcBindings(): ReactNode {
  const store = useChatSessionStore();
  const chatIds = useSyncExternalStore(
    (listener) => store.subscribeMembership(listener),
    () => store.list(),
    () => store.list(),
  );

  return (
    <>
      {chatIds.map((chatId) => (
        <SingleChatRpcBinding key={chatId} chatId={chatId} />
      ))}
    </>
  );
}

function SingleChatRpcBinding({ chatId }: { readonly chatId: string }): ReactNode {
  const store = useChatSessionStore();
  const isLoadingChat = useIsLoadingChat(store, chatId);
  useChatRpcConnection({ chatId, enabled: !isLoadingChat });
  return null;
}

/**
 * Subscribes to the session's persistence actor (when present) so the
 * binding wakes whenever its `isLoadingChat` flag flips. Returns `true`
 * while no session exists for `chatId` so the binding stays disabled
 * until the chat is actually live.
 */
function useIsLoadingChat(store: ChatSessionStore, chatId: string): boolean {
  const subscribe = useCallback(
    (listener: () => void) => {
      let actorSubscription: { unsubscribe: () => void } | undefined;

      const trySubscribeActor = (): void => {
        if (actorSubscription) {
          return;
        }
        const session = store.get(chatId);
        if (!session) {
          return;
        }
        actorSubscription = session.persistenceActorRef.subscribe(listener);
      };

      trySubscribeActor();

      const unsubscribeMembership = store.subscribeMembership(() => {
        // Membership changed: the session may have just appeared (so we
        // now have an actor to subscribe to) or disappeared (existing
        // subscription is now orphaned and the snapshot getter will
        // return the no-session default). Refresh the actor sub and
        // wake the consumer so it re-reads the snapshot.
        if (store.get(chatId)) {
          trySubscribeActor();
        } else {
          actorSubscription?.unsubscribe();
          actorSubscription = undefined;
        }
        listener();
      });

      return () => {
        unsubscribeMembership();
        actorSubscription?.unsubscribe();
      };
    },
    [store, chatId],
  );

  const getSnapshot = useCallback(() => {
    const session = store.get(chatId);
    if (!session) {
      return true;
    }
    return session.persistenceActorRef.getSnapshot().context.isLoadingChat;
  }, [store, chatId]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
