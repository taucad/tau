import { describe, expect, it } from 'vitest';
import { RevisionPortError } from '@taucad/revisions';
import type { RevisionPort } from '@taucad/revisions';

import { observeRevisionEngineFailures, revisionEngineFailureOf } from '#revision-engine-failures.js';
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
