/**
 * The revalidation owner (W9 report R2, defect D1): an offline launch reads offline, and the network's return or a
 * window focus (an app switch on macOS changes no visibility) refetches the session without a reload.
 */
import { QueryObserver, onlineManager } from '@tanstack/react-query';
import { authQueryKeys } from '@better-auth-ui/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createRootQueryClient,
  sessionRecheckInterval,
  sessionRecheckMilliseconds,
} from '#runtime/root-query-client.js';
import { installQueryRevalidation } from '#runtime/query-revalidation.js';

let online = true;

afterEach(() => {
  online = true;
  installQueryRevalidation(globalThis.window);
  onlineManager.setOnline(true);
  vi.restoreAllMocks();
});

const sessionObserver = (fail: () => boolean) => {
  const client = createRootQueryClient();
  /* As `QueryClientProvider` does: the cache follows the online and focus managers only while mounted. */
  client.mount();
  let calls = 0;
  const observer = new QueryObserver(client, {
    queryKey: authQueryKeys.session,
    queryFn: async () => {
      calls += 1;
      if (fail()) {
        throw new TypeError('Failed to fetch');
      }
      return { user: { id: 'user-a' } };
    },
    retryDelay: 1,
    staleTime: 0,
  });
  const unsubscribe = observer.subscribe(() => undefined);
  return {
    observer,
    unsubscribe: () => {
      unsubscribe();
      client.unmount();
    },
    calls: () => calls,
  };
};

describe('installQueryRevalidation (W9 R2)', () => {
  /* The W9 rehearsal case: the machine reports online while Tau's API is unreachable, so no `online` event comes. */
  it('should re-check a session that failed for a network reason while the machine reports online, with no event', async () => {
    vi.spyOn(globalThis.navigator, 'onLine', 'get').mockImplementation(() => true);
    let reachable = false;
    const { observer, unsubscribe } = sessionObserver(() => !reachable);
    await vi.waitFor(() => {
      expect(observer.getCurrentResult().status).toBe('error');
    });
    reachable = true;
    await vi.waitFor(
      () => {
        expect(observer.getCurrentResult().data).toEqual({ user: { id: 'user-a' } });
      },
      { timeout: sessionRecheckMilliseconds + 2000 },
    );
    unsubscribe();
  }, 15_000);

  it('should never re-check a 401 on a timer', () => {
    expect(sessionRecheckInterval({ state: { status: 'error', error: { status: 401 } } })).toBe(false);
    expect(sessionRecheckInterval({ state: { status: 'error', error: new TypeError('Failed to fetch') } })).toBe(
      sessionRecheckMilliseconds,
    );
    expect(sessionRecheckInterval({ state: { status: 'success', error: null } })).toBe(false);
  });

  it('should read an offline launch as offline, and refetch the session when the network returns', async () => {
    vi.spyOn(globalThis.navigator, 'onLine', 'get').mockImplementation(() => online);
    online = false;
    const { observer, unsubscribe } = sessionObserver(() => !online);
    expect(onlineManager.isOnline()).toBe(false);
    /* The first attempt fails; the retry waits for the network instead of erroring into "signed out". */
    await vi.waitFor(() => {
      expect(observer.getCurrentResult().fetchStatus).toBe('paused');
    });
    expect(observer.getCurrentResult().status).toBe('pending');
    online = true;
    globalThis.dispatchEvent(new Event('online'));
    await vi.waitFor(() => {
      expect(observer.getCurrentResult().data).toStrictEqual({ user: { id: 'user-a' } });
    });
    unsubscribe();
  });

  it('should refetch a stale session on window focus, with no visibility change', async () => {
    vi.spyOn(globalThis.navigator, 'onLine', 'get').mockReturnValue(true);
    const { observer, unsubscribe, calls } = sessionObserver(() => false);
    await vi.waitFor(() => {
      expect(observer.getCurrentResult().status).toBe('success');
    });
    const before = calls();
    globalThis.dispatchEvent(new Event('focus'));
    await vi.waitFor(() => {
      expect(calls()).toBe(before + 1);
    });
    unsubscribe();
  });

  it('should install nothing without a window (a server render)', () => {
    expect(() => {
      installQueryRevalidation(undefined);
    }).not.toThrow();
  });
});
