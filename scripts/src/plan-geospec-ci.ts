/**
 * Read expanded Nx task graphs to select the existing GeoSpec artifact producer.
 * No task execution or dependency traversal: Nx owns the expanded graph.
 * Usage: node scripts/src/plan-geospec-ci.ts <graph.json> [<graph.json> ...]
 * Optional GITHUB_OUTPUT receives boolean job outputs; stdout records selected tasks.
 * Exit 1 on missing/invalid graph input. Host tests are reported for routing; no suite is executed or omitted.
 */
import assert from 'node:assert/strict';
import { appendFileSync, readFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

/** The fields consumed from Nx's `--graph=<file.json>` export. */
export type TaskGraphExport = {
  graph?: {
    nodes?: Record<string, { data: { targets?: Record<string, unknown>; tags?: string[] } }>;
    dependencies?: Record<string, Array<{ target: string }>>;
  };
  tasks?: { tasks?: Record<string, { target?: { project?: string; target?: string } }> };
};

/** Select prerequisites from all expanded tasks, including unaffected dependencies. */
export const planGeospecCi = (
  graphs: readonly TaskGraphExport[],
): {
  required: boolean;
  artifactTasks: string[];
  darwinTests: string[];
  consumerTests: string[];
} => {
  const artifactTasks = new Set<string>();
  const darwinTests = new Set<string>();
  const consumerTests = new Set<string>();
  for (const graph of graphs) {
    assert.ok(graph.graph?.nodes && graph.tasks?.tasks, 'Expected an expanded Nx task graph');
    for (const [id, task] of Object.entries(graph.tasks.tasks)) {
      assert.ok(
        typeof task.target?.project === 'string' && typeof task.target.target === 'string',
        `Invalid task ${id}`,
      );
      const owner = graph.graph.nodes[task.target.project];
      assert.ok(owner, `Missing project metadata for ${id}`);
      if (task.target.target === 'require-geospec-artifacts') {
        assert.ok(owner.data.targets?.['prepare-geospec-ci-artifacts'], `Missing artifact producer for ${id}`);
        artifactTasks.add(id);
      }

      if (owner.data.tags?.includes('host:darwin-arm64') && task.target.target === 'test') {
        darwinTests.add(id);
      }

      // A test that imports a GeoSpec engine package directly loads its generated
      // bindings, so it needs the products even when no build task asks for them.
      const { nodes, dependencies } = graph.graph;
      if (
        task.target.target === 'test' &&
        dependencies?.[task.target.project]?.some(
          (dependency) => nodes[dependency.target]?.data.targets?.['prepare-geospec-ci-artifacts'],
        )
      ) {
        consumerTests.add(id);
      }
    }
  }

  return {
    required: artifactTasks.size > 0 || darwinTests.size > 0 || consumerTests.size > 0,
    artifactTasks: [...artifactTasks].sort(),
    darwinTests: [...darwinTests].sort(),
    consumerTests: [...consumerTests].sort(),
  };
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const paths = process.argv.slice(2);
    assert.ok(paths.length > 0, 'Supply at least one expanded Nx task graph JSON file');
    const result = planGeospecCi(paths.map((path) => JSON.parse(readFileSync(path, 'utf8')) as TaskGraphExport));
    console.log(JSON.stringify(result));
    if (process.env['GITHUB_OUTPUT']) {
      appendFileSync(
        process.env['GITHUB_OUTPUT'],
        `geospec-required=${result.required}\ngeospec-darwin-tests=${result.darwinTests.length > 0}\n`,
      );
    }
  } catch (error) {
    console.error('GeoSpec CI planning failed:', error);
    process.exitCode = 1;
  }
}
