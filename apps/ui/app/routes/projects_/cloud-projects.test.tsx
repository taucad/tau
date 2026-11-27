// @vitest-environment jsdom
import { createProjectFixture } from '@taucad/ui-core/lib/project.fixture';
import { mock } from 'vitest-mock-extended';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectListItem } from '@taucad/project-library/types/project-library.types';
import type { CloudProject } from '#hooks/use-cloud-projects.js';

/**
 * The one library's Tau Cloud half (charter D20, W11): which rows it adds. The
 * rendering of those rows is the library's own suite (`project-library.test.tsx`).
 */

const held: ProjectListItem = {
  ...createProjectFixture({
    id: 'proj_aaaaaaaaaaaaaaaaaaaaa',
    name: 'Gearbox Alpha',
    description: '',
    tags: [],
    assets: { main: { entryPath: 'main.ts' } },
  }),
  lastActivityAt: 0,
  locator: { backend: 'indexeddb', storageRootKey: 'indexeddb:tau-', relativeDirectory: '/gearbox-alpha' },
};
const heldLocal: ProjectListItem = {
  ...held,
  ...createProjectFixture({ ...held, id: 'proj_ccccccccccccccccccccc', name: 'Local Only' }),
};
/* In this device's Trash: still held, so never Tau Cloud's alone. */
const trashed: ProjectListItem = {
  ...held,
  ...createProjectFixture({ ...held, id: 'proj_bbbbbbbbbbbbbbbbbbbbb', name: 'Bracket Beta' }),
  deletedAt: 5,
};
const cloud: readonly CloudProject[] = [
  { id: 'proj_aaaaaaaaaaaaaaaaaaaaa', name: 'Gearbox Alpha', role: 'owner', updatedAt: 1 },
  { id: 'proj_bbbbbbbbbbbbbbbbbbbbb', name: 'Bracket Beta', role: 'owner', updatedAt: 2 },
];

vi.mock('#hooks/use-project-manager.js', () => ({ useProjectManager: () => ({}) }));
vi.mock('@taucad/files-ui/filesystem/handle-store', () => ({}));
vi.mock('#hooks/use-resolved-auth.js', () => ({ useResolvedAuth: () => 'authed' }));
/* eslint-disable-next-line @typescript-eslint/naming-convention -- `window.ENV`'s keys are the deployment's own environment variable names. */
vi.mock('#environment.config.js', () => ({ ENV: { TAU_API_URL: 'https://api.test' } }));

const storageValues = new Map<string, string>();
vi.stubGlobal(
  'localStorage',
  mock<Storage>({
    getItem: (key) => storageValues.get(key) ?? null,
    setItem: (key, value) => {
      storageValues.set(key, value);
    },
    removeItem: (key) => {
      storageValues.delete(key);
    },
    clear: () => {
      storageValues.clear();
    },
  }),
);

const { toLibraryRows } = await import('#routes/projects_/cloud-projects.js');
const { tauCloudIntent } = await import('#lib/tau-cloud-intent.js');

describe('toLibraryRows', () => {
  it('should list local, both and Tau-Cloud-only projects in one list', () => {
    const rows = toLibraryRows({ projects: [held, heldLocal], held: [held, heldLocal], cloud, includeCloudOnly: true });

    expect(rows.map((row) => [row.id, 'cloudOnly' in row ? 'cloud' : 'onCloud' in row ? 'both' : 'local'])).toEqual([
      ['proj_aaaaaaaaaaaaaaaaaaaaa', 'both'],
      ['proj_ccccccccccccccccccccc', 'local'],
      ['proj_bbbbbbbbbbbbbbbbbbbbb', 'cloud'],
    ]);
  });

  it('should keep an unmaterialized stub in the cloud presentation and deduplicate its catalog row', () => {
    tauCloudIntent.set(held.id, 'open');
    try {
      const rows = toLibraryRows({ projects: [held], held: [held], cloud, includeCloudOnly: true });
      expect(rows.filter((row) => row.id === held.id)).toHaveLength(1);
      expect(rows.find((row) => row.id === held.id)).toMatchObject({ cloudOnly: true, name: held.name });
    } finally {
      tauCloudIntent.set(held.id, undefined);
    }
  });

  it('should carry the explicit cloud association into a local Trash row without changing local metadata', () => {
    const original = structuredClone(trashed);
    const association: CloudProject = { ...cloud[1]!, canDeleteCloud: true, cloudState: 'active' };
    const rows = toLibraryRows({ projects: [trashed], held: [trashed], cloud: [association], includeCloudOnly: false });
    expect(rows).toEqual([{ ...trashed, onCloud: true, cloud: association }]);
    expect(trashed).toEqual(original);
    expect(toLibraryRows({ projects: [trashed], held: [trashed], cloud: [], includeCloudOnly: false })).toEqual([
      original,
    ]);
  });

  it('should sort a Tau-Cloud-only row by its update time', () => {
    const rows = toLibraryRows({ projects: [], held: [], cloud, includeCloudOnly: true });

    expect(rows.map((row) => row.lastActivityAt)).toEqual([1, 2]);
  });

  it('should leave Tau-Cloud-only rows out of the Trash', () => {
    const rows = toLibraryRows({ projects: [held], held: [held], cloud, includeCloudOnly: false });

    expect(rows.map((row) => row.id)).toEqual(['proj_aaaaaaaaaaaaaaaaaaaaa']);
  });

  it('should never offer a project in this device’s Trash as Tau Cloud’s alone', () => {
    const rows = toLibraryRows({ projects: [held], held: [held, trashed], cloud, includeCloudOnly: true });

    expect(rows.map((row) => row.id)).toEqual(['proj_aaaaaaaaaaaaaaaaaaaaa']);
  });
});
