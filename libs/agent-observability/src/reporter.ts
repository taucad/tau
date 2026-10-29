import type { DeliveryScope, DrainStop, EvidenceOutbox, OutboxCounts } from '#delivery.js';
import type { ProjectedRun, ProjectionContext } from '#projection.js';
import { projectRun } from '#projection.js';

/*
 * Host evidence reporting (blueprint T10/T11).
 *
 * The one piece every host composes: it asks the server what this account may
 * report for this project, binds the outbox to that answer, projects the runs
 * the host hands it, and drains. Nothing is cached across answers: each report
 * reads the grant again, a withdrawn grant purges what was held under it, and
 * a grant this reporter has not seen yet starts its own clock, so nothing that
 * happened before the reporter knew of it is ever sent.
 */

/** The server's current answer for one account and project: the scope to report summaries under. @public */
export type ReportingGrant = DeliveryScope & Readonly<{ protection: ProjectionContext['protection'] }>;

/** The parts of the server's effective-purposes answer a host reads. @public */
export type EffectivePurposesAnswer = Readonly<{
  epoch: string;
  projectId?: string | undefined;
  purposes: ReadonlyArray<Readonly<{ purpose: string; allowed: boolean }>>;
}>;

/**
 * The summary grant an effective-purposes answer gives, if any. Only an
 * answer scoped to this very project that allows `summary` grants; anything
 * else, including an answer for the account alone, grants nothing.
 *
 * @param answer - The server's answer, as received.
 * @param subject - The signed-in account and the project the host serves.
 * @returns The grant, or `undefined`.
 * @public
 */
export const summaryGrantOf = (
  answer: EffectivePurposesAnswer,
  subject: Readonly<{ principal: string; project: string }>,
): ReportingGrant | undefined => {
  const summary = answer.purposes.find((state) => state.purpose === 'summary');
  if (answer.projectId !== subject.project || summary?.allowed !== true || answer.epoch === '') {
    return undefined;
  }
  /* The answer does not say the account's protection; `unknown` is the strictest claim, and the API only tightens it. */
  return { principal: subject.principal, project: subject.project, policyEpoch: answer.epoch, protection: 'unknown' };
};

/** What the reporter held back or could not do, counted by reason, beside its outbox's counts. @public */
export type ReporterCoverage = Readonly<{
  /** Envelopes handed to the outbox. */
  projected: number;
  /** Facts another device led; that device reports them. */
  foreign: number;
  /** Runs still unended here whose newest rows another device wrote: a gap this device cannot fill. */
  openForeignTails: number;
  /** Facts that happened before this reporter saw the grant; never backfilled. */
  beforeGrant: number;
  /** Facts not yet settled when last seen. */
  pending: number;
  /** Runs seen while the server granted nothing. */
  ungranted: number;
  /** Runs seen while the grant could not be read; none of them was projected. */
  unknownGrant: number;
  /** Where the last drain stopped. */
  stop: DrainStop | undefined;
  outbox: OutboxCounts;
}>;

/** What a reporter is built from. @public */
export type EvidenceReporterOptions = Readonly<{
  outbox: EvidenceOutbox;
  /** The server's current answer; rejects when it cannot be read. Never a cached or local default. */
  grant: () => Promise<ReportingGrant | undefined>;
  /** This host's uploader id. */
  uploader: string;
  hostBuild: string | undefined;
  now: () => number;
  toolClass?: ProjectionContext['toolClass'];
  /** Run `callback` after `milliseconds`; answers its cancel. `setTimeout` when absent. */
  schedule?: (callback: () => void, milliseconds: number) => () => void;
}>;

/** A host's evidence reporter. @public */
export type EvidenceReporter = Readonly<{
  /** Read the grant and bind to it, without projecting anything: what a host does when it starts. */
  refresh: () => Promise<void>;
  /**
   * Report a chat's runs as its committed rows say they are now. Reporting
   * the same rows again writes the same envelopes, which the outbox and the
   * API count once.
   */
  report: (runs: readonly ProjectedRun[], ownsEpoch: (leaderEpoch: string) => boolean) => Promise<void>;
  coverage: () => ReporterCoverage;
  /** Stop: cancel a scheduled retry and refuse further reports. What is held stays held for the next host. */
  close: () => void;
}>;

const sameScope = (left: DeliveryScope | undefined, right: DeliveryScope | undefined): boolean =>
  left?.principal === right?.principal && left?.project === right?.project && left?.policyEpoch === right?.policyEpoch;

/** How many settled runs a reporter remembers; one it forgot is projected again and the API counts it once. */
const settledLimit = 4096;

const settledKey = (run: ProjectedRun): string => `${run.chatId}\u0000${run.runId}`;

const defaultSchedule = (callback: () => void, milliseconds: number): (() => void) => {
  const handle = setTimeout(callback, milliseconds);
  return () => {
    clearTimeout(handle);
  };
};

/**
 * Create a host's evidence reporter.
 *
 * - The grant is read on every report and refresh. A changed account, project
 *   or epoch rebinds the outbox, which purges what was held under the old one.
 * - No grant unbinds and purges. An unreadable grant projects nothing and
 *   sends nothing, and keeps what is held: the server rechecks before any send.
 * - A drain that is told to retry is tried again once, after the server's wait.
 *
 * @param options - Its outbox, grant source, identity and clock.
 * @returns The reporter.
 * @public
 */
export const createEvidenceReporter = (options: EvidenceReporterOptions): EvidenceReporter => {
  const { outbox, now } = options;
  const schedule = options.schedule ?? defaultSchedule;
  const counts = {
    projected: 0,
    foreign: 0,
    openForeignTails: 0,
    beforeGrant: 0,
    pending: 0,
    ungranted: 0,
    unknownGrant: 0,
  };
  /* `grantedAt` is when this reporter first saw the grant: never earlier than the grant itself. */
  let bound: (ReportingGrant & Readonly<{ grantedAt: number }>) | undefined;
  let stop: DrainStop | undefined;
  let cancelRetry: (() => void) | undefined;
  let closed = false;
  /* Runs reported whole under the bound scope, oldest first: a report of the same rows sends nothing again. */
  const settled = new Set<string>();
  /* Reports run one at a time: each reads the grant the one before it may have changed. */
  let chain: Promise<unknown> = Promise.resolve();

  /** Read the grant and bind to it; answers the binding, or `'unknown'` when the grant could not be read. */
  const bind = async (): Promise<typeof bound | 'unknown'> => {
    let grant: ReportingGrant | undefined;
    try {
      grant = await options.grant();
    } catch {
      return 'unknown';
    }
    if (closed) {
      return 'unknown';
    }
    if (grant === undefined) {
      /* Also on a host's first answer: what an earlier session held under a grant now gone is purged. */
      bound = undefined;
      await outbox.bind(undefined);
      return undefined;
    }
    if (!sameScope(bound, grant)) {
      bound = { ...grant, grantedAt: now() };
      settled.clear();
      await outbox.bind(grant);
    } else if (bound !== undefined && bound.protection !== grant.protection) {
      bound = { ...bound, protection: grant.protection };
    }
    return bound;
  };

  const queued = async (step: () => Promise<void>): Promise<void> => {
    const previous = chain;
    const next = (async () => {
      await previous;
      if (!closed) {
        await step();
      }
    })();
    chain = (async () => {
      try {
        await next;
      } catch {
        /* The step's caller is told; the next step runs all the same. */
      }
    })();
    return next;
  };

  const remember = (key: string): void => {
    settled.add(key);
    if (settled.size > settledLimit) {
      settled.delete(settled.values().next().value!);
    }
  };

  const drain = async (): Promise<void> => {
    cancelRetry?.();
    cancelRetry = undefined;
    const result = await outbox.drain();
    stop = result.stop;
    if (result.stop === 'retry' && !closed) {
      cancelRetry = schedule(() => {
        cancelRetry = undefined;
        void retry();
      }, result.retryAfterMilliseconds ?? 30_000);
    }
  };

  /* A failed retry is not retried again here: the next report or refresh drains. */
  const retry = async (): Promise<void> => {
    try {
      await queued(drain);
    } catch {
      stop = undefined;
    }
  };

  const reportNow = async (
    runs: readonly ProjectedRun[],
    ownsEpoch: (leaderEpoch: string) => boolean,
  ): Promise<void> => {
    const scope = await bind();
    if (scope === 'unknown') {
      counts.unknownGrant += runs.length;
      return;
    }
    if (scope === undefined) {
      counts.ungranted += runs.length;
      return;
    }
    const context: ProjectionContext = {
      principal: scope.principal,
      project: scope.project,
      policyEpoch: scope.policyEpoch,
      protection: scope.protection,
      uploader: options.uploader,
      ownsEpoch,
      grantedAt: scope.grantedAt,
      hostBuild: options.hostBuild,
      ...(options.toolClass === undefined ? {} : { toolClass: options.toolClass }),
    };
    const unsettled = runs.filter((run) => !settled.has(settledKey(run)));
    const projections = await Promise.all(unsettled.map(async (run) => projectRun(run, context)));
    for (const [index, projection] of projections.entries()) {
      if (projection.pending === 0 && !projection.foreignTails.some((tail) => tail.open)) {
        remember(settledKey(unsettled[index]!));
      }
      counts.projected += projection.evidence.length;
      counts.foreign += projection.foreign;
      counts.beforeGrant += projection.beforeGrant;
      counts.pending += projection.pending;
      counts.openForeignTails += projection.foreignTails.filter((tail) => tail.open).length;
    }
    await outbox.enqueue(projections.flatMap((projection) => projection.evidence));
    await drain();
  };

  return {
    refresh: async () =>
      queued(async () => {
        const scope = await bind();
        if (scope !== undefined && scope !== 'unknown') {
          await drain();
        }
      }),
    report: async (runs, ownsEpoch) => queued(async () => reportNow(runs, ownsEpoch)),
    coverage: () => ({ ...counts, stop, outbox: outbox.report() }),
    close: () => {
      closed = true;
      cancelRetry?.();
      cancelRetry = undefined;
    },
  };
};
