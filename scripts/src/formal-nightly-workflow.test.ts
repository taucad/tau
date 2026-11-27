import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

/*
 * The formal nightly runs one job per project with a `formal:nightly` target, each with its own
 * 120-minute budget (CI throughput review, Q-4): one serial job of every project ran out of its 60
 * minutes on each scheduled run of 2026-11-07 to 2026-11-11 (the schedule is now retired), and `agent-host` alone took 55 on its own job. The project list comes from Nx, so a new
 * owner's target joins the matrix without a workflow edit, and an empty list fails rather than passes.
 * A project with a `formal:nightly:check` target runs its nightly configs and Apalache in a job of
 * their own, so the matrix is one job per project and target.
 */

const root = resolve(import.meta.dirname, '../..');

type Step = {
  readonly name?: string;
  readonly id?: string;
  readonly run?: string;
  readonly uses?: string;
  readonly if?: string;
  readonly env?: Record<string, string>;
  readonly with?: Record<string, unknown>;
};
type Job = {
  readonly needs?: string | readonly string[];
  readonly 'timeout-minutes'?: number;
  readonly outputs?: Record<string, string>;
  readonly strategy?: { readonly 'fail-fast'?: boolean; readonly matrix?: Record<string, unknown> };
  readonly steps?: readonly Step[];
};
type Workflow = {
  readonly on: Record<string, unknown>;
  readonly concurrency?: Record<string, unknown>;
  readonly jobs: Record<string, Job>;
};

const workflow = load(readFileSync(resolve(root, '.github/workflows/formal-nightly.yml'), 'utf8')) as Workflow;
const list = workflow.jobs['projects'];
const shard = workflow.jobs['formal-nightly'];

describe('formal nightly workflow', () => {
  it('should have no schedule, keep its dispatch, run one at a time, and be callable by the queue and the gate', () => {
    // FN-RETIRE: the release gate runs the whole formal matrix uncached, three times a day and on every desktop
    // candidate, so the 03:41 nightly is retired (§ 5b of the program's handoff).
    expect(Object.keys(workflow.on).sort()).toEqual(['workflow_call', 'workflow_dispatch']);
    expect(workflow.on).not.toHaveProperty('schedule');
    const call = workflow.on['workflow_call'] as { readonly inputs?: Record<string, unknown> };
    expect(Object.keys(call.inputs ?? {}).sort()).toEqual(['projects', 'ref', 'seed', 'uncached']);
    // Dispatches share one group; a caller (the queue, the release gate) passes `ref`.
    expect(workflow.concurrency).toEqual({
      group: `formal-nightly\${{ inputs.ref && format('-{0}-{1}', inputs.ref, github.run_id) || '' }}`,
      'cancel-in-progress': false,
    });
  });

  it('should list the projects of each nightly target from Nx and fail on an empty list', () => {
    const step = list?.steps?.find((candidate) => candidate.id === 'list');
    expect(step?.run).toContain('pnpm nx show projects --with-target formal:nightly --json | tail -1');
    expect(step?.run).toContain('exit 1');
    expect(step?.run).toContain('for target in formal:nightly formal:nightly:check formal:nightly:mutants; do');
    expect(step?.run).toContain('pnpm nx show projects --with-target "$target" --json | tail -1');
    expect(list?.outputs?.['tiers']).toBe(`\${{ steps.list.outputs.tiers }}`);
  });

  it('should run one job per project and target, each with its own 120-minute budget', () => {
    expect(shard?.needs).toBe('projects');
    expect(shard?.['timeout-minutes']).toBe(120);
    expect(shard?.strategy?.['fail-fast']).toBe(false);
    expect(shard?.strategy?.matrix?.['tier']).toBe(`\${{ fromJSON(needs.projects.outputs.tiers) }}`);
  });

  it('should run only its own project and target, streamed, with every formal toolchain', () => {
    const setup = shard?.steps?.find((step) => step.uses === './.github/actions/setup-formal');
    expect(setup?.with?.['tools']).toBe('tlc,lean,apalache');
    const run = shard?.steps?.find((step) => step.run?.includes('nx run-many'));
    expect(run?.env?.['PROJECT']).toBe(`\${{ matrix.tier.project }}`);
    expect(run?.env?.['TARGET']).toBe(`\${{ matrix.tier.target }}`);
    expect(run?.run).toContain('pnpm nx run-many -t "$TARGET" --projects "$PROJECT" --parallel=1 --outputStyle=stream');
  });

  it("should upload each tier's reports under its own artifact name, after a failure too", () => {
    const upload = shard?.steps?.find((step) => step.uses?.startsWith('actions/upload-artifact@'));
    expect(upload?.uses).toMatch(/^actions\/upload-artifact@[\da-f]{40}$/u);
    expect(upload?.if).toBe('always()');
    expect(upload?.with?.['name']).toBe(`formal-nightly-reports-\${{ matrix.tier.slug }}`);
  });

  it('should run the wide tier on a dispatch only, never on a call', () => {
    expect((workflow.jobs['formal-wide'] as { readonly if?: string } | undefined)?.if).toBe(
      `\${{ github.event_name == 'workflow_dispatch' && !inputs.ref }}`,
    );
  });
});

/*
 * Speed (CI throughput review, formal speed, 2026-11-17). A `formal:nightly:check` tier runs as `CHECK_SHARDS`
 * jobs, each `formal check --shard k/N`: every shard plans every run and deals them by measured seconds, so the
 * shards partition the runs (tools/formal/src/shard.test.ts) and the caller's required check needs each one.
 * The tier is Nx-cached: its configs and Apalache commands read no seed, no environment and no file outside
 * `specs/`, so the inputs below decide the verdict. Only the merge queue's call reads and writes that cache.
 */
describe('formal nightly check shards and cache', () => {
  type CallerJob = { readonly uses?: string; readonly secrets?: unknown };
  const callers = (file: string): CallerJob[] =>
    Object.values(
      (load(readFileSync(resolve(root, file), 'utf8')) as { readonly jobs: Record<string, CallerJob> }).jobs,
    ).filter((job) => job.uses === './.github/workflows/formal-nightly.yml');
  const nx = JSON.parse(readFileSync(resolve(root, 'nx.json'), 'utf8')) as {
    readonly targetDefaults: Record<string, { readonly cache?: boolean }>;
  };

  it('should run a formal:nightly:check tier as four shards, each named and uploaded on its own', () => {
    const step = list?.steps?.find((candidate) => candidate.id === 'list');
    expect(step?.env?.['CHECK_SHARDS']).toBe(4);
    expect(step?.run).toContain(
      'if [ "$target" = formal:nightly:check ] && [ -f tools/formal/run-seconds.json ]; then shards=$CHECK_SHARDS; fi',
    );
    expect(step?.run).toContain('range(1; $shards + 1)');
    expect(step?.run).toContain(String.raw`shard: (if $shards > 1 then "\($index)/\($shards)" else "" end)`);
    expect(step?.run).toContain(String.raw`(if $shards > 1 then "-\($index)-of-\($shards)" else "" end)`);
    const run = shard?.steps?.find((candidate) => candidate.run?.includes('nx run-many'));
    expect(run?.env?.['SHARD']).toBe(`\${{ matrix.tier.shard }}`);
    expect(run?.run).toContain('if [ -n "$SHARD" ]; then shard=(--shard="$SHARD"); fi');
    expect(run?.run).toContain(`--outputStyle=stream "\${shard[@]}"`);
  });

  it("should write the Nx cache only in main's merge queue, which passes the read token alone", () => {
    expect((shard as { readonly environment?: string } | undefined)?.environment).toBe(
      `\${{ (github.event_name == 'merge_group' && startsWith(github.ref, 'refs/heads/gh-readonly-queue/main/')) && 'nx-cache-write' || null }}`,
    );
    const call = workflow.on['workflow_call'] as { readonly secrets?: Record<string, { readonly required?: boolean }> };
    expect(call.secrets?.['NX_SELF_HOSTED_REMOTE_CACHE_ACCESS_TOKEN']?.required).toBe(false);
    expect(callers('.github/workflows/ci.yml').map((job) => job.secrets)).toEqual([
      // eslint-disable-next-line @typescript-eslint/naming-convention -- secret name
      { NX_SELF_HOSTED_REMOTE_CACHE_ACCESS_TOKEN: `\${{ secrets.NX_SELF_HOSTED_REMOTE_CACHE_ACCESS_TOKEN }}` },
    ]);
    // The release gate passes no token, so its formal matrix always checks afresh.
    expect(callers('.github/workflows/release-gate.yml').map((job) => job.secrets)).toEqual([undefined]);
  });

  it('should cache formal:nightly:check on its specs, the formal runner, the run seconds and the toolchain', () => {
    expect(nx.targetDefaults['formal:nightly:check']).toMatchObject({
      cache: true,
      inputs: [
        '{projectRoot}/specs/**/*',
        '!{projectRoot}/specs/lean/**/*',
        '{projectRoot}/src/**/*.json',
        '{workspaceRoot}/tools/formal/src/**/*',
        '{workspaceRoot}/tools/formal/toolchain.lock',
        '{workspaceRoot}/tools/formal/run-seconds.json',
        { runtime: 'node tools/formal/src/cli.ts toolchain-id' },
      ],
      outputs: ['{workspaceRoot}/out/reports/formal/{projectRoot}/nightly'],
    });
    // `formal:nightly` stays per commit: its seed is the landing commit's.
    expect(nx.targetDefaults['formal:nightly']?.cache).toBe(false);
  });

  it('should check only modules under specs/ that read no seed, environment or file in a nightly check', () => {
    const owners = ['apps', 'libs', 'packages'].flatMap((base) =>
      readdirSync(resolve(root, base), { withFileTypes: true })
        .map((entry) => resolve(root, base, entry.name))
        .filter((project) => existsSync(resolve(project, 'project.json')))
        .filter((project) => {
          const { targets = {} } = JSON.parse(readFileSync(resolve(project, 'project.json'), 'utf8')) as {
            readonly targets?: Record<string, unknown>;
          };
          return 'formal:nightly:check' in targets;
        }),
    );
    expect(owners.map((owner) => owner.slice(root.length + 1))).toEqual(['packages/agent-host']);
    // The standard and community modules ship in the pinned jars, which `toolchain-id` names.
    const shipped = ['FiniteSets', 'FiniteSetsExt', 'Integers', 'Naturals', 'Sequences', 'SequencesExt', 'TLC'];
    const reads =
      /\b(?:IOEnv|IOExec|IOEnvExec|JsonDeserialize|ndJsonDeserialize|CSVRead|RandomElement|RandomSubset|RandomSetOfSubsets|TLCGet|TLCSet)\b/u;
    /** The modules a module EXTENDS or INSTANCEs. */
    const importsOf = (text: string): string[] =>
      [
        ...[...text.matchAll(/EXTENDS([^\n]*)/gu)].flatMap((match) =>
          (match[1] ?? '').split(',').map((name) => name.trim()),
        ),
        ...[...text.matchAll(/INSTANCE\s+(\w+)/gu)].map((match) => match[1] ?? ''),
      ].filter(Boolean);
    const source = (file: string): string =>
      readFileSync(file, 'utf8')
        .replaceAll(/\(\*[\s\S]*?\*\)/gu, '')
        .replaceAll(/\\\*.*$/gmu, '');
    for (const owner of owners) {
      const expected = JSON.parse(readFileSync(resolve(owner, 'specs/expected.json'), 'utf8')) as {
        readonly configs?: Record<string, { readonly tier: string }>;
        readonly apalache?: ReadonlyArray<{ readonly tier: string; readonly args: readonly string[] }>;
      };
      const pending = [
        ...Object.entries(expected.configs ?? {})
          .filter(([, value]) => value.tier === 'nightly')
          .map(([config]) => config.split('.')[0] ?? config),
        ...(expected.apalache ?? [])
          .filter((entry) => entry.tier === 'nightly')
          .map((entry) => (entry.args.at(-1) ?? '').replace(/\.tla$/u, '')),
      ];
      expect(pending.length).toBeGreaterThan(0);
      const seen = new Set<string>();
      for (let module = pending.pop(); module !== undefined; module = pending.pop()) {
        const file = resolve(owner, 'specs', `${module}.tla`);
        if (seen.has(module)) {
          continue;
        }
        seen.add(module);
        if (!existsSync(file)) {
          expect(shipped, `${module} is neither in specs/ nor a pinned standard or community module`).toContain(module);
          continue;
        }
        const text = source(file);
        expect(text, `${module}.tla reads a seed, the environment or a file`).not.toMatch(reads);
        pending.push(...importsOf(text));
      }
    }
  });
});
