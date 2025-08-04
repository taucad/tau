import type { Object3D } from 'three';
import type { STLExporterOptions } from 'three/addons';
import { STLExporter } from 'three/addons';
import { BaseExporter } from '#exporters/base.exporter.js';

/**
 * Three.js STL exporter implementation.
 * Supports both binary and ASCII STL formats.
 */
export class StlExporter extends BaseExporter<STLExporterOptions> {
  private readonly exporter: STLExporter;

  public constructor() {
    super();
    this.exporter = new STLExporter();
  }

  public async parseAsync(object: Object3D, options?: Partial<STLExporterOptions>): Promise<Uint8Array> {
    const mergedOptions = this.mergeOptions(options);
    const { binary } = mergedOptions;

    const result = this.exporter.parse(object, mergedOptions);

    if (binary && result instanceof ArrayBuffer) {
      return new Uint8Array(result);
    }

    if (binary && result instanceof DataView) {
      return new Uint8Array(result.buffer, result.byteOffset, result.byteLength);
    }

    if (typeof result === 'string') {
      // ASCII STL format
      return new TextEncoder().encode(result);
    }

    throw new TypeError('Unexpected result type from STL exporter');
  }

  public getFileExtension(): string {
    return 'stl';
  }

  public getMimeType(): string {
    return 'model/stl';
  }
}
