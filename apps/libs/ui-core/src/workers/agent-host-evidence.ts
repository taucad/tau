/**
 * Agent-observability summaries from the browser project host (blueprint T10): the shared host composition over this
 * worker's own rows, the page's session cookie and the project's IndexedDB queue. The renderer plays no part, so what
 * is reported does not depend on what a tab displayed. Anonymous Pi and runtime telemetry are untouched and are never
 * added to these facts.
 */
import { observeOwnTurns } from '@taucad/agent-host';
import type { TauAgentHost } from '@taucad/agent-host';
import { memoryPendingStore } from '@taucad/agent-observability/delivery';
import type { PendingEvidenceStore } from '@taucad/agent-observability/delivery';
import { createHostEvidence } from '@taucad/agent-observability/host-evidence';
import type { HostEvidence } from '@taucad/agent-observability/host-evidence';
import { indexedDbPendingStore } from '@taucad/agent-observability/pending-stores';
import { randomUuid } from '@taucad/utils/id';

/** What the worker composes a project's reporter from. @internal */
export type WorkerEvidenceOptions = Readonly<{
  /** The API origin the page's session cookie is good for. */
  apiBaseUrl: string;
  /** The signed-in account the page named. */
  principal: string;
  /** The project id the API knows. */
  projectId: string;
  /** This build's release label. */
  hostBuild: string | undefined;
  /** The project host's own rows, read page by page. */
  readEvents: TauAgentHost['readEvents'];
  fetch?: typeof fetch;
  /** Where unanswered envelopes wait; the project's IndexedDB database when absent. */
  store?: PendingEvidenceStore;
  /** Where unanswered ratings wait, apart from summaries; the project's own IndexedDB database when absent. */
  feedbackStore?: PendingEvidenceStore;
}>;

const defaultStore = (name: string): PendingEvidenceStore =>
  typeof indexedDB === 'undefined' ? memoryPendingStore() : indexedDbPendingStore(name);

/**
 * Compose one browser project host's evidence reporter.
 *
 * @param options - The API, account, project and the host's read.
 * @returns The quiescence hook for the launcher, the reporter, and its close.
 * @internal
 */
export const createWorkerEvidence = (options: WorkerEvidenceOptions): HostEvidence =>
  createHostEvidence({
    apiBaseUrl: options.apiBaseUrl,
    principal: () => options.principal,
    project: options.projectId,
    uploader: `browser-${randomUuid()}`,
    hostBuild: options.hostBuild,
    fetch: options.fetch ?? fetch.bind(globalThis),
    store: options.store ?? defaultStore(`tau-agent-evidence:${options.projectId}`),
    feedbackStore: options.feedbackStore ?? defaultStore(`tau-agent-evidence-feedback:${options.projectId}`),
    observe: async (chatId) => observeOwnTurns(options.readEvents, chatId),
  });
