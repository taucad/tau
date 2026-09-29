/**
 * Precompress the measured large KCL WASM for the local Node server.
 *
 * Runs after the client build, inside the existing build lock. Other assets
 * retain the server's streaming compression fallback.
 *
 * Usage: node apps/ui/scripts/compress-static-assets.mts
 */
import { createReadStream, createWriteStream } from 'node:fs';
import { readdir, rename, rm, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { constants, createBrotliCompress, createGzip } from 'node:zlib';
import process from 'node:process';

/* oxlint-disable no-await-in-loop -- Serial compression bounds disk I/O and CPU during the build. */
const minimumBytes = 8 * 1024 * 1024;
const measuredAsset = /^kcl_wasm_lib_bg-[A-Za-z0-9_-]{8,}\.wasm$/u;

/** Compress only the large hashed KCL asset whose repeated requests were measured. */
export async function compressStaticAssets(directory: string): Promise<void> {
  for (const name of await readdir(directory)) {
    if (!measuredAsset.test(name)) {
      continue;
    }
    const source = join(directory, name);
    const metadata = await stat(source);
    if (!metadata.isFile() || metadata.size < minimumBytes) {
      continue;
    }
    for (const encoding of ['br', 'gz'] as const) {
      const destination = `${source}.${encoding}`;
      const temporary = `${destination}.tmp-${process.pid}`;
      const compressor =
        encoding === 'br'
          ? createBrotliCompress({
              params: {
                [constants.BROTLI_PARAM_QUALITY]: 5,
                [constants.BROTLI_PARAM_SIZE_HINT]: metadata.size,
              },
            })
          : createGzip();
      try {
        await pipeline(createReadStream(source), compressor, createWriteStream(temporary));
        await rename(temporary, destination);
      } finally {
        await rm(temporary, { force: true });
      }
    }
  }
}
/* oxlint-enable no-await-in-loop -- The sequential asset loop ends here. */

const main = async (): Promise<void> => {
  await compressStaticAssets(resolve(import.meta.dirname, '../build/client/assets'));
};

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  try {
    await main();
  } catch (error) {
    console.error('compress-static-assets failed:', error);
    process.exit(1);
  }
}
