import type { Object3D } from 'three';
import type { OutputFile } from '#types.js';

/**
 * Base abstract class for Three.js exporters.
 * Provides a unified interface for exporting 3D objects to various formats.
 *
 * @template Options - The options type specific to each exporter implementation
 */
export abstract class BaseExporter<Options = Record<string, never>> {
  /**
   * The options passed to the exporter. These are specific to each exporter implementation.
   */
  protected options!: Options;

  /**
   * Initialize the exporter with options.
   *
   * @param options - The options passed to the exporter. These are specific to each exporter implementation.
   */
  public initialize(options: Options): void {
    this.options = options;
  }

  /**
   * Parse a 3D object and export it to the target format.
   *
   * @param object - The Three.js Object3D to export.
   * @param options - Optional runtime options that may override initialization options.
   * @returns A promise that resolves to an array of exported files.
   */
  public abstract parseAsync(object: Object3D, options?: Partial<Options>): Promise<OutputFile[]>;

  /**
   * Helper method to create an OutputFile with proper naming.
   *
   * @param basename - The base name for the file (without extension).
   * @param extension - The file extension (with or without dot).
   * @param data - The file data.
   * @returns An OutputFile object.
   */
  protected createOutputFile(basename: string, extension: string, data: Uint8Array): OutputFile {
    const cleanExtension = extension.startsWith('.') ? extension.slice(1) : extension;
    return {
      name: `${basename}.${cleanExtension}`,
      data,
    };
  }

  /**
   * Merge runtime options with initialization options.
   *
   * @param runtimeOptions - Options provided at parse time.
   * @returns Merged options with runtime options taking precedence.
   */
  protected mergeOptions(runtimeOptions?: Partial<Options>): Options {
    return { ...this.options, ...runtimeOptions };
  }
}
