/**
 * Lightweight format metadata — format key arrays and types without loader/exporter dependencies.
 *
 * Import from `@taucad/converter/formats` when only format lists or types are needed,
 * avoiding the heavyweight loader/exporter evaluation chain.
 *
 * Import formats are derived from `@taucad/types` {@link fileExtensions} (the canonical
 * extension list) minus formats that lack a loader implementation.
 */

import type { FileExtension } from '@taucad/types';
import { fileExtensions } from '@taucad/types/constants';

/**
 * Extensions present in `mimeTypes` that have no Assimp/OCCT/specialized loader.
 * The raster image formats (png/webp/jpeg/jpg) are render *outputs* of the
 * runtime image transcoder, not 3D import sources, so they are excluded here.
 */
const unsupportedImportExtensions = ['usdc', 'png', 'webp', 'jpeg', 'jpg'] as const satisfies readonly FileExtension[];

type UnsupportedImportExtension = (typeof unsupportedImportExtensions)[number];

const unsupportedImportSet: ReadonlySet<FileExtension> = new Set(unsupportedImportExtensions);

const importFormatKeys = fileExtensions.filter(
  (extension): extension is Exclude<FileExtension, UnsupportedImportExtension> => !unsupportedImportSet.has(extension),
);

const exportFormatKeys = [
  '3mf',
  '3ds',
  'dae',
  'fbx',
  'glb',
  'gltf',
  'obj',
  'ply',
  'stl',
  'step',
  'usda',
  'usdz',
  'x',
  'x3d',
] as const;

/**
 * File extension recognized by the converter's import pipeline.
 *
 * @public
 */
export type SupportedImportFormat = Exclude<FileExtension, UnsupportedImportExtension>;

/**
 * File extension recognized by the converter's export pipeline.
 *
 * @public
 */
export type SupportedExportFormat = (typeof exportFormatKeys)[number];

/**
 * All file extensions supported by the import pipeline.
 *
 * @public
 */
export const supportedImportFormats: readonly SupportedImportFormat[] = importFormatKeys;

/**
 * All file extensions supported by the export pipeline.
 *
 * @public
 */
export const supportedExportFormats: readonly SupportedExportFormat[] = exportFormatKeys;
