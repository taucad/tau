import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { ConfigService } from '@nestjs/config';
import { HealthIndicatorService } from '@nestjs/terminus';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Environment } from '#config/environment.config.js';
import { GitToolchainHealthIndicator } from '#api/health/git-toolchain-health.indicator.js';

/**
 * DC3: once git is forwarded to tau-storage, the API image no longer needs
 * git, so readiness must not refuse a Machine for lacking it. In process, the
 * API still runs git and still refuses without it, as before.
 */
describe('GitToolchainHealthIndicator', () => {
  const originalPath = process.env['PATH'];
  let emptyPath: string;

  beforeEach(() => {
    /* A PATH that holds no git at all: what the API image is once it drops git. */
    emptyPath = mkdtempSync(path.join(tmpdir(), 'tau-no-git-'));
    process.env['PATH'] = emptyPath;
  });

  afterEach(() => {
    process.env['PATH'] = originalPath;
    rmSync(emptyPath, { recursive: true, force: true });
  });

  const indicator = (storageUrl: string | undefined): GitToolchainHealthIndicator =>
    new GitToolchainHealthIndicator(
      new HealthIndicatorService(),
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variable name
      new ConfigService({ TAU_STORAGE_URL: storageUrl }) as unknown as ConfigService<Environment, true>,
    );

  it('should be up without git when git is forwarded to tau-storage', async () => {
    const result = await indicator('http://tau-storage.flycast').isHealthy();
    expect(result['git']?.status).toBe('up');
    expect(result['git']).toMatchObject({ execution: 'forwarded' });
  });

  it('should still refuse without git when git runs in this process', async () => {
    const result = await indicator(undefined).isHealthy();
    expect(result['git']?.status).toBe('down');
  });
});
