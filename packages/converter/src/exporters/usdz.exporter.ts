import type { Object3D } from 'three';
import type { USDZExporterOptions } from 'three/addons';
import { USDZExporter } from 'three/addons';
import { BaseExporter } from '#exporters/base.exporter.js';

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

  public async parseAsync(object: Object3D, options?: Partial<USDZExporterOptions>): Promise<Uint8Array> {
    const mergedOptions = this.mergeOptions(options);

    return this.exporter.parseAsync(object, mergedOptions);
  }

  public getFileExtension(): string {
    return 'usdz';
  }

  public getMimeType(): string {
    return 'model/vnd.usdz+zip';
  }
}
