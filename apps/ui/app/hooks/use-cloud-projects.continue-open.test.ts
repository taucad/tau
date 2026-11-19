// @vitest-environment jsdom
/**
 * One Tau Cloud open per project per document (STO-25 SP6): the *Open* gesture starts it before the project route,
 * and the route's `useTauCloudIntentConnection` may ask again while it runs. The project is connected once.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RevisionStatusProjection } from '@taucad/revisions';
import type { RevisionClient } from '@taucad/revisions-ui/types/revision-client.types';

/* eslint-disable-next-line @typescript-eslint/naming-convention -- `window.ENV`'s keys are the deployment's own environment variable names. */
vi.mock('#environment.config.js', () => ({ ENV: { TAU_API_URL: 'https://api.test' } }));

const { setRevisionSessionUser } = await import('@taucad/revisions-ui/lib/revision-actor');
const { tauCloudIntent } = await import('#lib/tau-cloud-intent.js');
const { cloudOpenContinuationTestApi, continueCloudOpen } = await import('#hooks/use-cloud-projects.js');
const { revisionClientTestApi } = await import('#hooks/use-revision-status.js');

const projectId = 'prj_continue000000000000000';
const worker = { name: 'shared-worker' } as unknown as Worker;

/** The project's client as the open's hold reads it: open, with the root's first answer, and a projection a row moves. */
const adoptClient = (on: Worker = worker) => {
  const listeners = new Set<() => void>();
  let status: RevisionStatusProjection | undefined = {
    remote: { kind: 'none', phase: 'none' },
    sync: { state: 'checking' },
  } as unknown as RevisionStatusProjection;
  const client = {
    status: () => status,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  } as unknown as RevisionClient;
  revisionClientTestApi.adopt(projectId, on, client);
  return {
    move: (sync: Partial<RevisionStatusProjection['sync']>) => {
      status = {
        remote: { kind: 'tau', phase: 'connecting' },
        sync: { state: 'checking', ...sync },
      } as unknown as RevisionStatusProjection;
      for (const listener of listeners) {
        listener();
      }
    },
    /* Closed as a client closes: no projection, and its listeners told; the registry keeps the same object. */
    close: () => {
      status = undefined;
      for (const listener of listeners) {
        listener();
      }
    },
  };
};

beforeEach(() => {
  setRevisionSessionUser({ id: 'usr_ada', name: 'Ada' });
  tauCloudIntent.set(projectId, 'open');
});

afterEach(() => {
  tauCloudIntent.set(projectId, undefined);
  localStorage.clear();
  setRevisionSessionUser(undefined);
  revisionClientTestApi.reset();
  cloudOpenContinuationTestApi.reset();
});

describe('continueCloudOpen (STO-25 SP6)', () => {
  it('connects once when the gesture and the route both ask, and the second answers that it did not connect', async () => {
    const client = adoptClient();
    const connect = vi.fn(async () => {
      client.move({ pullPhase: 'fetching' });
    });
    const gesture = continueCloudOpen({ projectId, account: 'usr_ada', connect, asserted: true });
    const route = continueCloudOpen({ projectId, account: 'usr_ada', connect, asserted: true });
    await vi.waitFor(() => {
      expect(connect).toHaveBeenCalledOnce();
    });
    client.move({ hasAppliedRemote: true });
    expect(await gesture).toBe(true);
    expect(await route).toBe(false);
    expect(connect).toHaveBeenCalledOnce();
  });

  it('lets the second run its own when the first did not connect (no longer owed to its account)', async () => {
    const client = adoptClient();
    const connect = vi.fn(async () => {
      client.move({ hasAppliedRemote: true });
    });
    const stale = continueCloudOpen({ projectId, account: 'usr_grace', connect, asserted: true });
    const current = continueCloudOpen({ projectId, account: 'usr_ada', connect, asserted: true });
    expect(await stale).toBe(false);
    expect(await current).toBe(true);
    expect(connect).toHaveBeenCalledOnce();
  });

  it('connects nothing once its end has come before the lock was held', async () => {
    adoptClient();
    const connect = vi.fn(async () => undefined);
    const ended = new AbortController();
    ended.abort();
    expect(
      await continueCloudOpen({ projectId, account: 'usr_ada', connect, asserted: true, signal: ended.signal }),
    ).toBe(false);
    expect(connect).not.toHaveBeenCalled();
  });

  /* Review of d158d3e7 (LOW): every caller shares the deletion check the route makes, the gesture's included. */
  it('connects nothing for a project being deleted from Tau Cloud, even when the gesture asserted it active', async () => {
    adoptClient();
    localStorage.setItem(
      'tau:cloud-project-deletions:usr_ada',
      JSON.stringify([{ id: projectId, name: 'Kept', state: 'deleting' }]),
    );
    const connect = vi.fn(async () => undefined);
    expect(await continueCloudOpen({ projectId, account: 'usr_ada', connect, asserted: true })).toBe(false);
    expect(connect).not.toHaveBeenCalled();
  });

  /*
   * Review of 1cd99a7c (MEDIUM): another tab holds the S20 lock while this tab's open waits for it; the person leaves
   * the project and its session closes the client, which the registry keeps. When the lock comes, nothing may be sent
   * to the closed client (it would queue `connectRemote` for the client's next open, under whoever opens it then), and
   * the lock is let go at once instead of held for the stall bound.
   */
  it('connects nothing to a client that closed while the open waited for the lock, and lets the lock go', async () => {
    const client = adoptClient();
    const held = Promise.withResolvers<void>();
    const granted: string[] = [];
    const released: string[] = [];
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        request: async (name: string, ...rest: unknown[]) => {
          const callback = rest.at(-1) as () => Promise<unknown>;
          await held.promise;
          granted.push(name);
          try {
            return await callback();
          } finally {
            released.push(name);
          }
        },
      },
    });
    try {
      const connect = vi.fn(async () => undefined);
      const opening = continueCloudOpen({ projectId, account: 'usr_ada', connect, asserted: true });
      client.close();
      held.resolve();
      await vi.waitFor(() => {
        expect(granted).toHaveLength(1);
      });
      await Promise.resolve();
      expect(connect).not.toHaveBeenCalled();
      expect(await opening).toBe(false);
      expect(released).toHaveLength(1);
    } finally {
      Reflect.deleteProperty(navigator, 'locks');
    }
  });

  /* Review of d158d3e7 (LOW): an open in flight stands for its own client only. */
  it('runs its own open when the project’s client was replaced under the open it waited for', async () => {
    const first = adoptClient();
    const connectFirst = vi.fn(async () => {
      first.move({ pullPhase: 'fetching' });
    });
    const opening = continueCloudOpen({ projectId, account: 'usr_ada', connect: connectFirst, asserted: true });
    await vi.waitFor(() => {
      expect(connectFirst).toHaveBeenCalledOnce();
    });
    const waiting = continueCloudOpen({
      projectId,
      account: 'usr_ada',
      asserted: true,
      connect: async () => {
        second.move({ hasAppliedRemote: true });
      },
    });
    /* The file manager's worker was replaced: the project has a new client, and the first open's hold lets go. */
    const second = adoptClient({ name: 'replacement-worker' } as unknown as Worker);
    first.move({ pullPhase: 'fetching' });
    expect(await opening).toBe(true);
    expect(await waiting).toBe(true);
  });
});
