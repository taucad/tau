import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it } from 'node:test';

const script = new URL('assemble-package.sh', import.meta.url).pathname;
/** @type {(bytes: Buffer) => string} */
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
/** @type {(text: string) => unknown} */
const parseJson = (text) => /** @type {unknown} */ (JSON.parse(text));
/** @type {(value: unknown) => asserts value is Record<string, unknown>} */
const assertRecord = (value) => {
  assert.ok(typeof value === 'object' && value !== null && !Array.isArray(value));
};

await it('should keep the source manifest ST-only', async () => {
  const manifest = parseJson(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assertRecord(manifest);
  assertRecord(manifest['exports']);
  assertRecord(manifest['publishConfig']);
  assertRecord(manifest['publishConfig']['exports']);
  assertRecord(manifest['publishConfig']['imports']);
  assert.equal(
    Object.keys(manifest['exports']).some((name) => name.startsWith('./mt-assets/')),
    false,
  );
  assert.equal(
    Object.keys(manifest['publishConfig']['exports']).some((name) => name.startsWith('./mt-assets/')),
    false,
  );
  assert.equal(manifest['exports']['./wasm-binary'], './bindings/emscripten/generated/geospec_engine_native.wasm');
  assert.equal(
    manifest['publishConfig']['exports']['./wasm-binary'],
    './dist/bindings/mixed-wasm/geospec_engine_native.wasm',
  );
  assert.equal(
    manifest['publishConfig']['imports']['#mixed-wasm-binding'],
    './dist/bindings/mixed-wasm/geospec_engine_native.mjs',
  );
});

await it('should stage only an explicitly qualified, hash-matched MT closure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'geospec-mt-package-'));
  try {
    const product = join(root, 'product');
    const stage = join(root, 'stage');
    const historicalOutput = '/qualified/build/product';
    await mkdir(product);
    await mkdir(stage);
    await writeFile(join(stage, 'package.json'), await readFile(new URL('../package.json', import.meta.url)));
    const glue = Buffer.from('new Worker(new URL("geospec_engine_native.mjs", import.meta.url))');
    const wasm = Buffer.from([0, 97, 115, 109]);
    /** @type {(file: string, bytes: Buffer) => {file: string, bytes: number, sha256: string}} */
    const asset = (file, bytes) => ({ file, bytes: bytes.length, sha256: hash(bytes) });
    const glueAsset = asset('geospec_engine_native.mjs', glue);
    const wasmAsset = asset('geospec_engine_native.wasm', wasm);
    const build = Buffer.from(
      JSON.stringify({
        schema: 'geospec-mixed-build-receipt-mt-v1',
        variant: 'mt',
        sourceRevision: 'a'.repeat(40),
        output: historicalOutput,
        mtSettings: { executionPermits: 2 },
        artifacts: [glueAsset, wasmAsset].map((entry) => ({ ...entry, path: join(historicalOutput, entry.file) })),
      }),
    );
    const buildAsset = asset('build-receipt.json', build);
    await Promise.all([
      writeFile(join(product, glueAsset.file), glue),
      writeFile(join(product, wasmAsset.file), wasm),
      writeFile(join(product, buildAsset.file), build),
    ]);
    const receipt = Buffer.from(
      JSON.stringify({
        schema: 'geospec-mixed-mt-assets-v1',
        permits: 2,
        buildReceipt: buildAsset,
        glue: glueAsset,
        wasm: wasmAsset,
        worker: glueAsset,
      }),
    );
    const receiptPath = join(product, 'geospec_engine_native.mt.json');
    await writeFile(receiptPath, receipt);
    const qualificationPath = join(root, 'qualification.json');
    await writeFile(
      qualificationPath,
      JSON.stringify({
        schema: 'geospec-mt-qualification-v1',
        verdict: 'passed',
        permits: 2,
        sourceRevision: 'a'.repeat(40),
        assetReceiptSha256: hash(receipt),
        buildReceiptSha256: hash(build),
        checks: { nodePthreads: true, browserPthreads: true, stParity: true },
      }),
    );
    /** @type {(environment?: Record<string, string>) => import('node:child_process').SpawnSyncReturns<string>} */
    const run = (environment) =>
      spawnSync('bash', [script, '--stage-mt-assets', stage], {
        encoding: 'utf8',
        env: {
          ...process.env,
          GEOSPEC_MT_ASSET_RECEIPT: receiptPath,
          GEOSPEC_MT_QUALIFICATION_RECEIPT: qualificationPath,
          ...environment,
        },
      });
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    const target = join(stage, 'dist/bindings/mt-wasm/permits-2');
    await Promise.all(
      [glueAsset.file, wasmAsset.file, buildAsset.file, 'geospec_engine_native.mt.json'].map(async (filename) => {
        assert.deepEqual(await readFile(join(target, filename)), await readFile(join(product, filename)));
      }),
    );
    assert.deepEqual(await readFile(join(target, 'qualification.json')), await readFile(qualificationPath));
    const stagedManifest = parseJson(await readFile(join(stage, 'package.json'), 'utf8'));
    assertRecord(stagedManifest);
    assertRecord(stagedManifest['exports']);
    assertRecord(stagedManifest['publishConfig']);
    assertRecord(stagedManifest['publishConfig']['exports']);
    assert.equal(stagedManifest['exports']['./mt-assets/permits-2/*'], './dist/bindings/mt-wasm/permits-2/*');
    assert.equal(
      stagedManifest['publishConfig']['exports']['./mt-assets/permits-2/*'],
      './dist/bindings/mt-wasm/permits-2/*',
    );
    const pack = spawnSync('npm', ['pack', '--json', '--dry-run'], { cwd: stage, encoding: 'utf8' });
    assert.equal(pack.status, 0, pack.stderr);
    const packJson = parseJson(pack.stdout);
    assert.ok(Array.isArray(packJson));
    const firstPackage = /** @type {unknown} */ (packJson[0]);
    assertRecord(firstPackage);
    const { files } = firstPackage;
    assert.ok(Array.isArray(files));
    /** @type {Set<string>} */
    const packedPaths = new Set();
    for (const file of files) {
      const entry = /** @type {unknown} */ (file);
      assertRecord(entry);
      assert.ok(typeof entry['path'] === 'string');
      packedPaths.add(entry['path']);
    }
    for (const filename of [
      glueAsset.file,
      wasmAsset.file,
      buildAsset.file,
      'geospec_engine_native.mt.json',
      'qualification.json',
    ]) {
      assert.ok(packedPaths.has(`dist/bindings/mt-wasm/permits-2/${filename}`), filename);
    }

    const qualified = await readFile(qualificationPath);
    const qualification = parseJson(qualified.toString());
    assertRecord(qualification);
    await writeFile(qualificationPath, JSON.stringify({ ...qualification, verdict: 'rejected' }));
    assert.match(run().stderr, /independent qualification receipt/);
    await writeFile(qualificationPath, qualified);
    await writeFile(join(product, wasmAsset.file), 'tampered');
    assert.match(run().stderr, /wasm bytes/);
    assert.notEqual(run({ GEOSPEC_MT_QUALIFICATION_RECEIPT: '' }).status, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

await it('should leave ST-only staging unchanged without MT receipts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'geospec-st-package-'));
  try {
    const sourceManifest = await readFile(new URL('../package.json', import.meta.url));
    await writeFile(join(root, 'package.json'), sourceManifest);
    const result = spawnSync('bash', [script, '--stage-mt-assets', root], {
      encoding: 'utf8',
      env: { ...process.env, GEOSPEC_MT_ASSET_RECEIPT: '', GEOSPEC_MT_QUALIFICATION_RECEIPT: '' },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(await readFile(join(root, 'package.json')), sourceManifest);
    const { readdir } = await import('node:fs/promises');
    assert.deepEqual(await readdir(root), ['package.json']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
