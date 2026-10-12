import { parseAssemblyManifest, parseVariantManifest } from '#manifest.js';
import type { AssemblyManifest, VariantManifest } from '#manifest.js';

/**
 * Where a host serves the four frozen asset files of `assets/`.
 * @public
 */
export type AssemblyUrls = {
  readonly manifest: string;
  readonly geometry: string;
  readonly variant: string;
  readonly offsets: string;
};

/**
 * The validated tessellation and its `faceWidth` 18 variant, decoded.
 * @public
 */
export type GearboxAssembly = {
  readonly manifest: AssemblyManifest;
  readonly binary: ArrayBuffer;
  readonly variant: VariantManifest;
  readonly offsets: ArrayBuffer;
};

const fetchAsset = async (url: string, signal: AbortSignal): Promise<Response> => {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`The gearbox model could not load (${response.status}).`);
  }
  return response;
};

/**
 * Read a `.gz` asset. Hosts may already have removed the Content-Encoding, so a body that does
 * not start with the gzip magic bytes is returned as is and never decompressed twice.
 * @param response - Successful response for a `.bin.gz` asset.
 * @returns The decoded bytes.
 * @public
 */
export const decodeGeometry = async (response: Response): Promise<ArrayBuffer> => {
  const bytes = await response.arrayBuffer();
  const magic = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
  return magic[0] === 0x1f && magic[1] === 0x8b
    ? new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
    : bytes;
};

/**
 * Fetch, decode and validate the frozen 34-part tessellation and its authored `faceWidth` variant.
 * @param urls - Where the host serves the asset files.
 * @param signal - Aborts the downloads.
 * @returns The validated assembly.
 * @throws Error when an asset is unavailable or does not validate.
 * @example
 * ```typescript
 * import { loadAssembly } from '@taucad/planetary-gearbox';
 * const assembly = await loadAssembly(
 *   { manifest: '/planetary.json', geometry: '/planetary.bin.gz', variant: '/planetary-face18.json', offsets: '/planetary-face18.bin.gz' },
 *   new AbortController().signal,
 * );
 * ```
 * @public
 */
export const loadAssembly = async (urls: AssemblyUrls, signal: AbortSignal): Promise<GearboxAssembly> => {
  const [manifestResponse, geometryResponse, variantResponse, offsetsResponse] = await Promise.all(
    [urls.manifest, urls.geometry, urls.variant, urls.offsets].map(async (url) => fetchAsset(url, signal)),
  );
  const [manifestJson, binary, variantJson, offsets] = await Promise.all([
    manifestResponse!.json() as Promise<unknown>,
    decodeGeometry(geometryResponse!),
    variantResponse!.json() as Promise<unknown>,
    decodeGeometry(offsetsResponse!),
  ]);
  const manifest = parseAssemblyManifest(manifestJson, binary.byteLength);
  const variant = parseVariantManifest(variantJson, manifest, offsets.byteLength);
  return { manifest, binary, variant, offsets };
};
