import { afterEach, describe, expect, it } from 'vitest';
import { parseMachineProvider } from '@taucad/runtime/machine';
import type {
  MachineConnectionRuntime,
  MachineDatagram,
  MachineNetworkRequest,
  MachineNetworkStream,
  MachineSession,
} from '@taucad/runtime/machine';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';

import { carveraMachine } from '#carvera.machine.js';
import type { CarveraSubmission } from '#carvera.manifest.js';
import { carveraRealtime } from '#carvera.protocol.js';
import { createCarveraSimulator } from '#carvera.simulator.js';

const clock = { now: () => new Date().toISOString() };
const datagram = (text: string, address: string): MachineDatagram => ({
  bytes: new TextEncoder().encode(text),
  peer: { address, interface: 'en0', port: 3333 },
});

const sessions: Array<MachineSession<CarveraSubmission>> = [];
const simulators: Array<ReturnType<typeof createCarveraSimulator>> = [];
afterEach(async () => {
  await Promise.all(sessions.splice(0).map(async (session) => session.close()));
  for (const simulator of simulators.splice(0)) {
    simulator.dispose();
  }
});

describe('carveraMachine', () => {
  it('should declare the C1 manifest with every Carvera action designed and stop as the realtime halt', () => {
    const provider = parseMachineProvider(carveraMachine());
    expect(provider.manifest.actions.map(({ componentId, id }) => `${componentId}:${id}`)).toEqual([
      'controller:run.pause',
      'controller:run.resume',
      'controller:run.cancel',
      'controller:controller.unlock',
      'controller:controller.wake',
      'motion:motion.home',
      'motion:motion.jog',
      'motion:motion.move',
      'motion:work-offset.select',
      'motion:work-offset.set',
      'probe:probe.run',
      'tools:tool.change',
      'tool-setter:tool.measure',
      'spindle:spindle.set',
      'light:switch.set',
      'vacuum:switch.set',
      'air:switch.set',
      'feed-override:level.set',
      'spindle-override:level.set',
      'controller:interaction.respond',
      'motion:makera.levelling.clear',
      'probe:makera.probe.pair',
    ]);
    expect(provider.manifest.actions.every(({ qualification }) => qualification.status === 'designed')).toBe(true);
    expect(provider.manifest.holds.map(({ id, lease, bound }) => [id, lease, bound])).toEqual([
      ['motion.jog', 100, 300],
    ]);
    expect(provider.manifest.stop).toMatchObject({ motion: 'halts', spindle: 'stops', position: 'may-be-lost' });
    expect(provider.manifest.actions.find(({ componentId }) => componentId === 'light')?.safety.authority).toBe(
      'agent',
    );
    const pause = provider.manifest.actions.find(({ id }) => id === 'run.pause');
    expect(pause).toMatchObject({
      safety: { authority: 'approved-agent' },
      outcome: { motion: 'finishes-queued', spindle: 'keeps-turning' },
    });
    expect(provider.manifest.jobs).toMatchObject({
      type: 'supported',
      delivery: 'stored',
      start: 'remote',
      accepts: [
        {
          contract: { id: 'tau.toolpath.gcode', version: 1 },
          mediaType: 'text/x.gcode',
          technology: 'subtractive.milling',
          extensions: ['.cnc', '.nc', '.gcode', '.ngc', '.tap'],
        },
      ],
      safety: { authority: 'person', attended: true, interlocks: ['cover', 'estop'] },
    });
  });

  it('should find machines from their broadcasts, pinned to the sender, and skip what is not one', async () => {
    const definition = await resolveRuntimePluginDefinition('machine', carveraMachine());
    const listened: number[] = [];
    const events = [];
    for await (const event of definition.discover(
      { configuration: {}, signal: new AbortController().signal },
      {
        clock,
        async *listenDatagrams(input) {
          listened.push(input.port);
          yield datagram('Workshop Carvera,192.168.1.50,2222,0', '192.168.1.50');
          yield datagram('garbage', '192.168.1.51');
          yield datagram('Workshop Carvera,192.168.1.50,2222,1', '192.168.1.50');
        },
      },
    )) {
      events.push(event);
    }
    expect(listened).toEqual([3333]);
    expect(
      events.map((event) =>
        event.type === 'lost' ? event.type : [event.type, event.candidate.id, event.candidate.name],
      ),
    ).toEqual([
      ['found', 'carvera:192.168.1.50', 'Workshop Carvera'],
      ['updated', 'carvera:192.168.1.50', 'Workshop Carvera'],
    ]);
  });

  it('should take an entered address and port as the candidate without listening, and connect to that port', async () => {
    const definition = await resolveRuntimePluginDefinition('machine', carveraMachine());
    const events = [];
    for await (const event of definition.discover(
      {
        configuration: {},
        endpoint: { transport: 'network', address: '10.0.5.7', port: 2223 },
        signal: new AbortController().signal,
      },
      {
        clock,
        // oxlint-disable-next-line require-yield -- an addressed discovery must not listen
        async *listenDatagrams() {
          throw new Error('listened');
        },
      },
    )) {
      events.push(event);
    }
    expect(events).toMatchObject([
      {
        type: 'found',
        candidate: {
          id: 'carvera:10.0.5.7',
          endpoint: { transport: 'network', address: '10.0.5.7', port: 2223, interface: 'manual' },
        },
      },
    ]);
    const simulator = createCarveraSimulator({ speed: 25, tickInterval: 10 });
    simulators.push(simulator);
    const requests: MachineNetworkRequest[] = [];
    const [found] = events;
    if (found?.type !== 'found') {
      throw new Error('no candidate');
    }
    const session = await definition.connect(
      {
        candidate: found.candidate,
        configuration: {},
        connection: { secretRef: 'none', serviceTrust: {} },
        signal: new AbortController().signal,
      },
      {
        clock,
        log: async () => undefined,
        connectStream: async (request) => {
          requests.push(request);
          return simulator.open();
        },
        async *readArtifact() {
          yield new Uint8Array();
        },
        resolveSecret: async () => '',
      },
    );
    sessions.push(session);
    expect(requests).toMatchObject([{ endpoint: { address: '10.0.5.7', port: 2223 } }]);
  });

  it('should refuse an entered address where no Carvera answers, sending only the status request and leaving nothing to redial', async () => {
    const definition = await resolveRuntimePluginDefinition('machine', carveraMachine());
    const requests: MachineNetworkRequest[] = [];
    const written: number[] = [];
    // Any listener that takes the socket and says nothing, such as another controller's telnet port.
    const silent = (): MachineNetworkStream => {
      const closed = Promise.withResolvers<void>();
      return {
        readable: {
          // oxlint-disable-next-line require-yield -- a silent listener sends nothing until the socket closes
          async *[Symbol.asyncIterator]() {
            await closed.promise;
          },
        },
        write: async (chunk) => {
          written.push(...chunk);
        },
        close: async () => {
          closed.resolve();
        },
      };
    };
    const connecting = definition.connect(
      {
        candidate: {
          id: 'carvera:10.0.5.9',
          name: 'Carvera at 10.0.5.9',
          endpoint: { transport: 'network', address: '10.0.5.9', interface: 'manual' },
          claimedIdentity: { model: 'Carvera' },
          observedAt: clock.now(),
          expiresAt: clock.now(),
        },
        configuration: {},
        connection: { secretRef: 'none', serviceTrust: {} },
        signal: new AbortController().signal,
      },
      {
        clock,
        log: async () => undefined,
        connectStream: async (request) => {
          requests.push(request);
          return silent();
        },
        async *readArtifact() {
          yield new Uint8Array();
        },
        resolveSecret: async () => '',
      },
    );
    await expect(connecting).rejects.toMatchObject({
      code: 'MACHINE_UNAVAILABLE',
      message: expect.stringMatching(/^No Carvera answered at 10\.0\.5\.9:2222\./u) as unknown,
    });
    expect(written).toEqual([...carveraRealtime('?')]);
    // The session is gone: no reconnect timer is left to dial the address again.
    expect(requests).toHaveLength(1);
  }, 10_000);

  it('should connect over TCP 2222 to the bound address and identify the firmware', async () => {
    const simulator = createCarveraSimulator({ speed: 25, tickInterval: 10 });
    simulators.push(simulator);
    const requests: MachineNetworkRequest[] = [];
    const runtime: MachineConnectionRuntime = {
      clock,
      log: async () => undefined,
      connectStream: async (request) => {
        requests.push(request);
        return simulator.open();
      },
      async *readArtifact() {
        yield new Uint8Array();
      },
      resolveSecret: async () => '',
    };
    const definition = await resolveRuntimePluginDefinition('machine', carveraMachine());
    const session = await definition.connect(
      {
        candidate: {
          id: 'carvera:192.168.1.50',
          name: 'Workshop Carvera',
          endpoint: { transport: 'network', address: '192.168.1.50', interface: 'en0' },
          claimedIdentity: { model: 'Carvera' },
          observedAt: clock.now(),
          expiresAt: clock.now(),
        },
        configuration: {},
        connection: { secretRef: 'none', serviceTrust: {} },
        signal: new AbortController().signal,
      },
      runtime,
    );
    sessions.push(session);
    expect(requests).toMatchObject([
      { endpoint: { address: '192.168.1.50', port: 2222 }, transport: 'tcp', idleTimeout: 10_000 },
    ]);
    const descriptor = await session.getDescriptor({ signal: new AbortController().signal });
    expect(descriptor).toMatchObject({ vendor: 'Makera', model: 'Carvera C1', firmware: '1.0.7' });
    const report = await session.getSnapshot({ signal: new AbortController().signal });
    expect(report.connection).toBe('connected');
  });
});
