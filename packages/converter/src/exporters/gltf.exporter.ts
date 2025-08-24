import type { Object3D } from 'three';
import type { GLTFExporterOptions } from 'three/addons';
import { GLTFExporter } from 'three/addons';
import { NodeIO } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
import { BaseExporter } from '#exporters/base.exporter.js';
import type { OutputFile } from '#types.js';

/**
 * GLTF/GLB exporter implementation using gltf-transform.
 * Supports both binary (GLB) and text (GLTF) formats.
 */
export class GltfExporter extends BaseExporter<GLTFExporterOptions> {
  private readonly io: NodeIO;
  private readonly threeExporter: GLTFExporter; // Keep for Object3D export compatibility

  public constructor() {
    super();
    this.io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);
    this.threeExporter = new GLTFExporter(); // Keep for backward compatibility
  }

  public async parseAsync(glbData: Uint8Array, options?: Partial<GLTFExporterOptions>): Promise<OutputFile[]> {
    if (glbData.length === 0) {
      throw new Error('GLB data cannot be empty');
    }

    const mergedOptions = this.mergeOptions(options);
    const { binary } = mergedOptions;

    try {
      // Load GLB data as gltf-transform Document
      const document = await this.io.readBinary(glbData);

      if (binary) {
        // GLB format - write back as GLB
        const outputGlbData = await this.io.writeBinary(document);
        return [this.createOutputFile('model', 'glb', new Uint8Array(outputGlbData))];
      } else {
        // GLTF format - write as GLTF JSON
        const gltfResult = await this.io.writeJSON(document);
        
        const outputFiles: OutputFile[] = [];
        
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

  /**
   * Export Object3D directly to GLB format.
   * This method is used by other loaders that need to export transformed Object3D to GLB.
   * Uses Three.js GLTFExporter for Object3D compatibility.
   */
  public async exportObject3DToGlb(object3d: Object3D, options?: Partial<GLTFExporterOptions>): Promise<Uint8Array> {
    const mergedOptions = this.mergeOptions({ ...options, binary: true });
    const result = await this.threeExporter.parseAsync(object3d, mergedOptions);
    return new Uint8Array(result as ArrayBuffer);
  }
}
