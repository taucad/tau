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
 * What discovery costs on the operator's profile (project-library fast-path blueprint FW0, Finding 1; FW2): 386
 * project directories, 84 in Home (OPFS) and 302 in one File System Access folder, three ids carried by a copy in each.
 * A full read lists each root once and reads `tau.json` and `.tau/project.json` of every directory, and stats
 * `tau.json` only where an id has more than one directory. With the discovery index (FW2) only the first pass after a
 * reload, or after a reset, is a full read; a warm pass reads only the directories with evidence.
 *
 * These are the per-call figures `apps/libs/project-library/src/discovery-budget.ceiling.json` multiplies by what each
 * library mutation asks. `the discovery unit cost` below records them in `testing/discovery-unit-cost.json`, and the
 * library budget test holds its ceiling's unit rows to that file.
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

  it('should make no provider or browser call on a warm pass with no evidence (FW2, S9)', async () => {
    await profile.service.listProjectManifests();

    const warm = await profile.measure(async () => profile.service.listProjectManifests());

    expect(warm.result.entries).toHaveLength(operatorDiscoveryProfile.home + operatorDiscoveryProfile.workspace);
    expect(warm.cost.counters).toEqual({});
    expect(warm.cost.providers.home.total + warm.cost.providers.workspace.total).toBe(0);
    expect(warm.cost.browserCalls).toBe(0);
  });

  it('should cost the same browser calls on every full read with warm handles: a reset index reads everything', async () => {
    /* The first pass of a fresh profile is cold: it opens every directory handle. The reads measured below are warm. */
    await profile.service.listProjectManifests();
    profile.index.cold(undefined, 'reset');
    const first = await profile.measure(async () => profile.service.listProjectManifests());
    profile.index.cold(undefined, 'reset');
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

  /* Fast-path FW3: the delete answers what remains of the id under the same hold of its lock, from reads of the known
   * locations; no other directory is read unless no known location holds the id. A copy in another root than the
   * target cannot be the target under another spelling, so its root is not listed (review M1, budget). */
  it('should delete a copy with its own checks and one probe of the other copy in another root, listing no root', async () => {
    await profile.service.listProjectManifests();
    const projectId = discoveryProfileHomeId(0);

    const { result, cost } = await profile.measure(async () =>
      profile.service.permanentlyDeleteProjectDirectory({
        projectId,
        providerBasePath: 'copy-000',
        scope: profile.workspaceScope,
        copy: true,
      }),
    );

    expect(result).toMatchObject({ status: 'deleted', remaining: [{ relativeDirectory: 'home-000' }] });
    expect(cost.counters).toEqual({ 'discovery.probe': 1 });
    /* The target's checks: its manifest and its identity, and whether it, its manifest and then nothing remains. */
    expect(cost.providers.workspace.kinds).toMatchObject({ manifestRead: 1, identityRead: 1, head: 0 });
    expect(cost.providers.workspace.fileReads).toBe(2);
    /* The other copy: two reads, no listing. */
    expect(cost.providers.home).toMatchObject({ fileReads: 2, listings: 0 });
  });

  it('should delete a sole copy with its own checks and one identity sweep (until W5)', async () => {
    await profile.service.listProjectManifests();
    const [home] = await profile.service.getRootStatuses();
    const projectId = discoveryProfileHomeId(10);

    const { result, cost } = await profile.measure(async () =>
      profile.service.permanentlyDeleteProjectDirectory({
        projectId,
        providerBasePath: 'home-010',
        scope: { backend: 'opfs' },
      }),
    );

    expect(result).toEqual({ status: 'deleted', remaining: [], absence: 'absent' });
    expect(home?.storageRootKey).toBeDefined();
    expect(cost.counters).toEqual({ 'discovery.identitySweep': 1, 'discovery.listing': 2 });
    /* The sweep: one identity read of every other directory; the target: its manifest and its identity. */
    const { home: homeRoot, workspace } = operatorDiscoveryProfile;
    expect(cost.providers.home.kinds.identityRead + cost.providers.workspace.kinds.identityRead).toBe(
      homeRoot - 1 + workspace + 1,
    );
    expect(cost.providers.home.kinds.manifestRead).toBe(1);
  });
});

/** The per-call figures the library's discovery budget charges every mutation at; see `discovery-unit-cost.json`. */
type UnitCost = Readonly<{ fileReads: number; listings: number; browserCalls: number }>;
const unitCost = JSON.parse(
  readFileSync(path.join(import.meta.dirname, 'testing/discovery-unit-cost.json'), 'utf8'),
) as Readonly<{
  scan: UnitCost;
  warmPass: UnitCost;
  directoryRead: UnitCost;
  sweep: UnitCost;
  verification: UnitCost;
  probe: UnitCost;
  listing: UnitCost;
}>;

describe('the discovery unit cost', () => {
  let profile: DiscoveryProfile;

  beforeEach(async () => {
    profile = await createDiscoveryProfile();
  }, 60_000);

  afterEach(() => {
    profile.dispose();
  });

  const unitCostOf = (cost: DiscoveryCost): UnitCost => ({
    fileReads: cost.providers.home.fileReads + cost.providers.workspace.fileReads,
    listings: cost.providers.home.listings + cost.providers.workspace.listings,
    browserCalls: cost.browserCalls,
  });

  it('should record what a full read, a warm pass, one directory re-read, an identity sweep, one route verification, one probe and one root listing cost on the profile', async () => {
    await profile.service.listProjectManifests();
    profile.index.cold(undefined, 'reset');
    const scan = await profile.measure(async () => profile.service.listProjectManifests());
    const warmPass = await profile.measure(async () => profile.service.listProjectManifests());
    const [home] = await profile.service.getRootStatuses();
    /* Evidence names one directory's manifest, as the provider tap or a sibling's named notice would. */
    profile.index.note(home!.storageRootKey, ['home-010/tau.json']);
    const directoryRead = await profile.measure(async () => profile.service.listProjectManifests());
    const sweep = await profile.measure(async () => profile.service.verifyAbsent(discoveryProfileHomeId(0)));
    const verification = await profile.measure(async () =>
      profile.service.verifyProjectRoute({ projectId: discoveryProfileHomeId(0) }),
    );
    const [, workspaceRoot] = await profile.service.getRootStatuses();
    /* FW3: one known location of an id read under its locks; and one fresh listing of a root's child names. */
    const probe = await profile.measure(async () =>
      profile.service.probeProjectDirectories({
        projectId: discoveryProfileHomeId(0),
        locators: [{ backend: 'opfs', storageRootKey: home!.storageRootKey, relativeDirectory: 'home-000' }],
      }),
    );
    const listing = await profile.measure(async () =>
      profile.service.probeProjectDirectories({ root: workspaceRoot!.storageRootKey }),
    );

    expect(sweep.result.status).toBe('present');
    expect(probe.result.locations.map((location) => location.status)).toEqual(['held']);
    expect(listing.result.names).toHaveLength(operatorDiscoveryProfile.workspace);
    expect({
      scan: unitCostOf(scan.cost),
      warmPass: unitCostOf(warmPass.cost),
      directoryRead: unitCostOf(directoryRead.cost),
      sweep: unitCostOf(sweep.cost),
      verification: unitCostOf(verification.cost),
      probe: unitCostOf(probe.cost),
      listing: unitCostOf(listing.cost),
    }).toEqual({
      scan: unitCost.scan,
      warmPass: unitCost.warmPass,
      directoryRead: unitCost.directoryRead,
      sweep: unitCost.sweep,
      verification: unitCost.verification,
      probe: unitCost.probe,
      listing: unitCost.listing,
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
