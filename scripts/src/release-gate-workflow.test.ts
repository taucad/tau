import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

/* eslint-disable @typescript-eslint/naming-convention -- Process environment keys and GitHub API fields are exact external names. */

/*
 * The release gate (CI throughput review RG-1): an uncached sweep of every project, the formal matrix with a
 * fresh seed and the cross-root read lint, on the exact commit being shipped. It starts by itself when
 * `release-build.yml` is requested for a tag and records one verdict per commit. The desktop promotion and
 * production forward deploys only read that verdict (never run or wait for the gate); a renewal, a rollback
 * and a redeploy do not read it. Only verdicts from `main`'s copy of the gate count.
 */

const root = resolve(import.meta.dirname, '../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');
const expression = (body: string): string => ['$', '{{ ', body, ' }}'].join('');

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
  readonly name?: string;
  readonly needs?: string | readonly string[];
  readonly if?: string;
  readonly uses?: string;
  readonly with?: Record<string, unknown>;
  readonly outputs?: Record<string, string>;
  readonly permissions?: Record<string, string>;
  readonly strategy?: {
    readonly 'fail-fast'?: boolean | string;
    readonly matrix?: { readonly lane?: readonly string[]; readonly suite?: string };
  };
  readonly env?: Record<string, string>;
  readonly steps?: readonly Step[];
};
type Workflow = {
  readonly on: Record<
    string,
    { readonly inputs?: Record<string, { type?: string; required?: boolean; default?: unknown }> }
  >;
  readonly permissions?: Record<string, string>;
  readonly env?: Record<string, string>;
  readonly concurrency?: unknown;
  readonly jobs: Record<string, Job>;
};

const gateText = read('.github/workflows/release-gate.yml');
const gate = load(gateText) as Workflow;
const actionText = read('.github/actions/release-gate-verdict/action.yml');
const action = load(actionText) as { readonly runs: { readonly steps: readonly Step[] } };
const promotion = load(read('.github/workflows/desktop-route-promotion.yml')) as Workflow;
const production = load(read('.github/workflows/deploy-production.yml')) as Workflow;
const sha = 'a'.repeat(40);
/** The gated commit, as every name and the `reuse` job read it. */
const gatedCommit = expression('inputs.ref || github.event.workflow_run.head_sha || github.sha');
const uncachedJobIf = "needs.reuse.result == 'success' && needs.reuse.outputs.run-id == ''";
const gatedCheckout = { ref: expression('needs.reuse.outputs.ref'), 'persist-credentials': false };
const stepNamed = (job: Job, name: string): Step | undefined => job.steps?.find((step) => step.name === name);
const stepUsing = (job: Job, action: string): Step | undefined =>
  job.steps?.find((step) => step.uses?.startsWith(action) === true);

describe('release-gate.yml', () => {
  it('should start on a requested release build, on a dispatch and on a schedule, named by its commit', () => {
    expect(Object.keys(gate.on).toSorted()).toEqual(['schedule', 'workflow_dispatch', 'workflow_run']);
    expect(gate.on['workflow_dispatch']?.inputs?.['ref']).toMatchObject({ type: 'string', required: true });
    expect(Object.keys(gate.on['workflow_dispatch']?.inputs ?? {})).toEqual(['ref']);
    expect(gate.on['workflow_run']).toEqual({ workflows: ['Release build'], types: ['requested'] });
    expect((gate as unknown as { 'run-name': string })['run-name']).toBe(`Release gate ${gatedCommit}`);
  });

  it("should run on main's head three times a day, at off-peak minutes clear of :00, :30 and 06:00 to 09:00 Pacific", () => {
    const crons = (gate.on['schedule'] as unknown as ReadonlyArray<{ readonly cron: string }>).map(
      (entry) => entry.cron,
    );
    expect(crons).toHaveLength(3);
    for (const cron of crons) {
      const [minute, hour, ...rest] = cron.split(' ');
      expect(rest, cron).toEqual(['*', '*', '*']);
      expect(Number(minute), cron).not.toBe(0);
      expect(Number(minute), cron).not.toBe(30);
      // 06:00 to 09:00 Pacific is 13:00 to 16:59 UTC across both daylight-saving states.
      expect([13, 14, 15, 16], cron).not.toContain(Number(hour));
    }
    expect(new Set(crons.map((cron) => cron.split(' ')[1])).size).toBe(3);
  });

  it('should gate only desktop candidates at the event, the newest per channel, and queue dispatches per commit', () => {
    const { group, 'cancel-in-progress': cancel } = gate.concurrency as { group: string; 'cancel-in-progress': string };
    const flat = group.replaceAll(/\s+/gu, ' ');
    expect(flat).toContain(
      "startsWith(github.event.workflow_run.head_branch, 'desktop-staging@') && 'release-gate-candidate-staging'",
    );
    expect(flat).toContain(
      "startsWith(github.event.workflow_run.head_branch, 'desktop@') && 'release-gate-candidate-production'",
    );
    // Any other tag's run cancels nothing, and a dispatch never shares a candidate's group.
    expect(flat).toContain("format('release-gate-other-{0}', github.run_id)");
    expect(flat).toContain("|| format('release-gate-{0}', inputs.ref)");
    // A scheduled run has a group of its own (never a candidate's, never a dispatch's) and cancels nothing.
    expect(flat).toContain(
      "format('release-gate-other-{0}', github.run_id)) || github.event_name == 'schedule' && 'release-gate-scheduled' || format('release-gate-{0}', inputs.ref)",
    );
    expect(cancel).toBe(expression("github.event_name == 'workflow_run'"));
    // A UI or API tag runs no job; the verdict is skipped with it.
    expect(gate.jobs['reuse']?.if?.replaceAll(/\s+/gu, ' ').trim()).toBe(
      "github.event_name == 'workflow_dispatch' || github.event_name == 'schedule' || startsWith(github.event.workflow_run.head_branch, 'desktop-staging@') || startsWith(github.event.workflow_run.head_branch, 'desktop@')",
    );
    expect(gate.jobs['verdict']?.if).toBe(expression("!cancelled() && needs.reuse.result != 'skipped'"));
  });

  it('should give the sweep the service addresses ci.yml gives its lanes', () => {
    const ci = load(read('.github/workflows/ci.yml')) as Workflow;
    const keys = ['TAU_API_URL', 'TAU_WEBSOCKET_URL', 'TAU_FRONTEND_URL'];
    for (const key of keys) {
      expect(gate.env?.[key], key).toBeDefined();
      expect(gate.env?.[key], key).toBe(ci.env?.[key]);
    }
  });

  it('should read no cache, local or remote', () => {
    expect(gate.env).toMatchObject({ NX_SKIP_NX_CACHE: 'true', NX_NO_CLOUD: 'true' });
    expect(Object.keys(gate.env ?? {}).filter((key) => key.startsWith('NX_'))).toEqual([
      'NX_SKIP_NX_CACHE',
      'NX_NO_CLOUD',
    ]);
    expect(gateText).not.toContain('NX_SELF_HOSTED_REMOTE_CACHE');
    expect(gateText).not.toMatch(/\bnx affected\b/u);
  });

  it("should read no secret: the only credentials are the local service containers' development values", () => {
    expect(gateText).not.toContain('secrets.');
    expect(gateText).not.toContain('secrets:');
    expect(gateText).not.toMatch(/\bsecrets\b\s*:\s*inherit/u);
    expect(gateText).not.toContain('environment:');
    const urls = new Set(gateText.match(/postgresql:\/\/\S+/gu));
    expect([...urls]).toEqual(['postgresql://dev_user:dev_password@localhost:5432/tau_dev']);
    expect(read('apps/api/.env.example')).toContain(
      'DATABASE_URL=postgresql://dev_user:dev_password@localhost:5432/tau_dev',
    );
    expect(gate.permissions).toEqual({ contents: 'read', actions: 'read' });
  });

  it('should pass uncached to every workflow it calls, which then reads no cache (defect b)', () => {
    const called = Object.entries(gate.jobs).filter(([, job]) => job.uses?.startsWith('./.github/workflows/'));
    expect(called.map(([name]) => name)).toContain('formal');
    for (const [name, job] of called) {
      expect(job.with?.['uncached'], name).toBe(true);
      expect(job, name).not.toHaveProperty('secrets');
      const calleeText = read(job.uses!.slice(2));
      const callee = load(calleeText) as Workflow;
      expect(callee.on['workflow_call']?.inputs?.['uncached']?.type, name).toBe('boolean');
    }
    // `formal-nightly.yml` sets the skip itself and drops the server and token under `uncached`; a dispatch
    // and the merge queue's call keep the remote cache.
    const formal = load(read('.github/workflows/formal-nightly.yml')) as Workflow;
    expect(formal.on['workflow_call']?.inputs?.['uncached']).toMatchObject({
      type: 'boolean',
      required: false,
      default: false,
    });
    expect(formal.env).toEqual({
      NX_SKIP_NX_CACHE: expression("inputs.uncached && 'true' || 'false'"),
      NX_SELF_HOSTED_REMOTE_CACHE_SERVER: expression(
        "!inputs.uncached && secrets.NX_SELF_HOSTED_REMOTE_CACHE_ACCESS_TOKEN != '' && vars.NX_SELF_HOSTED_REMOTE_CACHE_SERVER || ''",
      ),
      NX_SELF_HOSTED_REMOTE_CACHE_ACCESS_TOKEN: expression(
        "!inputs.uncached && secrets.NX_SELF_HOSTED_REMOTE_CACHE_ACCESS_TOKEN || ''",
      ),
    });
  });

  it('should name the gated commit once and look for its verdict before running anything', () => {
    const { reuse } = gate.jobs;
    const name = reuse?.steps?.find((step) => step.id === 'ref');
    expect(name?.env?.['REF']).toBe(gatedCommit);
    const find = reuse?.steps?.find((step) => step.id === 'find');
    expect(find?.uses).toBe('./.github/actions/release-gate-verdict');
    expect(find?.with).toEqual({
      sha: expression('steps.ref.outputs.ref'),
      'github-token': expression('github.token'),
    });
    expect(reuse?.outputs).toEqual({
      ref: expression('steps.ref.outputs.ref'),
      'run-id': expression('steps.find.outputs.run-id'),
    });
  });

  it('should sweep every project in the ci.yml lanes plus the cross-root read lint', () => {
    const { sweep } = gate.jobs;
    expect(sweep?.strategy?.matrix?.lane).toEqual([
      'lint',
      'typecheck',
      'build',
      'pkgcheck-1',
      'pkgcheck-2',
      'pkgcheck-3',
      'test-1',
      'test-2',
      'test-3',
      'cross-root-reads',
    ]);
    const checkout = sweep?.steps?.find((step) => step.uses?.startsWith('actions/checkout@'));
    expect(checkout?.with).toEqual({ ref: expression('needs.reuse.outputs.ref'), 'persist-credentials': false });
    const run = sweep?.steps?.find((step) => step.name === "Run the lane's tasks")?.run ?? '';
    expect(run).toContain('lint) pnpm nx run-many -t lint --parallel=1 ;;');
    expect(run).toContain('typecheck) pnpm nx run-many -t typecheck --parallel=1 ;;');
    expect(run).toContain('build) pnpm nx run-many -t build size check-desktop-payload --parallel=1 ;;');
    expect(run).toContain('pnpm nx run-many -t test --exclude tag:scope:api,tag:ci:quarantined');
    expect(run).toContain('cross-root-reads) pnpm nx run scripts:validate-cross-root-reads ;;');
    expect(sweep?.if).toBe("needs.reuse.result == 'success' && needs.reuse.outputs.run-id == ''");
  });

  it('should run the whole formal matrix beside the sweep, with this run id as the seed source', () => {
    const { formal } = gate.jobs;
    expect(formal?.uses).toBe('./.github/workflows/formal-nightly.yml');
    expect(formal?.needs).toEqual(['reuse']);
    expect(formal?.with).toEqual({
      ref: expression('needs.reuse.outputs.ref'),
      seed: expression('github.run_id'),
      uncached: true,
    });
    expect(formal?.if).toBe(uncachedJobIf);
  });

  describe('formal matrix on an older candidate', () => {
    /*
     * The gate calls `main`'s formal-nightly.yml, but its tiers run the candidate's formal runner. Gate run
     * 44222563188 gated 7abb090f, cut before #2560 gave the runner `--shard`, and all four agent-host check shards
     * failed on `Unknown option '--shard'`. A checkout without the run seconds runs the check tier whole.
     */
    const workflow = load(read('.github/workflows/formal-nightly.yml')) as Workflow;
    const step = workflow.jobs['projects']?.steps?.find((candidate) => candidate.id === 'list');
    /** Runs the tier list in a checkout with or without the run seconds; returns the shards of each tier. */
    const tiers = (withRunSeconds: boolean): { status: number | undefined; tiers: readonly string[] } => {
      const directory = mkdtempSync(join(tmpdir(), 'tau-release-formal-'));
      try {
        const bin = join(directory, 'bin');
        const checkout = join(directory, 'checkout');
        mkdirSync(bin);
        mkdirSync(join(checkout, 'tools/formal'), { recursive: true });
        if (withRunSeconds) {
          writeFileSync(join(checkout, 'tools/formal/run-seconds.json'), '{}');
        }
        // `nx show projects --with-target <target>`: agent-host has `formal:nightly` and `formal:nightly:check`.
        writeFileSync(
          join(bin, 'pnpm'),
          '#!/usr/bin/env bash\ncase "$5" in formal:nightly|formal:nightly:check) echo \'["agent-host"]\' ;; *) echo \'[]\' ;; esac\n',
          { mode: 0o755 },
        );
        writeFileSync(join(directory, 'output'), '');
        const result = spawnSync('bash', ['-c', step?.run ?? 'exit 1'], {
          cwd: checkout,
          encoding: 'utf8',
          env: Object.fromEntries([
            ['PATH', `${bin}:${process.env['PATH'] ?? ''}`],
            ['GITHUB_OUTPUT', join(directory, 'output')],
            ['REQUESTED', ''],
            ...Object.entries(step?.env ?? {}).filter(([name]) => name.endsWith('_SHARDS')),
          ]),
        });
        const line = readFileSync(join(directory, 'output'), 'utf8').trim();
        const listed = line
          ? (JSON.parse(line.replace(/^tiers=/u, '')) as ReadonlyArray<{ target: string; shard: string }>)
          : [];
        return {
          status: result.status ?? undefined,
          tiers: listed.map((tier) => `${tier.target} ${tier.shard}`.trim()),
        };
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    };

    it("should deal the check tier into shards when the candidate's runner has the run seconds", () => {
      expect(tiers(true)).toEqual({
        status: 0,
        tiers: [
          'formal:nightly',
          'formal:nightly:check 1/4',
          'formal:nightly:check 2/4',
          'formal:nightly:check 3/4',
          'formal:nightly:check 4/4',
        ],
      });
    });

    it('should run the check tier whole, never drop it, when the candidate predates --shard', () => {
      expect(tiers(false)).toEqual({ status: 0, tiers: ['formal:nightly', 'formal:nightly:check'] });
    });

    it('should keep the run seconds on main, so the queue and every new candidate stay sharded', () => {
      expect(read('tools/formal/run-seconds.json').length).toBeGreaterThan(0);
    });
  });

  it("should run every scope:api project's tests against ci.yml's service containers (C2a)", () => {
    const api = gate.jobs['api'] ?? {};
    // The API suites run in ci.yml's `api-shard` matrix (two Vitest halves); `api` is only the required fan-in.
    const ciApi = (load(read('.github/workflows/ci.yml')) as Workflow).jobs['api-shard'] ?? {};
    expect(api.needs).toEqual(['reuse']);
    expect(api.if).toBe(uncachedJobIf);
    expect(stepUsing(api, 'actions/checkout@')?.with).toEqual(gatedCheckout);
    // The services, the migration job and the env file are ci.yml's API job's own steps.
    for (const name of [
      'Prepare API env file',
      'Start Postgres + Redis + MinIO',
      'MinIO smoke (seed + RW)',
      'Apply the protected migration job',
    ]) {
      expect(stepNamed(api, name)?.run, name).toBeDefined();
      expect(stepNamed(api, name)?.run, name).toBe(stepNamed(ciApi, name)?.run);
    }
    const suites = 'Run API suites (real PostgreSQL + MinIO)';
    expect(stepNamed(api, suites)?.env).toEqual(stepNamed(ciApi, suites)?.env);
    expect(stepNamed(api, suites)?.run).toBe(
      'pnpm nx run-many -t test --projects tag:scope:api --exclude tag:ci:quarantined --parallel=1 --outputStyle=static',
    );
    const names = (api.steps ?? []).map((step) => step.name);
    expect(names.indexOf('Apply the protected migration job')).toBeLessThan(names.indexOf(suites));
  });

  it("should run every project's ratcheted end-to-end suites as ci.yml's e2e-queue rows run them (C2b)", () => {
    const plan = gate.jobs['e2e-plan'] ?? {};
    const rows = gate.jobs['e2e'] ?? {};
    const row = (load(read('.github/workflows/ci.yml')) as Workflow).jobs['e2e-queue'] ?? {};
    expect(plan.needs).toEqual(['reuse']);
    expect(plan.if).toBe(uncachedJobIf);
    expect(plan.outputs).toEqual({ suites: expression('steps.suites.outputs.suites') });
    expect(rows.needs).toEqual(['reuse', 'e2e-plan']);
    expect(rows.if).toBe("needs.e2e-plan.result == 'success'");
    expect(rows.strategy).toEqual({
      'fail-fast': false,
      matrix: { suite: expression('fromJSON(needs.e2e-plan.outputs.suites)') },
    });
    expect(rows.env).toEqual(row.env);
    expect(stepUsing(rows, 'actions/checkout@')?.with).toEqual(gatedCheckout);
    // Every step of a queue row but its checkout and its artifact upload is the gate row's, verbatim, except that
    // the gate row, which checks out the candidate, takes the apt installer from its own commit's copy at `.tau-ci`
    // (one more step; apt-resilience.test.ts pins it).
    const own = new Set([stepUsing(row, 'actions/checkout@'), stepUsing(row, 'actions/upload-artifact@')]);
    for (const step of (row.steps ?? []).filter((candidate) => !own.has(candidate))) {
      const gateStep = stepNamed(rows, step.name ?? '');
      const uses = gateStep?.uses?.replace(/^\.\/\.tau-ci\//u, './');
      expect(gateStep === undefined ? undefined : { ...gateStep, uses }, step.name).toEqual(step);
    }
    expect(rows.steps?.length).toBe((row.steps?.length ?? 0) + 1);
  });

  describe('end-to-end suite list', () => {
    const script = gate.jobs['e2e-plan']?.steps?.find((step) => step.id === 'suites')?.run ?? '';
    /** Runs the list step over `nodes`; returns its exit status and the suites it wrote. */
    const list = (nodes: Record<string, unknown>): { status: number | undefined; suites: unknown } => {
      const directory = mkdtempSync(join(tmpdir(), 'tau-release-e2e-'));
      try {
        writeFileSync(join(directory, 'graph.json'), JSON.stringify({ graph: { nodes } }));
        writeFileSync(join(directory, 'output'), '');
        const result = spawnSync('bash', ['-c', script], {
          encoding: 'utf8',
          env: Object.fromEntries([
            ['PATH', process.env['PATH'] ?? ''],
            ['RUNNER_TEMP', directory],
            ['GITHUB_OUTPUT', join(directory, 'output')],
          ]),
        });
        const line = readFileSync(join(directory, 'output'), 'utf8').trim();
        return {
          status: result.status ?? undefined,
          suites: line ? (JSON.parse(line.replace(/^suites=/u, '')) as unknown) : undefined,
        };
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    };
    const project = (tags: string[], targets: Record<string, unknown>) => ({ data: { tags, targets } });
    const queue = (...suites: unknown[]) => ({ executor: 'nx:noop', dependsOn: suites });

    it('should list one row per ratcheted suite of every project, leaving quarantined projects out', () => {
      const result = list({
        'ui-e2e': project(['type:e2e'], {
          'test:e2e:queue': queue('test:e2e:a', 'test:e2e:b'),
          'test:e2e:a': {},
          'test:e2e:b': {},
        }),
        scripts: project(['type:tool'], { 'test:e2e:queue': queue('test:e2e'), 'test:e2e': {} }),
        'runtime-e2e': project(['ci:quarantined'], { 'test:e2e:queue': queue('test:e2e'), 'test:e2e': {} }),
        ui: project([], { test: {} }),
      });
      expect(result.status).toBe(0);
      expect(result.suites).toEqual([
        { project: 'scripts', target: 'test:e2e', label: 'scripts test:e2e', slug: 'scripts-test-e2e' },
        { project: 'ui-e2e', target: 'test:e2e:a', label: 'ui-e2e test:e2e:a', slug: 'ui-e2e-test-e2e-a' },
        { project: 'ui-e2e', target: 'test:e2e:b', label: 'ui-e2e test:e2e:b', slug: 'ui-e2e-test-e2e-b' },
      ]);
    });

    it('should fail rather than drop a suite, or run none', () => {
      expect(list({ a: project([], { 'test:e2e:queue': queue('test:e2e:missing') }) }).status).not.toBe(0);
      expect(list({ a: project([], { 'test:e2e:queue': queue({ target: 'x' }) }) }).status).not.toBe(0);
      expect(
        list({ a: project([], { 'test:e2e:queue': queue('test:e2e'), 'test:e2e': { metadata: { shards: 2 } } }) })
          .status,
      ).not.toBe(0);
      expect(list({ a: project([], { test: {} }) }).status).not.toBe(0);
    });
  });

  it('should run full viewer parity on the candidate, uncached, beside the sweep (VP-1)', () => {
    const job = gate.jobs['viewer-parity'];
    expect(job?.uses).toBe('./.github/workflows/viewer-parity.yml');
    expect(job?.needs).toEqual(['reuse']);
    expect(job?.with).toEqual({ ref: expression('needs.reuse.outputs.ref'), uncached: true });
    expect(job?.if).toBe("needs.reuse.result == 'success' && needs.reuse.outputs.run-id == ''");
    expect(job).not.toHaveProperty('secrets');
    // The called workflow gates every fixture: no fixture filter on the gate, and no secret or cache server.
    const parityText = read('.github/workflows/viewer-parity.yml');
    const parity = load(parityText) as Workflow;
    expect(parity.jobs['gate']?.steps?.find((step) => step.name === 'Run the parity gate')?.env).toEqual({
      TAU_E2E_WEBGPU_PROFILE: 'software',
    });
    expect(parityText).not.toContain('secrets.');
    expect(parityText).not.toContain('NX_SELF_HOSTED_REMOTE_CACHE');
    expect(parity.env).toMatchObject({ NX_SKIP_NX_CACHE: 'true', NX_NO_CLOUD: 'true' });
    expect(parity.jobs['fixtures']?.steps?.find((step) => step.id === 'cache')?.if).toBe(
      expression('!inputs.uncached'),
    );
  });

  it('should name the verdict by its commit and pass only on a reuse or every leg green', () => {
    const { verdict } = gate.jobs;
    expect(verdict?.name).toBe(`Release gate verdict (${gatedCommit})`);
    expect(verdict?.needs).toEqual(['reuse', 'sweep', 'formal', 'api', 'e2e', 'viewer-parity']);
    const script = verdict?.steps?.[0]?.run ?? '';
    const judge = (env: Record<string, string>): number | undefined =>
      spawnSync('bash', ['-c', script], { env: { PATH: process.env['PATH'] ?? '', ...env } }).status ?? undefined;
    const green = Object.fromEntries([
      ['REUSE_RESULT', 'success'],
      ['REUSED', ''],
      ['SWEEP_RESULT', 'success'],
      ['FORMAL_RESULT', 'success'],
      ['API_RESULT', 'success'],
      ['E2E_RESULT', 'success'],
      ['VIEWER_PARITY_RESULT', 'success'],
    ]);
    expect(judge(green)).toBe(0);
    expect(judge({ ...green, API_RESULT: 'failure' })).not.toBe(0);
    expect(judge({ ...green, API_RESULT: 'skipped' })).not.toBe(0);
    expect(judge({ ...green, E2E_RESULT: 'failure' })).not.toBe(0);
    expect(judge({ ...green, E2E_RESULT: 'skipped' })).not.toBe(0);
    expect(judge({ ...green, E2E_RESULT: 'cancelled' })).not.toBe(0);
    expect(judge({ ...green, SWEEP_RESULT: 'failure' })).not.toBe(0);
    expect(judge({ ...green, FORMAL_RESULT: 'cancelled' })).not.toBe(0);
    expect(judge({ ...green, FORMAL_RESULT: 'skipped' })).not.toBe(0);
    expect(judge({ ...green, VIEWER_PARITY_RESULT: 'failure' })).not.toBe(0);
    expect(judge({ ...green, VIEWER_PARITY_RESULT: 'skipped' })).not.toBe(0);
    expect(judge({ ...green, REUSE_RESULT: 'failure' })).not.toBe(0);
    expect(
      judge({
        ...green,
        REUSED: '42',
        SWEEP_RESULT: 'skipped',
        FORMAL_RESULT: 'skipped',
        API_RESULT: 'skipped',
        E2E_RESULT: 'skipped',
        VIEWER_PARITY_RESULT: 'skipped',
      }),
    ).toBe(0);
  });
});

describe('release-gate-verdict action', () => {
  const script = action.runs.steps[0]?.run ?? '';
  type GateRun = {
    id: number;
    head_branch: string;
    event: string;
    display_title?: string;
    status?: string;
    conclusion?: string;
  };
  type Lookup = { status: number | undefined; output: string; stdout: string; calls: string[] };
  /** Runs the lookup with `gh` answering from `runs` and `jobs` (run id → jobs); returns status, output and calls. */
  const lookup = ({
    ref,
    runs = [],
    jobs = {},
    require = 'false',
    dispatch = 'false',
  }: {
    readonly ref: string;
    readonly runs?: readonly GateRun[];
    readonly jobs?: Record<string, ReadonlyArray<{ name: string; conclusion: string }>>;
    readonly require?: string;
    readonly dispatch?: string;
  }): Lookup => {
    const directory = mkdtempSync(join(tmpdir(), 'tau-release-gate-'));
    try {
      const filled = runs.map((run) => ({
        display_title: `Release gate ${ref}`,
        status: 'completed',
        conclusion: 'success',
        ...run,
      }));
      writeFileSync(join(directory, 'runs.json'), JSON.stringify({ workflow_runs: filled }));
      writeFileSync(join(directory, 'jobs.json'), JSON.stringify(jobs));
      writeFileSync(join(directory, 'calls'), '');
      writeFileSync(
        join(directory, 'gh'),
        [
          '#!/usr/bin/env bash',
          'set -euo pipefail',
          'echo "$*" >> "$FIXTURES/calls"',
          'case "$*" in',
          '  "workflow run "*) ;;',
          '  *"/workflows/release-gate.yml/runs?"*)',
          '    filter=""; previous=""',
          '    for arg in "$@"; do [ "$previous" = --jq ] && filter=$arg; previous=$arg; done',
          '    jq -r "$filter" "$FIXTURES/runs.json" ;;',
          '  *"/jobs?"*)',
          String.raw`    run=$(printf "%s\n" "$@" | grep "/runs/" | sed -E "s#.*/runs/([0-9]+)/jobs.*#\1#")`,
          String.raw`    jq --arg run "$run" "{jobs: (.[\$run] // [])}" "$FIXTURES/jobs.json" ;;`,
          '  *) echo "unexpected gh $*" >&2; exit 1 ;;',
          'esac',
          '',
        ].join('\n'),
        { mode: 0o700 },
      );
      const output = join(directory, 'output');
      writeFileSync(output, '');
      const result = spawnSync('bash', ['-c', script], {
        encoding: 'utf8',
        env: Object.fromEntries([
          ['PATH', `${directory}:${process.env['PATH'] ?? ''}`],
          ['FIXTURES', directory],
          ['GITHUB_OUTPUT', output],
          ['GH_REPO', 'taucad/tau'],
          ['SERVER', 'https://github.com'],
          ['SHA', ref],
          ['REQUIRE', require],
          ['DISPATCH', dispatch],
        ]),
      });
      return {
        status: result.status ?? undefined,
        output: readFileSync(output, 'utf8'),
        stdout: result.stdout,
        calls: readFileSync(join(directory, 'calls'), 'utf8').trim().split('\n'),
      };
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  };
  const verdict = (commit: string, conclusion: string) => [{ name: `Release gate verdict (${commit})`, conclusion }];
  const dispatched = (result: Lookup): string[] => result.calls.filter((call) => call.startsWith('workflow run'));

  it('should find a green verdict from a candidate-started run or a dispatch from main', () => {
    const tagged = lookup({
      ref: sha,
      runs: [{ id: 7, head_branch: 'desktop-staging@0.2.0-staging.1', event: 'workflow_run' }],
      jobs: { '7': verdict(sha, 'success') },
      require: 'true',
      dispatch: 'true',
    });
    expect(tagged.status).toBe(0);
    expect(tagged.output).toBe('run-id=7\n');
    expect(dispatched(tagged)).toEqual([]);
    const fromMain = lookup({
      ref: sha,
      runs: [{ id: 8, head_branch: 'main', event: 'workflow_dispatch' }],
      jobs: { '8': verdict(sha, 'success') },
    });
    expect(fromMain.output).toBe('run-id=8\n');
  });

  it("should ignore another commit's run and a dispatch from another branch", () => {
    const result = lookup({
      ref: sha,
      runs: [
        { id: 9, head_branch: 'main', event: 'workflow_dispatch', display_title: `Release gate ${'b'.repeat(40)}` },
        { id: 11, head_branch: 'feature', event: 'workflow_dispatch' },
      ],
      jobs: { '9': verdict('b'.repeat(40), 'success'), '11': verdict(sha, 'success') },
    });
    expect(result.status).toBe(0);
    expect(result.output).toBe('');
  });

  it('should block on a running gate and name it, without dispatching another', () => {
    const result = lookup({
      ref: sha,
      runs: [{ id: 12, head_branch: 'main', event: 'workflow_dispatch', status: 'in_progress', conclusion: '' }],
      require: 'true',
      dispatch: 'true',
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain('still running: https://github.com/taucad/tau/actions/runs/12');
    expect(dispatched(result)).toEqual([]);
  });

  it('should block on a red verdict and name it, never re-running it', () => {
    const result = lookup({
      ref: sha,
      runs: [{ id: 13, head_branch: 'main', event: 'workflow_dispatch', conclusion: 'failure' }],
      jobs: { '13': verdict(sha, 'failure') },
      require: 'true',
      dispatch: 'true',
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain('failed on');
    expect(result.stdout).toContain('/actions/runs/13');
    expect(dispatched(result)).toEqual([]);
  });

  it('should dispatch the gate from main for a commit with no verdict, or a cancelled one, and block', () => {
    for (const runs of [
      [],
      [{ id: 14, head_branch: 'desktop-staging@x', event: 'workflow_run', conclusion: 'cancelled' }],
    ]) {
      const result = lookup({
        ref: sha,
        runs,
        jobs: { '14': verdict(sha, 'cancelled') },
        require: 'true',
        dispatch: 'true',
      });
      expect(result.status).not.toBe(0);
      expect(dispatched(result)).toEqual([`workflow run release-gate.yml --repo taucad/tau --ref main -f ref=${sha}`]);
      expect(result.stdout).toContain('so the gate was started');
    }
    const withoutDispatch = lookup({ ref: sha, require: 'true' });
    expect(withoutDispatch.status).not.toBe(0);
    expect(dispatched(withoutDispatch)).toEqual([]);
    expect(withoutDispatch.stdout).toContain(`Dispatch release-gate.yml from main with ref ${sha}`);
    expect(lookup({ ref: sha }).status).toBe(0);
  });

  it('should refuse a ref that is not a full commit sha', () => {
    expect(lookup({ ref: 'main' }).status).not.toBe(0);
    expect(lookup({ ref: sha.slice(0, 12) }).status).not.toBe(0);
  });
});

describe('release gate readers', () => {
  const stepsOf = (job: Job | undefined): readonly Step[] => job?.steps ?? [];

  it('should require a verdict on the candidate commit for every desktop route promotion, and none for a renewal', () => {
    const steps = stepsOf(promotion.jobs['publication']);
    const commit = steps.find((step) => step.id === 'candidate-commit');
    const require = steps.find((step) => step.uses === './.github/actions/release-gate-verdict');
    const guard = "steps.selected.outputs.run == 'true' && inputs.operation == 'promote-routes'";
    expect(commit?.if).toBe(guard);
    expect(require?.if).toBe(guard);
    expect(require?.with).toEqual({
      sha: expression('steps.candidate-commit.outputs.sha'),
      'github-token': expression('github.token'),
      require: 'true',
      dispatch: 'true',
    });
    // Read before any signing material is loaded or anything is published.
    const index = (name: string): number => steps.findIndex((step) => step.name === name);
    expect(steps.indexOf(require!)).toBeLessThan(index('Load protected signing inputs'));
    expect(steps.indexOf(require!)).toBeLessThan(index('Publish or renew under the shared channel lock'));
  });

  it('should require a verdict for a forward production deploy, and none for a rollback or a redeploy', () => {
    const steps = stepsOf(production.jobs['promote']);
    const require = steps.find((step) => step.uses === './.github/actions/release-gate-verdict');
    expect(require?.if).toBe("steps.release.outputs.action == 'forward'");
    expect(require?.with).toEqual({
      sha: expression('steps.release.outputs.commit'),
      'github-token': expression('github.token'),
      require: 'true',
      dispatch: 'true',
    });
    expect(steps.indexOf(require!)).toBe(steps.findIndex((step) => step.name === 'Deploy the release at its tag') - 1);
  });

  it('should give the readers the right to dispatch the gate', () => {
    expect(promotion.jobs['publication']?.permissions?.['actions']).toBe('write');
    expect(production.jobs['promote']?.permissions?.['actions']).toBe('write');
  });

  it('should never run or wait for the gate from a reader', () => {
    for (const workflow of [promotion, production]) {
      for (const job of Object.values(workflow.jobs)) {
        expect(job.uses).not.toBe('./.github/workflows/release-gate.yml');
      }
    }
    expect(read('.github/workflows/release-build.yml')).not.toContain('release-gate');
  });
});
/* eslint-enable @typescript-eslint/naming-convention -- End exact external names. */
