import type { HostDaemonAgentOptions } from '@taucad/host';

/**
 * The machine providers `--machines` serves (`tau serve`, `tau mcp`): the Bambu Lab X1C and A1 mini, and the X1C's
 * socket-free simulator, the operator's dry-run device. Loaded on demand so a host without the flag never touches
 * the vendor package.
 *
 * @returns The providers, as the daemon's machines option.
 */
export const machineProviders = async (): Promise<NonNullable<HostDaemonAgentOptions['machines']>> => {
  const { bambuA1MiniMachine, bambuMachine, bambuSimulatorMachine } = await import('@taucad/bambu');
  return { providers: [bambuMachine(), bambuA1MiniMachine(), bambuSimulatorMachine()] };
};
