import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { apiRoot, importChain, moduleGraph, moduleGraphExcept, sourceFiles } from '#testing/module-graph.js';

/**
 * North star DC4 (review FR4): `deleteFiles`-class object-storage calls are
 * reachable only from the maintenance image (`tau-maintenance`) and from the
 * storage commit path, which DC1 moves to `tau-storage`. The public API's own
 * entry points reach no other delete, so the day its token loses delete
 * capability nothing on the request path breaks. The API still reaches the
 * commit path through DC1's in-process fallback, which serves git while
 * production has no tau-storage.
 *
 * A "delete-class call" is any call of the driver's delete verbs or the
 * repository store's `deleteObjects`, and any `Delete*Command` of the AWS SDK.
 * The graph is static and over-approximates (`#testing/module-graph.js`): a
 * module counts as reached if it is imported at all, whether or not the
 * deleting function is ever called, so the remedy for a failure here is to move
 * the deleting function out of the request path's modules, never to narrow this
 * test.
 */

const deleteCall = /\.(?:deleteBlob|deleteBlobs|deleteEntirePrefixForPurgeJob|deleteObjects)\s*\(/u;
const deleteCommand = /new\s+Delete\w*Command\s*\(/u;

/** Where the capability is defined: the driver, and the repository-store adapter that forwards to it. */
const definitions = new Set(['app/storage/object-storage.service.ts', 'app/api/git/store/s3-repository-store.ts']);

/** The storage commit path: a commit sweeps the packs it retired (W6). DC1 moves it into `tau-storage`. */
const commitPath = new Set(['app/api/git/store/sweep.ts']);

/** The `tau-storage` image's only entry (Dockerfile `storage` target, DC1). */
const storageEntry = 'app/storage-worker.ts';

/** DC1's in-process fallback: how an API without `TAU_STORAGE_URL` still serves git. */
const inProcessFallback = 'app/api/git/forwarding/in-process-executor.ts';

/**
 * The API image's request-serving and billing entries: `vite.config.ts`
 * (`appPath`) and `vite.billing-command.config.ts` (`ssr`). The API image also
 * still carries `maintenance-command.js` for its `revisions-maintenance` group
 * until the DC4 cutover retires that group.
 */
const apiEntries = ['app/main.ts', 'app/billing-command.ts'];

/** The `tau-maintenance` image's only entry (Dockerfile `maintenance` target). */
const maintenanceEntry = 'app/maintenance-command.ts';

/** The lifecycle jobs that must stay reachable from the maintenance image, so the test is never vacuous. */
const maintenanceDeleters = [
  'app/api/git/maintenance/purge.ts',
  'app/api/git/maintenance/project-purge.ts',
  'app/api/git/maintenance/blob-collector.ts',
  'app/api/git/lfs-retirement.ts',
];

const read = (file: string): string => readFileSync(path.join(apiRoot, file), 'utf8');

const deleteCallers = (): string[] =>
  sourceFiles().filter((file) => !definitions.has(file) && deleteCall.test(read(file)));

describe('delete-class object-storage calls (DC4)', () => {
  it('should construct an S3 delete command only in the storage driver', () => {
    const constructing = sourceFiles().filter((file) => deleteCommand.test(read(file)));

    expect(constructing).toEqual(['app/storage/object-storage.service.ts']);
  });

  it('should reach no delete from the API entries except the storage commit path', () => {
    const api = moduleGraph(...apiEntries);
    const reached = deleteCallers()
      .filter((file) => api.modules.has(file) && !commitPath.has(file))
      .map((file) => importChain(api, file));

    expect(reached).toEqual([]);
  });

  it('should reach the commit path from the API entries only through the in-process fallback (DC1)', () => {
    const api = moduleGraph(...apiEntries);
    const forwarded = moduleGraphExcept(new Set([inProcessFallback]), ...apiEntries);

    expect([...commitPath].filter((file) => !api.modules.has(file))).toEqual([]);
    expect([...commitPath].filter((file) => forwarded.modules.has(file))).toEqual([]);
  });

  it('should reach the commit path from the tau-storage entry', () => {
    const storage = moduleGraph(storageEntry);

    expect([...commitPath].filter((file) => !storage.modules.has(file))).toEqual([]);
  });

  it('should reach every lifecycle delete from the maintenance entry', () => {
    const maintenance = moduleGraph(maintenanceEntry);

    expect(maintenanceDeleters.filter((file) => !maintenance.modules.has(file))).toEqual([]);
    expect(maintenanceDeleters.filter((file) => !deleteCallers().includes(file))).toEqual([]);
  });
});
