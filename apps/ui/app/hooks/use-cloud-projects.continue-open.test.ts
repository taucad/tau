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

const { setRevisionSessionUser } = await import('#lib/revision-actor.js');
const { tauCloudIntent } = await import('#lib/tau-cloud-intent.js');
const { cloudOpenContinuationTestApi, continueCloudOpen } = await import('#hooks/use-cloud-projects.js');
const { revisionClientTestApi } = await import('#hooks/use-revision-status.js');

const projectId = 'prj_continue000000000000000';
const worker = { name: 'shared-worker' } as unknown as Worker;

/** The project's client as the open's hold reads it: a projection a row moves. */
const adoptClient = () => {
  const listeners = new Set<() => void>();
  let status: RevisionStatusProjection | undefined;
  const client = {
    status: () => status,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  } as unknown as RevisionClient;
  revisionClientTestApi.adopt(projectId, worker, client);
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
  };
};

beforeEach(() => {
  setRevisionSessionUser({ id: 'usr_ada', name: 'Ada' });
  tauCloudIntent.set(projectId, 'open');
});

afterEach(() => {
  tauCloudIntent.set(projectId, undefined);
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
});
