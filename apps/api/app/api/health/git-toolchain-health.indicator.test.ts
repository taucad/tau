import { ConfigService } from '@nestjs/config';
import { HealthIndicatorService } from '@nestjs/terminus';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Environment } from '#config/environment.config.js';
import { inProcessGitToolchain } from '#api/git/forwarding/in-process-executor.js';
import { GitToolchainHealthIndicator } from '#api/health/git-toolchain-health.indicator.js';

/* The probe is stubbed, never left to `PATH`: a runner with git anywhere it
   can resolve must not decide what this test sees. */
vi.mock('#api/git/forwarding/in-process-executor.js', () => ({
  inProcessGitToolchain: vi.fn(async () => ({ git: undefined, lfs: undefined })),
}));

/**
 * DC3: once git is forwarded to tau-storage, the API image no longer needs
 * git, so readiness must not refuse a Machine for lacking it. In process, the
 * API still runs git and still refuses without it, as before.
 */
describe('GitToolchainHealthIndicator', () => {
  beforeEach(() => {
    vi.mocked(inProcessGitToolchain).mockClear();
  });

  const indicator = (storageUrl: string | undefined): GitToolchainHealthIndicator =>
    new GitToolchainHealthIndicator(
      new HealthIndicatorService(),
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variable name
      new ConfigService<Environment, true>({ TAU_STORAGE_URL: storageUrl }),
    );

  it('should be up without git when git is forwarded to tau-storage, and never probe for it', async () => {
    const result = await indicator('http://tau-storage.flycast').isHealthy();
    expect(result['git']?.status).toBe('up');
    expect(result['git']).toMatchObject({ execution: 'forwarded' });
    expect(inProcessGitToolchain).not.toHaveBeenCalled();
  });

  it('should still refuse without git when git runs in this process', async () => {
    const result = await indicator(undefined).isHealthy();
    expect(result['git']?.status).toBe('down');
    expect(inProcessGitToolchain).toHaveBeenCalledOnce();
  });
});
