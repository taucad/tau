// oxlint-disable-next-line import/no-unassigned-import -- Side-effect import to polyfill IndexedDB for tests
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createDiscoveryProfile,
  discoveryProfileHomeId,
  operatorDiscoveryProfile,
} from '#testing/discovery-profile.js';
import type { DiscoveryCost, DiscoveryProfile } from '#testing/discovery-profile.js';
import { createMockRootHandle } from '#testing/mock-handle-factory.js';
import type { MockBrowserCall } from '#testing/mock-handle-factory.js';

/**
 * What one full discovery scan costs on the operator's profile (project-library fast-path blueprint FW0, Finding 1):
 * 386 project directories, 84 in Home (OPFS) and 302 in one File System Access folder, three ids carried by a copy in
 * each. A scan lists each root once and reads `tau.json` and `.tau/project.json` of every directory, and stats
 * `tau.json` only where an id has more than one directory.
 *
 * These are the per-scan figures `apps/libs/project-library/src/discovery-budget.ceiling.json` multiplies by the scans
 * each library mutation makes; `the library discovery budget per call` below holds that file's `scan` and
 * `verification` rows to them.
 */
describe('listProjectManifests cost on the 386-directory profile', () => {
  let profile: DiscoveryProfile;

  /*
   * A fresh profile per test: each test starts from cold provider handle caches. A shared profile leaks the handle
   * caches one test warms, or one route verification refreshes, into whichever test runs next (shuffled burn-in).
   */
  beforeEach(async () => {
    profile = await createDiscoveryProfile();
  }, 60_000);

  afterEach(() => {
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
    /* The first scan of a fresh profile is cold: it opens every directory handle. The scans measured below are warm. */
    await profile.service.listProjectManifests();
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

/** The per-call rows of the library's discovery budget, which charges every mutation at these figures. */
type BudgetUnitCost = Readonly<{ fileReads: number; listings: number; browserCalls: number }>;
const budgetCeiling = JSON.parse(
  readFileSync(
    path.join(import.meta.dirname, '../../../apps/libs/project-library/src/discovery-budget.ceiling.json'),
    'utf8',
  ),
) as Readonly<{ scan: BudgetUnitCost; verification: BudgetUnitCost }>;

describe('the library discovery budget per call', () => {
  let profile: DiscoveryProfile;

  beforeEach(async () => {
    profile = await createDiscoveryProfile();
  }, 60_000);

  afterEach(() => {
    profile.dispose();
  });

  const unitCostOf = (cost: DiscoveryCost): BudgetUnitCost => ({
    fileReads: cost.providers.home.fileReads + cost.providers.workspace.fileReads,
    listings: cost.providers.home.listings + cost.providers.workspace.listings,
    browserCalls: cost.browserCalls,
  });

  it('should charge one warm scan and one route verification at what they cost here', async () => {
    await profile.service.listProjectManifests();
    const scan = await profile.measure(async () => profile.service.listProjectManifests());
    const verification = await profile.measure(async () =>
      profile.service.verifyProjectRoute({ projectId: discoveryProfileHomeId(0) }),
    );

    expect({ scan: unitCostOf(scan.cost), verification: unitCostOf(verification.cost) }).toEqual({
      scan: budgetCeiling.scan,
      verification: budgetCeiling.verification,
    });
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

describe('the counted handle tree', () => {
  it('should count a range read through a slice as a browser call', async () => {
    const calls: MockBrowserCall[] = [];
    const root = createMockRootHandle({ onBrowserCall: (call) => calls.push(call) });
    const handle = await root.getFileHandle('tau.json', { create: true });
    const writable = await handle.createWritable();
    await writable.write(new TextEncoder().encode('0123456789'));
    await writable.close();
    calls.length = 0;

    const file = await handle.getFile();
    const range = file.slice(2, 6).slice(1);
    const bytes = await new Response(range.stream()).arrayBuffer();

    expect(new TextDecoder().decode(bytes)).toBe('345');
    expect(calls).toEqual(['getFile', 'slice', 'slice', 'stream']);
  });
});
