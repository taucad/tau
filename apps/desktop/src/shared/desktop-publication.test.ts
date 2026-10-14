/* eslint-disable @typescript-eslint/naming-convention -- Child process environment keys use their external uppercase contract. */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { availableUpdate } from '#main/updater.js';

const workspace = resolve(import.meta.dirname, '../../../..');
const roots: string[] = [];
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), 'tau-publication-test-'));
  roots.push(root);
  const assets = join(root, 'assets');
  mkdirSync(assets);
  for (const name of ['Tau-macos-arm64.zip', 'Tau-macos-x64.zip', 'Tau-linux-x64.tar.gz', 'Tau-win32-x64.zip']) {
    writeFileSync(join(assets, name), `fixture bytes: ${name}`);
  }
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: workspace, encoding: 'utf8' }).trim();
  const run = (operation: string, tag: string, extra: NodeJS.ProcessEnv = {}) =>
    spawnSync(
      process.execPath,
      ['--import', '@oxc-node/core/register', 'apps/desktop/scripts/publish-desktop.mts', operation],
      {
        cwd: workspace,
        encoding: 'utf8',
        env: {
          ...process.env,
          ...extra,
          DESKTOP_ASSETS_DIR: assets,
          DESKTOP_RELEASE_TAG: tag,
          TAU_DESKTOP_SOURCE_SHA: sourceCommit,
        },
      },
    );
  return { root, assets, sourceCommit, run };
};
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('desktop publication', () => {
  it('should produce self-consistent channel feeds and archive checksums', () => {
    const { assets, run } = fixture();
    const result = run('prepare', 'desktop-staging@0.1.0-staging.102');
    expect(result.status, result.stderr).toBe(0);
    const feed: unknown = JSON.parse(readFileSync(join(assets, 'desktop-update-darwin-arm64.json'), 'utf8'));
    expect(availableUpdate(feed, '1.1.1', { channel: 'staging', platform: 'darwin', arch: 'arm64' })?.version).toBe(
      '1.1.2',
    );

    const intelFeed: unknown = JSON.parse(readFileSync(join(assets, 'desktop-update-darwin-x64.json'), 'utf8'));
    expect(availableUpdate(intelFeed, '1.1.1', { channel: 'staging', platform: 'darwin', arch: 'x64' })?.version).toBe(
      '1.1.2',
    );
    expect(() =>
      availableUpdate(intelFeed, '1.1.1', { channel: 'staging', platform: 'darwin', arch: 'arm64' }),
    ).toThrow(new TypeError('Update feed channel, version, tag or archive disagree'));
    const manifest = z
      .object({ assets: z.record(z.string(), z.object({ sha256: z.string(), size: z.number() })) })
      .parse(JSON.parse(readFileSync(join(assets, 'download.json'), 'utf8')));
    const bytes = readFileSync(join(assets, 'Tau-macos-arm64.zip'));
    expect(manifest.assets['darwin-arm64']).toEqual({
      sha256: createHash('sha256').update(bytes).digest('hex'),
      size: bytes.length,
    });
  });

  it('should reject promotion without acceptance from both Mac architectures', () => {
    const { assets, sourceCommit, run } = fixture();
    const tag = 'desktop@1.0.3';
    expect(run('prepare', tag).status).toBe(0);
    writeFileSync(
      join(assets, 'ota-receipt-darwin-arm64.json'),
      JSON.stringify({ status: 'passed', target: 'darwin-arm64', tag, version: '1.0.3', sourceCommit }),
    );
    const result = run('promote', tag, { DESKTOP_R2_BUCKET: 'unused', DESKTOP_R2_ENDPOINT: 'https://unused.invalid' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('ota-receipt-darwin-x64.json');
    writeFileSync(
      join(assets, 'ota-receipt-darwin-x64.json'),
      JSON.stringify({ status: 'passed', target: 'darwin-arm64', tag, version: '1.0.3', sourceCommit }),
    );
    const wrongArchitecture = run('promote', tag, {
      DESKTOP_R2_BUCKET: 'unused',
      DESKTOP_R2_ENDPOINT: 'https://unused.invalid',
    });
    expect(wrongArchitecture.status).toBe(1);
    expect(wrongArchitecture.stderr).toContain('darwin-x64');
  });

  it('should prevent an older promotion after a newer partial feed write', { timeout: 30_000 }, () => {
    const { root, assets, sourceCommit, run } = fixture();
    const bin = join(root, 'bin');
    const store = join(root, 'store');
    mkdirSync(bin);
    mkdirSync(store);
    // Exercise the real publisher with a file-backed S3 boundary. Fail after its first feed write.
    writeFileSync(
      join(bin, 'aws'),
      `#!/usr/bin/env node
const fs = require('node:fs'); const path = require('node:path');
const args = process.argv.slice(2); const op = args[3];
const value = (key) => args[args.indexOf(key) + 1];
const key = value('--key'); const target = path.join(process.env.TEST_S3_ROOT, key);
if (op === 'get-object') {
  if (!fs.existsSync(target)) { console.error('(NoSuchKey)'); process.exit(1); }
  fs.copyFileSync(target, args.at(-1));
} else if (op === 'put-object') {
  if (key === 'latest/desktop-update-linux-x64.json') { console.error('injected outage'); process.exit(1); }
  fs.mkdirSync(path.dirname(target), {recursive:true}); fs.copyFileSync(value('--body'), target);
} else if (op !== 'copy-object') { throw Error('unexpected S3 operation: ' + op); }
`,
      { mode: 0o755 },
    );
    const environment = {
      ...process.env,
      PATH: `${bin}:${process.env['PATH'] ?? ''}`,
      TEST_S3_ROOT: store,
      DESKTOP_R2_BUCKET: 'test-bucket',
      DESKTOP_R2_ENDPOINT: 'https://unused.invalid',
    };
    const prepare = (version: string) => {
      const tag = `desktop@${version}`;
      const result = run('prepare', tag);
      expect(result.status, result.stderr).toBe(0);
      for (const target of ['darwin-arm64', 'darwin-x64']) {
        writeFileSync(
          join(assets, `ota-receipt-${target}.json`),
          JSON.stringify({ status: 'passed', target, tag, version, sourceCommit }),
        );
      }
      return tag;
    };
    const newest = run('promote', prepare('1.0.3'), environment);
    expect(newest.status).toBe(1);
    const guard = z
      .object({ version: z.string() })
      .parse(JSON.parse(readFileSync(join(store, 'latest/promotion.json'), 'utf8')));
    expect(guard.version).toBe('1.0.3');
    const previousFeed = readFileSync(join(store, 'latest/desktop-update-darwin-arm64.json'), 'utf8');
    const older = run('promote', prepare('1.0.2'), environment);
    expect(older.status).toBe(1);
    expect(older.stderr).toContain('Refusing stale or conflicting channel promotion');
    expect(readFileSync(join(store, 'latest/desktop-update-darwin-arm64.json'), 'utf8')).toBe(previousFeed);
  });
});

/* eslint-enable @typescript-eslint/naming-convention -- End child process environment contract. */
