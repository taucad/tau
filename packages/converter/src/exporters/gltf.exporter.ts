import type { Object3D } from 'three';
import type { GLTFExporterOptions } from 'three/addons';
import { GLTFExporter } from 'three/addons';
import { BaseExporter } from '#exporters/base.exporter.js';
import type { OutputFile } from '#types.js';

/**
 * Three.js GLTF/GLB exporter implementation.
 * Supports both binary (GLB) and text (GLTF) formats.
 */
export class GltfExporter extends BaseExporter<GLTFExporterOptions> {
  private readonly exporter: GLTFExporter;

  public constructor() {
    super();
    this.exporter = new GLTFExporter();
  }

  public async parseAsync(object: Object3D, options?: Partial<GLTFExporterOptions>): Promise<OutputFile[]> {
    const mergedOptions = this.mergeOptions(options);
    const { binary } = mergedOptions;

    const result = await this.exporter.parseAsync(object, mergedOptions);

    if (binary) {
      // GLB format - single binary file
      const glbData = new Uint8Array(result as ArrayBuffer);
      return [this.createOutputFile('model', 'glb', glbData)];
    }

    // GLTF format - JSON output
    const jsonString = JSON.stringify(result as Record<string, unknown>);
    const gltfData = new TextEncoder().encode(jsonString);
    
    // For now, return single GLTF file. 
    // TODO: In future, detect and extract separate .bin files and textures
    return [this.createOutputFile('model', 'gltf', gltfData)];
  }


}
