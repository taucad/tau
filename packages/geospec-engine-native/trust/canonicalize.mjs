/* oxlint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call -- The frozen installed module is loaded from a runtime-bound path outside this project's type graph. */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [productRoot, inputPath, mode] = process.argv.slice(2);
if (!productRoot || !inputPath) {
  throw new Error('Usage: node canonicalize.mjs <installed-product-root> <json-path> [--batch]');
}

const modulePath = join(productRoot, 'node_modules/@taucad/geospec-engine-native/dist/node.mjs');
const { canonicalize } = await import(pathToFileURL(modulePath).href);
if (mode === '--batch') {
  const input = readFileSync(inputPath);
  let offset = 0;
  while (offset < input.byteLength) {
    if (offset + 4 > input.byteLength) {
      throw new Error('Incomplete canonicalization batch header');
    }
    const byteLength = input.readUInt32BE(offset);
    offset += 4;
    if (offset + byteLength > input.byteLength) {
      throw new Error('Incomplete canonicalization batch value');
    }
    const canonical = Buffer.from(canonicalize(input.subarray(offset, offset + byteLength)));
    offset += byteLength;
    const header = Buffer.alloc(4);
    header.writeUInt32BE(canonical.byteLength);
    writeFileSync(1, header);
    writeFileSync(1, canonical);
  }
} else {
  if (mode) {
    throw new Error(`Unknown canonicalizer mode: ${mode}`);
  }
  writeFileSync(1, canonicalize(readFileSync(inputPath)));
}
