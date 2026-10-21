/** Behavioral source-run and archive admission checks with inert asar fixtures; no signing or external service mutations. */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createPackage } from '@electron/asar';
/* eslint-disable @typescript-eslint/naming-convention -- Tests exercise exact external GitHub wire fields and process environment keys. */
const main = async (): Promise<void> => {
  assert.notEqual(process.platform, 'win32', 'Source-run command stubs use a POSIX test host');
  const root = await mkdtemp(join(tmpdir(), 'tau-candidate-'));
  try {
    const tools = join(root, 'tools');
    await mkdir(tools);
    const gh = join(tools, 'gh');
    const git = join(tools, 'git');
    await writeFile(gh, '#!/usr/bin/env node\nconsole.log(process.env.TEST_RUN);\n');
    await writeFile(
      git,
      '#!/usr/bin/env node\nif(process.argv[2]==="rev-parse") console.log(process.env.TEST_SOURCE);\n',
    );
    await Promise.all([chmod(gh, 0o755), chmod(git, 0o755)]);
    const source = 'a'.repeat(40);
    const tag = 'desktop@0.2.0';
    const successful = {
      head_sha: source,
      path: '.github/workflows/release-build.yml',
      event: 'push',
      conclusion: 'success',
      status: 'completed',
      head_repository: { full_name: 'taucad/tau' },
      repository: { full_name: 'taucad/tau' },
    };
    const environment = {
      ...process.env,
      PATH: `${tools}:${process.env['PATH'] ?? ''}`,
      GITHUB_REF: 'refs/heads/main',
      GITHUB_REPOSITORY: 'taucad/tau',
      GITHUB_OUTPUT: join(root, 'outputs'),
      DESKTOP_RELEASE_TAG: tag,
      DESKTOP_RELEASE_RUN_ID: '123',
      TAU_DESKTOP_SOURCE_SHA: source,
      TEST_SOURCE: source,
      TEST_RUN: JSON.stringify(successful),
    };
    const run = (operation: string, changes: Record<string, string> = {}) =>
      spawnSync(
        process.execPath,
        [
          '--import',
          '@oxc-node/core/register',
          resolve('apps/desktop/scripts/desktop-installer-candidate.mts'),
          operation,
        ],
        { env: { ...environment, ...changes }, encoding: 'utf8' },
      );
    assert.equal(run('resolve').status, 0, run('resolve').stderr);
    for (const change of [
      { head_sha: 'b'.repeat(40) },
      { path: '.github/workflows/other.yml' },
      { event: 'pull_request' },
      { conclusion: 'failure' },
      { head_repository: { full_name: 'attacker/tau' } },
    ]) {
      assert.equal(run('resolve', { TEST_RUN: JSON.stringify({ ...successful, ...change }) }).status, 1);
    }
    assert.equal(run('resolve', { GITHUB_REF: 'refs/heads/untrusted' }).status, 1);
    const archives = join(root, 'archives');
    await mkdir(archives);
    const app = join(root, 'Tau-linux-x64');
    await mkdir(join(app, 'resources'), { recursive: true });
    const content = join(root, 'content');
    await mkdir(content);
    await writeFile(
      join(content, 'package.json'),
      JSON.stringify({ version: '0.2.0', tauDesktop: { sourceCommit: source, channel: 'production' } }),
    );
    await createPackage(content, join(app, 'resources/app.asar'));
    const archive = join(archives, 'Tau-linux-x64.tar.gz');
    execFileSync('tar', ['-czf', archive, '-C', root, 'Tau-linux-x64']);
    const data = await readFile(archive);
    const metadata = {
      tag,
      version: '0.2.0',
      channel: 'production',
      sourceCommit: source,
      assets: {
        'linux-x64': {
          url: 'https://downloads.tau.new/releases/desktop%400.2.0/Tau-linux-x64.tar.gz',
          sha256: createHash('sha256').update(data).digest('hex'),
          size: data.length,
        },
      },
    };
    await writeFile(join(archives, 'download.json'), JSON.stringify(metadata));
    const preflight = { DESKTOP_CANDIDATE_ARCHIVES: archives };
    const partial = run('preflight', preflight);
    assert.equal(partial.status, 1);
    assert.match(partial.stderr, /Intel Mac enabled and notarization enabled/u);
    const full = {
      ...metadata,
      assets: {
        ...metadata.assets,
        'darwin-arm64': {
          ...metadata.assets['linux-x64'],
          url: metadata.assets['linux-x64'].url.replace('Tau-linux-x64.tar.gz', 'Tau-macos-arm64.zip'),
        },
        'darwin-x64': {
          ...metadata.assets['linux-x64'],
          url: metadata.assets['linux-x64'].url.replace('Tau-linux-x64.tar.gz', 'Tau-macos-x64.zip'),
        },
        'win32-x64': {
          ...metadata.assets['linux-x64'],
          url: metadata.assets['linux-x64'].url.replace('Tau-linux-x64.tar.gz', 'Tau-win32-x64.zip'),
        },
      },
    };
    await writeFile(join(archives, 'download.json'), JSON.stringify(full));
    assert.equal(run('preflight', preflight).status, 0);
    await writeFile(join(archives, 'download.json'), JSON.stringify(metadata));

    const staging = {
      DESKTOP_CANDIDATE_ARCHIVES: archives,
      DESKTOP_CANDIDATE_TARGET: 'linux-x64',
      DESKTOP_CANDIDATE_STAGE: join(root, 'stage'),
    };
    const valid = run('stage', staging);
    assert.equal(valid.status, 0, valid.stderr);
    assert.equal(run('stage', { ...staging, TAU_DESKTOP_SOURCE_SHA: 'b'.repeat(40) }).status, 1);
    await writeFile(archive, 'tampered');
    assert.equal(run('stage', { ...staging, DESKTOP_CANDIDATE_STAGE: join(root, 'tamper-stage') }).status, 1);
    console.log('Passed 12 candidate source-run and exact archive admission scenarios.');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};
try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}

/* eslint-enable @typescript-eslint/naming-convention -- End external protocol fixtures. */
