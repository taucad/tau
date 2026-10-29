import type { PendingEvidenceStore } from '#delivery.js';
import { createEvidenceOutbox, submitEvidence } from '#delivery.js';
import type { ProjectedRun } from '#projection.js';
import type { EffectivePurposesAnswer, EvidenceReporter, ReportingGrant, ReportingPurpose } from '#reporter.js';
import { createEvidenceReporter, purposeGrantOf } from '#reporter.js';

/*
 * One host's agent-observability composition (blueprint T10/T11): the browser
 * project host and the Node project host compose this the same way. When a
 * chat the host leads goes quiescent, its own committed rows are observed and
 * reported under the summary grant the server answers now. A rating the
 * account gives on this device is reported under the separate feedback grant,
 * from its own queue, and only by a host composed with one.
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
  /** The signed-in account, read per report; none grants nothing, and a different one rebinds. */
  principal: () => string | undefined;
  /** The project id the API knows; a local directory has none and composes nothing. */
  project: string;
  /** This host's uploader id. */
  uploader: string;
  /** This build's label; dropped unless the contract accepts it as an id. */
  hostBuild: string | undefined;
  /** Carries the account's credential: the session cookie in a browser, an `Authorization` header on Node. */
  fetch: typeof fetch;
  store: PendingEvidenceStore;
  /** The feedback plane's own queue; a host without one reports no ratings. */
  feedbackStore?: PendingEvidenceStore;
  /** Observe one chat's own turns now. */
  observe: (chatId: string) => Promise<ObservedChat>;
  now?: () => number;
  schedule?: (callback: () => void, milliseconds: number) => () => void;
}>;

/** One rating the account gave a run's reply on this device. @public */
export type RunRating = Readonly<{ chatId: string; runId: string; value: 'positive' | 'negative'; at: number }>;

/** A composed host reporter, as the launcher calls it. @public */
export type HostEvidence = Readonly<{
  /** The launcher's quiescence hook. */
  onChatQuiescent: (chatId: string, quiescent: boolean) => void;
  /**
   * The UI showed a live run's model text at `at`, on this device's clock. The first time per run is kept, for the most
   * recent runs, and reported with the run once it has ended; a later time for the same run, as from another tab, or a
   * time in the future is dropped.
   */
  onPresented: (chatId: string, runId: string, at: number) => void;
  /**
   * The account rated a run's reply at `at`, on this device's clock. A run is rated once: a later rating of the same
   * run, or a time in the future, is dropped. It is reported under the feedback grant once the run has ended.
   */
  onRated: (rating: RunRating) => void;
  reporter: EvidenceReporter;
  /** The feedback plane's reporter, when the host was composed with its queue. */
  feedback: EvidenceReporter | undefined;
  close: () => void;
}>;

const contractIdPattern = /^[\w:.-]{1,128}$/u;

/** How many runs' presentation times, and how many ratings, a host keeps; a reported run's facts are not sent again. */
const presentedLimit = 256;

/** How far ahead of the host's clock the UI's may be; anything later is not a time this device saw. */
const clockSlackMilliseconds = 5000;

/**
 * The server's grant for one purpose, this account and project, read now. A
 * signed-out credential grants nothing; any other failure rejects, which the
 * reporter treats as unknown: it reports nothing and keeps what is held.
 *
 * @param options - The API, account, project and transport.
 * @param purpose - The purpose the reporter asking answers to.
 * @returns The grant, or `undefined`.
 */
const readGrant = async (
  options: HostEvidenceOptions,
  purpose: ReportingPurpose,
): Promise<ReportingGrant | undefined> => {
  const principal = options.principal();
  if (principal === undefined) {
    return undefined;
  }
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
  /* An account switched while the answer was in flight is not the account it answered for. */
  return options.principal() === principal
    ? purposeGrantOf(answer, { principal, project: options.project }, purpose)
    : undefined;
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
  const reporterFor = (purpose: ReportingPurpose, store: PendingEvidenceStore): EvidenceReporter =>
    createEvidenceReporter({
      outbox: createEvidenceOutbox({
        store,
        submit: async (evidence, signal) => submitEvidence(transport, evidence, signal),
        now,
      }),
      grant: async () => readGrant(options, purpose),
      uploader: options.uploader,
      hostBuild:
        options.hostBuild !== undefined && contractIdPattern.test(options.hostBuild) ? options.hostBuild : undefined,
      now,
      purpose,
      ...(options.schedule === undefined ? {} : { schedule: options.schedule }),
    });
  const reporter = reporterFor('summary', options.store);
  const feedback = options.feedbackStore === undefined ? undefined : reporterFor('feedback', options.feedbackStore);
  const quietly = async (step: () => Promise<void>): Promise<void> => {
    try {
      await step();
    } catch {
      /* The next quiescence reads the rows and the grant again. */
    }
  };
  const presented = new Map<string, number>();
  const rated = new Map<string, Readonly<{ value: 'positive' | 'negative'; at: number }>>();
  const runKey = (chatId: string, runId: string): string => `${chatId}\u0000${runId}`;
  /* Both maps only bound memory: a reported run's facts are not sent again. */
  const keep = <T>(map: Map<string, T>, key: string, value: T): void => {
    map.set(key, value);
    if (map.size > presentedLimit) {
      map.delete(map.keys().next().value!);
    }
  };
  const report = async (chatId: string): Promise<void> => {
    const { runs, ownsEpoch } = await options.observe(chatId);
    await reporter.report(
      runs.map((run) => {
        const at = presented.get(runKey(run.chatId, run.runId));
        return at === undefined ? run : { ...run, presentedAt: at };
      }),
      ownsEpoch,
    );
    /* Only rated runs: the feedback reporter settles a run it saw, and a run seen unrated would never be sent. */
    const ratings = runs.flatMap((run) => {
      const rating = rated.get(runKey(run.chatId, run.runId));
      return rating === undefined ? [] : [{ ...run, rating }];
    });
    if (feedback !== undefined && ratings.length > 0) {
      await feedback.report(ratings, ownsEpoch);
    }
  };
  const acceptable = (at: number): boolean => Number.isFinite(at) && at >= 0 && at <= now() + clockSlackMilliseconds;
  void quietly(async () => reporter.refresh());
  if (feedback !== undefined) {
    void quietly(async () => feedback.refresh());
  }
  return {
    onChatQuiescent: (chatId, quiescent) => {
      if (quiescent) {
        void quietly(async () => report(chatId));
      }
    },
    onPresented: (chatId, runId, at) => {
      const key = runKey(chatId, runId);
      if (acceptable(at) && !presented.has(key)) {
        keep(presented, key, at);
      }
    },
    onRated: ({ chatId, runId, value, at }) => {
      const key = runKey(chatId, runId);
      if (feedback === undefined || !acceptable(at) || rated.has(key)) {
        return;
      }
      keep(rated, key, { value, at });
      void quietly(async () => report(chatId));
    },
    reporter,
    feedback,
    close: () => {
      reporter.close();
      feedback?.close();
    },
  };
};
