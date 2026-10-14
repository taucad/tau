/**
 * Resolve the deployment opt-in; absent, malformed and false values keep machines disabled.
 * @public
 */
export const isMachinesFeatureEnabled = (value: unknown): boolean =>
  value === true || (typeof value === 'string' && /^(1|true)$/iu.test(value));

/**
 * Explain a machine capability withheld by deployment policy.
 * @public
 */
export const machinesDisabledMessage = 'Machines are not available in this release.';
