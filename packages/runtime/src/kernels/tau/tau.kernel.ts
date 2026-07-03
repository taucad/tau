/**
 * Tau Kernel Module
 *
 * Converts CAD file formats (STEP, STL, OBJ, etc.) to GLTF for display.
 * Uses @taucad/converter under the hood.
 *
 * This is the reference implementation of the defineKernel pattern.
 */

import { importToGlb } from '@taucad/converter';
import { supportedImportFormats } from '@taucad/converter/formats';
import type { SupportedImportFormat, FileResolver } from '@taucad/converter';
import { defineKernel } from '#types/runtime-kernel.types.js';
import { tauExportSchemas } from '#kernels/tau/tau.schemas.js';
import type { KernelFileSystem } from '#types/runtime-kernel.types.js';
import { resolveToRelative } from '#kernels/kernel-module-helpers.js';
import type { KernelIssue } from '#types/runtime.types.js';
import { createKernelError, createKernelSuccess } from '#kernels/kernel-helpers.js';
import { createExportFile } from '@taucad/types/constants';
import { finalizeRenderOutput } from '#framework/render-artifact-finalizer.js';
import { normalizeGltfGeometryNames } from '#utils/gltf-geometry-name-normalizer.js';
import { stripTauGltfMetadata } from '#utils/gltf-topology-metadata.js';

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

/**
 * Pre-load directory contents into a synchronous FileResolver.
 * The resolver is backed by a Map for instant lookups, satisfying
 * assimpjs's synchronous callback requirement.
 *
 * @param filesystem - the kernel filesystem to read directory contents from
 * @param directory - the directory path to pre-load
 * @returns a synchronous file resolver backed by the cached directory contents
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

/** @public */
export const tau = defineKernel({
  id: 'tau',
  extensions: [...supportedImportFormats],
  name: 'TauKernel',
  version: '1.0.0',
  exportSchemas: tauExportSchemas,

  async initialize() {
    return {};
  },

  async getDependencies({ filePath }) {
    return { resolved: [filePath], unresolved: [] };
  },

  async getParameters() {
    return createKernelSuccess({
      defaultParameters: {},
      jsonSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
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
      const isGltfFamily = format === 'glb' || format === 'gltf';
      const normalizedGlbData = await normalizeGltfGeometryNames(glbData, {
        format: 'glb',
        rewriteLegacyGeneratedShapeNames: !isGltfFamily,
        materialNamePolicy: 'clear-generated',
        materialNameSource: isGltfFamily ? 'imported' : 'external-generated',
        sceneNamePolicy: 'clear-generated',
        sceneNameSource: isGltfFamily ? 'imported' : 'external-generated',
      });

      logger.log(`Successfully converted ${formattedFormat} to GLB`);

      return finalizeRenderOutput({
        artifacts: [{ format: 'gltf', content: normalizedGlbData }],
        nativeHandle: normalizedGlbData,
      });
    } catch (error) {
      logger.error('Error converting file', { data: error });
      const errorMessage = error instanceof Error ? error.message : 'Failed to convert file';
      throw new TauBuildError([
        {
          message: errorMessage,
          code: 'RUNTIME',
          location: {
            fileName: relativeFilePath,
            startLineNumber: 1,
            startColumn: 1,
          },
          type: 'runtime',
          severity: 'error',
        },
      ]);
    }
  },

  async exportGeometry(input, { logger }, _context) {
    const { format, nativeHandle } = input;

    if (nativeHandle.length === 0) {
      return createKernelError([
        {
          message: 'No geometry available for export. Please build geometries before exporting.',
          code: 'RUNTIME',
          type: 'runtime',
          severity: 'error',
        },
      ]);
    }

    switch (format) {
      case 'glb':
      case 'gltf': {
        logger.log('Exporting geometry', { data: { format } });
        const cleanExport = await stripTauGltfMetadata(nativeHandle, { format: 'glb' });
        const file = createExportFile(format, `model.${format}`, cleanExport);
        logger.log('Successfully exported geometry');
        return createKernelSuccess([file]);
      }

      default: {
        const _exhaustive: never = format;
        return createKernelError([
          {
            message: `Tau kernel only supports glb and gltf export. Use a transcoder for '${_exhaustive as string}'.`,
            code: 'KERNEL_CAPABILITY_MISSING',
            type: 'runtime',
            severity: 'error',
          },
        ]);
      }
    }
  },

  serializeNativeHandle({ nativeHandle }) {
    return new Uint8Array(nativeHandle);
  },

  deserializeNativeHandle({ serializedNativeHandle }) {
    return new Uint8Array(serializedNativeHandle);
  },
});

class TauBuildError extends Error {
  public readonly issues: KernelIssue[];
  public constructor(issues: KernelIssue[]) {
    super(issues.map((index) => index.message).join('; '));
    this.issues = issues;
  }
}
