declare const bundles: readonly {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly whenToUse: string;
  readonly body: string;
  readonly fingerprint: string;
  readonly files: readonly {
    readonly path: string;
    readonly url: string;
    readonly byteLength: number;
    readonly lineCount: number;
    readonly contentKind: 'text';
    readonly mediaType: 'text/markdown';
    readonly sha256: string;
  }[];
}[];
export default bundles;
