/* eslint-disable @typescript-eslint/naming-convention -- External library uses PascalCase method names */
/* eslint-disable new-cap -- External library uses PascalCase method names */
import assimpjsExporter from 'assimpjs/exporter';
import { BaseExporter } from '#exporters/base.exporter.js';
import type { OutputFile } from '#types.js';

// Supported assimp export formats based on the test file
export const assimpExportFormats = [
  'obj',
  'ply', 
  'stl',
  'fbx',
  'dae',
  'x',
  'x3d',
  '3ds',
  'stp',
] as const;

export type AssimpExportFormat = (typeof assimpExportFormats)[number];

type AssimpExporterOptions = {
  format: AssimpExportFormat;
};

/**
 * Assimp exporter that converts GLB data to various formats.
 * Uses assimpjs exporter which takes GLTF/GLB as input and exports to the target format.
 */
export class AssimpExporter extends BaseExporter<AssimpExporterOptions> {
  public async parseAsync(glbData: Uint8Array, options?: Partial<AssimpExporterOptions>): Promise<OutputFile[]> {
    if (glbData.length === 0) {
      throw new Error('GLB data cannot be empty');
    }

    const mergedOptions = this.mergeOptions(options);
    const { format } = mergedOptions;

    try {
      // Initialize assimpjs exporter
      const ajs = await assimpjsExporter();

      // Create file list with GLB data
      const fileList = new ajs.FileList();
      fileList.AddFile('input.glb', glbData);

      // Convert GLB to target format using assimpjs
      const result = ajs.ConvertFileList(fileList, format);

      // Check if conversion succeeded
      if (!result.IsSuccess()) {
        throw new Error(`Failed to export to ${format} format: ${result.GetErrorCode()}`);
      }

      // Extract all exported files
      const outputFiles: OutputFile[] = [];
      const fileCount = result.FileCount();

      for (let i = 0; i < fileCount; i++) {
        const file = result.GetFile(i);
        const fileName = file.GetPath();
        const content = file.GetContent();
        
        outputFiles.push({
          name: fileName,
          data: content,
        });
      }

      return outputFiles;
    } catch (error) {
      throw new Error(`Assimp export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
