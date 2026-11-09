import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RuntimeEntryName, builtInSkillSlugs, kernelIds, parseRuntimeEntry, tauToolNames } from '@taucad/telemetry';

/**
 * `@taucad/telemetry`'s ingest vocabularies are copied so that library never depends on the agent host, the kernel
 * catalogue or the skill bundles. This reads each owner's source, so a new tool, kernel or skill fails here until the
 * copy follows. It lives in `scripts`, whose `test` inputs are the whole workspace, so the owners' sources are not
 * `telemetry:test` inputs.
 */
const workspaceRoot = path.resolve(import.meta.dirname, '../..');
const source = (file: string): string => readFileSync(path.join(workspaceRoot, file), 'utf8');

/**
 * The text between `start` and the first `end` after it.
 *
 * @param text - The source text.
 * @param start - The opening marker.
 * @param end - The closing marker.
 * @returns The enclosed block.
 */
const block = (text: string, start: string, end: string): string => {
  const from = text.indexOf(start);
  expect(from).toBeGreaterThanOrEqual(0);
  return text.slice(from, text.indexOf(end, from));
};

describe('ingest vocabularies', () => {
  it('should list every tauToolKinds key in @taucad/agent-host', () => {
    const map = block(source('packages/agent-host/src/harness/tools.ts'), 'export const tauToolKinds = new Map', ']);');
    const names = [...map.matchAll(/\['(?<name>\w+)', '\w+'\]/gu)].map(({ groups }) => groups!['name']);

    expect(names).toEqual([...tauToolNames]);
  });

  it('should list every kernelConfigurations id in @taucad/types', () => {
    const list = block(
      source('libs/types/src/constants/kernel.constants.ts'),
      'export const kernelConfigurations = [',
      '] as const',
    );
    const ids = [...list.matchAll(/^ {4}id: '(?<id>[\w-]+)'/gmu)].map(({ groups }) => groups!['id']);

    expect(ids).toEqual([...kernelIds]);
  });

  it('should list every built-in skill bundle slug shipped through @taucad/skills', () => {
    // `geospec-authoring` ships in the installed `geospec` package, published from taucad/geospec.
    const manifests = globSync(
      [
        'packages/*/agent/skills.json',
        'packages/plugins/*/agent/skills.json',
        'node_modules/geospec/agent/skills.json',
      ],
      { cwd: workspaceRoot },
    );
    const slugs = manifests.flatMap((file) =>
      (JSON.parse(source(file)) as { bundles: Array<{ slug: string }> }).bundles.map(({ slug }) => slug),
    );

    expect(slugs.toSorted()).toEqual([...builtInSkillSlugs].toSorted());
  });
});

describe('runtime entry release', () => {
  it('D-T12-2: should admit the release the CLI and its MCP route actually send', () => {
    const { version } = JSON.parse(source('packages/cli/package.json')) as { version: string };

    expect(
      parseRuntimeEntry({
        name: RuntimeEntryName.OPERATION,
        duration: 120,
        detail: {
          operation: 'render',
          outcome: 'succeeded',
          route: 'cli',
          caller: 'host',
          transport: 'in-process',
          platform: 'node',
          os: 'linux',
          release: version,
        },
      }),
    ).toBeDefined();
  });
});

/*
 * PR 0b: the cross-project parity tests above (and T30/T36 beside them) moved here from `libs/telemetry/src` so that
 * `telemetry:test` stops naming every kernel plugin's sources as inputs, which made each plugin change select
 * `telemetry`, `host` and everything that depends on `host`. These pins keep the dependency and the inputs out.
 */
describe('telemetry test boundary', () => {
  const telemetryRoot = 'libs/telemetry';

  it('should keep the plugin-registry derivation out of every file under libs/telemetry/src', () => {
    const files = globSync(`${telemetryRoot}/src/**/*.{ts,mts,tsx}`, { cwd: workspaceRoot });
    expect(files.length).toBeGreaterThan(0);
    const importers = files.filter((file) => source(file).includes('runtime-registry'));

    expect(importers).toEqual([]);
  });

  it('should name no packages/** path in any telemetry target input', () => {
    const project = JSON.parse(source(`${telemetryRoot}/project.json`)) as {
      targets: Record<string, { inputs?: unknown[] }>;
    };
    const inputs = Object.values(project.targets).flatMap(({ inputs: targetInputs = [] }) =>
      targetInputs.map((input) => JSON.stringify(input)),
    );
    expect(inputs.length).toBeGreaterThan(0);

    expect(inputs.filter((input) => /packages\//u.test(input))).toEqual([]);
  });

  /*
   * Wave 0M, AF-4: Nx marks a project affected by any changed file that matches a `{workspaceRoot}` input of any of
   * its targets, and every dependent with it. The Grafana contract and rule-evaluation suites read `infra/grafana`
   * and the API's OTel bootstrap, so they live here too: a dashboard edit selects `scripts`, not `telemetry`,
   * `host`, the CLI and the native rows behind them.
   */
  it('should name no workspace-root path in any telemetry target input', () => {
    const project = JSON.parse(source(`${telemetryRoot}/project.json`)) as {
      targets: Record<string, { inputs?: unknown[] }>;
    };
    const inputs = Object.values(project.targets).flatMap(({ inputs: targetInputs = [] }) =>
      targetInputs.map((input) => JSON.stringify(input)),
    );
    expect(inputs.length).toBeGreaterThan(0);

    expect(inputs.filter((input) => input.includes('{workspaceRoot}'))).toEqual([]);
  });

  it('should keep every file under libs/telemetry from reading infra/grafana or another project by path', () => {
    const files = globSync(`${telemetryRoot}/{src,scripts}/**/*.{ts,mts,tsx}`, { cwd: workspaceRoot });
    expect(files.length).toBeGreaterThan(0);
    const readers = files.filter((file) =>
      /infra\/grafana|\.\.\/\.\.\/\.\.\/(?:apps|libs|packages)\//u.test(source(file)),
    );

    expect(readers).toEqual([]);
  });
});
