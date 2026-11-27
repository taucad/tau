#!/usr/bin/env node

/**
 * Purpose: Check a prepared or packaged Windows git payload and count the PE files a signed build signs in it.
 * Why: Windows desktop readiness R3: the MinGit payload must be whole, must leave out what prepare-git omits, and
 * every `.exe`/`.dll`/`.node` in it is one more signature per signed build against the monthly signing allowance.
 * Environment: Node.js 24+; any host. Appends the count to `GITHUB_STEP_SUMMARY` when that is set.
 * Usage: node --import @oxc-node/core/register apps/desktop/scripts/check-windows-git-payload.mts [<resources/git dir>]
 *   (default apps/desktop/resources/git; a packaged app's is `<app>/resources/git`)
 * Exit codes: 0 for a whole payload; non-zero for a missing part, an omitted path that is present, or a bad PE file.
 */

import { appendFile, readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

// oxlint-disable-next-line no-restricted-imports -- Operational scripts are outside the app's # source alias.
import * as payload from './git-payload.mjs';

const target = 'win32-x64';
const resourceRoot = resolve(process.argv[2] ?? resolve(import.meta.dirname, '../resources/git'));
const layout = payload.gitPayloadLayout(resourceRoot, target);

const parts = Object.entries({
  git: layout.git,
  gitLfs: layout.gitLfs,
  notice: layout.notice,
  licence: layout.gitCopying,
  gitLfsLicence: layout.gitLfsLicense,
  manifest: layout.manifest,
});
const missingParts = await Promise.all(
  parts.map(async ([part, path]) => {
    const status = await stat(path).catch(() => undefined);
    return status?.isFile() === true ? [] : [`${part} (${path})`];
  }),
);
const missing = missingParts.flat();
if (missing.length > 0) {
  throw new Error(`The ${target} git payload is missing ${missing.join(', ')}`);
}
if ((await readFile(layout.notice, 'utf8')) !== payload.mingitPayloadNotice) {
  throw new Error(`${layout.notice} is not the NOTICE prepare-git writes`);
}
const presentPaths = await Promise.all(
  payload.mingitOmittedPaths.map(async (path) => {
    const status = await stat(join(layout.root, path)).catch(() => undefined);
    return status === undefined ? [] : [path];
  }),
);
const present = presentPaths.flat();
if (present.length > 0) {
  throw new Error(`The ${target} git payload carries what prepare-git leaves out: ${present.join(', ')}`);
}

/* The rule `package-windows.mts` signs by: every `.exe`, `.dll` and `.node`, each of which must be a PE image. */
const entries = await readdir(layout.root, { withFileTypes: true, recursive: true });
const signed = await Promise.all(
  entries
    .filter((entry) => entry.isFile() && /\.(?:exe|dll|node)$/iu.test(entry.name))
    .map(async (entry) => {
      const path = join(entry.parentPath, entry.name);
      const bytes = await readFile(path);
      if (bytes[0] !== 0x4d || bytes[1] !== 0x5a) {
        throw new Error(`Expected a PE image: ${path}`);
      }
      return relative(layout.root, path);
    }),
);
const summary = `Windows git payload (${payload.mingitVersion}, git-lfs ${payload.gitLfsVersion}): ${String(signed.length)} PE files to sign per signed build.`;
console.log(summary);
if (process.env['GITHUB_STEP_SUMMARY']) {
  await appendFile(process.env['GITHUB_STEP_SUMMARY'], `${summary}\n`);
}
