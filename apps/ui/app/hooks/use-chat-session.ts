/**
 * Chat Session Hooks (useChatSession / useChatSessionSnapshot)
 *
 * React surface for the vanilla `ChatSessionStore`. Components that need a
 * live `Chat` instance + persistence/draft actors call `useChatSession(chatId)`
 * — the store is acquired during render so the returned record is non-null
 * on the very first render, refcounted on every consumer, and released in
 * the effect cleanup so any subtree unmount/remount cycle (panel resize,
 * focus change, route navigation) leaves the underlying actors intact as
 * long as another consumer or the store still holds it.
 *
 * The store is the source of truth for lifetime; React components are
 * subscribers, not owners. This eliminates the class of "headless
 * ChatInstance reuse" races that plagued the prior design.
 *
 * `useChatSessionSnapshot` is a thin wrapper around `useSyncExternalStore`
 * that re-renders only when the per-chatId callback fires (messages /
 * status / error change on the underlying AI SDK `Chat`). Selector results
 * are computed during render so consumers can derive any shape from the
 * live session without manual memoisation gymnastics.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ChatSession, ChatSessionStore } from '#services/chat-session-store.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';

type Acquisition = {
  readonly store: ChatSessionStore;
  readonly chatId: string;
  readonly session: ChatSession;
};

/**
 * Acquire a chat session for the lifetime of the calling component. The
 * session is retained until the last consumer unmounts; intermediate
 * unmount/remount of any single consumer never drops the underlying actors.
 *
 * Lifecycle:
 * - **First render**: lazy `useState` initializer acquires the session
 *   synchronously so the returned record is immediately usable.
 * - **Subsequent renders**: the cached acquisition is reused unchanged.
 * - **Store/chatId change**: a new acquisition is taken during render and
 *   the prior one is released in the effect cleanup the next time the
 *   effect commits — this guarantees the new session is live before the
 *   old one is dropped, so consumers never observe a torn state.
 * - **Unmount**: the active acquisition releases its view reference; the
 *   store disposes the underlying actors only when no other view or active
 *   run holds the chat.
 */
export function useChatSession(chatId: string): ChatSession {
  const store = useChatSessionStore();

  const [acquisition, setAcquisition] = useState<Acquisition>(() => ({
    store,
    chatId,
    session: store.acquire(chatId),
  }));

  let active: Acquisition = acquisition;
  if (acquisition.store !== store || acquisition.chatId !== chatId) {
    // Acquire eagerly so the same render returns the right session.
    // The previous acquisition is released by the effect cleanup below
    // when its `acquisition` dep changes on the next commit.
    active = { store, chatId, session: store.acquire(chatId) };
    setAcquisition(active);
  }

  useEffect(() => {
    return () => {
      acquisition.store.release(acquisition.chatId);
    };
  }, [acquisition]);

  return active.session;
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
