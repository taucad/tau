import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

/*
 * ST-3 (lane budget, operator approval 2026-11-18): agent-host's mutant matrix leaves its
 * `formal:nightly` job for a `formal:nightly:mutants` tier of `MUTANT_SHARDS` jobs. Each job re-runs the
 * same-seed simulation and runs `formal nightly --mutants-only --shard k/N`: the shards deal every mutant
 * by measured seconds, a control with its mutants, so all of them together run each mutant once
 * (tools/formal/src/mutant-shard.test.ts). The caller's required check reads the called workflow's
 * result, which fails when any shard fails.
 */

const root = resolve(import.meta.dirname, '../..');

type Step = {
  readonly id?: string;
  readonly run?: string;
  readonly env?: Record<string, string | number>;
};
type Job = {
  readonly name?: string;
  readonly uses?: string;
  readonly with?: Record<string, string>;
  readonly strategy?: { readonly 'fail-fast'?: boolean };
  readonly steps?: readonly Step[];
};
type TargetConfig = {
  readonly cache?: boolean;
  readonly options?: { readonly command?: string };
};

const workflow = load(readFileSync(resolve(root, '.github/workflows/formal-nightly.yml'), 'utf8')) as {
  readonly jobs: Record<string, Job>;
};
const list = workflow.jobs['projects']?.steps?.find((step) => step.id === 'list');
const tier = workflow.jobs['formal-nightly'];
const run = tier?.steps?.find((step) => step.run?.includes('nx run-many'));
const nx = JSON.parse(readFileSync(resolve(root, 'nx.json'), 'utf8')) as {
  readonly targetDefaults: Record<string, TargetConfig>;
};

/** Every project with its targets, from `project.json` files under apps, libs and packages. */
const projectTargets = (): Array<{
  readonly root: string;
  readonly targets: Record<string, TargetConfig>;
}> => {
  const walk = (directory: string, depth: number): string[] =>
    depth === 0 || !existsSync(directory)
      ? []
      : readdirSync(directory, { withFileTypes: true })
          .filter((entry) => entry.isDirectory() && entry.name !== 'node_modules')
          .flatMap((entry) => {
            const child = resolve(directory, entry.name);
            return [...(existsSync(resolve(child, 'project.json')) ? [child] : []), ...walk(child, depth - 1)];
          });
  return ['apps', 'libs', 'packages'].flatMap((base) =>
    walk(resolve(root, base), 3).map((project) => ({
      root: project.slice(root.length + 1),
      targets:
        (
          JSON.parse(readFileSync(resolve(project, 'project.json'), 'utf8')) as {
            readonly targets?: Record<string, TargetConfig>;
          }
        ).targets ?? {},
    })),
  );
};

describe('formal nightly mutant shards', () => {
  it('should list the formal:nightly:mutants tier as three shards, each with its own name and slug', () => {
    expect(list?.env?.['MUTANT_SHARDS']).toBe(3);
    expect(list?.run).toContain('if [ "$target" = formal:nightly:mutants ]; then shards=$MUTANT_SHARDS; fi');
    expect(tier?.name).toBe(
      `Formal nightly tiers (\${{ matrix.tier.project }} \${{ matrix.tier.target }}\${{ matrix.tier.shard && format(' {0}', matrix.tier.shard) || '' }})`,
    );
    expect(tier?.strategy?.['fail-fast']).toBe(false);
  });

  it("should deal the tier list's jq into one row per shard and one per unsharded tier", () => {
    const filter = /--argjson shards "\$shards" \\\n\s*'([\s\S]*?)' <<< "\$tiers"/u.exec(list?.run ?? '')?.[1];
    expect(filter).toBeDefined();
    const rows = (target: string, shards: number): unknown =>
      JSON.parse(
        execFileSync(
          'jq',
          [
            '-c',
            '--arg',
            'target',
            target,
            '--argjson',
            'projects',
            '["agent-host","revisions"]',
            '--argjson',
            'requested',
            '["agent-host"]',
            '--argjson',
            'shards',
            String(shards),
            filter ?? '',
          ],
          { input: '[]', encoding: 'utf8' },
        ),
      );

    expect(rows('formal:nightly:mutants', 3)).toEqual(
      [1, 2, 3].map((index) => ({
        project: 'agent-host',
        target: 'formal:nightly:mutants',
        shard: `${String(index)}/3`,
        slug: `agent-host-formal-nightly-mutants-${String(index)}-of-3`,
      })),
    );
    expect(rows('formal:nightly', 1)).toEqual([
      {
        project: 'agent-host',
        target: 'formal:nightly',
        shard: '',
        slug: 'agent-host-formal-nightly',
      },
    ]);
  });

  it("should pass a shard's k/N to the formal runner and nothing to an unsharded tier", () => {
    expect(run?.env?.['SHARD']).toBe(`\${{ matrix.tier.shard }}`);
    expect(run?.run).toContain('if [ -n "$SHARD" ]; then shard=(--shard="$SHARD"); fi');
    expect(run?.run).toContain(`--outputStyle=stream "\${shard[@]}"`);
  });

  it('should run the mutants uncached, with their same-seed simulation, through formal nightly --mutants-only', () => {
    expect(nx.targetDefaults['formal:nightly:mutants']).toEqual({
      executor: 'nx:run-commands',
      options: {
        command: 'node tools/formal/src/cli.ts nightly --mutants-only {projectRoot}',
      },
      cache: false,
    });
  });

  it('should run every mutant matrix in exactly one tier: inline, or in formal:nightly:mutants', () => {
    const projects = projectTargets().filter((project) => 'formal:nightly' in project.targets);
    const nightlyCommand = (targets: Record<string, TargetConfig>): string =>
      targets['formal:nightly']?.options?.command ?? nx.targetDefaults['formal:nightly']?.options?.command ?? '';
    const split = projects
      .filter((project) => 'formal:nightly:mutants' in project.targets)
      .map((project) => project.root);
    const withoutMutants = projects
      .filter((project) => nightlyCommand(project.targets).includes('--without-mutants'))
      .map((project) => project.root);

    expect(split).toEqual(['packages/agent-host']);
    expect(withoutMutants).toEqual(split);
  });

  it("should fail the queue's required check when any tier job fails", () => {
    const ci = load(readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8')) as {
      readonly jobs: Record<string, Job & { readonly steps?: readonly Step[] }>;
    };
    expect(ci.jobs['formal-nightly']?.uses).toBe('./.github/workflows/formal-nightly.yml');
    const required = Object.values(ci.jobs).flatMap((job) => job.steps ?? []);
    expect(required.some((step) => step.env?.['FORMAL_NIGHTLY_RESULT'] === `\${{ needs.formal-nightly.result }}`)).toBe(
      true,
    );
  });
});
