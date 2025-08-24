import type { USDZExporterOptions } from 'three/addons';
import { USDZExporter } from 'three/addons';
import { BaseExporter } from '#exporters/base.exporter.js';
import { GltfLoader } from '#loaders/gltf.loader.js';
import type { OutputFile } from '#types.js';

/**
 * Three.js USDZ exporter implementation.
 * Exports GLB data to Universal Scene Description (USDZ) format.
 */
export class UsdzExporter extends BaseExporter<USDZExporterOptions> {
  private readonly exporter: USDZExporter;
  private readonly loader: GltfLoader;

  public constructor() {
    super();
    this.exporter = new USDZExporter();
    this.loader = new GltfLoader();
    this.loader.initialize({ format: 'glb', scaleMetersToMillimeters: true });
  }

  public async parseAsync(glbData: Uint8Array, options?: Partial<USDZExporterOptions>): Promise<OutputFile[]> {
    if (glbData.length === 0) {
      throw new Error('GLB data cannot be empty');
    }

    const mergedOptions = this.mergeOptions(options);

    // Load GLB data to Object3D first
    const object = await this.loader.loadAsObject3D(glbData);

    const usdzData = await this.exporter.parseAsync(object, mergedOptions);
    return [this.createOutputFile('model', 'usdz', usdzData)];
  }
}
