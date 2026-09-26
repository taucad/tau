/**
 * Node leadership (W6 T4): one process leads every chat it opens. The chat's writer takes the kernel lock and reads
 * the log, and the term's epoch is the log's highest plus one, claimed by the term's first append (W3 CL-R11). The
 * binding never steals: Web Locks `steal` across Node worker threads aborts the process (S3 F2). After `LOG_FENCED`
 * the next command rereads, since the kernel lock is still this process's.
 */

import type { LeadershipHost, LeadershipPort } from '#launchers/chat-store.js';

/**
 * Create the Node binding of the launcher's leadership port.
 *
 * @param host - The launcher's hooks.
 * @returns A port that runs every command and read in this process.
 * @internal
 */
export const createNodeLeadership = (host: LeadershipHost): LeadershipPort => ({
  // The host's own read of the log decides the epoch (`undefined`): there is no second read to agree with.
  execute: async (_chatId, _command, local) => local(undefined),
  read: async (_input, local) => local(),
  role: (chatId) => ({ role: host.writing(chatId) ? 'leader' : 'none', epoch: 0 }),
  appended: () => undefined,
  fenced: () => undefined,
  quiescent: () => undefined,
  liveEvent: () => undefined,
  // The process leads every chat it opens, so a reconciliation claims at once (RH-R16).
  reconcile: (chatId) => {
    void host.claim(chatId);
  },
  close: async () => undefined,
});
