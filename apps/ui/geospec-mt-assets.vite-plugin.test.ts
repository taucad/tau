import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// oxlint-disable-next-line eslint/no-restricted-imports -- Vite plugin test lives outside app aliases.
import { createGeoSpecMtAssets } from './geospec-mt-assets.vite-plugin.js';

const hash = (bytes: string): string => createHash('sha256').update(bytes).digest('hex');

describe('GeoSpec qualified MT client assets', () => {
  it('exposes no MT receipt without a staged package', () => {
    expect(createGeoSpecMtAssets(undefined).receipts).toEqual({});
  });

  it('admits the qualified five-file closure and refuses changed qualification or bytes', () => {
    const stage = mkdtempSync(path.join(tmpdir(), 'geospec-mt-ui-'));
    const directory = path.join(stage, 'dist/bindings/mt-wasm/permits-4');
    mkdirSync(directory, { recursive: true });
    const write = (name: string, value: string): void => {
      writeFileSync(path.join(directory, name), value);
    };
    try {
      writeFileSync(
        path.join(stage, 'package.json'),
        JSON.stringify({
          name: '@taucad/geospec-engine-native',
          exports: {
            './mt-assets/permits-4/*': './dist/bindings/mt-wasm/permits-4/*',
          },
        }),
      );
      const glue = 'export default async () => ({})';
      const wasm = 'synthetic wasm bytes';
      write('geospec_engine_native.mjs', glue);
      write('geospec_engine_native.wasm', wasm);
      const output = path.join(stage, 'original-product');
      const build = JSON.stringify({
        schema: 'geospec-mixed-build-receipt-mt-v1',
        variant: 'mt',
        sourceRevision: 'a'.repeat(40),
        output,
        mtSettings: { executionPermits: 4 },
        artifacts: [
          {
            path: path.join(output, 'geospec_engine_native.mjs'),
            bytes: glue.length,
            sha256: hash(glue),
          },
          {
            path: path.join(output, 'geospec_engine_native.wasm'),
            bytes: wasm.length,
            sha256: hash(wasm),
          },
        ],
      });
      write('build-receipt.json', build);
      const asset = (file: string, value: string) => ({
        file,
        bytes: value.length,
        sha256: hash(value),
      });
      const receipt = JSON.stringify({
        schema: 'geospec-mixed-mt-assets-v1',
        permits: 4,
        buildReceipt: asset('build-receipt.json', build),
        glue: asset('geospec_engine_native.mjs', glue),
        wasm: asset('geospec_engine_native.wasm', wasm),
        worker: asset('geospec_engine_native.mjs', glue),
      });
      write('geospec_engine_native.mt.json', receipt);
      const qualification = {
        schema: 'geospec-mt-qualification-v1',
        verdict: 'passed',
        permits: 4,
        assetReceiptSha256: hash(receipt),
        buildReceiptSha256: hash(build),
        sourceRevision: 'a'.repeat(40),
        checks: { nodePthreads: true, browserPthreads: true, stParity: true },
      };
      write('qualification.json', JSON.stringify(qualification));
      const { receipts, plugin } = createGeoSpecMtAssets(stage);
      expect(receipts).toEqual({
        4: '/geospec-mt/permits-4/geospec_engine_native.mt.json',
      });
      const emitted: string[] = [];
      if (typeof plugin.generateBundle !== 'function') {
        throw new TypeError('MT asset plugin has no client emission hook.');
      }
      Reflect.apply(
        plugin.generateBundle,
        {
          emitFile(file: { fileName: string }): string {
            emitted.push(file.fileName);
            return file.fileName;
          },
        },
        [{}, {}, false],
      );
      expect(emitted).toEqual([
        'geospec-mt/permits-4/geospec_engine_native.mt.json',
        'geospec-mt/permits-4/build-receipt.json',
        'geospec-mt/permits-4/geospec_engine_native.mjs',
        'geospec-mt/permits-4/geospec_engine_native.wasm',
        'geospec-mt/permits-4/qualification.json',
      ]);
      const environment = { ...process.env };
      environment['GEOSPEC_MT_STAGED_PACKAGE_ROOT'] = stage;
      const fingerprint = (): string =>
        execFileSync(process.execPath, [path.join(import.meta.dirname, 'geospec-mt-assets-cache-key.ts')], {
          encoding: 'utf8',
          env: environment,
        });
      const before = fingerprint();
      write('qualification.json', JSON.stringify({ ...qualification, verdict: 'failed' }));
      expect(fingerprint()).not.toBe(before);
      expect(() => createGeoSpecMtAssets(stage)).toThrow('qualification is invalid');
      write('qualification.json', JSON.stringify(qualification));
      write('geospec_engine_native.wasm', 'changed');
      expect(() => createGeoSpecMtAssets(stage)).toThrow('staged wasm is invalid');
    } finally {
      rmSync(stage, { recursive: true, force: true });
    }
  });
});
