/* eslint-disable @typescript-eslint/naming-convention -- environment names are SCREAMING_SNAKE */
import { mkdtempSync, realpathSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { createServicesBroker, rendererServicesConcerns, servicesConcerns } from '#main/services-broker.js';
import type { ServicesBrokerOptions } from '#main/services-broker.js';

type Spawned = {
  postMessage: ReturnType<typeof vi.fn>;
  posted: unknown[];
  kill: ReturnType<typeof vi.fn>;
  on: (event: 'exit' | 'message', listener: (value?: unknown) => void) => void;
  exit: () => void;
  message: (data: unknown) => void;
};

const spawnUtility = (): Spawned => {
  const exits: Array<() => void> = [];
  const messages: Array<(message: unknown) => void> = [];
  const posted: unknown[] = [];
  return {
    postMessage: vi.fn((message: unknown) => {
      posted.push(message);
    }),
    posted,
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
  const channels: Array<{
    readonly port1: { readonly id: 'renderer'; readonly close: ReturnType<typeof vi.fn> };
    readonly port2: { readonly id: 'utility'; readonly close: ReturnType<typeof vi.fn> };
  }> = [];
  type Channel = (typeof channels)[number];
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
    createChannel: (): Channel => {
      const channel: Channel = {
        port1: { id: 'renderer', close: vi.fn() },
        port2: { id: 'utility', close: vi.fn() },
      };
      channels.push(channel);
      return channel;
    },
    connectRuntime,
  } as unknown as ServicesBrokerOptions;
  return { broker: createServicesBroker(options), channels, connectRuntime, fork, runtimeExits, spawns };
};

describe('createServicesBroker', () => {
  it('keeps the rooted runtime filesystem concern main-only', () => {
    expect(servicesConcerns).toContain('runtimeFileSystem');
    expect(rendererServicesConcerns).toEqual(['nodeFs', 'agentHost']);
  });

  it('forks nothing until the first concern is connected', () => {
    const { fork } = brokerHarness();
    expect(fork).not.toHaveBeenCalled();
  });

  it('is a singleton: many concerns, one utility, one dedicated port each', () => {
    const { broker, channels, fork, spawns } = brokerHarness();
    broker.connect('nodeFs');
    broker.connect('nodeFs');
    expect(fork).toHaveBeenCalledTimes(1);
    expect(spawns[0]?.postMessage).toHaveBeenCalledTimes(2);
    /* One port per concern, never a multiplexer — each connect transfers its
     * own channel leg. */
    expect(spawns[0]?.postMessage.mock.calls[0]).toEqual([
      { type: 'concern', concern: 'nodeFs' },
      [expect.objectContaining({ id: 'utility' })],
    ]);
    expect(channels[0]?.port1.close).not.toHaveBeenCalled();
    expect(channels[0]?.port2.close).not.toHaveBeenCalled();
  });

  it('closes both freshly minted legs when the services fork fails', () => {
    const { broker, channels, fork } = brokerHarness();
    fork.mockImplementationOnce(() => {
      throw new Error('fork failed');
    });

    expect(() => broker.connect('agentHost', { workspaceRoot: '/home/widget' })).toThrow('fork failed');
    expect(channels[0]?.port1.close).toHaveBeenCalledOnce();
    expect(channels[0]?.port2.close).toHaveBeenCalledOnce();
    expect(broker.computeProjectRoot('/home/widget')).toBeUndefined();
  });

  it('closes both freshly minted legs and clears admission when concern transfer fails', () => {
    const { broker, channels, fork } = brokerHarness();
    const failed = spawnUtility();
    failed.postMessage.mockImplementationOnce(() => {
      throw new Error('transfer failed');
    });
    fork.mockReturnValueOnce(failed);

    expect(() => broker.connect('agentHost', { workspaceRoot: '/home/widget' })).toThrow('transfer failed');
    expect(channels[0]?.port1.close).toHaveBeenCalledOnce();
    expect(channels[0]?.port2.close).toHaveBeenCalledOnce();
    expect(broker.computeProjectRoot('/home/widget')).toBeUndefined();
  });

  it('forwards a concern context on the same frame as the port', () => {
    const { broker, spawns } = brokerHarness();
    broker.connect('agentHost', { workspaceRoot: '/home/widget' });
    /* The context scopes *this* connection, so it rides the concern frame
     * rather than becoming a replayed control frame. */
    expect(spawns[0]?.postMessage.mock.calls[0]).toEqual([
      { type: 'concern', concern: 'agentHost', context: { workspaceRoot: '/home/widget' } },
      [expect.objectContaining({ id: 'utility' })],
    ]);
  });

  it('releases only the last project attachment and leaves another project served', async () => {
    const { broker, spawns } = brokerHarness();
    broker.retainAgentHost({ workspaceRoot: '/home/a', projectId: 'a', attachmentId: 'window-1' });
    broker.retainAgentHost({ workspaceRoot: '/home/a', projectId: 'a', attachmentId: 'window-2' });
    broker.retainAgentHost({ workspaceRoot: '/home/b', projectId: 'b', attachmentId: 'window-1' });
    broker.connect('agentHost', { workspaceRoot: '/home/a', projectId: 'a' });
    broker.connect('agentHost', { workspaceRoot: '/home/b', projectId: 'b' });

    await broker.releaseAgentHost({ workspaceRoot: '/home/a', projectId: 'a', attachmentId: 'window-1' }, 1000);
    expect(spawns[0]?.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'agent-host-release' }));

    const released = broker.releaseAgentHost(
      { workspaceRoot: '/home/a', projectId: 'a', attachmentId: 'window-2' },
      1000,
    );
    const releaseFrame = spawns[0]?.posted.find(
      (message): message is Record<string, unknown> =>
        typeof message === 'object' &&
        message !== null &&
        'type' in message &&
        message['type'] === 'agent-host-release',
    );
    spawns[0]?.message({ type: 'agent-host-released', requestId: releaseFrame?.['requestId'] });
    await released;

    spawns[0]?.message({ type: 'runtime-port-request', requestId: 'runtime-b', workspaceRoot: '/home/b' });
    expect(spawns[0]?.postMessage).toHaveBeenCalledWith({ type: 'runtime-port', requestId: 'runtime-b' }, [
      { id: 'runtime' },
    ]);
  });

  it('should refuse a stale release once the project was retained again', async () => {
    const { broker, spawns } = brokerHarness();
    /* `${sessionEpoch}:${projectId}` repeats across a remount, so the id alone
     * cannot tell a re-adoption from the attachment that is releasing. */
    const attachmentId = 'window-1';
    broker.retainAgentHost({ workspaceRoot: '/home/a', projectId: 'a', attachmentId });
    broker.connect('agentHost', { workspaceRoot: '/home/a', projectId: 'a' });
    const releasing = broker.releaseAgentHost({ workspaceRoot: '/home/a', projectId: 'a', attachmentId }, 1000);
    const releaseFrame = spawns[0]?.posted.find(
      (message): message is Record<string, unknown> =>
        typeof message === 'object' &&
        message !== null &&
        'type' in message &&
        message['type'] === 'agent-host-release',
    );

    broker.retainAgentHost({ workspaceRoot: '/home/a', projectId: 'a', attachmentId });
    broker.connect('agentHost', { workspaceRoot: '/home/a', projectId: 'a' });

    const reconnectFrame = spawns[0]?.posted.at(-1) as { context?: Record<string, string> } | undefined;
    expect(reconnectFrame?.context?.['attachmentGeneration']).not.toBe(String(releaseFrame?.['attachmentGeneration']));

    spawns[0]?.message({ type: 'agent-host-released', requestId: releaseFrame?.['requestId'] });
    await releasing;

    /* The re-adopted grant survives the release it did not belong to. */
    spawns[0]?.message({ type: 'runtime-port-request', requestId: 'runtime-a', workspaceRoot: '/home/a' });
    expect(spawns[0]?.postMessage).toHaveBeenCalledWith({ type: 'runtime-port', requestId: 'runtime-a' }, [
      { id: 'runtime' },
    ]);
  });

  it('should drop a released attachment when another window retained the project mid-release', async () => {
    const { broker, spawns } = brokerHarness();
    const releaseFrames = (): Array<Record<string, unknown>> =>
      (spawns[0]?.posted ?? []).filter(
        (message): message is Record<string, unknown> =>
          typeof message === 'object' &&
          message !== null &&
          'type' in message &&
          message['type'] === 'agent-host-release',
      );
    broker.retainAgentHost({ workspaceRoot: '/home/a', projectId: 'a', attachmentId: 'window-1' });
    broker.connect('agentHost', { workspaceRoot: '/home/a', projectId: 'a' });
    const releasing = broker.releaseAgentHost(
      { workspaceRoot: '/home/a', projectId: 'a', attachmentId: 'window-1' },
      1000,
    );

    /* A second window adopts the project while window 1's release is in flight,
       so the utility refuses that release — but window 1 is still gone. */
    broker.retainAgentHost({ workspaceRoot: '/home/a', projectId: 'a', attachmentId: 'window-2' });
    spawns[0]?.message({ type: 'agent-host-released', requestId: releaseFrames()[0]?.['requestId'] });
    await releasing;

    const remaining = broker.releaseAgentHost(
      { workspaceRoot: '/home/a', projectId: 'a', attachmentId: 'window-2' },
      1000,
    );
    /* Window 2 is the last holder: its release must reach the utility rather
       than be absorbed by an attachment nobody holds any more. */
    expect(releaseFrames()).toHaveLength(2);
    spawns[0]?.message({ type: 'agent-host-released', requestId: releaseFrames()[1]?.['requestId'] });
    await remaining;

    spawns[0]?.message({ type: 'runtime-port-request', requestId: 'runtime-a', workspaceRoot: '/home/a' });
    expect(spawns[0]?.postMessage).toHaveBeenCalledWith({ type: 'runtime-port-refused', requestId: 'runtime-a' });
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
      /* `rmSync` follows a directory symlink and refuses it; the link itself is
       * what has to go, and before its target so it never dangles. */
      unlinkSync(alias);
      rmSync(canonical, { force: true, recursive: true });
    }
  });

  it('retains one original identity across candidates while keeping projects separate', () => {
    const { broker, connectRuntime, spawns } = brokerHarness();
    broker.connect('agentHost', { workspaceRoot: '/home/a', projectId: 'project-a', computeMode: 'durable' });
    broker.connect('agentHost', { workspaceRoot: '/home/b', projectId: 'project-b', computeMode: 'durable' });
    for (const [workspaceRoot, projectRoot] of [
      ['/home/.tau/checkouts/project-a/one', '/home/a'],
      ['/home/.tau/checkouts/project-a/two', '/home/a'],
      ['/home/.tau/checkouts/project-b/one', '/home/b'],
    ] as const) {
      spawns[0]?.message({ type: 'runtime-context-register', workspaceRoot, projectRoot });
      spawns[0]?.message({ type: 'runtime-port-request', requestId: workspaceRoot, workspaceRoot });
    }

    expect(connectRuntime).toHaveBeenNthCalledWith(1, {
      projectRoot: '/home/.tau/checkouts/project-a/one',
      computeProjectRoot: '/home/a',
      computeMode: 'durable',
      definition: 'default',
    });
    expect(connectRuntime).toHaveBeenNthCalledWith(2, {
      projectRoot: '/home/.tau/checkouts/project-a/two',
      computeProjectRoot: '/home/a',
      computeMode: 'durable',
      definition: 'default',
    });
    expect(connectRuntime).toHaveBeenNthCalledWith(3, {
      projectRoot: '/home/.tau/checkouts/project-b/one',
      computeProjectRoot: '/home/b',
      computeMode: 'durable',
      definition: 'default',
    });
    expect(broker.computeProjectRoot('/home/.tau/checkouts/project-a/one/.')).toBe('/home/a');
    expect(broker.computeProjectRoot('/home/.tau/checkouts/project-b/one')).toBe('/home/b');
  });

  it('mints a runtime port for a candidate turn checkout while it is registered, and not after', () => {
    const { broker, connectRuntime, spawns } = brokerHarness();
    broker.connect('agentHost', { workspaceRoot: '/home/widget', projectId: 'project-widget', computeMode: 'durable' });
    const checkout = '/home/.tau/checkouts/project-widget/trun-1';
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
    broker.connect('agentHost', { workspaceRoot: '/home/widget', projectId: 'project-widget' });
    const checkout = '/home/.tau/checkouts/project-widget/trun-1';
    spawns[0]?.message({ type: 'runtime-context-register', workspaceRoot: checkout, projectRoot: '/home/widget' });
    /* Only the utility that registered a checkout ever releases it, so one that
     * dies mid-turn would otherwise leave the root admissible for the life of
     * the app — over a tree the turn's release already deleted. */
    spawns[0]?.exit();
    broker.connect('agentHost', { workspaceRoot: '/home/widget', projectId: 'project-widget' });
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
    const firstDisposal = broker.dispose();
    expect(broker.dispose()).toBe(firstDisposal);
    const disposal = (async () => {
      await firstDisposal;
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
    expect(broker.quiesce(5000)).toBe(quiescing);
    expect(utility.postMessage).toHaveBeenCalledWith({ type: 'quiesce' });
    expect(utility.kill).not.toHaveBeenCalled();

    utility.message({ type: 'quiesced' });

    await expect(quiescing).resolves.toEqual({ status: 'quiesced' });
    expect(utility.kill).not.toHaveBeenCalled();
  });

  it('cuts at the bound when the utility never answers, so quit is never held open', async () => {
    vi.useFakeTimers();
    try {
      const { broker, spawns } = brokerHarness();
      broker.connect('nodeFs');
      const quiescing = broker.quiesce(1000);
      await vi.advanceTimersByTimeAsync(1100);

      await expect(quiescing).resolves.toEqual({ status: 'timeout' });
      expect(spawns[0]?.kill).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports a utility that died mid-quiesce without claiming its work settled', async () => {
    const { broker, spawns } = brokerHarness();
    broker.connect('nodeFs');
    const quiescing = broker.quiesce(5000);
    spawns[0]!.exit();

    await expect(quiescing).resolves.toEqual({ status: 'host-exited' });
  });

  it('settles an in-flight quiesce as host-exited when forced disposal cuts it', async () => {
    const { broker } = brokerHarness();
    broker.connect('nodeFs');
    const quiescing = broker.quiesce(5000);

    await broker.dispose();

    await expect(quiescing).resolves.toEqual({ status: 'host-exited' });
  });

  it('has nothing to ask when no utility was ever forked', async () => {
    const { broker, fork } = brokerHarness();

    await expect(broker.quiesce(5000)).resolves.toEqual({ status: 'no-utility' });
    expect(fork).not.toHaveBeenCalled();
  });

  it('propagates a typed utility failure and refuses new concern admission', async () => {
    const { broker, spawns } = brokerHarness();
    broker.connect('nodeFs');

    const quiescing = broker.quiesce(5000);
    expect(() => broker.connect('nodeFs')).toThrow(/accepts no new concerns/u);
    spawns[0]!.message({ type: 'quiesce-failed', message: 'checked write drain failed' });

    await expect(quiescing).resolves.toEqual({ status: 'failed', message: 'checked write drain failed' });
  });

  it('ignores a stale utility reply after a replacement was forked', async () => {
    const { broker, spawns } = brokerHarness();
    broker.connect('nodeFs');
    const stale = spawns[0]!;
    stale.exit();
    broker.connect('nodeFs');
    const current = spawns[1]!;

    const quiescing = broker.quiesce(5000);
    stale.message({ type: 'quiesced' });
    current.message({ type: 'quiesce-failed', message: 'current utility failed' });

    await expect(quiescing).resolves.toEqual({ status: 'failed', message: 'current utility failed' });
  });
});
