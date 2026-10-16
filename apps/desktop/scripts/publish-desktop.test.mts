#!/usr/bin/env node

/**
 * Purpose: Check that a staging desktop candidate without the Intel archive prepares, mirrors and promotes Apple
 * silicon only, and that a production release still needs every archive.
 * Why: Staging packages Intel nightly only; promoting an arm64-only candidate must leave the Intel feed and archive
 * on the last full candidate instead of failing or pointing Intel Macs at a missing archive.
 * Environment: Node.js 24+, git; runs publish-desktop.mts against a file-backed `aws` stub, never a bucket.
 * Usage: node --import @oxc-node/core/register apps/desktop/scripts/publish-desktop.test.mts
 * Exit codes: 0 when every check passes; non-zero on regression.
 */

/* eslint-disable @typescript-eslint/naming-convention -- Child process environment keys use their external uppercase contract. */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const workspace = resolve(import.meta.dirname, '../../..');
const root = mkdtempSync(join(tmpdir(), 'tau-publish-desktop-test-'));
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: workspace, encoding: 'utf8' }).trim();

const assets = (name: string, archives: string[]): string => {
  const directory = join(root, name);
  mkdirSync(directory);
  for (const archive of archives) {
    writeFileSync(join(directory, archive), `fixture bytes: ${archive}`);
  }
  return directory;
};
const run = (
  operation: string,
  tag: string,
  { directory, extra = {} }: { directory: string; extra?: NodeJS.ProcessEnv },
) =>
  spawnSync(
    process.execPath,
    ['--import', '@oxc-node/core/register', 'apps/desktop/scripts/publish-desktop.mts', operation],
    {
      cwd: workspace,
      encoding: 'utf8',
      env: {
        ...process.env,
        ...extra,
        DESKTOP_ASSETS_DIR: directory,
        DESKTOP_RELEASE_TAG: tag,
        TAU_DESKTOP_SOURCE_SHA: sourceCommit,
      },
    },
  );

try {
  const withoutIntel = ['Tau-macos-arm64.zip', 'Tau-linux-x64.tar.gz', 'Tau-win32-x64.zip'];

  /* Production: every archive is required. */
  const production = run('prepare', 'desktop@1.0.3', { directory: assets('production', withoutIntel) });
  assert.notEqual(production.status, 0);
  assert.match(production.stderr, /Tau-macos-x64\.zip/u);

  /* Staging without Intel: the manifest, sums and feeds name Apple silicon, Linux and Windows only. */
  const tag = 'desktop-staging@0.1.0-staging.102';
  const staging = assets('staging', withoutIntel);
  const prepared = run('prepare', tag, { directory: staging });
  assert.equal(prepared.status, 0, prepared.stderr);
  const manifest = JSON.parse(readFileSync(join(staging, 'download.json'), 'utf8')) as {
    assets: Record<string, unknown>;
    version: string;
  };
  assert.deepEqual(Object.keys(manifest.assets), ['darwin-arm64', 'linux-x64', 'win32-x64']);
  assert.equal(existsSync(join(staging, 'desktop-update-darwin-x64.json')), false);
  assert.doesNotMatch(readFileSync(join(staging, 'SHA256SUMS.txt'), 'utf8'), /Tau-macos-x64/u);

  /* Staging promotion needs the arm64 receipt and touches no Intel key. The stub fails the final
   * download.json write, before the public read-back, so the run never reaches the network. */
  const bin = join(root, 'bin');
  const store = join(root, 'store');
  const log = join(root, 's3.log');
  mkdirSync(bin);
  mkdirSync(store);
  writeFileSync(
    join(bin, 'aws'),
    `#!/usr/bin/env node
const fs = require('node:fs'); const path = require('node:path');
const args = process.argv.slice(2); const op = args[3];
const value = (key) => args[args.indexOf(key) + 1];
const key = value('--key'); const target = path.join(process.env.TEST_S3_ROOT, key);
fs.appendFileSync(process.env.TEST_S3_LOG, op + ' ' + key + '\\n');
if (op === 'get-object') {
  if (!fs.existsSync(target)) { console.error('(NoSuchKey)'); process.exit(1); }
  fs.copyFileSync(target, args.at(-1));
} else if (op === 'put-object') {
  if (key === 'latest/download.json') { console.error('injected stop'); process.exit(1); }
  fs.mkdirSync(path.dirname(target), {recursive:true}); fs.copyFileSync(value('--body'), target);
} else if (op !== 'copy-object') { throw Error('unexpected S3 operation: ' + op); }
`,
    { mode: 0o755 },
  );
  const environment = {
    PATH: `${bin}:${process.env['PATH'] ?? ''}`,
    TEST_S3_ROOT: store,
    TEST_S3_LOG: log,
    DESKTOP_R2_BUCKET: 'test-bucket',
    DESKTOP_R2_ENDPOINT: 'https://unused.invalid',
  };
  const missingReceipt = run('promote', tag, { directory: staging, extra: environment });
  assert.notEqual(missingReceipt.status, 0);
  assert.match(missingReceipt.stderr, /ota-receipt-darwin-arm64\.json/u);

  writeFileSync(
    join(staging, 'ota-receipt-darwin-arm64.json'),
    JSON.stringify({ status: 'passed', target: 'darwin-arm64', tag, version: manifest.version, sourceCommit }),
  );
  const promoted = run('promote', tag, { directory: staging, extra: environment });
  assert.notEqual(promoted.status, 0);
  assert.match(promoted.stderr, /injected stop/u);
  const operations = readFileSync(log, 'utf8');
  assert.match(operations, /^copy-object latest\/Tau-macos-arm64\.zip$/mu);
  assert.match(operations, /^put-object latest\/desktop-update-darwin-arm64\.json$/mu);
  assert.doesNotMatch(operations, /darwin-x64|Tau-macos-x64/u);
  console.log('publish-desktop: staging candidates without Intel prepare and promote Apple silicon only');
} finally {
  rmSync(root, { recursive: true, force: true });
}
/* eslint-enable @typescript-eslint/naming-convention -- End child process environment contract. */
