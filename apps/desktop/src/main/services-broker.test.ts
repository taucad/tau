/* eslint-disable @typescript-eslint/naming-convention -- environment names are SCREAMING_SNAKE */
import { mkdtempSync, realpathSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  createServicesBroker,
  rendererServicesConcerns,
  servicesConcerns,
  ServicesQuiescingError,
} from '#main/services-broker.js';
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
  const log = vi.fn();
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
  const connectGeometry = vi.fn(
    (
      _input: Readonly<{
        root: string;
        context: Readonly<Record<string, string>>;
        stillAuthorized: () => boolean;
      }>,
    ) => ({ id: 'geometry' }),
  );
  const revokeGeometry = vi.fn();
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
    connectGeometry,
    revokeGeometry,
    log,
  } as unknown as ServicesBrokerOptions;
  return {
    broker: createServicesBroker(options),
    channels,
    connectRuntime,
    connectGeometry,
    revokeGeometry,
    fork,
    log,
    runtimeExits,
    spawns,
  };
};

describe('createServicesBroker', () => {
  it('keeps the rooted runtime filesystem concern main-only', () => {
    expect(servicesConcerns).toContain('runtimeFileSystem');
    expect(servicesConcerns).not.toContain('exactMeasurement');
    expect(servicesConcerns).not.toContain('geospecPerformance');
    expect(rendererServicesConcerns).toEqual([
      'nodeFs',
      'agentHost',
      'geospecPerformance',
      'exactMeasurement',
      'machines',
    ]);
  });

  it('grants geometry runner ports only for registered project roots', () => {
    const { broker, connectGeometry, spawns } = brokerHarness();
    broker.connect('agentHost', { workspaceRoot: '/projects/widget', projectId: 'widget', computeMode: 'memory' });
    const utility = spawns[0]!;
    utility.message({
      type: 'geometry-port-request',
      requestId: 'wrong',
      workspaceRoot: '/projects/other',
    });
    expect(connectGeometry).not.toHaveBeenCalled();
    expect(utility.posted.at(-1)).toEqual({
      type: 'geometry-port-refused',
      requestId: 'wrong',
      message: 'Main refused an unadmitted GeoSpec runner root.',
    });
    utility.message({
      type: 'geometry-port-request',
      requestId: 'allowed',
      workspaceRoot: '/projects/widget',
    });
    expect(connectGeometry.mock.calls[0]?.[0]).toMatchObject({
      root: '/projects/widget',
      context: { projectRoot: '/projects/widget' },
    });
    expect(utility.postMessage).toHaveBeenLastCalledWith({ type: 'geometry-port', requestId: 'allowed' }, [
      expect.objectContaining({ id: 'geometry' }),
    ]);
  });

  it('keeps a geometry grant through an equivalent agent-host reconnect but revokes on compute change', () => {
    const { broker, connectGeometry, revokeGeometry, spawns } = brokerHarness();
    broker.connect('agentHost', { workspaceRoot: '/home/widget', projectId: 'widget', computeMode: 'durable' });
    spawns[0]!.message({
      type: 'geometry-port-request',
      requestId: 'suite',
      workspaceRoot: '/home/widget',
    });
    const grant = connectGeometry.mock.calls[0]?.[0];
    expect(grant?.stillAuthorized()).toBe(true);
    revokeGeometry.mockClear();

    broker.retainAgentHost({ workspaceRoot: '/home/widget', projectId: 'widget', attachmentId: 'second-window' });
    broker.connect('agentHost', { workspaceRoot: '/home/widget/.', projectId: 'widget', computeMode: 'durable' });
    expect(grant?.stillAuthorized()).toBe(true);
    expect(revokeGeometry).not.toHaveBeenCalled();

    broker.connect('agentHost', { workspaceRoot: '/home/widget', projectId: 'widget', computeMode: 'off' });
    expect(grant?.stillAuthorized()).toBe(false);
    expect(revokeGeometry).toHaveBeenCalledOnce();
  });

  it('revokes a geometry grant when an agent-host reconnect changes the project identity', () => {
    const { broker, connectGeometry, revokeGeometry, spawns } = brokerHarness();
    broker.connect('agentHost', { workspaceRoot: '/home/widget', projectId: 'widget-a', computeMode: 'durable' });
    spawns[0]!.message({
      type: 'geometry-port-request',
      requestId: 'suite',
      workspaceRoot: '/home/widget',
    });
    const grant = connectGeometry.mock.calls[0]?.[0];
    revokeGeometry.mockClear();

    broker.retainAgentHost({ workspaceRoot: '/home/widget', projectId: 'widget-b', attachmentId: 'new-project' });
    broker.connect('agentHost', { workspaceRoot: '/home/widget', projectId: 'widget-b', computeMode: 'durable' });
    expect(grant?.stillAuthorized()).toBe(false);
    expect(revokeGeometry).toHaveBeenCalledOnce();
  });

  it('does not treat a failed project-owner transfer as an admitted geometry grant', () => {
    const { broker, connectGeometry, revokeGeometry, spawns } = brokerHarness();
    broker.connect('agentHost', { workspaceRoot: '/home/widget', projectId: 'widget-a', computeMode: 'durable' });
    spawns[0]!.message({
      type: 'geometry-port-request',
      requestId: 'suite',
      workspaceRoot: '/home/widget',
    });
    const grant = connectGeometry.mock.calls[0]?.[0];
    revokeGeometry.mockClear();
    spawns[0]!.postMessage.mockImplementationOnce(() => {
      throw new Error('transfer failed');
    });

    expect(() =>
      broker.connect('agentHost', { workspaceRoot: '/home/widget', projectId: 'widget-b', computeMode: 'durable' }),
    ).toThrow('transfer failed');
    expect(grant?.stillAuthorized()).toBe(true);
    expect(revokeGeometry).not.toHaveBeenCalled();

    broker.connect('agentHost', { workspaceRoot: '/home/widget', projectId: 'widget-b', computeMode: 'durable' });
    expect(grant?.stillAuthorized()).toBe(false);
    expect(revokeGeometry).toHaveBeenCalledOnce();
  });

  it('signals geometry to abort an admitted suite when its candidate grant is released', () => {
    const { broker, connectGeometry, revokeGeometry, spawns } = brokerHarness();
    broker.connect('agentHost', { workspaceRoot: '/home/widget', projectId: 'project-widget', computeMode: 'durable' });
    const checkout = '/home/.tau/checkouts/project-widget/trun-1';
    spawns[0]!.message({ type: 'runtime-context-register', workspaceRoot: checkout, projectRoot: '/home/widget' });
    spawns[0]!.message({
      type: 'geometry-port-request',
      requestId: 'suite',
      workspaceRoot: checkout,
    });
    const grant = connectGeometry.mock.calls[0]?.[0];
    expect(grant?.stillAuthorized()).toBe(true);
    revokeGeometry.mockClear();
    spawns[0]!.message({ type: 'runtime-context-release', workspaceRoot: checkout, projectRoot: '/home/widget' });
    expect(grant?.stillAuthorized()).toBe(false);
    expect(revokeGeometry).toHaveBeenCalledOnce();
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

  it('should complete a machine binding through the utility and settle on its own answer', async () => {
    const { broker, spawns } = brokerHarness();
    const bindingFrames = (): Array<Record<string, unknown>> =>
      (spawns[0]?.posted ?? []).filter(
        (message): message is Record<string, unknown> =>
          typeof message === 'object' &&
          message !== null &&
          'type' in message &&
          message['type'] === 'machine-binding-complete',
      );

    const bound = broker.completeMachineBinding(
      { ceremonyId: 'ceremony-1', address: '10.0.0.5', accessCode: '1234' },
      1000,
    );
    /* The secret rides the utility frame and nothing else: no renderer relay,
     * no log line, one control frame to the process that keeps it. */
    expect(bindingFrames()[0]).toMatchObject({ ceremonyId: 'ceremony-1', address: '10.0.0.5', accessCode: '1234' });
    spawns[0]?.message({
      type: 'machine-binding-completed',
      requestId: bindingFrames()[0]?.['requestId'],
      outcome: { status: 'bound', machineId: 'bambu:sim' },
    });
    await expect(bound).resolves.toEqual({ status: 'bound', machineId: 'bambu:sim' });

    const failed = broker.completeMachineBinding({ ceremonyId: 'ceremony-2' }, 1000);
    spawns[0]?.message({
      type: 'machine-binding-complete-failed',
      requestId: bindingFrames()[1]?.['requestId'],
      message: 'MACHINE_BINDING_UNKNOWN',
    });
    await expect(failed).rejects.toThrow('MACHINE_BINDING_UNKNOWN');

    /* The host's typed code survives the relay beside its message. */
    const refused = broker.completeMachineBinding({ ceremonyId: 'ceremony-3' }, 1000);
    spawns[0]?.message({
      type: 'machine-binding-complete-failed',
      requestId: bindingFrames()[2]?.['requestId'],
      message: 'Enter the access code shown on the machine.',
      code: 'MACHINE_CREDENTIAL_REQUIRED',
    });
    await expect(refused).rejects.toMatchObject({
      message: 'Enter the access code shown on the machine.',
      code: 'MACHINE_CREDENTIAL_REQUIRED',
    });
  });

  it('should ask a running utility which machines a program streams to, and answer none without one', async () => {
    const { broker, spawns } = brokerHarness();
    /* Asking never spawns a utility: one that is not running feeds nothing. */
    await expect(broker.streamingMachines(1000)).resolves.toEqual([]);
    expect(spawns).toHaveLength(0);

    broker.connect('nodeFs');
    const asked = broker.streamingMachines(1000);
    const question = (spawns[0]?.posted ?? []).find(
      (message): message is Record<string, unknown> =>
        typeof message === 'object' &&
        message !== null &&
        'type' in message &&
        message['type'] === 'machines-streaming',
    );
    spawns[0]?.message({
      type: 'machines-streaming-answered',
      requestId: question?.['requestId'],
      machines: ['LongMill'],
    });
    await expect(asked).resolves.toEqual(['LongMill']);

    /* Main calls the quit off: the running utility hears it once. */
    broker.resumeMachineStarts();
    const resumes = (spawns[0]?.posted ?? []).filter(
      (message) =>
        typeof message === 'object' && message !== null && 'type' in message && message.type === 'machines-resume',
    );
    expect(resumes).toEqual([{ type: 'machines-resume' }]);
  });

  it('should peek at the streaming machines for keep-awake with a read-only question, never forking a utility', async () => {
    const { broker, spawns } = brokerHarness();
    await expect(broker.peekStreamingMachines(1000)).resolves.toEqual([]);
    expect(spawns).toHaveLength(0);

    broker.connect('nodeFs');
    const peeked = broker.peekStreamingMachines(1000);
    const types = (spawns[0]?.posted ?? []).map((message) =>
      typeof message === 'object' && message !== null && 'type' in message ? message.type : undefined,
    );
    /* Never quit's question, which would hold the utility's starts. */
    expect(types).toContain('machines-streaming-peek');
    expect(types).not.toContain('machines-streaming');
    const question = (spawns[0]?.posted ?? []).find(
      (message): message is Record<string, unknown> =>
        typeof message === 'object' &&
        message !== null &&
        'type' in message &&
        message.type === 'machines-streaming-peek',
    );
    spawns[0]?.message({
      type: 'machines-streaming-answered',
      requestId: question?.['requestId'],
      machines: ['Router'],
    });
    await expect(peeked).resolves.toEqual(['Router']);
  });

  it('should never replay or log an access code, and complete without one when none was typed', async () => {
    const { broker, log, spawns } = brokerHarness();
    const bindingFrames = (spawned: Spawned | undefined): Array<Record<string, unknown>> =>
      (spawned?.posted ?? []).filter(
        (message): message is Record<string, unknown> =>
          typeof message === 'object' &&
          message !== null &&
          'type' in message &&
          message['type'] === 'machine-binding-complete',
      );
    broker.post({ type: 'allowRoots', roots: ['/home'] });

    const typed = broker.completeMachineBinding({ ceremonyId: 'ceremony-1', accessCode: '12345678' }, 1000);
    spawns[0]?.message({
      type: 'machine-binding-completed',
      requestId: bindingFrames(spawns[0])[0]?.['requestId'],
      outcome: { status: 'bound', machineId: 'workshop-x1c' },
    });
    await expect(typed).resolves.toEqual({ status: 'bound', machineId: 'workshop-x1c' });

    /* A fresh fork gets every control frame replayed, and never the code. */
    spawns[0]?.exit();
    broker.connect('nodeFs');
    expect(spawns[1]?.posted).toContainEqual({ type: 'allowRoots', roots: ['/home'] });
    expect(JSON.stringify(spawns[1]?.posted)).not.toContain('12345678');

    /* A saved code is the utility's to reuse: main sends no code at all. */
    const reused = broker.completeMachineBinding({ ceremonyId: 'ceremony-2' }, 1000);
    const [reuseFrame] = bindingFrames(spawns[1]);
    expect(reuseFrame).toMatchObject({ ceremonyId: 'ceremony-2' });
    expect(reuseFrame).not.toHaveProperty('accessCode');
    spawns[1]?.message({
      type: 'machine-binding-completed',
      requestId: reuseFrame?.['requestId'],
      outcome: { status: 'bound', machineId: 'workshop-x1c' },
    });
    await expect(reused).resolves.toEqual({ status: 'bound', machineId: 'workshop-x1c' });
    expect(JSON.stringify(log.mock.calls)).not.toContain('12345678');
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
    expect(spawns[0]?.postMessage).toHaveBeenCalledWith({
      type: 'runtime-port-refused',
      requestId: 'runtime-a',
      message: 'The desktop shell has not admitted /home/a as a runtime root.',
    });
  });

  /*
   * The last holder is dropped up front, whatever the utility answers — so a
   * release that times out (or that the utility reports as failed) still ends
   * with nobody holding this root. Leaving its rows behind left
   * `computeProjectRoot` answering for a root no window holds, and the next
   * runtime port was minted off that stale grant (R3-F5).
   */
  it('should leave no stale project state when a release times out', async () => {
    const { broker, spawns } = brokerHarness();
    broker.retainAgentHost({ workspaceRoot: '/home/a', projectId: 'a', attachmentId: 'window-1' });
    broker.connect('agentHost', { workspaceRoot: '/home/a', projectId: 'a', computeMode: 'durable' });
    expect(broker.computeProjectRoot('/home/a')).toBe('/home/a');

    // The utility never answers this release.
    await expect(
      broker.releaseAgentHost({ workspaceRoot: '/home/a', projectId: 'a', attachmentId: 'window-1' }, 0),
    ).rejects.toThrow('timed out');

    expect(broker.computeProjectRoot('/home/a')).toBeUndefined();
    spawns[0]?.message({ type: 'runtime-port-request', requestId: 'runtime-a', workspaceRoot: '/home/a' });
    expect(spawns[0]?.postMessage).toHaveBeenCalledWith({
      type: 'runtime-port-refused',
      requestId: 'runtime-a',
      message: 'The desktop shell has not admitted /home/a as a runtime root.',
    });
  });

  /* L6 N3 / W0.11: a release that outlives its deadline may still be closing
   * in the utility. Had main restarted the root's generation, the next
   * adoption would reuse that release's number and the stale release would
   * pass the utility's checks and delete the new session's launcher. */
  it('never reuses a timed-out release generation for the next adoption', async () => {
    const { broker, spawns } = brokerHarness();
    const posted = (): Array<Record<string, unknown>> =>
      (spawns[0]?.posted ?? []).filter(
        (message): message is Record<string, unknown> => typeof message === 'object' && message !== null,
      );
    broker.retainAgentHost({ workspaceRoot: '/home/a', projectId: 'a', attachmentId: 'window-1' });
    broker.connect('agentHost', { workspaceRoot: '/home/a', projectId: 'a' });
    await expect(
      broker.releaseAgentHost({ workspaceRoot: '/home/a', projectId: 'a', attachmentId: 'window-1' }, 0),
    ).rejects.toThrow('timed out');
    const staleGeneration = posted().find((message) => message['type'] === 'agent-host-release')?.[
      'attachmentGeneration'
    ];

    broker.retainAgentHost({ workspaceRoot: '/home/a', projectId: 'a', attachmentId: 'window-1' });
    broker.connect('agentHost', { workspaceRoot: '/home/a', projectId: 'a' });

    const remount = posted().at(-1) as { context?: Record<string, string> };
    expect(Number(remount.context?.['attachmentGeneration'])).toBeGreaterThan(Number(staleGeneration));
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
    expect(spawns[0]?.postMessage).toHaveBeenCalledWith({
      type: 'runtime-port-refused',
      requestId: 'runtime-2',
      message: 'The desktop shell has not admitted /home/other as a runtime root.',
    });
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
    expect(spawns[0]?.postMessage).toHaveBeenCalledWith({
      type: 'runtime-port-refused',
      requestId: 'runtime-2',
      message: `The desktop shell has not admitted ${checkout} as a runtime root.`,
    });
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

    expect(spawns[1]?.postMessage).toHaveBeenCalledWith({
      type: 'runtime-port-refused',
      requestId: 'runtime-1',
      message: `The desktop shell has not admitted ${checkout} as a runtime root.`,
    });
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

  it('should name the cause of a runtime refusal it decides on its own', async () => {
    const { broker, spawns } = brokerHarness();
    broker.connect('agentHost', { workspaceRoot: '/home/widget' });
    const stale = spawns[0];
    /* A utility that died mid-turn: main forked its successor, and the corpse's
     * late request must not read as an unadmitted root. */
    stale?.exit();
    broker.connect('agentHost', { workspaceRoot: '/home/widget' });
    stale?.message({ type: 'runtime-port-request', requestId: 'runtime-stale', workspaceRoot: '/home/widget' });

    expect(stale?.postMessage).toHaveBeenCalledWith({
      type: 'runtime-port-refused',
      requestId: 'runtime-stale',
      message: 'A superseded services utility asked for a runtime port.',
    });

    const disposal = broker.dispose();
    spawns[1]?.message({ type: 'runtime-port-request', requestId: 'runtime-late', workspaceRoot: '/home/widget' });

    expect(spawns[1]?.postMessage).toHaveBeenCalledWith({
      type: 'runtime-port-refused',
      requestId: 'runtime-late',
      message: 'The desktop services broker is quiescing and connects no new runtimes.',
    });
    await disposal;
  });

  it('refuses a duplicate live runtime request identity without overwriting its lease', () => {
    const { broker, connectRuntime, spawns } = brokerHarness();
    broker.connect('agentHost', { workspaceRoot: '/home/widget' });
    const request = { type: 'runtime-port-request', requestId: 'runtime-1', workspaceRoot: '/home/widget' };
    spawns[0]?.message(request);
    spawns[0]?.message(request);

    expect(connectRuntime).toHaveBeenCalledOnce();
    expect(spawns[0]?.postMessage).toHaveBeenCalledWith({
      type: 'runtime-port-refused',
      requestId: 'runtime-1',
      message: 'A live runtime lease already holds this request identity.',
    });
  });

  it('should carry the reason a runtime connection failed back to the requesting utility', () => {
    const { broker, connectRuntime, spawns } = brokerHarness();
    broker.connect('agentHost', { workspaceRoot: '/home/widget' });
    connectRuntime.mockImplementationOnce(() => {
      throw new Error('registerElectronRuntimeMain: refusing to exceed 64 utility processes');
    });

    spawns[0]?.message({ type: 'runtime-port-request', requestId: 'runtime-1', workspaceRoot: '/home/widget' });

    /* Without the message the agent's tool error says only that main refused;
     * the cap it refused at lives in main's log, which no client reads. */
    expect(spawns[0]?.postMessage).toHaveBeenCalledWith({
      type: 'runtime-port-refused',
      requestId: 'runtime-1',
      message: 'registerElectronRuntimeMain: refusing to exceed 64 utility processes',
    });
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
    expect(utility.postMessage).toHaveBeenCalledWith({ type: 'quiesce', quitIfStreamingUnknown: false });
    expect(utility.kill).not.toHaveBeenCalled();

    utility.message({ type: 'quiesced' });

    await expect(quiescing).resolves.toEqual({ status: 'quiesced' });
    expect(utility.kill).not.toHaveBeenCalled();
  });

  it('reports a refusal over a streamed run, serves again, and asks again on the next quit', async () => {
    const { broker, spawns } = brokerHarness();
    broker.connect('nodeFs');
    const utility = spawns[0]!;

    const refused = broker.quiesce(5000);
    utility.message({ type: 'quiesce-refused', reason: 'streaming', machines: ['LongMill'] });
    await expect(refused).resolves.toEqual({ status: 'streaming', machines: ['LongMill'] });
    expect(() => broker.connect('nodeFs')).not.toThrow();

    const unknown = broker.quiesce(5000);
    expect(unknown).not.toBe(refused);
    utility.message({ type: 'quiesce-refused', reason: 'streaming-unknown', message: 'The store is busy.' });
    await expect(unknown).resolves.toEqual({ status: 'streaming-unknown', message: 'The store is busy.' });

    const anyway = broker.quiesce(5000, { quitIfStreamingUnknown: true });
    expect(utility.postMessage).toHaveBeenLastCalledWith({ type: 'quiesce', quitIfStreamingUnknown: true });
    utility.message({ type: 'quiesced' });
    await expect(anyway).resolves.toEqual({ status: 'quiesced' });
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
    /* Typed, so main answers it as shutdown rather than as a failed connection. */
    expect(() => broker.connect('nodeFs')).toThrow(ServicesQuiescingError);
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
