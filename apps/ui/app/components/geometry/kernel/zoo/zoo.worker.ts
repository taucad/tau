import { expose } from 'comlink';
import { KclUtils } from '~/components/geometry/kernel/zoo/kcl-utils.js';
import type {
  BuildShapesResult,
  ExportFormat,
  ExportGeometryResult,
  ExtractParametersResult,
} from '~/types/kernel.types.js';
import { createKernelError, createKernelSuccess } from '~/types/kernel.types.js';
import type { ShapeGltf } from '~/types/cad.types.js';
import { isKclError, extractExecutionError } from '~/components/geometry/kernel/zoo/kcl-errors.js';
import { convertKclErrorToKernelError, mapErrorToKclError } from '~/components/geometry/kernel/zoo/error-mappers.js';
import { getErrorPosition } from '~/components/geometry/kernel/zoo/source-range-utils.js';

const supportedExportFormats = ['stl', 'stl-binary', 'step', 'gltf'] as const satisfies ExportFormat[];

const getSupportedExportFormats = (): ExportFormat[] => supportedExportFormats;

type ZooExportFormat = (typeof supportedExportFormats)[number];

// Global storage for computed STL data
const gltfDataMemory: Record<string, Uint8Array> = {};
let kclUtils: KclUtils | undefined;

// Helper function to handle errors and convert them appropriately
function handleError(error: unknown, code?: string): ReturnType<typeof createKernelError> {
  // If it's already a KCL error, convert it directly
  if (isKclError(error)) {
    return convertKclErrorToKernelError(error, code);
  }

  // Map any other error to a KCL error first, then convert
  const mappedError = mapErrorToKclError(error);
  return convertKclErrorToKernelError(mappedError, code);
}

// Create or get the singleton KCL utilities instance
async function getKclUtilsInstance(): Promise<KclUtils> {
  if (!kclUtils) {
    // TODO: inject the API key to the worker
    const apiKey = 'api-XXX';
    kclUtils = new KclUtils({ apiKey });
  }

  return kclUtils;
}

// Initialize KCL utilities with WASM only (for parsing and mock operations)
async function getKclUtils(): Promise<KclUtils> {
  const utils = await getKclUtilsInstance();

  // Initialize WASM (idempotent - will return early if already initialized)
  await utils.initializeWasm();

  return utils;
}

// Get KCL utils with full engine initialization (for export operations)
async function getKclUtilsWithEngine(): Promise<KclUtils> {
  const utils = await getKclUtilsInstance();

  // Initialize engine (idempotent - will return early if already initialized)
  // This automatically initializes WASM first if needed
  await utils.initializeEngine();

  return utils;
}

// Extract parameters from KCL code
async function extractParametersFromCode(code: string): Promise<ExtractParametersResult> {
  try {
    const utils = await getKclUtils();

    // Parse the KCL code first
    const parseResult = await utils.parseKcl(code);
    if (parseResult.errors.length > 0) {
      console.warn('KCL parsing errors during parameter extraction:', parseResult.errors);
      const firstError = parseResult.errors[0]!;
      const errorPosition = getErrorPosition(firstError, code);
      return createKernelError({
        message: firstError.message,
        startColumn: errorPosition.column,
        startLineNumber: errorPosition.line,
      });
    }

    // Execute the KCL code to get variables
    const executionResult = await utils.executeMockKcl(parseResult.program, 'main.kcl');

    if (executionResult.errors.length > 0) {
      console.warn('KCL execution errors during parameter extraction:', executionResult.errors);
      const errorInfo = extractExecutionError(
        executionResult.errors,
        code,
        'KCL execution errors during parameter extraction',
      );

      return createKernelError({
        message: errorInfo.message,
        startColumn: errorInfo.startColumn,
        startLineNumber: errorInfo.startLineNumber,
      });
    }

    // Convert KCL variables to JSON schema format
    const { defaultParameters, jsonSchema } = KclUtils.convertKclVariablesToJsonSchema(executionResult.variables);

    return createKernelSuccess({
      defaultParameters,
      jsonSchema,
    });
  } catch (error) {
    console.error('Error extracting parameters from KCL code:', error);
    return handleError(error, code);
  }
}

// Build 3D shapes from KCL code using the new program-based parameter injection
async function buildShapesFromCode(
  code: string,
  parameters?: Record<string, unknown>,
  shapeId = 'defaultShape',
): Promise<BuildShapesResult> {
  try {
    // Check if code is empty
    const trimmedCode = code.trim();
    if (trimmedCode === '') {
      return createKernelSuccess([]);
    }

    try {
      const utils = await getKclUtilsWithEngine();

      // Clear memory before starting a new build to ensure clean state
      await utils.clearProgram();

      // Parse the KCL code first to get the program JSON
      const parseResult = await utils.parseKcl(trimmedCode);

      if (parseResult.errors.length > 0) {
        console.warn('KCL parsing errors:', parseResult.errors);
        const firstError = parseResult.errors[0]!;
        const errorPosition = getErrorPosition(firstError, trimmedCode);
        const errorMessages = parseResult.errors.map((error) => error.message);
        return createKernelError({
          message: `KCL parsing failed: ${errorMessages.join(', ')}`,
          startColumn: errorPosition.column,
          startLineNumber: errorPosition.line,
        });
      }

      // Inject parameters into the program JSON
      const modifiedProgram = KclUtils.injectParametersIntoProgram(parseResult.program, parameters ?? {});

      // Execute the modified program
      const executionResult = await utils.executeProgram(modifiedProgram, 'main.kcl');

      // Check for execution errors
      if (executionResult.errors.length > 0) {
        console.warn('KCL execution errors:', executionResult.errors);
        const errorInfo = extractExecutionError(executionResult.errors, trimmedCode, 'KCL execution failed');

        return createKernelError({
          message: errorInfo.message,
          startColumn: errorInfo.startColumn,
          startLineNumber: errorInfo.startLineNumber,
        });
      }

      // Now export to GLTF format using operations already in memory
      const exportResult = await utils.exportFromMemory({
        type: 'gltf',
        storage: 'embedded',
        presentation: 'pretty',
      });

      if (exportResult.length === 0) {
        return createKernelSuccess([]);
      }

      // Get the first exported file (should be GLTF)
      const gltf = exportResult[0];
      if (!gltf) {
        return createKernelError({
          message: 'No STL file in export result',
          startColumn: 0,
          startLineNumber: 0,
        });
      }

      // Store GLTF data globally for later export
      gltfDataMemory[shapeId] = gltf.contents;

      // Convert STL to 3D shape using the same approach as openscad.worker.ts
      const arrayBuffer = new ArrayBuffer(gltf.contents.byteLength);
      const view = new Uint8Array(arrayBuffer);
      view.set(gltf.contents);

      const shape: ShapeGltf = {
        type: 'gltf',
        name: 'Shape',
        gltfBlob: new Blob([gltf.contents]),
      };

      return createKernelSuccess([shape]);
    } catch (kclError) {
      console.error('KCL export error:', kclError);
      return handleError(kclError, code);
    }
  } catch (error) {
    console.error('Error while building shapes from code:', error);
    return handleError(error, code);
  }
}

// Export shape in various formats
const exportShape = async (fileType: ZooExportFormat, shapeId = 'defaultShape'): Promise<ExportGeometryResult> => {
  try {
    // Check if STL data exists in memory
    const gltfData = gltfDataMemory[shapeId];
    if (!gltfData) {
      return createKernelError({
        message: `Shape ${shapeId} not computed yet. Please build shapes before exporting.`,
        startColumn: 0,
        startLineNumber: 0,
      });
    }

    switch (fileType) {
      case 'stl':
      case 'stl-binary': {
        try {
          const utils = await getKclUtilsWithEngine();

          // Use exportFromMemory to export STEP format from operations already in memory
          const stlResult = await utils.exportFromMemory({
            type: 'stl',
            storage: fileType === 'stl-binary' ? 'binary' : 'ascii',
            units: 'mm',
          });

          if (stlResult.length === 0) {
            return createKernelError({
              message: 'No STL data received from KCL export',
              startColumn: 0,
              startLineNumber: 0,
            });
          }

          const stlFile = stlResult[0];
          if (!stlFile) {
            return createKernelError({
              message: 'No STL file in export result',
              startColumn: 0,
              startLineNumber: 0,
            });
          }

          const blob = new Blob([stlFile.contents], {
            type: fileType === 'stl-binary' ? 'application/octet-stream' : 'text/plain',
          });

          return createKernelSuccess([
            {
              blob,
              name: 'model.stl',
            },
          ]);
        } catch (stlError) {
          console.error('STL export error:', stlError);
          return handleError(stlError);
        }
      }

      case 'step': {
        try {
          const utils = await getKclUtilsWithEngine();

          // Use exportFromMemory to export STEP format from operations already in memory
          const stepResult = await utils.exportFromMemory({
            type: 'step',
          });

          if (stepResult.length === 0) {
            return createKernelError({
              message: 'No STEP data received from KCL export',
              startColumn: 0,
              startLineNumber: 0,
            });
          }

          const stepFile = stepResult[0];
          if (!stepFile) {
            return createKernelError({
              message: 'No STEP file in export result',
              startColumn: 0,
              startLineNumber: 0,
            });
          }

          const blob = new Blob([stepFile.contents], {
            type: 'application/step',
          });

          return createKernelSuccess([
            {
              blob,
              name: 'model.step',
            },
          ]);
        } catch (stepError) {
          console.error('STEP export error:', stepError);
          return handleError(stepError);
        }
      }

      case 'gltf': {
        try {
          const blob = new Blob([gltfData], {
            type: 'model/gltf-json',
          });

          return createKernelSuccess([
            {
              blob,
              name: 'model.gltf',
            },
          ]);
        } catch (gltfError) {
          console.error('GLTF export error:', gltfError);
          return handleError(gltfError);
        }
      }
    }
  } catch (error) {
    return handleError(error);
  }
};

// Worker service interface
const service = {
  async initialize(): Promise<boolean> {
    try {
      // Initialize WASM for basic operations - engine will be initialized on-demand
      await getKclUtils();
      return true;
    } catch (error) {
      console.error('Failed to initialize KCL utilities:', error);
      return false;
    }
  },
  ready: async (): Promise<boolean> => true,
  buildShapesFromCode,
  extractParametersFromCode,
  toggleExceptions: async (): Promise<'single'> => 'single' as const,
  exportShape,
  isExceptionsEnabled: (): boolean => false,
  getSupportedExportFormats,
};

expose(service);
export type ZooBuilderInterface = typeof service;
