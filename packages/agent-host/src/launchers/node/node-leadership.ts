/**
 * Node leadership (W6 T4): one process leads every chat it opens. The chat's writer takes the kernel lock and reads
 * the log, and the term's epoch is the log's highest plus one, claimed by the term's first append (W3 CL-R11). The
 * binding never steals: Web Locks `steal` across Node worker threads aborts the process (S3 F2). After `LOG_FENCED`
 * the next command rereads, since the kernel lock is still this process's.
 */

import type { LeadershipHost, LeadershipPort } from '#launchers/chat-store.js';
import { claimRefusalRetryMilliseconds, claimRetryMilliseconds } from '#launchers/leadership/leadership.machine.js';

/** The Node binding's bounds; tests shorten them. @internal */
export type NodeLeadershipDelays = Readonly<{ claimRetry?: number; claimRefusalRetry?: number }>;

/**
 * Create the Node binding of the launcher's leadership port.
 *
 * @internal
 * @param host - The launcher's hooks.
 * @param delays - The claim retry's pause and bound; HA4's values when absent.
 * @returns A port that runs every command and read in this process.
 */
export const createNodeLeadership = (host: LeadershipHost, delays?: NodeLeadershipDelays): LeadershipPort => {
  const { claimRetry = claimRetryMilliseconds, claimRefusalRetry = claimRefusalRetryMilliseconds } = delays ?? {};
  /** The chats with a reconciliation under way: one at a time per chat. */
  const reconciling = new Set<string>();
  const closing = new AbortController();

  /* The pause before the next claim; ends early, and unref'd, so a closing process never waits on it. */
  const pause = async (): Promise<void> =>
    new Promise((resolve) => {
      const timer = setTimeout(resolve, claimRetry); // Bound: claimRetryMilliseconds.
      timer.unref();
      closing.signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });

  /*
   * HA4 (RC3): claim, and while the refusal is a closing incarnation's (`WRITER_LOCKED`), claim again each pause until
   * the still-closing bound. Any other refusal, or the bound, ends it: the next reconciliation asks again.
   */
  const claimUntilOpen = async (chatId: string): Promise<void> => {
    /* The bound runs from the first refusal, as M2's does (review N2). */
    let refusedAt: number | undefined;
    try {
      // oxlint-disable-next-line no-await-in-loop -- each claim waits for the one before it.
      while ((await host.claim(chatId)) === 'WRITER_LOCKED' && !closing.signal.aborted) {
        refusedAt ??= Date.now();
        if (Date.now() - refusedAt >= claimRefusalRetry) {
          return; // Bound: claimRefusalRetryMilliseconds.
        }
        // oxlint-disable-next-line no-await-in-loop -- see above.
        await pause();
      }
    } catch (error) {
      console.error('[agent-host leadership] a reconciliation failed', chatId, error);
    }
  };

  return {
    // The host's own read of the log decides the epoch (`undefined`): there is no second read to agree with.
    execute: async (_chatId, _command, local) => local(undefined),
    read: async (_input, local) => local(),
    role: (chatId) => ({ role: host.writing(chatId) ? 'leader' : 'none', epoch: 0 }),
    opensWriter: () => true,
    stoppability: (chatId) => (host.writing(chatId) ? 'stoppable' : 'background-window'),
    appended: () => undefined,
    fenced: () => undefined,
    quiescent: () => undefined,
    liveEvent: () => undefined,
    // The process leads every chat it opens, so a reconciliation claims at once (RH-R16), one at a time per chat.
    reconcile: (chatId) => {
      if (closing.signal.aborted || reconciling.has(chatId)) {
        return;
      }
      reconciling.add(chatId);
      // async-iife: bootstrap -- owned by `reconciling` and ended by `close`; its own errors are logged inside.
      void (async (): Promise<void> => {
        try {
          await claimUntilOpen(chatId);
        } finally {
          reconciling.delete(chatId);
          /* Node never relinquishes: the loop's end is the term's, so a later refusal is reported again (review). */
          host.claimEnded(chatId);
        }
      })();
    },
    /*
     * Review I3: close stops the retries and does not wait for a claim in flight. That claim can sit in the host's
     * closing wait (10 s) and its incarnation's opening, past the close-cut bound; the host's own close, which follows
     * this one, refuses it `HOST_CLOSED` and ends it.
     */
    close: async () => {
      closing.abort();
    },
  };
};
