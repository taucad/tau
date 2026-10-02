declare const manifest: {
  readonly bundles: ReadonlyArray<{
    readonly slug: string;
    readonly name: string;
    readonly description: string;
    readonly version: string;
    readonly whenToUse: string;
    readonly directory: string;
    readonly files: readonly string[];
    readonly body: string;
  }>;
};
export = manifest;
