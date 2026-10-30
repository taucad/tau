/**
 * Report the kills the marker carried into this load, and keep this page's marker current (B-01,
 * D-UI-25; browser observability SB3).
 *
 * Mounted under the sessions registry and the chat store so the marker carries the counts that
 * matter on a phone: how many projects were live and how many chats were loaded when the tab died.
 * A detected kill goes to the error tracker as a `TabKilledError` (`#lib/tab-kill-reporting`) and
 * leaves the marker only once its report is handed over, so a kill loop still reports its first
 * kill (G17).
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLiveProjectIds } from '#hooks/use-sessions.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { offerCrashFeedback } from '#lib/crash-feedback.js';
import { isMemoryConstrainedDevice } from '#lib/device-memory-class.js';
import { getDocumentMemoryKillSignal, killHeartbeatMilliseconds } from '#lib/memory-kill-signal.js';
import { setLiveCountsReader } from '#lib/memory-sampler.js';
import { readRouteId } from '#lib/sentry-context.lib.js';
import { reportDetectedKill } from '#lib/tab-kill-reporting.js';
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
  const reported = useRef(false);

  useEffect(() => {
    if (signal === undefined || reported.current) {
      return;
    }
    reported.current = true;
    const report = async (): Promise<void> => {
      for (const kill of signal.takeDetectedKills()) {
        // Each kill in turn; one whose report does not land stays pending for the next load (G17).
        // eslint-disable-next-line no-await-in-loop -- the reports share one delivery path.
        const { delivered, eventId } = await reportDetectedKill(kill);
        if (delivered) {
          signal.settleKill(kill.id);
          // Ask what the person was doing, where it is theirs to answer (SB12).
          offerCrashFeedback(kill, eventId);
        }
      }
    };
    // async-iife: bootstrap -- reporting the previous page's kills never blocks this page's render.
    void report();
  }, [signal]);

  useEffect(() => {
    signal?.setCounts({ liveProjectCount, chatCount });
  }, [chatCount, liveProjectCount, signal]);

  // The one live count SB2's sampler can read on every device, iOS included, where no JavaScript
  // memory API exists. The reader closes over the latest render's value and never asks a worker.
  useEffect(() => {
    setLiveCountsReader(() => ({ projects: liveProjectCount }));
    return () => {
      setLiveCountsReader(undefined);
    };
  }, [liveProjectCount]);

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
    const observeVisibility = (): void => {
      signal.observeVisibility();
    };
    globalThis.addEventListener('pagehide', finish);
    globalThis.addEventListener('pageshow', arm);
    document.addEventListener('visibilitychange', observeVisibility);
    return () => {
      globalThis.removeEventListener('pagehide', finish);
      globalThis.removeEventListener('pageshow', arm);
      document.removeEventListener('visibilitychange', observeVisibility);
    };
  }, [signal]);

  // Keeps `updatedAt` fresh while the page is visible, so the detection window measures how long
  // ago the page was last alive rather than how long ago it last did something. The signal itself
  // skips a hidden page, and a hidden tab's timers are throttled anyway.
  useEffect(() => {
    if (signal === undefined) {
      return undefined;
    }
    const beat = globalThis.setInterval(() => {
      signal.heartbeat();
    }, killHeartbeatMilliseconds);
    return () => {
      globalThis.clearInterval(beat);
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
  const [signal] = useState(() => getDocumentMemoryKillSignal(deviceClass, readRouteId));
  const liveProjectCount = useLiveProjectIds().length;
  const chats = useChatSessionStore();
  const chatCount = useSyncExternalStore(
    useCallback((listener: () => void) => chats.subscribeMembership(listener), [chats]),
    () => chats.list().length,
    noChats,
  );
  return <MemoryKillReporter signal={signal} liveProjectCount={liveProjectCount} chatCount={chatCount} />;
}
