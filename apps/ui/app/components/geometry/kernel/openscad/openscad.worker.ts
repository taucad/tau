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
  ComputeGeometryResult,
  ExportGeometryResult,
  ExtractParametersResult,
  ExportFormat,
} from '~/types/kernel.types.js';
import { createKernelError, createKernelSuccess } from '~/types/kernel.types.js';
import type { GeometryGltf } from '~/types/cad.types.js';
import { convertOffToGltf } from '~/components/geometry/kernel/utils/off-to-gltf.js';
import { convertOffToStl } from '~/components/geometry/kernel/utils/off-to-stl.js';
import { convertOffTo3mf } from '~/components/geometry/kernel/utils/off-to-3mf.js';
import { logLevels } from '~/types/console.types.js';
import type { LogLevel } from '~/types/console.types.js';
import { KernelWorker } from '~/components/geometry/kernel/utils/kernel-worker.js';

class OpenScadWorker extends KernelWorker {
  protected static override readonly supportedExportFormats: ExportFormat[] = [
    'stl',
    'stl-binary',
    'glb',
    'gltf',
    '3mf',
  ];

  private offDataMemory: Record<string, string> = {};

  public override async extractParameters(code: string): Promise<ExtractParametersResult> {
    try {
      const inst = await this.createInstance();
      const inputFile = '/input.scad';
      const parameterFile = '/params.json';

      inst.FS.writeFile(inputFile, code);

      inst.callMain([inputFile, '-o', parameterFile, '--export-format=param']);

      let jsonSchema: JSONSchema7 = { type: 'object' };
      let defaultParameters: Record<string, unknown> = {};

      try {
        const parameterData = inst.FS.readFile(parameterFile, { encoding: 'utf8' });
        const parsedExport = JSON.parse(parameterData) as OpenScadParameterExport;

        jsonSchema = processOpenScadParameters(parsedExport);
        defaultParameters = jsonDefault(jsonSchema) as Record<string, unknown>;
      } catch (error) {
        this.warn('No parameters found or error parsing parameter file', { data: error });
        jsonSchema = { type: 'object', properties: {}, additionalProperties: false };
        defaultParameters = {};
      }

      return createKernelSuccess({
        defaultParameters,
        jsonSchema,
      });
    } catch (error) {
      this.error('Error extracting parameters', { data: error });
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return createKernelError({ message: errorMessage, startColumn: 0, startLineNumber: 0 });
    }
  }

  public override async computeGeometry(
    code: string,
    parameters?: Record<string, unknown>,
    shapeId = 'defaultShape',
  ): Promise<ComputeGeometryResult> {
    try {
      const trimmedCode = code.trim();
      if (trimmedCode === '') {
        return createKernelSuccess([]);
      }

      const instance = await this.createInstance();
      const inputFile = '/input.scad';
      const outputFile = '/output.off';

      instance.FS.writeFile(inputFile, code);

      const args = [inputFile, '--backend=manifold', '-o', outputFile];

      if (parameters) {
        const flattenedParameters = flattenParametersForInjection(parameters);
        for (const [key, value] of Object.entries(flattenedParameters)) {
          args.push(`-D${key}=${this.formatValue(value)}`);
        }
      }

      instance.callMain(args);

      const offData = instance.FS.readFile(outputFile, { encoding: 'utf8' });
      this.offDataMemory[shapeId] = offData;

      const gltfBlob = await convertOffToGltf(offData, 'glb');

      const shape: GeometryGltf = {
        type: 'gltf',
        name: 'Shape',
        gltfBlob,
      };

      return createKernelSuccess([shape]);
    } catch (error) {
      this.error('Error while building shapes from code', { data: error });
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return createKernelError({ message: errorMessage, startColumn: 0, startLineNumber: 0 });
    }
  }

  public override async exportGeometry(
    fileType: ExportFormat,
    shapeId = 'defaultShape',
  ): Promise<ExportGeometryResult> {
    try {
      const offData = this.offDataMemory[shapeId];
      if (!offData) {
        return createKernelError({
          message: `Shape ${shapeId} not computed yet. Please build shapes before exporting.`,
          startColumn: 0,
          startLineNumber: 0,
        });
      }

      switch (fileType) {
        case 'glb': {
          const gltfBlob = await convertOffToGltf(offData, 'glb');
          return createKernelSuccess([{ blob: gltfBlob, name: 'model.glb' }]);
        }

        case 'gltf': {
          const gltfBlob = await convertOffToGltf(offData, 'gltf');
          return createKernelSuccess([{ blob: gltfBlob, name: 'model.gltf' }]);
        }

        case 'stl': {
          const stlBlob = await convertOffToStl(offData, 'stl');
          return createKernelSuccess([{ blob: stlBlob, name: 'model.stl' }]);
        }

        case 'stl-binary': {
          const stlBlob = await convertOffToStl(offData, 'stl-binary');
          return createKernelSuccess([{ blob: stlBlob, name: 'model.stl' }]);
        }

        case '3mf': {
          const threeMfBlob = await convertOffTo3mf(offData);
          return createKernelSuccess([{ blob: threeMfBlob, name: 'model.3mf' }]);
        }

        default: {
          return createKernelError({
            message: `Unsupported export format: ${fileType}`,
            startColumn: 0,
            startLineNumber: 0,
          });
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return createKernelError({ message: errorMessage, startColumn: 0, startLineNumber: 0 });
    }
  }

  private parseLogLevel(message: string): LogLevel {
    if (message.includes('ERROR')) {
      return logLevels.error;
    }

    if (message.includes('WARNING')) {
      return logLevels.warn;
    }

    return logLevels.info;
  }

  private print(message: string): void {
    this.onLog({
      level: this.parseLogLevel(message),
      message,
      origin: { component: 'openscad.worker', operation: 'internal' },
    });
  }

  private printErr(message: string): void {
    this.onLog({
      level: this.parseLogLevel(message),
      message,
      origin: { component: 'openscad.worker', operation: 'internal' },
    });
  }

  private async createInstance(): Promise<OpenSCAD> {
    const instance = await createOpenSCAD({
      noInitialRun: true,
      print: (message) => {
        this.print(message);
      },
      printErr: (message) => {
        this.printErr(message);
      },
    });

    return instance.getInstance();
  }

  private formatValue(value: unknown): string {
    if (typeof value === 'string') {
      return `"${value}"`;
    }

    if (Array.isArray(value)) {
      return `[${value.map((v) => this.formatValue(v)).join(', ')}]`;
    }

    return String(value);
  }
}

const service = new OpenScadWorker();
expose(service);
export type OpenScadBuilderInterface = typeof service;
