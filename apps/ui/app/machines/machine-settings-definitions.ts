/**
 * The provider settings forms this app knows: the browser-side counterpart of `@taucad/host`'s
 * `defaultMachineProviders()`. A provider's `settingsConfiguration` reaches the browser only as a JSON manifest, so the
 * settings owner needs each form's own schema from here to admit the block a project saves under its source id.
 *
 * @module
 */

import type { SettingsDefinition, SettingsSchema } from '@taucad/runtime/machine/settings';
import { bambuSettingsConfiguration } from '@taucad/bambu/settings';

/**
 * Every provider settings form the app registers with the machine settings owner. Add a provider's form here when it
 * declares a `settingsConfiguration`; a block without a registered form is kept opaque.
 *
 * @public
 */
export const providerSettingsDefinitions: ReadonlyArray<SettingsDefinition<SettingsSchema>> = [
  bambuSettingsConfiguration,
];
