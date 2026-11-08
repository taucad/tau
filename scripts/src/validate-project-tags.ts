/**
 * Assert every Nx project carries valid `type:` and `scope:` tags, every
 * application library also carries a valid `layer:` tag, every API server
 * library a valid `api:` tag, and that no API server library depends on an
 * application project.
 *
 * The tag rule and the vocabulary live in `@taucad/nx`; this is the CLI over them.
 *
 * Usage: pnpm nx run scripts:validate-project-tags
 */
import process from 'node:process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createProjectGraphAsync } from '@nx/devkit';
import type { ProjectGraph } from '@nx/devkit';
import { validateTags, workspace } from '@taucad/nx';

/**
 * Graph edges from an API server library (`scope:api type:app-lib`, the
 * `apps/libs/api-*` projects) to an application project (`type:app`, such as
 * `api`). The libraries sit below the app that composes them; an edge back up
 * would make a library change and an app change indistinguishable to `nx
 * affected` again. The module-boundary lint rule refuses the import; this
 * check reads the graph Nx actually computed, so it also sees edges a lint
 * exception or a non-linted file would hide.
 *
 * @param graph - The workspace project graph.
 * @returns One `source -> target` line per offending edge, sorted.
 */
export const apiLibraryAppEdges = (graph: ProjectGraph): string[] => {
  const tagsOf = (name: string): readonly string[] => graph.nodes[name]?.data.tags ?? [];
  const isApiLibrary = (name: string): boolean =>
    tagsOf(name).includes('scope:api') && tagsOf(name).includes('type:app-lib');
  return Object.keys(graph.nodes)
    .filter((name) => isApiLibrary(name))
    .flatMap((source) =>
      (graph.dependencies[source] ?? [])
        .filter(({ target }) => tagsOf(target).includes('type:app'))
        .map(({ target }) => `${source} -> ${target}`),
    )
    .toSorted();
};

const main = async (): Promise<void> => {
  const workspaceValue = await workspace({ fresh: true });
  const violations = validateTags(workspaceValue);

  if (violations.length > 0) {
    throw new Error(`Invalid project tags:\n${violations.map((line) => `  - ${line}`).join('\n')}`);
  }

  const appEdges = apiLibraryAppEdges(await createProjectGraphAsync());
  if (appEdges.length > 0) {
    throw new Error(
      `API server libraries depend on an application:\n${appEdges.map((line) => `  - ${line}`).join('\n')}`,
    );
  }

  console.log(`✓ ${String(workspaceValue.projects.length)} projects carry valid project tags`);
};

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(resolve(entryPath)).href) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
