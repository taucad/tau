import { describe, expect, it } from 'vitest';
import { RevisionPortError } from '@taucad/revisions';
import type { RevisionPort } from '@taucad/revisions';

import {
  gateRevisionEngine,
  observeRevisionEngineFailures,
  revisionEngineFailureOf,
  revisionEngineMaxRetryMilliseconds,
} from '#revision-engine-failures.js';
import type { RevisionEngineFailure } from '#revision-engine-failures.js';

const worktreeFailure = (): RevisionPortError =>
  new RevisionPortError('ENGINE_FAILED', 'Native Git failed worktree.', {
    cause: new Error("fatal: '/home/someone/checkouts/a' already exists"),
  });

/* Only the members a case calls; the rest of the port is never read. */
// oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a test double carries only the members its case calls.
const portWith = (members: Record<string, unknown>): RevisionPort => Object.freeze(members) as unknown as RevisionPort;

describe('revisionEngineFailureOf', () => {
  it('should read the code, the sentence and the cause of an engine failure', () => {
    expect(revisionEngineFailureOf(worktreeFailure())).toEqual({
      code: 'ENGINE_FAILED',
      message: 'Native Git failed worktree.',
      detail: "fatal: '/home/someone/checkouts/a' already exists",
    });
  });

  it('should read an unavailable engine without a cause', () => {
    expect(
      revisionEngineFailureOf(new RevisionPortError('ENGINE_UNAVAILABLE', 'Native Git could not start status.')),
    ).toEqual({ code: 'ENGINE_UNAVAILABLE', message: 'Native Git could not start status.' });
  });

  it('should not read a refusal the product already explains', () => {
    expect(revisionEngineFailureOf(new RevisionPortError('REMOTE_NOT_FOUND', 'Gone.'))).toBeUndefined();
    expect(revisionEngineFailureOf(new Error('plain'))).toBeUndefined();
    expect(revisionEngineFailureOf('ENGINE_FAILED')).toBeUndefined();
  });
});

describe('observeRevisionEngineFailures', () => {
  it('should report an engine failure once and still reject with the same error', async () => {
    const reported: RevisionEngineFailure[] = [];
    const error = worktreeFailure();
    const port = observeRevisionEngineFailures(
      portWith({
        addCheckout: async () => {
          throw error;
        },
      }),
      (failure) => reported.push(failure),
    );

    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a test double carries only the members its case calls.
    await expect((port as unknown as { addCheckout: () => Promise<void> }).addCheckout()).rejects.toBe(error);
    expect(reported).toEqual([
      {
        code: 'ENGINE_FAILED',
        message: 'Native Git failed worktree.',
        detail: "fatal: '/home/someone/checkouts/a' already exists",
      },
    ]);
  });

  it('should pass results, other refusals and non-function members through untouched', async () => {
    const reported: RevisionEngineFailure[] = [];
    const refusal = new RevisionPortError('REMOTE_NOT_FOUND', 'Gone.');
    const port = observeRevisionEngineFailures(
      portWith({
        readRef: async (name: string) => `ref:${name}`,
        listRemotes: async () => {
          throw refusal;
        },
        label: 'native',
      }),
      (failure) => reported.push(failure),
    );
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a test double carries only the members its case calls.
    const members = port as unknown as {
      readRef: (name: string) => Promise<string>;
      listRemotes: () => Promise<void>;
      label: string;
    };

    await expect(members.readRef('main')).resolves.toBe('ref:main');
    await expect(members.listRemotes()).rejects.toBe(refusal);
    expect(members.label).toBe('native');
    expect(reported).toEqual([]);
  });

  it('should never fail a call because the reporter threw', async () => {
    const error = worktreeFailure();
    const port = observeRevisionEngineFailures(
      portWith({
        setHead: async () => {
          throw error;
        },
      }),
      () => {
        throw new Error('reporter down');
      },
    );

    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a test double carries only the members its case calls.
    await expect((port as unknown as { setHead: () => Promise<void> }).setHead()).rejects.toBe(error);
  });
});

describe('observeRevisionEngineFailures on a class instance', () => {
  it('should keep the methods the port inherits and call them on the port', async () => {
    class InheritedPort {
      public get label(): string {
        return 'inherited';
      }

      public async setHead(): Promise<string> {
        return this.label;
      }
    }
    const failures: RevisionEngineFailure[] = [];
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a test double carries only the members its case calls.
    const port = observeRevisionEngineFailures(new InheritedPort() as unknown as RevisionPort, (failure) => {
      failures.push(failure);
    });
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a test double carries only the members its case calls.
    await expect((port as unknown as { setHead: () => Promise<string> }).setHead()).resolves.toBe('inherited');
    expect(failures).toStrictEqual([]);
  });
});

type ReadHead = { readHead: () => Promise<string> };

/** A port whose `readHead` spawns git (counted) and fails to start while `broken`; the clock is the test's. */
const gatedFixture = () => {
  const clock = { now: 0 };
  const state = { broken: true, spawned: 0, unavailable: 0, available: 0 };
  const port = gateRevisionEngine(
    portWith({
      readHead: async () => {
        state.spawned += 1;
        if (state.broken) {
          throw new RevisionPortError('ENGINE_UNAVAILABLE', 'Native Git could not start worktree.', {
            cause: new Error('spawn git ENOENT'),
          });
        }
        return 'head';
      },
    }),
    {
      now: () => clock.now,
      onUnavailable: () => {
        state.unavailable += 1;
      },
      onAvailable: () => {
        state.available += 1;
      },
    },
  );
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a test double carries only the members its case calls.
  const readHead = async (): Promise<string> => (port as unknown as ReadHead).readHead();
  return { clock, state, readHead };
};

describe('gateRevisionEngine (I8)', () => {
  it('should start nothing during the wait and double the wait from 5 s to its 5 min cap', async () => {
    const { clock, state, readHead } = gatedFixture();
    const waits: number[] = [];
    await expect(readHead()).rejects.toMatchObject({ code: 'ENGINE_UNAVAILABLE' });
    expect(state.spawned).toBe(1);
    while (waits.length < 9) {
      /* A caller on a 1 s loop: every call inside the wait fails fast without spawning git. */
      let wait = 0;
      for (;;) {
        clock.now += 1000;
        wait += 1000;
        const { spawned } = state;
        // oxlint-disable-next-line no-await-in-loop -- one call per simulated second.
        await expect(readHead()).rejects.toMatchObject({ code: 'ENGINE_UNAVAILABLE' });
        if (state.spawned !== spawned) {
          break;
        }
      }
      waits.push(wait);
    }
    expect(waits).toStrictEqual([5000, 10_000, 20_000, 40_000, 80_000, 160_000, 300_000, 300_000, 300_000]);
  });

  it('should raise the unavailable state once, when the wait reaches its cap, and clear it on the next start', async () => {
    const { clock, state, readHead } = gatedFixture();
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      // oxlint-disable-next-line no-await-in-loop -- attempts are sequential by definition.
      await readHead().catch(() => undefined);
      clock.now += revisionEngineMaxRetryMilliseconds;
    }
    expect(state.unavailable).toBe(0);
    await readHead().catch(() => undefined);
    expect(state.unavailable).toBe(1);
    clock.now += revisionEngineMaxRetryMilliseconds;
    await readHead().catch(() => undefined);
    expect(state.unavailable).toBe(1);

    state.broken = false;
    clock.now += revisionEngineMaxRetryMilliseconds;
    await expect(readHead()).resolves.toBe('head');
    expect(state.available).toBe(1);
    /* Reset: the next failure waits 5 s again. */
    state.broken = true;
    await readHead().catch(() => undefined);
    clock.now += 5000;
    const { spawned } = state;
    await readHead().catch(() => undefined);
    expect(state.spawned).toBe(spawned + 1);
  });

  it('should count calls already running when one failed as that one attempt', async () => {
    const { clock, state, readHead } = gatedFixture();
    await Promise.all([readHead(), readHead(), readHead()].map(async (call) => call.catch(() => undefined)));
    expect(state.spawned).toBe(3);
    clock.now += 5000;
    const { spawned } = state;
    await readHead().catch(() => undefined);
    /* One doubling, not three: the 5 s wait has passed and the call reached git. */
    expect(state.spawned).toBe(spawned + 1);
  });

  it('should treat git that started and failed as an engine that is there', async () => {
    const clock = { now: 0 };
    let unavailable = true;
    let spawned = 0;
    const port = gateRevisionEngine(
      portWith({
        readHead: async () => {
          spawned += 1;
          throw unavailable
            ? new RevisionPortError('ENGINE_UNAVAILABLE', 'Native Git could not start rev-parse.')
            : worktreeFailure();
        },
      }),
      { now: () => clock.now, onUnavailable: () => undefined, onAvailable: () => undefined },
    );
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a test double carries only the members its case calls.
    const readHead = async (): Promise<string> => (port as unknown as ReadHead).readHead();
    await readHead().catch(() => undefined);
    clock.now += 5000;
    unavailable = false;
    await expect(readHead()).rejects.toMatchObject({ code: 'ENGINE_FAILED' });
    /* No wait after a run that reached git. */
    await expect(readHead()).rejects.toMatchObject({ code: 'ENGINE_FAILED' });
    expect(spawned).toBe(3);
  });
});
