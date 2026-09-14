/* eslint-disable @typescript-eslint/naming-convention -- environment names are SCREAMING_SNAKE */
import { mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { createServicesBroker } from '#main/services-broker.js';
import type { ServicesBrokerOptions } from '#main/services-broker.js';

type Spawned = {
  postMessage: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
  on: (event: 'exit' | 'message', listener: (value?: unknown) => void) => void;
  exit: () => void;
  message: (data: unknown) => void;
};

const spawnUtility = (): Spawned => {
  const exits: Array<() => void> = [];
  const messages: Array<(message: unknown) => void> = [];
  return {
    postMessage: vi.fn(),
    kill: vi.fn(),
    on: (event, listener) => {
      if (event === 'exit') {
        exits.push(listener);
      } else {
        messages.push(listener);
      }
    },
    exit: () => {
      for (const listener of exits) {
        listener();
      }
    },
    message: (data) => {
      for (const listener of messages) {
        listener(data);
      }
    },
  };
};

const brokerHarness = () => {
  const spawns: Spawned[] = [];
  const runtimeExits: Array<() => void> = [];
  const fork = vi.fn((): Spawned => {
    const utility = spawnUtility();
    spawns.push(utility);
    return utility;
  });
  const connectRuntime = vi.fn(() => ({
    port: { id: 'runtime' },
    closed: new Promise<void>((resolve) => {
      runtimeExits.push(resolve);
    }),
    dispose: vi.fn(),
  }));
  const options = {
    utilityEntry: '/dist/main/chunks/services-host.js',
    env: { PATH: '/usr/bin' },
    fork,
    createChannel: () => ({ port1: { id: 'renderer' }, port2: { id: 'utility' } }),
    connectRuntime,
  } as unknown as ServicesBrokerOptions;
  return { broker: createServicesBroker(options), connectRuntime, fork, runtimeExits, spawns };
};

describe('createServicesBroker', () => {
  it('forks nothing until the first concern is connected', () => {
    const { fork } = brokerHarness();
    expect(fork).not.toHaveBeenCalled();
  });

  it('is a singleton: many concerns, one utility, one dedicated port each', () => {
    const { broker, fork, spawns } = brokerHarness();
    broker.connect('nodeFs');
    broker.connect('nodeFs');
    expect(fork).toHaveBeenCalledTimes(1);
    expect(spawns[0]?.postMessage).toHaveBeenCalledTimes(2);
    /* One port per concern, never a multiplexer — each connect transfers its
     * own channel leg. */
    expect(spawns[0]?.postMessage.mock.calls[0]).toEqual([{ type: 'concern', concern: 'nodeFs' }, [{ id: 'utility' }]]);
  });

  it('forwards a concern context on the same frame as the port', () => {
    const { broker, spawns } = brokerHarness();
    broker.connect('agentHost', { workspaceRoot: '/home/widget' });
    /* The context scopes *this* connection, so it rides the concern frame
     * rather than becoming a replayed control frame. */
    expect(spawns[0]?.postMessage.mock.calls[0]).toEqual([
      { type: 'concern', concern: 'agentHost', context: { workspaceRoot: '/home/widget' } },
      [{ id: 'utility' }],
    ]);
  });

  it('mints runtime ports only from a main-admitted agent context', () => {
    const { broker, connectRuntime, spawns } = brokerHarness();
    broker.connect('agentHost', {
      workspaceRoot: '/home/widget',
      nativeTrustFile: '/markers/widget.json',
      computeMode: 'durable',
    });
    spawns[0]?.message({ type: 'runtime-port-request', requestId: 'runtime-1', workspaceRoot: '/home/widget' });
    spawns[0]?.message({ type: 'runtime-port-request', requestId: 'runtime-2', workspaceRoot: '/home/other' });

    expect(spawns[0]?.postMessage).toHaveBeenCalledWith({ type: 'runtime-port', requestId: 'runtime-1' }, [
      { id: 'runtime' },
    ]);
    expect(spawns[0]?.postMessage).toHaveBeenCalledWith({ type: 'runtime-port-refused', requestId: 'runtime-2' });
    expect(connectRuntime).toHaveBeenCalledExactlyOnceWith({
      projectRoot: '/home/widget',
      computeProjectRoot: '/home/widget',
      computeMode: 'durable',
      definition: 'default',
    });
  });

  it('canonicalizes equivalent project spellings before retaining compute identity', () => {
    const { broker, connectRuntime, spawns } = brokerHarness();
    broker.connect('agentHost', { workspaceRoot: '/home/widget/.', computeMode: 'durable' });
    spawns[0]?.message({ type: 'runtime-port-request', requestId: 'runtime-1', workspaceRoot: '/home/widget' });

    expect(connectRuntime).toHaveBeenCalledExactlyOnceWith({
      projectRoot: '/home/widget',
      computeProjectRoot: '/home/widget',
      computeMode: 'durable',
      definition: 'default',
    });
  });

  it('should mint a runtime port when the execution root uses a symlink spelling', () => {
    const canonical = mkdtempSync(join(tmpdir(), 'tau-services-root-'));
    const alias = `${canonical}-alias`;
    symlinkSync(canonical, alias, process.platform === 'win32' ? 'junction' : 'dir');
    try {
      const { broker, connectRuntime, spawns } = brokerHarness();
      broker.connect('agentHost', { workspaceRoot: alias });
      spawns[0]?.message({ type: 'runtime-port-request', requestId: 'runtime-1', workspaceRoot: alias });

      expect(connectRuntime).toHaveBeenCalledExactlyOnceWith({
        projectRoot: realpathSync.native(canonical),
        computeProjectRoot: realpathSync.native(canonical),
        computeMode: 'off',
        definition: 'default',
      });
    } finally {
      rmSync(alias, { force: true });
      rmSync(canonical, { force: true, recursive: true });
    }
  });

  it('retains one original identity across candidates while keeping projects separate', () => {
    const { broker, connectRuntime, spawns } = brokerHarness();
    broker.connect('agentHost', { workspaceRoot: '/home/a', computeMode: 'durable' });
    broker.connect('agentHost', { workspaceRoot: '/home/b', computeMode: 'durable' });
    for (const [workspaceRoot, projectRoot] of [
      ['/home/a/.tau/checkouts/one', '/home/a'],
      ['/home/a/.tau/checkouts/two', '/home/a'],
      ['/home/b/.tau/checkouts/one', '/home/b'],
    ] as const) {
      spawns[0]?.message({ type: 'runtime-context-register', workspaceRoot, projectRoot });
      spawns[0]?.message({ type: 'runtime-port-request', requestId: workspaceRoot, workspaceRoot });
    }

    expect(connectRuntime).toHaveBeenNthCalledWith(1, {
      projectRoot: '/home/a/.tau/checkouts/one',
      computeProjectRoot: '/home/a',
      computeMode: 'durable',
      definition: 'default',
    });
    expect(connectRuntime).toHaveBeenNthCalledWith(2, {
      projectRoot: '/home/a/.tau/checkouts/two',
      computeProjectRoot: '/home/a',
      computeMode: 'durable',
      definition: 'default',
    });
    expect(connectRuntime).toHaveBeenNthCalledWith(3, {
      projectRoot: '/home/b/.tau/checkouts/one',
      computeProjectRoot: '/home/b',
      computeMode: 'durable',
      definition: 'default',
    });
    expect(broker.computeProjectRoot('/home/a/.tau/checkouts/one/.')).toBe('/home/a');
    expect(broker.computeProjectRoot('/home/b/.tau/checkouts/one')).toBe('/home/b');
  });

  it('mints a runtime port for a candidate turn checkout while it is registered, and not after', () => {
    const { broker, connectRuntime, spawns } = brokerHarness();
    broker.connect('agentHost', { workspaceRoot: '/home/widget', computeMode: 'durable' });
    const checkout = '/home/widget/.tau/checkouts/trun-1';
    spawns[0]?.message({ type: 'runtime-context-register', workspaceRoot: checkout, projectRoot: '/home/widget' });
    spawns[0]?.message({ type: 'runtime-port-request', requestId: 'runtime-1', workspaceRoot: checkout });

    /* Rooted at the checkout, not the project: a candidate turn's kernel and
     * GeoSpec tools must read the tree its file tools write. */
    expect(connectRuntime).toHaveBeenCalledExactlyOnceWith({
      projectRoot: checkout,
      computeProjectRoot: '/home/widget',
      computeMode: 'durable',
      definition: 'default',
    });
    expect(spawns[0]?.postMessage).toHaveBeenCalledWith({ type: 'runtime-port', requestId: 'runtime-1' }, [
      { id: 'runtime' },
    ]);

    spawns[0]?.message({ type: 'runtime-context-release', workspaceRoot: checkout, projectRoot: '/home/widget' });
    spawns[0]?.message({ type: 'runtime-port-request', requestId: 'runtime-2', workspaceRoot: checkout });

    expect(connectRuntime).toHaveBeenCalledOnce();
    expect(spawns[0]?.postMessage).toHaveBeenCalledWith({ type: 'runtime-port-refused', requestId: 'runtime-2' });
  });

  it('registers a checkout only under a granted project, and never evicts the project itself', () => {
    const { broker, connectRuntime, spawns } = brokerHarness();
    broker.connect('agentHost', { workspaceRoot: '/home/widget' });
    /* A checkout outside the granted project, and one under a project nobody
     * granted: the utility is trusted code, but the grant is main's fence. */
    spawns[0]?.message({ type: 'runtime-context-register', workspaceRoot: '/etc', projectRoot: '/home/widget' });
    spawns[0]?.message({
      type: 'runtime-context-register',
      workspaceRoot: '/home/other/.tau/checkouts/t',
      projectRoot: '/home/other',
    });
    spawns[0]?.message({ type: 'runtime-port-request', requestId: 'runtime-1', workspaceRoot: '/etc' });
    spawns[0]?.message({
      type: 'runtime-port-request',
      requestId: 'runtime-2',
      workspaceRoot: '/home/other/.tau/checkouts/t',
    });
    /* A release frame naming the project cannot take the project's own context
     * down with it — only a checkout this broker registered is releasable. */
    spawns[0]?.message({
      type: 'runtime-context-release',
      workspaceRoot: '/home/widget',
      projectRoot: '/home/widget',
    });
    spawns[0]?.message({ type: 'runtime-port-request', requestId: 'runtime-3', workspaceRoot: '/home/widget' });

    expect(connectRuntime).toHaveBeenCalledExactlyOnceWith({
      projectRoot: '/home/widget',
      computeProjectRoot: '/home/widget',
      computeMode: 'off',
      definition: 'default',
    });
  });

  it('forgets the checkouts of a utility that died without releasing them', () => {
    const { broker, connectRuntime, spawns } = brokerHarness();
    broker.connect('agentHost', { workspaceRoot: '/home/widget' });
    const checkout = '/home/widget/.tau/checkouts/trun-1';
    spawns[0]?.message({ type: 'runtime-context-register', workspaceRoot: checkout, projectRoot: '/home/widget' });
    /* Only the utility that registered a checkout ever releases it, so one that
     * dies mid-turn would otherwise leave the root admissible for the life of
     * the app — over a tree the turn's release already deleted. */
    spawns[0]?.exit();
    broker.connect('agentHost', { workspaceRoot: '/home/widget' });
    spawns[1]?.message({ type: 'runtime-port-request', requestId: 'runtime-1', workspaceRoot: checkout });
    /* The project the fresh fork re-registered is still served: only the dead
     * utility's checkouts are forgotten. */
    spawns[1]?.message({ type: 'runtime-port-request', requestId: 'runtime-2', workspaceRoot: '/home/widget' });

    expect(spawns[1]?.postMessage).toHaveBeenCalledWith({ type: 'runtime-port-refused', requestId: 'runtime-1' });
    expect(connectRuntime).toHaveBeenCalledExactlyOnceWith({
      projectRoot: '/home/widget',
      computeProjectRoot: '/home/widget',
      computeMode: 'off',
      definition: 'default',
    });
  });

  it('reacquires a fresh runtime lease after the prior computation exits', async () => {
    const { broker, connectRuntime, runtimeExits, spawns } = brokerHarness();
    broker.connect('agentHost', { workspaceRoot: '/home/widget' });
    spawns[0]?.message({ type: 'runtime-port-request', requestId: 'runtime-1', workspaceRoot: '/home/widget' });
    runtimeExits[0]?.();
    await Promise.resolve();
    spawns[0]?.message({ type: 'runtime-port-request', requestId: 'runtime-2', workspaceRoot: '/home/widget' });

    expect(connectRuntime).toHaveBeenCalledTimes(2);
  });

  it('releases the exact runtime lease requested by the utility client', () => {
    const { broker, connectRuntime, spawns } = brokerHarness();
    broker.connect('agentHost', { workspaceRoot: '/home/widget' });
    spawns[0]?.message({ type: 'runtime-port-request', requestId: 'runtime-1', workspaceRoot: '/home/widget' });
    spawns[0]?.message({ type: 'runtime-port-release', requestId: 'runtime-1' });

    expect(connectRuntime.mock.results[0]?.value.dispose).toHaveBeenCalledOnce();
  });

  it('waits for released runtime processes before disposal settles', async () => {
    const { broker, runtimeExits, spawns } = brokerHarness();
    broker.connect('agentHost', { workspaceRoot: '/home/widget' });
    spawns[0]?.message({ type: 'runtime-port-request', requestId: 'runtime-1', workspaceRoot: '/home/widget' });
    let settled = false;
    const disposal = (async () => {
      await broker.dispose();
      settled = true;
    })();
    await Promise.resolve();
    expect(settled).toBe(false);
    runtimeExits[0]?.();
    await disposal;
    expect(settled).toBe(true);
  });

  it('refuses a duplicate live runtime request identity without overwriting its lease', () => {
    const { broker, connectRuntime, spawns } = brokerHarness();
    broker.connect('agentHost', { workspaceRoot: '/home/widget' });
    const request = { type: 'runtime-port-request', requestId: 'runtime-1', workspaceRoot: '/home/widget' };
    spawns[0]?.message(request);
    spawns[0]?.message(request);

    expect(connectRuntime).toHaveBeenCalledOnce();
    expect(spawns[0]?.postMessage).toHaveBeenCalledWith({ type: 'runtime-port-refused', requestId: 'runtime-1' });
  });

  it('replays the latest control frame of each kind onto a fresh fork', () => {
    const { broker, spawns } = brokerHarness();
    broker.post({ type: 'allowRoots', roots: ['/home'] });
    broker.post({ type: 'authToken', token: 'first' });
    broker.post({ type: 'authToken', token: 'second' });
    broker.connect('nodeFs');

    const replayed = spawns[0]?.postMessage.mock.calls.slice(0, 2).map(([frame]: readonly unknown[]) => frame);
    expect(replayed).toEqual([
      { type: 'allowRoots', roots: ['/home'] },
      /* Keyed by type, so an hourly refresh replaces rather than accumulates. */
      { type: 'authToken', token: 'second' },
    ]);
  });

  it('forgets a dead utility and forks a fresh one on the next connect', () => {
    const { broker, fork, spawns } = brokerHarness();
    broker.connect('nodeFs');
    spawns[0]?.exit();
    broker.connect('nodeFs');
    expect(fork).toHaveBeenCalledTimes(2);
  });

  it('refuses a control frame with no string type', () => {
    const { broker } = brokerHarness();
    expect(() => {
      broker.post({ token: 'x' });
    }).toThrow(/string `type`/u);
  });
});

describe('createServicesBroker — the quit hold (W19, D31)', () => {
  it('asks the utility to quiesce and waits for its reply before anything is killed', async () => {
    const { broker, spawns } = brokerHarness();
    broker.connect('agentHost', { workspaceRoot: '/projects/a' });
    const utility = spawns[0]!;

    const quiescing = broker.quiesce(5000);
    expect(utility.postMessage).toHaveBeenCalledWith({ type: 'quiesce' });
    expect(utility.kill).not.toHaveBeenCalled();

    utility.message({ type: 'quiesced' });

    await expect(quiescing).resolves.toBe('quiesced');
    expect(utility.kill).not.toHaveBeenCalled();
  });

  it('cuts at the bound when the utility never answers, so quit is never held open', async () => {
    vi.useFakeTimers();
    try {
      const { broker, spawns } = brokerHarness();
      broker.connect('nodeFs');
      const quiescing = broker.quiesce(1000);
      await vi.advanceTimersByTimeAsync(1100);

      await expect(quiescing).resolves.toBe('timeout');
      expect(spawns[0]?.kill).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('answers at once when a utility that died mid-quiesce has nothing left to settle', async () => {
    const { broker, spawns } = brokerHarness();
    broker.connect('nodeFs');
    const quiescing = broker.quiesce(5000);
    spawns[0]!.exit();

    await expect(quiescing).resolves.toBe('quiesced');
  });

  it('has nothing to ask when no utility was ever forked', async () => {
    const { broker, fork } = brokerHarness();

    await expect(broker.quiesce(5000)).resolves.toBe('no-utility');
    expect(fork).not.toHaveBeenCalled();
  });
});
