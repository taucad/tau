import type { MachineRequester } from '@taucad/runtime/machine';

/**
 * Who the pane acts as: the person at this computer. Its own module so an approval answered from the composer does
 * not bring the machine controls and the units catalog onto the interactive tier (progressive loading PL5).
 *
 * @public
 */
export const operator: MachineRequester = { kind: 'user', id: 'operator', label: 'You' };
