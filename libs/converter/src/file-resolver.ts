/**
 * Generic interface for on-demand file resolution.
 *
 * Used by both assimpjs (via ConvertFile callbacks) and gltf-transform
 * (via FileResolverIO) to lazily load sidecar assets (e.g. .bin buffers,
 * .mtl materials, textures) without requiring per-format dependency extraction.
 *
 * @public
 */
export type FileResolver = {
  /** Checks whether the given filename exists in the backing store. */
  exists(filename: string): Promise<boolean> | boolean;
  /** Reads the full contents of the given filename as a byte buffer. */
  readFile(filename: string): Promise<Uint8Array<ArrayBuffer>> | Uint8Array<ArrayBuffer>;
};
