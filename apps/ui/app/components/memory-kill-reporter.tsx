/**
 * Report the previous page's suspected memory kill, once, and keep this page's
 * alive marker current (B-01, D-UI-25).
 *
 * Mounted under the analytics boundary and the sessions registry so the event
 * carries the counts that matter on a phone: how many projects were live and
 * how many chats were loaded when the tab died.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useAnalytics } from '#hooks/use-analytics.js';
import { useLiveProjectIds } from '#hooks/use-sessions.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { isMemoryConstrainedDevice } from '#lib/device-memory-class.js';
import { getDocumentMemoryKillSignal, memoryKillEventName } from '#lib/memory-kill-signal.js';
import type { MemoryKillSignal } from '#lib/memory-kill-signal.js';

export function MemoryKillReporter({
  signal,
  liveProjectCount,
  chatCount,
}: {
  readonly signal: MemoryKillSignal | undefined;
  readonly liveProjectCount: number;
  readonly chatCount: number;
}): undefined {
  const { capture } = useAnalytics();
  const reported = useRef(false);

  useEffect(() => {
    if (signal === undefined || reported.current) {
      return;
    }
    reported.current = true;
    const kill = signal.takeSuspectedKill();
    if (kill !== undefined) {
      capture(memoryKillEventName, kill);
    }
  }, [capture, signal]);

  useEffect(() => {
    signal?.setCounts({ liveProjectCount, chatCount });
  }, [chatCount, liveProjectCount, signal]);

  useEffect(() => {
    if (signal === undefined) {
      return undefined;
    }
    const finish = (): void => {
      signal.finish();
    };
    const arm = (event: PageTransitionEvent): void => {
      if (event.persisted) {
        signal.arm();
      }
    };
    globalThis.addEventListener('pagehide', finish);
    globalThis.addEventListener('pageshow', arm);
    return () => {
      globalThis.removeEventListener('pagehide', finish);
      globalThis.removeEventListener('pageshow', arm);
    };
  }, [signal]);

  return undefined;
}

const deviceClass = (): string => (isMemoryConstrainedDevice() ? 'constrained' : 'standard');
const noChats = (): number => 0;

/**
 * The document's reporter, fed by the sessions registry and the chat store.
 *
 * @returns The reporter for this document's signal.
 */
export function DocumentMemoryKillReporter(): React.JSX.Element {
  const [signal] = useState(() => getDocumentMemoryKillSignal(deviceClass));
  const liveProjectCount = useLiveProjectIds().length;
  const chats = useChatSessionStore();
  const chatCount = useSyncExternalStore(
    useCallback((listener: () => void) => chats.subscribeMembership(listener), [chats]),
    () => chats.list().length,
    noChats,
  );
  return <MemoryKillReporter signal={signal} liveProjectCount={liveProjectCount} chatCount={chatCount} />;
}
