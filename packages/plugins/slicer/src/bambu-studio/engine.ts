/**
 * `@taucad/slicer/bambu-studio` for Node: slice with the person's installed Bambu Studio.
 *
 * Browser builds resolve the same names to a stub that refuses; see the
 * package's `node` export condition.
 *
 * @module
 */
/* oxlint-disable no-barrel-files/no-barrel-files -- the Node side of a conditional public entry */

import { resolveBambuSelectionPresets } from '#bambu-studio/catalog.js';
import { buildBambuSettingsSchema } from '#bambu-studio/options/index.js';
import type { BambuStudioInstallation, BambuStudioSelection, BambuStudioSettings } from '#bambu-studio/types.js';

export { loadBambuStudioCatalog } from '#bambu-studio/catalog.js';
export { findBambuStudio } from '#bambu-studio/installation.js';
export { flattenBambuSettings } from '#bambu-studio/options/index.js';
export type {
  BambuOptionDescriptor,
  BambuOptionGroup,
  BambuOptionScope,
  BambuOptionType,
} from '#bambu-studio/options/index.js';
export { resolveBambuStudioSelection } from '#bambu-studio/selection.js';
export { sliceWithBambuStudio } from '#bambu-studio/slice.js';
export { BambuStudioError, bambuPlates } from '#bambu-studio/types.js';
export type {
  BambuMachineHints,
  BambuPlate,
  BambuPresetKind,
  BambuPresetSummary,
  BambuSettingValue,
  BambuSettingsGroup,
  BambuStudioCatalog,
  BambuStudioCatalogFilter,
  BambuStudioErrorCode,
  BambuStudioInstallation,
  BambuStudioSelection,
  BambuStudioSettings,
  BambuStudioSliceInput,
  BambuStudioSliceResult,
} from '#bambu-studio/types.js';

/**
 * Describe the settings of a selection as JSON Schema with grouped, current values.
 *
 * Built from the resolved process preset and the first filament preset;
 * defaults equal the preset values, so an override is any value that differs.
 *
 * @public
 * @param install - The install from `findBambuStudio`.
 * @param selection - The presets to describe.
 * @returns Schema, values and groups for the settings form and agent tools.
 * @throws BambuStudioError - `BAMBU_STUDIO_PRESET_NOT_FOUND` when a preset is missing.
 * @example <caption>Settings for the default X1 Carbon presets</caption>
 * ```typescript
 * import {
 *   describeBambuStudioSettings,
 *   findBambuStudio,
 *   loadBambuStudioCatalog,
 *   resolveBambuStudioSelection,
 * } from '@taucad/slicer/bambu-studio';
 *
 * const install = await findBambuStudio();
 * if (install) {
 *   const catalog = await loadBambuStudioCatalog(install, { model: 'X1C' });
 *   const selection = resolveBambuStudioSelection(catalog, { model: 'X1C', materials: [] });
 *   const { schema, values, groups } = await describeBambuStudioSettings(install, selection);
 * }
 * ```
 */
export const describeBambuStudioSettings = async (
  install: BambuStudioInstallation,
  selection: Pick<BambuStudioSelection, 'printer' | 'process' | 'filaments'>,
): Promise<BambuStudioSettings> => {
  const { process, filaments } = await resolveBambuSelectionPresets(install, selection);
  return buildBambuSettingsSchema({ process, filament: filaments[0] ?? {} });
};
