import { formatConfigurations } from '@taucad/types/constants';
import type { FileExtension } from '@taucad/types';
import { getFileExtension } from '#utils/filesystem.utils.js';
import {
  converterImportFormats,
  type ConverterExportFormat,
  type ConverterImportFormat,
} from '#routes/convert/converter-runtime.definition.js';

const converterImportFormatSet = new Set<string>(converterImportFormats);

/**
 * Extract file format from filename extension
 */
export function getFormatFromFilename(filename: string): ConverterImportFormat {
  const extension = getFileExtension(filename);

  if (!extension) {
    throw new Error('File has no extension');
  }

  if (!converterImportFormatSet.has(extension)) {
    throw new Error(`Unsupported file format: .${extension}`);
  }

  return extension as ConverterImportFormat;
}

/**
 * Get human-readable display name for format
 */
export function formatDisplayName(format: FileExtension): string {
  return formatConfigurations[format].name;
}

/**
 * Format file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) {
    return '0 Bytes';
  }

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

/**
 * Get file extension for output format
 */
export function getExtensionForFormat(format: ConverterExportFormat): string {
  return format;
}
