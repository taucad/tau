/* eslint-disable @typescript-eslint/naming-convention -- environment names are SCREAMING_SNAKE */
import { describe, expect, it, vi } from 'vitest';

import { createServicesBroker } from '#main/services-broker.js';
import type { ServicesBrokerOptions } from '#main/services-broker.js';

type Spawned = {
  postMessage: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
  on: (event: 'exit', listener: () => void) => void;
  exit: () => void;
};

const spawnUtility = (): Spawned => {
  const exits: Array<() => void> = [];
  return {
    postMessage: vi.fn(),
    kill: vi.fn(),
    on: (_event, listener) => {
      exits.push(listener);
    },
    exit: () => {
      for (const listener of exits) {
        listener();
      }
    },
  };
};

const brokerHarness = () => {
  const spawns: Spawned[] = [];
  const fork = vi.fn((): Spawned => {
    const utility = spawnUtility();
    spawns.push(utility);
    return utility;
  });
  const options = {
    utilityEntry: '/dist/main/chunks/services-host.js',
    env: { PATH: '/usr/bin' },
    fork,
    createChannel: () => ({ port1: { id: 'renderer' }, port2: { id: 'utility' } }),
  } as unknown as ServicesBrokerOptions;
  return { broker: createServicesBroker(options), fork, spawns };
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
