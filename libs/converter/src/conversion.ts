import type { ExportFile, FileInput } from '@taucad/types';
import { mimeTypes } from '@taucad/types/constants';
import type { FileResolver } from '#file-resolver.js';
import { importFiles } from '#import.js';
import { exportFiles } from '#export.js';
import { supportedImportFormats, supportedExportFormats } from '#formats.js';
import type { SupportedImportFormat, SupportedExportFormat } from '#formats.js';

/**
 * Convert files from one format to another.
 *
 * @param inputFiles - The input files to convert.
 * @param inputFormat - source file format (e.g. 'step', 'stl', 'glb')
 * @param outputFormat - target file format to convert into
 * @param options - optional conversion options
 * @param options.exportProperties - Assimp export properties (e.g. `{ '3MF_EXPORT_UNIT': 'centimeter' }`)
 * @returns A promise that resolves to an array of output files.
 * @public
 */
// oxlint-disable-next-line max-params -- 4th param is an options bag, not a positional arg
export const convertFile = async (
  inputFiles: FileInput[],
  inputFormat: SupportedImportFormat,
  outputFormat: SupportedExportFormat,
  options?: { exportProperties?: Record<string, boolean | number | string> },
): Promise<ExportFile[]> => {
  // GLB to GLB pass-through optimization
  if (inputFormat === 'glb' && outputFormat === 'glb') {
    return inputFiles.map((file) => ({
      name: file.name,
      bytes: file.bytes,
      mimeType: mimeTypes.glb,
    }));
  }

  // Standard conversion pipeline
  const glb = await importFiles(inputFiles, inputFormat);
  return exportFiles(glb, outputFormat, options?.exportProperties);
};

/**
 * Imports files to GLB format only.
 *
 * @param inputFiles - named file buffers to feed into the import pipeline
 * @param inputFormat - source file format (e.g. 'step', 'stl', '3dm')
 * @param resolver - optional file resolver for on-demand sidecar asset loading
 * @returns A promise that resolves to GLB data.
 * @throws Error if no GLB file is found when the input format is `glb`
 * @public
 */
export const importToGlb = async (
  inputFiles: FileInput[],
  inputFormat: SupportedImportFormat,
  resolver?: FileResolver,
): Promise<Uint8Array<ArrayBuffer>> => {
  // GLB pass-through optimization
  if (inputFormat === 'glb') {
    const primaryFile = inputFiles.find((file) => file.name.toLowerCase().endsWith('.glb'));
    if (!primaryFile) {
      throw new Error('No GLB file found in input files');
    }

    return primaryFile.bytes;
  }

  // Standard import pipeline
  const glb = await importFiles(inputFiles, inputFormat, resolver);
  return glb;
};

/**
 * Export GLB data to the specified format.
 *
 * @param glbData - The GLB data to export.
 * @param outputFormat - target file format to export into
 * @param exportProperties - optional Assimp export properties (e.g. `{ '3MF_EXPORT_UNIT': 'centimeter' }`)
 * @returns A promise that resolves to an array of output files.
 * @public
 */
export const exportFromGlb = async (
  glbData: Uint8Array<ArrayBuffer>,
  outputFormat: SupportedExportFormat,
  exportProperties?: Record<string, boolean | number | string>,
): Promise<ExportFile[]> => {
  // GLB pass-through optimization
  if (outputFormat === 'glb') {
    return [
      {
        name: 'model.glb',
        bytes: glbData,
        mimeType: mimeTypes.glb,
      },
    ];
  }

  // Standard export pipeline
  return exportFiles(glbData, outputFormat, exportProperties);
};

/**
 * Get list of supported input formats.
 *
 * @returns Array of supported input format strings.
 * @public
 */
export const getSupportedInputFormats = (): readonly SupportedImportFormat[] => {
  return supportedImportFormats;
};

/**
 * Get list of supported output formats.
 *
 * @returns Array of supported output format strings.
 * @public
 */
export const getSupportedOutputFormats = (): readonly SupportedExportFormat[] => {
  return supportedExportFormats;
};

/**
 * Check if an input format is supported.
 *
 * @param format - The format to check.
 * @returns True if the format is supported.
 * @public
 */
export const isInputFormatSupported = (format: string): format is SupportedImportFormat => {
  return supportedImportFormats.includes(format as SupportedImportFormat);
};

/**
 * Check if an output format is supported.
 *
 * @param format - The format to check.
 * @returns True if the format is supported.
 * @public
 */
export const isOutputFormatSupported = (format: string): format is SupportedExportFormat => {
  return supportedExportFormats.includes(format as SupportedExportFormat);
};
