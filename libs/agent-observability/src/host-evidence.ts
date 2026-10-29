import type { PendingEvidenceStore } from '#delivery.js';
import { createEvidenceOutbox, submitEvidence } from '#delivery.js';
import type { ProjectedRun } from '#projection.js';
import type { EffectivePurposesAnswer, EvidenceReporter, ReportingGrant } from '#reporter.js';
import { createEvidenceReporter, summaryGrantOf } from '#reporter.js';

/*
 * One host's agent-observability composition (blueprint T10/T11): the browser
 * project host and the Node project host compose this the same way. When a
 * chat the host leads goes quiescent, its own committed rows are observed and
 * reported under the summary grant the server answers now.
 *
 * It runs only for a signed-in account and a project the API knows; nothing
 * is sent unless the server's current answer allows summaries, so a
 * deployment flag is never consent. Observation never affects a run: every
 * failure here is a gap the reporter's coverage shows.
 */

/** A chat's own turns, as the host observes them from its own rows. @public */
export type ObservedChat = Readonly<{
  runs: readonly ProjectedRun[];
  ownsEpoch: (leaderEpoch: string) => boolean;
}>;

/** What a host's composition is built from. @public */
export type HostEvidenceOptions = Readonly<{
  /** The API origin, without a trailing slash. */
  apiBaseUrl: string;
  /** The signed-in account. */
  principal: string;
  /** The project id the API knows; a local directory has none and composes nothing. */
  project: string;
  /** This host's uploader id. */
  uploader: string;
  /** This build's label; dropped unless the contract accepts it as an id. */
  hostBuild: string | undefined;
  /** Carries the account's credential: the session cookie in a browser, an `Authorization` header on Node. */
  fetch: typeof fetch;
  store: PendingEvidenceStore;
  /** Observe one chat's own turns now. */
  observe: (chatId: string) => Promise<ObservedChat>;
  now?: () => number;
  schedule?: (callback: () => void, milliseconds: number) => () => void;
}>;

/** A composed host reporter, as the launcher calls it. @public */
export type HostEvidence = Readonly<{
  /** The launcher's quiescence hook. */
  onChatQuiescent: (chatId: string, quiescent: boolean) => void;
  reporter: EvidenceReporter;
  close: () => void;
}>;

const contractIdPattern = /^[\w:.-]{1,128}$/u;

/**
 * The server's summary grant for this account and project, read now. A
 * signed-out credential grants nothing; any other failure rejects, which the
 * reporter treats as unknown: it reports nothing and keeps what is held.
 *
 * @param options - The API, account, project and transport.
 * @returns The grant, or `undefined`.
 */
const readGrant = async (options: HostEvidenceOptions): Promise<ReportingGrant | undefined> => {
  const response = await options.fetch(
    `${options.apiBaseUrl}/v1/telemetry-purposes?projectId=${encodeURIComponent(options.project)}`,
    { credentials: 'include', headers: { accept: 'application/json' } },
  );
  if (response.status === 401 || response.status === 403) {
    return undefined;
  }
  if (!response.ok) {
    throw new Error(`The agent-observability purposes could not be read: ${response.status}`);
  }
  const answer = (await response.json()) as EffectivePurposesAnswer;
  return summaryGrantOf(answer, { principal: options.principal, project: options.project });
};

/**
 * Compose one host's evidence reporter. It reads the grant at once, so a run
 * that ends later in the host's life is reported, and again on every
 * quiescence.
 *
 * @param options - The API, account, project, transport, store and observation.
 * @returns The quiescence hook, the reporter and its close.
 * @public
 */
export const createHostEvidence = (options: HostEvidenceOptions): HostEvidence => {
  const now = options.now ?? Date.now;
  const transport = { fetch: options.fetch, baseUrl: options.apiBaseUrl };
  const reporter = createEvidenceReporter({
    outbox: createEvidenceOutbox({
      store: options.store,
      submit: async (evidence, signal) => submitEvidence(transport, evidence, signal),
      now,
    }),
    grant: async () => readGrant(options),
    uploader: options.uploader,
    hostBuild:
      options.hostBuild !== undefined && contractIdPattern.test(options.hostBuild) ? options.hostBuild : undefined,
    now,
    ...(options.schedule === undefined ? {} : { schedule: options.schedule }),
  });
  const quietly = async (step: () => Promise<void>): Promise<void> => {
    try {
      await step();
    } catch {
      /* The next quiescence reads the rows and the grant again. */
    }
  };
  const report = async (chatId: string): Promise<void> => {
    const { runs, ownsEpoch } = await options.observe(chatId);
    await reporter.report(runs, ownsEpoch);
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
