/* oxlint-disable new-cap, @typescript-eslint/consistent-type-imports -- NestJS decorators are factories and DI metadata needs runtime class imports */
import { Injectable, Logger, Optional } from '@nestjs/common';
import type { OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { and, asc, eq, isNull, lt, sql } from 'drizzle-orm';
import { DatabaseService } from '#database/database.service.js';
import { project, projectDeletion, projectGit } from '#database/schema.js';
import { RedisService } from '#redis/redis.service.js';
import { GitRepositoryService } from '#api/git/git.service.js';

/**
 * Repairs the derived state of idle repositories (DC1; W9 review FR5).
 *
 * Every grant carries the derived generation this API recorded, so any
 * request to a repository repairs it. A repository nobody touches again is
 * repaired here instead: once a minute, one API Machine (a Redis lock) picks
 * the rows whose `derived_generation` has trailed `generation` for over a
 * minute and asks tau-storage to `derive` each, applying the receipt like any
 * other. A seeded lagging row is therefore repaired within two scans, well
 * inside the ten minutes DC1 promises.
 */

/** How often a scan runs. */
export const deriveScanIntervalMilliseconds = 60_000;

/** A row must have trailed this long before a scan repairs it, so a push's own receipt goes first. */
export const deriveLagGraceSeconds = 60;

/** Repairs one scan attempts; the rest wait for the next. */
export const repairsPerScan = 25;

/** The first wait after a failed repair; it doubles with each failure in a row. */
export const repairBackoffBaseMilliseconds = deriveScanIntervalMilliseconds;

/** The longest a failing row waits between attempts. */
export const repairBackoffMaximumMilliseconds = 60 * 60 * 1000;

/** The most backed-off rows a scan reads past; beyond it, the oldest waits are what a scan skips. */
const backoffReadLimit = 1000;

/**
 * Which rows' last repair failed, and when each may be tried again (review
 * S5): without it, 25 rows that never repair would fill every scan and starve
 * the rest. Process-local: the scan lock moves between Machines, and a row a
 * new holder retries once more before backing off costs one repair.
 */
export class RepairBackoff {
  readonly #waits = new Map<string, { readonly failures: number; readonly until: number }>();

  /** Records a failed repair; the row waits `base × 2^(failures − 1)`, capped. */
  public failed(projectId: string, now: number): void {
    const failures = (this.#waits.get(projectId)?.failures ?? 0) + 1;
    const wait = Math.min(repairBackoffBaseMilliseconds * 2 ** (failures - 1), repairBackoffMaximumMilliseconds);
    this.#waits.set(projectId, { failures, until: now + wait });
  }

  /** Forgets a row once it repaired. */
  public succeeded(projectId: string): void {
    this.#waits.delete(projectId);
  }

  /** Whether a row is still waiting out its backoff. */
  public waiting(projectId: string, now: number): boolean {
    return (this.#waits.get(projectId)?.until ?? 0) > now;
  }

  /** Rows waiting now, which a scan reads past (at most {@link backoffReadLimit}). */
  public waitingCount(now: number): number {
    let count = 0;
    for (const wait of this.#waits.values()) {
      if (wait.until > now) {
        count += 1;
      }
    }
    return Math.min(count, backoffReadLimit);
  }
}

const lockKey = 'git:derive-scheduler';

@Injectable()
export class DeriveScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  readonly #logger = new Logger(DeriveScheduler.name);
  readonly #backoff = new RepairBackoff();
  #timer: NodeJS.Timeout | undefined;
  #running: Promise<number> | undefined;

  public constructor(
    private readonly databaseService: DatabaseService,
    private readonly repositories: GitRepositoryService,
    @Optional() private readonly redis?: RedisService,
  ) {}

  public onApplicationBootstrap(): void {
    this.#timer = setInterval(() => {
      void this.scan();
    }, deriveScanIntervalMilliseconds);
    this.#timer.unref();
  }

  public async onModuleDestroy(): Promise<void> {
    clearInterval(this.#timer);
    await this.#running;
  }

  /**
   * One scan: claims the scan lock, then repairs up to 25 lagging rows, oldest
   * first, passing over rows whose last repair failed until their backoff ends.
   *
   * @param options - `graceSeconds` overrides the lag a row must show (the suites use 0).
   * @returns How many repositories a receipt was applied for.
   */
  public async scan(options: { readonly graceSeconds?: number } = {}): Promise<number> {
    if (this.#running !== undefined) {
      return 0;
    }
    const running = (async (): Promise<number> => {
      try {
        return await this.#scan(options.graceSeconds ?? deriveLagGraceSeconds);
      } finally {
        this.#running = undefined;
      }
    })();
    this.#running = running;
    return running;
  }

  async #scan(graceSeconds: number): Promise<number> {
    try {
      if (
        this.redis !== undefined &&
        (await this.redis.client.set(lockKey, '1', 'PX', deriveScanIntervalMilliseconds - 5000, 'NX')) !== 'OK'
      ) {
        return 0;
      }
      const now = Date.now();
      const candidates = await this.databaseService.database
        .select({ projectId: projectGit.projectId, ownerId: project.ownerId })
        .from(projectGit)
        .innerJoin(project, eq(project.id, projectGit.projectId))
        .leftJoin(projectDeletion, eq(projectDeletion.projectId, projectGit.projectId))
        .where(
          and(
            lt(projectGit.derivedGeneration, projectGit.generation),
            isNull(projectDeletion.deletedAt),
            sql`${projectGit.updatedAt} < now() - make_interval(secs => ${graceSeconds})`,
          ),
        )
        .orderBy(asc(projectGit.updatedAt))
        .limit(repairsPerScan + this.#backoff.waitingCount(now));
      const lagging = candidates
        .filter((target) => !this.#backoff.waiting(target.projectId, now))
        .slice(0, repairsPerScan);
      let applied = 0;
      for (const target of lagging) {
        try {
          // oxlint-disable-next-line no-await-in-loop -- one repair at a time keeps the scan's cost on tau-storage flat
          if ((await this.repositories.repairDerivedState(target)) === 'applied') {
            applied += 1;
            this.#backoff.succeeded(target.projectId);
          } else {
            /* The row still trails after this attempt, so trying it every minute would only repeat it. */
            this.#backoff.failed(target.projectId, Date.now());
          }
        } catch (error) {
          this.#backoff.failed(target.projectId, Date.now());
          this.#logger.warn({ err: error, projectId: target.projectId }, 'A scheduled derived-state repair failed');
        }
      }
      if (candidates.length > 0) {
        this.#logger.log(
          { candidates: candidates.length, attempted: lagging.length, applied },
          'Scheduled derived-state repair',
        );
      }
      return applied;
    } catch (error) {
      this.#logger.warn({ err: error }, 'The derived-state scan failed');
      return 0;
    }
  }
}
