/**
 * Tau Kernel Module
 *
 * Converts CAD file formats (STEP, STL, OBJ, etc.) to GLTF for display.
 * Uses @taucad/converter under the hood.
 *
 * This is the reference implementation of the defineKernel pattern.
 */

import { extractReferencedGltfUris, importToGlb } from '@taucad/converter';
import { supportedImportFormats } from '@taucad/converter/formats';
import type { SupportedImportFormat, FileResolver } from '@taucad/converter';
import { defineKernel } from '#types/runtime-kernel.types.js';
import { tauExportSchemas } from '#kernels/tau/tau.schemas.js';
import type { KernelFileSystem } from '#types/runtime-kernel.types.js';
import type { KernelIssue } from '#types/runtime.types.js';
import { createKernelError, createKernelSuccess } from '#kernels/kernel-helpers.js';
import { createExportFile } from '@taucad/types/constants';
import { finalizeRenderOutput } from '#framework/render-artifact-finalizer.js';
import { normalizeGltfGeometryNames } from '#utils/gltf-geometry-name-normalizer.js';
import { transformGltfExportBytes } from '#utils/gltf-export-transform.js';
import { resolveImportPath } from '@taucad/utils/import';
import { parentDirectory, resolveVirtualPath } from '@taucad/utils/path';
import { isNotFoundError } from '#filesystem/filesystem-errors.js';

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

type TauInventory = {
  readonly entryBytes: Uint8Array<ArrayBuffer>;
  readonly resolved: readonly string[];
  readonly unresolved: readonly string[];
  readonly resolver: FileResolver;
};

const resolveGltfUri = (uri: string, entryPath: string): string => {
  if (
    uri.includes('\\') ||
    uri.includes('?') ||
    uri.includes('#') ||
    uri.startsWith('//') ||
    /^[A-Za-z][A-Za-z\d+.-]*:/u.test(uri)
  ) {
    throw new TypeError(`Unsupported glTF filesystem URI: ${JSON.stringify(uri)}`);
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(uri);
  } catch (error) {
    throw new TypeError(`Malformed glTF filesystem URI: ${JSON.stringify(uri)}`, { cause: error });
  }
  return resolveImportPath(decoded.startsWith('/') || decoded.startsWith('.') ? decoded : `./${decoded}`, entryPath);
};

const createTauInventory = async (filesystem: KernelFileSystem, rawEntryPath: string): Promise<TauInventory> => {
  const entryPath = resolveVirtualPath(rawEntryPath);
  const directory = parentDirectory(entryPath);
  const names = [...(await filesystem.readdir(directory))].sort();
  const bytesByPath = new Map<string, Uint8Array<ArrayBuffer>>();
  const resolverBytes = new Map<string, Uint8Array<ArrayBuffer>>();

  for (const name of names) {
    const path = resolveVirtualPath(`${directory === '/' ? '' : directory}/${name}`);
    try {
      // oxlint-disable-next-line no-await-in-loop -- deterministic provider access and race handling
      const stat = await filesystem.stat(path);
      if (stat.type !== 'file') {
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- deterministic provider access and race handling
      const bytes = await filesystem.readFile(path);
      bytesByPath.set(path, bytes);
      resolverBytes.set(name, bytes);
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }
  }

  let entryBytes = bytesByPath.get(entryPath);
  if (!entryBytes) {
    entryBytes = await filesystem.readFile(entryPath);
    bytesByPath.set(entryPath, entryBytes);
    resolverBytes.set(getBasename(entryPath), entryBytes);
  }

  const unresolved = new Set<string>();
  if (getFileExtension(entryPath) === 'gltf') {
    const uris = extractReferencedGltfUris(new TextDecoder().decode(entryBytes));
    for (const uri of uris) {
      const path = resolveGltfUri(uri, entryPath);
      let bytes = bytesByPath.get(path);
      if (!bytes) {
        try {
          // oxlint-disable-next-line no-await-in-loop -- resolver inventory is deterministic
          bytes = await filesystem.readFile(path);
          bytesByPath.set(path, bytes);
        } catch (error) {
          if (isNotFoundError(error)) {
            unresolved.add(path);
            continue;
          }
          throw error;
        }
      }
      resolverBytes.set(uri, bytes);
    }
  }

  const resolver: FileResolver = {
    exists: (filename) => resolverBytes.has(filename),
    readFile(filename) {
      const bytes = resolverBytes.get(filename);
      if (!bytes) {
        throw new Error(`File not found: ${filename}`);
      }
      return bytes;
    },
  };

  return {
    entryBytes,
    resolved: [...bytesByPath.keys()].sort(),
    unresolved: [...unresolved].sort(),
    resolver,
  };
};

/** @public */
export const tau = defineKernel({
  id: 'tau',
  extensions: [...supportedImportFormats],
  name: 'TauKernel',
  version: '1.0.0',
  exportFormats: {
    glb: { optionsSchema: tauExportSchemas.glb },
  },

  async initialize() {
    return {};
  },

  async getDependencies({ entryPath }, { filesystem }) {
    const inventory = await createTauInventory(filesystem, entryPath);
    return { resolved: [...inventory.resolved], unresolved: [...inventory.unresolved] };
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

  async createGeometry({ entryPath }, { filesystem, logger }) {
    const canonicalFilePath = resolveVirtualPath(entryPath);
    const relativeFilePath = canonicalFilePath.slice(1);
    const filename = getBasename(entryPath);
    try {
      const inventory = await createTauInventory(filesystem, canonicalFilePath);
      const format = getFileExtension(filename);
      const formattedFormat = String(format).toUpperCase();
      logger.log(`Converting ${formattedFormat} to GLB`);

      // Pre-load sibling files from the directory into a synchronous resolver.
      // Both assimpjs (sync callbacks) and gltf-transform (async readURI)
      // can use this resolver for on-demand sidecar file resolution.
      const glbData = await importToGlb(
        [{ name: filename, bytes: inventory.entryBytes }],
        format as SupportedImportFormat,
        inventory.resolver,
      );
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
          message: 'No geometry available for export.',
          code: 'RUNTIME',
          type: 'runtime',
          severity: 'error',
        },
      ]);
    }

    logger.log('Exporting geometry', { data: { format } });
    const bytes = await transformGltfExportBytes(nativeHandle, {
      format,
      coordinateSystem: input.options.coordinateSystem,
      unit: input.options.unit,
    });
    const file = createExportFile(format, `model.${format}`, bytes);
    logger.log('Successfully exported geometry');
    return createKernelSuccess([file]);
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
