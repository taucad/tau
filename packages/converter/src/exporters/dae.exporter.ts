import type { Object3D } from 'three';
import { BaseExporter } from '#exporters/base.exporter.js';
import type { ColladaExporterOptions } from '#exporters/collada/collada-exporter.js';
import { ColladaExporter } from '#exporters/collada/collada-exporter.js';
import type { OutputFile } from '#types.js';

export class DaeExporter extends BaseExporter<ColladaExporterOptions> {
  private readonly exporter: ColladaExporter;

  public constructor() {
    super();
    this.exporter = new ColladaExporter();
  }

  public async parseAsync(object: Object3D, options?: Partial<ColladaExporterOptions>): Promise<OutputFile[]> {
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

    const daeData = new TextEncoder().encode(result.data);
    return [this.createOutputFile('model', 'dae', daeData)];
  }
}
