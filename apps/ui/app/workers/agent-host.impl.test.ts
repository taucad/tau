import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor, createMachine } from 'xstate';
import type { ParameterSetActor } from '@taucad/parameters/set-machine';
import { Topic } from '@taucad/events';
import { createDeploymentModeResolver } from '@taucad/utils/deployment-mode';
import {
  browserHostLabels,
  closeParameterActors,
  hostBuildOf,
  keepDeploymentFresh,
  swappable,
} from '#workers/agent-host.impl.js';

/* W6.r2 M1 (D15): a parameter actor's close is bounded; one past the bound or left uncertain is stopped, and a
 * retried close passes a stopped actor instead of waiting the bound again. */
describe('closeParameterActors', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /* An actor whose write never settles, and one whose write settles uncertain once closed. */
  const stuck = createMachine({ initial: 'open', states: { open: { initial: 'writing', states: { writing: {} } } } });
  // The write is uncertain before the close arrives, so the close finds it there.
  const uncertain = createMachine({
    initial: 'open',
    states: { open: { initial: 'uncertain', states: { uncertain: {} } } },
  });
  const parameterActor = (onClose?: 'uncertain'): ParameterSetActor =>
    (onClose === 'uncertain' ? createActor(uncertain) : createActor(stuck)).start() as unknown as ParameterSetActor;

  it('should stop an actor whose write outlives the bound, and pass it when the close is retried', async () => {
    vi.useFakeTimers();
    const actor = parameterActor();
    let failures: unknown[] | undefined;
    const closing = (async () => {
      failures = await closeParameterActors(new Map([['main.ts', actor]]));
    })();

    await vi.advanceTimersByTimeAsync(10_000);

    expect(failures).toHaveLength(1);
    expect(actor.getSnapshot().status).toBe('stopped');
    await closing;
    await expect(closeParameterActors(new Map([['main.ts', actor]]))).resolves.toEqual([]);
  });

  it('should stop an actor whose write stays uncertain, and report it', async () => {
    const actor = parameterActor('uncertain');

    const failures = await closeParameterActors(new Map([['main.ts', actor]]));

    expect(failures).toEqual([new Error('Parameter write for main.ts remains uncertain.')]);
    expect(actor.getSnapshot().status).toBe('stopped');
  });
});

describe('hostBuildOf', () => {
  it('reports the page release from the provide message', () => {
    expect(hostBuildOf('abc1234')).toBe('abc1234');
  });

  it('reports no build for the unknown label, so an observation shows unknown and never 0000000', () => {
    expect(hostBuildOf('0000000')).toBeUndefined();
    /* An older page sends none; the worker's own read has no define or window.ENV and is the unknown label. */
    expect(hostBuildOf(undefined)).toBeUndefined();
  });
});

describe('browserHostLabels', () => {
  it('labels every gateway call as the browser host with the build its evidence reports (LW17)', () => {
    expect(browserHostLabels('abc1234')).toEqual({ kind: 'browser', build: 'abc1234' });
  });

  it('sends no build for the unknown label, as its evidence reports none', () => {
    expect(browserHostLabels('0000000')).toEqual({ kind: 'browser' });
    expect(browserHostLabels(undefined)).toEqual({ kind: 'browser' });
  });
});

/* A rebridge swaps a slot's target while a turn's call may be under way on the old one: that call finishes there, and
 * the old target is released only once it settles. Disposing it under the call failed the turn's start `HOST_FAULT`
 * ("Bridge proxy closed") in agent-host-recovery's `bridges` case. */
describe('swappable', () => {
  const target = (name: string) => {
    const reads = Promise.withResolvers<string>();
    return {
      name,
      reads,
      read: vi.fn(async () => reads.promise),
      peek: vi.fn(() => name),
    };
  };

  it('should finish a call on the target it started on, and release that target only once the call settles', async () => {
    const finish = vi.fn();
    const first = target('first');
    const second = target('second');
    const slot = swappable(first, finish);

    const underway = slot.view.read();
    slot.retire(slot.swap(second));

    expect(finish).not.toHaveBeenCalled();
    expect(slot.view.peek()).toBe('second');
    first.reads.resolve('from first');
    await expect(underway).resolves.toBe('from first');
    await vi.waitFor(() => {
      expect(finish).toHaveBeenCalledExactlyOnceWith(first);
    });
    expect(second.read).not.toHaveBeenCalled();
  });

  it('should release a replaced target at once when nothing is under way, and after a call that fails', async () => {
    const finish = vi.fn();
    const first = target('first');
    const second = target('second');
    const third = target('third');
    const slot = swappable(first, finish);

    slot.retire(slot.swap(second));
    expect(finish).toHaveBeenCalledExactlyOnceWith(first);

    const failing = slot.view.read();
    slot.retire(slot.swap(third));
    expect(finish).toHaveBeenCalledOnce();
    second.reads.reject(new Error('peer gone'));
    await expect(failing).rejects.toThrow('peer gone');
    await vi.waitFor(() => {
      expect(finish).toHaveBeenLastCalledWith(second);
    });
  });

  it('should release the current target and every one still waiting on its calls when closed', () => {
    const finish = vi.fn();
    const first = target('first');
    const second = target('second');
    const slot = swappable(first, finish);

    void slot.view.read();
    slot.retire(slot.swap(second));
    slot.close();

    expect(finish.mock.calls).toEqual([[second], [first]]);
  });

  it('should release a retired target only once its last call under way settles', async () => {
    const finish = vi.fn();
    const firstCall = Promise.withResolvers<string>();
    const secondCall = Promise.withResolvers<string>();
    const calls = [firstCall, secondCall];
    const first = { read: vi.fn(async () => calls.shift()!.promise) };
    const slot = swappable(first, finish);

    const one = slot.view.read();
    const two = slot.view.read();
    slot.retire(slot.swap({ read: vi.fn(async () => 'second') }));

    firstCall.resolve('one');
    await expect(one).resolves.toBe('one');
    expect(finish).not.toHaveBeenCalled();
    secondCall.resolve('two');
    await expect(two).resolves.toBe('two');
    expect(finish).toHaveBeenCalledExactlyOnceWith(first);
  });

  describe('with retireWithin', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    /* A target whose `finish` rejects what it still owes, as a revisions client's `close` does. */
    const closable = () => {
      const reads = new Set<PromiseWithResolvers<string>>();
      return {
        read: vi.fn(async () => {
          const read = Promise.withResolvers<string>();
          reads.add(read);
          return read.promise;
        }),
        reads,
        close: () => {
          for (const read of reads) {
            read.reject(Object.assign(new Error('The project host closed.'), { code: 'PROJECT_HOST_CLOSED' }));
          }
          reads.clear();
        },
      };
    };

    it('should finish a retired target whose peer never answers once the bound passes', async () => {
      const first = closable();
      const finish = vi.fn((target: ReturnType<typeof closable>) => {
        target.close();
      });
      const slot = swappable(first, finish, { retireWithin: 1000 });

      const stuck = expect(slot.view.read()).rejects.toMatchObject({ code: 'PROJECT_HOST_CLOSED' });
      slot.retire(slot.swap(closable()));
      await vi.advanceTimersByTimeAsync(999);
      expect(finish).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(finish).toHaveBeenCalledExactlyOnceWith(first);
      await stuck;
      expect(finish).toHaveBeenCalledOnce();
    });

    it('should let a call that answers inside the bound complete, and clear the bound when it does', async () => {
      const first = closable();
      const finish = vi.fn((target: ReturnType<typeof closable>) => {
        target.close();
      });
      const slot = swappable(first, finish, { retireWithin: 1000 });

      const answered = slot.view.read();
      slot.retire(slot.swap(closable()));
      [...first.reads][0]!.resolve('answered');

      await expect(answered).resolves.toBe('answered');
      expect(finish).toHaveBeenCalledExactlyOnceWith(first);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('should clear the bound of a retired target when the slot closes', async () => {
      const first = closable();
      const second = closable();
      const finish = vi.fn((target: ReturnType<typeof closable>) => {
        target.close();
      });
      const slot = swappable(first, finish, { retireWithin: 1000 });

      const closed = expect(slot.view.read()).rejects.toMatchObject({ code: 'PROJECT_HOST_CLOSED' });
      slot.retire(slot.swap(second));
      slot.close();

      expect(finish.mock.calls).toEqual([[second], [first]]);
      expect(vi.getTimerCount()).toBe(0);
      await closed;
    });
  });
});

/* C7: an open host keeps the deployment answer fresh, so admission waits only on a request already in flight. */
describe('keepDeploymentFresh', () => {
  const api = 'https://api.example.test';
  const answer = {
    version: 1,
    edition: 'cloud',
    billing: { funded: true, environment: 'staging' },
    maxAgeSeconds: 300,
  };

  const openHost = () => {
    vi.useFakeTimers();
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify(answer), { status: 200 }));
    const resolver = createDeploymentModeResolver({ fetch });
    const visibility = new Topic<boolean>();
    const composerFocus = new Topic<undefined>();
    const stop = keepDeploymentFresh(resolver, api, {
      visibility: { visible: () => true, subscribe: (listener) => visibility.subscribe(listener) },
      composerFocus: { subscribe: (listener) => composerFocus.subscribe(listener) },
    });
    return { fetch, resolver, visibility, composerFocus, stop };
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should make no request at an admission after expiry while its timers run', async () => {
    const { fetch, resolver, stop } = openHost();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(301_000);
    const calls = fetch.mock.calls.length;

    await expect(resolver.resolve(api)).resolves.toMatchObject({ state: 'known', source: 'cache' });
    expect(fetch).toHaveBeenCalledTimes(calls);
    stop();
  });

  it('should start one request on composer focus after a clock jump, which the admission awaits as a refetch', async () => {
    const { fetch, resolver, composerFocus, stop } = openHost();
    await vi.advanceTimersByTimeAsync(0);
    /* The device slept: the clock moved past expiry and no timer fired. */
    vi.setSystemTime(Date.now() + 600_000);
    let answerNow: () => void = () => undefined;
    fetch.mockImplementationOnce(
      async () =>
        new Promise((resolve) => {
          answerNow = () => {
            resolve(new Response(JSON.stringify(answer), { status: 200 }));
          };
        }),
    );

    composerFocus.emit(undefined);
    expect(fetch).toHaveBeenCalledTimes(2);
    const admission = resolver.resolve(api);
    answerNow();

    /* `network`, not `cache`: the admission waited on the refetch, which its `deployment.refetched` label reports. */
    await expect(admission).resolves.toMatchObject({ state: 'known', source: 'network' });
    expect(fetch).toHaveBeenCalledTimes(2);
    stop();
  });

  it('should refresh an expired answer when the page is shown again, and not when it is hidden', async () => {
    const { fetch, visibility, stop } = openHost();
    await vi.advanceTimersByTimeAsync(0);
    vi.setSystemTime(Date.now() + 600_000);

    visibility.emit(false);
    expect(fetch).toHaveBeenCalledTimes(1);
    visibility.emit(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    stop();
  });

  it('should stop refreshing once the host closes', async () => {
    const { fetch, composerFocus, stop } = openHost();
    await vi.advanceTimersByTimeAsync(0);
    stop();

    vi.setSystemTime(Date.now() + 600_000);
    composerFocus.emit(undefined);
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
