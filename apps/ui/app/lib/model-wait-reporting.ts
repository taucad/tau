import type { LargeObjectsFacet, ProjectReadiness } from '@taucad/revisions';
import type { ErrorDetails } from '#lib/error-details.js';
import { reportUiError } from '#lib/error-reporting.js';

/*
 * R7 (Brain research/new-project-viewer-stuck-downloading-blueprint.md, L9): a model surface that waits on the
 * project's large objects is reported to Sentry when the wait outlasts a bound without progress, and when the fill
 * fails. Silence read as waiting stayed invisible until a person saw it; these two reports make it visible.
 *
 * Low volume by construction. One report of each kind per wait, where a wait is one stretch of the selected
 * checkout's model gate: every new tree (a new write generation) drops readiness below `filled` and so opens a new
 * wait, and a mint does not. One watch also sends at most {@link modelWaitReportLimit} of each kind.
 */

/** How long a model gate may go without progress before it is reported. Milliseconds. */
export const modelWaitBoundMilliseconds = 30_000;

/** The most reports of each kind one watch sends. */
export const modelWaitReportLimit = 3;

/** A model surface gated past {@link modelWaitBoundMilliseconds} with no progress. */
export class ModelWaitStalled extends Error {
  public override readonly name = 'ModelWaitStalled';
}

/** A large-object fill that failed while a model surface waited on it. */
export class ModelFillFailure extends Error {
  public override readonly name = 'ModelFillFailure';
}

/** What one model surface waits on, as the page reads it. */
export type ModelWaitObservation = Readonly<{
  /** Whether the model gate is closed on the project's large objects: `filesChecking`, `files` or `filesFailed`. */
  gated: boolean;
  checkoutId: string | undefined;
  readiness: ProjectReadiness | undefined;
  facet: Pick<LargeObjectsFacet, 'phase' | 'objects' | 'totalObjects' | 'bytes' | 'totalBytes' | 'error'> | undefined;
}>;

type Kind = 'stalled' | 'failed';

/** A failure's reason without any address it names: a remote's URL is not diagnosis, and may carry a project's id. */
const redacted = (reason: string | undefined): string | undefined =>
  reason?.replaceAll(/[a-z][\d+.a-z-]*:\/\/\S+/giu, '<url>').slice(0, 300);

/** The fill's state for the report: `checking` while no download runs. */
const fillOf = (facet: ModelWaitObservation['facet']): string => facet?.phase ?? 'checking';

/** Progress is a change in what has arrived, or in the fill's phase. */
const progressOf = (observation: ModelWaitObservation): string =>
  observation.facet === undefined
    ? 'none'
    : `${observation.facet.phase}:${String(observation.facet.objects)}:${String(observation.facet.bytes)}`;

/**
 * Watch one project's model gate and report a wait that stalls or a fill that fails, once per wait.
 *
 * @param report - Where reports go; the page's error reporting by default.
 * @returns `observe`, called on every reading of the gate, and `dispose`, which ends the watch.
 */
export const createModelWaitReporter = (
  report: (error: Error, details: ErrorDetails) => unknown = reportUiError,
): Readonly<{ observe: (observation: ModelWaitObservation) => void; dispose: () => void }> => {
  /* The wait in progress: its checkout, when it began, what it has reported, and its last progress. */
  let wait:
    | {
        checkoutId: string | undefined;
        startedAt: number;
        reported: Set<Kind>;
        progress: string;
        latest: ModelWaitObservation;
      }
    | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  /* Reports sent by this watch, by kind ({@link modelWaitReportLimit}). */
  const sent: Record<Kind, number> = { stalled: 0, failed: 0 };

  const send = (kind: Kind, observation: ModelWaitObservation): void => {
    if (wait === undefined || wait.reported.has(kind) || sent[kind] >= modelWaitReportLimit) {
      return;
    }
    wait.reported.add(kind);
    sent[kind] += 1;
    const { facet, readiness } = observation;
    const fill = fillOf(facet);
    const waited = Date.now() - wait.startedAt;
    const error =
      kind === 'stalled'
        ? new ModelWaitStalled(`The model waited ${String(Math.round(waited / 1000))} s on its files (${fill})`)
        : new ModelFillFailure('The model files could not be downloaded');
    const reason = redacted(facet?.error);
    // async-iife: bootstrap -- reporting never rejects, and nothing waits on it.
    void report(error, {
      level: kind === 'stalled' ? 'warning' : 'error',
      tags: { 'revisions.fill': fill, ...(readiness === undefined ? {} : { 'revisions.readiness': readiness }) },
      contexts: {
        fill: {
          waitedMilliseconds: waited,
          ...(facet === undefined
            ? {}
            : {
                objects: facet.objects,
                totalObjects: facet.totalObjects,
                bytes: facet.bytes,
                totalBytes: facet.totalBytes,
              }),
          ...(reason === undefined ? {} : { reason }),
        },
      },
      fingerprint: ['model-wait', kind, fill],
    });
  };

  const arm = (): void => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      if (wait !== undefined) {
        send('stalled', wait.latest);
      }
    }, modelWaitBoundMilliseconds); // Bound: modelWaitBoundMilliseconds.
  };

  const end = (): void => {
    clearTimeout(timer);
    timer = undefined;
    wait = undefined;
  };

  const observe = (observation: ModelWaitObservation): void => {
    if (!observation.gated) {
      end();
      return;
    }
    const progress = progressOf(observation);
    if (wait === undefined || wait.checkoutId !== observation.checkoutId) {
      end();
      wait = {
        checkoutId: observation.checkoutId,
        startedAt: Date.now(),
        reported: new Set(),
        progress,
        latest: observation,
      };
      arm();
    } else if (wait.progress !== progress) {
      wait.progress = progress;
      arm();
    }
    wait.latest = observation;
    if (observation.facet?.phase === 'failed') {
      send('failed', observation);
    }
  };

  return { observe, dispose: end };
};
