import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CreateNodesContextV2 } from '@nx/devkit';
import { createNodesV2 } from '../../tools/tsgo.plugin.js';

/**
 * The typecheck target has to report every tsconfig it checks.
 *
 * Two shapes have already failed this. `&&` short-circuits, so while the app
 * config had any error the spec config never ran and an entire test suite's
 * type errors stayed invisible. Nx's `parallel: true` fails the same way for a
 * different reason — `ParallelRunningTasks` terminates sibling processes as
 * soon as one exits non-zero, truncating the other's diagnostics mid-print.
 *
 * 29 projects in this workspace pair an app/lib config with a spec config, so
 * either shape hides test-suite errors workspace-wide.
 */

const workspaceRoot = fileURLToPath(new URL('../../', import.meta.url));

const context = {
  workspaceRoot,
  nxJsonConfiguration: { namedInputs: {} },
} as unknown as CreateNodesContextV2;

type TypecheckOptions = {
  command?: string;
  commands?: string[];
  parallel?: boolean;
};

const typecheckOptionsFor = async (tsConfigPath: string, projectRoot: string): Promise<TypecheckOptions> => {
  const results = await createNodesV2[1]([tsConfigPath], {}, context);
  const target = results[0]?.[1].projects?.[projectRoot]?.targets?.['typecheck'];
  if (!target) {
    throw new Error(`No typecheck target produced for ${projectRoot}.`);
  }
  return target.options as TypecheckOptions;
};

describe('tsgo plugin typecheck target', () => {
  it('should run the spec config even when the app config fails', async () => {
    const { command, parallel } = await typecheckOptionsFor('apps/api/tsconfig.json', 'apps/api');

    expect(command).toContain('tsgo -p tsconfig.app.json');
    expect(command).toContain('tsgo -p tsconfig.spec.json');
    // Neither short-circuiting shape: no `&&` between the checks, and no
    // reliance on nx's parallel mode, which kills siblings on first failure.
    expect(command).not.toContain('&&');
    expect(parallel).toBeUndefined();
    // The app check's failure is recorded and deferred, not propagated early.
    expect(command).toMatch(/tsgo -p tsconfig\.app\.json[^;]*\|\| status=1;/u);
    expect(command).toMatch(/exit \$\{status:-0\}$/u);
  });

  it('should short-circuit for no project in the workspace', async () => {
    const roots = readdirSync(workspaceRoot)
      .filter((group) => ['apps', 'libs', 'packages'].includes(group))
      .flatMap((group) =>
        readdirSync(join(workspaceRoot, group))
          .map((name) => `${group}/${name}`)
          .filter((root) => existsSync(join(workspaceRoot, root, 'tsconfig.json'))),
      );
    expect(roots.length).toBeGreaterThan(20);

    const shortCircuiting: string[] = [];
    let checked = 0;
    for (const root of roots) {
      // oxlint-disable-next-line no-await-in-loop -- plugin calls are filesystem stats, not worth the parallelism.
      const results = await createNodesV2[1]([`${root}/tsconfig.json`], {}, context);
      // Projects with no app/lib config (e.g. e2e harnesses) get no target.
      const command = results[0]?.[1].projects?.[root]?.targets?.['typecheck']?.options?.command as string | undefined;
      if (command === undefined) {
        continue;
      }
      checked += 1;
      if (command.includes('&&')) {
        shortCircuiting.push(root);
      }
    }

    expect(checked).toBeGreaterThan(20);
    expect(shortCircuiting).toEqual([]);
  });
});
