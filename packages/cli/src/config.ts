import type { PluginInstance } from '@taucad/runtime/plugin';

/** Type of the named exports consumed by `tau export --config`. @public */
export type CliConfig = {
  readonly plugins: readonly PluginInstance[];
};
