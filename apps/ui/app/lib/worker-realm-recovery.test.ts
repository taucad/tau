// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkerCodeLoadError } from '@taucad/ui-core/lib/worker-factory';

const recover = vi.hoisted(() => ({ calls: [] as unknown[], verdict: 'live' as string }));
vi.mock('#lib/stale-build-recovery.js', () => ({
  recoverFromStaleBuild: async (failure: unknown) => {
    recover.calls.push(failure);
    return 'reloading';
  },
}));
vi.mock('#filesystem/build-skew.js', () => ({ readServerVerdict: () => recover.verdict }));

const {
  noteWorkerCodeLoadFailure,
  resetWorkerRealmRecovery,
  workerFailureWindow,
  workerReplacement,
  workerReplacementBackoff,
  workerReplacementBound,
} = await import('#lib/worker-realm-recovery.js');

const failure = (): WorkerCodeLoadError =>
  new WorkerCodeLoadError(
    'agent-host',
    new TypeError('Failed to fetch dynamically imported module: https://tau.new/assets/agent-host.impl-BuKhIGu5.js'),
  );

afterEach(() => {
  resetWorkerRealmRecovery();
  recover.calls.length = 0;
  recover.verdict = 'live';
});

describe('worker realm recovery (FP10)', () => {
  it('should replace a worker at once after its first failure, then after a backoff', () => {
    noteWorkerCodeLoadFailure(failure(), 0);
    expect(workerReplacement('agent-host', 0)).toStrictEqual({
      replace: true,
      replacementDelay: workerReplacementBackoff[0],
    });

    noteWorkerCodeLoadFailure(failure(), 10);
    expect(workerReplacement('agent-host', 10)).toStrictEqual({
      replace: true,
      replacementDelay: workerReplacementBackoff[1],
    });
    expect(recover.calls).toHaveLength(0);
  });

  it('should stop replacing at the bound and hand the failure to the page’s recovery', () => {
    const last = failure();
    for (let index = 1; index < workerReplacementBound; index += 1) {
      noteWorkerCodeLoadFailure(failure(), index);
    }
    noteWorkerCodeLoadFailure(last, workerReplacementBound);

    expect(workerReplacement('agent-host', workerReplacementBound)).toStrictEqual({ replace: false });
    expect(recover.calls).toStrictEqual([last]);
  });

  it('should hand a failure to the page at once when a deploy replaced this build', () => {
    recover.verdict = 'replaced';
    const replaced = failure();

    noteWorkerCodeLoadFailure(replaced, 0);

    expect(workerReplacement('agent-host', 0)).toStrictEqual({ replace: false });
    expect(recover.calls).toStrictEqual([replaced]);
  });

  it('should count each worker on its own, and forget failures older than the window', () => {
    noteWorkerCodeLoadFailure(failure(), 0);
    noteWorkerCodeLoadFailure(failure(), 1);

    expect(workerReplacement('file-manager', 2)).toStrictEqual({ replace: true, replacementDelay: 0 });
    expect(workerReplacement('agent-host', workerFailureWindow + 2)).toStrictEqual({
      replace: true,
      replacementDelay: 0,
    });
  });
});
