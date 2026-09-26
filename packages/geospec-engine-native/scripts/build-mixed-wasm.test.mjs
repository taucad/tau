import assert from 'node:assert/strict';
import { test } from 'node:test';
// oxlint-disable-next-line no-restricted-imports -- Standalone check consumes its co-located build script.
import { pthreadPrefixIdentity, rustStdArchivePaths } from './build-mixed-wasm.mts';

const library = '/toolchain/lib/rustlib/src/rust/library';
const target = '/cache/permits-2/target/wasm32-unknown-emscripten/release/build';
/** @type {(name: string, manifest: string, hash: string) => string} */
const artifact = (name, manifest, hash) =>
  JSON.stringify({
    reason: 'compiler-artifact',
    manifest_path: manifest,
    target: { name, kind: ['lib'] },
    filenames: [
      `${target}/${name}/${hash}/out/lib${name}-${hash}.rlib`,
      `${target}/${name}/${hash}/out/lib${name}-${hash}.rmeta`,
    ],
    fresh: true,
  });
/** @type {(name: string, hash: string) => string} */
const std = (name, hash) => artifact(name, `${library}/${name}/Cargo.toml`, hash);

await test('should select the std closure Cargo reports, independent of target layout', () => {
  const messages = [
    '   Compiling std v0.0.0',
    std('std', '7783c86cc8680b49'),
    std('core', 'd4faec759b730bb8'),
    artifact('core', '/registry/core-shim/Cargo.toml', 'ffffffffffffffff'),
    std('alloc', '446a5a7c944a989c'),
    std('panic_abort', '6a65e98f18a1c9c8'),
    JSON.stringify({ reason: 'build-finished', success: true }),
  ].join('\n');
  assert.deepEqual(rustStdArchivePaths(messages, library), [
    `${target}/alloc/446a5a7c944a989c/out/liballoc-446a5a7c944a989c.rlib`,
    `${target}/core/d4faec759b730bb8/out/libcore-d4faec759b730bb8.rlib`,
    `${target}/panic_abort/6a65e98f18a1c9c8/out/libpanic_abort-6a65e98f18a1c9c8.rlib`,
    `${target}/std/7783c86cc8680b49/out/libstd-7783c86cc8680b49.rlib`,
  ]);
});

await test('should refuse a missing or duplicated std unit', () => {
  const complete = ['std', 'core', 'alloc', 'panic_abort'].map((name) => std(name, '0123456789abcdef'));
  assert.throws(() => rustStdArchivePaths(complete.slice(0, 3).join('\n'), library), /exactly one/);
  assert.throws(
    () => rustStdArchivePaths([...complete, std('std', 'fedcba9876543210')].join('\n'), library),
    /exactly one/,
  );
});

const root = '/src/packages/geospec-engine-native';
/** @type {(changes?: Record<string, string>, extra?: { environment?: Record<string, string> }) => Parameters<typeof pthreadPrefixIdentity>[0]} */
const manifest = (changes = {}, extra = {}) => ({
  sourceRoot: '/src',
  rustPrefix: '/cache/rust',
  preparationCache: '/cache/prep',
  tools: { node: '/bin/node', rustup: '/home/.cargo/bin/rustup' },
  environment: { PATH: '/bin' },
  inputs: [
    `${root}/native/occt/build-occt.sh`,
    `${root}/native/occt/stepcaf-early-assembly.patch`,
    `${root}/native/occt/step-assembly-sharings.patch`,
    `${root}/native/occt/brepgprop-gauss-direct-arith.patch`,
    `${root}/native/occt/bridge/geospec_occt_bridge.cpp`,
    `${root}/native/occt/rust/src/lib.rs`,
    `${root}/native/runtime/src/lib.rs`,
    `${root}/rust/src/subject.rs`,
    `${root}/bindings/emscripten/src/lib.rs`,
    `${root}/scripts/build-mixed-wasm.mts`,
    `${root}/scripts/selected-delivery.json`,
    '/cache/prep/sources/occt/CMakeLists.txt',
    '/cache/prep/cargo/registry/src/index/serde/lib.rs',
    '/cache/rust/bin/rustc',
    '/home/.cargo/bin/rustup',
    '/sdk/emscripten/emcc.py',
  ].map((path) => ({ path, sha256: changes[path] ?? '0' })),
  ...extra,
});
const command = ['/src/packages/geospec-engine-native/native/occt/build-occt.sh', '-DCMAKE_C_FLAGS=-O2 -pthread'];

await test('should keep the pthread prefix identity across Rust, bridge and binding edits', () => {
  const identity = pthreadPrefixIdentity(manifest(), command);
  for (const path of [
    `${root}/native/occt/bridge/geospec_occt_bridge.cpp`,
    `${root}/native/occt/rust/src/lib.rs`,
    `${root}/native/runtime/src/lib.rs`,
    `${root}/rust/src/subject.rs`,
    `${root}/bindings/emscripten/src/lib.rs`,
    `${root}/scripts/build-mixed-wasm.mts`,
    '/cache/prep/cargo/registry/src/index/serde/lib.rs',
    '/cache/rust/bin/rustc',
    '/home/.cargo/bin/rustup',
  ]) {
    assert.equal(pthreadPrefixIdentity(manifest({ [path]: '1' }), command), identity, path);
  }
});

await test('should change the pthread prefix identity with any prefix input', () => {
  const identity = pthreadPrefixIdentity(manifest(), command);
  for (const path of [
    `${root}/native/occt/build-occt.sh`,
    `${root}/native/occt/stepcaf-early-assembly.patch`,
    `${root}/native/occt/step-assembly-sharings.patch`,
    `${root}/native/occt/brepgprop-gauss-direct-arith.patch`,
    `${root}/scripts/selected-delivery.json`,
    '/cache/prep/sources/occt/CMakeLists.txt',
    '/sdk/emscripten/emcc.py',
  ]) {
    assert.notEqual(pthreadPrefixIdentity(manifest({ [path]: '1' }), command), identity, path);
  }
  assert.notEqual(pthreadPrefixIdentity(manifest({}, { environment: { PATH: '/usr/bin' } }), command), identity);
  assert.notEqual(pthreadPrefixIdentity(manifest(), [...command, '-DUSE_TBB=ON']), identity);
});
