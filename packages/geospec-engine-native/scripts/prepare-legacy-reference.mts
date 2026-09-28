#!/usr/bin/env node
/**
 * Verify and stage the immutable installed legacy comparator.
 * Inputs are retained regression fixtures; no product code is imported or built.
 * Environment: none. The retained install recipe uses Node 26.7.0 and pnpm 11.7.0.
 * Usage: node packages/geospec-engine-native/scripts/prepare-legacy-reference.mts
 *   verify-fixture | stage | verify-installed <staged-root>
 * Exit codes: 0 success; 1 invalid arguments, bytes or filesystem state.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import process from 'node:process';

type FileIdentity = { path: string; bytes: number; sha256: string };
type Manifest = {
  schema: string;
  files: FileIdentity[];
  installed: FileIdentity[];
};

const repoRoot = resolve(import.meta.dirname, '../../..');
const fixtureRoot = resolve(import.meta.dirname, '../bench/fixtures/legacy-installed-v1');
const outputRoot = resolve(repoRoot, 'out/artifacts/geospec-native-engine/legacy-reference');

const verifyFile = (root: string, file: FileIdentity): void => {
  const bytes = readFileSync(resolve(root, file.path));
  assert.equal(bytes.length, file.bytes, `${file.path}: byte count`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, `${file.path}: SHA-256`);
};

const listFiles = (root: string, prefix = ''): string[] =>
  readdirSync(join(root, prefix), { withFileTypes: true }).flatMap((entry) => {
    const name = join(prefix, entry.name);
    if (entry.isDirectory()) {
      return listFiles(root, name);
    }
    assert.ok(entry.isFile(), `${name}: expected a regular file`);
    return [name];
  });

const verifyFixture = (): Manifest => {
  const manifest = JSON.parse(readFileSync(join(fixtureRoot, 'manifest.json'), 'utf8')) as Manifest;
  assert.equal(manifest.schema, 'geospec-legacy-installed-fixture-v1');
  assert.deepEqual(
    listFiles(fixtureRoot).sort(),
    ['manifest.json', ...manifest.files.map((file) => file.path)].sort(),
    'Fixture file set',
  );
  const archives = manifest.files.filter((file) => file.path.startsWith('tarballs/'));
  assert.equal(archives.length, 19, 'Retained archive count');
  assert.equal(
    archives.reduce((sum, file) => sum + file.bytes, 0),
    14_001_732,
    'Retained archive bytes',
  );
  for (const file of manifest.files) {
    verifyFile(fixtureRoot, file);
  }
  return manifest;
};

const verifyInstalled = (stagedRoot: string, manifest: Manifest): void => {
  for (const file of manifest.files.filter(
    (file) => file.path.startsWith('consumer/') || file.path.startsWith('tarballs/'),
  )) {
    verifyFile(stagedRoot, file);
  }
  const consumerRoot = join(stagedRoot, 'consumer');
  assert.equal(manifest.installed.length, 182, 'Installed identity count');
  for (const file of manifest.installed) {
    verifyFile(consumerRoot, file);
  }
  const distributionRoots = ['node_modules/@taucad/geospec-engine/dist', 'node_modules/geospec/dist'];
  const expected = manifest.installed.filter((file) =>
    distributionRoots.some((root) => file.path.startsWith(`${root}/`)),
  );
  assert.equal(expected.length, 179, 'Captured dist count');
  assert.deepEqual(
    distributionRoots.flatMap((root) => listFiles(join(consumerRoot, root)).map((file) => join(root, file))).sort(),
    expected.map((file) => file.path).sort(),
    'Installed engine/SDK dist file set',
  );
};

const main = (): void => {
  const command = process.argv.at(2) ?? 'verify-fixture';
  const stagedRoot = process.argv.at(3);
  assert.ok(
    process.argv.length <= 4 && ['verify-fixture', 'stage', 'verify-installed'].includes(command),
    'Invalid arguments',
  );
  assert.equal(stagedRoot !== undefined, command === 'verify-installed', 'Only verify-installed takes a staged root');
  const manifest = verifyFixture();
  if (command === 'verify-fixture') {
    console.log(JSON.stringify({ command, archives: 19, archiveBytes: 14_001_732, files: manifest.files.length }));
    return;
  }
  if (command === 'verify-installed') {
    assert.ok(stagedRoot !== undefined);
    verifyInstalled(resolve(stagedRoot), manifest);
    console.log(JSON.stringify({ command, stagedRoot: resolve(stagedRoot), distFiles: 179, registryWasmFiles: 3 }));
    return;
  }
  mkdirSync(outputRoot, { recursive: true });
  const destination = mkdtempSync(join(outputRoot, 'attempt-'));
  for (const file of manifest.files.filter((file) => file.path.startsWith('consumer/'))) {
    const target = join(destination, file.path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(fixtureRoot, file.path), target);
    verifyFile(destination, file);
  }
  symlinkSync(relative(destination, join(fixtureRoot, 'tarballs')), join(destination, 'tarballs'), 'dir');
  console.log(JSON.stringify({ command, stagedRoot: destination, consumerRoot: join(destination, 'consumer') }));
};

try {
  main();
} catch (error) {
  console.error('Legacy reference preparation failed:', error);
  process.exit(1);
}
