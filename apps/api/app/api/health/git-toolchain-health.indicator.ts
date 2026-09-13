/* oxlint-disable new-cap, typescript-eslint/consistent-type-imports -- NestJS DI requires runtime imports for constructor injection */
import { spawn } from 'node:child_process';
import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import type { HealthIndicatorResult } from '@nestjs/terminus';

const probe = async (args: readonly string[]): Promise<string | undefined> =>
  new Promise((resolve) => {
    const child = spawn('git', [...args], { stdio: ['ignore', 'pipe', 'ignore'] });
    const chunks: Array<Uint8Array<ArrayBuffer>> = [];
    child.stdout.on('data', (chunk: Uint8Array<ArrayBuffer>) => chunks.push(chunk));
    child.on('error', () => {
      resolve(undefined);
    });
    child.on('close', (code) => {
      resolve(code === 0 ? Buffer.concat(chunks).toString('utf8').trim() : undefined);
    });
  });

/**
 * The Tau Hosted Remote is git's own binaries behind HTTP (EQ13). An image
 * without `git` or `git-lfs` can still answer every other route, so the honest
 * failure is a readiness refusal named by the missing binary rather than a
 * push that fails halfway — the server-side half of W9's early named refusal.
 *
 * Binaries do not appear at runtime, so the probe runs once per process.
 */
const probeVersions = async (): Promise<{ git: string | undefined; lfs: string | undefined }> => {
  const git = await probe(['--version']);
  const lfs = await probe(['lfs', 'version']);
  return { git, lfs };
};

@Injectable()
export class GitToolchainHealthIndicator {
  #versions: Promise<{ git: string | undefined; lfs: string | undefined }> | undefined;

  public constructor(private readonly healthIndicatorService: HealthIndicatorService) {}

  public async isHealthy(): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check('git');
    this.#versions ??= probeVersions();
    const { git, lfs } = await this.#versions;

    if (git === undefined) {
      return indicator.down({ message: 'git is not installed in this image' });
    }
    if (lfs === undefined) {
      return indicator.down({ git, message: 'git-lfs is not installed in this image' });
    }
    return indicator.up({ git, lfs });
  }
}
