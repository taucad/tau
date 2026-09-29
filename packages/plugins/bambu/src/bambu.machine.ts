import { defineConfiguration } from '@taucad/runtime/configuration';
import { quantity } from '@taucad/runtime/configuration/zod';
import { defineMachine } from '@taucad/runtime/machine';
import type { MachineAcceptedContainer } from '@taucad/runtime/machine';
import { quantityKinds } from '@taucad/units/quantity';
import { z } from 'zod';

import { bambuX1cManifest } from '#bambu.manifest.js';
import { bambuExternalSpoolSlot } from '#bambu.protocol.js';

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

/** An AMS tray (`ams_id * 4 + tray`) or the external spool, as Bambu numbers them. */
const traySlot = z.union([z.number().int().min(0).max(15), z.literal(bambuExternalSpoolSlot)]);

/** Submission schema shared by the LAN provider and the simulator. @internal */
export const bambuSubmissionConfiguration = defineConfiguration({
  id: 'bambu.machine.submission',
  version: '1.2.0',
  schema: z.object({
    amsMapping: z
      .array(z.union([traySlot, z.literal(-1)]))
      .max(16)
      .default([]),
    bedLeveling: z.boolean().default(true),
    expectedBedType: z.string().min(1).max(64),
    expectedFilamentDiameter: quantity({
      unit: 'mm',
      quantityKind: quantityKinds.diameter,
      space: 'linear',
    }).positive(),
    expectedMaterials: z
      .array(z.strictObject({ slot: traySlot, materialId: z.string().min(1).max(128) }))
      .min(1)
      .max(16),
    expectedModel: z.literal('X1C'),
    expectedNozzleDiameter: quantity({ unit: 'mm', quantityKind: quantityKinds.diameter, space: 'linear' }).positive(),
    operatorConfirmedBedType: z.string().min(1).max(64).optional(),
    flowCalibration: z.boolean().default(true),
    timelapse: z.boolean().default(false),
  }),
  ui: { version: 1, rjsf: {} },
});

/** The one container contract the X1C accepts. @internal */
export const bambuAcceptedContainers: readonly MachineAcceptedContainer[] = [
  {
    contract: { id: 'manufacturing.toolpath.bambu-gcode-3mf', version: 1 },
    mediaType: 'application/vnd.bambulab.gcode-3mf',
    requiredMembers: ['Metadata/plate_1.gcode'],
    payloadSelection: 'plate',
    technology: 'additive.fff',
  },
];

/** `bambu` physical-machine capability. @public */
export const bambuMachine = defineMachine({
  id: 'bambu',
  name: 'Bambu Lab Developer LAN',
  version: '1.0.0',
  protocolVersion: 1,
  vendor: 'Bambu Lab',
  technologies: ['additive.fff'],
  accepts: bambuAcceptedContainers,
  manifest: bambuX1cManifest,
  bindingConfiguration,
  submissionConfiguration: bambuSubmissionConfiguration,
  async *discover(input, runtime) {
    const { discoverBambuMachines } = await import('#bambu.host.js');
    yield* discoverBambuMachines(input, runtime);
  },
  async connect(input, runtime) {
    const { connectBambuMachine } = await import('#bambu.host.js');
    return connectBambuMachine(input, runtime);
  },
});
