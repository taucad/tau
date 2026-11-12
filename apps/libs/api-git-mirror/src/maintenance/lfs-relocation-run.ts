import type { ObjectStorageService } from '@taucad/api-object-storage';
import { lfsObjectLocations } from '@taucad/api-git-core/lfs-keys';
import type { LfsReservation } from '#maintenance/lfs-reservation-scope.js';
import { parseConcurrency } from '#maintenance/lfs-reservation-scope.js';

/*
 * The `relocate-lfs` operator run around `relocateLegacyLfsObjects`: which
 * projects to visit, a read-only survey of where each one's bytes are, and a
 * bounded pool that relocates only the projects that still hold a legacy key.
 * Dry run unless the operator confirms.
 */

/** One project that holds LFS reservations in this account. */
export type LfsRelocationProject = { readonly ownerId: string; readonly projectId: string };

/** One LFS reservation of a project, as the survey reads it. */
export type LfsRelocationRow = { readonly oid: string; readonly size: number };

/** One project to visit, with its reservations in `oid` order. */
export type LfsRelocationTarget = LfsRelocationProject & { readonly rows: readonly LfsRelocationRow[] };

/**
 * Where one project's reserved bytes are, read with HEADs only.
 *
 * `legacyOnly` still needs its copy; `both` was copied and still needs its
 * legacy delete (an interrupted earlier run); `tenantOnly` is done; `missing`
 * is a reservation with bytes at neither key (an upload that never finished,
 * or lost bytes). `legacyBytes` and `largestLegacyBytes` cover `legacyOnly`.
 */
export type LfsRelocationSurvey = {
  readonly objects: number;
  readonly legacyOnly: number;
  readonly both: number;
  readonly tenantOnly: number;
  readonly missing: number;
  readonly legacyBytes: number;
  readonly largestLegacyBytes: number;
};

/** One project's line in a relocation run. */
export type LfsRelocationOutcome = LfsRelocationSurvey & {
  readonly event: 'revisions_maintenance.lfs_relocation';
  readonly ownerId: string;
  readonly projectId: string;
  /** `planned`: a dry run found legacy keys; `relocated`: a confirmed run moved them; `clean`: nothing to move. */
  readonly outcome: 'planned' | 'relocated' | 'clean' | 'failed';
  readonly moved: number;
  readonly error?: string;
  /** Projects finished so far, this one included. */
  readonly done: number;
  /**
   * Pass as `--after` to resume a confirmed run: every project up to and
   * including it finished without failing. A dry run moves nothing, so it
   * never carries one.
   */
  readonly resumeAfter?: string;
};

/** The run's last line. */
export type LfsRelocationSummary = {
  readonly event: 'revisions_maintenance.lfs_relocation_summary';
  readonly dryRun: boolean;
  readonly interrupted: boolean;
  readonly projects: number;
  readonly withLegacy: number;
  readonly legacyObjects: number;
  readonly legacyBytes: number;
  readonly moved: number;
  readonly missing: number;
  readonly failed: readonly string[];
  readonly resumeAfter?: string;
};

/** Worker bounds per mode: a survey only HEADs, a relocation buffers whole objects. */
export const lfsRelocationConcurrency = {
  dryRun: { default: 4, max: 16 },
  /* `relocateLegacyLfsObjects` buffers each object whole (up to 100 MiB) and
     the tau-maintenance Machine has 512 MB, so a confirmed run moves one
     project at a time. */
  confirm: { default: 1, max: 1 },
} as const;

/**
 * The relocation's worker count, checked against its mode's bound.
 *
 * @param value - The operator's `--concurrency`, or `undefined` for the default.
 * @param confirm - Whether the run moves bytes.
 * @returns The worker count.
 * @throws RangeError - When the value is not a whole number within the bound.
 */
export const parseLfsRelocationConcurrency = (value: string | undefined, confirm: boolean): number =>
  confirm
    ? parseConcurrency(value, lfsRelocationConcurrency.confirm, ' with --confirm')
    : parseConcurrency(value, lfsRelocationConcurrency.dryRun);

/**
 * Groups reservation pages (in `(projectId, oid)` order) into one target per
 * project; a project whose rows span a page boundary is yielded once, whole.
 *
 * @param pages - The reservations, from `activeLfsReservationPages`.
 * @yields One project with its reservations at a time.
 */
export async function* lfsRelocationProjects(
  pages: AsyncIterable<readonly LfsReservation[]>,
): AsyncGenerator<LfsRelocationTarget> {
  let current: { ownerId: string; projectId: string; rows: LfsRelocationRow[] } | undefined;
  for await (const page of pages) {
    for (const row of page) {
      if (current?.projectId !== row.projectId) {
        if (current !== undefined) {
          yield current;
        }
        current = { ownerId: row.ownerId, projectId: row.projectId, rows: [] };
      }
      current.rows.push({ oid: row.oid, size: row.size });
    }
  }
  if (current !== undefined) {
    yield current;
  }
}

/**
 * Where one project's reserved bytes are, without a lock or a write.
 *
 * @param storage - The storage driver.
 * @param target - The project and its reservations.
 * @returns The project's counts.
 */
export const surveyLegacyLfsObjects = async (
  storage: Pick<ObjectStorageService, 'headBlob'>,
  target: LfsRelocationTarget,
): Promise<LfsRelocationSurvey> => {
  let legacyOnly = 0;
  let both = 0;
  let tenantOnly = 0;
  let missing = 0;
  let legacyBytes = 0;
  let largestLegacyBytes = 0;
  /* oxlint-disable no-await-in-loop -- one project's HEADs in sequence; projects run in parallel */
  for (const row of target.rows) {
    const [tenant, legacy] = lfsObjectLocations(target.ownerId, target.projectId, row.oid);
    const held = await storage.headBlob({ ...legacy, signal: AbortSignal.timeout(5000) });
    const copied = await storage.headBlob({ ...tenant, signal: AbortSignal.timeout(5000) });
    if (held !== undefined && copied !== undefined) {
      both += 1;
    } else if (held !== undefined) {
      legacyOnly += 1;
      legacyBytes += row.size;
      largestLegacyBytes = Math.max(largestLegacyBytes, row.size);
    } else if (copied === undefined) {
      missing += 1;
    } else {
      tenantOnly += 1;
    }
  }
  /* oxlint-enable no-await-in-loop -- end of the survey loop */
  return { objects: target.rows.length, legacyOnly, both, tenantOnly, missing, legacyBytes, largestLegacyBytes };
};

const emptySurvey: LfsRelocationSurvey = {
  objects: 0,
  legacyOnly: 0,
  both: 0,
  tenantOnly: 0,
  missing: 0,
  legacyBytes: 0,
  largestLegacyBytes: 0,
};

/**
 * The `relocate-lfs` run: survey every project, and with `confirm` relocate
 * the ones that still hold a legacy key, `concurrency` projects at a time.
 *
 * Resumable twice over. `relocateLegacyLfsObjects` is idempotent per object,
 * so a rerun finishes what an interrupted one left; and each line of a
 * confirmed run carries `resumeAfter`, the last project up to which nothing is
 * unfinished or failed, for `--after` to skip that prefix. A failed project is
 * reported and the run goes on; it stays listed in the summary and holds
 * `resumeAfter` back. A stop signal lets in-flight projects finish and starts
 * no more. If reporting a line throws, no worker takes another project, the
 * ones in flight settle, and the error is rethrown without a summary.
 *
 * @param dependencies - The projects to visit (in `projectId` order), the driver and the relocation.
 * @param options - Whether to move bytes, the worker count, the line sink and a stop signal.
 * @returns The run's summary, which is also reported as the last line.
 */
export const relocateLegacyLfsInventory = async (
  dependencies: {
    readonly projects: AsyncIterable<LfsRelocationTarget>;
    readonly storage: Pick<ObjectStorageService, 'headBlob'>;
    readonly relocate: (target: LfsRelocationProject) => Promise<{ moved: readonly string[] }>;
  },
  options: {
    readonly confirm: boolean;
    readonly concurrency: number;
    readonly report: (line: string) => Promise<void>;
    readonly signal?: AbortSignal;
  },
): Promise<LfsRelocationSummary> => {
  const iterator = dependencies.projects[Symbol.asyncIterator]();
  const started: string[] = [];
  const succeeded = new Set<string>();
  let watermark = 0;
  let resumeAfter: string | undefined;
  const totals = { projects: 0, withLegacy: 0, legacyObjects: 0, legacyBytes: 0, moved: 0, missing: 0 };
  const failed: string[] = [];
  /** The first error a worker could not report as a project line; it stops every worker. */
  let fault: { readonly error: unknown } | undefined;

  const visit = async (target: LfsRelocationTarget): Promise<void> => {
    let survey = emptySurvey;
    let moved = 0;
    let outcome: LfsRelocationOutcome['outcome'];
    let failure: string | undefined;
    try {
      survey = await surveyLegacyLfsObjects(dependencies.storage, target);
      if (survey.legacyOnly + survey.both === 0) {
        outcome = 'clean';
      } else if (options.confirm) {
        const relocated = await dependencies.relocate({ ownerId: target.ownerId, projectId: target.projectId });
        moved = relocated.moved.length;
        outcome = 'relocated';
      } else {
        outcome = 'planned';
      }
    } catch (error) {
      outcome = 'failed';
      failure = error instanceof Error ? error.message : String(error);
    }

    const pending = survey.legacyOnly + survey.both;
    totals.projects += 1;
    totals.withLegacy += pending > 0 ? 1 : 0;
    totals.legacyObjects += pending;
    totals.legacyBytes += survey.legacyBytes;
    totals.moved += moved;
    totals.missing += survey.missing;
    if (outcome === 'failed') {
      failed.push(target.projectId);
    } else {
      succeeded.add(target.projectId);
    }
    // Projects start in `projectId` order; the cursor advances over the finished, unfailed prefix.
    while (watermark < started.length && succeeded.has(started[watermark]!)) {
      resumeAfter = started[watermark];
      watermark += 1;
    }

    const line: LfsRelocationOutcome = {
      event: 'revisions_maintenance.lfs_relocation',
      ownerId: target.ownerId,
      projectId: target.projectId,
      outcome,
      ...survey,
      moved,
      ...(failure === undefined ? {} : { error: failure }),
      done: totals.projects,
      ...(options.confirm && resumeAfter !== undefined ? { resumeAfter } : {}),
    };
    await options.report(JSON.stringify(line));
  };

  const stopped = (): boolean => fault !== undefined || options.signal?.aborted === true;

  const worker = async (): Promise<void> => {
    try {
      /* oxlint-disable no-await-in-loop -- each worker takes the next project when it is free; that is the bound */
      while (!stopped()) {
        const next = await iterator.next();
        // The stop may have come while the next page was read.
        if (next.done === true || stopped()) {
          return;
        }
        started.push(next.value.projectId);
        await visit(next.value);
      }
      /* oxlint-enable no-await-in-loop -- end of the worker loop */
    } catch (error) {
      fault ??= { error };
    }
  };

  try {
    // Workers never reject: each records its fault and every other worker stops after its project in flight.
    await Promise.all(Array.from({ length: options.concurrency }, worker));
  } finally {
    await iterator.return?.();
  }
  if (fault !== undefined) {
    throw fault.error;
  }

  const summary: LfsRelocationSummary = {
    event: 'revisions_maintenance.lfs_relocation_summary',
    dryRun: !options.confirm,
    interrupted: options.signal?.aborted === true,
    ...totals,
    failed: failed.toSorted(),
    ...(options.confirm && resumeAfter !== undefined ? { resumeAfter } : {}),
  };
  await options.report(JSON.stringify(summary));
  return summary;
};
