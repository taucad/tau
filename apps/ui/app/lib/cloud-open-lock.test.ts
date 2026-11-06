import { afterEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { ProjectReadiness, RevisionStatusProjection } from '@taucad/revisions';
import { cloudOpenLockName, followCloudOpen, holdCloudOpen, openSettled } from '#lib/cloud-open-lock.js';

/* An exclusive Web Lock manager in one realm, as two tabs of one origin share one: `signal` stops a wait, `steal` skips it. */
const fakeLocks = () => {
  const tails = new Map<string, Promise<void>>();
  const names: string[] = [];
  const request = async <T>(name: string, ...rest: unknown[]): Promise<T> => {
    const task = rest.at(-1) as () => Promise<T>;
    const options = (rest.length > 1 ? rest[0] : {}) as { signal?: AbortSignal; steal?: boolean };
    names.push(name);
    const previous = options.steal === true ? undefined : tails.get(name);
    const released = Promise.withResolvers<void>();
    tails.set(name, released.promise);
    try {
      if (previous !== undefined) {
        const aborted = new Promise<never>((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => {
            reject(new DOMException('The request was aborted.', 'AbortError'));
          });
        });
        await Promise.race([previous, aborted]);
      }
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

  it('lets go when the opener’s client goes away, so the next tab opens (W4 review 2)', async () => {
    vi.stubGlobal('navigator', { locks: fakeLocks() });
    let alive = true;
    const opener = tab();
    const first = holdCloudOpen({
      projectId: 'p4',
      owed: () => true,
      connect: async () => {
        opener.move({ sync: { pullPhase: 'fetching' } });
      },
      source: { ...opener.source, alive: () => alive },
      bounds: { heartbeat: 10 },
    });
    const connect = vi.fn(async () => undefined);
    const peer = tab();
    const second = holdCloudOpen({ projectId: 'p4', owed: () => true, connect, source: peer.source });
    alive = false;
    expect(await first).toBe(true);
    await vi.waitFor(() => {
      expect(connect).toHaveBeenCalledOnce();
    });
    peer.move({ sync: { hasAppliedRemote: true } });
    expect(await second).toBe(true);
  });

  it('lets go of an open whose projection stops moving (W4 review 2)', async () => {
    vi.stubGlobal('navigator', { locks: fakeLocks() });
    const opener = tab();
    const holding = holdCloudOpen({
      projectId: 'p5',
      owed: () => true,
      connect: async () => {
        opener.move({ sync: { pullPhase: 'fetching' } });
      },
      source: opener.source,
      bounds: { heartbeat: 10, holderStall: 50 },
    });
    expect(await holding).toBe(true);
  });

  it('takes the lock over from a holder it hears nothing from, and waits on one that beats (W4 review 2)', async () => {
    const locks = fakeLocks();
    vi.stubGlobal('navigator', { locks });
    const opener = tab();
    const beating = holdCloudOpen({
      projectId: 'p6',
      owed: () => true,
      connect: async () => {
        opener.move({ sync: { pullPhase: 'fetching' } });
      },
      source: opener.source,
      bounds: { heartbeat: 10 },
    });
    const connect = vi.fn(async () => undefined);
    const peer = tab();
    const waiting = holdCloudOpen({
      projectId: 'p6',
      owed: () => true,
      connect,
      source: peer.source,
      bounds: { waiterStall: 60 },
    });
    /* The holder beats every 10 ms: the waiter keeps waiting well past its 60 ms of silence. */
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(connect).not.toHaveBeenCalled();
    opener.move({ sync: { hasAppliedRemote: true } });
    await beating;
    peer.move({ sync: { hasAppliedRemote: true } });
    await waiting;

    /* A hung holder that never beats: the lock is held by a tab that says nothing. */
    const hung = Promise.withResolvers<void>();
    void locks.request(cloudOpenLockName('p7'), {}, async () => hung.promise);
    const taker = vi.fn(async () => {
      peer.move({ sync: { hasAppliedRemote: true } });
    });
    expect(
      await holdCloudOpen({
        projectId: 'p7',
        owed: () => true,
        connect: taker,
        source: peer.source,
        bounds: { waiterStall: 30 },
      }),
    ).toBe(true);
    expect(taker).toHaveBeenCalledOnce();
    hung.resolve();
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
