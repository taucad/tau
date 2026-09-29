import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createProjectGraphAsync, readCachedProjectGraph } from '@nx/devkit';
import type { ProjectGraph } from '@nx/devkit';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { publishable, workspace } from '@taucad/nx';

const workflow = readFileSync(resolve(import.meta.dirname, '../../.github/workflows/publish.yml'), 'utf8');

const runScripts = (source: string): string[] => {
  const document = load(source) as { jobs?: Record<string, { steps?: ReadonlyArray<{ run?: unknown }> }> };
  return Object.values(document.jobs ?? {}).flatMap(({ steps }) =>
    (steps ?? []).flatMap(({ run }) =>
      typeof run === 'string'
        ? [
            run
              .split('\n')
              .filter((line) => !line.trim().startsWith('#'))
              .join('\n'),
          ]
        : [],
    ),
  );
};

const scripts = runScripts(workflow);
const commands = scripts.join('\n');
const planPkgcheck =
  'pnpm nx run-many -t pkgcheck --projects tag:type:package --graph=out/artifacts/geospec-native-engine/plan/packages.json';
const projectSelector = /(?:^|\s)(?:-p|--projects)(?:\s|=|$)/u;

const releaseCommandViolations = (runValues: readonly string[]): string[] => {
  const logicalLines = runValues.flatMap((run) => run.replaceAll(/\\\r?\n[ \t]*/gu, ' ').split('\n'));
  const selectedNxCommands = logicalLines.filter(
    (line) => /\b(?:pnpm )?nx\b/u.test(line) && line.trim() !== planPkgcheck && projectSelector.test(line),
  );
  return [
    ...selectedNxCommands,
    ...(runValues.some((run) => run.includes('nx-release-publish')) ? ['nx-release-publish'] : []),
  ];
};

const stepIndex = (name: string): number => workflow.indexOf(`name: ${name}`);

const projectGraph = async (): Promise<ProjectGraph> => {
  try {
    return readCachedProjectGraph();
  } catch {
    return createProjectGraphAsync();
  }
};

describe('release publish workflow', () => {
  it('names no project and re-implements no publish order', () => {
    expect(releaseCommandViolations(scripts)).toEqual([]);
    expect(commands).toContain('nx run scripts:release-gate');
  });

  it('rejects direct and continued publish selection while allowing plan pkgcheck', () => {
    for (const command of [
      'run: pnpm nx release publish --tag=beta --projects=some-package',
      'run: pnpm nx release publish --tag=beta --projects some-package',
      'run: pnpm nx release publish --tag=beta -p=some-package',
      'run: pnpm nx release publish --tag=beta -p some-package',
      'run: pnpm nx release publish --tag=beta \\\n          --projects some-package',
      'run: pnpm nx release publish --tag=beta \\\n          -p some-package',
      'run: pnpm nx run some-package:nx-release-publish',
    ]) {
      expect(releaseCommandViolations([command]), command).not.toEqual([]);
    }
    const foldedPublish = `jobs:
  publish:
    steps:
      - run: >
          pnpm nx release publish --tag=beta
          --projects some-package
`;
    expect(releaseCommandViolations(runScripts(foldedPublish))).not.toEqual([]);
    expect(releaseCommandViolations([`mkdir -p out/plan\n${planPkgcheck}`])).toEqual([]);
  });

  it('gates, asserts the publisher, dry-runs, then publishes', () => {
    const order = [
      'Run the release gate',
      'Assert pnpm is the publisher',
      'Dry-run the dependency-ordered publish',
      'Publish the release train',
    ].map((name) => stepIndex(name));

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
    expect(workflow).toContain(`NX_CLOUD_ACCESS_TOKEN: \${{ secrets.NX_CLOUD_ACCESS_TOKEN }}`);
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
