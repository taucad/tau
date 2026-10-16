import { createHash } from 'node:crypto';
import type { BinaryLike } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';

/** File name of the UI asset receipt at the root of the client output (charter D26). */
export const assetReceiptFileName = 'tau-asset-receipt.json';

/** One emitted file in the receipt. */
export type AssetReceiptEntry = {
  /** Path relative to the client output root, as the static host serves it. */
  readonly path: string;
  readonly bytes: number;
  /** Subresource Integrity value of the served bytes. */
  readonly integrity: string;
};

/** The UI asset receipt: every file the client build emitted, with its integrity. */
export type AssetReceipt = {
  readonly schema: 'tau-ui-asset-receipt-v1';
  readonly algorithm: 'sha384';
  readonly assets: readonly AssetReceiptEntry[];
};

type AssetIntegrityOptions = {
  /** Emit the receipt. The main client build does; worker builds only register integrity in their own chunks. */
  readonly receipt: boolean;
};

const integrityOf = (source: BinaryLike): string => `sha384-${createHash('sha384').update(source).digest('base64')}`;

/**
 * The statement a chunk runs first: record each WASM file it references in the realm's asset integrity registry,
 * which `@taucad/runtime`'s WASM loader reads before every fetch (`Symbol.for('taucad.assetIntegrity')`).
 *
 * Each URL is resolved from the chunk's own location, so it is the same absolute URL the chunk computes for the asset
 * whatever base the site is served under. The statement depends only on the hashed asset names the chunk already
 * contains, so the chunk's content-hashed file name stays truthful.
 *
 * @param chunkFileName - The chunk's path in the output.
 * @param assets - The referenced WASM files and their integrity.
 * @returns One line of JavaScript.
 */
const registration = (chunkFileName: string, assets: ReadonlyArray<readonly [string, string]>): string => {
  const entries = assets.map(([fileName, integrity]) => {
    const relative = path.posix.relative(path.posix.dirname(chunkFileName), fileName);
    const specifier = relative.startsWith('.') ? relative : `./${relative}`;
    return `r.set(new URL(${JSON.stringify(specifier)},import.meta.url).href,${JSON.stringify(integrity)});`;
  });
  return `((r)=>{${entries.join('')}})(globalThis[Symbol.for("taucad.assetIntegrity")]??=new Map());`;
};

/**
 * Pin every WASM file the UI ships to its build-time bytes (charter D26, ruling X31).
 *
 * In each bundle, every ES chunk that names a WASM file gains a first line registering that file's SHA-384 integrity,
 * so the runtime fetches it with `fetch(url, { integrity })` and the browser refuses a tampered byte before
 * compilation. Once the client output is written, the main client build also writes `tau-asset-receipt.json` at its
 * root, listing every emitted file (source maps aside) with the integrity of its bytes on disk. Add the plugin to the client plugins (`receipt: true`) and to the worker plugins
 * (`receipt: false`), because each worker bundle references its own WASM.
 *
 * @param options - Whether this build writes the receipt.
 * @returns The Vite plugin.
 */
export const createAssetIntegrity = (options: AssetIntegrityOptions): Plugin => ({
  name: 'tau-asset-integrity',
  apply: 'build',
  generateBundle: {
    // After Vite has added each worker bundle's files to this bundle.
    order: 'post',
    handler(outputOptions, bundle) {
      if (this.environment.config.consumer !== 'client') {
        return;
      }
      const outputs = Object.values(bundle);
      const wasm = new Map<string, string>();
      for (const output of outputs) {
        if (output.type === 'asset' && output.fileName.endsWith('.wasm')) {
          wasm.set(output.fileName, integrityOf(output.source));
        }
      }
      if (outputOptions.format === 'es' && wasm.size > 0) {
        for (const chunk of outputs) {
          if (chunk.type !== 'chunk') {
            continue;
          }
          const referenced = [...wasm].filter(([fileName]) => chunk.code.includes(path.posix.basename(fileName)));
          if (referenced.length === 0) {
            continue;
          }
          chunk.code = `${registration(chunk.fileName, referenced)}\n${chunk.code}`;
          // The registration is one new first line: shift the chunk's generated lines down by one.
          if (chunk.map) {
            chunk.map.mappings = `;${chunk.map.mappings}`;
          }
          const mapName = `${chunk.fileName}.map`;
          const mapFile = Object.hasOwn(bundle, mapName) ? bundle[mapName] : undefined;
          if (mapFile?.type === 'asset') {
            const map = JSON.parse(String(mapFile.source)) as { mappings: string };
            map.mappings = `;${map.mappings}`;
            mapFile.source = JSON.stringify(map);
          }
        }
      }
    },
  },
  writeBundle: {
    // Last, from the bytes on disk: other plugins rewrite some files after generating the bundle (the module graph).
    order: 'post',
    async handler(outputOptions, bundle) {
      if (!options.receipt || this.environment.config.consumer !== 'client' || outputOptions.dir === undefined) {
        return;
      }
      const root = path.resolve(outputOptions.dir);
      const files = Object.keys(bundle).filter((fileName) => !fileName.endsWith('.map'));
      const hashed = await Promise.all(
        files.map(async (fileName): Promise<AssetReceiptEntry | undefined> => {
          try {
            const bytes = await readFile(path.join(root, fileName));
            return { path: fileName, bytes: bytes.byteLength, integrity: integrityOf(bytes) };
          } catch {
            // A plugin removed the file after emitting it; the receipt lists what is served.
            return undefined;
          }
        }),
      );
      const assets = hashed
        .filter((asset) => asset !== undefined)
        .toSorted((left, right) => left.path.localeCompare(right.path));
      const receipt: AssetReceipt = { schema: 'tau-ui-asset-receipt-v1', algorithm: 'sha384', assets };
      await writeFile(path.join(root, assetReceiptFileName), `${JSON.stringify(receipt, undefined, 2)}\n`);
    },
  },
});
