import type { Object3D } from 'three';

/**
 * Base abstract class for Three.js loaders.
 * Provides a unified interface for loading 3D objects from various formats.
 *
 * @template ParseResult - The intermediate result type from the underlying loader
 * @template Options - The options type specific to each loader implementation
 */
export abstract class ThreeJsBaseLoader<ParseResult = unknown, Options = Record<string, never>> {
  /**
   * The options passed to the loader. These are specific to each loader implementation.
   */
  protected options!: Options;

  /**
   * Initialize the loader with options.
   *
   * @param options - The options passed to the loader. These are specific to each loader implementation.
   */
  public initialize(options: Options): void {
    this.options = options;
  }

  /**
   * Load and parse data from a Uint8Array and return Three.js Object3D array.
   *
   * @param data - The binary data to load.
   * @param options - Optional runtime options that may override initialization options.
   * @returns A promise that resolves to an array of Three.js Object3D objects.
   */
  public async loadAsync(data: Uint8Array, options?: Partial<Options>): Promise<Object3D> {
    const mergedOptions = this.mergeOptions(options);
    const parseResult = await this.parseAsync(data, mergedOptions);
    return this.mapToObject(parseResult, mergedOptions);
  }

  /**
   * Convert Uint8Array to ArrayBuffer for loaders that require it.
   *
   * @param data - The Uint8Array to convert.
   * @returns The ArrayBuffer representation.
   */
  protected toArrayBuffer(data: Uint8Array): ArrayBuffer {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  }

  /**
   * Merge runtime options with initialization options.
   *
   * @param runtimeOptions - Options provided at load time.
   * @returns Merged options with runtime options taking precedence.
   */
  protected mergeOptions(runtimeOptions?: Partial<Options>): Options {
    return { ...this.options, ...runtimeOptions };
  }

  /**
   * Wraps a synchronous parse function in a Promise, providing standardized error handling.
   * This is useful for loaders that do not have a built-in asynchronous `parse` method.
   *
   * @param parser - A function that takes no arguments and returns a `ParseResult`.
   * @returns A `Promise` that resolves with the `ParseResult` or rejects with a formatted error.
   */
  protected async withPromise(parser: () => ParseResult): Promise<ParseResult> {
    return new Promise((resolve, reject) => {
      try {
        const result = parser();
        resolve(result);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        reject(new Error(`Failed to parse with ${this.constructor.name}: ${errorMessage}`));
      }
    });
  }

  /**
   * Parse the binary data using the underlying loader.
   *
   * @param data - The binary data to parse.
   * @param options - The merged options for parsing.
   * @returns A promise that resolves to the intermediate parse result.
   */
  protected abstract parseAsync(data: Uint8Array, options: Options): Promise<ParseResult>;

  /**
   * Map the parse result to an array of Three.js Object3D objects.
   * The parseResult type is equivalent to the resolved value of parseAsync.
   *
   * @param parseResult - The result from the underlying loader (same type as parseAsync return).
   * @param options - The merged options for mapping.
   * @returns An array of Three.js Object3D objects.
   */
  protected abstract mapToObject(parseResult: ParseResult, options: Options): Object3D;
}
