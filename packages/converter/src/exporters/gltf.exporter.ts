import { NodeIO } from '@gltf-transform/core';
import { createReverseCoordinateTransform, createReverseScalingTransform } from '#gltf.transforms.js';
import { BaseExporter } from '#exporters/base.exporter.js';
import type { File } from '#types.js';
import { allExtensions } from '#gltf.extensions.js';

type GLTFExporterOptions = {
  binary?: boolean;
};

/**
 * GLTF exporter implementation using gltf-transform.
 * Supports both binary (GLB) and text (GLTF) formats.
 */
export class GltfExporter extends BaseExporter<GLTFExporterOptions> {
  private readonly io: NodeIO;

  public constructor() {
    super();
    this.io = new NodeIO().registerExtensions(allExtensions);
  }

  public async parseAsync(glbData: Uint8Array, options?: Partial<GLTFExporterOptions>): Promise<File[]> {
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
        createReverseScalingTransform(true), // millimeters to meters
        createReverseCoordinateTransform(true), // Z-up to Y-up
      );

      if (binary) {
        // GLB format - write transformed document as GLB
        const transformedGlb = await this.io.writeBinary(document);
        return [this.createOutputFile('model', 'glb', new Uint8Array(transformedGlb))];
      } else {
        // GLTF format - write as GLTF JSON
        const gltfResult = await this.io.writeJSON(document);
        
        const outputFiles: File[] = [];
        
        // Main GLTF JSON file
        const jsonString = JSON.stringify(gltfResult.json, null, 2);
        const gltfData = new TextEncoder().encode(jsonString);
        outputFiles.push(this.createOutputFile('model', 'gltf', gltfData));
        
        // Add binary buffer files if present
        Object.entries(gltfResult.resources).forEach(([uri, data]) => {
          if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
            // Use the URI directly as the filename to ensure consistency
            outputFiles.push({
              name: uri,
              data: data instanceof Uint8Array ? data : new Uint8Array(data),
            });
          }
        });
        
        return outputFiles;
      }
    } catch (error) {
      throw new Error(`Failed to process GLB data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
