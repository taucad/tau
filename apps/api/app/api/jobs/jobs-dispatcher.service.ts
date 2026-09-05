import { setTimeout } from 'node:timers/promises';
import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { JobOrchestratorDispatchOutcome } from '#api/jobs/job-orchestrator.service.js';
import { JobOrchestratorService } from '#api/jobs/job-orchestrator.service.js';
import { JobsService } from '#api/jobs/jobs.service.js';

@Injectable()
export class JobsDispatcherService implements OnModuleInit, OnModuleDestroy {
  readonly #logger = new Logger(JobsDispatcherService.name);
  readonly #shutdown = new AbortController();
  #closed: Promise<void> | undefined;

  public constructor(
    private readonly jobs: JobsService,
    private readonly orchestrator: JobOrchestratorService,
  ) {}

  public onModuleInit(): void {
    this.#closed = this.run();
  }

  public async onModuleDestroy(): Promise<void> {
    this.#shutdown.abort();
    await this.#closed;
  }

  private async run(): Promise<void> {
    while (!this.#shutdown.signal.aborted) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- one owner drains dispatch and cancellation work sequentially.
        const worked = (await this.reapOne()) || (await this.dispatchOne()) || (await this.cancelOne());
        if (!worked) {
          // oxlint-disable-next-line no-await-in-loop -- bounded idle poll wakes on shutdown.
          await setTimeout(500, undefined, { signal: this.#shutdown.signal });
        }
      } catch (error) {
        // oxlint-disable-next-line typescript/no-unnecessary-condition -- the signal can abort during any awaited iteration step.
        if (this.#shutdown.signal.aborted) {
          return;
        }
        this.#logger.error({ err: error }, 'Durable job dispatcher iteration failed');
        try {
          // oxlint-disable-next-line no-await-in-loop -- failure backoff prevents a hot loop.
          await setTimeout(1000, undefined, { signal: this.#shutdown.signal });
        } catch {
          return;
        }
      }
    }
  }

  private async reapOne(): Promise<boolean> {
    return this.jobs.reapExpiredAttempt();
  }

  private async dispatchOne(): Promise<boolean> {
    const claim = await this.jobs.claimDispatch();
    if (!claim) {
      return false;
    }
    let outcome: JobOrchestratorDispatchOutcome;
    try {
      outcome = await this.orchestrator.dispatch(claim);
    } catch (error) {
      outcome = { dispatched: false, retryable: true, message: String(error) };
    }
    await this.jobs.reportDispatch({ claim, outcome });
    return true;
  }

  private async cancelOne(): Promise<boolean> {
    const claim = await this.jobs.claimCancellation();
    if (!claim) {
      return false;
    }
    try {
      const sent = await this.orchestrator.cancel(claim.orchestratorRunId);
      if (!sent) {
        await this.jobs.releaseCancellation(claim.jobId);
      }
    } catch (error) {
      this.#logger.warn({ err: error, jobId: claim.jobId }, 'Durable job cancellation dispatch failed');
      await this.jobs.releaseCancellation(claim.jobId);
    }
    return true;
  }
}
