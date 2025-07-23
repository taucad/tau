import { expose } from 'comlink';
import { createOpenSCAD } from 'openscad-wasm-prebuilt';
import type { OpenSCAD } from 'openscad-wasm-prebuilt';
import { jsonDefault } from 'json-schema-default';
import type { JSONSchema7 } from 'json-schema';
import {
  processOpenScadParameters,
  flattenParametersForInjection,
} from '~/components/geometry/kernel/openscad/parse-parameters.js';
import type { OpenScadParameterExport } from '~/components/geometry/kernel/openscad/parse-parameters.js';
import type {
  BuildShapesResult,
  ExportGeometryResult,
  ExtractParametersResult,
  ExportFormat,
} from '~/types/kernel.types.js';
import { createKernelError, createKernelSuccess } from '~/types/kernel.types.js';
import type { ShapeGltf } from '~/types/cad.types.js';
import { convertOffToGltf } from '~/components/geometry/kernel/utils/off-to-gltf.js';
import { convertOffToStl } from '~/components/geometry/kernel/utils/off-to-stl.js';
import { convertOffTo3mf } from '~/components/geometry/kernel/utils/off-to-3mf.js';

// Extract only the formats supported by OpenSCAD worker
type OpenScadExportFormat = Extract<ExportFormat, 'stl' | 'stl-binary' | 'glb' | 'gltf' | '3mf'>;

// Global storage for computed OFF data (for later format conversion)
const offDataMemory: Record<string, string> = {};

async function getInstance(): Promise<OpenSCAD> {
  const instance = await createOpenSCAD({
    noInitialRun: true,
    print: console.log,
    printErr: console.error,
  });

  return instance.getInstance();
}

// Format JavaScript values to OpenSCAD syntax for parameter injection
function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return `"${value}"`;
  }

  if (Array.isArray(value)) {
    return `[${value.map((v) => formatValue(v)).join(', ')}]`;
  }

  return String(value);
}

// Extract parameters using OpenSCAD's built-in parameter export
async function extractParametersFromCode(code: string): Promise<ExtractParametersResult> {
  try {
    const inst = await getInstance();
    const inputFile = '/input.scad';
    const parameterFile = '/params.json';

    // Write the SCAD code with preview mode enabled
    const codeWithPreview = '$preview=true;\n' + code;
    inst.FS.writeFile(inputFile, codeWithPreview);

    // Run OpenSCAD with parameter export format
    inst.callMain([inputFile, '-o', parameterFile, '--export-format=param']);

    // Check if parameter file was created
    let jsonSchema: JSONSchema7 = { type: 'object' };
    let defaultParameters: Record<string, unknown> = {};

    try {
      const parameterData = inst.FS.readFile(parameterFile, { encoding: 'utf8' });
      const parsedExport = JSON.parse(parameterData) as OpenScadParameterExport;

      // Process OpenSCAD parameter export format
      jsonSchema = processOpenScadParameters(parsedExport);
      defaultParameters = jsonDefault(jsonSchema) as Record<string, unknown>;
    } catch (error) {
      console.error('No parameters found or error parsing parameter file:', error);
      // Return empty schema if OpenSCAD parameter export fails
      jsonSchema = { type: 'object', properties: {}, additionalProperties: false };
      defaultParameters = {};
    }

    return createKernelSuccess({
      defaultParameters,
      jsonSchema,
    });
  } catch (error) {
    console.error('Error extracting parameters:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return createKernelError({ message: errorMessage, startColumn: 0, startLineNumber: 0 });
  }
}

async function buildShapesFromCode(
  code: string,
  parameters?: Record<string, unknown>,
  shapeId = 'defaultShape',
): Promise<BuildShapesResult> {
  try {
    // Check if code is empty after trimming whitespace
    const trimmedCode = code.trim();
    if (trimmedCode === '') {
      return createKernelSuccess([]);
    }

    const inst = await getInstance();
    const inputFile = '/input.scad';
    const outputFile = '/output.off';

    // Write the SCAD code
    inst.FS.writeFile(inputFile, code);

    // Build command line arguments for OFF output
    const args = [inputFile, '--backend=manifold', '-o', outputFile];

    // Add parameter injection if provided
    if (parameters) {
      // Flatten grouped parameters for injection
      const flattenedParameters = flattenParametersForInjection(parameters);
      for (const [key, value] of Object.entries(flattenedParameters)) {
        args.push(`-D${key}=${formatValue(value)}`);
      }
    }

    // Run OpenSCAD
    inst.callMain(args);

    // Read the output OFF file
    const offData = inst.FS.readFile(outputFile, { encoding: 'utf8' });

    // Store OFF data globally for later export (we'll convert on demand)
    offDataMemory[shapeId] = offData;

    // Convert OFF to GLB (binary format) for rendering
    const gltfBlob = await convertOffToGltf(offData, 'glb');

    const shape: ShapeGltf = {
      type: 'gltf',
      name: 'Shape',
      gltfBlob,
    };

    return createKernelSuccess([shape]);
  } catch (error) {
    console.error('Error while building shapes from code:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return createKernelError({ message: errorMessage, startColumn: 0, startLineNumber: 0 });
  }
}

const exportShape = async (fileType: OpenScadExportFormat, shapeId = 'defaultShape'): Promise<ExportGeometryResult> => {
  try {
    // Check if OFF data exists in memory
    const offData = offDataMemory[shapeId];
    if (!offData) {
      return createKernelError({
        message: `Shape ${shapeId} not computed yet. Please build shapes before exporting.`,
        startColumn: 0,
        startLineNumber: 0,
      });
    }

    // Handle geometry export
    switch (fileType) {
      case 'glb': {
        const gltfBlob = await convertOffToGltf(offData, 'glb');
        return createKernelSuccess([
          {
            blob: gltfBlob,
            name: 'model.glb',
          },
        ]);
      }

      case 'gltf': {
        const gltfBlob = await convertOffToGltf(offData, 'gltf');
        return createKernelSuccess([
          {
            blob: gltfBlob,
            name: 'model.gltf',
          },
        ]);
      }

      case 'stl': {
        const stlBlob = await convertOffToStl(offData, 'stl');
        return createKernelSuccess([
          {
            blob: stlBlob,
            name: 'model.stl',
          },
        ]);
      }

      case 'stl-binary': {
        const stlBlob = await convertOffToStl(offData, 'stl-binary');
        return createKernelSuccess([
          {
            blob: stlBlob,
            name: 'model.stl',
          },
        ]);
      }

      case '3mf': {
        const threeMfBlob = await convertOffTo3mf(offData);
        return createKernelSuccess([
          {
            blob: threeMfBlob,
            name: 'model.3mf',
          },
        ]);
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return createKernelError({ message: errorMessage, startColumn: 0, startLineNumber: 0 });
  }
};

const service = {
  async initialize() {
    await getInstance();
  },
  ready: async () => true,
  buildShapesFromCode,
  extractParametersFromCode,
  toggleExceptions: async () => 'single',
  exportShape,
  isExceptionsEnabled: () => false,
};

expose(service);
export type OpenScadBuilderInterface = typeof service;
