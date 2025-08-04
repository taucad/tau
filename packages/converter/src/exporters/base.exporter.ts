import type { Object3D } from 'three';

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
   * @returns A promise that resolves to the exported data as a Uint8Array.
   */
  public abstract parseAsync(object: Object3D, options?: Partial<Options>): Promise<Uint8Array>;

  /**
   * Get the file extension for this exporter.
   *
   * @returns The file extension (without the dot).
   */
  public abstract getFileExtension(): string;

  /**
   * Get the MIME type for this exporter.
   *
   * @returns The MIME type for the exported format.
   */
  public abstract getMimeType(): string;

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
