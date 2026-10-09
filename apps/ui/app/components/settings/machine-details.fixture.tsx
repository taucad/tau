/**
 * Fixtures for the machine details and Machines settings tests: the `bambu`, `bambu-a1-mini`,
 * `bambu-simulator` and `grbl` providers over the shared v3 manifests (`#components/print/testing/machines.fixture.js`),
 * with the binding configurations those providers declare, admitted through the same `parseMachineProvider` the
 * machines channel applies to `listProviders()`. `apps/ui` depends on no provider package, so the facts are
 * mirrored here. Nothing here touches hardware.
 *
 * @module
 */

import { z } from 'zod';
import { defineConfiguration } from '@taucad/runtime/configuration';
import { parseMachineManifest, parseMachineProvider } from '@taucad/runtime/machine';
import type { MachineDirectoryEntry, MachineProvider } from '@taucad/runtime/machine';
import {
  a1MiniManifest,
  machineEntry,
  routerManifest,
  x1cManifest,
} from '#components/print/testing/machines.fixture.js';

const bindingConfiguration = defineConfiguration({
  id: 'bambu.machine.binding',
  version: '1.0.0',
  schema: z.object({
    logicalId: z.string().min(1).max(64),
    address: z.string().min(1).max(253).optional(),
    serial: z.string().min(1).max(64).optional(),
  }),
  ui: { version: 1, rjsf: {} },
});

const simulatorBindingConfiguration = defineConfiguration({
  id: 'bambu.simulator.binding',
  version: '1.1.0',
  schema: z.object({
    logicalId: z.string().min(1).max(64),
    speed: z.number().min(1).max(3600).default(1).meta({
      title: 'Demo speed',
      description: 'Simulated seconds per real second, so a long print can be watched in minutes',
    }),
  }),
  ui: { version: 1, rjsf: {} },
});

/** The `bambu` LAN provider as `listProviders()` returns it. */
export const x1cProvider: MachineProvider = parseMachineProvider({
  id: 'bambu',
  name: 'Bambu Lab Developer LAN',
  version: '1.0.0',
  protocolVersion: 2,
  vendor: 'Bambu Lab',
  manifest: x1cManifest,
  bindingConfiguration: bindingConfiguration.manifest,
});

/** The `bambu-a1-mini` LAN provider: the A1 mini manifest under the same binding form. */
export const miniProvider: MachineProvider = parseMachineProvider({
  ...x1cProvider,
  id: 'bambu-a1-mini',
  name: 'Bambu Lab A1 mini',
  manifest: a1MiniManifest,
});

/** The labeled `bambu-simulator` provider: the X1C manifest under its own name, qualified only in simulation. */
export const simulatorProvider: MachineProvider = parseMachineProvider({
  id: 'bambu-simulator',
  name: 'Simulated X1C',
  version: '1.0.0',
  protocolVersion: 2,
  vendor: 'Bambu Lab',
  manifest: parseMachineManifest({
    ...x1cManifest,
    identity: { ...x1cManifest.identity, displayName: 'Simulated X1C' },
    qualifications: [
      {
        id: 'simulation',
        environment: 'simulation',
        model: 'X1C',
        firmware: ['simulator-1'],
        attachments: [],
        evidence: 'The simulator speaks the LAN protocol to an in-memory printer.',
      },
    ],
  }),
  bindingConfiguration: simulatorBindingConfiguration.manifest,
});

const grblBindingConfiguration = defineConfiguration({
  id: 'grbl.machine.binding',
  version: '1.0.0',
  schema: z.object({
    logicalId: z.string().min(1).max(64),
    port: z.string().min(1).max(512).optional().meta({ title: 'Serial port' }),
    baudRate: z.number().int().positive().default(115_200).meta({ title: 'Baud rate' }),
  }),
  ui: { version: 1, rjsf: {} },
});

/** The `grbl` provider: a LongMill on a serial port, whose identity is only claimed, so it binds with no code. */
export const grblProvider: MachineProvider = parseMachineProvider({
  id: 'grbl',
  name: 'Grbl LongMill MK2',
  version: '1.0.0',
  protocolVersion: 2,
  vendor: 'Sienci Labs',
  manifest: routerManifest,
  bindingConfiguration: grblBindingConfiguration.manifest,
});

/**
 * One bound X1C as the directory lists it.
 *
 * @param input - The machine id, the provider, the name the person gave it, what it reports about itself and whether
 * Testing is on.
 * @returns A directory entry.
 */
export const boundEntry = ({
  machineId,
  providerId,
  name,
  firmware,
  testing,
}: Readonly<{
  machineId: string;
  providerId: string;
  name: string;
  firmware: string;
  testing?: boolean;
}>): MachineDirectoryEntry => {
  const entry = machineEntry({
    manifest: x1cManifest,
    machineId,
    providerId,
    name,
    firmware,
    ...(testing === undefined ? {} : { testing }),
  });
  /* What the printer reports about itself; the list shows the name the person gave it (blueprint D3). */
  return {
    ...entry,
    descriptor: { ...entry.descriptor, id: `serial-${machineId}`, name: `X1C-${machineId}`, model: 'X1C' },
  };
};

/** The simulated X1C the settings card's "Add simulated X1C" binds. */
export const simulatedEntry = boundEntry({
  machineId: 'simulated-x1c',
  providerId: 'bambu-simulator',
  name: 'Simulated X1C',
  firmware: 'simulator-1',
});

/** A real X1C on the LAN, on qualified firmware. */
export const workshopEntry = boundEntry({
  machineId: 'workshop-x1c',
  providerId: 'bambu',
  name: 'Workshop X1C',
  firmware: '01.08.02.00',
});
