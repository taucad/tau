import type { InputFormat, OutputFormat } from '@taucad/converter';
import { formatConfigurations, isInputFormatSupported } from '@taucad/converter';

/**
 * Extract file format from filename extension
 */
export function getFormatFromFilename(filename: string): InputFormat {
  const extension = filename.split('.').pop()?.toLowerCase();

  if (!extension) {
    throw new Error('File has no extension');
  }

  if (!isInputFormatSupported(extension)) {
    throw new Error(`Unsupported file format: .${extension}`);
  }

  return extension;
}

/**
 * Get human-readable display name for format
 */
export function formatDisplayName(format: InputFormat | OutputFormat): string {
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
export function getFileExtension(format: OutputFormat): string {
  return format;
}
