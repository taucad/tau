/**
 * Chat Session Hooks (useChatSession / useChatSessionSnapshot)
 *
 * React surface for the vanilla `ChatSessionStore`. `useChatSession(chatId,
 * projectId)` acquires the chat in an effect and reads it through the store's
 * membership, so a render React throws away (StrictMode, Suspense) holds no
 * view reference (PV-S4). The store is the source of truth for lifetime;
 * React components are subscribers, not owners.
 *
 * `useChatSessionSnapshot` is a thin wrapper around `useSyncExternalStore`
 * that re-renders only when the per-chatId callback fires (messages /
 * status / error change on the underlying AI SDK `Chat`). Selector results
 * are computed during render so consumers can derive any shape from the
 * live session without manual memoisation gymnastics.
 */

import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { ChatSession } from '#services/chat-session-store.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';

/**
 * Hold a view of one chat for the lifetime of the calling component.
 *
 * @param chatId - The chat to hold.
 * @param projectId - The chat's own project; focus never names it (PV-S4, L3 D9).
 * @returns The live session, or `undefined` until the acquiring effect has committed.
 */
export function useChatSession(chatId: string, projectId: string): ChatSession | undefined {
  const store = useChatSessionStore();

  useEffect(() => {
    store.acquire(chatId, projectId);
    return () => {
      store.release(chatId);
    };
  }, [store, chatId, projectId]);

  return useSyncExternalStore(
    (listener) => store.subscribeMembership(listener),
    () => store.get(chatId),
    () => undefined,
  );
}

/**
 * Shallow-equal comparison used to short-circuit selector results so that
 * `useSyncExternalStore` honours its "stable snapshot" contract even when
 * the selector synthesises a fresh container object on every call.
 *
 * Without this, a selector like `(session) => ({ messages: session.messages })`
 * would return a new object per `getSnapshot` invocation, React would treat
 * that as a change, and we'd loop forever in development.
 */
function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return false;
  }
  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const aKeys = Object.keys(aRecord);
  const bKeys = Object.keys(bRecord);
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  for (const key of aKeys) {
    if (!Object.is(aRecord[key], bRecord[key])) {
      return false;
    }
  }
  return true;
}

/**
 * Subscribe to a per-chatId snapshot derived from the live `ChatSession`.
 * Re-renders when the underlying AI SDK `Chat` fires a messages / status /
 * error callback for that chatId; never wakes for unrelated chats.
 *
 * The selector receives the latest `ChatSession` (or `undefined` if the
 * chatId is not currently mounted) and returns whatever shape the consumer
 * needs. It is invoked during render, so derived state is always fresh.
 *
 * Selector results are cached and shallow-compared so consumers may
 * synthesise fresh objects in their selector — `useSyncExternalStore`
 * still sees a stable reference when no field actually changed and won't
 * thrash the render loop.
 */
export function useChatSessionSnapshot<T>(chatId: string, selector: (session: ChatSession | undefined) => T): T {
  const store = useChatSessionStore();
  const cacheRef = useRef<{ readonly value: T } | undefined>(undefined);

  return useSyncExternalStore(
    (listener) => store.subscribeChat(chatId, listener),
    () => {
      const next = selector(store.get(chatId));
      const previous = cacheRef.current;
      if (previous && shallowEqual(previous.value, next)) {
        return previous.value;
      }
      cacheRef.current = { value: next };
      return next;
    },
    () => {
      const next = selector(undefined);
      const previous = cacheRef.current;
      if (previous && shallowEqual(previous.value, next)) {
        return previous.value;
      }
      cacheRef.current = { value: next };
      return next;
    },
  );
}
