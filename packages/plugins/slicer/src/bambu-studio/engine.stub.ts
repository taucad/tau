/**
 * `@taucad/slicer/bambu-studio` outside Node: the same names, refusing to slice.
 *
 * Browser builds resolve here through the package's `default` condition, so
 * no Node code reaches them. Selection stays real because it only reads a
 * catalog the desktop host already loaded.
 *
 * @module
 */
/* oxlint-disable no-barrel-files/no-barrel-files -- the browser side of a conditional public entry */

import { BambuStudioError } from '#bambu-studio/types.js';
import type {
  BambuStudioCatalog,
  BambuStudioInstallation,
  BambuStudioSettings,
  BambuStudioSliceResult,
} from '#bambu-studio/types.js';

export { flattenBambuSettings } from '#bambu-studio/options/index.js';
export type {
  BambuOptionDescriptor,
  BambuOptionGroup,
  BambuOptionScope,
  BambuOptionType,
} from '#bambu-studio/options/index.js';
export { resolveBambuStudioSelection } from '#bambu-studio/selection.js';
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

const unavailable = async (): Promise<never> => {
  throw new BambuStudioError(
    'BAMBU_STUDIO_UNAVAILABLE',
    'Slicing with Bambu Studio needs the Tau desktop app with Bambu Studio installed.',
  );
};

/**
 * Outside Node there is no Bambu Studio to find.
 *
 * @returns `undefined`.
 * @public
 */
export const findBambuStudio = async (): Promise<BambuStudioInstallation | undefined> => undefined;

/**
 * Refuses outside Node.
 *
 * @returns A promise rejected with `BAMBU_STUDIO_UNAVAILABLE`.
 * @public
 */
export const loadBambuStudioCatalog = async (): Promise<BambuStudioCatalog> => unavailable();

/**
 * Refuses outside Node.
 *
 * @returns A promise rejected with `BAMBU_STUDIO_UNAVAILABLE`.
 * @public
 */
export const describeBambuStudioSettings = async (): Promise<BambuStudioSettings> => unavailable();

/**
 * Refuses outside Node.
 *
 * @returns A promise rejected with `BAMBU_STUDIO_UNAVAILABLE`.
 * @public
 */
export const sliceWithBambuStudio = async (): Promise<BambuStudioSliceResult> => unavailable();
