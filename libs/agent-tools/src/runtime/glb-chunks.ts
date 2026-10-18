/** A parsed glTF JSON object. */
export type JsonObject = Readonly<Record<string, unknown>>;

/** A GLB's JSON chunk, parsed, and its binary chunk when it has one. */
export type GlbChunks = Readonly<{ json: JsonObject; bin?: Uint8Array<ArrayBuffer> | undefined }>;

const glbMagic = 0x46_54_6c_67;
const jsonChunkType = 0x4e_4f_53_4a;
const binChunkType = 0x00_4e_49_42;

/**
 * Whether a value is a plain JSON object.
 *
 * @param value - Any value.
 * @returns `true` for a non-null, non-array object.
 */
export const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The chunks of a GLB, or `undefined` for bytes that are not one.
 *
 * @param content - GLB bytes.
 * @returns The parsed glTF JSON and a view of the binary chunk.
 */
export const glbChunks = (content: Uint8Array<ArrayBuffer>): GlbChunks | undefined => {
  if (content.byteLength < 20) {
    return undefined;
  }
  const view = new DataView(content.buffer, content.byteOffset, content.byteLength);
  const length = view.getUint32(12, true);
  if (view.getUint32(0, true) !== glbMagic || view.getUint32(16, true) !== jsonChunkType) {
    return undefined;
  }
  if (20 + length > content.byteLength) {
    return undefined;
  }
  let json: JsonObject;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(content.subarray(20, 20 + length)));
    if (!isObject(parsed)) {
      return undefined;
    }
    json = parsed;
  } catch {
    // A display GLB whose JSON does not parse has no facts to report; the viewer reports it.
    return undefined;
  }
  const binStart = 20 + length;
  if (binStart + 8 > content.byteLength || view.getUint32(binStart + 4, true) !== binChunkType) {
    return { json };
  }
  const binLength = Math.min(view.getUint32(binStart, true), content.byteLength - binStart - 8);
  return { json, bin: content.subarray(binStart + 8, binStart + 8 + binLength) };
};

/** A rendered view's artifact, as the runtime returns it. */
export type RenderedArtifact = Readonly<{ mimeType: string; content: Uint8Array<ArrayBuffer> | string }>;

/* The evaluate path reads one artifact for its summary and its mechanism: parse its JSON chunk once. */
const parsedArtifacts = new WeakMap<Uint8Array<ArrayBuffer>, GlbChunks | undefined>();

/**
 * The chunks of a rendered GLB artifact, parsed once per artifact.
 *
 * @param artifact - A rendered view's artifact.
 * @returns Its chunks, or `undefined` when it is not a readable GLB.
 */
export const renderedGlb = (artifact: RenderedArtifact | undefined): GlbChunks | undefined => {
  if (artifact?.mimeType !== 'model/gltf-binary' || typeof artifact.content === 'string') {
    return undefined;
  }
  const { content } = artifact;
  if (!parsedArtifacts.has(content)) {
    parsedArtifacts.set(content, glbChunks(content));
  }
  return parsedArtifacts.get(content);
};
