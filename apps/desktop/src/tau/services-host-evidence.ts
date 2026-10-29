/**
 * Agent-observability summaries from the desktop services host (blueprint T11): the shared host composition over a
 * project host's own rows, the signed-in session's bearer, and an owner-only queue file per project under the app's
 * user data. It works the same whether or not a renderer is open. A project only reports when the server's current
 * answer for this account and project allows summaries; a signed-out desktop sends nothing and keeps nothing.
 */
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { observeOwnTurns } from '@taucad/agent-host';
import type { OwnRowsRead } from '@taucad/agent-host';
import { createHostEvidence } from '@taucad/agent-observability/host-evidence';
import type { HostEvidence } from '@taucad/agent-observability/host-evidence';
import { ownerOnlyFiles } from '@taucad/agent-observability/node-pending-files';
import { filePendingStore } from '@taucad/agent-observability/pending-stores';

/** What one project's observer is composed from. @internal */
export type DesktopEvidenceOptions = Readonly<{
  /** `<userData>/agent-evidence`: where each project's queue file lives. */
  directory: string;
  apiBaseUrl: string;
  /** The renderer's project id, which the API lists. */
  projectId: string;
  /** The signed-in account, read per report. */
  principal: () => string | undefined;
  /** The session's bearer, read per request: main refreshes it. */
  token: () => string | undefined;
  fetch?: typeof fetch;
}>;

/**
 * One desktop project host's chat observer, for `ProjectHostOptions.observeChats`.
 *
 * @param options - The queue directory, API, project, account and bearer.
 * @returns The observer factory the project host calls with its own-row read.
 * @internal
 */
export const desktopChatObserver =
  (options: DesktopEvidenceOptions): ((read: OwnRowsRead) => HostEvidence) =>
  (read) => {
    const baseFetch = options.fetch ?? fetch;
    const withBearer: typeof fetch = async (input, init) => {
      const token = options.token();
      const headers = new Headers(init?.headers);
      if (token !== undefined) {
        headers.set('authorization', `Bearer ${token}`);
      }
      return baseFetch(input, { ...init, headers });
    };
    return createHostEvidence({
      apiBaseUrl: options.apiBaseUrl.replace(/\/+$/u, ''),
      principal: options.principal,
      project: options.projectId,
      uploader: `desktop-${randomUUID()}`,
      hostBuild: undefined,
      fetch: withBearer,
      store: filePendingStore(join(options.directory, `${encodeURIComponent(options.projectId)}.json`), ownerOnlyFiles),
      observe: async (chatId) => observeOwnTurns(read, chatId),
    });
  };
