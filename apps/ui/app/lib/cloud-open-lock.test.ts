import { afterEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { ProjectReadiness, RevisionStatusProjection } from '@taucad/revisions';
import { cloudOpenLockName, followCloudOpen, holdCloudOpen, openSettled } from '#lib/cloud-open-lock.js';

/* An exclusive Web Lock manager in one realm, as two tabs of one origin share one. */
const fakeLocks = () => {
  const tails = new Map<string, Promise<void>>();
  const names: string[] = [];
  const request = async <T>(name: string, ...rest: unknown[]): Promise<T> => {
    const task = rest.at(-1) as () => Promise<T>;
    names.push(name);
    const previous = tails.get(name);
    const released = Promise.withResolvers<void>();
    tails.set(name, released.promise);
    try {
      await previous;
      return await task();
    } finally {
      released.resolve();
    }
  };
  return { request, names };
};

type Moved = Readonly<{
  readiness?: ProjectReadiness;
  remote?: Partial<RevisionStatusProjection['remote']>;
  sync?: Partial<RevisionStatusProjection['sync']>;
}>;

/* One tab's projection, which the test moves. */
const tab = () => {
  let status: RevisionStatusProjection | undefined;
  const listeners = new Set<() => void>();
  return {
    source: {
      status: () => status,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
    move: (next: Moved) => {
      status = mock<RevisionStatusProjection>({
        readiness: next.readiness ?? status?.readiness,
        remote: mock<RevisionStatusProjection['remote']>({ phase: 'connected', kind: 'tau', ...next.remote }),
        sync: mock<RevisionStatusProjection['sync']>({ state: 'checking', ...next.sync }),
      });
      for (const listener of listeners) {
        listener();
      }
    },
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('one cold open per device (S20)', () => {
  it('names the project’s open lock', () => {
    expect(cloudOpenLockName('p1')).toBe('tau:open-cloud-project:p1');
  });

  it('settles once the authored checkout is applied, or the pull or connection failed', () => {
    const settled = (
      sync: Partial<RevisionStatusProjection['sync']>,
      phase: RevisionStatusProjection['remote']['phase'] = 'connected',
    ): boolean =>
      openSettled(
        mock<RevisionStatusProjection>({
          sync: mock<RevisionStatusProjection['sync']>({ state: 'checking', ...sync }),
          remote: mock<RevisionStatusProjection['remote']>({ phase }),
        }),
      );
    expect(openSettled(undefined)).toBe(false);
    expect(settled({})).toBe(false);
    expect(settled({ pullPhase: 'fetching' })).toBe(false);
    expect(settled({ hasAppliedRemote: true })).toBe(true);
    expect(settled({ state: 'queued' })).toBe(true);
    expect(settled({ state: 'failed' })).toBe(true);
    expect(settled({}, 'reconnectRequired')).toBe(true);
  });

  it('holds the lock until the open lands, and a second tab finds it done without connecting', async () => {
    const locks = fakeLocks();
    vi.stubGlobal('navigator', { locks });
    let owed = true;
    const opener = tab();
    const peer = tab();
    const connectOpener = vi.fn(async () => {
      opener.move({ sync: { pullPhase: 'fetching' } });
    });
    const connectPeer = vi.fn(async () => undefined);
    const first = holdCloudOpen({ projectId: 'p1', owed: () => owed, connect: connectOpener, source: opener.source });
    const second = holdCloudOpen({ projectId: 'p1', owed: () => owed, connect: connectPeer, source: peer.source });
    await vi.waitFor(() => {
      expect(connectOpener).toHaveBeenCalledOnce();
    });
    /* The peer is still waiting on the lock: nothing of its own has run. */
    expect(connectPeer).not.toHaveBeenCalled();
    /* The open lands; the opener's page then forgets the intent. */
    opener.move({ sync: { hasAppliedRemote: true } });
    owed = false;
    expect(await first).toBe(true);
    expect(await second).toBe(false);
    expect(connectPeer).not.toHaveBeenCalled();
    expect(locks.names).toStrictEqual(['tau:open-cloud-project:p1', 'tau:open-cloud-project:p1']);
  });

  it('lets the next tab try when the open failed and is still owed', async () => {
    vi.stubGlobal('navigator', { locks: fakeLocks() });
    const opener = tab();
    const first = holdCloudOpen({
      projectId: 'p2',
      owed: () => true,
      connect: async () => {
        opener.move({ sync: { state: 'queued' } });
      },
      source: opener.source,
    });
    expect(await first).toBe(true);
    const connect = vi.fn(async () => undefined);
    const peer = tab();
    const second = holdCloudOpen({ projectId: 'p2', owed: () => true, connect, source: peer.source });
    await vi.waitFor(() => {
      expect(connect).toHaveBeenCalledOnce();
    });
    peer.move({ sync: { hasAppliedRemote: true } });
    expect(await second).toBe(true);
  });

  it('announces the opener’s readiness to the tabs that follow it', async () => {
    vi.stubGlobal('navigator', { locks: fakeLocks() });
    const heard: ProjectReadiness[] = [];
    const stop = followCloudOpen('p3', (readiness) => heard.push(readiness));
    const opener = tab();
    const holding = holdCloudOpen({
      projectId: 'p3',
      owed: () => true,
      connect: async () => {
        opener.move({ readiness: 'connected' });
      },
      source: opener.source,
    });
    await vi.waitFor(() => {
      expect(heard).toStrictEqual(['connected']);
    });
    opener.move({ readiness: 'treeReady' });
    opener.move({ readiness: 'treeReady' });
    opener.move({ readiness: 'materialized', sync: { hasAppliedRemote: true } });
    await holding;
    await vi.waitFor(() => {
      expect(heard).toStrictEqual(['connected', 'treeReady', 'materialized']);
    });
    stop();
  });
});
