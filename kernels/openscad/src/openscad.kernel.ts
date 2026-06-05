/**
 * OpenSCAD Kernel Module
 *
 * Full defineKernel implementation for the OpenSCAD kernel.
 * Handles WASM initialisation, Emscripten filesystem mounting,
 * use/include dependency resolution, parameter extraction, and
 * geometry computation via the OpenSCAD WASM engine.
 *
 * A fresh WASM instance is created per-render because the OpenSCAD
 * WASM build does not support multiple `callMain()` invocations.
 */

import { createOpenSCAD } from 'openscad-wasm-prebuilt';
import type { OpenSCAD } from 'openscad-wasm-prebuilt';
import { jsonDefault } from 'json-schema-default';
import type { z } from 'zod';
import type { JSONSchema7 } from '@taucad/json-schema';
import type { GeometryGltf, LogLevel } from '@taucad/types';
import { logLevels, createExportFile } from '@taucad/types/constants';
import { asBuffer } from '@taucad/utils/file';
import { joinPath, joinRelativePath } from '@taucad/utils/path';
import type { KernelIssue, KernelFileSystem, KernelPluginFactory, RuntimeLogger } from '@taucad/runtime/kernel';
import {
  convertOffToGltf,
  createKernelError,
  createKernelSuccess,
  defineKernel,
  loadBinaryFile,
  resolveToRelative,
} from '@taucad/runtime/kernel';
import type { OpenScadParameterExport } from '#parse-parameters.js';
import { processOpenScadParameters, flattenParametersForInjection } from '#parse-parameters.js';
import { openscadRenderSchema, openscadExportSchemas } from '#openscad.schemas.js';
import type { AddErrorFunction, GetFileContentsFunction } from '#parse-output.js';
import { OpenScadStderrParser } from '#parse-output.js';

const geistRegularUrl = new URL('fonts/Geist-Regular.ttf', import.meta.url).href;
const geistBoldUrl = new URL('fonts/Geist-Bold.ttf', import.meta.url).href;

// =============================================================================
// Types & constants
// =============================================================================

type OpenScadContext = {
  fontCache: Map<string, Uint8Array<ArrayBuffer>>;
  lastFilePath?: string;
  lastBasePath?: string;
  lastParameters?: Record<string, unknown>;
};

type OpenScadFormatMap = {
  [Format in keyof typeof openscadExportSchemas]: z.input<(typeof openscadExportSchemas)[Format]>;
};

type OpenScadRenderOptions = z.input<typeof openscadRenderSchema>;

const maxIncludeDepth = 50;
const useIncludeRegex = /^\s*(?:use|include)\s*["<]([^">]+)[">]/gm;
const tessellationSpecialVariables = ['$fn', '$fa', '$fs'] as const;

const fontsConfig = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
</fontconfig>
`;

const fontFiles = [
  { url: geistRegularUrl, filename: 'Geist-Regular.ttf' },
  { url: geistBoldUrl, filename: 'Geist-Bold.ttf' },
] as const;

// =============================================================================
// Path helpers
// =============================================================================

function resolveFromRoot(relativePath: string, basePath: string): string {
  return joinPath(basePath, relativePath);
}

function getBasename(filename: string): string {
  const lastSlash = filename.lastIndexOf('/');
  return lastSlash === -1 ? filename : filename.slice(lastSlash + 1);
}

// =============================================================================
// OpenSCAD dependency resolution
// =============================================================================

function parseUseIncludeStatements(code: string): string[] {
  const paths: string[] = [];
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- RegExp match returns null
  let match: RegExpExecArray | null;
  useIncludeRegex.lastIndex = 0;
  while ((match = useIncludeRegex.exec(code)) !== null) {
    if (match[1]) {
      paths.push(match[1]);
    }
  }

  return paths;
}

function resolveIncludePath(baseFilePath: string, relativePath: string): string {
  const lastSlash = baseFilePath.lastIndexOf('/');
  const baseDirectory = lastSlash === -1 ? '' : baseFilePath.slice(0, lastSlash);
  const combinedPath = baseDirectory ? joinRelativePath(baseDirectory, relativePath) : relativePath;
  const segments = combinedPath.split('/');
  const resolved: string[] = [];
  for (const segment of segments) {
    if (segment === '..') {
      resolved.pop();
    } else if (segment !== '.' && segment !== '') {
      resolved.push(segment);
    }
  }

  return resolved.join('/');
}

async function getReferencedScadFiles(options: {
  mainFile: string;
  basePath: string;
  filesystem: KernelFileSystem;
  logger: RuntimeLogger;
}): Promise<{ resolved: string[]; unresolved: string[] }> {
  const { mainFile, basePath, filesystem, logger } = options;
  const visited = new Set<string>();
  const resolved: string[] = [];
  const unresolved: string[] = [];

  const resolveFile = async (filePath: string, depth: number): Promise<void> => {
    const normalizedPath = filePath.replace(/^\/+/, '');
    if (depth >= maxIncludeDepth) {
      logger.debug(`Max include depth (${maxIncludeDepth}) reached for ${normalizedPath}`);
      return;
    }

    if (visited.has(normalizedPath)) {
      return;
    }

    visited.add(normalizedPath);

    let code: string;
    try {
      code = await filesystem.readFile(resolveFromRoot(normalizedPath, basePath), 'utf8');
    } catch {
      logger.debug(`Could not read file ${normalizedPath} for dependency resolution`);
      unresolved.push(normalizedPath);
      return;
    }

    resolved.push(normalizedPath);

    const dependencies = parseUseIncludeStatements(code);
    for (const depPath of dependencies) {
      const resolvedPath = resolveIncludePath(normalizedPath, depPath);
      // oxlint-disable-next-line no-await-in-loop -- sequential for depth tracking
      await resolveFile(resolvedPath, depth + 1);
    }
  };

  await resolveFile(mainFile, 0);
  return { resolved, unresolved };
}

// =============================================================================
// OpenSCAD WASM instance management
// =============================================================================

function parseLogLevel(message: string): LogLevel {
  if (message.includes('ERROR')) {
    return logLevels.error;
  }

  if (message.includes('WARNING')) {
    return logLevels.warn;
  }

  return logLevels.info;
}

async function createInstance(options: {
  logger: RuntimeLogger;
  addError?: AddErrorFunction;
  getFileContents?: GetFileContentsFunction;
  mainFilePath?: string;
}): Promise<OpenSCAD> {
  const { logger, addError, getFileContents, mainFilePath } = options;
  const stderrParser = addError ? new OpenScadStderrParser(addError, getFileContents, mainFilePath) : undefined;

  const instance = await createOpenSCAD({
    noInitialRun: true,
    print(message: string) {
      logger.custom(parseLogLevel(message), message, {
        data: { operation: 'internal' },
      });
    },
    printErr(message: string) {
      logger.custom(parseLogLevel(message), message, {
        data: { operation: 'internal' },
      });
      stderrParser?.parseLine(message);
    },
  });

  return instance.getInstance();
}

// =============================================================================
// Emscripten FS helpers
// =============================================================================

function ensureDirectoryForFile(instance: OpenSCAD, filePath: string): void {
  const lastSlashIndex = filePath.lastIndexOf('/');
  if (lastSlashIndex <= 0) {
    return;
  }

  const directoryPath = filePath.slice(0, lastSlashIndex);
  const directorySegments = directoryPath.split('/');
  let currentPath = '';
  for (const segment of directorySegments) {
    currentPath = currentPath ? joinPath(currentPath, segment) : segment;
    try {
      instance.FS.mkdir(currentPath);
    } catch {
      // Already exists
    }
  }
}

async function mountFileSystem(
  instance: OpenSCAD,
  options: {
    mainFile: string;
    basePath: string;
    filesystem: KernelFileSystem;
    logger: RuntimeLogger;
    fileContentCache: ReadonlyMap<string, Uint8Array<ArrayBuffer> | string>;
    fileContentsCache?: Map<string, string>;
  },
): Promise<void> {
  const { mainFile, basePath, filesystem, logger, fileContentCache, fileContentsCache } = options;

  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- Emscripten FS.chdir() exists at runtime but lacks type declaration
  (instance.FS as unknown as { chdir(path: string): void }).chdir('/');
  instance.FS.mkdir('/locale');

  const { resolved: referencedFiles } = await getReferencedScadFiles({
    mainFile,
    basePath,
    filesystem,
    logger,
  });
  logger.debug(`Mounting ${referencedFiles.length} referenced files`);

  const uncachedAbsolutePaths = referencedFiles
    .map((relativePath) => resolveFromRoot(relativePath, basePath))
    .filter((abs) => !fileContentCache.has(abs));

  if (uncachedAbsolutePaths.length > 0) {
    logger.debug(`Batch-reading ${uncachedAbsolutePaths.length} uncached files`);
    await filesystem.readFiles(uncachedAbsolutePaths);
  }

  for (const relativePath of referencedFiles) {
    const absolutePath = resolveFromRoot(relativePath, basePath);
    const content =
      fileContentCache.get(absolutePath) ??
      // oxlint-disable-next-line no-await-in-loop -- sequential fallback for cache misses
      (await filesystem.readFile(absolutePath));

    ensureDirectoryForFile(instance, relativePath);
    instance.FS.writeFile(relativePath, content);

    if (fileContentsCache && relativePath.endsWith('.scad')) {
      const textContent = typeof content === 'string' ? content : new TextDecoder().decode(content);
      fileContentsCache.set(relativePath, textContent);
    }
  }
}

async function mountFonts(instance: OpenSCAD, context: OpenScadContext, logger: RuntimeLogger): Promise<void> {
  try {
    if (context.fontCache.size === 0) {
      logger.debug('Fetching fonts (first time)');
      const fontPromises = fontFiles.map(async ({ url, filename }) => {
        const arrayBuffer = await loadBinaryFile(url);
        if (!arrayBuffer) {
          throw new Error(`Failed to load font ${filename}`);
        }
        return { filename, data: new Uint8Array(arrayBuffer) };
      });

      const fonts = await Promise.all(fontPromises);
      for (const { filename, data } of fonts) {
        context.fontCache.set(filename, data);
      }
    }

    try {
      instance.FS.mkdir('/fonts');
    } catch {
      // Already exists
    }

    for (const [filename, data] of context.fontCache) {
      instance.FS.writeFile(`/fonts/${filename}`, data);
    }

    instance.FS.writeFile('/fonts/fonts.conf', fontsConfig);
  } catch (error) {
    context.fontCache.clear();
    logger.warn('Failed to mount fonts - text() may not render correctly', {
      data: error,
    });
  }
}

// =============================================================================
// Parameter helpers
// =============================================================================

async function getParametersFromFile(
  filePath: string,
  options: {
    basePath: string;
    filesystem: KernelFileSystem;
    logger: RuntimeLogger;
    fileContentCache: ReadonlyMap<string, Uint8Array<ArrayBuffer> | string>;
    fontCache: Map<string, Uint8Array<ArrayBuffer>>;
  },
): Promise<OpenScadParameterExport | undefined> {
  const { basePath, filesystem, logger, fileContentCache, fontCache } = options;
  const parameterFile = `${filePath}.params.json`;

  try {
    const instance = await createInstance({ logger });
    await mountFileSystem(instance, {
      mainFile: filePath,
      basePath,
      filesystem,
      logger,
      fileContentCache,
    });
    await mountFonts(instance, { fontCache }, logger);

    const result = instance.callMain([filePath, '-o', parameterFile, '--export-format=param']);
    if (result !== 0) {
      logger.debug(`No parameters extracted from ${filePath} (exit code: ${result})`);
      return undefined;
    }

    const parameterData = instance.FS.readFile(parameterFile, {
      encoding: 'utf8',
    });
    const parsed = JSON.parse(parameterData) as OpenScadParameterExport;
    logger.debug(`Extracted ${parsed.parameters.length} parameters from ${filePath}`);
    return parsed;
  } catch (error) {
    logger.debug(`Failed to extract parameters from ${filePath}`, {
      data: error,
    });
    return undefined;
  }
}

function getGroupNameFromPath(filePath: string): string {
  const fileName = getBasename(filePath);
  const nameWithoutExtension = fileName.replace(/\.scad$/, '');
  return nameWithoutExtension.charAt(0).toUpperCase() + nameWithoutExtension.slice(1);
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return `"${value}"`;
  }

  if (Array.isArray(value)) {
    return `[${value.map((v) => formatValue(v)).join(', ')}]`;
  }

  return String(value);
}

// =============================================================================
// Tessellation helpers
// =============================================================================

/**
 * Inject tessellation `-D` args for `$fn`/`$fa`/`$fs` only when they are
 * not already present in the user-supplied parameters.
 *
 * @param args - CLI argument array to append to
 * @param flattenedParameters - user-supplied parameters after flattening
 * @param values - tessellation key/value pairs to inject when absent
 */
function injectTessellationArgs(
  args: string[],
  flattenedParameters: Record<string, unknown>,
  values: Record<string, number>,
): void {
  for (const [key, value] of Object.entries(values)) {
    if (!(key in flattenedParameters)) {
      args.push(`-D${key}=${value}`);
    }
  }
}

// =============================================================================
// OpenSCAD build pipeline
// =============================================================================

type OpenScadBuildOptions = {
  filePath: string;
  basePath: string;
  parameters: Record<string, unknown>;
  tessellationOverrides?: Record<string, number>;
  filesystem: KernelFileSystem;
  logger: RuntimeLogger;
  fileContentCache: ReadonlyMap<string, Uint8Array<ArrayBuffer> | string>;
  fontCache: Map<string, Uint8Array<ArrayBuffer>>;
};

/**
 * Run the OpenSCAD WASM pipeline and return the raw OFF output.
 * Shared between `createGeometry` (render) and `exportGeometry` (export re-render).
 *
 * @param options - build configuration including file paths, parameters, and tessellation overrides
 * @returns the raw OFF geometry string
 */
async function runOpenScadBuild(options: OpenScadBuildOptions): Promise<string> {
  const { filePath, basePath, parameters, tessellationOverrides, filesystem, logger, fileContentCache, fontCache } =
    options;
  const relativeFilePath = resolveToRelative(filePath, basePath);

  const instance = await createInstance({ logger });
  const fileContentsCache = new Map<string, string>();

  await mountFileSystem(instance, {
    mainFile: relativeFilePath,
    basePath,
    filesystem,
    logger,
    fileContentCache,
    fileContentsCache,
  });
  await mountFonts(instance, { fontCache }, logger);

  const code = await filesystem.readFile(filePath, 'utf8');
  instance.FS.writeFile(relativeFilePath, code);

  const args = [relativeFilePath, '-o', `${relativeFilePath}.off`, '--backend=manifold'];

  const flattenedParameters = flattenParametersForInjection(parameters);

  // Filter out $fn/$fa/$fs from user params when tessellationOverrides forces values
  for (const [key, value] of Object.entries(flattenedParameters)) {
    if (
      tessellationOverrides &&
      tessellationSpecialVariables.includes(key as (typeof tessellationSpecialVariables)[number])
    ) {
      continue;
    }
    args.push(`-D${key}=${formatValue(value)}`);
  }

  if (tessellationOverrides) {
    for (const [key, value] of Object.entries(tessellationOverrides)) {
      args.push(`-D${key}=${value}`);
    }
  }

  const result = instance.callMain(args);
  if (result !== 0) {
    throw new Error('OpenSCAD build failed during export re-render');
  }

  return instance.FS.readFile(`${relativeFilePath}.off`, { encoding: 'utf8' });
}

// =============================================================================
// Kernel module definition
// =============================================================================

/** @public */
export const openscad: KernelPluginFactory<'openscad', OpenScadFormatMap, OpenScadRenderOptions> = defineKernel({
  id: 'openscad',
  extensions: ['scad'],
  name: 'OpenScadKernel',
  version: '1.0.0',
  renderSchema: openscadRenderSchema,
  exportSchemas: openscadExportSchemas,

  async initialize(): Promise<OpenScadContext> {
    return { fontCache: new Map<string, Uint8Array<ArrayBuffer>>() };
  },

  async getDependencies({ filePath, basePath }, { filesystem, logger }) {
    const relativeFilePath = resolveToRelative(filePath, basePath);
    const { resolved, unresolved } = await getReferencedScadFiles({
      mainFile: relativeFilePath,
      basePath,
      filesystem,
      logger,
    });
    return {
      resolved: resolved.map((relativePath) => resolveFromRoot(relativePath, basePath)),
      unresolved: unresolved.map((relativePath) => resolveFromRoot(relativePath, basePath)),
    };
  },

  async getParameters({ filePath, basePath }, { filesystem, logger, fileContentCache }, context) {
    try {
      const mainFilePath = resolveToRelative(filePath, basePath);
      const { resolved: referencedFiles } = await getReferencedScadFiles({
        mainFile: mainFilePath,
        basePath,
        filesystem,
        logger,
      });

      const allParameters: OpenScadParameterExport['parameters'] = [];

      for (const scadFile of referencedFiles) {
        // oxlint-disable-next-line no-await-in-loop -- sequential: each file needs its own WASM instance
        const extractedParameters = await getParametersFromFile(scadFile, {
          basePath,
          filesystem,
          logger,
          fileContentCache,
          fontCache: context.fontCache,
        });

        const parameters = extractedParameters?.parameters;
        if (!parameters || !Array.isArray(parameters)) {
          continue;
        }

        const isMainFile = scadFile === mainFilePath;
        for (const parameter of parameters) {
          const needsFileGroup =
            !isMainFile && (!parameter.group || parameter.group === 'Global' || parameter.group === 'Parameters');

          if (needsFileGroup) {
            allParameters.push({
              ...parameter,
              group: getGroupNameFromPath(scadFile),
            });
          } else {
            allParameters.push(parameter);
          }
        }
      }

      let jsonSchema: JSONSchema7 = { type: 'object' };
      let defaultParameters: Record<string, unknown> = {};

      if (allParameters.length > 0) {
        const mergedExport: OpenScadParameterExport = {
          parameters: allParameters,
          title: mainFilePath,
        };
        // Schema excludes $-prefixed params via processOpenScadParameters
        jsonSchema = processOpenScadParameters(mergedExport);
        defaultParameters = jsonDefault(jsonSchema) as Record<string, unknown>;

        // Include $fn/$fa/$fs in defaultParameters so they flow through
        // the parameter merge pipeline and are available in createGeometry
        for (const parameter of allParameters) {
          if (parameter.name.startsWith('$')) {
            defaultParameters[parameter.name] = parameter.initial;
          }
        }
      } else {
        jsonSchema = {
          type: 'object',
          properties: {},
          additionalProperties: false,
        };
      }

      return createKernelSuccess({ defaultParameters, jsonSchema });
    } catch (error) {
      logger.error('Error extracting parameters', { data: error });
      const relativeFilePath = resolveToRelative(filePath, basePath);
      return createKernelError([
        {
          message: error instanceof Error ? error.message : 'Unknown error',
          code: 'RUNTIME',
          location: {
            fileName: relativeFilePath,
            startLineNumber: 1,
            startColumn: 1,
          },
          severity: 'error',
        },
      ]);
    }
  },

  async createGeometry(
    { filePath, basePath, parameters, options },
    { filesystem, logger, fileContentCache, tracer },
    context,
  ) {
    const relativeFilePath = resolveToRelative(filePath, basePath);
    const fileContentsCache = new Map<string, string>();
    const getFileContents: GetFileContentsFunction = (fileName: string) => fileContentsCache.get(fileName);

    const collectedIssues: KernelIssue[] = [];
    const addError: AddErrorFunction = (issue: KernelIssue) => {
      collectedIssues.push(issue);
    };

    try {
      const code = await filesystem.readFile(filePath, 'utf8');
      if (code.trim() === '') {
        return { geometry: [], nativeHandle: '' };
      }

      const wasmSpan = tracer.startSpan('openscad.wasm-init');
      const instance = await createInstance({
        logger,
        addError,
        getFileContents,
        mainFilePath: relativeFilePath,
      });
      wasmSpan.end();

      await mountFileSystem(instance, {
        mainFile: relativeFilePath,
        basePath,
        filesystem,
        logger,
        fileContentCache,
        fileContentsCache,
      });

      const fontSpan = tracer.startSpan('openscad.mount-fonts');
      await mountFonts(instance, context, logger);
      fontSpan.end();

      instance.FS.writeFile(relativeFilePath, code);

      const args = [relativeFilePath, '-o', `${relativeFilePath}.off`, '--backend=manifold'];

      const flattenedParameters = flattenParametersForInjection(parameters);
      for (const [key, value] of Object.entries(flattenedParameters)) {
        args.push(`-D${key}=${formatValue(value)}`);
      }

      const { tessellation } = options;
      const overrides: Record<string, number> = {};
      if (tessellation.segments > 0) {
        overrides['$fn'] = tessellation.segments;
      }
      overrides['$fa'] = tessellation.minimumAngle;
      overrides['$fs'] = tessellation.minimumSize;
      injectTessellationArgs(args, flattenedParameters, overrides);

      const callMainSpan = tracer.startSpan('openscad.call-main', {
        phase: 'computingGeometry',
      });
      const result = instance.callMain(args);
      callMainSpan.end();

      if (result !== 0) {
        const hasActualErrors = collectedIssues.some((issue) => issue.severity === 'error');
        if (!hasActualErrors && collectedIssues.length > 0) {
          return { geometry: [], nativeHandle: '', issues: collectedIssues };
        }

        if (collectedIssues.length > 0) {
          throw new OpenScadBuildError(collectedIssues);
        }

        throw new Error('OpenSCAD build failed');
      }

      const offData = instance.FS.readFile(`${relativeFilePath}.off`, {
        encoding: 'utf8',
      });

      const convertSpan = tracer.startSpan('openscad.convert-geometry', {
        phase: 'computingGeometry',
      });
      const gltfBlob = await convertOffToGltf(offData, {
        format: 'glb',
        coordinateSystem: 'y-up',
        unit: { length: 'meter' },
      });
      convertSpan.end();

      context.lastFilePath = filePath;
      context.lastBasePath = basePath;
      context.lastParameters = parameters;

      const geometry: GeometryGltf = { format: 'gltf', content: gltfBlob };
      return {
        geometry: [geometry],
        nativeHandle: offData,
        issues: collectedIssues,
      };
    } catch (error) {
      if (error instanceof OpenScadBuildError) {
        throw error;
      }

      if (collectedIssues.length > 0) {
        throw new OpenScadBuildError(collectedIssues);
      }

      throw error;
    }
  },

  async exportGeometry(input, runtime, context) {
    const { format, nativeHandle, options } = input;

    if (!nativeHandle) {
      return createKernelError([
        {
          message: 'No geometry available for export. Please build geometries before exporting.',
          code: 'RUNTIME',
          severity: 'error',
        },
      ]);
    }

    const { tessellation } = options;

    // When export tessellation options are provided, re-render the geometry
    // with forced overrides so the OFF output reflects export quality settings.
    let offData = nativeHandle;
    if (context.lastFilePath && context.lastBasePath) {
      offData = await runOpenScadBuild({
        filePath: context.lastFilePath,
        basePath: context.lastBasePath,
        parameters: context.lastParameters ?? {},
        tessellationOverrides: {
          $fn: tessellation.segments,
          $fa: tessellation.minimumAngle,
          $fs: tessellation.minimumSize,
        },
        filesystem: runtime.filesystem,
        logger: runtime.logger,
        fileContentCache: runtime.fileContentCache,
        fontCache: context.fontCache,
      });
    }

    const { coordinateSystem, unit } = options;

    switch (format) {
      case 'glb': {
        const glbData = await convertOffToGltf(offData, { format: 'glb', coordinateSystem, unit });
        return createKernelSuccess([createExportFile('glb', 'model.glb', asBuffer(glbData))]);
      }

      case 'gltf': {
        const gltfData = await convertOffToGltf(offData, { format: 'gltf', coordinateSystem, unit });
        return createKernelSuccess([createExportFile('gltf', 'model.gltf', asBuffer(gltfData))]);
      }

      default: {
        const _exhaustive: never = format;
        return createKernelError([
          {
            message: `Unsupported export format: ${_exhaustive as string}`,
            code: 'RUNTIME',
            severity: 'error',
          },
        ]);
      }
    }
  },
});

class OpenScadBuildError extends Error {
  public readonly issues: KernelIssue[];
  public constructor(issues: KernelIssue[]) {
    super(issues.map((index) => index.message).join('; '));
    this.issues = issues;
  }
}
