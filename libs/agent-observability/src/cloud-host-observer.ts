/**
 * Agent-observability summaries from a provisioned cloud host (blueprint T11).
 *
 * The cloud host image carries this module and `tau serve` loads it from `TAU_HOST_OBSERVER_MODULE`, so the published
 * CLI never depends on this private package. The host reports with its device credential, which the API admits on the
 * purposes and evidence routes for its own project only, as its own uploader. The owner's current grant for that
 * project still decides what is sent: being a cloud host is not consent. The queue is an owner-only file under the
 * host's config directory, so a restarted container sends what it held.
 */
import { join } from 'node:path';
import process from 'node:process';
import { createHostEvidence } from '#host-evidence.js';
import type { ObservedChat } from '#host-evidence.js';
import { ownerOnlyFiles } from '#node-pending-files.js';
import { filePendingStore } from '#pending-stores.js';

/** One project host's observation source, as `tau serve` hands it over. @public */
export type CloudHostObserverInput = Readonly<{
  /** The project the daemon's agent host serves. */
  projectId: string;
  /** Observe one chat's own turns now. */
  observe: (chatId: string) => Promise<ObservedChat>;
}>;

/** The launcher's quiescence hook and the close the project host calls. @public */
export type CloudHostChatObserver = Readonly<{
  onChatQuiescent: (chatId: string, quiescent: boolean) => void;
  close: () => void;
}>;

/** What the observer is composed from: the provisioner's container environment. */
type Environment = Readonly<Record<string, string | undefined>>;

/**
 * The cloud host's observer factory, or one that observes nothing when the container lacks any of its provisioned
 * settings. It observes only the project the host was provisioned for; any other answers `undefined`.
 *
 * @param environment - The container environment the provisioner wrote.
 * @param fetcher - The transport; the device credential is added per request.
 * @returns The factory `tau serve` calls for its agent's project host.
 * @public
 */
export const cloudHostObserver =
  (
    environment: Environment,
    fetcher: typeof fetch = fetch,
  ): ((input: CloudHostObserverInput) => CloudHostChatObserver | undefined) =>
  (input) => {
    const apiUrl = environment['TAU_API_URL'];
    const deviceId = environment['TAU_HOST_DEVICE_ID'];
    const credential = environment['TAU_HOST_CREDENTIAL'];
    const project = environment['TAU_HOST_PROJECT_ID'];
    const owner = environment['TAU_HOST_OWNER_ID'];
    if (!apiUrl || !deviceId || !credential || !project || !owner || input.projectId !== project) {
      return undefined;
    }
    const withCredential: typeof fetch = async (request, init) => {
      const headers = new Headers(init?.headers);
      headers.set('authorization', `Bearer ${credential}`);
      return fetcher(request, { ...init, headers });
    };
    const directory = join(environment['TAU_CONFIG_DIR'] ?? '/config', 'agent-evidence');
    const evidence = createHostEvidence({
      apiBaseUrl: apiUrl.replace(/\/+$/u, ''),
      principal: () => owner,
      project,
      /* The API admits a cloud host's evidence only under its own device id. */
      uploader: deviceId,
      hostBuild: undefined,
      fetch: withCredential,
      store: filePendingStore(join(directory, `${encodeURIComponent(project)}.json`), ownerOnlyFiles),
      observe: input.observe,
    });
    return { onChatQuiescent: evidence.onChatQuiescent, close: evidence.close };
  };

/**
 * The factory over this process's environment, which `tau serve` loads from the image.
 *
 * @public
 */
export default cloudHostObserver(process.env);
