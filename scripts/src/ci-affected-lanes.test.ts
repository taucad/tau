import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

/*
 * The affected-only rule for `ci.yml`: a job that runs a project test target runs it because the plan
 * found that lane affected, or selects its own projects with `nx affected`, on pull requests, in the
 * merge queue and on `main` pushes alike. A job's `if` may not add an event or branch clause that runs
 * the lane regardless. A `main` push may skip a lane only on the merge-queue verdict for the identical
 * commit, by one rule for every lane: the queue run's required gate, which waits for every lane, passed.
 * A push whose commit has a merge-group run diffs against the queue's own base (`HEAD^1`), so `nx affected`
 * alone selects what the queue selected. `staging.yml` accepts a skipped service lane only when the same
 * CI run's plan says `nx affected` did not select it or names the reused queue run.
 */

const root = resolve(import.meta.dirname, '../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

type Step = {
  readonly id?: string;
  readonly if?: string;
  readonly name?: string;
  readonly run?: string;
  readonly uses?: string;
  readonly env?: Record<string, string>;
  readonly with?: Record<string, string>;
};
type Job = {
  readonly if?: string;
  readonly needs?: string | readonly string[];
  readonly outputs?: Record<string, string>;
  readonly steps?: readonly Step[];
  readonly uses?: string;
  readonly with?: Record<string, string>;
  readonly env?: Record<string, string>;
};
type Workflow = {
  readonly on?: {
    readonly pull_request?: { readonly types?: readonly string[] };
    readonly push?: { readonly paths?: readonly string[] };
    readonly workflow_call?: { readonly inputs?: Record<string, { readonly type?: string }> };
  };
  readonly concurrency?: { readonly group?: string };
  readonly jobs: Record<string, Job>;
};

const ci = load(read('.github/workflows/ci.yml')) as Workflow;
const staging = load(read('.github/workflows/staging.yml')) as Workflow;
const nativeHosts = load(read('.github/workflows/native-hosts.yml')) as Workflow;
const viewerParity = load(read('.github/workflows/viewer-parity.yml')) as Workflow;

/** A GitHub Actions `${{ … }}` expression, built so the source holds no template-like string literal. */
const expression = (body: string): string => ['$', '{{ ', body, ' }}'].join('');
/** The one non-affected condition a CI job may carry: a draft pull request runs nothing. */
const draftGuard = expression('!github.event.pull_request.draft');

const isTestTarget = (target: string): boolean => /^test(?:$|[:-])/u.test(target);

/** The Nx targets a shell command runs, and whether its projects are selected by `affected` there. */
const nxTargets = (command: string): ReadonlyArray<{ readonly target: string; readonly affected: boolean }> => {
  const found: Array<{ target: string; affected: boolean }> = [];
  for (const [line] of command.matchAll(/\bnx\s+(?:run-many|affected)\b[^\n]*/gu)) {
    // `nx affected`, or `run-many` over a `--projects` list this script took from `nx show projects --affected`
    // or from the task graph `nx affected --graph=<file>` wrote.
    const affected =
      /\bnx\s+affected\b/u.test(line) ||
      (/\s--projects\s+"\$\w+"/u.test(line) &&
        /\bnx (?:show projects --affected\b|affected\b[^\n]*\s--graph=)/u.test(command));
    const flag = /\s(?:-t|--targets?)[\s=]+(.*)/u.exec(line);
    // Targets run up to the next flag (`--parallel`, `--projects`, or `--` before forwarded arguments).
    for (const target of flag?.[1]?.split(/[\s,]+/u) ?? []) {
      if (target === '' || target.startsWith('-')) {
        break;
      }
      found.push({ target, affected });
    }
  }
  for (const [, target] of command.matchAll(/\bnx\s+run\s+[\w@/-]+:([\w:-]+)/gu)) {
    found.push({ target: target ?? '', affected: false });
  }
  return found;
};

const planStep = ci.jobs['plan']?.steps?.find((step) => step.id === 'plan');
const planScript = planStep?.run ?? '';

/** The plan's lane selectors: each lane is the affected projects carrying every tag and target listed. */
const laneSelectors = JSON.parse(planStep?.env?.['LANE_SELECTORS'] ?? '{}') as Record<
  string,
  { readonly type?: string; readonly tags?: readonly string[]; readonly targets?: readonly string[] }
>;

/** Plan outputs computed from the affected projects through a lane selector, keyed by output name. */
const affectedPlanOutputs = (): ReadonlySet<string> => {
  const outputs = new Set<string>();
  for (const key of Object.keys(laneSelectors)) {
    if (
      new RegExp(`^\\s*echo "${key}=\\$`, 'mu').test(planScript) &&
      ci.jobs['plan']?.outputs?.[key] === expression(`steps.plan.outputs.${key}`)
    ) {
      outputs.add(key);
    }
  }
  return outputs;
};

const testJobs = Object.entries(ci.jobs)
  .map(([name, definition]) => ({
    name,
    definition,
    targets: (definition.steps ?? [])
      .flatMap((step) => nxTargets(step.run ?? ''))
      .filter(({ target }) => isTestTarget(target)),
  }))
  .filter(({ targets }) => targets.length > 0);

describe('ci.yml affected-only lanes', () => {
  it('should find the service lanes that run project test targets', () => {
    expect([...affectedPlanOutputs()]).toEqual(
      expect.arrayContaining(['api', 'billing', 'cli-e2e', 'size', 'formal', 'browser', 'geospec-examples']),
    );
    expect(testJobs.map(({ name }) => name)).toEqual(
      expect.arrayContaining(['affected-lane', 'api', 'billing-e2e', 'cli-e2e']),
    );
  });

  it('should select every lane from one affected list and one graph', () => {
    expect(planScript).toMatch(/^\s*affected=\$\(pnpm nx show projects --affected --json \| tail -1\)$/mu);
    expect(planScript).toMatch(/^\s*pnpm nx graph --file="\$RUNNER_TEMP\/graph\.json" > \/dev\/null$/mu);
    expect(planScript.match(/\bnx show projects\b/gu)).toHaveLength(1);
    // A selector naming a tag or target that no project has fails the plan instead of leaving its lane off.
    expect(planScript).toContain('error("lane selectors name a tag or target no project has');
    expect(laneSelectors).toEqual({
      apps: { type: 'app' },
      api: { tags: ['scope:api'] },
      'api-image': { targets: ['docker:smoke'] },
      billing: { targets: ['test:billing-foundation'] },
      'cli-e2e': { targets: ['test:scenarios'] },
      size: { targets: ['size'] },
      formal: { targets: ['formal'] },
      'geospec-examples': { targets: ['test-geospec'] },
      browser: { tags: ['ci:browser'], targets: ['verify-browser'] },
      'native-hosts': { tags: ['ci:native-hosts'] },
      'native-linux': { targets: ['test:native-linux'] },
      'viewer-parity': { targets: ['test:viewer-parity'] },
    });
  });

  it.each(testJobs.map(({ name, definition, targets }) => [name, definition, targets] as const))(
    'should gate %s on a plan affected output or its own nx affected',
    (_name, definition, targets) => {
      // A draft pull request runs no CI; that is the one condition beside the affected one.
      const condition = (definition.if ?? '').replace(draftGuard, '');
      // `nx affected` selects its own projects; every other test command needs a lane the plan selected.
      if (!targets.every(({ affected }) => affected)) {
        expect([definition.needs ?? []].flat()).toContain('plan');
        const gates = [...condition.matchAll(/needs\.plan\.outputs\.([\w-]+) == 'true'/gu)].map(([, key]) => key);
        expect(gates.length).toBeGreaterThan(0);
        for (const key of gates) {
          expect(affectedPlanOutputs()).toContain(key);
        }
        expect(condition).not.toMatch(/\|\|/u);
      }
      expect(condition).not.toMatch(/\bgithub\.(?:ref|ref_name|event_name|base_ref|head_ref)\b/u);
    },
  );

  it('should run the affected lanes without the plan and skip them only on a reused queue verdict', () => {
    const lane = ci.jobs['affected-lane'];
    expect(lane?.needs).toBeUndefined();
    expect(lane?.if).toBe(draftGuard);
    const steps = lane?.steps ?? [];
    const verdict = steps.findIndex((step) => step.id === 'queue');
    expect(steps[verdict]?.uses).toBe('./.github/actions/queue-verdict');
    expect(steps.slice(0, verdict).map((step) => step.name)).toEqual(['Checkout']);
    // Every step after the verdict that runs a command is guarded by it, and nothing else skips the lane.
    for (const step of steps.slice(verdict + 1)) {
      const guard = step.if ?? '';
      if (step.name === 'Summarize failed affected tests' || step.name === 'Check version plans') {
        continue;
      }
      expect(guard, step.name).toContain("steps.queue.outputs.run-id == ''");
      expect(guard.replaceAll("steps.queue.outputs.run-id == ''", ''), step.name).not.toMatch(/run-id|reused/u);
    }
    // The verdict is empty unless this is a push to `main` with a merge-group run on the same commit whose
    // required gate passed; the run's own status is not asked for (the sweep cancels a landed run).
    const action = read('.github/actions/queue-verdict/action.yml');
    expect(action).toContain('if [ "$EVENT" = push ] && [ "$REF" = refs/heads/main ]; then');
    expect(action).toContain('head_sha=$GITHUB_SHA&event=merge_group&per_page=10');
    expect(action).not.toContain('status=success');
    expect(action).toContain('passed("Run affected tasks") and passed("Validate workspace")');
    // The required gate waits for the plan and every lane, and passes a skip only on the plan's verdict.
    const gate = ci.jobs['affected'];
    expect(gate?.needs).toEqual([
      'plan',
      'affected-lane',
      'browser',
      'geospec-examples',
      'cli-e2e',
      'native-hosts',
      'viewer-parity',
      'formal',
      'api',
      'billing-e2e',
    ]);
    const check = gate?.steps?.[0]?.run ?? '';
    expect(check).toContain('test "$PLAN_RESULT" = success');
    expect(check).toContain('test "$LANES_RESULT" = success');
    expect(gate?.steps?.[0]?.env?.['REUSED']).toBe(expression('needs.plan.outputs.reused'));
  });

  it('should run the desktop renderer payload check in the build lane whenever ui is affected', () => {
    // A renderer-only change selects `ui` but not `desktop` (DS-1 cut that edge), so the desktop `package-*`
    // targets that depend on the check never run for it. The build lane's `nx affected` runs it instead.
    const steps = ci.jobs['affected-lane']?.steps ?? [];
    const run = steps.find((step) => step.name === "Run the lane's tasks")?.run ?? '';
    const build = /^\s*build\) (.*) ;;$/mu.exec(run)?.[1] ?? '';
    expect(build).toBe('pnpm nx affected -t build size check-desktop-payload --parallel=1');
    expect(nxTargets(build)).toContainEqual({ target: 'check-desktop-payload', affected: true });
    // The target belongs to `ui`, so `nx affected` selects it exactly when `ui` is affected, and it brings
    // the renderer and desktop main/preload builds it reads.
    const ui = JSON.parse(read('apps/ui/project.json')) as {
      targets: Record<string, { readonly dependsOn?: readonly unknown[] }>;
    };
    expect(ui.targets['check-desktop-payload']?.dependsOn).toEqual([
      'build:desktop',
      { projects: ['desktop'], target: 'build' },
    ]);
  });

  it('should run no CI on a draft pull request and pass the required gate', () => {
    expect(ci.on?.pull_request?.types).toEqual(['opened', 'synchronize', 'reopened', 'ready_for_review']);
    for (const job of ['plan', 'workspace', 'affected-lane']) {
      expect(ci.jobs[job]?.if, job).toBe(draftGuard);
    }
    const gate = ci.jobs['affected'];
    expect(gate?.steps?.[0]?.env?.['DRAFT']).toBe(
      expression("github.event_name == 'pull_request' && github.event.pull_request.draft"),
    );
    const check = gate?.steps?.[0]?.run ?? '';
    expect(check.indexOf('if [ "$DRAFT" = true ]; then')).toBeLessThan(check.indexOf('test "$PLAN_RESULT" = success'));
  });

  it('should leave the service, formal, browser, GeoSpec, CLI end-to-end, native-host and viewer-parity lanes to the merge queue on a pull request', () => {
    const slim = planScript.slice(planScript.indexOf('if [ "$GITHUB_EVENT_NAME" = pull_request ]; then'));
    expect(slim).toMatch(/^\s*native_linux=''$/mu);
    for (const lane of [
      'api',
      'billing',
      'formal',
      'browser',
      'geospec_examples',
      'cli_e2e',
      'native_hosts',
      'viewer_parity',
    ]) {
      expect(slim, lane).toMatch(new RegExp(`^\\s*${lane}=false$`, 'mu'));
    }
    // The PR-only Docker smoke test keeps its own flag: Nx's selection of the image's project.
    expect(planScript).toContain('api_image=$(flag api-image)');
    expect(planScript).toContain('echo "api-image=$api_image"');
    expect(ci.jobs['api-docker-smoke']?.if).toBe(
      "github.event_name == 'pull_request' && needs.plan.outputs.api-image == 'true'",
    );
  });

  it('should skip every lane on a reused queue verdict by one rule, naming no lane', () => {
    // The plan reads only the verdict's run id: no per-lane conclusions of the queue run.
    expect(planStep?.env?.['REUSED']).toBe(expression('steps.queue.outputs.run-id'));
    expect(Object.keys(planStep?.env ?? {}).sort()).toEqual(['LANE_SELECTORS', 'REUSED']);
    const reused = planScript.slice(planScript.indexOf('if [ -n "$REUSED" ]; then'));
    const block = reused.slice(0, reused.indexOf('\nfi\n'));
    // Every lane's selection is emptied at once, before any flag is read from it.
    expect(block).toContain(`lanes=$(jq -c 'map_values([])' <<< "$lanes")`);
    expect(planScript.indexOf('if [ -n "$REUSED" ]; then')).toBeLessThan(planScript.indexOf('flag() {'));
    expect(planScript.indexOf('if [ -n "$REUSED" ]; then')).toBeGreaterThan(planScript.indexOf('selected=$lanes'));
    // No lane is named inside the rule.
    for (const key of Object.keys(laneSelectors)) {
      expect(block, key).not.toMatch(new RegExp(`\\b${key.replaceAll('-', '_')}=`, 'u'));
    }
    expect(planScript).not.toMatch(/QUEUE_LANES|queue_lane|run_api|run_billing/u);
  });

  it('should diff a push against the queue base when its commit has a merge-group run', () => {
    // The plan finds the verdict before Nx is set up, so `setup-nx` takes the queue's base.
    const planSteps = ci.jobs['plan']?.steps ?? [];
    const queue = planSteps.findIndex((step) => step.id === 'queue');
    const setup = planSteps.findIndex((step) => step.uses === './.github/actions/setup-nx');
    expect(queue).toBeGreaterThan(0);
    expect(queue).toBeLessThan(setup);
    expect(ci.jobs['plan']?.outputs?.['affected-base']).toBe(expression('steps.queue.outputs.affected-base'));
    // Every job that runs `nx affected` (or `nx show projects --affected`) diffs against that base.
    const affectedJobs = Object.entries(ci.jobs).filter(([, definition]) =>
      (definition.steps ?? []).some((step) =>
        /\bnx\s+(?:affected\b|show projects\b[^\n]*--affected\b)/u.test(step.run ?? ''),
      ),
    );
    expect(affectedJobs.map(([name]) => name).sort()).toEqual([
      'affected-lane',
      'api',
      'formal',
      'geospec-examples',
      'plan',
    ]);
    for (const [name, definition] of affectedJobs) {
      const steps = definition.steps ?? [];
      const ownVerdict = steps.some((step) => step.id === 'queue');
      for (const step of steps.filter((candidate) => candidate.uses === './.github/actions/setup-nx')) {
        expect(step.with?.['affected-base'], name).toBe(
          expression(ownVerdict ? 'steps.queue.outputs.affected-base' : 'needs.plan.outputs.affected-base'),
        );
      }
      if (!ownVerdict) {
        expect([definition.needs ?? []].flat(), name).toContain('plan');
      }
      // A full history on a push, so `HEAD^1` resolves.
      const checkout = steps.find((step) => step.name === 'Checkout');
      expect(checkout?.with?.['fetch-depth'], name).toBe(expression("github.event_name == 'merge_group' && 2 || 0"));
    }
    // `setup-nx` replaces `nx-set-shas` with the given base, and keeps `nx-set-shas` without one.
    const setupNx = load(read('.github/actions/setup-nx/action.yml')) as {
      readonly inputs: Record<string, { readonly default?: string }>;
      readonly runs: { readonly steps: readonly Step[] };
    };
    expect(setupNx.inputs['affected-base']?.default).toBe('');
    const setShas = setupNx.runs.steps.find((step) => step.uses?.startsWith('nrwl/nx-set-shas@'));
    expect(setShas?.if).toBe("inputs.affected-base == ''");
    const given = setupNx.runs.steps.find((step) => step.name === 'Set NX SHAs to the given base');
    expect(given?.if).toBe("inputs.affected-base != ''");
    expect(given?.run).toContain('base=$(git rev-parse --verify "$BASE^{commit}")');
    expect(given?.run).toContain('echo "NX_BASE=$base"');
    expect(given?.run).toContain('echo "NX_HEAD=$(git rev-parse --verify HEAD)"');
  });

  it('should run the standalone oracles on a push to main only, never in the merge queue', () => {
    // In the queue they started after the gate, so the landed queue run was still in progress and the
    // sweep cancelled it before the push could reuse it (F1, F2). Push and nightly cover every commit.
    const { standalone } = ci.jobs;
    expect(standalone?.uses).toBe('./.github/workflows/standalone-projects.yml');
    expect(standalone?.needs).toEqual(['plan', 'affected']);
    expect(standalone?.if).toBe(
      "!cancelled() && needs.plan.result == 'success' && github.ref == 'refs/heads/main' && github.event_name == 'push'",
    );
    expect(ci.jobs['plan']?.outputs?.['standalone']).toBeUndefined();
    const standaloneWorkflow = load(read('.github/workflows/standalone-projects.yml')) as {
      readonly on: Record<string, unknown>;
    };
    expect(Object.keys(standaloneWorkflow.on).sort()).toEqual(['schedule', 'workflow_call', 'workflow_dispatch']);
    // Nothing else the queue schedules waits for the required gate, so a landed queue run is done with
    // everything required when GitHub merges it.
    const afterGate = Object.entries(ci.jobs)
      .filter(([, definition]) => [definition.needs ?? []].flat().includes('affected'))
      .map(([name, definition]) => ({ name, condition: definition.if ?? '' }));
    for (const { name, condition } of afterGate) {
      expect(condition, name).toContain("github.event_name == 'push'");
    }
  });

  it('should gate billing contracts on the billing plan output alone', () => {
    expect(ci.jobs['billing-e2e']?.if).toBe(
      expression("!cancelled() && needs.plan.result == 'success' && needs.plan.outputs.billing == 'true'"),
    );
    expect(ci.jobs['api']?.if).toBe(
      expression("!cancelled() && needs.plan.result == 'success' && needs.plan.outputs.api == 'true'"),
    );
  });

  it('should run the API suites of the affected scope:api projects one at a time', () => {
    const lane = ci.jobs['api'];
    const steps = lane?.steps ?? [];
    const suites = steps.filter((step) => /\bnx\s+(?:run-many|affected)\s+-t\s+test(?:\s|$)/u.test(step.run ?? ''));
    // One step runs `test`, selected by `nx affected` over the tag: never every API suite with `run-many`.
    // `nx affected` ignores `--projects`; excluding every project but the tag is what narrows it.
    expect(suites.map((step) => step.run?.trim())).toEqual([
      "pnpm nx affected -t test --exclude '*,!tag:scope:api' --parallel=1",
    ]);
    // `nx affected` needs the base `nx-set-shas` finds: two commits in a queue run, full history otherwise.
    const checkout = steps.find((step) => step.name === 'Checkout');
    expect(checkout?.with?.['fetch-depth']).toBe(expression("github.event_name == 'merge_group' && 2 || 0"));
    // The compose services start before the suites, in this same job.
    const services = steps.findIndex((step) => /\bdocker compose\b[^\n]*\bup\b/u.test(step.run ?? ''));
    const first = steps.findIndex((step) => suites.includes(step));
    expect(services).toBeGreaterThanOrEqual(0);
    expect(services).toBeLessThan(first);
  });

  it('should run the CLI end-to-end suites in their own lane that the required check aggregates', () => {
    expect(ci.jobs['cli-e2e']?.if).toBe(
      expression("!cancelled() && needs.plan.result == 'success' && needs.plan.outputs.cli-e2e == 'true'"),
    );
    const gate = ci.jobs['affected'];
    expect([gate?.needs ?? []].flat()).toContain('cli-e2e');
    const require = gate?.steps?.find((step) => step.env?.['CLI_E2E_RESULT'] !== undefined);
    expect(require?.env?.['CLI_E2E_REQUIRED']).toBe(expression('needs.plan.outputs.cli-e2e'));
    expect(require?.env?.['CLI_E2E_RESULT']).toBe(expression('needs.cli-e2e.result'));
    expect(require?.run).toContain('if [ "$CLI_E2E_REQUIRED" = true ]; then test "$CLI_E2E_RESULT" = success; fi');
    // A push that reuses the merge-queue verdict skips the lane, as it skips the shards: the flag is read
    // from the selection the reuse rule emptied.
    expect(planScript).toContain('cli_e2e=$(flag cli-e2e)');
  });
});

describe('ci.yml native-host and viewer-parity lanes', () => {
  const gateStep = ci.jobs['affected']?.steps?.[0];

  it.each([
    ['native-hosts', './.github/workflows/native-hosts.yml'],
    ['viewer-parity', './.github/workflows/viewer-parity.yml'],
  ])('should call the %s workflow only when the plan selected its lane', (job, workflow) => {
    const definition = ci.jobs[job];
    expect(definition?.uses).toBe(workflow);
    expect(definition?.needs).toEqual(['plan']);
    expect(definition?.if).toBe(`needs.plan.outputs.${job} == 'true'`);
    expect(affectedPlanOutputs()).toContain(job);
  });

  it('should pass the affected test:native-linux projects to the native host rows', () => {
    expect(ci.jobs['native-hosts']?.with).toEqual({ 'native-linux': expression('needs.plan.outputs.native-linux') });
    expect(ci.jobs['plan']?.outputs?.['native-linux']).toBe(expression('steps.plan.outputs.native-linux'));
    expect(planScript).toContain(`native_linux=$(jq -r '."native-linux" | join(",")' <<< "$lanes")`);
    // The Linux rows run when a native host project or a native-linux project is affected.
    expect(planScript).toContain(
      `native_hosts=$(jq -r 'if .["native-hosts"] == [] and .["native-linux"] == [] then "false" else "true" end' <<< "$lanes")`,
    );
    expect(planScript).toContain('echo "native-linux=$native_linux"');
  });

  it('should fail the required check when a selected native-host, viewer-parity, formal or service lane did not pass', () => {
    const check = gateStep?.run ?? '';
    for (const [key, job, output] of [
      ['NATIVE_HOSTS', 'native-hosts', 'native-hosts'],
      ['VIEWER_PARITY', 'viewer-parity', 'viewer-parity'],
      ['FORMAL', 'formal', 'formal'],
      ['API', 'api', 'api'],
      ['BILLING', 'billing-e2e', 'billing'],
    ] as const) {
      expect(gateStep?.env?.[`${key}_REQUIRED`]).toBe(expression(`needs.plan.outputs.${output}`));
      expect(gateStep?.env?.[`${key}_RESULT`]).toBe(expression(`needs.${job}.result`));
      expect(check).toContain(`if [ "$${key}_REQUIRED" = true ]; then test "$${key}_RESULT" = success; fi`);
    }
  });

  it('should leave a push to the native-hosts workflow and skip viewer parity on a reused queue verdict', () => {
    expect(planScript).toContain('viewer_parity=$(flag viewer-parity)');
    const push = planScript.slice(planScript.indexOf('if [ "$GITHUB_EVENT_NAME" = push ]; then'));
    expect(push.slice(0, push.indexOf('\nfi\n'))).toMatch(/^\s*native_hosts=false$/mu);
    expect(nativeHosts.on?.push).toBeDefined();
  });

  it.each([
    ['native-hosts', nativeHosts],
    ['viewer-parity', viewerParity],
  ])('should run %s from ci.yml and never on a pull request', (_name, workflow) => {
    expect(workflow.on !== undefined && 'workflow_call' in workflow.on).toBe(true);
    expect(workflow.on?.pull_request).toBeUndefined();
    // A group equal to the caller's (`github.workflow` is `CI` in a called workflow) would cancel the call.
    expect(workflow.concurrency?.group ?? '').not.toContain('github.workflow');
  });

  it('should select viewer parity through the graph, not hand-kept paths', () => {
    expect(viewerParity.on?.push).toBeUndefined();
    expect(read('.github/workflows/viewer-parity.yml')).not.toMatch(/^\s+paths:/mu);
    const examples = JSON.parse(read('libs/tau-examples/project.json')) as {
      readonly targets: Record<string, { readonly inputs?: readonly string[] }>;
    };
    expect(examples.targets['test:viewer-parity']?.inputs).toEqual([
      'default',
      '^default',
      '{workspaceRoot}/.github/workflows/viewer-parity.yml',
    ]);
  });

  it('should skip the native-hosts plan in the merge queue and take the rows from ci.yml', () => {
    expect(nativeHosts.on?.workflow_call?.inputs?.['native-linux']?.type).toBe('string');
    expect(nativeHosts.jobs['plan']?.if).toBe("github.event_name != 'merge_group'");
    expect(nativeHosts.jobs['linux']?.if).toBe(
      expression("!cancelled() && (github.event_name == 'merge_group' || needs.plan.outputs.linux == 'true')"),
    );
    expect(nativeHosts.jobs['linux']?.env?.['NATIVE_LINUX']).toBe(
      expression('inputs.native-linux || needs.plan.outputs.native-linux'),
    );
    // The Intel row never runs in the queue: a skipped plan leaves its output empty.
    expect(nativeHosts.jobs['intel']?.if).toBe("needs.plan.outputs.intel == 'true'");
  });
});

describe('staging.yml skipped-lane rule', () => {
  const check = staging.jobs['ci']?.steps?.find((step) => step.id === 'check');
  const script = check?.run ?? '';
  const planned = JSON.parse(check?.env?.['PLANNED_LANES'] ?? '[]') as string[];

  it('should read the lane plan that the same CI run uploaded', () => {
    // What `nx affected` selected, before the reuse and pull-request rules, and the reused run: no queue
    // conclusions, which the gate already proves.
    expect(planScript).toContain(
      `'{api: ($selected.api != [] | tostring), "billing-e2e": ($selected.billing != [] | tostring), "reused-run": $reused}'`,
    );
    expect(planScript).toContain('> out/ci-plan/lanes.json');
    const upload = ci.jobs['plan']?.steps?.find((step) => step.with?.['name'] === 'ci-plan');
    expect(upload?.uses).toMatch(/^actions\/upload-artifact@[\da-f]{40}$/u);
    expect(upload?.with?.['path']).toBe('out/ci-plan/lanes.json');
    expect(script).toContain('gh run download "$run_id" --repo "$GITHUB_REPOSITORY" --name ci-plan');
    expect(planned).toEqual(['api', 'billing-e2e']);
  });

  it('should turn a skip into not-affected only for a planned lane the plan did not select', () => {
    expect(script).toContain('if [ "$conclusion" = skipped ] &&');
    expect(script).toContain(`jq -e --arg key "$key" 'index($key) != null' <<< "$PLANNED_LANES"`);
    // An absent plan or lane reads as selected, so the skip stays `skipped` and refuses.
    expect(script).toContain(`if [ "$(jq -r --arg key "$key" '.[$key] // "true"' <<< "$plan")" = false ]; then`);
    expect(script.match(/conclusion=not-affected/gu)).toHaveLength(1);
  });

  it('should turn a skip into reused for a selected planned lane only when the plan names the reused run', () => {
    // No lane's queue conclusion is read: the reused run's gate passed every lane it selected.
    expect(script).toContain(`reused=$(jq -r '."reused-run" // ""' <<< "$plan")`);
    expect(script).toContain('elif [ -n "$reused" ]; then');
    expect(script).not.toMatch(/\.queue\b|\$queue\b/u);
    expect(script.match(/conclusion=reused/gu)).toHaveLength(1);
    // Inside the planned-lane branch, so `workspace` and `affected` can never report it.
    expect(script.indexOf('conclusion=reused')).toBeGreaterThan(script.indexOf('<<< "$PLANNED_LANES"'));
  });

  it('should let deploys accept not-affected for the planned lanes only', () => {
    for (const [name, definition] of Object.entries(staging.jobs)) {
      const condition = definition.if ?? '';
      for (const [, key] of condition.matchAll(/needs\.ci\.outputs\.([\w-]+) == '(?:not-affected|reused)'/gu)) {
        expect(planned, name).toContain(key);
        expect(condition, name).toContain(
          `(needs.ci.outputs.${key} == 'success' || needs.ci.outputs.${key} == 'not-affected' || needs.ci.outputs.${key} == 'reused')`,
        );
      }
      for (const [, key, value] of condition.matchAll(/needs\.ci\.outputs\.([\w-]+) == '([\w-]+)'/gu)) {
        expect(['success', ...(planned.includes(key ?? '') ? ['not-affected', 'reused'] : [])], name).toContain(value);
      }
    }
  });
});

describe('queue-verdict action', () => {
  const action = load(read('.github/actions/queue-verdict/action.yml')) as {
    readonly outputs: Record<string, unknown>;
    readonly runs: { readonly steps: readonly Step[] };
  };
  const script = action.runs.steps.find((step) => step.id === 'find')?.run ?? '';

  /** A job of a queue run as the jobs API lists it; a job still running has no conclusion (`null` there). */
  type RunJob = { readonly name: string; readonly status: string; readonly conclusion?: string };
  type QueueRun = { readonly id: number; readonly createdAt: string; readonly jobs: readonly RunJob[] };
  const done = (name: string, conclusion: string): RunJob => ({ name, status: 'completed', conclusion });
  const running = (name: string): RunJob => ({ name, status: 'in_progress' });
  const gatePassed = [
    done('Plan affected lanes', 'success'),
    done('Validate workspace', 'success'),
    done('Run affected tasks', 'success'),
  ];

  /** Runs the action's step with a `gh` that answers from `runs`, and returns its outputs. */
  const verdict = (runs: readonly QueueRun[], event = 'push', ref = 'refs/heads/main'): Record<string, string> => {
    const directory = mkdtempSync(join(tmpdir(), 'tau-queue-verdict-'));
    try {
      // The REST API's snake_case keys, as entries so the fixture's own names stay camelCase.
      const listing = Object.fromEntries<unknown>([
        [
          'workflow_runs',
          runs.map(({ id, createdAt }) =>
            Object.fromEntries<number | string>([
              ['id', id],
              ['created_at', createdAt],
            ]),
          ),
        ],
      ]);
      writeFileSync(join(directory, 'runs.json'), JSON.stringify(listing));
      for (const run of runs) {
        writeFileSync(join(directory, `jobs-${run.id}.json`), JSON.stringify({ jobs: run.jobs }));
      }
      // `gh api [--paginate] <path> --jq <filter>`: answers the runs listing or one run's jobs from a file.
      writeFileSync(
        join(directory, 'gh'),
        [
          '#!/usr/bin/env bash',
          'set -euo pipefail',
          'path=""; filter="."',
          'while [ $# -gt 0 ]; do case "$1" in --jq) filter=$2; shift 2 ;; repos/*) path=$1; shift ;; *) shift ;; esac; done',
          'echo "$path" >> "$FIXTURES/calls"',
          'case "$path" in',
          '  */workflows/ci.yml/runs?*) file="$FIXTURES/runs.json" ;;',
          // `repos/<owner>/<repo>/actions/runs/<id>/jobs?…`: the sixth path segment is the run id.
          '  */actions/runs/*/jobs?*) file="$FIXTURES/jobs-$(cut -d/ -f6 <<< "$path").json" ;;',
          '  *) echo "unexpected gh api $path" >&2; exit 1 ;;',
          'esac',
          'jq -r "$filter" "$file"',
          '',
        ].join('\n'),
        { mode: 0o700 },
      );
      const output = join(directory, 'output');
      writeFileSync(output, '');
      writeFileSync(join(directory, 'calls'), '');
      const result = spawnSync('bash', ['-c', script], {
        encoding: 'utf8',
        env: Object.fromEntries([
          ['PATH', `${directory}:${process.env['PATH'] ?? ''}`],
          ['FIXTURES', directory],
          ['GH_TOKEN', 'fixture'],
          ['EVENT', event],
          ['REF', ref],
          ['GITHUB_REPOSITORY', 'taucad/tau'],
          ['GITHUB_SHA', 'abc123'],
          ['GITHUB_OUTPUT', output],
        ]),
      });
      expect(result.status, result.stderr).toBe(0);
      const outputs = Object.fromEntries(
        readFileSync(output, 'utf8')
          .trim()
          .split('\n')
          .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
      );
      return { ...outputs, calls: readFileSync(join(directory, 'calls'), 'utf8') };
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  };

  it('should reuse a queue run that is still in progress once its required gate passed', () => {
    const outputs = verdict([
      {
        id: 7,
        createdAt: '2026-11-12T01:40:00Z',
        jobs: [...gatePassed, running('API tests (Postgres + MinIO)'), running('Standalone projects (npm)')],
      },
    ]);
    expect(outputs['run-id']).toBe('7');
    expect(outputs['affected-base']).toBe('HEAD^1');
    expect(outputs['calls']).toContain('head_sha=abc123&event=merge_group&per_page=10');
  });

  it('should reuse a queue run the sweep cancelled after its required gate passed', () => {
    const outputs = verdict([
      {
        id: 8,
        createdAt: '2026-11-12T01:40:00Z',
        jobs: [...gatePassed, done('Formal models', 'cancelled'), done('Standalone projects (npm)', 'cancelled')],
      },
    ]);
    expect(outputs['run-id']).toBe('8');
    expect(outputs['affected-base']).toBe('HEAD^1');
  });

  it('should report only the run and the base, never a lane', () => {
    expect(Object.keys(action.outputs).sort()).toEqual(['affected-base', 'run-id']);
    // The only job names the action reads are the gate's two; every other job of `ci.yml` is covered by
    // `Run affected tasks`, which waits for it.
    const source = read('.github/actions/queue-verdict/action.yml');
    const gate = new Set(['Run affected tasks', 'Validate workspace']);
    const names = Object.values(ci.jobs)
      .map((definition) => (definition as { readonly name?: string }).name ?? '')
      .filter((name) => name !== '' && !gate.has(name))
      .map((name) => name.replaceAll(/\s*\(?\$\{\{[^}]*\}\}\)?/gu, '').trim())
      .filter((name) => name !== '');
    expect(names.length).toBeGreaterThan(10);
    for (const name of names) {
      expect(source, name).not.toContain(name);
    }
    for (const key of Object.keys(laneSelectors)) {
      expect(source, key).not.toMatch(new RegExp(`["'\\s{,]${key}["':]`, 'u'));
    }
  });

  it.each([
    ['the gate failed', [done('Validate workspace', 'success'), done('Run affected tasks', 'failure')]],
    ['the gate was cancelled', [done('Validate workspace', 'success'), done('Run affected tasks', 'cancelled')]],
    ['the gate is still running', [done('Validate workspace', 'success'), running('Run affected tasks')]],
    ['the run never reached the gate', [done('Validate workspace', 'success'), done('Affected (lint)', 'cancelled')]],
    ['the workspace validators failed', [done('Validate workspace', 'failure'), done('Run affected tasks', 'success')]],
    [
      'the workspace validators are still running',
      [running('Validate workspace'), done('Run affected tasks', 'success')],
    ],
  ] as const)('should never reuse a queue run when %s, and still diff against its base', (_case, jobs) => {
    const outputs = verdict([{ id: 9, createdAt: '2026-11-12T01:40:00Z', jobs }]);
    expect(outputs['run-id']).toBe('');
    // A merge-group run exists on the commit whatever its outcome, so the lanes run against the queue's base.
    expect(outputs['affected-base']).toBe('HEAD^1');
  });

  it('should pick the most recent queue run on the commit whose required gate passed', () => {
    const older = { id: 10, createdAt: '2026-11-12T01:00:00Z', jobs: gatePassed };
    const newer = { id: 11, createdAt: '2026-11-12T01:30:00Z', jobs: gatePassed };
    const failed = {
      id: 12,
      createdAt: '2026-11-12T01:50:00Z',
      jobs: [done('Validate workspace', 'success'), done('Run affected tasks', 'failure')],
    };
    expect(verdict([older, newer])['run-id']).toBe('11');
    expect(verdict([newer, older])['run-id']).toBe('11');
    expect(verdict([failed, older, newer])['run-id']).toBe('11');
  });

  it('should find nothing and call nothing outside a push to main', () => {
    const run = { id: 13, createdAt: '2026-11-12T01:00:00Z', jobs: gatePassed };
    for (const [event, ref] of [
      ['merge_group', 'refs/heads/gh-readonly-queue/main/pr-1-abc'],
      ['pull_request', 'refs/pull/1/merge'],
      ['push', 'refs/heads/release/ui'],
    ] as const) {
      const outputs = verdict([run], event, ref);
      expect(outputs['run-id'], event).toBe('');
      expect(outputs['affected-base'], event).toBe('');
      expect(outputs['calls'], event).toBe('');
    }
  });

  it('should keep the nx-set-shas base on a bypass push with no queue run', () => {
    const outputs = verdict([]);
    expect(outputs['run-id']).toBe('');
    expect(outputs['affected-base']).toBe('');
  });
});
