/** `BIN\0`, little-endian. */
const binaryChunkType = 0x00_4e_49_42;
/** 12-byte GLB header plus the JSON chunk's own 8-byte header. */
const jsonChunkDataOffset = 20;
/** The BIN chunk's 8-byte header. */
const chunkHeaderLength = 8;

/** The slice of three's `GLTFParser` that owns the GLB's BIN chunk after a parse. */
type GltfParserBinaryChunk = {
  readonly extensions?: Readonly<Record<string, unknown>>;
};

/** `GLTFParser.cache` is untyped upstream; only `add` is used, after a runtime check. */
const getParserCache = (parser: GltfParserBinaryChunk): { add(key: string, value: unknown): void } | undefined => {
  const cache: unknown = 'cache' in parser ? parser.cache : undefined;
  return typeof cache === 'object' && cache !== null && 'add' in cache && typeof cache.add === 'function'
    ? (cache as { add(key: string, value: unknown): void })
    : undefined;
};

/** Locate the BIN chunk's data inside a GLB, or `undefined` when the bytes carry none. */
const findBinaryChunk = (bytes: Uint8Array<ArrayBuffer>): { offset: number; length: number } | undefined => {
  if (bytes.byteLength < jsonChunkDataOffset) {
    return undefined;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  const binaryHeader = jsonChunkDataOffset + jsonLength;
  if (
    binaryHeader + chunkHeaderLength > bytes.byteLength ||
    view.getUint32(binaryHeader + 4, true) !== binaryChunkType
  ) {
    return undefined;
  }
  const length = view.getUint32(binaryHeader, true);
  const offset = binaryHeader + chunkHeaderLength;
  return offset + length <= bytes.byteLength ? { offset, length } : undefined;
};

/**
 * Drop the parser's private copy of the GLB's BIN chunk once a parse has finished.
 *
 * `GLTFLoader` slices the BIN chunk into an `ArrayBuffer` of its own (a full copy of the model's
 * binary data) and keeps it on the binary extension and in its buffer cache. A presentation keeps
 * the parser so section topology can decode accessors on demand, which kept that copy alive beside
 * the source bytes the presentation already holds. Later buffer-view loads now slice the source
 * bytes directly, exactly as they sliced the copy.
 *
 * @param parser - The parser of a finished `GLTFLoader` parse of `source`.
 * @param source - The GLB bytes the parser read; the caller keeps them alive with the parser.
 * @returns Whether the copy was released.
 */
export function releaseGltfBinaryChunk(parser: GltfParserBinaryChunk, source: Uint8Array<ArrayBuffer>): boolean {
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- three writes the chunk as `body` and reads it back; `null` is its released state.
  const extension = parser.extensions?.['KHR_binary_glTF'] as { body: ArrayBuffer | null } | undefined;
  const chunk = findBinaryChunk(source);
  const cache = getParserCache(parser);
  if (!cache || !extension?.body || chunk?.length !== extension.body.byteLength) {
    return false;
  }
  const start = source.byteOffset + chunk.offset;
  const { length } = chunk;
  // `loadBufferView` only calls `slice` on the GLB buffer, so this stands in for the copy.
  const buffer = {
    byteLength: length,
    slice: (begin = 0, end = length): ArrayBuffer =>
      source.buffer.slice(start + Math.min(begin, length), start + Math.min(end, length)),
  };
  cache.add('buffer:0', Promise.resolve(buffer));
  extension.body = null;
  return true;
}
