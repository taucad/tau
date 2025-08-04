import type { Object3D } from 'three';
import type { PLYExporterOptions } from 'three/addons';
import { PLYExporter } from 'three/addons';
import { BaseExporter } from '#exporters/base.exporter.js';

/**
 * Three.js PLY exporter implementation.
 * Exports 3D objects to Stanford PLY format.
 */
export class PlyExporter extends BaseExporter<PLYExporterOptions> {
  private readonly exporter: PLYExporter;

  public constructor() {
    super();
    this.exporter = new PLYExporter();
  }

  public async parseAsync(object: Object3D, options?: Partial<PLYExporterOptions>): Promise<Uint8Array> {
    const mergedOptions = this.mergeOptions(options);

    // PLYExporter uses a callback pattern, handle it with a promise
    const result = await new Promise<string>((resolve, reject) => {
      try {
        const plyResult = this.exporter.parse(
          object,
          () => {
            // No-op callback, result is handled directly
          },
          mergedOptions,
        );

        // If parse returns a value directly instead of using callback
        if (plyResult instanceof ArrayBuffer) {
          resolve(new TextDecoder().decode(plyResult));
        } else if (typeof plyResult === 'string') {
          resolve(plyResult);
        } else {
          reject(new Error('PLY exporter returned an unexpected result'));
        }
      } catch (error) {
        reject(new Error(error instanceof Error ? error.message : 'PLY export failed'));
      }
    });

    return new TextEncoder().encode(result);
  }

  public getFileExtension(): string {
    return 'ply';
  }

  public getMimeType(): string {
    return 'model/ply';
  }
}
