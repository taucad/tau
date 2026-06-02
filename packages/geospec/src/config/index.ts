/**
 * GeoSpec configuration helpers.
 *
 * @module
 */

/**
 * Default geometry units used when a loader input does not carry explicit units.
 *
 * @public
 */
export type GeoSpecUnit = 'mm' | 'cm' | 'm' | 'in' | 'ft' | (string & {});

/**
 * Tolerance defaults for geometry assertions.
 *
 * @public
 */
export type GeoSpecToleranceConfig = {
  /** Length tolerance in {@link GeoSpecConfig.unit}. */
  length?: number;
  /** Angular tolerance in degrees. */
  angleDegrees?: number;
};

/**
 * Runner defaults for embedded GeoSpec test execution.
 *
 * @public
 */
export type GeoSpecRunnerConfig = {
  /** Test timeout, in milliseconds. */
  testTimeout?: number;
};

/**
 * GeoSpec package configuration.
 *
 * @public
 */
export type GeoSpecConfig = {
  /** Default unit for user-facing measurements. */
  unit?: GeoSpecUnit;
  /** Assertion tolerance defaults. */
  tolerance?: GeoSpecToleranceConfig;
  /** Embedded test runner defaults. */
  runner?: GeoSpecRunnerConfig;
};

/**
 * Define a GeoSpec configuration object with type inference.
 *
 * @param config - GeoSpec configuration.
 * @returns The same configuration object.
 * @public
 */
export function defineGeoSpecConfig<const T extends GeoSpecConfig>(config: T): T {
  return config;
}
