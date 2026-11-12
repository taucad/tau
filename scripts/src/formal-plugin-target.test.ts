/* oxlint-disable no-restricted-imports -- the Nx plugin under test is workspace tooling under tools/, with no package specifier */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CreateNodesContextV2 } from '@nx/devkit';
// eslint-disable-next-line @nx/enforce-module-boundaries -- the Nx plugin under test is workspace tooling, not a project
import { createNodesV2 } from '../../tools/formal.plugin.js';

/**
 * The formal plugin infers `formal` and `formal:lean` from the `expected.json`
 * files `formal check` reads under `{projectRoot}/specs/`. It never infers
 * `formal:nightly` or `formal:logs`, which stay explicit per project.
 */

let workspaceRoot: string;

const write = (file: string, contents: unknown): void => {
  mkdirSync(dirname(join(workspaceRoot, file)), { recursive: true });
  writeFileSync(join(workspaceRoot, file), typeof contents === 'string' ? contents : JSON.stringify(contents));
};

const inferredTargets = async (files: string[]): Promise<Record<string, string[]>> => {
  const context = { workspaceRoot, nxJsonConfiguration: {} } as unknown as CreateNodesContextV2;
  const results = await createNodesV2[1](files, {}, context);
  const targets: Record<string, string[]> = {};
  for (const [, result] of results) {
    for (const [root, project] of Object.entries(result.projects ?? {})) {
      targets[root] = [...(targets[root] ?? []), ...Object.keys(project.targets ?? {})].toSorted();
    }
  }
  return targets;
};

const tlaExpected = { configs: { 'spec.target.cfg': { tier: 'pr', expect: 'pass' } } };
const leanExpected = { lean: { module: 'spec' } };

describe('formal plugin targets', () => {
  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'formal-plugin-'));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('should infer formal for a project with a TLA+ expected.json under specs', async () => {
    write('packages/a/project.json', { name: 'a' });
    write('packages/a/specs/expected.json', tlaExpected);
    write('packages/a/specs/nested/expected.json', tlaExpected);

    expect(await inferredTargets(['packages/a/specs/expected.json', 'packages/a/specs/nested/expected.json'])).toEqual({
      'packages/a': ['formal', 'formal'],
    });
  });

  it('should infer formal:lean for an expected.json with a lean section, and both tiers side by side', async () => {
    write('apps/lean-only/project.json', { name: 'lean-only' });
    write('apps/lean-only/specs/lean/expected.json', leanExpected);
    write('packages/both/project.json', { name: 'both' });
    write('packages/both/specs/expected.json', tlaExpected);
    write('packages/both/specs/lean/expected.json', leanExpected);

    expect(
      await inferredTargets([
        'apps/lean-only/specs/lean/expected.json',
        'packages/both/specs/expected.json',
        'packages/both/specs/lean/expected.json',
      ]),
    ).toEqual({ 'apps/lean-only': ['formal:lean'], 'packages/both': ['formal', 'formal:lean'] });
  });

  it('should infer nothing when specs sits outside a project root or at the workspace root', async () => {
    write('packages/no-project/specs/expected.json', tlaExpected);
    write('packages/b/project.json', { name: 'b' });
    write('packages/b/src/specs/expected.json', tlaExpected);
    write('specs/expected.json', tlaExpected);

    expect(
      await inferredTargets([
        'packages/no-project/specs/expected.json',
        'packages/b/src/specs/expected.json',
        'specs/expected.json',
      ]),
    ).toEqual({});
  });

  it('should exclude specs under a fixture directory, even one shaped like a project', async () => {
    write('tools/formal/src/fixtures/toy/project.json', { name: 'toy' });
    write('tools/formal/src/fixtures/toy/specs/expected.json', tlaExpected);
    write('packages/c/project.json', { name: 'c' });
    write('packages/c/specs/__fixtures__/expected.json', tlaExpected);

    expect(
      await inferredTargets([
        'tools/formal/src/fixtures/toy/specs/expected.json',
        'packages/c/specs/__fixtures__/expected.json',
      ]),
    ).toEqual({});
  });

  it('should never infer formal:nightly or formal:logs, whatever the specs hold', async () => {
    write('packages/d/project.json', { name: 'd' });
    write('packages/d/specs/expected.json', {
      configs: { 'spec.wide.cfg': { tier: 'nightly', expect: 'pass' } },
      graphs: { spec: { config: 'spec.export.cfg', phase: 'phase' } },
      logs: { specTrace: { 'traces/run.ndjson': { tier: 'nightly', expect: 'pass' } } },
    });
    write('packages/d/specs/mutants.json', []);
    write('packages/d/specs/lean/expected.json', leanExpected);

    expect(await inferredTargets(['packages/d/specs/expected.json', 'packages/d/specs/lean/expected.json'])).toEqual({
      'packages/d': ['formal', 'formal:lean'],
    });
  });

  it('should emit empty targets so nx.json targetDefaults stay the one source of their configuration', async () => {
    write('packages/e/project.json', { name: 'e' });
    write('packages/e/specs/expected.json', tlaExpected);
    const context = { workspaceRoot, nxJsonConfiguration: {} } as unknown as CreateNodesContextV2;

    const results = await createNodesV2[1](['packages/e/specs/expected.json'], {}, context);

    expect(results).toEqual([
      ['packages/e/specs/expected.json', { projects: { 'packages/e': { targets: { formal: {} } } } }],
    ]);
  });
});
