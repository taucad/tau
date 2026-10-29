/**
 * Agent-observability summaries from a provisioned cloud host (blueprint T11).
 *
 * The cloud host image carries this module and `tau serve` loads it from `TAU_HOST_OBSERVER_MODULE`, so the published
 * CLI never depends on this private package. Its default export is the daemon's `observeChats` hook itself, so it keeps
 * that hook's contract here: it never throws, and a hook that throws is contained, so observation never affects a run. The host reports with its device credential, which the API admits on the
 * purposes and evidence routes for its own project only, as its own uploader. The owner's current grant for that
 * project still decides what is sent: being a cloud host is not consent. The queue is an owner-only file under the
 * host's config directory, so a restarted container sends what it held.
 */
import { join } from 'node:path';
import process from 'node:process';
import { observeOwnTurns } from '@taucad/agent-host';
import type { OwnRowsRead } from '@taucad/agent-host';
import { createHostEvidence } from '#host-evidence.js';
import type { ObservedChat } from '#host-evidence.js';
import { ownerOnlyFiles } from '#node-pending-files.js';
import { filePendingStore } from '#pending-stores.js';

/** The launcher's quiescence hook and the close the project host calls. @public */
export type CloudHostChatObserver = Readonly<{
  onChatQuiescent: (chatId: string, quiescent: boolean) => void;
  close: () => void;
}>;

/** What the observer is composed from: the provisioner's container environment. */
type Environment = Readonly<Record<string, string | undefined>>;

/** Answered for a project the host does not observe, or once composing the observer failed. */
const inert: CloudHostChatObserver = { onChatQuiescent: () => undefined, close: () => undefined };

/**
 * One hook that swallows what it throws.
 *
 * @param hook - The evidence hook.
 * @returns The contained hook.
 */
const quietly =
  <A extends unknown[]>(hook: (...args: A) => void) =>
  (...args: A): void => {
    try {
      hook(...args);
    } catch {
      /* The observer's own failure stays its own. */
    }
  };

/**
 * The cloud host's `observeChats` hook, which observes nothing when the container lacks any of its provisioned
 * settings. It observes only the project the host was provisioned for; any other is answered an inert observer.
 *
 * @param environment - The container environment the provisioner wrote.
 * @param fetcher - The transport; the device credential is added per request.
 * @param observeTurns - Derives one chat's own turns from the host's rows, for tests.
 * @returns The hook `tau serve` hands each of its agent's project hosts, given the project and the host's own-row read.
 * @public
 */
export const cloudHostObserver =
  (
    environment: Environment,
    fetcher: typeof fetch = fetch,
    observeTurns: (read: OwnRowsRead, chatId: string) => Promise<ObservedChat> = observeOwnTurns,
  ): ((projectId: string, read: OwnRowsRead) => CloudHostChatObserver) =>
  (projectId, read) => {
    const apiUrl = environment['TAU_API_URL'];
    const deviceId = environment['TAU_HOST_DEVICE_ID'];
    const credential = environment['TAU_HOST_CREDENTIAL'];
    const project = environment['TAU_HOST_PROJECT_ID'];
    const owner = environment['TAU_HOST_OWNER_ID'];
    if (!apiUrl || !deviceId || !credential || !project || !owner || projectId !== project) {
      return inert;
    }
    const withCredential: typeof fetch = async (request, init) => {
      const headers = new Headers(init?.headers);
      headers.set('authorization', `Bearer ${credential}`);
      return fetcher(request, { ...init, headers });
    };
    const directory = join(environment['TAU_CONFIG_DIR'] ?? '/config', 'agent-evidence');
    try {
      const evidence = createHostEvidence({
        apiBaseUrl: apiUrl.replace(/\/+$/u, ''),
        principal: () => owner,
        project,
        /* The API admits a cloud host's evidence only under its own device id. */
        uploader: deviceId,
        hostBuild: undefined,
        fetch: withCredential,
        store: filePendingStore(join(directory, `${encodeURIComponent(project)}.json`), ownerOnlyFiles),
        observe: async (chatId) => observeTurns(read, chatId),
      });
      return { onChatQuiescent: quietly(evidence.onChatQuiescent), close: quietly(evidence.close) };
    } catch {
      return inert;
    }
  };

/**
 * The hook over this process's environment, which `tau serve` loads from the image.
 *
 * @public
 */
export default cloudHostObserver(process.env);
