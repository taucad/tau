/**
 * Chat Session Hooks (useChatSession / useChatSessionSnapshot)
 *
 * React surface for the vanilla `ChatSessionStore`. `useChatSession(chatId,
 * projectId)` acquires the chat in a layout effect and keeps the last committed
 * acquisition through a same-project handoff. A render React throws away
 * (StrictMode, Suspense) holds no view reference (PV-S4). The store owns session
 * lifetime; React components hold view references.
 *
 * `useChatSessionSnapshot` is a thin wrapper around `useSyncExternalStore`
 * that re-renders only when the per-chatId callback fires (messages /
 * status / error change on the underlying AI SDK `Chat`). Selector results
 * are computed during render so consumers can derive any shape from the
 * live session without manual memoisation gymnastics.
 */

import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ChatSession, ChatSessionStore } from '#services/chat-session-store.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';

/**
 * Hold a view of one chat for the lifetime of the calling component.
 *
 * @param chatId - The chat to hold.
 * @param projectId - The chat's own project; focus never names it (PV-S4, L3 D9).
 * @returns The committed session (previous chat during a same-project handoff), or `undefined` before acquisition.
 */
export function useChatSession(chatId: string, projectId: string): ChatSession | undefined {
  const store = useChatSessionStore();

  const [acquired, setAcquired] = useState<{
    readonly store: ChatSessionStore;
    readonly projectId: string;
    readonly session: ChatSession;
  }>();

  const presented = useRef(acquired);
  useLayoutEffect(() => {
    presented.current = acquired;
    if (acquired === undefined) {
      return;
    }
    // The displayed view outlives a pending candidate, including rapid A → B → C switches.
    acquired.store.acquire(acquired.session.chatId, acquired.projectId);
    return () => {
      acquired.store.release(acquired.session.chatId);
    };
  }, [acquired]);

  useLayoutEffect(() => {
    const session = store.acquire(chatId, projectId);
    const controller = new AbortController();
    const publish = (): void => {
      if (!controller.signal.aborted) {
        setAcquired({ store, projectId, session });
      }
    };
    const previous = presented.current;
    if (previous?.store === store && previous.projectId === projectId) {
      const prepare = async (): Promise<void> => {
        await store.preparePresentation(chatId, controller.signal);
        publish();
      };
      // async-iife: bootstrap -- the layout effect cannot await; cleanup aborts the pending handoff.
      void prepare();
    } else {
      // Cold/project-boundary mounting also bootstraps descendants needed by the host.
      publish();
    }
    return () => {
      controller.abort();
      store.release(chatId);
    };
  }, [store, chatId, projectId]);

  return acquired?.store === store && acquired.projectId === projectId ? acquired.session : undefined;
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
