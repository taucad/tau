/**
 * The Tau project config type and its authoring helper.
 *
 * @module
 */

import type { PluginInstance } from '#plugins/plugin.js';

/**
 * A Tau project config.
 *
 * @public
 */
export type TauConfig = {
  /**
   * Invoked plugin instances in kernel precedence order. An instance replaces the host's
   * built-in plugin of the same name and is appended otherwise.
   */
  readonly plugins?: readonly PluginInstance[];
};

/**
 * Declare a Tau project config with type checking; returns its argument unchanged.
 *
 * @param config - The project config.
 * @returns The same config.
 * @public
 */
export const defineConfig = (config: TauConfig): TauConfig => config;
