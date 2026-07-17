import { readFile } from 'node:fs/promises';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const wasm = await readFile(new URL('../src/wasm/render_wasm_bg.wasm', import.meta.url));
const font = await readFile(new URL('../rust/render-core/assets/geist/Geist-Regular.ttf', import.meta.url));
const sizes = {
  raw: wasm.byteLength,
  gzip9: gzipSync(wasm, { level: 9 }).byteLength,
  brotli11: brotliCompressSync(wasm, {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
  }).byteLength,
};
const ceilings = { raw: 1_144_467, brotli11: 476_443 };

for (const marker of ['fontdue', 'Geist Regular']) {
  if (wasm.includes(Buffer.from(marker))) {
    throw new Error(`render WASM unexpectedly embeds runtime font marker ${JSON.stringify(marker)}`);
  }
}
// A linked full TTF is emitted as a contiguous data segment. Pin a long,
// interior source slice so the ratchet detects that accidental inclusion even
// if compiler metadata strips the font's human-readable name table.
if (wasm.includes(font.subarray(4096, 4224))) {
  throw new Error('render WASM unexpectedly embeds the full Geist TTF');
}

console.log(JSON.stringify({ sizes, ceilings }, null, 2));
for (const [kind, ceiling] of Object.entries(ceilings)) {
  if (sizes[kind] > ceiling) {
    throw new Error(`render WASM ${kind} size ${sizes[kind]} exceeds ${ceiling}`);
  }
}
