/** One staged file supplied to an import backend. @public */
export type ImportFile = { readonly name: string; readonly bytes: Uint8Array<ArrayBuffer> };

/** Common import-loader options. @public */
export type ImportLoaderOptions = { readonly format: string };

/** Shared orchestration for backend-specific file-to-GLB loaders. @public */
export abstract class ImportLoader<ParseResult, Options extends ImportLoaderOptions = ImportLoaderOptions> {
  protected options!: Options;

  /** Configure this loader for one input format. */
  public initialize(options: Options): this {
    this.options = options;
    return this;
  }

  /** Parse staged files and return GLB bytes. */
  public async load(files: readonly ImportFile[]): Promise<Uint8Array<ArrayBuffer>> {
    return this.mapToGlb(await this.parse(files, this.options), this.options);
  }

  protected findPrimaryFile(files: readonly ImportFile[]): ImportFile {
    const file = files.find((candidate) => candidate.name.toLowerCase().endsWith(`.${this.options.format}`));
    if (!file) {
      throw new Error(`No .${this.options.format.toUpperCase()} file found in file set`);
    }
    return file;
  }

  protected abstract parse(files: readonly ImportFile[], options: Options): Promise<ParseResult>;
  protected abstract mapToGlb(
    result: ParseResult,
    options: Options,
  ): Uint8Array<ArrayBuffer> | Promise<Uint8Array<ArrayBuffer>>;
}
