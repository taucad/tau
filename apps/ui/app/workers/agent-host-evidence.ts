/**
 * Agent-observability summaries from the browser project host (blueprint T10): when a chat this host leads goes
 * quiescent, its own committed rows are folded into turn facts and reported under the summary grant the server
 * answers now. The renderer plays no part, so what is reported does not depend on what a tab displayed.
 *
 * Nothing here runs without a signed-in account, and nothing is sent unless the server's current answer for this
 * account and project allows summaries: the deployment flag is not consent. Anonymous Pi and runtime telemetry are
 * untouched and are never added to these facts.
 */
import { observeTurns } from '@taucad/agent-host';
import type { AgentLogEvent, TauAgentHost } from '@taucad/agent-host';
import { createEvidenceOutbox, memoryPendingStore, submitEvidence } from '@taucad/agent-observability/delivery';
import type { PendingEvidenceStore } from '@taucad/agent-observability/delivery';
import { indexedDbPendingStore } from '@taucad/agent-observability/pending-stores';
import { createEvidenceReporter, summaryGrantOf } from '@taucad/agent-observability/reporter';
import type { EffectivePurposesAnswer, EvidenceReporter, ReportingGrant } from '@taucad/agent-observability/reporter';
import { randomUuid } from '@taucad/utils/id';

/** What the worker composes a project's reporter from. @internal */
export type WorkerEvidenceOptions = Readonly<{
  /** The API origin the page's session cookie is good for. */
  apiBaseUrl: string;
  /** The signed-in account the page named. */
  principal: string;
  /** The project id the API knows. */
  projectId: string;
  /** This build's release label, when it is one the contract accepts. */
  hostBuild: string | undefined;
  /** The project host's own rows, read page by page. */
  readEvents: TauAgentHost['readEvents'];
  fetch?: typeof fetch;
  /** Where unanswered envelopes wait; the project's IndexedDB database when absent. */
  store?: PendingEvidenceStore;
}>;

/** A project host's reporter, as the launcher calls it. @internal */
export type WorkerEvidence = Readonly<{
  onChatQuiescent: (chatId: string, quiescent: boolean) => void;
  reporter: EvidenceReporter;
  close: () => void;
}>;

const contractIdPattern = /^[\w:.-]{1,128}$/u;
const pageLimit = 256;
const pageBytes = 4 * 1024 * 1024;

/**
 * A chat's own rows, every page of them.
 *
 * @param readEvents - The host's read.
 * @param chatId - The chat.
 * @returns The rows, in log order.
 */
const ownRows = async (readEvents: TauAgentHost['readEvents'], chatId: string): Promise<AgentLogEvent[]> => {
  const rows: AgentLogEvent[] = [];
  let cursor = 0;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- each page starts where the one before it ended.
    const batch = await readEvents({ chatId, cursor, limit: pageLimit, maxBytes: pageBytes });
    rows.push(...batch.events);
    if (batch.events.length === 0 || batch.nextCursor >= batch.endCursor) {
      return rows;
    }
    cursor = batch.nextCursor;
  }
};

/**
 * The server's summary grant for this account and project, read now. A signed-out session grants nothing; any other
 * failure is unknown, which reports nothing and keeps what is held.
 *
 * @param options - The API, account and project.
 * @returns The grant, or `undefined`.
 */
const readGrant = async (options: WorkerEvidenceOptions): Promise<ReportingGrant | undefined> => {
  const response = await (options.fetch ?? fetch)(
    `${options.apiBaseUrl}/v1/telemetry-purposes?projectId=${encodeURIComponent(options.projectId)}`,
    { credentials: 'include', headers: { accept: 'application/json' } },
  );
  if (response.status === 401 || response.status === 403) {
    return undefined;
  }
  if (!response.ok) {
    throw new Error(`The agent-observability purposes could not be read: ${response.status}`);
  }
  const answer = (await response.json()) as EffectivePurposesAnswer;
  return summaryGrantOf(answer, { principal: options.principal, project: options.projectId });
};

const defaultStore = (projectId: string): PendingEvidenceStore =>
  typeof indexedDB === 'undefined' ? memoryPendingStore() : indexedDbPendingStore(`tau-agent-evidence:${projectId}`);

/**
 * Compose one project host's evidence reporter. It reads the grant once at once, so a run that ends later in this
 * host's life is reported, and on every quiescence after that.
 *
 * @param options - The API, account, project and the host's read.
 * @returns The quiescence hook for the launcher, the reporter, and its close.
 * @internal
 */
export const createWorkerEvidence = (options: WorkerEvidenceOptions): WorkerEvidence => {
  const transport = { fetch: options.fetch ?? fetch.bind(globalThis), baseUrl: options.apiBaseUrl };
  const outbox = createEvidenceOutbox({
    store: options.store ?? defaultStore(options.projectId),
    submit: async (evidence, signal) => submitEvidence(transport, evidence, signal),
    now: Date.now,
  });
  const reporter = createEvidenceReporter({
    outbox,
    grant: async () => readGrant(options),
    uploader: `browser-${randomUuid()}`,
    hostBuild:
      options.hostBuild !== undefined && contractIdPattern.test(options.hostBuild) ? options.hostBuild : undefined,
    now: Date.now,
  });
  const report = async (chatId: string): Promise<void> => {
    const rows = await ownRows(options.readEvents, chatId);
    /* Every row here is this device's own: it reports what it led, and another device what that one did. */
    const epochs = new Set(rows.map((row) => row.leaderEpoch));
    await reporter.report(observeTurns(chatId, rows), (leaderEpoch) => epochs.has(leaderEpoch));
  };
  /* Observation never affects the run: a failure here is a gap the coverage shows, not an error. */
  const quietly = async (step: () => Promise<void>): Promise<void> => {
    try {
      await step();
    } catch {
      /* The next quiescence reads the rows and the grant again. */
    }
  };
  void quietly(async () => reporter.refresh());
  return {
    onChatQuiescent: (chatId, quiescent) => {
      if (quiescent) {
        void quietly(async () => report(chatId));
      }
    },
    reporter,
    close: () => {
      reporter.close();
    },
  };
};
