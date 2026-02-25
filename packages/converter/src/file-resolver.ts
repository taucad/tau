/**
 * Generic interface for on-demand file resolution.
 *
 * Used by both assimpjs (via ConvertFile callbacks) and gltf-transform
 * (via FileResolverIO) to lazily load sidecar assets (e.g. .bin buffers,
 * .mtl materials, textures) without requiring per-format dependency extraction.
 */
export type FileResolver = {
  exists(filename: string): Promise<boolean> | boolean;
  readFile(filename: string): Promise<Uint8Array<ArrayBuffer>> | Uint8Array<ArrayBuffer>;
};
