import type { Object3D } from 'three';
import type { USDZExporterOptions } from 'three/addons';
import { USDZExporter } from 'three/addons';
import { BaseExporter } from '#exporters/base.exporter.js';
import type { OutputFile } from '#types.js';

/**
 * Three.js USDZ exporter implementation.
 * Exports 3D objects to Universal Scene Description (USDZ) format.
 */
export class UsdzExporter extends BaseExporter<USDZExporterOptions> {
  private readonly exporter: USDZExporter;

  public constructor() {
    super();
    this.exporter = new USDZExporter();
  }

  public async parseAsync(object: Object3D, options?: Partial<USDZExporterOptions>): Promise<OutputFile[]> {
    const mergedOptions = this.mergeOptions(options);

    const usdzData = await this.exporter.parseAsync(object, mergedOptions);
    return [this.createOutputFile('model', 'usdz', usdzData)];
  }
}
