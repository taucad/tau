import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HatchetClient } from '@hatchet-dev/typescript-sdk/v1/index.js';
import type { JobDefinition } from '@taucad/jobs';
import { createHatchetJobTaskProfile, createHatchetOwnerAffinity, submitHatchetJob } from '@taucad/jobs-hatchet';
import type { Environment } from '#config/environment.config.js';

export type JobOrchestratorDispatchOutcome =
  | { readonly dispatched: true; readonly orchestratorRunId: string; readonly deduplicated: boolean }
  | { readonly dispatched: false; readonly retryable: boolean; readonly message: string };

@Injectable()
export class JobOrchestratorService {
  readonly #client: HatchetClient | undefined;

  public constructor(config: ConfigService<Environment, true>) {
    const token = config.get('HATCHET_CLIENT_TOKEN', { infer: true });
    if (!token) {
      return;
    }
    this.#client = new HatchetClient({
      token,
      namespace: config.get('HATCHET_CLIENT_NAMESPACE', { infer: true }),
    });
  }

  public async dispatch(input: {
    readonly ownerId: string;
    readonly jobId: string;
    readonly idempotencyKey: string;
    readonly definitionDigest: `sha256:${string}`;
    readonly definition: JobDefinition;
  }): Promise<JobOrchestratorDispatchOutcome> {
    if (!this.#client) {
      return { dispatched: false, retryable: true, message: 'Durable job orchestration is not configured.' };
    }
    const profile = createHatchetJobTaskProfile(input.definition);
    const job = {
      jobId: input.jobId,
      idempotencyKey: input.idempotencyKey,
      definitionDigest: input.definitionDigest,
      definition: input.definition,
    };
    const outcome = await submitHatchetJob({
      client: this.#client,
      profile,
      job,
      runtimeAffinity: createHatchetOwnerAffinity(input.ownerId),
    });
    if (!outcome.dispatched) {
      return { dispatched: false, retryable: false, message: outcome.message };
    }
    return {
      dispatched: true,
      orchestratorRunId: outcome.workflowRunId,
      deduplicated: outcome.deduplicated,
    };
  }

  public async cancel(orchestratorRunId: string): Promise<boolean> {
    if (!this.#client) {
      return false;
    }
    await this.#client.runs.cancel({ ids: [orchestratorRunId] });
    return true;
  }
}
