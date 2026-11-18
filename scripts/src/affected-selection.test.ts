import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { createProjectGraphAsync } from '@nx/devkit';
import type { ProjectGraph, TargetConfiguration } from '@nx/devkit';
import { beforeAll, describe, expect, it } from 'vitest';

import { browserTests, workspaceTests } from '#test-sets.js';

/*
 * Seeded-path pins for `nx affected` (ST-1 of the CI structural decomposition blueprint). In Nx 22 a project is
 * selected when the diff holds one of its files, when a dependency is selected, or when the diff matches a
 * `{workspaceRoot}` fileset in any target's `inputs`. Two such inputs pointed up the graph: `taucad-ui:test` listed
 * the app's and the UI libraries' `.tsx` for the focus-outline scan, and `scripts:test` listed the whole workspace.
 * Each case below runs Nx's own selection on one changed file, so a re-added input fails here.
 *
 * The focus-outline scan of the app now lives in `ui:test` (`apps/ui/app/styles/focus-outline.test.ts`); `ui` depends
 * on every library it scans. The `scripts` suites that read other projects run in `scripts:validate-workspace-tests`
 * on every landing; the rest key on `.github/**` and the other workspace files `scripts:test` lists.
 */

type FileChange = { readonly file: string; readonly hash: string; getChanges: () => ReadonlyArray<{ type: string }> };
type FilterAffected = (graph: ProjectGraph, touched: readonly FileChange[]) => Promise<ProjectGraph>;

/* Nx exports no public affected API; its CLI calls this function with the same arguments. */
const nxRoot = dirname(createRequire(import.meta.url).resolve('nx/package.json'));
const { filterAffected } = createRequire(import.meta.url)(
  join(nxRoot, 'dist/src/project-graph/affected/affected-project-graph.js'),
) as { filterAffected: FilterAffected };

let graph: ProjectGraph;

beforeAll(async () => {
  graph = await createProjectGraphAsync({ exitOnError: false });
}, 300_000);

const affectedBy = async (file: string): Promise<ReadonlySet<string>> => {
  const change: FileChange = { file, hash: 'seeded', getChanges: () => [{ type: 'WholeFileChange' }] };
  const affected = await filterAffected(graph, [change]);
  return new Set(Object.keys(affected.nodes));
};

const workspaceRootInputs = (target: TargetConfiguration | undefined): string[] =>
  (target?.inputs ?? []).flatMap((input) => {
    const fileset = typeof input === 'string' ? input : 'fileset' in input ? input.fileset : undefined;
    return typeof fileset === 'string' && fileset.startsWith('{workspaceRoot}/') ? [fileset] : [];
  });

/* The scanned libraries, in `apps/ui/app/styles/focus-outline.test.ts`. */
const uiLibraries = [
  'ui-kit',
  'chat-ui',
  'project-workspace',
  'files-ui',
  'editor-ui',
  'revisions-ui',
  'settings-ui',
  'publish-ui',
  'billing-ui',
  'ui-core',
];

describe('affected selection', { timeout: 60_000 }, () => {
  it.each([
    'apps/ui/app/components/category-badge.tsx',
    'apps/ui/app/components/category-badge.ts',
    'apps/libs/ui-kit/src/components/color-picker.tsx',
  ])('should not select the design system, viewer parity or GeoSpec when %s changes', async (file) => {
    const affected = await affectedBy(file);

    expect(affected).toContain('ui');
    expect(affected).not.toContain('taucad-ui');
    /* `tau-examples` owns `test:viewer-parity` and `test-geospec`. */
    expect(affected).not.toContain('tau-examples');
  });

  it('should still run the app focus-outline scan when a scanned library changes', async () => {
    const dependencies = new Set((graph.dependencies['ui'] ?? []).map(({ target }) => target));
    const affected = await Promise.all(
      uiLibraries.map(async (library) => affectedBy(`${graph.nodes[library]?.data.root}/src/seeded-component.tsx`)),
    );
    for (const [index, library] of uiLibraries.entries()) {
      expect(dependencies, library).toContain(library);
      expect(affected[index], library).toContain('ui');
    }
  });

  it('should run both focus-outline scans when a design-system component changes', async () => {
    const affected = await affectedBy('packages/ui/src/components/button.tsx');

    expect(affected).toContain('taucad-ui');
    expect(affected).toContain('ui');
  });

  it.each(['.github/workflows/ci.yml', '.github/actions/setup-nx/action.yml', 'infra/grafana/bundle.json'])(
    'should select scripts, whose tests pin it, when %s changes',
    async (file) => {
      expect(await affectedBy(file)).toContain('scripts');
    },
  );

  it('should not select scripts for a file outside its dependency closure', async () => {
    expect(await affectedBy('apps/www/app/entry.server.tsx')).not.toContain('scripts');
  });

  it('should keep taucad-ui and scripts test inputs inside the workspace files they own or pin', () => {
    expect(workspaceRootInputs(graph.nodes['taucad-ui']?.data.targets?.['test'])).toEqual([]);
    expect(
      workspaceRootInputs(graph.nodes['scripts']?.data.targets?.['test']).filter((input) =>
        /^\{workspaceRoot\}\/(?:\*\*|apps|libs|packages)\b/u.test(input),
      ),
    ).toEqual([]);
  });

  it('should run the workspace suites on every landing without selecting anything', () => {
    const target = graph.nodes['scripts']?.data.targets?.['validate-workspace-tests'];

    expect(target?.cache).toBe(false);
    expect(workspaceRootInputs(target)).toEqual([]);
    expect(graph.nodes['scripts']?.data.targets?.['validate']?.dependsOn).toContainEqual({ target: 'validate-*' });
    expect(workspaceTests.filter((file) => browserTests.includes(file))).toEqual([]);
    expect(workspaceTests).toContain('src/affected-selection.test.ts');
  });
});
