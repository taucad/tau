import type { ErrorDetails } from '#lib/error-details.js';
import { reportUiError } from '#lib/error-reporting.js';

/*
 * HA0 (Brain research/host-attachment-reliability-blueprint.md, Finding 2): reading, settling and delivering a chat
 * failed silently. `onStatus` recorded and retried without reporting, so no Sentry issue, Loki stream or analytics
 * event could rank attachment failures. Each code below is one observed failure family, reported to Sentry through
 * the page's error reporting, as `model-wait-reporting.ts` reports a stalled model wait.
 *
 * Low volume by construction. A code is sent once per occurrence (the caller names the occurrence: a session, a run,
 * a command, a reset), and at most {@link chatReadReportLimit} times per page load, however often it recurs.
 */

/** The failure families HA0 reports. */
export const chatReadCodes = [
  /* A chat opened cold and its transcript stayed hidden while its host read stayed lost (U1–U3, U14). */
  'chat.read.cold-hidden',
  /* This device's own segment holds an unsettled run while its host cannot answer: an orphan candidate (RC3). */
  'run.unsettled.own',
  /* A claim on an orphaned run was refused (Finding 5, H22). */
  'claim.refused',
  /* A queued command ended not knowing its effect: refused `unknown` (U8), applied but not durable (U20), or the
   * connection lost past its bound (U21). */
  'outbox.unknown-effect',
  /* A host answer reset this device's own projection: cursor ahead, identity mismatch or a clamp (Finding 4). */
  'own.rewrite',
] as const;

/** One HA0 failure family. */
export type ChatReadCode = (typeof chatReadCodes)[number];

/** The most reports of each code one page load sends. */
export const chatReadReportLimit = 5;

/** One reported failure, as the Sentry event names it. */
export class ChatReadFailure extends Error {
  public override readonly name = 'ChatReadFailure';
}

/** What one report says beyond its code. */
export type ChatReadObservation = Readonly<{
  /** The chat the failure is about. */
  chatId: string;
  /**
   * What makes this occurrence one: a session object, a run id, a command id. A code repeated for the same
   * occurrence is not sent again.
   */
  occurrence: WeakKey | string;
  /** Low-cardinality tags (a status, a reason, a refusal code). */
  tags?: Readonly<Record<string, string>>;
}>;

/**
 * Create a sink that reports each code once per occurrence and caps each code per page load.
 *
 * @param report - Where reports go; the page's error reporting by default.
 * @returns `report`, called wherever a failure is observed.
 */
export const createChatReadReporter = (
  report: (error: Error, details: ErrorDetails) => unknown = reportUiError,
): Readonly<{ report: (code: ChatReadCode, observation: ChatReadObservation) => void }> => {
  const sentByCode = new Map<ChatReadCode, number>();
  /* String occurrences are held for the page's life; the per-code cap bounds them. */
  const seenKeys = new Set<string>();
  const seenObjects = new Map<ChatReadCode, WeakSet<WeakKey>>();
  /* Whether this occurrence of the code is new, recording it if so. */
  const firstOf = (code: ChatReadCode, occurrence: WeakKey | string): boolean => {
    if (typeof occurrence === 'string') {
      const key = `${code}\0${occurrence}`;
      if (seenKeys.has(key)) {
        return false;
      }
      seenKeys.add(key);
      return true;
    }
    const objects = seenObjects.get(code) ?? new WeakSet();
    seenObjects.set(code, objects);
    if (objects.has(occurrence)) {
      return false;
    }
    objects.add(occurrence);
    return true;
  };
  return {
    report: (code, observation) => {
      const sent = sentByCode.get(code) ?? 0;
      if (sent >= chatReadReportLimit || !firstOf(code, observation.occurrence)) {
        return;
      }
      sentByCode.set(code, sent + 1);
      // async-iife: bootstrap -- reporting never rejects, and nothing waits on it.
      void report(new ChatReadFailure(code), {
        level: 'warning',
        tags: { ...observation.tags, 'chat.read': code },
        contexts: { chat: { chatId: observation.chatId } },
        fingerprint: ['chat-read', code],
      });
    },
  };
};

/** The page's sink. */
export const chatReadReporter = createChatReadReporter();

/** HA4: a claim refusal the agent host worker forwards on its `telemetry` notify (`onClaimRefused`). */
export type ForwardedClaimRefusal = Readonly<{ kind: 'claim.refused'; chatId: string; code: string }>;

/**
 * Report a forwarded entry that is a claim refusal as `claim.refused`; anything else is left to the caller.
 *
 * @param entry - What the worker forwarded.
 * @param reporter - The sink; the page's by default.
 * @returns Whether the entry was a claim refusal.
 */
export const reportForwardedClaimRefusal = (
  entry: unknown,
  reporter: Pick<ReturnType<typeof createChatReadReporter>, 'report'> = chatReadReporter,
): boolean => {
  if (typeof entry !== 'object' || entry === null || !('kind' in entry) || entry.kind !== 'claim.refused') {
    return false;
  }
  const { chatId, code } = entry as Partial<Record<keyof ForwardedClaimRefusal, unknown>>;
  if (typeof chatId === 'string' && typeof code === 'string') {
    /* Each forward is one refusal: the entry object is the occurrence, and the per-code cap bounds a page load. */
    reporter.report('claim.refused', { chatId, occurrence: entry, tags: { code } });
  }
  return true;
};
