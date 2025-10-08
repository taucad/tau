import type { File, InputFormat, OutputFormat } from '#types.js';
import { importFiles, supportedImportFormats } from '#import.js';
import { exportFiles, supportedExportFormats } from '#export.js';

/**
 * Convert files from one format to another.
 *
 * @param inputFiles - The input files to convert.
 * @param inputFormat - The input format.
 * @param outputFormat - The output format.
 * @returns A promise that resolves to an array of output files.
 */
export const convertFile = async (
  inputFiles: File[],
  inputFormat: InputFormat,
  outputFormat: OutputFormat,
): Promise<File[]> => {
  // Validate input format
  if (!supportedImportFormats.includes(inputFormat)) {
    throw new Error(`Unsupported input format: ${inputFormat}`);
  }

  // Validate output format
  if (!supportedExportFormats.includes(outputFormat)) {
    throw new Error(`Unsupported output format: ${outputFormat}`);
  }

  // GLB to GLB pass-through optimization
  if (inputFormat === 'glb' && outputFormat === 'glb') {
    return inputFiles.map((file) => ({
      name: file.name,
      data: file.data,
    }));
  }

  // Standard conversion pipeline
  const glb = await importFiles(inputFiles, inputFormat);
  return exportFiles(glb, outputFormat);
};

/**
 * Import files to GLB format only.
 *
 * @param inputFiles - The input files to import.
 * @param inputFormat - The input format.
 * @returns A promise that resolves to GLB data.
 */
export const importToGlb = async (inputFiles: File[], inputFormat: InputFormat): Promise<Uint8Array> => {
  // Validate input format
  if (!supportedImportFormats.includes(inputFormat)) {
    throw new Error(`Unsupported input format: ${inputFormat}`);
  }

  // GLB pass-through optimization
  if (inputFormat === 'glb') {
    const primaryFile = inputFiles.find((file) => file.name.toLowerCase().endsWith('.glb'));
    if (!primaryFile) {
      throw new Error('No GLB file found in input files');
    }

    return primaryFile.data;
  }

  // Standard import pipeline
  const glb = await importFiles(inputFiles, inputFormat);
  return glb;
};

/**
 * Export GLB data to the specified format.
 *
 * @param glbData - The GLB data to export.
 * @param outputFormat - The output format.
 * @returns A promise that resolves to an array of output files.
 */
export const exportFromGlb = async (glbData: Uint8Array, outputFormat: OutputFormat): Promise<File[]> => {
  // Validate output format
  if (!supportedExportFormats.includes(outputFormat)) {
    throw new Error(`Unsupported output format: ${outputFormat}`);
  }

  // GLB pass-through optimization
  if (outputFormat === 'glb') {
    return [
      {
        name: 'model.glb',
        data: glbData,
      },
    ];
  }

  // Standard export pipeline
  return exportFiles(glbData, outputFormat);
};

/**
 * Get list of supported input formats.
 *
 * @returns Array of supported input format strings.
 */
export const getSupportedInputFormats = (): readonly InputFormat[] => {
  return supportedImportFormats;
};

/**
 * Get list of supported output formats.
 *
 * @returns Array of supported output format strings.
 */
export const getSupportedOutputFormats = (): readonly OutputFormat[] => {
  return supportedExportFormats;
};

/**
 * Check if an input format is supported.
 *
 * @param format - The format to check.
 * @returns True if the format is supported.
 */
export const isInputFormatSupported = (format: string): format is InputFormat => {
  return supportedImportFormats.includes(format as InputFormat);
};

/**
 * Check if an output format is supported.
 *
 * @param format - The format to check.
 * @returns True if the format is supported.
 */
export const isOutputFormatSupported = (format: string): format is OutputFormat => {
  return supportedExportFormats.includes(format as OutputFormat);
};
