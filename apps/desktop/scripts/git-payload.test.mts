#!/usr/bin/env node

/**
 * Purpose: Check the git payload's pins, layout and GPL source copy without compiling git.
 * Why: The layout must be the one the app resolves, and the shipped source must be the pinned source.
 * Environment: Node.js 24+.
 * Usage: node --import @oxc-node/core/register apps/desktop/scripts/git-payload.test.mts
 * Exit codes: 0 when every check passes; non-zero on regression.
 */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

// oxlint-disable-next-line no-restricted-imports -- Operational scripts are outside the app's # source alias.
import { bundledGitEnvironment } from '../src/main/utility-environment.js';
// oxlint-disable-next-line no-restricted-imports -- Operational scripts are outside the app's # source alias.
import * as payload from './git-payload.mjs';

const sha256 = /^[\da-f]{64}$/u;

/* The pins: every archive is addressed by version and pinned by a full SHA-256. */
assert.match(payload.gitSourceSha256, sha256);
assert.match(payload.gitLfsLicenseSha256, sha256);
assert.equal(payload.gitSourceUrl, `https://www.kernel.org/pub/software/scm/git/git-${payload.gitVersion}.tar.xz`);
assert.deepEqual(Object.keys(payload.gitTargets).sort(), ['darwin-arm64', 'linux-x64']);
for (const { gitLfs } of Object.values(payload.gitTargets)) {
  assert.match(gitLfs.sha256, sha256);
  assert.ok(gitLfs.url.startsWith('https://github.com/git-lfs/git-lfs/releases/download/'), gitLfs.url);
  assert.ok(gitLfs.url.endsWith(`/${gitLfs.name}`), gitLfs.url);
}
assert.ok(payload.gitMakeVariables.includes('RUNTIME_PREFIX=YesPlease'), 'the payload must be relocatable');
for (const off of ['NO_TCLTK', 'NO_GETTEXT']) {
  assert.ok(
    payload.gitMakeVariables.some((variable) => variable === `${off}=YesPlease`),
    `${off} must stay off the payload`,
  );
}
assert.ok(!payload.gitMakeVariables.some((variable) => variable.startsWith('NO_CURL')), 'HTTPS remotes need curl');
console.log('✓ git and git-lfs are pinned by version and SHA-256');

const root = await mkdtemp(join(tmpdir(), 'tau-git-payload-'));
try {
  /* The layout is the one the app resolves: a packaged app's `Resources/git`. */
  const layout = payload.gitPayloadLayout(join(root, 'git'), 'darwin-arm64');
  await mkdir(dirname(layout.git), { recursive: true });
  await writeFile(layout.git, '#!/bin/sh\n');
  assert.deepEqual(bundledGitEnvironment(root, { architecture: 'arm64', platform: 'darwin' }), {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment name
    TAU_GIT_EXECUTABLE: layout.git,
  });
  assert.equal(layout.gitLfs, join(layout.root, 'libexec', 'git-core', 'git-lfs'), 'git-lfs is in git’s exec path');
  assert.equal(layout.source, join(root, 'git', 'SOURCES', payload.gitSourceName));
  assert.ok(
    payload.gitPayloadNotice.includes(`../SOURCES/${payload.gitSourceName}`),
    'the NOTICE names where the source is',
  );
  console.log('✓ the payload lands where bundledGitEnvironment resolves it');

  /* The source copy: the pinned bytes are copied, anything else is refused. */
  const archive = join(root, 'archive.tar.xz');
  await writeFile(archive, 'git source bytes');
  const pinned = createHash('sha256').update('git source bytes').digest('hex');
  await payload.copyGitSource(archive, layout.source, pinned);
  assert.equal(await readFile(layout.source, 'utf8'), 'git source bytes');
  await assert.rejects(
    payload.copyGitSource(archive, layout.source, payload.gitSourceSha256),
    /is not the pinned git source/u,
  );
  console.log('✓ only the pinned source is copied beside the payload');
} finally {
  await rm(root, { recursive: true, force: true });
}
