import { expose } from 'comlink';
import { createOpenSCAD } from 'openscad-wasm-prebuilt';
import type { OpenSCAD } from 'openscad-wasm-prebuilt';
import { jsonDefault } from 'json-schema-default';
import type { JSONSchema7 } from 'json-schema';
import type {
  ComputeGeometryResult,
  ExportGeometryResult,
  ExtractParametersResult,
  ExportFormat,
  GeometryGltf,
} from '@taucad/types';
import type { OpenScadParameterExport } from '#components/geometry/kernel/openscad/parse-parameters.js';
import {
  processOpenScadParameters,
  flattenParametersForInjection,
} from '#components/geometry/kernel/openscad/parse-parameters.js';
import { convertOffToGltf } from '#components/geometry/kernel/utils/off-to-gltf.js';
import { convertOffToStl } from '#components/geometry/kernel/utils/off-to-stl.js';
import { convertOffTo3mf } from '#components/geometry/kernel/utils/off-to-3mf.js';
import { logLevels } from '#types/console.types.js';
import type { LogLevel } from '#types/console.types.js';
import { KernelWorker } from '#components/geometry/kernel/utils/kernel-worker.js';
import { createKernelError, createKernelSuccess } from '#components/geometry/kernel/utils/kernel-helpers.js';

class OpenScadWorker extends KernelWorker {
  protected static override readonly supportedExportFormats: ExportFormat[] = [
    'stl',
    'stl-binary',
    'glb',
    'gltf',
    '3mf',
  ];

  protected override readonly name: string = 'OpenScadWorker';

  private offDataMemory: Record<string, string> = {};

  protected override async canHandle(_filename: string, extension: string): Promise<boolean> {
    return extension === 'scad';
  }

  protected override async extractParameters(filename: string): Promise<ExtractParametersResult> {
    const code = await this.readFile(filename, 'utf8');
    try {
      const instance = await this.createInstance();
      await this.mountFilesystem(instance, this.basePath);

      const inputFile = filename;
      const parameterFile = `${filename}.params.json`;

      instance.FS.writeFile(inputFile, code);

      const result = instance.callMain([inputFile, '-o', parameterFile, '--export-format=param']);

      if (result !== 0) {
        // @ts-expect-error - TODO: add typings for formatException, ensure this API is available.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call -- formatException is not typed
        const error = instance.formatException?.(result);
        return createKernelError({
          message: `Failed to build geometry: ${result}`,
          startColumn: 0,
          startLineNumber: 0,
        });
      }

      let jsonSchema: JSONSchema7 = { type: 'object' };
      let defaultParameters: Record<string, unknown> = {};

      try {
        const parameterData = instance.FS.readFile(parameterFile, { encoding: 'utf8' });
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

  protected override async computeGeometry(
    filename: string,
    parameters?: Record<string, unknown>,
    geometryId = 'defaultGeometry',
  ): Promise<ComputeGeometryResult> {
    try {
      const code = await this.readFile(filename, 'utf8');
      const trimmedCode = code.trim();
      if (trimmedCode === '') {
        return createKernelSuccess([]);
      }

      const instance = await this.createInstance();
      await this.mountFilesystem(instance, this.basePath);

      const inputFile = filename;
      const outputFile = `${filename}.off`;

      instance.FS.writeFile(inputFile, code);

      const args = [inputFile, '--backend=manifold', '-o', outputFile];

      if (parameters) {
        const flattenedParameters = flattenParametersForInjection(parameters);
        for (const [key, value] of Object.entries(flattenedParameters)) {
          args.push(`-D${key}=${this.formatValue(value)}`);
        }
      }

      const result = instance.callMain(args);

      if (result !== 0) {
        // @ts-expect-error - TODO: add typings for formatException, ensure this API is available.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call -- formatException is not typed
        const error = instance.formatException?.(result);
        return createKernelError({
          message: `Failed to build geometry: ${result}`,
          startColumn: 0,
          startLineNumber: 0,
        });
      }

      const offData = instance.FS.readFile(outputFile, { encoding: 'utf8' });
      this.offDataMemory[geometryId] = offData;

      const gltfBlob = await convertOffToGltf(offData, 'glb', false);

      const geometry: GeometryGltf = {
        format: 'gltf',
        content: gltfBlob,
      };

      return createKernelSuccess([geometry]);
    } catch (error) {
      this.error('Error while building geometries from code', { data: error });
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return createKernelError({ message: errorMessage, startColumn: 0, startLineNumber: 0 });
    }
  }

  protected override async exportGeometry(
    fileType: ExportFormat,
    geometryId = 'defaultGeometry',
  ): Promise<ExportGeometryResult> {
    try {
      const offData = this.offDataMemory[geometryId];
      if (!offData) {
        return createKernelError({
          message: `Geometry ${geometryId} not computed yet. Please build geometries before exporting.`,
          startColumn: 0,
          startLineNumber: 0,
        });
      }

      switch (fileType) {
        case 'glb': {
          const gltfBlob = await convertOffToGltf(offData, 'glb');
          return createKernelSuccess([{ blob: new Blob([gltfBlob]), name: 'model.glb' }]);
        }

        case 'gltf': {
          const gltfBlob = await convertOffToGltf(offData, 'gltf');
          return createKernelSuccess([{ blob: new Blob([gltfBlob]), name: 'model.gltf' }]);
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
      origin: { component: OpenScadWorker.name, operation: 'internal' },
    });
  }

  private printErr(message: string): void {
    this.onLog({
      level: this.parseLogLevel(message),
      message,
      origin: { component: OpenScadWorker.name, operation: 'internal' },
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

  /**
   * Mount the current directory filesystem into Emscripten's FS.
   * Pre-populates all files from basePath so OpenSCAD can access them.
   *
   * @param instance - The OpenSCAD instance with FS API.
   * @param basePath - The base path to mount files from.
   */
  private async mountFilesystem(instance: OpenSCAD, basePath: string): Promise<void> {
    try {
      this.debug('Mounting filesystem from basePath', { operation: 'mountFilesystem', data: { basePath } });

      // Get all files from the current directory
      const files = await this.fileManager.getDirectoryContents(basePath);
      const fileCount = Object.keys(files).length;

      this.debug(`Found ${fileCount} files to mount`, { operation: 'mountFilesystem' });

      // Add locale directory - required to silence OpenSCAD warnings about missing locale directory
      instance.FS.mkdir('/locale');

      // Create directories and write files into Emscripten FS
      for (const [relativePath, content] of Object.entries(files)) {
        // Extract directory path from file path
        const lastSlashIndex = relativePath.lastIndexOf('/');
        if (lastSlashIndex > 0) {
          const dirPath = relativePath.slice(0, lastSlashIndex);
          const dirSegments = dirPath.split('/');

          // Create nested directories
          let currentPath = '';
          for (const segment of dirSegments) {
            currentPath = currentPath ? `${currentPath}/${segment}` : segment;
            try {
              instance.FS.mkdir(currentPath);
            } catch {
              // Directory already exists, ignore error
            }
          }
        }

        // Write the file
        instance.FS.writeFile(relativePath, content);
        this.trace(`Mounted file: ${relativePath}`, { operation: 'mountFilesystem' });
      }

      this.debug(`Successfully mounted ${fileCount} files`, { operation: 'mountFilesystem' });
    } catch (error) {
      this.error('Failed to mount filesystem', { operation: 'mountFilesystem', data: error });
      throw error;
    }
  }
}

const service = new OpenScadWorker();
expose(service);
export type OpenScadBuilderInterface = typeof service;
