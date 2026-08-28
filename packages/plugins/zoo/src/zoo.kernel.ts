/**
 * Zoo (KCL) Kernel Module
 *
 * Full defineKernel implementation for the Zoo/KCL kernel.
 * Handles KCL WASM initialisation, AST parsing, parameter extraction,
 * geometry execution via the Zoo engine, and export in multiple formats.
 *
 * The kernel uses two initialisation phases:
 * - WASM-only (for parsing and mock execution, no WebSocket)
 * - Full engine (for geometry computation and export, requires WebSocket)
 */

import { createExportFile } from '@taucad/runtime/types';
import type { GeometryGltf, KernelErrorResult, KernelIssue, RuntimeSpanTracer } from '@taucad/runtime/types';
import type { CompilationIssue as CompilationError } from '@taucad/kcl-wasm-lib/bindings/CompilationIssue';
import type { System } from '@taucad/kcl-wasm-lib/bindings/ModelingCmd';
import {
  asBuffer,
  assertRootedPath,
  defineKernel,
  createKernelError,
  createKernelSuccess,
  RenderArtifactFinalizationError,
  finalizeRenderOutput,
} from '@taucad/runtime/kernel';
import type { KernelFileSystem, RuntimeLogger } from '@taucad/runtime/kernel';

import { zooOptionsSchema, zooExportSchemas } from '#zoo.schemas.js';

import { KclUtilities } from '#kcl-utils.js';
import { isKclError } from '#kcl-errors.js';
import { convertKclErrorToKernelIssue, mapErrorToKclError } from '#error-mappers.js';
import { getErrorPosition } from '#source-range-utils.js';
import { FileSystemManager } from '#filesystem-manager.js';
import { discoverKclDependencies } from '#kcl-import-resolver.js';
import {
  transformGltfExportBytes,
  normalizeGltfGeometryNames,
  createEmptyGlb,
  createEmptyGltf,
  createEmptyGltfGeometry,
} from '@taucad/geometry-core';
import { enrichZooGltfTopology } from '#zoo-gltf-topology.utils.js';

// =============================================================================
// Types
// =============================================================================

type ZooContext = {
  baseUrl: string;
  closeErrors: Record<string, string> | undefined;
  token: string | undefined;
  kclUtils: KclUtilities | undefined;
  fileSystemManager: FileSystemManager | undefined;
};

type ZooNativeHandle = {
  kind: 'zoo-live-engine-session';
  hasGeometry: boolean;
};

type ZooExportFormat = keyof typeof zooExportSchemas;

const createZooNativeHandle = (hasGeometry: boolean): ZooNativeHandle => ({
  kind: 'zoo-live-engine-session',
  hasGeometry,
});

const createNoGeometryZooExportResult = (format: ZooExportFormat) => {
  switch (format) {
    case 'glb': {
      return createKernelSuccess([createExportFile('glb', 'model.glb', asBuffer(createEmptyGlb()))]);
    }

    case 'gltf': {
      return createKernelSuccess([createExportFile('gltf', 'model.gltf', asBuffer(createEmptyGltf()))]);
    }

    case 'step':
    case 'stl': {
      return createKernelError([
        {
          message: 'No geometry available for export.',
          code: 'RUNTIME',
          severity: 'error',
        },
      ]);
    }

    default: {
      const _exhaustive: never = format;
      return createKernelError([
        {
          message: `Unsupported export format: ${String(_exhaustive)}`,
          code: 'KERNEL_CAPABILITY_MISSING',
          severity: 'error',
        },
      ]);
    }
  }
};

const mapCoordinateSystemToKclCoords = (coordinateSystem: 'y-up' | 'z-up' | undefined): System => {
  if (coordinateSystem === 'y-up') {
    return {
      forward: { axis: 'z', direction: 'negative' },
      up: { axis: 'y', direction: 'positive' },
    };
  }

  return {
    forward: { axis: 'y', direction: 'negative' },
    up: { axis: 'z', direction: 'positive' },
  };
};

const toKclEnginePath = (filePath: string): string => assertRootedPath(filePath);

// =============================================================================
// Error helpers
// =============================================================================

function filterNonWarningErrors(errors: CompilationError[]): CompilationError[] {
  return errors.filter((error) => error.severity === 'Error' || error.severity === 'Fatal');
}

function mapCompilationErrorsToKernelIssues(errors: CompilationError[], code: string, fileName: string): KernelIssue[] {
  return errors.map((error) => {
    const errorPosition = getErrorPosition(error, code);
    return {
      message: error.message,
      code: 'BUNDLER_FAILED',
      location: {
        fileName,
        startLineNumber: errorPosition.line,
        startColumn: errorPosition.column,
      },
      type: 'compilation',
      severity: error.severity === 'Warning' ? 'warning' : 'error',
    };
  });
}

function handleError(error: unknown, code?: string, fileName?: string): KernelErrorResult {
  if (isKclError(error)) {
    return convertKclErrorToKernelIssue(error, code, fileName);
  }

  const mappedError = mapErrorToKclError(error);
  return convertKclErrorToKernelIssue(mappedError, code, fileName);
}

function logKernelIssues(errors: KernelIssue[], logger: RuntimeLogger): void {
  for (const kernelIssue of errors) {
    logger.error(kernelIssue.message);
  }
}

// =============================================================================
// KCL Utils management
// =============================================================================

function ensureFileSystemManager(context: ZooContext, filesystem: KernelFileSystem): FileSystemManager {
  context.fileSystemManager ??= new FileSystemManager(filesystem);
  return context.fileSystemManager;
}

function getKclUtilitiesInstance(context: ZooContext): KclUtilities {
  if (!context.kclUtils) {
    if (!context.fileSystemManager) {
      throw new Error('FileSystemManager not initialised');
    }

    context.kclUtils = new KclUtilities({
      baseUrl: context.baseUrl,
      closeErrors: context.closeErrors,
      token: context.token,
      fileSystemManager: context.fileSystemManager,
    });
  }

  return context.kclUtils;
}

async function getKclUtils(context: ZooContext, tracer?: RuntimeSpanTracer): Promise<KclUtilities> {
  const utils = getKclUtilitiesInstance(context);
  await utils.initializeWasm(tracer);
  return utils;
}

// oxlint-disable-next-line unicorn-js/prevent-abbreviations -- mirrors KclUtils class name
async function getKclUtilitiesWithEngine(context: ZooContext): Promise<KclUtilities> {
  const utils = getKclUtilitiesInstance(context);
  await utils.initializeEngine();
  return utils;
}

/**
 * Zoo (KCL) kernel options.
 * @public
 */
export type ZooOptions = {
  /** WebSocket URL for the Zoo engine connection. */
  baseUrl?: string;
  /** Consumer-defined messages for private WebSocket close codes. */
  closeErrors?: Record<string, string>;
  /** Zoo API token for direct connections. Browser-embedded tokens are visible to the browser environment. */
  token?: string;
};

// =============================================================================
// Kernel module definition
// =============================================================================

/** @public */
export const zooKernel = defineKernel({
  id: 'zoo',
  extensions: ['kcl'],
  name: 'ZooKernel',
  version: '1.2.0',
  optionsSchema: zooOptionsSchema,
  render: { content: ['includeTopology'] },
  exportFormats: {
    stl: { optionsSchema: zooExportSchemas.stl },
    step: { optionsSchema: zooExportSchemas.step },
    glb: { optionsSchema: zooExportSchemas.glb, content: ['includeTopology'] },
    gltf: { optionsSchema: zooExportSchemas.gltf, content: ['includeTopology'] },
  },

  async initialize(options) {
    const context: ZooContext = {
      baseUrl: options.baseUrl,
      closeErrors: options.closeErrors,
      token: options.token,
      kclUtils: undefined,
      fileSystemManager: undefined,
    };
    return context;
  },

  async getDependencies({ entryPath }, { filesystem }, context) {
    ensureFileSystemManager(context, filesystem);
    const utilities = await getKclUtils(context);
    return discoverKclDependencies(
      assertRootedPath(entryPath),
      async (path) => filesystem.readFile(path, 'utf8'),
      async (code) => utilities.parseKcl(code),
    );
  },

  async getParameters({ entryPath }, { filesystem, logger }, context) {
    ensureFileSystemManager(context, filesystem);
    const relativeFilePath = toKclEnginePath(entryPath);
    const code = await filesystem.readFile(entryPath, 'utf8');
    try {
      const utilities = await getKclUtils(context);
      const parseResult = await utilities.parseKcl(code);
      const criticalErrors = filterNonWarningErrors(parseResult.errors);
      if (criticalErrors.length > 0) {
        logger.warn('KCL parsing errors during parameter extraction', {
          data: criticalErrors,
        });
        return createKernelError(mapCompilationErrorsToKernelIssues(criticalErrors, code, relativeFilePath));
      }

      const executionResult = await utilities.executeMockKcl(parseResult.program, relativeFilePath);
      const criticalExecutionErrors = filterNonWarningErrors(executionResult.errors);
      if (criticalExecutionErrors.length > 0) {
        logger.warn('KCL execution errors during parameter extraction', {
          data: criticalExecutionErrors,
        });
        return createKernelError(mapCompilationErrorsToKernelIssues(criticalExecutionErrors, code, relativeFilePath));
      }

      const { defaultParameters, jsonSchema } = KclUtilities.convertKclVariablesToJsonSchema(executionResult.variables);
      return createKernelSuccess({ defaultParameters, jsonSchema });
    } catch (error) {
      const kclErrorResult = handleError(error, code, relativeFilePath);
      logKernelIssues(kclErrorResult.issues, logger);
      return kclErrorResult;
    }
  },

  async createGeometry({ entryPath, parameters }, { filesystem, logger, signal }, context) {
    ensureFileSystemManager(context, filesystem);
    const relativeFilePath = toKclEnginePath(entryPath);
    const code = await filesystem.readFile(entryPath, 'utf8');
    try {
      const trimmedCode = code.trim();
      if (trimmedCode === '') {
        return finalizeRenderOutput({
          artifacts: [createEmptyGltfGeometry()],
          nativeHandle: createZooNativeHandle(false),
        });
      }

      const utilities = await getKclUtilitiesWithEngine(context);
      await utilities.clearProgram({ signal });
      const parseResult = await utilities.parseKcl(trimmedCode);
      const criticalParseErrors = filterNonWarningErrors(parseResult.errors);
      if (criticalParseErrors.length > 0) {
        logger.warn('KCL parsing errors', { data: criticalParseErrors });
        throw new KclBuildError(mapCompilationErrorsToKernelIssues(criticalParseErrors, trimmedCode, relativeFilePath));
      }

      const modifiedProgram = KclUtilities.injectParametersIntoProgram(parseResult.program, parameters);
      const executionResult = await utilities.executeProgram(modifiedProgram, relativeFilePath, { signal });
      const criticalExecutionErrors = filterNonWarningErrors(executionResult.errors);
      if (criticalExecutionErrors.length > 0) {
        logger.warn('KCL execution errors', { data: criticalExecutionErrors });
        throw new KclBuildError(
          mapCompilationErrorsToKernelIssues(criticalExecutionErrors, trimmedCode, relativeFilePath),
        );
      }

      // Display GLTF fetch is deferred to meshGeometry so a BRep-only export
      // skips the engine round-trip. An executed-but-empty scene is discovered
      // at fetch/export time; exportGeometry's per-format empty guards cover it.
      return { nativeHandle: createZooNativeHandle(true) };
    } catch (error) {
      if (error instanceof KclBuildError || error instanceof RenderArtifactFinalizationError) {
        throw error;
      }

      const kclErrorResult = handleError(error, code, relativeFilePath);
      logKernelIssues(kclErrorResult.issues, logger);
      throw new KclBuildError(kclErrorResult.issues);
    }
  },

  async meshGeometry({ nativeHandle, content }, { logger, signal }, context) {
    if (!nativeHandle.hasGeometry) {
      return { geometry: createEmptyGltfGeometry() };
    }

    try {
      const utilities = await getKclUtilitiesWithEngine(context);
      const exportResult = await utilities.exportFromMemory(
        {
          type: 'gltf',
          storage: 'binary',
        },
        { signal },
      );
      const gltf = exportResult[0];
      if (!gltf) {
        return { geometry: createEmptyGltfGeometry() };
      }

      const normalizedGltf = await normalizeGltfGeometryNames(gltf.contents, {
        format: 'glb',
        rewriteLegacyGeneratedShapeNames: true,
        materialNamePolicy: 'clear-generated',
        materialNameSource: 'external-generated',
        sceneNamePolicy: 'clear-generated',
        sceneNameSource: 'external-generated',
      });
      const outputGltf = content?.includeTopology
        ? await enrichZooGltfTopology(normalizedGltf, { format: 'glb' })
        : normalizedGltf;
      const geometry: GeometryGltf = { format: 'gltf', content: outputGltf };
      return { geometry };
    } catch (error) {
      const kclErrorResult = handleError(error);
      logKernelIssues(kclErrorResult.issues, logger);
      throw new KclBuildError(kclErrorResult.issues);
    }
  },

  // oxlint-disable-next-line complexity -- self-contained, refactor later.
  async exportGeometry(input, { logger, signal }, context) {
    const { format, nativeHandle } = input;

    if (!nativeHandle.hasGeometry) {
      return createNoGeometryZooExportResult(format);
    }

    try {
      const utilities = await getKclUtilitiesWithEngine(context);

      switch (format) {
        case 'stl': {
          const { options } = input;
          const { binary, coordinateSystem, unit } = options;
          const stlResult = await utilities.exportFromMemory(
            {
              type: 'stl',
              storage: binary ? 'binary' : 'ascii',
              coords: mapCoordinateSystemToKclCoords(coordinateSystem),
              units: unit.length === 'meter' ? 'm' : 'mm',
            },
            { signal },
          );
          if (stlResult.length === 0 || !stlResult[0]) {
            return createKernelError([
              { message: 'No STL data received from KCL export', code: 'RUNTIME', severity: 'error' },
            ]);
          }
          return createKernelSuccess([createExportFile('stl', 'model.stl', asBuffer(stlResult[0].contents))]);
        }

        case 'step': {
          const { options } = input;
          const { coordinateSystem } = options;
          const stepResult = await utilities.exportFromMemory(
            {
              type: 'step',
              coords: mapCoordinateSystemToKclCoords(coordinateSystem),
            },
            { signal },
          );
          if (stepResult.length === 0 || !stepResult[0]) {
            return createKernelError([
              { message: 'No STEP data received from KCL export', code: 'RUNTIME', severity: 'error' },
            ]);
          }
          return createKernelSuccess([createExportFile('step', 'model.step', asBuffer(stepResult[0].contents))]);
        }

        case 'glb': {
          const { options, content } = input;
          const { coordinateSystem, unit } = options;
          const glbResult = await utilities.exportFromMemory({ type: 'gltf', storage: 'binary' }, { signal });
          if (glbResult.length === 0 || !glbResult[0]) {
            return createKernelError([
              { message: 'No GLB data received from KCL export', code: 'RUNTIME', severity: 'error' },
            ]);
          }
          const transformedGlb = await transformGltfExportBytes(glbResult[0].contents, {
            format: 'glb',
            coordinateSystem,
            unit,
          });
          const glb = await normalizeGltfGeometryNames(transformedGlb, {
            format: 'glb',
            rewriteLegacyGeneratedShapeNames: true,
            materialNamePolicy: 'clear-generated',
            materialNameSource: 'external-generated',
            sceneNamePolicy: 'clear-generated',
            sceneNameSource: 'external-generated',
          });
          const output = content?.includeTopology ? await enrichZooGltfTopology(glb, { format: 'glb' }) : glb;
          return createKernelSuccess([createExportFile('glb', 'model.glb', asBuffer(output))]);
        }

        case 'gltf': {
          const { options, content } = input;
          const { coordinateSystem, unit } = options;
          const gltfResult = await utilities.exportFromMemory(
            {
              type: 'gltf',
              storage: 'embedded',
              presentation: 'pretty',
            },
            { signal },
          );
          if (gltfResult.length === 0 || !gltfResult[0]) {
            return createKernelError([
              { message: 'No GLTF data received from KCL export', code: 'RUNTIME', severity: 'error' },
            ]);
          }
          const transformedGltf = await transformGltfExportBytes(gltfResult[0].contents, {
            format: 'gltf',
            coordinateSystem,
            unit,
          });
          const gltf = await normalizeGltfGeometryNames(transformedGltf, {
            format: 'gltf',
            rewriteLegacyGeneratedShapeNames: true,
            materialNamePolicy: 'clear-generated',
            materialNameSource: 'external-generated',
            sceneNamePolicy: 'clear-generated',
            sceneNameSource: 'external-generated',
          });
          const output = content?.includeTopology ? await enrichZooGltfTopology(gltf, { format: 'gltf' }) : gltf;
          return createKernelSuccess([createExportFile('gltf', 'model.gltf', asBuffer(output))]);
        }

        default: {
          const _exhaustive: never = format;
          return createKernelError([
            {
              message: `Unsupported export format: ${String(_exhaustive)}`,
              code: 'KERNEL_CAPABILITY_MISSING',
              severity: 'error',
            },
          ]);
        }
      }
    } catch (error) {
      const kclErrorResult = handleError(error);
      logKernelIssues(kclErrorResult.issues, logger);
      return kclErrorResult;
    }
  },

  isNativeHandleValid({ nativeHandle }, _runtime, context) {
    if (!nativeHandle.hasGeometry) {
      return true;
    }

    return context.kclUtils?.canExportFromMemory === true;
  },

  async cleanup(context) {
    await context.kclUtils?.cleanup();
    context.kclUtils = undefined;
  },
});

class KclBuildError extends Error {
  public readonly issues: KernelIssue[];
  public constructor(issues: KernelIssue[]) {
    super(issues.map((index) => index.message).join('; '));
    this.issues = issues;
  }
}
