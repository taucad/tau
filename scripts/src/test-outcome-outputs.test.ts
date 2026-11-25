import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createProjectGraphAsync, readCachedProjectGraph } from '@nx/devkit';
import type { ProjectGraph, TargetConfiguration } from '@nx/devkit';
import { outcomeDirectory, outcomeFileName } from '@taucad/vitest-ci/outcome-reporter';
import { describe, expect, it } from 'vitest';

/*
 * Every Vitest config reports through `testReporters` (`@taucad/vitest-ci`), whose outcome recorder writes
 * `out/test-results/<project>/<target>.outcomes.jsonl` (CI flake quarantine blueprint, FQ-1). A cached target must
 * declare that file as an output, or a cache replay restores the task's verdict without its rows and the ledger
 * loses those executions. `test` takes it from `nx.json` target defaults; a cacheable target with another name that
 * runs Vitest declares its own.
 */

const root = resolve(import.meta.dirname, '../..');

const projectGraph = async (): Promise<ProjectGraph> => {
  try {
    return readCachedProjectGraph();
  } catch {
    return createProjectGraphAsync();
  }
};

/** The output a target running Vitest declares for its outcome rows. */
const outcomeOutput = (target: string): string =>
  `{workspaceRoot}/${outcomeDirectory}/{projectName}/${outcomeFileName(target)}`;

type CommandOptions = { readonly command?: unknown; readonly commands?: readonly unknown[] };

/** The command of a run-commands entry written as an object. */
const commandOf = (entry: unknown): string => {
  const { command } = entry as { command?: unknown };
  return typeof command === 'string' ? command : '';
};

/** The shell text a run-commands target executes. */
const commandText = (target: TargetConfiguration): string => {
  const options = (target.options ?? {}) as CommandOptions;
  const commands = (options.commands ?? []).map((entry) => (typeof entry === 'string' ? entry : commandOf(entry)));
  return [typeof options.command === 'string' ? options.command : '', ...commands].join('\n');
};

const runsVitest = (name: string, target: TargetConfiguration): boolean =>
  /(?:^|[\s/;&|(])vitest(?:\s|$)/mu.test(commandText(target)) ||
  (target.executor === 'nx:run-script' && name === 'test');

describe('test outcome outputs', () => {
  it('declares the outcome file of every `test` target in nx.json target defaults', () => {
    const nx = JSON.parse(readFileSync(resolve(root, 'nx.json'), 'utf8')) as {
      readonly targetDefaults: Record<string, { readonly outputs?: readonly string[] }>;
    };
    expect(nx.targetDefaults['test']?.outputs).toContain(outcomeOutput('test'));
  });

  it('declares the outcome file of every cacheable target that runs Vitest', async () => {
    const graph = await projectGraph();
    const missing: string[] = [];
    let checked = 0;
    for (const [project, node] of Object.entries(graph.nodes)) {
      for (const [name, target] of Object.entries(node.data.targets ?? {})) {
        if (target.cache !== true || !runsVitest(name, target)) {
          continue;
        }
        checked += 1;
        if (!(target.outputs ?? []).includes(outcomeOutput(name))) {
          missing.push(`${project}:${name} (declare "${outcomeOutput(name)}")`);
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
    expect(missing).toEqual([]);
  });
});
