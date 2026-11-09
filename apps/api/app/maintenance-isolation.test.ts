import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { apiRoot } from '#testing/module-graph.js';

/**
 * D21: purge, blob collection and restore run once, in the
 * `revisions-maintenance` process group, and never in an `app` replica. The
 * guard itself and every job calling it are proved in
 * `apps/libs/api-git-mirror/src/maintenance/singleton.test.ts`; this is the
 * third half: nothing the API can boot imports the jobs, by any spelling.
 */

/** `apps/api/app` and the API server libraries' sources: every module the API can boot. */
const searched = [
  path.join(apiRoot, 'app'),
  ...readdirSync(path.join(apiRoot, '../libs'))
    .filter((library) => library.startsWith('api-') && existsSync(path.join(apiRoot, '../libs', library, 'src')))
    .map((library) => path.join(apiRoot, '../libs', library, 'src')),
];

/** The jobs themselves, which import one another. */
const maintenanceDirectory = path.join(apiRoot, '../libs/api-git-mirror/src/maintenance');

describe('singleton maintenance group', () => {
  it('should keep the lifecycle jobs out of every application module', () => {
    /*
     * By module basename rather than by directory, because a provider would be
     * wired in with a relative `./maintenance/…` specifier, or through the
     * library's `@taucad/api-git-mirror/maintenance/…` subpath, neither of which
     * need contain `api/git/maintenance/`.
     */
    const listed = execFileSync(
      'grep',
      ['-rlE', String.raw`from '[^']*(purge|blob-collector|restore|singleton)(\.js)?'`, ...searched],
      { encoding: 'utf8' },
    );
    const importers = listed
      .split('\n')
      .filter(
        (file) =>
          file.endsWith('.ts') &&
          !file.endsWith('.test.ts') &&
          !file.endsWith('.spec.ts') &&
          !file.startsWith(maintenanceDirectory),
      )
      .map((file) => path.relative(apiRoot, file))
      .sort();

    expect(importers).toStrictEqual(['app/maintenance-command.ts']);
  });
});

describe('prefix deletion (D31)', () => {
  it('should keep prefix deletion unreachable from application callers', () => {
    // D31: exactly one caller outside the driver that defines it. Test files are
    // excluded because D32 confines them to disposable buckets by the guard.
    // The driver lives in the object-storage library and the purge job in the git
    // mirror library, so the search covers the API and every API library.
    const appsRoot = path.join(apiRoot, '..');
    const listed = execFileSync('grep', ['-rl', 'deleteEntirePrefixForPurgeJob', apiRoot, ...searched.slice(1)], {
      encoding: 'utf8',
    });
    const callers = listed
      .split('\n')
      .filter((file) => file.endsWith('.ts') && !file.includes('.test.') && !file.includes('/conformance/'))
      .map((file) => path.relative(appsRoot, file))
      .sort();

    expect(callers).toStrictEqual(['libs/api-object-storage/src/object-storage.service.ts']);
  });
});
