/**
 * Delay only the selected public report publication for the explicit control arm.
 * @internal
 * @param metric - Public boundary.
 * @returns Actual delay in nanoseconds, zero for ordinary product invocations.
 */
export const plantPublicReport = (metric: string): number => {
  if (process.env['GEOSPEC_CAMPAIGN_PLANT_METRIC'] !== metric) {
    return 0;
  }
  const durationNs = Number(process.env['GEOSPEC_CAMPAIGN_PLANT_NS']);
  if (!Number.isFinite(durationNs) || durationNs <= 0) {
    throw new Error('A positive predeclared public-report plant is required.');
  }
  const start = process.hrtime.bigint();
  const buffer = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(buffer, 0, 0, durationNs / 1_000_000);
  return Number(process.hrtime.bigint() - start);
};
