/** `TAU_ACQUISITION` as a runtime thread or child reads it: `open` or `locked`. @public */
export type Acquisition = 'open' | 'locked';

/**
 * The acquisition profile a CLI runtime composes its bundler with. Only `TAU_ACQUISITION` unset, empty or `open` is
 * `open`; any other value is `locked`, so a value the strict reader (`readManagedPreparation`) would refuse never
 * opens the network in a thread that cannot report it.
 * @param value - The value of `TAU_ACQUISITION`, or of `--acquisition` where the environment is not passed on.
 * @returns The profile.
 */
export const acquisitionOf = (value: string | undefined): Acquisition => {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' || trimmed === 'open' ? 'open' : 'locked';
};
