import type { Object3D } from 'three';
import type { GLTFExporterOptions } from 'three/addons';
import { GLTFExporter } from 'three/addons';
import { BaseExporter } from '#exporters/base.exporter.js';

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

  public async parseAsync(object: Object3D, options?: Partial<GLTFExporterOptions>): Promise<Uint8Array> {
    const mergedOptions = this.mergeOptions(options);
    const { binary } = mergedOptions;

    const result = await this.exporter.parseAsync(object, mergedOptions);

    if (binary) {
      // GLB format - binary output
      return new Uint8Array(result as ArrayBuffer);
    }

    // GLTF format - JSON output, needs text encoding
    const jsonString = JSON.stringify(result as Record<string, unknown>);
    return new TextEncoder().encode(jsonString);
  }

  public getFileExtension(): string {
    return this.options.binary ? 'glb' : 'gltf';
  }

  public getMimeType(): string {
    return this.options.binary ? 'model/gltf-binary' : 'model/gltf+json';
  }
}
