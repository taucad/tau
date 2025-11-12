import { expose } from 'comlink';
import type {
  ComputeGeometryResult,
  ExportFormat,
  ExportGeometryResult,
  ExtractParametersResult,
  GeometryFile,
  GeometryGltf,
} from '@taucad/types';
import { importToGlb, exportFromGlb, supportedExportFormats, supportedImportFormats } from '@taucad/converter';
import type { InputFormat, OutputFormat } from '@taucad/converter';
import { createKernelError, createKernelSuccess } from '#components/geometry/kernel/utils/kernel-helpers.js';
import { KernelWorker } from '#components/geometry/kernel/utils/kernel-worker.js';

class TauWorker extends KernelWorker {
  protected static override readonly supportedExportFormats: ExportFormat[] = supportedExportFormats as ExportFormat[];
  private glbDataMemory: Record<string, Uint8Array> = {};

  public override async canHandle(file: GeometryFile): Promise<boolean> {
    // Import supported formats from converter
    const extension = KernelWorker.getFileExtension(file.filename);
    return supportedImportFormats.includes(extension as InputFormat);
  }

  public override async extractParameters(_file: GeometryFile): Promise<ExtractParametersResult> {
    // Files don't have parameters by default
    // In the future, we may extract parameters from file metadata
    return createKernelSuccess({
      defaultParameters: {},
      jsonSchema: { type: 'object', properties: {}, additionalProperties: false },
    });
  }

  public override async computeGeometry(
    file: GeometryFile,
    _parameters?: Record<string, unknown>,
    geometryId = 'defaultGeometry',
  ): Promise<ComputeGeometryResult> {
    try {
      const format = KernelWorker.getFileExtension(file.filename);
      this.log(`Converting ${format} to GLB`, { operation: 'computeGeometry' });

      // Extract format from filename

      // Convert file to GLB using the converter
      const glbData = await importToGlb([{ name: file.filename, data: file.data }], format as InputFormat);

      // Store GLB data for export
      this.glbDataMemory[geometryId] = glbData;

      // Create geometry object
      const geometry: GeometryGltf = {
        type: 'gltf',
        gltfBlob: new Blob([glbData], { type: 'model/gltf-binary' }),
      };

      this.log(`Successfully converted ${format} to GLB`, { operation: 'computeGeometry' });

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

  public override async exportGeometry(
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

  public override async cleanup(): Promise<void> {
    this.glbDataMemory = {};
  }
}

const service = new TauWorker();
expose(service);
export type TauWorkerInterface = typeof service;
