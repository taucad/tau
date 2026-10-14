import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { test } from 'node:test';
// oxlint-disable-next-line no-restricted-imports -- Standalone Node test consumes its co-located runtime selector.
import { nativeNode, napiCommand } from './native-node.mjs';

void test('native Node selection defaults to the orchestrator without changing PATH', () => {
  assert.equal(nativeNode({}), process.execPath);
});

void test('explicit executable runs NAPI directly while tooling PATH stays unchanged', (context) => {
  const root = mkdtempSync(join(tmpdir(), 'native-node-selector-'));
  context.after(() => {
    rmSync(root, { recursive: true, force: true });
  });
  const executable = join(root, 'node24.10');
  writeFileSync(executable, 'inert selected tool');
  chmodSync(executable, 0o755);
  const manifest = join(root, 'package.json');
  writeFileSync(manifest, JSON.stringify({ bin: { napi: './dist/cli.js' } }));
  const previousEnvironment = process.env;
  context.after(() => {
    process.env = previousEnvironment;
  });
  process.env = { ...previousEnvironment, GEOSPEC_NATIVE_NODE: executable, PATH: '/tooling24.20' };
  assert.deepEqual(napiCommand(['build', '--locked'], manifest), {
    executable,
    args: [join(root, 'dist/cli.js'), 'build', '--locked'],
  });
  assert.equal(process.env['PATH'], '/tooling24.20');
  assert.throws(() => nativeNode({ GEOSPEC_NATIVE_NODE: 'relative' }));
  assert.throws(() => nativeNode({ GEOSPEC_NATIVE_NODE: root }));
  chmodSync(executable, 0o644);
  assert.throws(() => nativeNode({ GEOSPEC_NATIVE_NODE: executable }));
});
