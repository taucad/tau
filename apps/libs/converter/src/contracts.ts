/** @public */
export type ConverterSource = {
  readonly files: Record<string, Uint8Array<ArrayBuffer>>;
  readonly entry: string;
};

/** @public */
export const createConverterSource = (
  entries: ReadonlyArray<readonly [string, Uint8Array<ArrayBuffer>]>,
  entry: string,
): ConverterSource => {
  const files = Object.fromEntries(entries);
  if (Object.keys(files).length !== entries.length) {
    throw new Error('Selected files contain duplicate runtime paths');
  }
  return { files, entry };
};
