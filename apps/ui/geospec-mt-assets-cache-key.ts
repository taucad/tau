import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const stage = process.env['GEOSPEC_MT_STAGED_PACKAGE_ROOT'];
if (stage) {
  const hash = createHash('sha256');
  const files = ['package.json'];
  const root = 'dist/bindings/mt-wasm';
  for (const directory of readdirSync(path.join(stage, root)).sort()) {
    for (const name of [
      'geospec_engine_native.mt.json',
      'build-receipt.json',
      'geospec_engine_native.mjs',
      'geospec_engine_native.wasm',
      'qualification.json',
    ]) {
      files.push(path.join(root, directory, name));
    }
  }
  for (const file of files) {
    hash.update(file);
    hash.update(readFileSync(path.join(stage, file)));
  }
  process.stdout.write(`${hash.digest('hex')}\n`);
} else {
  process.stdout.write('none\n');
}
