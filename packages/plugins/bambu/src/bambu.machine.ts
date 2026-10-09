import { defineConfiguration } from '@taucad/runtime/configuration';
import { defineMachine } from '@taucad/runtime/machine';
import { z } from 'zod';

import {
  bambuA1MiniDefinition,
  bambuA1MiniSubmissionConfiguration,
  bambuSubmissionConfiguration,
  bambuX1cDefinition,
} from '#bambu.manifest.js';
import { bambuSettingsConfiguration } from '#bambu.settings.js';

const bindingConfiguration = defineConfiguration({
  id: 'bambu.machine.binding',
  version: '2.0.0',
  schema: z.strictObject({
    logicalId: z.string().min(1).max(64),
    serial: z.string().min(1).max(64).optional(),
    wireForm: z.enum(['a', 'b', 'c']).optional().meta({
      title: 'Command forms (testing)',
      description:
        'Which form to send where Bambu Studio, OrcaSlicer and bambuddy disagree: the external spool and clearing a slot (testing program rows T6, T7, T10, T17). (a) is Bambu Studio’s everywhere; for a load (b) is OrcaSlicer’s and (c) bambuddy’s, for a slot setting (b) is a probe and (c) 254/254, for a clear (b) and (c) are bambuddy’s, for a profile (b) is bambuddy’s.',
    }),
  }),
  ui: { version: 1, rjsf: {} },
});

/** `bambu` physical-machine capability: the X1 Carbon over Developer LAN. @public */
export const bambuMachine = defineMachine({
  id: 'bambu',
  name: 'Bambu Lab Developer LAN',
  version: '2.0.0',
  protocolVersion: 2,
  vendor: 'Bambu Lab',
  manifest: bambuX1cDefinition,
  bindingConfiguration,
  settingsConfiguration: bambuSettingsConfiguration,
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

/** A1 mini physical-machine capability, sharing the pinned Bambu LAN controller.
 * @public
 */
export const bambuA1MiniMachine = defineMachine({
  id: 'bambu-a1-mini',
  name: 'Bambu Lab A1 mini LAN',
  version: '2.0.0',
  protocolVersion: 2,
  vendor: 'Bambu Lab',
  manifest: bambuA1MiniDefinition,
  bindingConfiguration,
  settingsConfiguration: bambuSettingsConfiguration,
  submissionConfiguration: bambuA1MiniSubmissionConfiguration,
  async *discover(input, runtime) {
    const { discoverBambuMachines } = await import('#bambu.host.js');
    yield* discoverBambuMachines(input, runtime, 'A1 mini');
  },
  async connect(input, runtime) {
    const { connectBambuMachine } = await import('#bambu.host.js');
    return connectBambuMachine(input, runtime, 'A1 mini');
  },
});
