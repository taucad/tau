/* oxlint-disable new-cap, typescript-eslint/consistent-type-imports -- NestJS DI requires runtime imports for constructor injection */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthIndicatorService } from '@nestjs/terminus';
import type { HealthIndicatorResult } from '@nestjs/terminus';
import type { Environment } from '#config/environment.config.js';
import { inProcessGitToolchain } from '#api/git/forwarding/in-process-executor.js';

/**
 * The Tau Hosted Remote is git's own binaries behind HTTP (EQ13). Where those
 * binaries run decides what this Machine's readiness says about them (DC3):
 *
 * - **Forwarded** (`TAU_STORAGE_URL` set): git runs on tau-storage, whose own
 *   readiness refuses a Machine without it. This API spawns no git child, so a
 *   missing binary here is not a fault of this Machine and is never probed;
 *   the image can drop git.
 * - **In process** (unset): this API runs git and git-lfs itself, and an image
 *   without either is refused by name rather than failing a push halfway — the
 *   server-side half of W9's early named refusal. The probe comes through the
 *   in-process fallback, so it goes when that module does.
 *
 * Binaries do not appear at runtime, so the probe runs once per process.
 */
@Injectable()
export class GitToolchainHealthIndicator {
  #versions: ReturnType<typeof inProcessGitToolchain> | undefined;

  readonly #forwarded: boolean;

  public constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    config: ConfigService<Environment, true>,
  ) {
    /* The same rule `createGitExecution` decides the mode by: any address at all. */
    this.#forwarded = (config.get('TAU_STORAGE_URL', { infer: true }) ?? '')
      .split(',')
      .some((url) => url.trim() !== '');
  }

  public async isHealthy(): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check('git');
    if (this.#forwarded) {
      return indicator.up({ execution: 'forwarded' });
    }
    this.#versions ??= inProcessGitToolchain();
    const { git, lfs } = await this.#versions;

    if (git === undefined) {
      return indicator.down({ message: 'git is not installed in this image' });
    }
    if (lfs === undefined) {
      return indicator.down({ git, message: 'git-lfs is not installed in this image' });
    }
    return indicator.up({ git, lfs, execution: 'in_process' });
  }
}
