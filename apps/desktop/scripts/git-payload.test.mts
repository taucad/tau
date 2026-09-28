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
for (const expected of ['NO_DARWIN_PORTS=YesPlease', 'NO_FINK=YesPlease', 'CURL_CONFIG=/usr/bin/curl-config']) {
  assert.ok(
    payload.gitMakeVariables.some((variable) => variable === expected),
    `${expected} keeps package managers out of the payload`,
  );
}
console.log('✓ git and git-lfs are pinned by version and SHA-256');

/* The link check: only the OS's own libraries survive `otool -L`. */
assert.deepEqual(
  payload.foreignLibraries(
    [
      '/payload/bin/git:',
      '\t/usr/lib/libz.1.dylib (compatibility version 1.0.0, current version 1.2.12)',
      '\t/System/Library/Frameworks/Security.framework/Versions/A/Security (compatibility version 1.0.0, current version 61439.0.0)',
      '\t/opt/homebrew/opt/libiconv/lib/libiconv.2.dylib (compatibility version 9.0.0, current version 9.1.0)',
      '/payload/libexec/git-core/git-remote-http:',
      '\t/usr/lib/libcurl.4.dylib (compatibility version 7.0.0, current version 9.0.0)',
      '\t/opt/homebrew/opt/libiconv/lib/libiconv.2.dylib (compatibility version 9.0.0, current version 9.1.0)',
      '\t@rpath/libpcre2-8.0.dylib (compatibility version 14.0.0, current version 14.0.0)',
      '',
    ].join('\n'),
  ),
  ['/opt/homebrew/opt/libiconv/lib/libiconv.2.dylib', '@rpath/libpcre2-8.0.dylib'],
);
assert.deepEqual(
  payload.foreignLibraries('/payload/bin/git:\n\t/usr/lib/libSystem.B.dylib (compatibility version 1.0.0)\n'),
  [],
);
console.log('✓ a payload linking outside /usr/lib and /System is named');

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

  /* The up-to-date check reads back exactly what the build wrote, from disk. */
  const built = { target: 'darwin-arm64', gitSha256: 'a'.repeat(64), gitLfsSha256: 'b'.repeat(64) };
  const manifestPath = join(root, 'tau-runtime-manifest.json');
  const manifest = payload.gitPayloadManifest({
    ...built,
    probed: { git: 'git version 2.55.0', gitLfs: 'git-lfs/3.8.0' },
  });
  await writeFile(manifestPath, `${JSON.stringify(manifest, undefined, 2)}\n`);
  const written: unknown = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.ok(payload.gitPayloadManifestIsCurrent(written, built), 'a written manifest reads as current');
  assert.ok(
    !payload.gitPayloadManifestIsCurrent(written, { ...built, gitSha256: 'c'.repeat(64) }),
    'a changed binary is not',
  );
  assert.ok(
    !payload.gitPayloadManifestIsCurrent({ ...payload.gitPayloadManifest(built), makeVariables: [] }, built),
    'changed make variables are not',
  );
  console.log('✓ a written manifest reads as current, and a changed payload does not');
} finally {
  await rm(root, { recursive: true, force: true });
}
