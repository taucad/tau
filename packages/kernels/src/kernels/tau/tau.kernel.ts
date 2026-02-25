/**
 * Tau Kernel Module
 *
 * Converts CAD file formats (STEP, STL, OBJ, etc.) to GLTF for display.
 * Uses @taucad/converter under the hood.
 *
 * This is the reference implementation of the defineKernel pattern.
 */

import { importToGlb, exportFromGlb, supportedImportFormats } from '@taucad/converter';
import type { SupportedImportFormat, SupportedExportFormat, FileResolver } from '@taucad/converter';
import { defineKernel } from '#types/kernel-worker.types.js';
import type { KernelFileSystem } from '#types/kernel-worker.types.js';
import type { KernelIssue } from '#types/kernel.types.js';
import { createKernelError, createKernelSuccess } from '#framework/kernel-helpers.js';

function getFileExtension(filename: string): string {
  const lastDotIndex = filename.lastIndexOf('.');
  if (lastDotIndex === -1 || lastDotIndex === filename.length - 1) {
    return '';
  }

  return filename.slice(lastDotIndex + 1).toLowerCase();
}

function getBasename(filename: string): string {
  const lastSlashIndex = filename.lastIndexOf('/');
  return lastSlashIndex === -1 ? filename : filename.slice(lastSlashIndex + 1);
}

function getDirname(filepath: string): string {
  const lastSlashIndex = filepath.lastIndexOf('/');
  return lastSlashIndex === -1 ? '' : filepath.slice(0, lastSlashIndex);
}

function resolveToRelative(absolutePath: string, basePath: string): string {
  const normalizedBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
  if (absolutePath.startsWith(`${normalizedBase}/`)) {
    return absolutePath.slice(normalizedBase.length + 1);
  }

  return absolutePath;
}

/**
 * Pre-load directory contents into a synchronous FileResolver.
 * The resolver is backed by a Map for instant lookups, satisfying
 * assimpjs's synchronous callback requirement.
 */
async function createDirectoryResolver(filesystem: KernelFileSystem, directory: string): Promise<FileResolver> {
  const fileCache = new Map<string, Uint8Array<ArrayBuffer>>();

  try {
    const entries = await filesystem.readdir(directory);
    await Promise.all(
      entries.map(async (entry) => {
        const fullPath = directory ? `${directory}/${entry}` : entry;
        try {
          const stat = await filesystem.stat(fullPath);
          if (stat.type === 'file') {
            const bytes = await filesystem.readFile(fullPath);
            fileCache.set(entry, bytes);
          }
        } catch {
          // Skip entries that can't be read (permissions, broken symlinks)
        }
      }),
    );
  } catch {
    // Directory listing failed — resolver will have no cached files
  }

  return {
    exists: (filename: string) => fileCache.has(filename),
    readFile(filename: string) {
      const bytes = fileCache.get(filename);
      if (!bytes) {
        throw new Error(`File not found: ${filename}`);
      }

      return bytes;
    },
  };
}

export default defineKernel({
  name: 'TauKernel',
  version: '1.0.0',

  async initialize() {
    return {};
  },

  async canHandle({ extension }) {
    return supportedImportFormats.includes(extension as SupportedImportFormat);
  },

  async getDependencies({ filePath }) {
    return [filePath];
  },

  async getParameters() {
    return createKernelSuccess({
      defaultParameters: {},
      jsonSchema: { type: 'object', properties: {}, additionalProperties: false },
    });
  },

  async createGeometry({ filePath, basePath }, { filesystem, logger }) {
    const relativeFilePath = resolveToRelative(filePath, basePath);
    const filename = getBasename(filePath);
    const directory = getDirname(filePath);
    try {
      const data = await filesystem.readFile(filePath);
      const format = getFileExtension(filename);
      const formattedFormat = String(format).toUpperCase();
      logger.log(`Converting ${formattedFormat} to GLB`);

      // Pre-load sibling files from the directory into a synchronous resolver.
      // Both assimpjs (sync callbacks) and gltf-transform (async readURI)
      // can use this resolver for on-demand sidecar file resolution.
      const resolver = await createDirectoryResolver(filesystem, directory);

      const glbData = await importToGlb([{ name: filename, bytes: data }], format as SupportedImportFormat, resolver);

      logger.log(`Successfully converted ${formattedFormat} to GLB`);

      return {
        geometry: [{ format: 'gltf' as const, content: glbData }],
        nativeHandle: glbData,
      };
    } catch (error) {
      logger.error('Error converting file', { data: error });
      const errorMessage = error instanceof Error ? error.message : 'Failed to convert file';
      throw new TauBuildError([
        {
          message: errorMessage,
          location: { fileName: relativeFilePath, startLineNumber: 1, startColumn: 1 },
          type: 'runtime',
          severity: 'error',
        },
      ]);
    }
  },

  async exportGeometry({ fileType, nativeHandle }, { logger }, _ctx) {
    try {
      if (nativeHandle.length === 0) {
        return createKernelError([
          {
            message: 'No geometry available for export. Please build geometries before exporting.',
            type: 'runtime',
            severity: 'error',
          },
        ]);
      }

      logger.log('Exporting geometry', { data: { format: fileType } });

      const files = await exportFromGlb(nativeHandle, fileType as SupportedExportFormat);

      logger.log('Successfully exported geometry');

      return createKernelSuccess(files);
    } catch (error) {
      logger.error('Error exporting geometry', { data: error });
      const errorMessage = error instanceof Error ? error.message : 'Failed to export geometry';
      return createKernelError([
        {
          message: errorMessage,
          type: 'runtime',
          severity: 'error',
        },
      ]);
    }
  },
});

class TauBuildError extends Error {
  public readonly issues: KernelIssue[];
  public constructor(issues: KernelIssue[]) {
    super(issues.map((i) => i.message).join('; '));
    this.issues = issues;
  }
}
