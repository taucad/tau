/**
 * The rule for where a Tau .NET layer is published and how its record becomes the `worker` pin of the kernel's
 * `tau-plugin.json`. A layer is the kernel's framework-dependent worker, its patched library, Roslyn and its native
 * engine, built by a release job into one `tar.gz` that unpacks to `tau-worker/` beside Microsoft's `dotnet/` runtime.
 *
 * Why: the layer is addressed by its digest on `cdn.tau.new` (`blobs/sha256/<hex>`, the D25 mirror layout) and by an
 * immutable GitHub Release named after the digest; deriving both from the record keeps the manifest, the upload and
 * the tests from drifting (I13).
 *
 * @module
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { z } from 'zod';

const hex64 = z.string().regex(/^[\da-f]{64}$/u);

/**
 * What one kernel states about its layer.
 * @public
 */
export type DotnetLayer = {
  /**
   * The slug in the layer's names: the asset `tau-<name>-layer-<target>.tar.gz`, the release `<name>-layer-<16 hex>`
   * and the SBOM inside the layer, `tau-worker/tau-<name>-sbom.cdx.json`.
   */
  readonly name: string;
  /** The kernel's npm package, the SBOM's subject. */
  readonly package: string;
  /** The kernel's display name, used in errors. */
  readonly displayName: string;
  /** What the closure is, for the SBOM's subject. */
  readonly description: string;
  /** The `<os>-<arch>` targets the release job builds the layer for. */
  readonly targets: readonly [string, ...string[]];
};

/** The parsed JSON of a manifest or an SBOM. @public */
export type LayerJson = Record<string, unknown>;

/**
 * What a layer build writes beside the archive (`tau-layer.json`): the bytes' identity and provenance.
 * @public
 */
export type DotnetLayerRecord = {
  readonly schemaVersion: 2;
  readonly target: string;
  /** File name of the `.tar.gz` beside the record. */
  readonly asset: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly unpackedByteLength: number;
  readonly fileCount: number;
  readonly protocolVersion: number;
  readonly dotnetRuntimeVersion: string;
  readonly readyToRun: boolean;
  readonly sourceFilesSha256: string;
  /**
   * The engine receipt's `sourceSha256`: native source pins, patches, build profile and toolchain (compiler, SDK,
   * CMake and Ninja, by version and binary digest). Equal inputs build equal layer bytes (X26).
   */
  readonly nativeSourceSha256: string;
  /** The build toolchain by version, for reading; `nativeSourceSha256` is what pins it. */
  readonly toolchain: {
    readonly dotnetSdk: string;
    readonly compiler: string;
    readonly sdk: string;
    readonly cmake: string;
    readonly ninja: string;
  };
};

/**
 * The publication rule of one kernel's layer.
 * @public
 */
export type DotnetLayerRule = {
  /** Validates a layer record of one of the layer's targets. */
  readonly recordSchema: z.ZodType<DotnetLayerRecord>;
  /**
   * The GitHub Release that carries one layer; one release per layer digest, created draft, then upload, then publish.
   * @returns A tag such as `picogk-layer-0123456789abcdef`.
   */
  readonly releaseTag: (sha256: string) => string;
  /**
   * The URLs the manifest pins for a layer, canonical first.
   * @returns The CDN URL, then the GitHub Release asset URL.
   */
  readonly urls: (record: Pick<DotnetLayerRecord, 'sha256' | 'asset'>) => [string, string];
  /**
   * The `worker` payload of the record's target variant.
   * @returns The payload, in manifest field order.
   */
  readonly payload: (record: DotnetLayerRecord) => Readonly<LayerJson>;
  /**
   * Replace the `worker` payload of the record's `runtime` variant and keep every other byte of the manifest.
   * @returns The new manifest.
   * @throws When the manifest has no `runtime` variant for the record's target with a `worker` payload.
   */
  readonly composeManifest: (manifest: LayerJson, record: DotnetLayerRecord) => LayerJson;
  /**
   * The CycloneDX 1.6 SBOM of the closure a manifest pins (charter D26): one component per payload and target, with
   * its purl, its pinned hash, its licence where the publisher states one, and a `distribution` reference to each URL.
   * The layer's own inventory is the SBOM inside the layer, which the layer component names.
   * @returns The SBOM document.
   * @throws When a payload is neither Microsoft's runtime archive nor a layer published by this rule.
   */
  readonly composeSbom: (manifest: LayerJson) => LayerJson;
};

/** Digest-addressed public base of Tau-authored payloads (`tau-prod-content` behind `cdn.tau.new`). @public */
export const payloadCdnBase = 'https://cdn.tau.new/';

/**
 * The bucket key of a payload: the D25 mirror layout, so `cdn.tau.new` also serves as a `TAU_PAYLOAD_MIRROR`.
 * @param sha256 - Lowercase hex digest of the bytes.
 * @returns `blobs/sha256/<hex>`.
 * @public
 */
export const payloadKey = (sha256: string): string => `blobs/sha256/${sha256}`;

/**
 * The canonical text of a manifest or SBOM: two-space JSON and one trailing newline.
 * @param manifest - The document.
 * @returns Its file text.
 * @public
 */
export const manifestText = (manifest: LayerJson): string => `${JSON.stringify(manifest, undefined, 2)}\n`;

const hexOf = (integrity: string): { readonly algorithm: string; readonly hex: string } => {
  const dash = integrity.indexOf('-');
  return {
    algorithm: integrity.slice(0, dash).replace(/^sha/u, 'SHA-'),
    hex: Buffer.from(integrity.slice(dash + 1), 'base64').toString('hex'),
  };
};

const escape = (text: string): string => text.replaceAll(/[$()*+.?[\\\]^{|}]/gu, String.raw`\$&`);

const dotnetVersionPattern = /\/Runtime\/(?<version>[^/]+)\/dotnet-runtime-/u;

const targetOf = (variant: LayerJson): string | undefined => {
  const target = variant['target'] as LayerJson | undefined;
  return target?.['runtime'] === 'native' ? `${String(target['os'])}-${String(target['arch'])}` : undefined;
};

/**
 * Create the publication rule of a kernel's layer, shared by its compose script, its release job (through that
 * script) and its manifest tests.
 *
 * @param layer - The kernel's layer.
 * @returns The record schema and the functions that derive the manifest pin and the SBOM from a record.
 * @public
 */
export const createDotnetLayer = (layer: DotnetLayer): DotnetLayerRule => {
  const assetOf = (target: string): string => `tau-${layer.name}-layer-${target}.tar.gz`;
  const releaseTag = (sha256: string): string => `${layer.name}-layer-${sha256.slice(0, 16)}`;
  const tagPattern = new RegExp(
    `/releases/download/(?<tag>${escape(layer.name)}-layer-[\\da-f]{16})/(?<asset>[^/]+)$`,
    'u',
  );
  const recordSchema = z
    .object({
      schemaVersion: z.literal(2),
      target: z.enum(layer.targets),
      asset: z.string().regex(new RegExp(`^${layer.targets.map((target) => escape(assetOf(target))).join('|')}$`, 'u')),
      sha256: hex64,
      byteLength: z.number().int().positive(),
      unpackedByteLength: z.number().int().positive(),
      fileCount: z.number().int().positive(),
      protocolVersion: z.number().int().positive(),
      dotnetRuntimeVersion: z.string().min(1),
      readyToRun: z.boolean(),
      sourceFilesSha256: hex64,
      nativeSourceSha256: hex64,
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
    .strict()
    .refine(({ target, asset }) => asset === assetOf(target), {
      message: 'The asset must be the layer archive of the record target.',
      path: ['asset'],
    });

  const urls = (record: Pick<DotnetLayerRecord, 'sha256' | 'asset'>): [string, string] => [
    `${payloadCdnBase}${payloadKey(record.sha256)}`,
    `https://github.com/taucad/tau/releases/download/${releaseTag(record.sha256)}/${record.asset}`,
  ];

  const payload = (record: DotnetLayerRecord): Readonly<LayerJson> => ({
    name: 'worker',
    integrity: `sha256-${Buffer.from(record.sha256, 'hex').toString('base64')}`,
    byteLength: record.byteLength,
    format: 'tar.gz',
    origin: { kind: 'url', urls: urls(record) },
    destination: 'tau-worker',
    unpackedByteLength: record.unpackedByteLength,
  });

  const composeManifest = (manifest: LayerJson, record: DotnetLayerRecord): LayerJson => {
    const next = structuredClone(manifest);
    const variants = (next['dependencies'] as LayerJson | undefined)?.['runtime'];
    const variant = (Array.isArray(variants) ? (variants as LayerJson[]) : []).find(
      (candidate) => targetOf(candidate) === record.target,
    );
    const payloads = variant?.['payloads'];
    const index = Array.isArray(payloads) ? (payloads as LayerJson[]).findIndex(({ name }) => name === 'worker') : -1;
    if (index === -1) {
      throw new Error(`tau-plugin.json has no ${record.target} runtime variant with a worker payload.`);
    }
    (payloads as LayerJson[])[index] = payload(record);
    return next;
  };

  const composeSbom = (manifest: LayerJson): LayerJson => {
    const variants = (manifest['dependencies'] as LayerJson | undefined)?.['runtime'];
    const components: LayerJson[] = [];
    for (const variant of Array.isArray(variants) ? (variants as LayerJson[]) : []) {
      const target = variant['target'] as LayerJson;
      const targetName = `${String(target['os'])}-${String(target['arch'])}`;
      for (const entry of (variant['payloads'] as LayerJson[] | undefined) ?? []) {
        const entryUrls = ((entry['origin'] as LayerJson | undefined)?.['urls'] as string[] | undefined) ?? [];
        const { algorithm, hex } = hexOf(String(entry['integrity']));
        const shared = {
          hashes: [{ alg: algorithm, content: hex }],
          externalReferences: entryUrls.map((url) => ({ type: 'distribution', url })),
          properties: [{ name: 'taucad:target', value: targetName }],
        };
        if (entry['name'] === 'dotnet') {
          const version = dotnetVersionPattern.exec(entryUrls[0] ?? '')?.groups?.['version'];
          if (version === undefined) {
            throw new Error(`The dotnet payload URL ${String(entryUrls[0])} names no runtime version.`);
          }
          components.push({
            'bom-ref': hex,
            type: 'platform',
            supplier: { name: 'Microsoft' },
            name: 'dotnet-runtime',
            version,
            purl: `pkg:generic/microsoft/dotnet-runtime@${version}?download_url=${encodeURIComponent(entryUrls[0] ?? '')}`,
            licenses: [{ expression: 'MIT' }],
            ...shared,
          });
          continue;
        }
        const release = entryUrls.map((url) => tagPattern.exec(url)?.groups).find((groups) => groups !== undefined);
        if (entry['name'] !== 'worker' || release === undefined) {
          throw new Error(`The SBOM rule does not describe the ${String(entry['name'])} payload.`);
        }
        components.push({
          'bom-ref': hex,
          type: 'library',
          supplier: { name: 'Tau' },
          name: `tau-${layer.name}-layer`,
          version: release['tag'],
          purl: `pkg:github/taucad/tau@${String(release['tag'])}?file_name=${String(release['asset'])}`,
          ...shared,
          properties: [
            ...shared.properties,
            { name: 'taucad:sbom', value: `tau-worker/tau-${layer.name}-sbom.cdx.json` },
          ],
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
          'bom-ref': layer.package,
          name: layer.package,
          description: layer.description,
        },
      },
      components: components.toSorted((left, right) => String(left['bom-ref']).localeCompare(String(right['bom-ref']))),
    };
  };

  return { recordSchema, releaseTag, urls, payload, composeManifest, composeSbom };
};

/**
 * One run of a kernel's compose script.
 * @public
 */
export type ComposeTauPluginInput = {
  /** The kernel's layer. */
  readonly layer: DotnetLayer;
  /** Absolute path of the kernel's checked-in `tau-plugin.json`; its SBOM is `tau-plugin.cdx.json` beside it. */
  readonly manifestPath: string;
  /** The script's arguments, without the executable and script path. */
  readonly args: readonly string[];
};

const usage =
  'Usage: compose-tau-plugin.mts --layer <tau-layer.json> [--archive <layer.tar.gz>] [--check | --write <path>] [--outputs]';

/**
 * Run a kernel's compose script: rewrite the `worker` pin of its `tau-plugin.json` from a layer record the release job
 * produced, and derive the closure's CycloneDX SBOM (`tau-plugin.cdx.json`, charter D26) beside it; or check, verify
 * and describe that record for the release job's upload steps.
 *
 * Arguments: `--layer <tau-layer.json>` (required); `--archive <layer.tar.gz>` verifies the archive's bytes against the
 * record; `--check` compares the checked-in manifest and SBOM as data instead of writing; `--write <path>` writes the
 * manifest there (and its SBOM beside it) instead of rewriting the checked-in one; `--outputs` prints `key=value`
 * lines for `$GITHUB_OUTPUT`.
 *
 * @param input - The kernel's layer, its manifest path and the script's arguments.
 * @returns The exit code: 0 success; 1 the record, the archive or the `--check` comparison failed; 2 usage.
 * @public
 */
export const runComposeTauPlugin = async (input: ComposeTauPluginInput): Promise<number> => {
  const rule = createDotnetLayer(input.layer);
  const sbomPath = (manifest: string): string => resolve(dirname(manifest), 'tau-plugin.cdx.json');
  try {
    const { values } = parseArgs({
      args: [...input.args],
      options: {
        layer: { type: 'string' },
        archive: { type: 'string' },
        check: { type: 'boolean', default: false },
        write: { type: 'string' },
        outputs: { type: 'boolean', default: false },
      },
    });
    if (values.layer === undefined || (values.check && values.write !== undefined)) {
      console.error(usage);
      return 2;
    }
    const record = rule.recordSchema.parse(JSON.parse(await readFile(resolve(values.layer), 'utf8')));
    if (values.archive !== undefined) {
      const bytes = await readFile(resolve(values.archive));
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      if (sha256 !== record.sha256 || bytes.byteLength !== record.byteLength) {
        console.error(
          `${values.archive} is ${String(bytes.byteLength)} bytes with sha256 ${sha256}; the record pins ${String(record.byteLength)} bytes with ${record.sha256}.`,
        );
        return 1;
      }
    }
    const current = JSON.parse(await readFile(input.manifestPath, 'utf8')) as LayerJson;
    const composed = rule.composeManifest(current, record);
    const sbom = rule.composeSbom(composed);
    if (values.check) {
      // Compared as data: the checked-in file is formatted by the repository's formatter, not by this script.
      if (JSON.stringify(composed) !== JSON.stringify(current)) {
        console.error(
          `${input.manifestPath} does not pin the layer ${record.sha256}; run this script without --check.`,
        );
        return 1;
      }
      const currentSbom = JSON.parse(await readFile(sbomPath(input.manifestPath), 'utf8')) as unknown;
      if (JSON.stringify(sbom) !== JSON.stringify(currentSbom)) {
        console.error(
          `${sbomPath(input.manifestPath)} does not describe the manifest; run this script without --check.`,
        );
        return 1;
      }
    } else {
      const target = values.write === undefined ? input.manifestPath : resolve(values.write);
      await writeFile(target, manifestText(composed));
      await writeFile(sbomPath(target), manifestText(sbom));
    }
    if (values.outputs) {
      const [cdnUrl, releaseUrl] = rule.urls(record);
      console.log(
        [
          `sha256=${record.sha256}`,
          `byte-length=${String(record.byteLength)}`,
          `asset=${record.asset}`,
          `key=${payloadKey(record.sha256)}`,
          `tag=${rule.releaseTag(record.sha256)}`,
          `cdn-url=${cdnUrl}`,
          `release-url=${releaseUrl}`,
        ].join('\n'),
      );
    }
    return 0;
  } catch (error) {
    console.error(`Composing the ${input.layer.displayName} manifest failed:`, error);
    return 1;
  }
};
