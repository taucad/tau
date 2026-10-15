import { parseMachineManifest } from '@taucad/runtime/machine';
import type { MachineConnectionRuntime, MachineDiscoveryRuntime } from '@taucad/runtime/machine';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { describe, expect, it } from 'vitest';

import { grblBindingConfiguration, grblMachine } from '#grbl.machine.js';
import { VirtualGrbl, createVirtualGrblStream, grblSimulatorMachine } from '#grbl.simulator.js';

const clock = { now: () => '2026-10-05T00:00:00.000Z' };
const discovery = (ports?: MachineDiscoveryRuntime['listSerialPorts']): MachineDiscoveryRuntime => ({
  clock,
  async *listenDatagrams() {
    yield* [];
  },
  ...(ports === undefined ? {} : { listSerialPorts: ports }),
});
const collect = async <Value>(iterable: AsyncIterable<Value>): Promise<Value[]> => {
  const values: Value[] = [];
  for await (const value of iterable) {
    values.push(value);
  }
  return values;
};

describe('grblMachine', () => {
  it('declares the LongMill with every action designed and the simulator with every action qualified', () => {
    const real = parseMachineManifest(grblMachine().manifest);
    expect(real.identity).toMatchObject({ typeId: 'sienci.longmill-mk2-30x30', vendor: 'Sienci Labs' });
    expect(real.connection).toEqual({
      transport: 'serial',
      exclusive: true,
      opening: 'resets-controller',
      identity: 'claimed',
    });
    expect([...real.actions, ...real.holds].every((action) => action.qualification.status === 'designed')).toBe(true);
    expect(real.jobs).toMatchObject({
      type: 'supported',
      delivery: 'streamed',
      start: 'at-machine',
      accepts: [{ extensions: ['.gcode', '.gc', '.nc', '.tap', '.cnc'] }],
    });
    expect(real.stop).toMatchObject({ position: 'kept', spindle: 'stops' });
    expect(real.holds[0]).toMatchObject({ id: 'motion.jog', lease: 100, bound: 150 });
    const simulated = parseMachineManifest(grblSimulatorMachine().manifest);
    expect(simulated.qualifications).toEqual([expect.objectContaining({ environment: 'simulation' })]);
    expect(
      [...simulated.actions, ...simulated.holds].every((action) => action.qualification.status === 'qualified'),
    ).toBe(true);
    expect(simulated.actions.map((action) => action.id)).toContain('grbl-simulator.lid.press');
  });

  it('offers likely Grbl serial ports, an entered port, or nothing on a host without serial access', async () => {
    // Settings finds with an empty configuration; the name is given at bind, not here.
    expect(grblBindingConfiguration.schema.parse({})).toEqual({ baudRate: 115_200 });
    const definition = await resolveRuntimePluginDefinition('machine', grblMachine());
    const { signal } = new AbortController();
    const listed = await collect(
      definition.discover(
        { configuration: { baudRate: 115_200 }, signal },
        discovery(async () => [
          { path: '/dev/tty.usbmodem1101', vendorId: '2341', serialNumber: 'A1' },
          { path: '/dev/tty.Bluetooth-Incoming-Port', vendorId: '05ac' },
        ]),
      ),
    );
    expect(
      listed.map((event) =>
        event.type === 'lost' ? undefined : [event.candidate.id, event.candidate.claimedIdentity],
      ),
    ).toEqual([['serial:/dev/tty.usbmodem1101', { serial: 'A1', model: 'longmill-mk2-30x30' }]]);
    expect(await collect(definition.discover({ configuration: { baudRate: 115_200 }, signal }, discovery()))).toEqual(
      [],
    );
    const entered = await collect(
      definition.discover(
        {
          configuration: { baudRate: 115_200 },
          endpoint: { transport: 'serial', path: 'COM3' },
          signal,
        },
        discovery(),
      ),
    );
    expect(entered).toMatchObject([{ type: 'found', candidate: { endpoint: { transport: 'serial', path: 'COM3' } } }]);
  });

  it('opens the candidate port through the host and refuses a host without serial access', async () => {
    const definition = await resolveRuntimePluginDefinition('machine', grblMachine());
    const candidate = {
      id: 'serial:/dev/tty.usbmodem1101',
      name: 'Grbl',
      endpoint: { transport: 'serial', path: '/dev/tty.usbmodem1101' } as const,
      claimedIdentity: {},
      observedAt: clock.now(),
      expiresAt: clock.now(),
    };
    const input = {
      candidate,
      // As a binding an earlier build stored it, with `logicalId`: the host hands a stored configuration over
      // without re-parsing it, and the provider reads only what it needs.
      configuration: { logicalId: 'garage', baudRate: 115_200 },
      connection: { secretRef: '', serviceTrust: {} },
      purpose: 'reconnect',
      signal: new AbortController().signal,
    } as const;
    const runtime: MachineConnectionRuntime = {
      clock,
      log: async () => undefined,
      connectStream: async () => {
        throw new Error('No network in this test.');
      },
      async *readArtifact() {
        yield* [];
      },
      resolveSecret: async () => '',
    };
    await expect(definition.connect(input, runtime)).rejects.toMatchObject({ code: 'MACHINE_UNAVAILABLE' });
    const opened: unknown[] = [];
    // Never a real port: the host's serial opener hands back the virtual controller.
    const session = await definition.connect(input, {
      ...runtime,
      openSerial: async (request) => {
        opened.push({ path: request.path, baudRate: request.baudRate });
        return createVirtualGrblStream(new VirtualGrbl({ speed: 20, tick: 5 }));
      },
    });
    expect(opened).toEqual([{ path: '/dev/tty.usbmodem1101', baudRate: 115_200 }]);
    const report = await session.getSnapshot({ signal: new AbortController().signal });
    // A stock LongMill has no homing switches, so it powers up unlocked.
    expect(report.state.status).toBe('ready');
    await session.close();
  });
});
