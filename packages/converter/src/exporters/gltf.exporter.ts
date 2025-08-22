import type { GLTFExporterOptions } from 'three/addons';
import { GLTFExporter } from 'three/addons';
import { BaseExporter } from '#exporters/base.exporter.js';
import { GltfLoader } from '#loaders/gltf.loader.js';
import type { OutputFile } from '#types.js';

/**
 * Three.js GLTF/GLB exporter implementation.
 * Supports both binary (GLB) and text (GLTF) formats.
 */
export class GltfExporter extends BaseExporter<GLTFExporterOptions> {
  private readonly exporter: GLTFExporter;
  private readonly loader: GltfLoader;

  public constructor() {
    super();
    this.exporter = new GLTFExporter();
    this.loader = new GltfLoader();
    this.loader.initialize({ format: 'glb' });
  }

  public async parseAsync(glbData: Uint8Array, options?: Partial<GLTFExporterOptions>): Promise<OutputFile[]> {
    if (glbData.length === 0) {
      throw new Error('GLB data cannot be empty');
    }

    const mergedOptions = this.mergeOptions(options);
    const { binary } = mergedOptions;

    if (binary) {
      // GLB format - return input GLB data as-is
      return [this.createOutputFile('model', 'glb', glbData)];
    }

    // GLTF format - need to convert GLB to GLTF JSON
    // First load GLB data to Object3D, then export as GLTF
    const object = await this.loader.loadAsync([{ name: 'input.glb', data: glbData }]);
    const result = await this.exporter.parseAsync(object, mergedOptions);

    const jsonString = JSON.stringify(result as Record<string, unknown>);
    const gltfData = new TextEncoder().encode(jsonString);
    
    // For now, return single GLTF file. 
    // TODO: In future, detect and extract separate .bin files and textures
    return [this.createOutputFile('model', 'gltf', gltfData)];
  }
}
