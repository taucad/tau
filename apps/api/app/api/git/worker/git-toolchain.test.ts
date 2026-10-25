import { describe, expect, it, vi } from 'vitest';
import type { GitToolchain } from '#api/git/worker/git-toolchain.js';
import { gitVersionProbe } from '#api/git/worker/git-toolchain.js';

/**
 * DC3 review: tau-storage's readiness refuses a Machine without git. A probe
 * that failed once (a spawn that hit EAGAIN, a slow boot) must not refuse it
 * for the life of the process: only a found git is kept.
 */
describe('gitVersionProbe', () => {
  it('should probe again after a failed probe, and keep the first git it finds', async () => {
    const answers: GitToolchain[] = [
      { git: undefined, lfs: undefined },
      { git: 'git version 2.47.0', lfs: undefined },
    ];
    const probe = vi.fn(async (): Promise<GitToolchain> => answers.shift() ?? { git: 'unexpected', lfs: undefined });
    const gitVersion = gitVersionProbe(probe);

    expect(await gitVersion()).toBeUndefined();
    expect(await gitVersion()).toBe('git version 2.47.0');
    expect(await gitVersion()).toBe('git version 2.47.0');
    expect(probe).toHaveBeenCalledTimes(2);
    expect(probe).toHaveBeenCalledWith(false);
  });
});
