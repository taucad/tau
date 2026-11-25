// oxlint-disable-next-line import/no-unassigned-import -- Side-effect import to polyfill IndexedDB for tests
import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDiscoveryProfile,
  discoveryProfileHomeId,
  operatorDiscoveryProfile,
} from '#testing/discovery-profile.js';
import type { DiscoveryProfile } from '#testing/discovery-profile.js';

/**
 * What one full discovery scan costs on the operator's profile (project-library fast-path blueprint FW0, Finding 1):
 * 386 project directories, 84 in Home (OPFS) and 302 in one File System Access folder, three ids carried by a copy in
 * each. A scan lists each root once and reads `tau.json` and `.tau/project.json` of every directory, and stats
 * `tau.json` only where an id has more than one directory.
 *
 * These are the per-scan figures `apps/libs/project-library/src/discovery-budget.ceiling.json` multiplies by the scans
 * each library mutation makes; a change here changes that file's `scan` row in the same change.
 */
describe('listProjectManifests cost on the 386-directory profile', () => {
  let profile: DiscoveryProfile;

  beforeAll(async () => {
    profile = await createDiscoveryProfile();
  }, 60_000);

  afterAll(() => {
    profile.dispose();
  });

  it('should read every directory of every root once per scan, and count it', async () => {
    const { home, workspace, duplicates } = operatorDiscoveryProfile;
    const directories = home + workspace;

    const { result, cost } = await profile.measure(async () => profile.service.listProjectManifests());

    expect(result.entries).toHaveLength(directories);
    expect(result.entries.filter((entry) => entry.status === 'duplicate-id')).toHaveLength(2 * duplicates);
    expect(result.roots.map((root) => root.status)).toEqual(['complete', 'complete']);
    expect(cost.counters).toEqual({
      'discovery.fullRead': 2,
      'discovery.listing': 2,
      'discovery.directoryRead': directories,
    });
    expect(cost.providers.home).toMatchObject({ fileReads: 2 * home, listings: 1 });
    expect(cost.providers.workspace).toMatchObject({ fileReads: 2 * workspace, listings: 1 });
    expect(cost.providers.home.calls['stat']).toBe(duplicates);
    expect(cost.providers.workspace.calls['stat']).toBe(duplicates);
    expect(cost.providers.home.kinds).toEqual({
      listing: 1,
      manifestRead: home,
      identityRead: home,
      head: duplicates,
      other: 0,
    });
    expect(cost.providers.workspace.kinds).toEqual({
      listing: 1,
      manifestRead: workspace,
      identityRead: workspace,
      head: duplicates,
      other: 0,
    });
  });

  it('should cost the same browser calls on every warm scan: nothing about a directory is remembered', async () => {
    const first = await profile.measure(async () => profile.service.listProjectManifests());
    const second = await profile.measure(async () => profile.service.listProjectManifests());

    expect(second.cost).toEqual(first.cost);
    expect({ browserCalls: second.cost.browserCalls, browser: second.cost.browser }).toMatchInlineSnapshot(`
      {
        "browser": {
          "home": {
            "arrayBuffer": 168,
            "entries": 1,
            "getFile": 171,
            "getFileHandle": 168,
          },
          "workspace": {
            "arrayBuffer": 604,
            "entries": 1,
            "getFile": 607,
            "getFileHandle": 604,
          },
        },
        "browserCalls": 2324,
      }
    `);
  });

  it('should verify one routed project with two file reads under its locks', async () => {
    const projectId = discoveryProfileHomeId(0);

    const { result, cost } = await profile.measure(async () => profile.service.verifyProjectRoute({ projectId }));

    expect(result.status).toBe('verified');
    expect(cost.counters).toEqual({});
    expect(cost.providers.home).toMatchObject({ fileReads: 2, listings: 0 });
    expect(cost.providers.workspace.total).toBe(0);
    expect({ browserCalls: cost.browserCalls, browser: cost.browser }).toMatchInlineSnapshot(`
      {
        "browser": {
          "home": {
            "arrayBuffer": 2,
            "getDirectoryHandle": 2,
            "getFile": 2,
            "getFileHandle": 2,
          },
          "workspace": {},
        },
        "browserCalls": 8,
      }
    `);
  });
});

describe('the discovery profile builder', () => {
  it.each([
    {
      timestampGranularity: 2000,
      expected: (time: number | undefined) => time !== undefined && time % 2000 === 0 && time > 0,
    },
    { timestampGranularity: Number.POSITIVE_INFINITY, expected: (time: number | undefined) => (time ?? 0) === 0 },
  ])('should round every modification time to a granularity of $timestampGranularity ms', async (row) => {
    const profile = await createDiscoveryProfile({ home: 2, workspace: 2, duplicates: 1, ...row });
    try {
      const { entries } = await profile.service.listProjectManifests();
      const copies = entries.filter((entry) => entry.status === 'duplicate-id');

      expect(copies).toHaveLength(2);
      for (const copy of copies) {
        expect(row.expected('modifiedAt' in copy ? copy.modifiedAt : undefined), JSON.stringify(copy)).toBe(true);
      }
    } finally {
      profile.dispose();
    }
  });
});
