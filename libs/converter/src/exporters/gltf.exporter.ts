import { NodeIO } from '@gltf-transform/core';
import { mimeTypes } from '@taucad/types/constants';
import type { ExportFile } from '@taucad/types';
import { createReverseCoordinateTransform, createReverseScalingTransform } from '#gltf.transforms.js';
import { BaseExporter } from '#exporters/base.exporter.js';
import { allExtensions } from '#gltf.extensions.js';

type GltfExporterOptions = {
  binary?: boolean;
};

/**
 * GLTF exporter implementation using gltf-transform.
 * Supports both binary (GLB) and text (GLTF) formats.
 */
export class GltfExporter extends BaseExporter<GltfExporterOptions> {
  private readonly io: NodeIO;

  public constructor() {
    super();
    this.io = new NodeIO().registerExtensions(allExtensions);
  }

  /**
   * Parses GLB data and exports it as glTF (JSON + .bin) or binary GLB, depending on configuration.
   *
   * @param glbData - the raw GLB buffer to convert
   * @param options - optional overrides for binary/text output mode
   * @returns An array of exported files (single GLB or GLTF JSON + binary resources).
   * @throws Error if the GLB data is empty or processing fails
   */
  public async parseAsync(
    glbData: Uint8Array<ArrayBuffer>,
    options?: Partial<GltfExporterOptions>,
  ): Promise<ExportFile[]> {
    if (glbData.length === 0) {
      throw new Error('GLB data cannot be empty');
    }

    const mergedOptions = this.mergeOptions(options);
    const { binary } = mergedOptions;

    try {
      // Load GLB data as gltf-transform Document
      const document = await this.io.readBinary(glbData);

      // Apply reverse transformations to convert from app coordinate system back to glTF format
      // This reverses the transforms applied in the loader (Z-up to Y-up, millimeters to meters)
      await document.transform(
        createReverseScalingTransform(true), // Millimeters to meters
        createReverseCoordinateTransform(true), // Z-up to Y-up
      );

      if (binary) {
        // GLB format - write transformed document as GLB
        const transformedGlb = await this.io.writeBinary(document);
        return [this.createOutputFile('model', 'glb', transformedGlb)];
      }

      // GLTF format - write as GLTF JSON
      const gltfResult = await this.io.writeJSON(document);

      const outputFiles: ExportFile[] = [];

      // Main GLTF JSON file
      const jsonString = JSON.stringify(gltfResult.json, null, 2);
      const gltfData = new TextEncoder().encode(jsonString);
      outputFiles.push(this.createOutputFile('model', 'gltf', gltfData));

      // Add binary buffer files if present
      for (const [uri, data] of Object.entries(gltfResult.resources)) {
        if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
          outputFiles.push({
            name: uri,
            bytes: new Uint8Array(data),
            mimeType: mimeTypes.glb,
          });
        }
      }

      return outputFiles;
    } catch (error) {
      throw new Error(`Failed to process GLB data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
