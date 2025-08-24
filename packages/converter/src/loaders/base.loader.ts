import type { InputFormat, InputFile } from '#types.js';

export type BaseLoaderOptions = {
  format: InputFormat;
};

/**
 * Base abstract class for loaders.
 * Provides a unified interface for loading 3D objects from various formats.
 *
 * @template ParseResult - The intermediate result type from the underlying loader
 * @template Options - The options type specific to each loader implementation
 */
export abstract class BaseLoader<ParseResult = unknown, Options extends BaseLoaderOptions = BaseLoaderOptions> {
  /**
   * The options passed to the loader. These are specific to each loader implementation.
   */
  protected options!: Options;

  /**
   * Initialize the loader with options.
   *
   * @param options - The options passed to the loader. These are specific to each loader implementation.
   */
  public initialize(options: Options): this {
    this.options = options;
    return this;
  }

  /**
   * Load and parse files and return GLB data.
   *
   * @param files - The input files to load (can be single file or multiple files).
   * @param options - Optional runtime options that may override initialization options.
   * @returns A promise that resolves to GLB data as Uint8Array.
   */
  public async loadAsync(files: InputFile[], options?: Partial<Options>): Promise<Uint8Array> {
    const mergedOptions = this.mergeOptions(options);
    const parseResult = await this.parseAsync(files, mergedOptions);
    return this.mapToGlb(parseResult, mergedOptions);
  }

  /**
   * Convert Uint8Array to ArrayBuffer for loaders that require it.
   *
   * @param data - The Uint8Array to convert.
   * @returns The ArrayBuffer representation.
   */
  protected uint8ArrayToArrayBuffer(data: Uint8Array): ArrayBuffer {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  }

  /**
   * Convert Uint8Array to text.
   *
   * @param data - The Uint8Array to convert.
   * @returns The text representation.
   */
  protected uint8ArrayToText(data: Uint8Array): string {
    return new TextDecoder().decode(data);
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
   * Find the primary file for the current format from the input files array.
   * Looks for a file with an extension matching the current format.
   *
   * @param files - The input files to search.
   * @returns The primary file for this format.
   * @throws Error if no suitable file is found.
   */
  protected findPrimaryFile(files: InputFile[]): InputFile {
    return this.requireFileByExtension(files, this.options.format);
  }

  /**
   * Find a file by its extension from the input files array.
   *
   * @param files - The input files to search.
   * @param extension - The file extension to look for (with or without dot).
   * @returns The first file matching the extension, or undefined if not found.
   */
  protected findFileByExtension(files: InputFile[], extension: string): InputFile | undefined {
    const normalizedExtension = extension.startsWith('.') ? extension.slice(1) : extension;
    return files.find((file) => {
      const fileExtension = file.name.split('.').pop()?.toLowerCase();
      return fileExtension === normalizedExtension.toLowerCase();
    });
  }

  /**
   * Find a file by its extension from the input files array, throwing if not found.
   *
   * @param files - The input files to search.
   * @param extension - The file extension to look for (with or without dot).
   * @returns The first file matching the extension.
   * @throws Error if no file with the extension is found.
   */
  protected requireFileByExtension(files: InputFile[], extension: string): InputFile {
    const file = this.findFileByExtension(files, extension);
    if (!file) {
      const normalizedExtension = extension.startsWith('.') ? extension : `.${extension}`;
      throw new Error(`No ${normalizedExtension.toUpperCase()} file found in file set`);
    }

    return file;
  }

  /**
   * Create a map of filename to file data for easy lookup.
   *
   * @param files - The input files to map.
   * @returns A map with filename as key and file data as value.
   */
  protected createFileMap(files: InputFile[]): Map<string, Uint8Array> {
    const fileMap = new Map<string, Uint8Array>();
    for (const file of files) {
      fileMap.set(file.name, file.data);
    }

    return fileMap;
  }

  /**
   * Parse the input files using the underlying loader.
   *
   * @param files - The input files to parse.
   * @param options - The merged options for parsing.
   * @returns A promise that resolves to the intermediate parse result.
   */
  protected abstract parseAsync(files: InputFile[], options: Options): Promise<ParseResult>;

  /**
   * Map the parse result to GLB data.
   * The parseResult type is equivalent to the resolved value of parseAsync.
   *
   * @param parseResult - The result from the underlying loader (same type as parseAsync return).
   * @param options - The merged options for mapping.
   * @returns GLB data as Uint8Array.
   */
  protected abstract mapToGlb(parseResult: ParseResult, options: Options): Uint8Array | Promise<Uint8Array>;
}
