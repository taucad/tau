import { defaultMachineProviders } from '@taucad/host';
import type { HostDaemonAgentOptions } from '@taucad/host';

/** The same lazy provider set for CLI hosts and the desktop. */
export const machineProviders = async (): Promise<NonNullable<HostDaemonAgentOptions['machines']>> => ({
  providers: await defaultMachineProviders(),
});
