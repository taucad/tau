import { defineConfiguration } from '@taucad/runtime/configuration';
import { defineMachine, machineManifestOf } from '@taucad/runtime/machine';
import type {
  MachineDiscoveryEvent,
  MachineDiscoveryInput,
  MachineDiscoveryRuntime,
  MachineFailureCode,
  MachineSerialPort,
} from '@taucad/runtime/machine';
import { z } from 'zod';

import { grblWorkOffsets, longMillManifest } from '#grbl.manifest.js';

/** How to talk to the controller; where it is plugged in is the discovery endpoint's serial path. @internal */
export const grblBindingConfiguration = defineConfiguration({
  id: 'grbl.machine.binding',
  version: '2.0.0',
  schema: z.object({
    logicalId: z.string().min(1).max(64),
    baudRate: z.number().int().positive().default(115_200).meta({ title: 'Baud rate' }),
  }),
  ui: { version: 1, rjsf: {} },
});

/** The start form: only what the program cannot say. The program, its tools and its extents come from the file. @internal */
export const grblSubmissionConfiguration = defineConfiguration({
  id: 'grbl.machine.submission',
  version: '1.0.0',
  schema: z.object({
    workOffset: z
      .enum(grblWorkOffsets)
      .default('G54')
      .meta({ title: 'Work offset', description: 'The zero this program was set up against.' }),
    toolChange: z.enum(['pause', 'refuse']).default('pause').meta({
      title: 'Bit changes',
      description: 'Grbl cannot change bits. Pause for a person to change it, or refuse a program that asks.',
    }),
  }),
  ui: { version: 1, rjsf: {} },
});

/** USB vendor ids of the serial bridges Grbl boards use: Arduino, CH340, FTDI, Silicon Labs. */
const bridges = new Set(['2341', '1a86', '0403', '10c4', '2a03']);
const candidateLifetime = 30_000;

/**
 * Serial ports that may have a Grbl controller behind them. An addressed port (a person's entry) is offered as it is;
 * without one, the host's port list is read. A host without serial access discovers nothing.
 * @internal
 * @param input - The discovery input; `endpoint` is the serial path a person entered.
 * @param runtime - Discovery services.
 * @yields One candidate per port.
 */
export async function* discoverGrblPorts(
  input: Pick<MachineDiscoveryInput<unknown>, 'endpoint' | 'signal'>,
  runtime: MachineDiscoveryRuntime,
): AsyncIterable<MachineDiscoveryEvent> {
  const { endpoint } = input;
  // ponytail: no port list on this host and no entered port means nothing to offer; the person names one.
  // A network endpoint finds nothing: the host refuses one before it reaches a serial provider.
  const ports: readonly MachineSerialPort[] =
    endpoint === undefined
      ? ((await runtime.listSerialPorts?.({ signal: input.signal })) ?? []).filter(
          (port) => port.vendorId === undefined || bridges.has(port.vendorId),
        )
      : endpoint.transport === 'serial'
        ? [{ path: endpoint.path }]
        : [];
  const observedAt = runtime.clock.now();
  const expiresAt = new Date(Date.parse(observedAt) + candidateLifetime).toISOString();
  for (const port of ports) {
    yield {
      type: 'found',
      candidate: {
        id: `serial:${port.path}`,
        name: `Grbl controller on ${port.path}`,
        endpoint: { transport: 'serial', path: port.path },
        claimedIdentity: {
          ...(port.serialNumber === undefined ? {} : { serial: port.serialNumber }),
          model: 'longmill-mk2-30x30',
        },
        observedAt,
        expiresAt,
      },
    };
  }
}

const manifest = longMillManifest();

/** `grbl` physical-machine capability: a LongMill MK2 30×30 on its LongBoard (Grbl 1.1h) over USB serial. @public */
export const grblMachine = defineMachine({
  id: 'grbl',
  name: 'Grbl CNC router (LongMill MK2)',
  version: '1.0.0',
  protocolVersion: 2,
  vendor: 'Sienci Labs',
  manifest,
  bindingConfiguration: grblBindingConfiguration,
  submissionConfiguration: grblSubmissionConfiguration,
  discover: discoverGrblPorts,
  async connect(input, runtime) {
    if (runtime.openSerial === undefined) {
      throw Object.assign(new Error('This host has no serial access, so it cannot reach a Grbl controller.'), {
        code: 'MACHINE_UNAVAILABLE' satisfies MachineFailureCode,
      });
    }
    const { endpoint } = input.candidate;
    if (endpoint.transport !== 'serial') {
      throw Object.assign(new Error('A Grbl controller is reached over a serial port, not the network.'), {
        code: 'MACHINE_UNAVAILABLE' satisfies MachineFailureCode,
      });
    }
    // Opening the port toggles DTR, which restarts an Uno: Grbl comes back locked until it homes.
    const stream = await runtime.openSerial({
      path: endpoint.path,
      baudRate: input.configuration.baudRate,
      maximumReadBytes: 1024 * 1024,
      maximumWriteBytes: 1024 * 1024,
      signal: input.signal,
    });
    const { openGrblSession } = await import('#grbl.session.js');
    return openGrblSession({
      stream,
      runtime,
      manifest: machineManifestOf(manifest, grblSubmissionConfiguration.manifest),
      // The host binds the claimed serial as the physical identity; the session must report the same.
      id: input.candidate.claimedIdentity.serial ?? input.candidate.id,
      name: input.candidate.name,
      signal: input.signal,
    });
  },
});
