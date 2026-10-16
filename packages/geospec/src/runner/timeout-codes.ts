/**
 * One timeout vocabulary for every GeoSpec host.
 *
 * GeoSpec has three wall-clock bounds, and each host reports the ones it
 * applies with the same code, so a spec that times out reads the same whether
 * it ran in the browser worker, the Node pool or the CLI:
 *
 * | Code                    | Bound                                         | Set by                                        | Hosts                 |
 * | ----------------------- | --------------------------------------------- | --------------------------------------------- | --------------------- |
 * | `GEOSPEC_TEST_TIMEOUT`  | One test's async body                         | `test_model.testTimeout`, CLI `--test-timeout` | Every host            |
 * | `GEOSPEC_SHARD_TIMEOUT` | One pool shard; its worker is terminated      | CLI `--shard-timeout`, pool `shardTimeout`     | Node pool             |
 * | `GEOSPEC_RUN_TIMEOUT`   | One whole run; completed requirements survive | The host's run budget                          | Browser worker runner |
 *
 * None of them is a geometry verdict: a timed-out requirement is never a pass,
 * and the deterministic work-unit budget inside the engine (`MATCHER_TIMEOUT`)
 * is a separate, non-wall-clock refusal.
 *
 * @module
 */

/**
 * Codes for GeoSpec wall-clock timeouts, one per bound.
 *
 * @public
 */
export const geoSpecTimeoutCode = {
  /** A test's async body outlived `testTimeout` / `--test-timeout`. */
  test: 'GEOSPEC_TEST_TIMEOUT',
  /** A pool shard outlived the non-verdict `--shard-timeout` watchdog. */
  shard: 'GEOSPEC_SHARD_TIMEOUT',
  /** A whole run outlived its host run budget. */
  run: 'GEOSPEC_RUN_TIMEOUT',
} as const;

/** One GeoSpec timeout code. @public */
export type GeoSpecTimeoutCode = (typeof geoSpecTimeoutCode)[keyof typeof geoSpecTimeoutCode];

const timeoutCodes = new Set<string>(Object.values(geoSpecTimeoutCode));

/**
 * Whether a diagnostic or issue code belongs to the GeoSpec timeout family.
 *
 * @param code - Any diagnostic or issue code.
 * @returns True for {@link geoSpecTimeoutCode} values.
 * @public
 */
export const isGeoSpecTimeoutCode = (code: string): code is GeoSpecTimeoutCode => timeoutCodes.has(code);
