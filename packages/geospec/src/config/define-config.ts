import type { GeoSpecConfig } from '#config/types.js';

/**
 * Type a `geospec.config.*` default export: `export default defineConfig({ testTimeout: 60_000 })`.
 *
 * An identity at runtime. The parameter is not generic, so an object literal gets the excess-property
 * and contextual checks `satisfies GeoSpecConfig` gives, in `.ts` and `.js` alike.
 *
 * @public
 * @param config - The project configuration.
 * @returns The same object.
 */
export const defineConfig = (config: GeoSpecConfig): GeoSpecConfig => config;

/**
 * The `geospec/config` module the spec VM provides, so a config evaluated there needs no install.
 * @internal
 */
export const defineConfigBuiltinCode = 'export const defineConfig = (config) => config;\n';
