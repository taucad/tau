import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createProjectGraphAsync, readCachedProjectGraph, type ProjectGraph } from '@nx/devkit';
import { describe, expect, it } from 'vitest';
import { publishable, workspace } from '@taucad/nx';

const workflow = readFileSync(resolve(import.meta.dirname, '../../.github/workflows/publish.yml'), 'utf8');

/**
 * Comments name the Nx mechanism (`nx-release-publish`) that makes the single
 * publish step ordered; only the commands must stay free of project names.
 */
const commands = workflow
  .split('\n')
  .filter((line) => !line.trim().startsWith('#'))
  .join('\n');

const stepIndex = (name: string): number => workflow.indexOf(`name: ${name}`);

const projectGraph = async (): Promise<ProjectGraph> => {
  try {
    return readCachedProjectGraph();
  } catch {
    return await createProjectGraphAsync();
  }
};

describe('release publish workflow', () => {
  it('names no project and re-implements no publish order', () => {
    expect(commands).not.toMatch(/-p |--projects=|nx-release-publish/u);
    expect(commands).toContain('nx run scripts:release-gate');
  });

  it('gates, asserts the publisher, dry-runs, then publishes', () => {
    const order = [
      'Run the release gate',
      'Assert pnpm is the publisher',
      'Dry-run the dependency-ordered publish',
      'Publish the release train',
    ].map(stepIndex);

    expect(order).not.toContain(-1);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(workflow).toContain("packageManager.startsWith('pnpm@')");
  });

  it('dry-runs the command it publishes with', () => {
    const publishLines = commands.split('\n').filter((line) => line.includes('nx release publish'));

    expect(publishLines).toHaveLength(2);
    expect(publishLines[0]).toContain('nx release publish --dry-run --tag=beta');
    expect(publishLines[1]).toContain('nx release publish --tag=beta');
    expect(publishLines[1]).not.toContain('--dry-run');
  });

  it('reads the Nx Cloud cache the CI run wrote', () => {
    expect(workflow).toContain('NX_CLOUD_ACCESS_TOKEN: ${{ secrets.NX_CLOUD_ACCESS_TOKEN }}');
  });

  it('gives every publishable an ordered, pkgcheck-gated publish target', async () => {
    const resolved = await workspace();
    const graph = await projectGraph();
    const names = publishable(resolved).map(({ name }) => name);

    expect(names.length).toBeGreaterThan(0);
    expect(names).not.toContain('telemetry');

    for (const name of names) {
      // Nx synthesises `nx-release-publish` for every non-private package and
      // merges `nx.json` targetDefaults into it, normalising the bare target
      // name to `<project>:pkgcheck`.
      const dependsOn = graph.nodes[name]?.data.targets?.['nx-release-publish']?.dependsOn ?? [];
      expect(dependsOn, name).toContain('^nx-release-publish');
      expect(
        dependsOn.some((entry) => entry === 'pkgcheck' || entry === `${name}:pkgcheck`),
        `${name} pkgcheck`,
      ).toBe(true);
    }
  });
});
