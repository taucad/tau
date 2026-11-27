import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import { createProjectGraphAsync, readCachedProjectGraph } from '@nx/devkit';
import type { ProjectGraph, TargetConfiguration } from '@nx/devkit';
import { outcomeDirectory, outcomeFileName } from '@taucad/vitest-ci/outcome-reporter';
import { describe, expect, it } from 'vitest';

/*
 * Every Vitest config reports through `testReporters` (`@taucad/vitest-ci`), whose outcome recorder writes
 * `out/test-results/<project>/<target>.outcomes.jsonl` (CI flake quarantine blueprint, FQ-1). A cached target must
 * declare that file as an output, or a cache replay restores the task's verdict without its rows and the ledger
 * loses those executions. `test` takes it from `nx.json` target defaults; a cacheable target with another name that
 * runs Vitest declares its own. A Vitest command that resolves no reporting config writes no rows at all, whatever
 * its outputs say: `ui-e2e:test:e2e:service-worker` ran from the workspace root with `--dir` and no `--config`, found
 * no config there, and its shadow row uploaded nothing.
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

/** The config file names Vitest looks for in its root when no `--config` names one, in its order. */
const configNames = ['vitest.config', 'vite.config'].flatMap((name) =>
  ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs'].map((extension) => `${name}.${extension}`),
);

/**
 * Whether a config reports through `testReporters`: it calls it, or it sets no `reporters` and spreads or merges a
 * sibling config (`./vitest.config.js`) that does.
 */
const reportsOutcomes = (file: string, seen = new Set<string>()): boolean => {
  if (seen.has(file) || !existsSync(file)) {
    return false;
  }
  seen.add(file);
  const text = readFileSync(file, 'utf8');
  if (/\btestReporters\(/u.test(text)) {
    return true;
  }
  if (/\breporters\s*:/u.test(text)) {
    return false;
  }
  return [...text.matchAll(/from\s+'(\.{1,2}\/[^']*config[^']*)'/gu)].some(([, specifier = '']) =>
    reportsOutcomes(resolve(dirname(file), specifier.replace(/\.js$/u, '.ts')), seen),
  );
};

/** The value of a `--flag value` or `--flag=value` option among a command's arguments. */
const optionValue = (words: readonly string[], flags: readonly string[]): string | undefined => {
  for (const [index, word] of words.entries()) {
    if (flags.includes(word)) {
      return words[index + 1];
    }
    const flag = flags.find((candidate) => word.startsWith(`${candidate}=`));
    if (flag !== undefined) {
      return word.slice(flag.length + 1);
    }
  }
  return undefined;
};

/**
 * The config each `vitest` invocation in a shell command loads, as Vitest resolves it: `--config` against the root,
 * else the first config file in the root, where the root is `--root` against the working directory (`pnpm --dir`
 * moves that), else the working directory. `undefined` when it finds none.
 */
const vitestConfigs = (command: string, cwd: string): Array<string | undefined> =>
  command
    .split(/&&|\|\||[;|\n]/u)
    .map((segment) => segment.trim().split(/\s+/u))
    .filter((words) => words.some((word) => basename(word) === 'vitest'))
    .map((words) => {
      const at = words.findIndex((word) => basename(word) === 'vitest');
      const before = words.slice(0, at);
      const after = words.slice(at + 1);
      const directory = resolve(cwd, optionValue(before, ['--dir', '-C']) ?? '.');
      const vitestRoot = resolve(directory, optionValue(after, ['--root', '-r']) ?? '.');
      const config = optionValue(after, ['--config', '-c']);
      return config === undefined
        ? configNames.map((name) => resolve(vitestRoot, name)).find((file) => existsSync(file))
        : resolve(vitestRoot, config);
    });

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

  it('runs every Vitest command of every target under a config that reports through testReporters', async () => {
    const graph = await projectGraph();
    const unreported: string[] = [];
    let checked = 0;
    for (const [project, node] of Object.entries(graph.nodes)) {
      for (const [name, target] of Object.entries(node.data.targets ?? {})) {
        const options = (target.options ?? {}) as { readonly cwd?: unknown };
        const cwd = resolve(
          root,
          (typeof options.cwd === 'string' ? options.cwd : '{workspaceRoot}')
            .replace('{workspaceRoot}', root)
            .replace('{projectRoot}', node.data.root),
        );
        for (const config of vitestConfigs(commandText(target), cwd)) {
          checked += 1;
          if (config === undefined || !reportsOutcomes(config)) {
            unreported.push(`${project}:${name} (${config === undefined ? 'no config' : relative(root, config)})`);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
    expect(unreported).toEqual([]);
  });

  it('resolves the config a Vitest command loads as Vitest does', () => {
    const ui = resolve(root, 'apps/ui-e2e');
    expect(vitestConfigs('vitest run --dir apps/ui-e2e src/a.test.ts --environment=node', root)).toEqual([undefined]);
    expect(
      vitestConfigs(
        'pnpm exec nx run ui:build\nvitest run --config apps/ui-e2e/vitest.node.config.ts src/a.test.ts',
        root,
      ),
    ).toEqual([resolve(ui, 'vitest.node.config.ts')]);
    expect(vitestConfigs('pnpm --dir ../.. exec vitest run --config=apps/ui-e2e/vitest.config.ts', ui)).toEqual([
      resolve(ui, 'vitest.config.ts'),
    ]);
    expect(vitestConfigs('vitest run --root apps/ui-e2e src/a.test.ts && node done.js', root)).toEqual([
      resolve(ui, 'vitest.config.ts'),
    ]);
    expect(vitestConfigs('node tools/formal/src/cli.ts nightly', root)).toEqual([]);
  });

  it('counts a config that spreads a reporting sibling and sets no reporters of its own', () => {
    expect(reportsOutcomes(resolve(root, 'apps/desktop-e2e/vitest.record-recovery.config.ts'))).toBe(true);
    expect(reportsOutcomes(resolve(root, 'apps/ui-e2e/vitest.node.config.ts'))).toBe(true);
    expect(reportsOutcomes(resolve(root, 'apps/ui-e2e/src/service-worker.test.ts'))).toBe(false);
  });
});
