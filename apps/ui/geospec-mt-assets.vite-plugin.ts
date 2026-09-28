import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

const filenames = [
  'geospec_engine_native.mt.json',
  'build-receipt.json',
  'geospec_engine_native.mjs',
  'geospec_engine_native.wasm',
  'qualification.json',
] as const;
type Closure = {
  permits: number;
  files: ReadonlyMap<string, Uint8Array<ArrayBuffer>>;
};
type Asset = { file?: string; bytes?: number; sha256?: string };
type Receipt = {
  schema?: string;
  permits?: number;
  buildReceipt?: Asset;
  glue?: Asset;
  wasm?: Asset;
  worker?: Asset;
};
type Qualification = {
  schema?: string;
  verdict?: string;
  permits?: number;
  assetReceiptSha256?: string;
  buildReceiptSha256?: string;
  sourceRevision?: string;
  checks?: {
    nodePthreads?: boolean;
    browserPthreads?: boolean;
    stParity?: boolean;
  };
};
type Build = {
  schema?: string;
  variant?: string;
  sourceRevision?: string;
  output?: string;
  mtSettings?: { executionPermits?: number };
  artifacts?: ReadonlyArray<{ path?: string; bytes?: number; sha256?: string }>;
};
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const sha256 = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');
const decoder = new TextDecoder();

/** Admit only the independently qualified closure already staged by package assembly. */
export const createGeoSpecMtAssets = (
  stage: string | undefined,
): { receipts: Record<number, string>; plugin: Plugin } => {
  const closures: Closure[] = [];
  if (stage) {
    const manifest = JSON.parse(readFileSync(path.join(stage, 'package.json'), 'utf8')) as
      | { name?: string; exports?: Record<string, string> }
      | undefined;
    if (manifest?.name !== '@taucad/geospec-engine-native' || !record(manifest.exports)) {
      throw new Error('GeoSpec MT staged package manifest is invalid.');
    }
    const root = path.join(stage, 'dist/bindings/mt-wasm');
    for (const directory of readdirSync(root).sort()) {
      const match = /^permits-([1-9]\d*)$/u.exec(directory);
      if (!match) {
        throw new Error(`Unexpected GeoSpec MT staged directory: ${directory}`);
      }
      const permits = Number(match[1]);
      if (
        !Number.isSafeInteger(permits) ||
        permits > 4_294_967_295 ||
        manifest.exports[`./mt-assets/${directory}/*`] !== `./dist/bindings/mt-wasm/${directory}/*`
      ) {
        throw new Error(`GeoSpec MT staged export is invalid: ${directory}`);
      }
      const files = new Map(
        filenames.map((name) => [name, Uint8Array.from(readFileSync(path.join(root, directory, name)))]),
      );
      const receipt = JSON.parse(decoder.decode(files.get('geospec_engine_native.mt.json'))) as Receipt | undefined;
      const qualification = JSON.parse(decoder.decode(files.get('qualification.json'))) as Qualification | undefined;
      const build = JSON.parse(decoder.decode(files.get('build-receipt.json'))) as Build | undefined;
      if (
        receipt?.schema !== 'geospec-mixed-mt-assets-v1' ||
        receipt.permits !== permits ||
        qualification?.schema !== 'geospec-mt-qualification-v1' ||
        qualification.verdict !== 'passed' ||
        qualification.permits !== permits ||
        qualification.assetReceiptSha256 !== sha256(files.get('geospec_engine_native.mt.json')!) ||
        qualification.checks?.nodePthreads !== true ||
        qualification.checks.browserPthreads !== true ||
        qualification.checks.stParity !== true ||
        build?.schema !== 'geospec-mixed-build-receipt-mt-v1' ||
        build.variant !== 'mt' ||
        build.sourceRevision !== qualification.sourceRevision ||
        typeof build.output !== 'string' ||
        !path.isAbsolute(build.output) ||
        build.mtSettings?.executionPermits !== permits
      ) {
        throw new Error(`GeoSpec MT qualification is invalid: ${directory}`);
      }
      for (const [field, name] of [
        ['buildReceipt', 'build-receipt.json'],
        ['glue', 'geospec_engine_native.mjs'],
        ['wasm', 'geospec_engine_native.wasm'],
      ] as const) {
        const declared = receipt[field];
        const bytes = files.get(name)!;
        if (
          !declared ||
          declared.file !== name ||
          declared.bytes !== bytes.length ||
          declared.sha256 !== sha256(bytes)
        ) {
          throw new Error(`GeoSpec MT staged ${field} is invalid: ${directory}`);
        }
        if (
          field !== 'buildReceipt' &&
          !build.artifacts?.some(
            (artifact) =>
              artifact.path === path.join(build.output!, name) &&
              artifact.bytes === bytes.length &&
              artifact.sha256 === declared.sha256,
          )
        ) {
          throw new Error(`GeoSpec MT build artifact is invalid: ${directory}/${name}`);
        }
      }
      if (
        !receipt.buildReceipt ||
        qualification.buildReceiptSha256 !== receipt.buildReceipt.sha256 ||
        JSON.stringify(receipt.worker) !== JSON.stringify(receipt.glue)
      ) {
        throw new Error(`GeoSpec MT build/worker identity is invalid: ${directory}`);
      }
      closures.push({ permits, files });
    }
    if (closures.length === 0) {
      throw new Error('GeoSpec MT staged package has no qualified assets.');
    }
  }
  const receipts = Object.fromEntries(
    closures.map(({ permits }) => [permits, `/geospec-mt/permits-${permits}/geospec_engine_native.mt.json`]),
  ) as Record<number, string>;
  return {
    receipts,
    plugin: {
      name: 'tau:geospec-qualified-mt-assets',
      applyToEnvironment: (environment) => environment.config.consumer === 'client',
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          const match = /^\/geospec-mt\/permits-([1-9]\d*)\/([^/?]+)(?:\?.*)?$/u.exec(request.url ?? '');
          const closure = closures.find(({ permits }) => permits === Number(match?.[1]));
          const filename = match?.[2];
          const bytes = filename ? closure?.files.get(filename) : undefined;
          if (!bytes) {
            next();
            return;
          }
          response.setHeader(
            'Content-Type',
            filename!.endsWith('.wasm')
              ? 'application/wasm'
              : filename!.endsWith('.mjs')
                ? 'text/javascript; charset=utf-8'
                : 'application/json; charset=utf-8',
          );
          response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
          response.end(bytes);
        });
      },
      generateBundle() {
        for (const { permits, files } of closures) {
          for (const [name, bytes] of files) {
            this.emitFile({
              type: 'asset',
              fileName: `geospec-mt/permits-${permits}/${name}`,
              source: bytes,
            });
          }
        }
      },
    },
  };
};
