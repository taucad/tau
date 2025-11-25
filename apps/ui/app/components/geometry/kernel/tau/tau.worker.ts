import { expose } from 'comlink';
import type {
  ComputeGeometryResult,
  ExportFormat,
  ExportGeometryResult,
  ExtractParametersResult,
  GeometryGltf,
} from '@taucad/types';
import { importToGlb, exportFromGlb, supportedExportFormats, supportedImportFormats } from '@taucad/converter';
import type { InputFormat, OutputFormat } from '@taucad/converter';
import { createKernelError, createKernelSuccess } from '#components/geometry/kernel/utils/kernel-helpers.js';
import { KernelWorker } from '#components/geometry/kernel/utils/kernel-worker.js';

class TauWorker extends KernelWorker {
  protected static override readonly supportedExportFormats: ExportFormat[] = supportedExportFormats as ExportFormat[];
  protected override readonly name: string = 'TauWorker';
  private glbDataMemory: Record<string, Uint8Array> = {};

  public override async cleanup(): Promise<void> {
    this.glbDataMemory = {};
  }

  protected override async canHandle(_filename: string, extension: string): Promise<boolean> {
    // Import supported formats from converter
    return supportedImportFormats.includes(extension as InputFormat);
  }

  protected override async extractParameters(_filename: string): Promise<ExtractParametersResult> {
    // Files don't have parameters by default
    // In the future, we may extract parameters from file metadata
    return createKernelSuccess({
      defaultParameters: {},
      jsonSchema: { type: 'object', properties: {}, additionalProperties: false },
    });
  }

  protected override async computeGeometry(
    filename: string,
    _parameters?: Record<string, unknown>,
    geometryId = 'defaultGeometry',
  ): Promise<ComputeGeometryResult> {
    try {
      // Read file as binary
      const data = await this.readFile(filename);
      const format = KernelWorker.getFileExtension(filename);
      const formattedFormat = String(format).toUpperCase();
      this.log(`Converting ${formattedFormat} to GLB`, { operation: 'computeGeometry' });

      // Convert file to GLB using the converter
      const glbData = await importToGlb([{ name: filename, data }], format as InputFormat);

      // Store GLB data for export
      this.glbDataMemory[geometryId] = glbData;

      // Create geometry object
      const geometry: GeometryGltf = {
        format: 'gltf',
        content: glbData,
      };

      this.log(`Successfully converted ${formattedFormat} to GLB`, { operation: 'computeGeometry' });

      return createKernelSuccess([geometry]);
    } catch (error) {
      this.error('Error converting file', { data: error, operation: 'computeGeometry' });
      const errorMessage = error instanceof Error ? error.message : 'Failed to convert file';
      return createKernelError({
        message: errorMessage,
        startColumn: 0,
        startLineNumber: 0,
        type: 'runtime',
      });
    }
  }

  protected override async exportGeometry(
    fileType: ExportFormat,
    geometryId = 'defaultGeometry',
  ): Promise<ExportGeometryResult> {
    try {
      const glbData = this.glbDataMemory[geometryId];
      if (!glbData) {
        return createKernelError({
          message: `Geometry ${geometryId} not computed yet. Please build geometries before exporting.`,
          startColumn: 0,
          startLineNumber: 0,
          type: 'runtime',
        });
      }

      this.log('Exporting geometry', { operation: 'exportGeometry', data: { format: fileType } });

      // Use converter to export from GLB
      const files = await exportFromGlb(glbData, fileType as OutputFormat);

      const results = files.map((file) => ({
        blob: new Blob([file.data]),
        name: file.name,
      }));

      this.log('Successfully exported geometry', { operation: 'exportGeometry' });

      return createKernelSuccess(results);
    } catch (error) {
      this.error('Error exporting geometry', { data: error, operation: 'exportGeometry' });
      const errorMessage = error instanceof Error ? error.message : 'Failed to export geometry';
      return createKernelError({
        message: errorMessage,
        startColumn: 0,
        startLineNumber: 0,
        type: 'runtime',
      });
    }
  }
}

const service = new TauWorker();
expose(service);
export type TauWorkerInterface = typeof service;
