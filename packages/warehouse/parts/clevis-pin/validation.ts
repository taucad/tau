/** Numeric domain for a CAD parameter. @internal */
type Domain = {
  readonly min: number;
  readonly max: number;
  readonly integer?: boolean;
  readonly values?: readonly number[];
};

/**
 * Reject unsupported parameter values before calling native geometry.
 * @param parameters - Supplied numeric CAD parameters.
 * @param domains - Supported bounds and discrete values for each parameter.
 * @internal
 */
export function validateParameters(
  parameters: Readonly<Record<string, unknown>>,
  domains: Readonly<Record<string, Domain>>,
): void {
  for (const key of Object.keys(parameters)) {
    if (!Object.hasOwn(domains, key)) {
      throw new RangeError(`Unknown parameter '${key}'. Use the documented parameter names.`);
    }
  }
  for (const [key, domain] of Object.entries(domains)) {
    const value = parameters[key];
    // Continuous decimal endpoints can differ from computed bounds by a rounding ULP.
    const roundingSlack =
      domain.integer === true || domain.values !== undefined
        ? 0
        : 2 * Number.EPSILON * Math.max(1, Math.abs(domain.min), Math.abs(domain.max));
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < domain.min - roundingSlack ||
      value > domain.max + roundingSlack ||
      (domain.integer === true && !Number.isInteger(value)) ||
      (domain.values !== undefined && !domain.values.includes(value))
    ) {
      throw new RangeError(
        `Parameter '${key}' must be ${domain.values ? `one of ${domain.values.join(', ')}` : `${domain.integer ? 'an integer' : 'a finite number'} between ${domain.min} and ${domain.max}`}.`,
      );
    }
  }
}
