import type { Object3D } from 'three';
import { BaseExporter } from '#exporters/base.exporter.js';
import type { ColladaExporterOptions } from '#exporters/collada/collada-exporter.js';
import { ColladaExporter } from '#exporters/collada/collada-exporter.js';

export class DaeExporter extends BaseExporter<ColladaExporterOptions> {
  private readonly exporter: ColladaExporter;

  public constructor() {
    super();
    this.exporter = new ColladaExporter();
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
