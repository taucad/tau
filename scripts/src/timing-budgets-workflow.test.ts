import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

/*
 * The timing-budget lane (CI decomposition ruling D-DC17, operator Q3 option B): the nine timing-budget specs of
 * ui-e2e run only in `test:e2e:timing-budgets`, which `timing-budgets.yml` runs non-gating on `main` pushes that
 * affect it, one job per spec, under one concurrency group that cancels a superseded run, and reports to the
 * owner issues. The release gate does not require it until every spec is green.
 */

const root = resolve(import.meta.dirname, '../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');
/** A GitHub Actions `${{ … }}` expression, built so the source holds no template-like string literal. */
const expression = (body: string): string => ['$', '{{ ', body, ' }}'].join('');

type Target = {
  readonly cache?: boolean;
  readonly metadata?: { readonly shards?: number; readonly owners?: Record<string, number> };
  readonly options?: {
    readonly command?: string;
    readonly commands?: ReadonlyArray<string | { readonly command: string; readonly forwardAllArgs?: boolean }>;
    readonly env?: Record<string, string>;
  };
  readonly configurations?: Record<string, { readonly env?: Record<string, string> }>;
};
type Step = {
  readonly name?: string;
  readonly id?: string;
  readonly if?: string;
  readonly run?: string;
  readonly uses?: string;
  readonly with?: Record<string, string>;
  readonly env?: Record<string, string>;
};
type Job = {
  readonly if?: string;
  readonly needs?: readonly string[];
  readonly permissions?: Record<string, string>;
  readonly steps?: readonly Step[];
  readonly strategy?: { readonly matrix?: Record<string, unknown> };
};
type Workflow = {
  readonly on: Record<string, unknown>;
  readonly concurrency?: { readonly group: string; readonly 'cancel-in-progress': boolean };
  readonly permissions?: Record<string, string>;
  readonly jobs: Record<string, Job>;
};

const project = JSON.parse(read('apps/ui-e2e/project.json')) as { readonly targets: Record<string, Target> };
const lane = project.targets['test:e2e:timing-budgets'];
const commandsOf = (target: Target | undefined): string[] =>
  (target?.options?.commands ?? [target?.options?.command ?? '']).map((entry) =>
    typeof entry === 'string' ? entry : entry.command,
  );
const vitestCommand = (target: Target | undefined): string =>
  commandsOf(target).find((command) => command.startsWith('vitest run')) ?? '';
const specFiles = (command: string): string[] => command.split(/\s+/u).filter((token) => token.endsWith('.spec.ts'));

/** The admission list in vitest.config.ts. */
const configSource = read('apps/ui-e2e/vitest.config.ts');
const admitted = [
  ...(/const timingBudgetSpecs = \[([^\]]*)\]/u.exec(configSource)?.[1] ?? '').matchAll(/'([^']+)'/gu),
].map(([, spec]) => spec ?? '');

/** The nine specs D-DC17 names (Brain research/ci-decomposition-blueprint.md, 2026-11-23 re-plan). */
const nine = [
  'src/glass-prism-loader.spec.ts',
  'src/headless-chat-image-capture.performance.spec.ts',
  'src/home-load-gate.spec.ts',
  'src/metal-morph-loader.spec.ts',
  'src/mobile-stability.spec.ts',
  'src/parameters-pane.performance.spec.ts',
  'src/project-load-frames.spec.ts',
  'src/revision-latency.spec.ts',
  'src/user-project-thumbnail-generation.spec.ts',
];

describe('ui-e2e test:e2e:timing-budgets (D-DC17)', () => {
  it('should run exactly the nine timing-budget specs, one per shard, each with an owner issue', () => {
    expect(specFiles(vitestCommand(lane))).toEqual(nine);
    expect(admitted).toEqual(nine);
    expect(Object.keys(lane?.metadata?.owners ?? {}).sort()).toEqual(nine);
    expect(new Set(Object.values(lane?.metadata?.owners ?? {}))).toEqual(new Set([2286, 2287, 2288]));
    // Vitest's --shard=<i>/<n> gives each of n jobs exactly one of n files.
    expect(lane?.metadata?.shards).toBe(nine.length);
    expect(lane?.cache).toBe(false);
    expect(vitestCommand(lane)).toContain('--project chromium');
    expect(vitestCommand(lane)).toContain('--outputFile.json=../../out/test-results/timing-budgets/report.json');
    expect(lane?.options?.commands?.[0]).toEqual({ command: 'pnpm exec nx run ui:build', forwardAllArgs: false });
    expect(lane?.options?.env?.['TAU_E2E_TIMING_BUDGET_SPECS']).toBe('true');
  });

  it('should keep them out of test:e2e, the nightly shards, and admit them only where a target names them', () => {
    expect(configSource).toContain(
      "const timingBudgetExcluded = process.env['TAU_E2E_TIMING_BUDGET_SPECS'] === 'true' ? [] : timingBudgetSpecs;",
    );
    expect(configSource).toContain('...timingBudgetExcluded,');
    const suite = project.targets['test:e2e'];
    expect(suite?.options?.env?.['TAU_E2E_TIMING_BUDGET_SPECS']).toBeUndefined();
    for (const [name, configuration] of Object.entries(suite?.configurations ?? {})) {
      expect(configuration.env?.['TAU_E2E_TIMING_BUDGET_SPECS'], name).toBeUndefined();
    }
    // A target that names one of them must admit it, and only the hardware WebGPU and cloud-load tiers do, for
    // their own purposes; no other target runs a timing-budget spec.
    const naming = Object.entries(project.targets)
      .filter(([, target]) =>
        commandsOf(target).some((command) => specFiles(command).some((spec) => nine.includes(spec))),
      )
      .map(([name]) => name);
    expect(naming).toEqual(['test:e2e:webgpu', 'test:e2e:timing-budgets', 'test:e2e:cloud-load']);
    for (const name of naming) {
      expect(project.targets[name]?.options?.env?.['TAU_E2E_TIMING_BUDGET_SPECS'], name).toBe('true');
    }
    const admitting = Object.entries(project.targets)
      .filter(([, target]) => target.options?.env?.['TAU_E2E_TIMING_BUDGET_SPECS'] !== undefined)
      .map(([name]) => name);
    expect(admitting).toEqual(naming);
  });
});

describe('timing-budgets.yml (D-DC17)', () => {
  const workflow = load(read('.github/workflows/timing-budgets.yml')) as Workflow;
  const step = (job: string, name: string): Step | undefined =>
    workflow.jobs[job]?.steps?.find((entry) => entry.name === name);

  it('should run on main pushes only, the newest commit only', () => {
    expect(workflow.on).toEqual({ push: { branches: ['main'] } });
    expect(workflow.concurrency).toEqual({ group: 'timing-budgets-main', 'cancel-in-progress': true });
    expect(workflow.permissions).toEqual({});
  });

  it('should select the affected projects by target and diff against the last finished run', () => {
    const base = step('plan', 'Find the commit the last finished run checked')?.run ?? '';
    expect(base).toContain('actions/workflows/timing-budgets.yml/runs?branch=main&event=push&status=completed');
    expect(base).toContain('select(.conclusion == "success" or .conclusion == "failure")');
    expect(step('plan', 'Setup Nx Environment')?.with?.['affected-base']).toBe(expression('steps.base.outputs.base'));
    const plan = step('plan', 'List the affected timing-budget suites')?.run ?? '';
    expect(plan).toContain('pnpm nx show projects --affected --with-target test:e2e:timing-budgets --json');
    expect(plan).toContain('.metadata.shards // 1');
    expect(plan).toContain('.metadata.owners // {}');
  });

  it('should run each spec as its own job on Chromium only, and never gate anything', () => {
    const { budgets } = workflow.jobs;
    expect(budgets?.if).toBe("needs.plan.outputs.suites != '[]'");
    expect(budgets?.strategy?.matrix?.['suite']).toBe(expression('fromJSON(needs.plan.outputs.suites)'));
    expect(step('budgets', 'Install Chromium for Vitest Browser (system dependencies)')?.with).toEqual({
      'playwright-browsers': 'chromium',
    });
    expect(step('budgets', 'Install Chromium for Vitest Browser')?.run).toBe(
      `./.github/actions/apt-install/infra-retry.sh playwright-install pnpm exec ${['play', 'wright'].join('')} install chromium`,
    );
    expect(step('budgets', 'Run the timing-budget spec')?.run).toBe(
      `xvfb-run --auto-servernum pnpm nx run-many -t test:e2e:timing-budgets --projects "$PROJECT" --parallel=1 --outputStyle=stream \${SHARD:+"--shard=$SHARD"}`,
    );
    expect(step('budgets', 'Upload the timing-budget report')?.with?.['path']).toBe(
      'out/test-results/timing-budgets/report.json',
    );
    // Not required anywhere yet: neither the merge queue nor the release gate names the lane (TODO(D-DC17)).
    for (const path of ['.github/workflows/ci.yml', '.github/workflows/release-gate.yml']) {
      expect(read(path), path).not.toMatch(/timing-budgets/u);
    }
    expect(read('.github/workflows/timing-budgets.yml')).toContain('TODO(D-DC17)');
  });

  it('should validate every spec chat logs against ChatLog.tla once all the jobs end, as the nightly did', () => {
    const nightly = load(read('.github/workflows/e2e-nightly.yml')) as Workflow & {
      readonly env?: Record<string, string>;
    };
    const nightlyStep = (job: string, name: string): Step | undefined =>
      nightly.jobs[job]?.steps?.find((entry) => entry.name === name);
    // The nightly's own rule for test:e2e: a suite that opens chats is validated (only SUITES_WITHOUT_CHAT is not).
    expect(JSON.parse(nightly.env?.['SUITES_WITHOUT_CHAT'] ?? '[]')).not.toContain('test:e2e');
    const upload = step('budgets', "Upload the spec's chat logs");
    expect(upload?.if).toBe('always()');
    expect(upload?.with).toMatchObject({
      name: `chat-logs-${expression('matrix.suite.slug')}`,
      path: 'out/test-results/chat-logs',
    });
    // Every slug starts `<project>--shard-`, sharded or not, so the download below finds every job's logs.
    const plan = step('plan', 'List the affected timing-budget suites')?.run ?? '';
    expect(plan).toContain(String.raw`slug: "\($project)--shard-\($i)-of-\($shards)"`);
    expect(plan).toContain(String.raw`slug: "\($project)--shard-1-of-1"`);
    expect(plan).toContain(`echo "projects=$(jq -c '[.[].project] | unique' <<< "$suites")" >> "$GITHUB_OUTPUT"`);
    const chatLogs = workflow.jobs['chat-logs'];
    expect(chatLogs?.needs).toEqual(['plan', 'budgets']);
    expect(chatLogs?.if).toBe(
      expression("!cancelled() && needs.plan.result == 'success' && needs.plan.outputs.suites != '[]'"),
    );
    expect(chatLogs?.strategy?.matrix?.['project']).toBe(expression('fromJSON(needs.plan.outputs.projects)'));
    expect(step('chat-logs', "Download the jobs' chat logs")?.with).toEqual({
      pattern: `chat-logs-${expression('matrix.project')}--shard-*`,
      path: 'out/test-results/chat-logs',
      'merge-multiple': true,
    });
    expect(step('chat-logs', 'Setup formal toolchains')).toMatchObject({
      uses: './.github/actions/setup-formal',
      with: { tools: 'tlc' },
    });
    expect(step('chat-logs', 'Validate captured chat logs')?.run).toBe(
      nightlyStep('e2e-chat-logs', 'Validate captured chat logs')?.run,
    );
    expect(step('chat-logs', 'Setup formal toolchains')?.with).toEqual(
      nightlyStep('e2e-chat-logs', 'Setup formal toolchains')?.with,
    );
  });

  it('should report to the owner issues from a finished run only, with the only write permission', () => {
    const { report } = workflow.jobs;
    expect(report?.needs).toEqual(['plan', 'budgets']);
    expect(report?.if).toBe(
      expression("!cancelled() && needs.plan.result == 'success' && needs.plan.outputs.suites != '[]'"),
    );
    expect(report?.permissions).toEqual({ contents: 'read', actions: 'read', issues: 'write' });
    for (const [id, job] of Object.entries(workflow.jobs).filter(([name]) => name !== 'report')) {
      expect(Object.values(job.permissions ?? {}), id).not.toContain('write');
    }
    const post = step('report', 'Post the results to the owner issues');
    expect(post?.run).toBe(
      'node scripts/src/timing-budget-report.ts --reports out/timing-budget-reports --summary "$GITHUB_STEP_SUMMARY"',
    );
    expect(post?.env?.['OWNERS']).toBe(expression('needs.plan.outputs.owners'));
    expect(step('report', 'Download the timing-budget reports')?.with).toEqual({
      pattern: 'timing-budget-report-*',
      path: 'out/timing-budget-reports',
    });
  });
});
