/* oxlint-disable new-cap -- External library uses PascalCase method names */
import assimpjsExporter from 'assimpjs/exporter';
import { lookupMimeType } from '@taucad/types/constants';
import type { ExportFile } from '@taucad/types';
import { resolveAssimpFactory } from '#assimp-interop.js';
import { BaseExporter } from '#exporters/base.exporter.js';

/** Tuple of all export format identifiers supported by the Assimp backend. */
export const assimpExportFormats = [
  '3mf',
  'obj',
  'ply',
  'stl',
  'fbx',
  'dae',
  'x',
  'x3d',
  '3ds',
  'stp',
  'usda',
  'usdz',
] as const;

/**
 * Export format identifier supported by the Assimp backend (obj, stl, fbx, dae, etc.).
 */
export type AssimpExportFormat = (typeof assimpExportFormats)[number];

type AssimpExporterOptions = {
  format: AssimpExportFormat;
  /**
   * Optional target file extension to use instead of the format's default extension.
   * Useful when the desired extension differs from assimp's internal format name.
   * For example, 'step' when format is 'stp'.
   */
  targetExtension?: string;
  /**
   * Optional Assimp export properties forwarded as the third argument to
   * `ConvertFileList`. Keys are Assimp property strings (e.g. `3MF_EXPORT_UNIT`).
   */
  exportProperties?: Record<string, boolean | number | string>;
};

/**
 * Assimp exporter that converts GLB data to various formats.
 * Uses assimpjs exporter which takes GLTF/GLB as input and exports to the target format.
 */
export class AssimpExporter extends BaseExporter<AssimpExporterOptions> {
  /**
   * Converts GLB data to the target format via Assimp.
   *
   * @param glbData - the raw GLB buffer to convert
   * @param options - optional overrides for format and target extension
   * @returns An array of exported files in the target format.
   * @throws Error if the GLB data is empty or Assimp conversion fails
   */
  public async parseAsync(
    glbData: Uint8Array<ArrayBuffer>,
    options?: Partial<AssimpExporterOptions>,
  ): Promise<ExportFile[]> {
    if (glbData.length === 0) {
      throw new Error('GLB data cannot be empty');
    }

    const mergedOptions = this.mergeOptions(options);
    const { format } = mergedOptions;

    try {
      // Initialize assimpjs exporter
      const ajs = await resolveAssimpFactory(assimpjsExporter)({
        locateFile() {
          // Universal pattern for browsers and bundlers
          // @see https://web.dev/articles/bundling-non-js-resources#universal_pattern_for_browsers_and_bundlers
          const wasmPath = new URL('../assets/assimpjs/assimpjs-exporter.wasm', import.meta.url).href;

          return wasmPath;
        },
      });

      // Create file list with GLB data
      const fileList = new ajs.FileList();
      fileList.AddFile('input.glb', glbData);

      const result = mergedOptions.exportProperties
        ? ajs.ConvertFileList(fileList, format, mergedOptions.exportProperties)
        : ajs.ConvertFileList(fileList, format);

      // Check if conversion succeeded
      if (!result.IsSuccess()) {
        throw new Error(`Failed to export to ${format} format: ${result.GetErrorCode()}`);
      }

      // Extract all exported files
      const outputFiles: ExportFile[] = [];
      const fileCount = result.FileCount();

      for (let i = 0; i < fileCount; i++) {
        const file = result.GetFile(i);
        let fileName = file.GetPath();
        const content = file.GetContent();

        // Rename file extension if targetExtension is specified
        if (mergedOptions.targetExtension) {
          const parts = fileName.split('.');
          if (parts.length > 1) {
            parts[parts.length - 1] = mergedOptions.targetExtension;
            fileName = parts.join('.');
          }
        }

        const extension = fileName.split('.').pop() ?? '';
        outputFiles.push({
          name: fileName,
          bytes: content,
          mimeType: lookupMimeType(extension),
        });
      }

      return outputFiles;
    } catch (error) {
      throw new Error(`Assimp export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
