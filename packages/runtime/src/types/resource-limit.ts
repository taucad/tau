import type { ResourceLimitDetails } from '#types/runtime.types.js';

const demandKinds = new Set(['measured', 'estimated']);
const origins = new Set<unknown>(['default', 'host-option', 'profile'] satisfies Array<ResourceLimitDetails['origin']>);

const isBoundedString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 128;

/**
 * Read a {@link ResourceLimitDetails} that crossed a trust or version boundary.
 *
 * A value of any other shape yields `undefined`, never a guess, so an older or
 * third-party producer reads as "no limit details".
 *
 * @param details - A `KernelIssue.details`, or a supervisor's relayed `exceeded`.
 * @returns A fresh copy of the details with only the known fields, or `undefined`.
 * @internal
 */
export const readResourceLimit = (details: unknown): ResourceLimitDetails | undefined => {
  if (typeof details !== 'object' || details === null) {
    return undefined;
  }
  const { limit, unit, maximum, demand, origin } = details as Record<string, unknown>;
  if (!isBoundedString(limit) || !isBoundedString(unit) || typeof maximum !== 'number' || !Number.isFinite(maximum)) {
    return undefined;
  }
  if (!origins.has(origin) || typeof demand !== 'object' || demand === null) {
    return undefined;
  }
  const { kind, value } = demand as Record<string, unknown>;
  let readDemand: ResourceLimitDetails['demand'];
  if (kind === 'unknown') {
    readDemand = { kind };
  } else if (demandKinds.has(kind as string) && typeof value === 'number' && Number.isFinite(value)) {
    readDemand = { kind: kind as 'measured' | 'estimated', value };
  } else {
    return undefined;
  }
  return { limit, unit, maximum, demand: readDemand, origin: origin as ResourceLimitDetails['origin'] };
};
