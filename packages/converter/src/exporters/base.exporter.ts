import type { File } from '#types.js';

/**
 * Base abstract class for 3D exporters.
 * Provides a unified interface for exporting 3D data from GLB format to various formats.
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
  public initialize(options: Options): this {
    this.options = options;
    return this;
  }

  /**
   * Parse GLB data and export it to the target format.
   *
   * @param glbData - The GLB data as Uint8Array to export.
   * @param options - Optional runtime options that may override initialization options.
   * @returns A promise that resolves to an array of exported files.
   */
  public abstract parseAsync(glbData: Uint8Array, options?: Partial<Options>): Promise<File[]>;

  /**
   * Helper method to create an OutputFile with proper naming.
   *
   * @param basename - The base name for the file (without extension).
   * @param extension - The file extension (with or without dot).
   * @param data - The file data.
   * @returns An OutputFile object.
   */
  protected createOutputFile(basename: string, extension: string, data: Uint8Array): File {
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
