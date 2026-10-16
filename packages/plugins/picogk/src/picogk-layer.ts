/**
 * Purpose: The one rule for where the Tau PicoGK layer is published and how its record becomes the `worker` pin of
 *   `tau-plugin.json`. Shared by the compose script, the release job (through it) and the manifest test.
 * Why: the layer is addressed by its digest on `cdn.tau.new` (`blobs/sha256/<hex>`, the D25 mirror layout) and by an
 *   immutable GitHub Release named after the digest; deriving both from the record keeps the manifest, the upload
 *   and the test from drifting (I13).
 * Environment: none; pure functions.
 * Usage: imported by scripts/compose-tau-plugin.mts, the manifest test and the native test fixture; not exported.
 * Exit codes: none.
 */
import { z } from 'zod';

const hex64 = z.string().regex(/^[\da-f]{64}$/u);

/**
 * What `prepare-picogk-dotnet.mts --layer` writes beside the layer archive: the bytes' identity and provenance.
 * @internal
 */
export const picogkLayerRecordSchema = z
  .object({
    schemaVersion: z.literal(2),
    target: z.literal('darwin-arm64'),
    /** File name of the `.tar.gz` beside the record. */
    asset: z.string().regex(/^tau-picogk-layer-darwin-arm64\.tar\.gz$/u),
    sha256: hex64,
    byteLength: z.number().int().positive(),
    unpackedByteLength: z.number().int().positive(),
    fileCount: z.number().int().positive(),
    protocolVersion: z.number().int().positive(),
    dotnetRuntimeVersion: z.string().min(1),
    readyToRun: z.boolean(),
    sourceFilesSha256: hex64,
    /**
     * The engine receipt's `sourceSha256`: native source pins, patches, build profile and toolchain (compiler, SDK,
     * CMake and Ninja, by version and binary digest). Equal inputs build equal layer bytes (X26).
     */
    nativeSourceSha256: hex64,
    /** The build toolchain by version, for reading; `nativeSourceSha256` is what pins it. */
    toolchain: z
      .object({
        dotnetSdk: z.string().min(1),
        compiler: z.string().min(1),
        sdk: z.string().min(1),
        cmake: z.string().min(1),
        ninja: z.string().min(1),
      })
      .strict(),
  })
  .strict();

/** @internal */
export type PicogkLayerRecord = z.infer<typeof picogkLayerRecordSchema>;

/** Digest-addressed public base of Tau-authored payloads (`tau-prod-content` behind `cdn.tau.new`). */
export const payloadCdnBase = 'https://cdn.tau.new/';

/**
 * The bucket key of a payload: the D25 mirror layout, so `cdn.tau.new` also serves as a `TAU_PAYLOAD_MIRROR`.
 * @param sha256 - Lowercase hex digest of the bytes.
 * @returns `blobs/sha256/<hex>`.
 */
export const payloadKey = (sha256: string): string => `blobs/sha256/${sha256}`;

/**
 * The GitHub Release that carries one layer; one release per layer digest, created draft → upload → publish.
 * @param sha256 - Lowercase hex digest of the layer archive.
 * @returns A tag such as `picogk-layer-0123456789abcdef`.
 */
export const layerReleaseTag = (sha256: string): string => `picogk-layer-${sha256.slice(0, 16)}`;

/**
 * The URLs the manifest pins for a layer, canonical first.
 * @param record - The layer record.
 * @returns The CDN URL, then the GitHub Release asset URL.
 */
export const layerUrls = (record: Pick<PicogkLayerRecord, 'sha256' | 'asset'>): [string, string] => [
  `${payloadCdnBase}${payloadKey(record.sha256)}`,
  `https://github.com/taucad/tau/releases/download/${layerReleaseTag(record.sha256)}/${record.asset}`,
];

/**
 * The `worker` payload of the darwin-arm64 variant for a layer record.
 * @param record - The layer record.
 * @returns The payload, in manifest field order.
 */
export const layerPayload = (record: PicogkLayerRecord): Readonly<Record<string, unknown>> => ({
  name: 'worker',
  integrity: `sha256-${Buffer.from(record.sha256, 'hex').toString('base64')}`,
  byteLength: record.byteLength,
  format: 'tar.gz',
  origin: { kind: 'url', urls: layerUrls(record) },
  destination: 'tau-worker',
  unpackedByteLength: record.unpackedByteLength,
});

type Json = Record<string, unknown>;

/**
 * Replace the `worker` payload of the darwin-arm64 `runtime` variant and keep every other byte of the manifest.
 * @param manifest - The parsed `tau-plugin.json`.
 * @param record - The layer record.
 * @returns The new manifest.
 * @throws When the manifest has no darwin-arm64 `runtime` variant with a `worker` payload.
 */
export const composeManifest = (manifest: Json, record: PicogkLayerRecord): Json => {
  const next = structuredClone(manifest);
  const variants = (next['dependencies'] as Json | undefined)?.['runtime'];
  const variant = (Array.isArray(variants) ? (variants as Json[]) : []).find((candidate) => {
    const target = candidate['target'] as Json | undefined;
    return target?.['runtime'] === 'native' && target['os'] === 'darwin' && target['arch'] === 'arm64';
  });
  const payloads = variant?.['payloads'];
  const index = Array.isArray(payloads) ? (payloads as Json[]).findIndex(({ name }) => name === 'worker') : -1;
  if (index === -1) {
    throw new Error('tau-plugin.json has no darwin-arm64 runtime variant with a worker payload.');
  }
  (payloads as Json[])[index] = layerPayload(record);
  return next;
};

/**
 * The canonical text of a manifest: two-space JSON and one trailing newline.
 * @param manifest - The manifest.
 * @returns Its file text.
 */
export const manifestText = (manifest: Json): string => `${JSON.stringify(manifest, undefined, 2)}\n`;

const hexOf = (integrity: string): { readonly algorithm: string; readonly hex: string } => {
  const dash = integrity.indexOf('-');
  return {
    algorithm: integrity.slice(0, dash).replace(/^sha/u, 'SHA-'),
    hex: Buffer.from(integrity.slice(dash + 1), 'base64').toString('hex'),
  };
};

const dotnetVersionPattern = /\/Runtime\/(?<version>[^/]+)\/dotnet-runtime-/u;
const layerTagPattern = /\/releases\/download\/(?<tag>picogk-layer-[\da-f]{16})\/(?<asset>[^/]+)$/u;

/**
 * The CycloneDX 1.6 SBOM of the closure a manifest pins (charter D26): one component per payload and target, with its
 * purl, its pinned hash, its licence where the publisher states one, and a `distribution` reference to each URL. The
 * layer's own inventory (PicoGK, Roslyn, SkiaSharp and the engine's native sources) is the SBOM inside the layer,
 * `tau-worker/tau-picogk-sbom.cdx.json`, which the component names.
 * @param manifest - The parsed `tau-plugin.json`.
 * @returns The SBOM document.
 * @throws When a payload is not one this rule knows how to describe.
 */
export const composeSbom = (manifest: Json): Json => {
  const variants = (manifest['dependencies'] as Json | undefined)?.['runtime'];
  const components: Json[] = [];
  for (const variant of Array.isArray(variants) ? (variants as Json[]) : []) {
    const target = variant['target'] as Json;
    const targetName = `${String(target['os'])}-${String(target['arch'])}`;
    for (const payload of (variant['payloads'] as Json[] | undefined) ?? []) {
      const urls = ((payload['origin'] as Json | undefined)?.['urls'] as string[] | undefined) ?? [];
      const { algorithm, hex } = hexOf(String(payload['integrity']));
      const shared = {
        hashes: [{ alg: algorithm, content: hex }],
        externalReferences: urls.map((url) => ({ type: 'distribution', url })),
        properties: [{ name: 'taucad:target', value: targetName }],
      };
      if (payload['name'] === 'dotnet') {
        const version = dotnetVersionPattern.exec(urls[0] ?? '')?.groups?.['version'];
        if (version === undefined) {
          throw new Error(`The dotnet payload URL ${String(urls[0])} names no runtime version.`);
        }
        components.push({
          'bom-ref': hex,
          type: 'platform',
          supplier: { name: 'Microsoft' },
          name: 'dotnet-runtime',
          version,
          purl: `pkg:generic/microsoft/dotnet-runtime@${version}?download_url=${encodeURIComponent(urls[0] ?? '')}`,
          licenses: [{ expression: 'MIT' }],
          ...shared,
        });
        continue;
      }
      const release = urls.map((url) => layerTagPattern.exec(url)?.groups).find((groups) => groups !== undefined);
      if (payload['name'] !== 'worker' || release === undefined) {
        throw new Error(`The SBOM rule does not describe the ${String(payload['name'])} payload.`);
      }
      components.push({
        'bom-ref': hex,
        type: 'library',
        supplier: { name: 'Tau' },
        name: 'tau-picogk-layer',
        version: release['tag'],
        purl: `pkg:github/taucad/tau@${String(release['tag'])}?file_name=${String(release['asset'])}`,
        ...shared,
        properties: [...shared.properties, { name: 'taucad:sbom', value: 'tau-worker/tau-picogk-sbom.cdx.json' }],
      });
    }
  }
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    version: 1,
    metadata: {
      component: {
        type: 'application',
        'bom-ref': '@taucad/picogk',
        name: '@taucad/picogk',
        description:
          "The native PicoGK runtime closure: Microsoft's .NET runtime archive and the Tau framework-dependent layer.",
      },
    },
    components: components.toSorted((left, right) => String(left['bom-ref']).localeCompare(String(right['bom-ref']))),
  };
};
