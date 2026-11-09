/**
 * Report the kills the marker carried into this load, and keep this page's marker current (B-01,
 * D-UI-25; browser observability SB3).
 *
 * Mounted under the sessions registry and the chat store so the marker carries the counts that
 * matter on a phone: how many projects were live and how many chats were loaded when the tab died.
 * A detected kill goes to the error tracker as a `TabKilledError` (`#lib/tab-kill-reporting`) only
 * when "Share usage and diagnostics" resolves to `granted` (crash capture blueprint). While the
 * consent is `unknown` (a signed-in preference still loading) the kill waits in the marker's
 * `pending` list and is sent if it resolves to on in this tab; on `denied` it is settled and dropped
 * at once. It leaves the marker only once handed over or dropped, so a kill loop still reports its
 * first kill (G17). Nothing about reporting is shown in any state.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLiveProjectIds } from '#hooks/use-sessions.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { isMemoryConstrainedDevice } from '#lib/device-memory-class.js';
import { getDocumentMemoryKillSignal, killBusyHeartbeatMilliseconds } from '#lib/memory-kill-signal.js';
import { setLiveCountsReader } from '#lib/memory-sampler.js';
import { installKillWorkReaders } from '#lib/kill-work-context.js';
import { readRouteId } from '#lib/sentry-context.lib.js';
import { reportDetectedKill } from '#lib/tab-kill-reporting.js';
import type { DetectedMemoryKill, MemoryKillSignal } from '#lib/memory-kill-signal.js';
import { pageTelemetry } from '#telemetry/runtime-telemetry.js';
import type { ReportingConsent } from '@taucad/telemetry/client';

/** Where the reporter reads the telemetry consent (the page composition's one rule) and counts a kill. @public */
export type KillReportConsent = Readonly<{
  read: () => ReportingConsent;
  /** Listen for each resolved change; returns the unsubscribe. */
  subscribe: (listener: () => void) => () => void;
  /** Count one consented kill in runtime telemetry (`tau.runtime.page_kills`), by kernel and phase. */
  count: (kill: DetectedMemoryKill) => void;
}>;

/** The page composition's consent; `unknown` (wait) where there is none, as during SSR. */
const pageConsent: KillReportConsent = {
  read: () => pageTelemetry()?.consent() ?? 'unknown',
  subscribe: (listener) => pageTelemetry()?.onConsentChange(listener) ?? (() => undefined),
  count: (kill) => {
    pageTelemetry()?.recordKill({
      ...(kill.work.kernel === undefined ? {} : { kernel: kill.work.kernel }),
      ...(kill.work.phase === undefined ? {} : { phase: kill.work.phase }),
      classification: kill.classification,
    });
  },
};

export function MemoryKillReporter({
  signal,
  liveProjectCount,
  chatCount,
  consent = pageConsent,
}: {
  readonly signal: MemoryKillSignal | undefined;
  readonly liveProjectCount: number;
  readonly chatCount: number;
  readonly consent?: KillReportConsent;
}): undefined {
  const waiting = useRef<DetectedMemoryKill[] | undefined>(undefined);

  useEffect(() => {
    if (signal === undefined) {
      return undefined;
    }
    waiting.current ??= [...signal.takeDetectedKills()];
    let isSending = false;
    const process = async (): Promise<void> => {
      const decided = consent.read();
      const queue = waiting.current ?? [];
      if (isSending || decided === 'unknown' || queue.length === 0) {
        return;
      }
      isSending = true;
      try {
        for (const kill of queue.splice(0)) {
          if (decided === 'denied') {
            // Off means off: the kill never leaves the device and is not kept waiting.
            signal.settleKill(kill.id);
            continue;
          }
          // Each kill in turn; one whose report does not land stays pending for the next load (G17).
          // eslint-disable-next-line no-await-in-loop -- the reports share one delivery path.
          if (await reportDetectedKill(kill)) {
            signal.settleKill(kill.id);
            // Counted once, as it leaves the marker: a kill still pending is counted when it is delivered.
            consent.count(kill);
          }
        }
      } finally {
        isSending = false;
      }
    };
    const unsubscribe = consent.subscribe(() => {
      // async-iife: bootstrap -- a consent change re-checks what waits; it never blocks the change.
      void process();
    });
    // async-iife: bootstrap -- reporting the previous page's kills never blocks this page's render.
    void process();
    return unsubscribe;
  }, [consent, signal]);

  // SB2's kernel heap and renderer readers, which nothing registered before (crash capture, Finding 2).
  useEffect(() => installKillWorkReaders(), []);

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
    // Every 5 s; the signal writes each time while a model opens or renders, else every 30 s.
    const beat = globalThis.setInterval(() => {
      signal.heartbeat();
    }, killBusyHeartbeatMilliseconds);
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
