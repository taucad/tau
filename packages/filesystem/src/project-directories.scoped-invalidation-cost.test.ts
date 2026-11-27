// oxlint-disable-next-line import/no-unassigned-import -- Side-effect import to polyfill IndexedDB for tests
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { projectIdentityPath, serializeProjectIdentity } from '@taucad/project-core/identity';
import { projectToManifest, serializeProjectManifest } from '@taucad/types';
import { WatchRegistry } from '#watch-registry.js';
import { workerTimings } from '#worker-timings.js';
import { createDiscoveryProfile, discoveryProfileHomeId } from '#testing/discovery-profile.js';
import type { DiscoveryProfile } from '#testing/discovery-profile.js';

/**
 * What one create or delete costs the watch plane on the 386-directory profile (project-library fast-path FW5, Accept):
 * the page holds a rooted connection per project with a change-set watch and a per-path watch on it, and the library's
 * connection on the workspace root. Before FW5 the topology change of one route reset every one of them, so the
 * deliveries were of the order of the subscription count; scoped, they are of the order of one project's.
 */

const counted = ['watch.changeSets', 'watch.pathEvents'] as const;
type Deliveries = Record<(typeof counted)[number], number>;

const totals = (): Deliveries => {
  const { counters } = workerTimings.summarize(0);
  return {
    'watch.changeSets': counters['watch.changeSets']?.total ?? 0,
    'watch.pathEvents': counters['watch.pathEvents']?.total ?? 0,
  };
};

/** Every routed project's connection watches, and the workspace root's: what the page holds open. */
const watchEveryProject = (profile: DiscoveryProfile): number => {
  const roots = ['/', ...profile.configuration.projects.map(({ projectId }) => `/projects/${projectId}`)];
  for (const root of roots) {
    const view = profile.service.createRootedFileSystem(root);
    const { watchChangeSets } = view;
    if (watchChangeSets === undefined) {
      throw new Error('The authority’s own rooted view offers change-set watches.');
    }
    watchChangeSets({ paths: [''], recursive: true }, () => undefined);
    view.watch({ paths: [''], recursive: true }, () => undefined);
  }
  return roots.length;
};

/** Deliveries from `operation`, once every per-path coalescing window it opened has closed. */
const deliveriesOf = async (operation: () => Promise<unknown>): Promise<Deliveries> => {
  const before = totals();
  await operation();
  await new Promise((resolve) => {
    setTimeout(resolve, 200);
  });
  const after = totals();
  return {
    'watch.changeSets': after['watch.changeSets'] - before['watch.changeSets'],
    'watch.pathEvents': after['watch.pathEvents'] - before['watch.pathEvents'],
  };
};

/** A new Home project, written as a create writes it, then routed as the library routes it. */
const create = async (profile: DiscoveryProfile): Promise<void> => {
  const projectId = 'proj_hnew00000000000000000';
  const manifest = projectToManifest({
    name: 'New',
    description: '',
    tags: [],
    assets: { main: { entryPath: 'main.ts' } },
  });
  await profile.writeBehind('home', 'home-new/tau.json', serializeProjectManifest(manifest));
  await profile.writeBehind(
    'home',
    `home-new/${projectIdentityPath}`,
    serializeProjectIdentity({ version: 1, projectId }),
  );
  await profile.service.configureProjectRoots({
    ...profile.configuration,
    projects: [...profile.configuration.projects, { backend: 'opfs', projectId, providerBasePath: 'home-new' }],
  });
};

/** A sole Home copy deleted for good: its route is revoked. */
const remove = async (profile: DiscoveryProfile): Promise<void> => {
  await expect(
    profile.service.permanentlyDeleteProjectDirectory({
      projectId: discoveryProfileHomeId(10),
      providerBasePath: 'home-010',
      scope: { backend: 'opfs' },
    }),
  ).resolves.toMatchObject({ status: 'deleted' });
};

describe('watch deliveries of one library mutation on the 386-directory profile', () => {
  let profile: DiscoveryProfile;

  beforeEach(async () => {
    profile = await createDiscoveryProfile();
  }, 60_000);

  afterEach(() => {
    profile.dispose();
    vi.restoreAllMocks();
  });

  it('should reset only the workspace root connection on a create', async () => {
    watchEveryProject(profile);

    const deliveries = await deliveriesOf(async () => create(profile));

    expect(deliveries).toEqual({ 'watch.changeSets': 1, 'watch.pathEvents': 1 });
  });

  it("should reach only the deleted project's connection and the workspace root's on a delete", async () => {
    watchEveryProject(profile);

    const deliveries = await deliveriesOf(async () => remove(profile));

    expect(deliveries).toEqual({ 'watch.changeSets': 2, 'watch.pathEvents': 2 });
  });

  /* The baseline the two above are measured against: the reset every watch heard before FW5. */
  it.each([
    ['create', create],
    ['delete', remove],
  ] as const)('should have reached every connection on a %s when every watch was reset', async (_, operation) => {
    vi.spyOn(WatchRegistry.prototype, 'emitReset').mockImplementation(function (this: WatchRegistry) {
      this.emitResetAll();
    });
    const connections = watchEveryProject(profile);

    const deliveries = await deliveriesOf(async () => operation(profile));

    expect(deliveries).toEqual({ 'watch.changeSets': connections, 'watch.pathEvents': connections });
  });
});
