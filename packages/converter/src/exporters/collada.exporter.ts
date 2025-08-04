import type { Object3D } from 'three';
import type { ColladaExporterOptions } from 'three-stdlib';
import { ColladaExporter as ThreeColladaExporter } from 'three-stdlib';
import { BaseExporter } from '#exporters/base.exporter.js';

/**
 * Three.js USDZ exporter implementation.
 * Exports 3D objects to Universal Scene Description (USDZ) format.
 */
export class ColladaExporter extends BaseExporter<ColladaExporterOptions> {
  private readonly exporter: ThreeColladaExporter;

  public constructor() {
    super();
    this.exporter = new ThreeColladaExporter();
  }

  public async parseAsync(object: Object3D, options?: Partial<ColladaExporterOptions>): Promise<Uint8Array> {
    const mergedOptions = this.mergeOptions(options);

    const result = this.exporter.parse(
      object,
      () => {
        // No-op
      },
      mergedOptions,
    );
    if (!result) {
      throw new Error('Collada export failed');
    }

    return new TextEncoder().encode(result.data);
  }

  public getFileExtension(): string {
    return 'dae';
  }

  public getMimeType(): string {
    return 'model/vnd.collada+xml';
  }
}
