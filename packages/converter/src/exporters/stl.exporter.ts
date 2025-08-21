import type { Object3D } from 'three';
import type { STLExporterOptions } from 'three/addons';
import { STLExporter } from 'three/addons';
import { BaseExporter } from '#exporters/base.exporter.js';
import type { OutputFile } from '#types.js';

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

  public async parseAsync(object: Object3D, options?: Partial<STLExporterOptions>): Promise<OutputFile[]> {
    const mergedOptions = this.mergeOptions(options);
    const { binary } = mergedOptions;

    const result = this.exporter.parse(object, mergedOptions);

    let stlData: Uint8Array;
    
    if (binary && result instanceof ArrayBuffer) {
      stlData = new Uint8Array(result);
    } else if (binary && result instanceof DataView) {
      stlData = new Uint8Array(result.buffer, result.byteOffset, result.byteLength);
    } else if (typeof result === 'string') {
      // ASCII STL format
      stlData = new TextEncoder().encode(result);
    } else {
      throw new TypeError('Unexpected result type from STL exporter');
    }

    return [this.createOutputFile('model', 'stl', stlData)];
  }
}
