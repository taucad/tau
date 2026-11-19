import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  readonly secrets?: Record<string, string> | string;
  readonly env?: Record<string, string>;
  readonly name?: string;
  readonly permissions?: Record<string, string>;
  readonly strategy?: { readonly matrix?: Record<string, unknown> };
};
type Workflow = {
  readonly on?: {
    readonly pull_request?: { readonly types?: readonly string[] };
    readonly push?: { readonly paths?: readonly string[] };
    readonly workflow_call?: { readonly inputs?: Record<string, { readonly type?: string }> };
  };
  readonly concurrency?: { readonly group?: string; readonly 'cancel-in-progress'?: string };
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

/**
 * The Nx targets a shell command runs, and whether its projects are selected by `affected` there. `job` is every
 * command of the command's job: a lane deals the projects of the task graph an earlier step's `nx affected` wrote.
 */
const nxTargets = (
  command: string,
  job: string = command,
): ReadonlyArray<{ readonly target: string; readonly affected: boolean }> => {
  const found: Array<{ target: string; affected: boolean }> = [];
  for (const [line] of command.matchAll(/\bnx\s+(?:run-many|affected)\b[^\n]*/gu)) {
    // `nx affected`, or `run-many` over a `--projects` list this script took from `nx show projects --affected`
    // or from the task graph `nx affected --graph=<file>` wrote.
    const affected =
      /\bnx\s+affected\b/u.test(line) ||
      (/\s--projects\s+"\$\w+"/u.test(line) &&
        /\bnx (?:show projects --affected\b|affected\b[^\n]*\s--graph=)/u.test(job));
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

/**
 * The plan's lane selectors: each lane is the affected projects carrying every tag and target listed, and
 * `pr` is its pull-request rule (`queue`: none on a pull request; `touched`: only the projects its diff touches).
 */
const laneSelectors = JSON.parse(planStep?.env?.['LANE_SELECTORS'] ?? '{}') as Record<
  string,
  {
    readonly type?: string;
    readonly tags?: readonly string[];
    readonly targets?: readonly string[];
    readonly pr?: 'queue' | 'touched' | 'paths';
    readonly queue?: 'touched' | 'any-touched' | 'closure' | 'never';
  }
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
      .flatMap((step) => nxTargets(step.run ?? '', (definition.steps ?? []).map(({ run }) => run ?? '').join('\n')))
      .filter(({ target }) => isTestTarget(target)),
  }))
  .filter(({ targets }) => targets.length > 0);

describe('ci.yml affected-only lanes', () => {
  it('should find the service lanes that run project test targets', () => {
    expect([...affectedPlanOutputs()]).toEqual(
      expect.arrayContaining(['api', 'billing', 'cli-e2e', 'size', 'formal', 'browser', 'geospec-examples']),
    );
    expect(testJobs.map(({ name }) => name)).toEqual(
      expect.arrayContaining(['affected-lane', 'api-shard', 'billing-e2e', 'cli-e2e']),
    );
  });

  it('should select every lane from one affected list and one graph', () => {
    expect(planScript).toMatch(/^\s*affected=\$\(pnpm nx show projects --affected --json \| tail -1\)$/mu);
    expect(planScript).toMatch(/^\s*pnpm nx graph --file="\$RUNNER_TEMP\/graph\.json" > \/dev\/null$/mu);
    expect(planScript.match(/\bnx show projects\b/gu)).toHaveLength(1);
    // A selector naming a tag or target that no project has fails the plan instead of leaving its lane off.
    expect(planScript).toContain('error("lane selectors name a tag or target no project has');
    expect(planScript).toContain('error("lane selectors name a pull-request rule other than queue, touched or paths")');
    expect(planScript).toContain(
      'error("lane selectors name a merge-queue rule other than touched, any-touched, closure or never")',
    );
    expect(laneSelectors).toEqual({
      apps: { type: 'app' },
      api: { tags: ['scope:api'], pr: 'touched' },
      'api-image': { targets: ['docker:smoke'] },
      billing: { targets: ['test:billing-foundation'], pr: 'queue' },
      'cli-e2e': { targets: ['test:scenarios'], pr: 'queue' },
      size: { targets: ['size'] },
      formal: { targets: ['formal:tla'], pr: 'queue' },
      'formal-nightly': { targets: ['formal:nightly'], pr: 'queue', queue: 'touched' },
      'geospec-examples': { targets: ['test-geospec'], pr: 'queue' },
      browser: { tags: ['ci:browser'], targets: ['verify-browser'], pr: 'touched' },
      'native-hosts': { tags: ['ci:native-hosts'], pr: 'queue', queue: 'closure' },
      'native-linux': { targets: ['test:native-linux'], pr: 'queue', queue: 'closure' },
      'native-darwin': { targets: ['test:native-darwin'], pr: 'queue' },
      'viewer-parity': { targets: ['test:viewer-parity'], pr: 'paths', queue: 'never' },
      desktop: { tags: ['ci:desktop'] },
      shell: { tags: ['ci:shell'], pr: 'queue', queue: 'any-touched' },
      'e2e-queue': { targets: ['test:e2e:queue'], pr: 'touched' },
      'compute-qualify': { targets: ['compute-qualify-ci'] },
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
      'pkgcheck',
      'browser',
      'geospec-examples',
      'cli-e2e',
      'native-hosts',
      'native-darwin',
      'viewer-parity',
      'formal',
      'api',
      'billing-e2e',
      'shell',
      'formal-nightly',
      'e2e-queue',
      'compute-qualify',
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
    const lane = ci.jobs['affected-lane'];
    const targets = lane?.env?.['BUILD_TARGETS'] ?? '';
    expect(targets).toBe(
      'build size check-desktop-payload check-critical-budget check-critical-budget-adaptive check-static-shells check-server-output check-route-module-patch check-cadmpeg-engine-absence check-serve-ui-layer',
    );
    // Both build shards take their projects from one `nx affected` over these targets, and run them all.
    const pins = steps.find((step) => step.id === 'pins')?.run ?? '';
    expect(pins).toContain('build-*) pnpm nx affected -t $BUILD_TARGETS --graph="$graph" > /dev/null ;;');
    expect(run).toContain('if [ "$kind" = build ]; then targets=$(tr \' \' \',\' <<< "$BUILD_TARGETS"); fi');
    expect(run).toContain('pnpm nx run-many -t "$targets" --projects "$shard" --parallel=1');
    expect(lane?.strategy?.matrix?.['lane']).toEqual(expect.arrayContaining(['build-1', 'build-2']));
    const build = `pnpm nx affected -t ${targets} --parallel=1`;
    expect(nxTargets(build)).toContainEqual({ target: 'check-desktop-payload', affected: true });
    // The critical-path budget (PL0) runs beside it in the same lane, so a ui change is held to its budget.
    expect(nxTargets(build)).toContainEqual({ target: 'check-critical-budget', affected: true });
    // So do the static-shell invariants (PL3), on the same build.
    expect(nxTargets(build)).toContainEqual({ target: 'check-static-shells', affected: true });
    // The SSR bundle budget (`ui:size`) and the server-output check (RR0) run there too.
    expect(nxTargets(build)).toContainEqual({ target: 'size', affected: true });
    expect(nxTargets(build)).toContainEqual({ target: 'check-server-output', affected: true });
    // And the check that every client build ships the patched React Router route-module loader (RR8).
    expect(nxTargets(build)).toContainEqual({ target: 'check-route-module-patch', affected: true });
    // And the check that no client build holds a cadmpeg engine, recognised by its installed digest (cadmpeg D16, I1).
    expect(nxTargets(build)).toContainEqual({ target: 'check-cadmpeg-engine-absence', affected: true });
    // And the serve UI layer's size line, per pull request as well as at release (X2, cadmpeg D16, I11).
    expect(nxTargets(build)).toContainEqual({ target: 'check-serve-ui-layer', affected: true });
    // The target belongs to `ui`, so `nx affected` selects it exactly when `ui` is affected, and it brings
    // the renderer and desktop main/preload builds it reads.
    const ui = JSON.parse(read('apps/ui/project.json')) as {
      targets: Record<string, { readonly dependsOn?: readonly unknown[] }>;
    };
    expect(ui.targets['check-desktop-payload']?.dependsOn).toEqual([
      'build:desktop',
      { projects: ['desktop'], target: 'build' },
    ]);
    // `size` and `check-server-output` exist on ui, so the lane's names select them, and each reads the builds it
    // checks; the docs site checks its own build.
    expect(ui.targets['size']?.dependsOn).toEqual(['build']);
    expect(ui.targets['check-static-shells']?.dependsOn).toEqual(['build']);
    expect(ui.targets['check-server-output']?.dependsOn).toEqual(['build', 'build:desktop', 'build:serve']);
    expect(ui.targets['check-route-module-patch']?.dependsOn).toEqual(['build', 'build:desktop', 'build:serve']);
    expect(ui.targets['check-cadmpeg-engine-absence']?.dependsOn).toEqual(['build', 'build:desktop', 'build:serve']);
    expect(ui.targets['check-serve-ui-layer']?.dependsOn).toEqual(['build:serve']);
    const docs = JSON.parse(read('apps/docs/project.json')) as {
      targets: Record<string, { readonly dependsOn?: readonly unknown[] }>;
    };
    expect(docs.targets['check-server-output']?.dependsOn).toEqual(['build']);
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

  it('should apply the pull-request rule of each lane from its selector alone, naming no lane', () => {
    const start = planScript.indexOf('if [ "$GITHUB_EVENT_NAME" = pull_request ]; then');
    const block = planScript.slice(start, planScript.indexOf('\nfi\n', start));
    // One pull-request rule, applied to the selection before any flag is read from it.
    expect(planScript.match(/if \[ "\$GITHUB_EVENT_NAME" = pull_request \]; then/gu)).toHaveLength(1);
    expect(start).toBeGreaterThan(planScript.indexOf('selected=$lanes'));
    expect(start).toBeLessThan(planScript.indexOf('flag() {'));
    expect(block).toContain('if $rule == "queue" then .value = []');
    expect(block).toContain('elif $rule == "touched" then');
    for (const key of Object.keys(laneSelectors)) {
      expect(block, key).not.toMatch(new RegExp(`\\b${key.replaceAll('-', '_')}=|"${key}"`, 'u'));
    }
    // Touched files are Nx's own: `git diff --no-renames --relative` from the merge base of its base and head.
    expect(block).toContain(
      'git diff --name-only --no-renames --relative "$(git merge-base "$NX_BASE" "$head")" "$head"',
    );
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
    expect(Object.keys(planStep?.env ?? {}).sort()).toEqual([
      'COMPUTE_QUALIFY_LANE_PATHS',
      'COMPUTE_QUALIFY_LANE_PROJECTS',
      'LANE_SELECTORS',
      'NATIVE_DARWIN_LANE_PATHS',
      'QUEUE_HUBS',
      'REUSED',
      'SHELL_LANE_PATHS',
      'VIEWER_PARITY_LANE_PATHS',
      'VIEWER_PARITY_PINS',
    ]);
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
      'api-shard',
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
    const lane = ci.jobs['api-shard'];
    const steps = lane?.steps ?? [];
    const suites = steps.filter((step) => /\bnx\s+(?:run-many|affected)\s+-t\s+test(?:\s|$)/u.test(step.run ?? ''));
    // One step runs `test`, selected by `nx affected` over the tag: never every API suite with `run-many`.
    // `nx affected` ignores `--projects`; excluding every project but the tag is what narrows it.
    expect(suites.map((step) => step.run?.trim())).toEqual([
      `pnpm nx affected -t test --exclude '*,!tag:scope:api' --parallel=1 -- --shard=${expression('matrix.shard')}/2 --passWithNoTests`,
    ]);
    // Two shards, each with its own services, and the required check passes only when both did (ST-3).
    expect(lane?.strategy?.matrix?.['shard']).toEqual([1, 2]);
    expect(lane?.if).toBe(
      expression("!cancelled() && needs.plan.result == 'success' && needs.plan.outputs.api == 'true'"),
    );
    const required = ci.jobs['api'];
    expect(required?.name).toBe('API tests (Postgres + MinIO)');
    expect(required?.needs).toEqual(['plan', 'api-shard']);
    expect(required?.steps?.map((step) => step.run)).toEqual(['test "$SHARDS_RESULT" = success']);
    expect(required?.steps?.[0]?.env?.['SHARDS_RESULT']).toBe(expression('needs.api-shard.result'));
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

  it('should shard the CLI end-to-end lane and name each shard to the target through TAU_CI_SHARD', () => {
    const lane = ci.jobs['cli-e2e'];
    const shards = lane?.strategy?.matrix?.['shard'] as readonly number[] | undefined;
    expect(shards).toEqual([1, 2]);
    expect(lane?.name).toBe(`CLI end-to-end (${expression('matrix.shard')}/${String(shards?.length)})`);
    expect(lane?.env?.['TAU_CI_SHARD']).toBe(`${expression('matrix.shard')}/${String(shards?.length)}`);
    const target = (
      JSON.parse(readFileSync(resolve(root, 'apps/cli-e2e/project.json'), 'utf8')) as {
        targets: Record<string, { inputs?: unknown[] }>;
      }
    ).targets['test:scenarios'];
    // Without the input both shards would share one cache entry and the second would replay the first.
    expect(target?.inputs).toContainEqual({ env: 'TAU_CI_SHARD' });
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

  it('should pass the affected test:native-linux projects and the Linux hosts alone to the native host rows', () => {
    expect(ci.jobs['native-hosts']?.with).toEqual({
      hosts: 'linux',
      'native-linux': expression('needs.plan.outputs.native-linux'),
    });
    // The darwin-x64 rows run at the desktop candidate gate, never in the merge queue (INTEL-1).
    expect(ci.jobs['plan']?.outputs).not.toHaveProperty('native-intel');
    expect(planScript).not.toContain('native-intel');
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
      ['NATIVE_DARWIN', 'native-darwin', 'native-darwin'],
      ['VIEWER_PARITY', 'viewer-parity', 'viewer-parity'],
      ['FORMAL', 'formal', 'formal'],
      ['API', 'api', 'api'],
      ['BILLING', 'billing-e2e', 'billing'],
      ['COMPUTE_QUALIFY', 'compute-qualify', 'compute-qualify'],
    ] as const) {
      expect(gateStep?.env?.[`${key}_REQUIRED`]).toBe(expression(`needs.plan.outputs.${output}`));
      expect(gateStep?.env?.[`${key}_RESULT`]).toBe(expression(`needs.${job}.result`));
      expect(check).toContain(`if [ "$${key}_REQUIRED" = true ]; then test "$${key}_RESULT" = success; fi`);
    }
  });

  it('should run the native host rows and viewer parity on a push only when the queue did not prove it', () => {
    expect(planScript).toContain('viewer_parity=$(flag viewer-parity)');
    // No push override: a push that reuses the queue verdict empties every lane, and any other push runs
    // the rows from ci.yml, since native-hosts.yml has no push trigger of its own (Q-3).
    expect(planScript).not.toContain('if [ "$GITHUB_EVENT_NAME" = push ]; then');
    expect(planScript).toContain(`lanes=$(jq -c 'map_values([])' <<< "$lanes")`);
    expect(nativeHosts.on?.push).toBeUndefined();
  });

  it.each([
    ['native-hosts', nativeHosts],
    ['viewer-parity', viewerParity],
  ])('should run %s from ci.yml', (_name, workflow) => {
    expect(workflow.on !== undefined && 'workflow_call' in workflow.on).toBe(true);
    // A group equal to the caller's (`github.workflow` is `CI` in a called workflow) would cancel the call.
    expect(workflow.concurrency?.group ?? '').not.toContain('github.workflow');
  });

  it('should never run native hosts on a pull request', () => {
    expect(nativeHosts.on?.pull_request).toBeUndefined();
  });

  it('should run viewer parity on a labelled pull request on demand, and never stop a call at the label guard', () => {
    expect(viewerParity.on?.pull_request).toEqual({ types: ['opened', 'synchronize', 'reopened', 'labeled'] });
    // One guard on the first job: `viewer` and `gate` need it, so they skip with it. A call from a pull request's CI
    // run sees `pull_request` as its event, so the call's `ref` passes it first.
    expect(viewerParity.jobs['fixtures']?.if).toBe(
      "inputs.ref != '' || " +
        "github.event_name != 'pull_request' || " +
        "(contains(github.event.pull_request.labels.*.name, 'viewer-parity') && " +
        "(github.event.action != 'labeled' || github.event.label.name == 'viewer-parity') && " +
        "github.triggering_actor != 'dependabot[bot]')",
    );
    expect(viewerParity.jobs['viewer']?.needs).toBe('fixtures');
    expect(viewerParity.jobs['gate']?.needs).toEqual(['fixtures', 'viewer']);
    // Only a labelled pull request's own runs share a group and cancel; a call, a push or a dispatch gets its run's
    // own group, so neither a labelled run nor a newer push cancels a called run's parity jobs.
    expect(viewerParity.concurrency?.group).toContain(
      "github.event_name == 'pull_request' && inputs.ref == '' && format('pr-{0}', github.event.pull_request.number) || github.run_id",
    );
    expect(viewerParity.concurrency?.group).toContain("github.event.label.name != 'viewer-parity' && '-other-label'");
    expect(viewerParity.concurrency?.['cancel-in-progress']).toBe(
      expression("github.event_name == 'pull_request' && inputs.ref == ''"),
    );
    // The ci.yml call names the commit on its call, which is what tells a call from a labelled run.
    expect(ci.jobs['viewer-parity']?.with).toEqual({ ref: expression('github.sha') });
    expect(viewerParity.on?.workflow_call?.inputs?.['ref']).toMatchObject({ type: 'string', required: true });
  });

  it('should take viewer parity out of the merge queue and run it on pull requests by their own paths (VP-1)', () => {
    expect(laneSelectors['viewer-parity']).toEqual({ targets: ['test:viewer-parity'], pr: 'paths', queue: 'never' });
    const paths = JSON.parse(planStep?.env?.['VIEWER_PARITY_LANE_PATHS'] ?? '[]') as string[];
    // The viewer and its capture code, the packages it renders through, the image plugin, the render profile and
    // capture options, the parity scripts, manifest and committed fixtures, and the workflow; no kernel plugin.
    expect(paths).toEqual(
      expect.arrayContaining([
        '.github/workflows/viewer-parity.yml',
        'packages/viewer',
        'packages/three',
        'packages/camera',
        'packages/plugins/image',
        'libs/types/src/constants/viewer-render-profile.constants.ts',
        'libs/agent-tools/src/capture',
        'libs/tau-examples/fixtures/viewer-parity',
        'libs/tau-examples/scripts/export-parity-fixtures.mts',
        'libs/tau-examples/vitest.viewer-parity.config.ts',
      ]),
    );
    expect(paths.filter((path) => /^packages\/plugins\/(?!image$)/u.test(path))).toEqual([]);
    for (const path of paths) {
      expect(existsSync(resolve(root, path)), path).toBe(true);
    }
    // The committed fixture GLBs lie under a listed path; the generated ones come from the manifest's sources.
    const manifest = JSON.parse(read('libs/tau-examples/fixtures/viewer-parity/fixtures.json')) as {
      readonly fixtures: ReadonlyArray<{ readonly glb: string }>;
    };
    for (const { glb } of manifest.fixtures.filter((fixture) => !fixture.glb.startsWith('out/'))) {
      expect(
        paths.some((path) => glb === path || glb.startsWith(`${path}/`)),
        glb,
      ).toBe(true);
    }
    expect(JSON.parse(planStep?.env?.['VIEWER_PARITY_PINS'] ?? '[]')).toEqual(['three', 'nanoraster(-[a-z0-9-]+)?']);
  });

  it('should push only to save the fixture cache, and still select viewer parity on a push through the graph', () => {
    expect(viewerParity.on?.push).toEqual({
      branches: ['main'],
      paths: [
        'libs/tau-examples/src/kernels/**',
        'libs/tau-examples/scripts/export-parity-fixtures.mts',
        'libs/tau-examples/fixtures/viewer-parity/fixtures.json',
        'pnpm-lock.yaml',
      ],
    });
    expect(viewerParity.jobs['viewer']?.if).toBe("inputs.ref != '' || github.event_name != 'push'");
    const examples = JSON.parse(read('libs/tau-examples/project.json')) as {
      readonly targets: Record<string, { readonly inputs?: readonly string[] }>;
    };
    expect(examples.targets['test:viewer-parity']?.inputs).toEqual([
      'default',
      '^default',
      '{workspaceRoot}/.github/workflows/viewer-parity.yml',
    ]);
  });

  it('should skip the native-hosts plan when ci.yml calls it and take the rows from ci.yml', () => {
    expect(nativeHosts.on?.workflow_call?.inputs?.['native-linux']?.type).toBe('string');
    expect(nativeHosts.on?.workflow_call?.inputs?.['hosts']?.type).toBe('string');
    expect(nativeHosts.on?.workflow_call?.inputs?.['ref']?.type).toBe('string');
    expect(nativeHosts.on?.workflow_call?.inputs).not.toHaveProperty('intel');
    // `inputs.hosts` is set only on a call, so it tells a call from a dispatch.
    expect(nativeHosts.jobs['plan']?.if).toBe("inputs.hosts == ''");
    expect(nativeHosts.jobs['linux']?.if).toBe(
      expression("!cancelled() && (inputs.hosts == 'linux' || needs.plan.outputs.linux == 'true')"),
    );
    // The `test:native-linux` rows, one job per project (ST-3), from the same selection.
    expect(nativeHosts.jobs['native-linux-rows']?.if).toBe(nativeHosts.jobs['linux']?.if);
    expect(
      nativeHosts.jobs['native-linux-rows']?.steps?.find((step) => step.env?.['NATIVE_LINUX'])?.env?.['NATIVE_LINUX'],
    ).toBe(expression('inputs.native-linux || needs.plan.outputs.native-linux'));
    // The Intel rows run only for the desktop candidate gate's call (`hosts: intel`) and a dispatch (INTEL-1).
    expect(nativeHosts.jobs['intel']?.if).toBe(
      expression("!cancelled() && (inputs.hosts == 'intel' || needs.plan.outputs.intel == 'true')"),
    );
    // A called run gets its own group, so a newer push never replaces a `main` run's rows.
    expect(nativeHosts.concurrency?.group).toContain("inputs.hosts != '' && github.run_id");
  });
});

describe('ci.yml desktop lane', () => {
  it('should plan the desktop lane from tag:ci:desktop alone', () => {
    expect(laneSelectors['desktop']).toEqual({ tags: ['ci:desktop'] });
    expect(affectedPlanOutputs()).toContain('desktop');
    expect(planScript).toContain('desktop=$(flag desktop)');
    expect(planScript).toContain(`desktop_projects=$(jq -c '.desktop' <<< "$lanes")`);
    expect(planScript).toContain('echo "desktop-projects=$desktop_projects"');
    expect(ci.jobs['plan']?.outputs?.['desktop-projects']).toBe(expression('steps.plan.outputs.desktop-projects'));
  });

  it('should record the desktop lane in lanes.json without making it a planned staging lane', () => {
    expect(planScript).toContain('--arg desktop "$desktop" --argjson desktop_projects "$desktop_projects"');
    expect(planScript).toContain('desktop: $desktop, "desktop-projects": $desktop_projects}');
    const check = staging.jobs['ci']?.steps?.find((step) => step.id === 'check');
    expect(JSON.parse(check?.env?.['PLANNED_LANES'] ?? '[]')).not.toContain('desktop');
  });

  it('should run the packaged desktop suite on the candidate gate, not in the merge queue (D-DS1 b)', () => {
    for (const [name, definition] of Object.entries(ci.jobs)) {
      expect(definition.if ?? '', name).not.toContain('needs.plan.outputs.desktop');
      for (const step of definition.steps ?? []) {
        expect(step.run ?? '', name).not.toMatch(/test:e2e:(?:packaged|desktop:completed-artifact)\b/u);
      }
    }
    expect(read('.github/workflows/release-desktop-staging.yml')).toContain(
      'uses: ./.github/workflows/desktop-packaged.yml',
    );
  });
});

describe('ci.yml shell lane (shell split blueprint PR 4)', () => {
  type ShellWorkflow = {
    readonly on: {
      readonly workflow_dispatch?: { readonly inputs?: Record<string, unknown> };
      readonly workflow_call?: {
        readonly inputs?: Record<string, { readonly type?: string; readonly required?: boolean }>;
      };
    };
    readonly concurrency?: { readonly group?: string; readonly 'cancel-in-progress'?: string };
    readonly jobs: Record<string, Job>;
  };
  const shellText = read('.github/workflows/shell-conformance.yml');
  const shellWorkflow = load(shellText) as ShellWorkflow;
  const allProjects = [
    'sandbox',
    'native-process-core',
    'shell-service',
    'host',
    'desktop-terminal',
    'desktop-services-host',
    'desktop-e2e',
  ];
  const queueProjects = [
    'desktop-services-host',
    'desktop-terminal',
    'host',
    'native-process-core',
    'sandbox',
    'shell-service',
  ];
  const guard = (project: string): string => `contains(fromJSON(needs.select.outputs.projects), '${project}')`;
  const lane = ci.jobs['shell'];
  const condition =
    "!cancelled() && needs.plan.result == 'success' && needs.plan.outputs.shell == 'true' && github.event_name == 'merge_group'";

  it('should plan the shell lane from tag:ci:shell, in the merge queue only', () => {
    expect(laneSelectors['shell']).toEqual({ tags: ['ci:shell'], pr: 'queue', queue: 'any-touched' });
    expect(affectedPlanOutputs()).toContain('shell');
    expect(planScript).toContain('shell=$(flag shell)');
    expect(planScript).toContain(`shell_projects=$(jq -c '.shell' <<< "$lanes")`);
    expect(planScript).toContain('echo "shell-projects=$shell_projects"');
    expect(ci.jobs['plan']?.outputs?.['shell-projects']).toBe(expression('steps.plan.outputs.shell-projects'));
  });

  it('should tag exactly the six queue projects ci:shell', { timeout: 60_000 }, async () => {
    const { createProjectGraphAsync, readCachedProjectGraph } = await import('@nx/devkit');
    const graph = await (async () => {
      try {
        return readCachedProjectGraph();
      } catch {
        return createProjectGraphAsync();
      }
    })();
    const tagged = Object.values(graph.nodes)
      .filter(({ data }) => (data.tags ?? []).includes('ci:shell'))
      .map(({ name }) => name)
      .toSorted();
    expect(tagged).toEqual(queueProjects);
  });

  it('should select the lane on exactly the four fixture and workflow paths the graph does not see', () => {
    const paths = JSON.parse(planStep?.env?.['SHELL_LANE_PATHS'] ?? '[]') as string[];
    expect(paths).toEqual([
      '.github/workflows/shell-conformance.yml',
      'apps/desktop/scripts/hosted-linux-bwrap-fixture.mts',
      'apps/desktop/scripts/linux-apt-package.mts',
      'apps/desktop/scripts/runtime-stage.mts',
    ]);
    for (const path of paths) {
      expect(() => read(path), path).not.toThrow();
    }
    // The check reads the plan's own diff, before the reuse and pull-request rules, and adds the sandbox rows.
    const check = planScript.indexOf(['git diff --name-only --no-renames "$NX_BASE" "$', '{NX_HEAD:-HEAD}"'].join(''));
    expect(check).toBeGreaterThan(planScript.indexOf('lanes=$(jq -c --argjson affected'));
    expect(check).toBeLessThan(planScript.indexOf('selected=$lanes'));
    expect(planScript).toContain(`lanes=$(jq -c '.shell |= (. + ["sandbox"] | unique)' <<< "$lanes")`);
    // Not target inputs: those would mark the sandbox and every dependent affected in the ordinary lanes.
    const sandbox = JSON.parse(read('libs/sandbox/project.json')) as {
      readonly targets: Record<string, { readonly inputs?: readonly unknown[] }>;
    };
    for (const [target, configuration] of Object.entries(sandbox.targets)) {
      expect(JSON.stringify(configuration.inputs ?? []), target).not.toMatch(
        /apps\/desktop\/scripts|shell-conformance\.yml/u,
      );
    }
  });

  it('should call the semantics tier with the planned projects on the queue commit', () => {
    expect(lane?.uses).toBe('./.github/workflows/shell-conformance.yml');
    expect(lane?.needs).toEqual(['plan']);
    expect(lane?.with).toEqual({
      ref: expression('github.sha'),
      tier: 'semantics',
      projects: expression('needs.plan.outputs.shell-projects'),
    });
    expect(lane?.permissions).toEqual({ contents: 'read' });
    // The read token alone, never `inherit`: the called macOS job's `nx-cache-write` environment supplies the write token.
    expect(lane?.secrets).toEqual(
      Object.fromEntries([
        ['NX_SELF_HOSTED_REMOTE_CACHE_ACCESS_TOKEN', expression('secrets.NX_SELF_HOSTED_REMOTE_CACHE_ACCESS_TOKEN')],
      ]),
    );
  });

  it('should restrict the reusable call to the merge queue and never widen it', () => {
    expect(lane?.if).toBe(expression(condition));
    // A reusable-workflow call may narrow to `merge_group`; no other event, branch or `||` clause may run it.
    expect(lane?.uses).toBeDefined();
    const rest = condition.replace(" && github.event_name == 'merge_group'", '');
    expect(rest).not.toMatch(/\|\||\bgithub\.(?:ref|ref_name|event_name|base_ref|head_ref)\b/u);
    // The required gate and the fail-fast jobs run no lane (ci-fail-fast.test.ts).
    for (const [name, definition] of Object.entries(ci.jobs)) {
      if (
        !/^(?:affected|fail-fast-.*)$/u.test(name) &&
        (definition.if ?? '').includes("github.event_name == 'merge_group'")
      ) {
        expect(definition.uses, name).toBeDefined();
      }
    }
  });

  it('should require the shell lane in the required check when the queue planned it', () => {
    const gate = ci.jobs['affected'];
    expect(gate?.needs).toContain('shell');
    const step = gate?.steps?.[0];
    expect(step?.env?.['SHELL_REQUIRED']).toBe(expression('needs.plan.outputs.shell'));
    expect(step?.env?.['SHELL_RESULT']).toBe(expression('needs.shell.result'));
    expect(step?.env?.['EVENT']).toBe(expression('github.event_name'));
    const check = step?.run ?? '';
    const rule =
      'if [ "$SHELL_REQUIRED" = true ] && [ "$EVENT" = merge_group ]; then test "$SHELL_RESULT" = success; fi';
    expect(check).toContain(rule);
    expect(check.indexOf(rule)).toBeGreaterThan(check.indexOf('if [ -n "$REUSED" ]; then'));
  });

  it('should take tier and projects as workflow_call inputs only', () => {
    const inputs = shellWorkflow.on.workflow_call?.inputs ?? {};
    expect(Object.keys(inputs).toSorted()).toEqual(['projects', 'ref', 'tier']);
    expect(inputs['tier']).toMatchObject({ type: 'string', required: false });
    expect(inputs['projects']).toMatchObject({ type: 'string', required: false });
    // A dispatch declares neither, so every run the promotion lookup can find is a full run.
    expect('workflow_dispatch' in shellWorkflow.on).toBe(true);
    expect(shellWorkflow.on.workflow_dispatch?.inputs?.['tier']).toBeUndefined();
    expect(shellWorkflow.on.workflow_dispatch?.inputs?.['projects']).toBeUndefined();
    // A call keeps the candidate group, so a queue call never cancels a candidate call.
    expect(shellWorkflow.concurrency?.group).toContain("inputs.ref && format('candidate-{0}', inputs.ref)");
  });

  it('should normalize the empty inputs once, in the select job', () => {
    const { select } = shellWorkflow.jobs;
    expect(select?.outputs).toEqual({
      tier: expression('steps.select.outputs.tier'),
      projects: expression('steps.select.outputs.projects'),
      'macos-rows': expression('steps.select.outputs.macos-rows'),
    });
    const step = select?.steps?.find((candidate) => candidate.id === 'select');
    expect(step?.env?.['TIER']).toBe(expression("inputs.tier || 'full'"));
    expect(step?.env?.['PROJECTS']).toBe(expression(`inputs.projects || '${JSON.stringify(allProjects)}'`));
    for (const name of ['linux', 'macos']) {
      expect(shellWorkflow.jobs[name]?.needs, name).toBe('select');
    }
  });

  it('should run MAC-X in the full tier only, so the merge queue never waits on macos-26-intel', () => {
    const step = shellWorkflow.jobs['select']?.steps?.find((candidate) => candidate.id === 'select');
    expect(shellWorkflow.jobs['macos']?.strategy?.matrix).toEqual({
      include: expression('fromJSON(needs.select.outputs.macos-rows)'),
    });
    const rowsFor = (tier: string): unknown => {
      const directory = mkdtempSync(join(tmpdir(), 'shell-select-'));
      try {
        const output = join(directory, 'output');
        writeFileSync(output, '');
        const result = spawnSync('bash', ['-c', step?.run ?? ''], {
          encoding: 'utf8',
          env: Object.fromEntries([
            ...Object.entries(process.env),
            ['TIER', tier],
            ['PROJECTS', JSON.stringify(allProjects)],
            ['GITHUB_OUTPUT', output],
          ]),
        });
        expect(result.status, result.stderr).toBe(0);
        const line = readFileSync(output, 'utf8')
          .split('\n')
          .find((entry) => entry.startsWith('macos-rows='));
        return JSON.parse(line?.slice('macos-rows='.length) ?? 'null') as unknown;
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    };
    const macA = { runner: 'macos-26', row: 'MAC-A' };
    const macX = { runner: 'macos-26-intel', row: 'MAC-X' };
    // The candidate gate, a dispatch, the drift check and the label pass no tier: both rows, fresh.
    expect(rowsFor('full')).toEqual([macA, macX]);
    // The merge queue's call: MAC-A alone (merge-queue defects MQ-1).
    expect(rowsFor('semantics')).toEqual([macA]);
  });

  it('should guard every nx run step by its project and read no input directly', () => {
    let guarded = 0;
    for (const [name, definition] of Object.entries(shellWorkflow.jobs)) {
      expect(definition.if ?? '', name).not.toMatch(/\binputs\./u);
      for (const step of definition.steps ?? []) {
        if (name !== 'select') {
          const reads = JSON.stringify({ if: step.if, env: step.env, run: step.run, with: step.with });
          expect(reads, `${name}: ${step.name}`).not.toMatch(/\binputs\.(?:projects|tier)\b/u);
        }
        for (const [, project] of (step.run ?? '').matchAll(/\bnx\s+run\s+([\w-]+):/gu)) {
          expect(step.if ?? '', `${name}: ${step.name}`).toContain(guard(project ?? ''));
          guarded += 1;
        }
      }
    }
    // Six macOS steps (the sandbox, the service, the host's two targets and the two Terminal targets) and the
    // Windows helper build.
    expect(guarded).toBe(7);
    expect(shellText).not.toMatch(/fromJSON\(inputs\./u);
  });

  it('should build and transfer the Electron application in the full tier only', () => {
    const steps = shellWorkflow.jobs['linux']?.steps ?? [];
    const build = steps.find((step) => /\bnx build desktop\b/u.test(step.run ?? ''));
    expect(build?.if).toBe("needs.select.outputs.tier == 'full'");
    const guest = steps.find((step) => (step.run ?? '').includes('shell-conformance-vm.sh'));
    expect(guest?.env?.['TAU_SHELL_TIER']).toBe(expression('needs.select.outputs.tier'));
    expect(guest?.env?.['TAU_SHELL_PROJECTS']).toBe(expression('needs.select.outputs.projects'));
    expect(read('libs/sandbox/scripts/shell-conformance-vm.sh')).toContain(
      'if [[ "$tier" == full ]]; then\n  (cd "$REPO_ROOT" && test -s apps/desktop/dist/main/index.js',
    );
  });

  it('should run each guest target only when its project is listed', () => {
    let current: string | undefined;
    const runs: string[] = [];
    for (const line of read('libs/sandbox/scripts/shell-conformance-guest.sh').split('\n')) {
      const opened = /^if (?:\[\[ "\$tier" == full \]\] && )?listed ([\w-]+); then$/u.exec(line);
      if (opened) {
        current = opened[1];
      } else if (line === 'fi') {
        current = undefined;
      }
      for (const [, project] of line.matchAll(/\brun ([\w-]+):[\w:-]+ --skip-nx-cache/gu)) {
        expect(current, line).toBe(project);
        runs.push(project ?? '');
      }
    }
    expect(runs.toSorted()).toEqual([...allProjects, 'host'].toSorted());
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
      `'{api: ($selected.api != [] | tostring), "billing-e2e": ($selected.billing != [] | tostring), "reused-run": $reused, desktop: $desktop, "desktop-projects": $desktop_projects}'`,
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
    // A composite step's `shell: bash` is the step's interpreter, not the shell lane.
    const steps = source.replaceAll(/^\s+shell: bash$/gmu, '');
    for (const key of Object.keys(laneSelectors)) {
      expect(steps, key).not.toMatch(new RegExp(`["'\\s{,]${key}["':]`, 'u'));
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

// Each case runs ci.yml's real plan script (bash, jq and the fixture graph) in a child process. They take 1–2 s alone,
// but `scripts:validate-workspace-tests` runs this file beside 28 others, and on a loaded runner one case passed
// 5 s (PR #2581, job 134621798477). The budget covers that contention; it does not wait on any race.
describe('plan lane selection', { timeout: 30_000 }, () => {
  /** A project of the fixture graph: its root, tags, target names and any target's configuration. */
  type Node = {
    readonly root: string;
    readonly type?: string;
    readonly tags?: readonly string[];
    readonly targets?: readonly string[];
    readonly config?: Record<string, unknown>;
  };
  // Every tag and target a selector names exists, as the plan requires; the API family is one app and two
  // libraries, and `core` is a library the API depends on (affected through a dependency only).
  const nodes: Record<string, Node> = {
    workspace: { root: '.', type: 'lib' },
    core: { root: 'packages/core', type: 'lib' },
    api: { root: 'apps/api', type: 'app', tags: ['scope:api'], targets: ['test', 'docker:smoke'] },
    'api-e2e': { root: 'apps/api-e2e', type: 'app', tags: ['scope:api'], targets: ['test'] },
    'api-billing': {
      root: 'apps/libs/api-billing',
      type: 'lib',
      tags: ['scope:api'],
      targets: ['test', 'test:billing-foundation', 'formal:nightly'],
    },
    ui: {
      root: 'apps/ui',
      type: 'app',
      tags: ['ci:browser', 'ci:desktop'],
      targets: ['verify-browser', 'size', 'test:viewer-parity', 'formal:tla'],
    },
    cli: {
      root: 'packages/cli',
      type: 'lib',
      tags: ['ci:native-hosts'],
      targets: ['test:scenarios', 'test-geospec', 'test:native-linux', 'test:native-darwin'],
    },
    picogk: {
      root: 'packages/plugins/picogk',
      type: 'lib',
      tags: ['ci:native-hosts'],
      targets: ['test:native-darwin'],
    },
    sandbox: { root: 'libs/sandbox', type: 'lib', tags: ['ci:shell'], targets: ['test:shell-conformance'] },
    'ui-e2e': {
      root: 'apps/ui-e2e',
      targets: ['test:e2e', 'test:e2e:development', 'test:e2e:daemon-host', 'test:e2e:queue'],
      config: {
        'test:e2e': { metadata: { shards: 12 } },
        'test:e2e:queue': { executor: 'nx:noop', dependsOn: ['test:e2e:daemon-host', 'test:e2e:development'] },
      },
    },
    host: {
      root: 'packages/host',
      type: 'lib',
      tags: ['ci:shell'],
      targets: ['test:shell-conformance', 'formal:nightly'],
    },
    replicad: { root: 'packages/plugins/replicad', type: 'lib' },
    'runtime-e2e': { root: 'apps/runtime-e2e', tags: ['ci:quarantined'], targets: ['test', 'compute-qualify-ci'] },
  };
  const everything = Object.keys(nodes).filter((name) => name !== 'workspace');

  /** Runs the plan step with `pnpm` answering `affected` and the graph, `git` answering `files`, and returns its outputs. */
  const plan = (
    event: string,
    {
      affected,
      files,
      selectors = planStep?.env?.['LANE_SELECTORS'] ?? '',
      graphNodes = nodes,
      dependencies = {},
      workspaceDiff = '',
    }: {
      readonly affected: readonly string[];
      readonly files: readonly string[];
      readonly selectors?: string;
      readonly graphNodes?: Record<string, Node>;
      readonly dependencies?: Record<string, readonly string[]>;
      /** The pull request's `git diff -U0` of `pnpm-workspace.yaml`, which the viewer parity pin check reads. */
      readonly workspaceDiff?: string;
    },
  ): {
    readonly status: number | undefined;
    readonly stdout: string;
    readonly stderr: string;
    readonly outputs: Record<string, string>;
  } => {
    const directory = mkdtempSync(join(tmpdir(), 'tau-ci-plan-'));
    try {
      const graph = {
        graph: {
          nodes: Object.fromEntries(
            Object.entries(graphNodes).map(([name, node]) => [
              name,
              {
                name,
                type: node.type,
                data: {
                  root: node.root,
                  tags: node.tags ?? [],
                  targets: Object.fromEntries(
                    (node.targets ?? []).map((target) => [target, node.config?.[target] ?? {}]),
                  ),
                },
              },
            ]),
          ),
          dependencies: Object.fromEntries(
            Object.entries(dependencies).map(([name, targets]) => [
              name,
              targets.map((target) => ({ source: name, target, type: 'static' })),
            ]),
          ),
        },
      };
      writeFileSync(join(directory, 'fixture-graph.json'), JSON.stringify(graph));
      // The plan deals the package checks with the dealer and its snapshot, which it reads from the checkout.
      mkdirSync(join(directory, 'scripts/src'), { recursive: true });
      for (const file of ['test-shard-dealer.ts', 'pkgcheck-shard-durations.json']) {
        copyFileSync(resolve(root, 'scripts/src', file), join(directory, 'scripts/src', file));
      }
      writeFileSync(join(directory, 'affected.json'), JSON.stringify(affected));
      writeFileSync(join(directory, 'files'), files.map((file) => `${file}\n`).join(''));
      writeFileSync(join(directory, 'workspace-diff'), workspaceDiff);
      // The viewer parity check reads the checked-in manifest's example sources from the checkout.
      mkdirSync(join(directory, 'libs/tau-examples/fixtures/viewer-parity'), { recursive: true });
      writeFileSync(
        join(directory, 'libs/tau-examples/fixtures/viewer-parity/fixtures.json'),
        read('libs/tau-examples/fixtures/viewer-parity/fixtures.json'),
      );
      writeFileSync(
        join(directory, 'pnpm'),
        [
          '#!/usr/bin/env bash',
          'set -euo pipefail',
          'case "$*" in',
          '  "nx show projects --affected --json") echo "NX log line"; cat "$FIXTURES/affected.json" ;;',
          '  "nx graph --file="*) cp "$FIXTURES/fixture-graph.json" "$(cut -d= -f2- <<< "$3")" ;;',
          '  *) echo "unexpected pnpm $*" >&2; exit 1 ;;',
          'esac',
          '',
        ].join('\n'),
        { mode: 0o700 },
      );
      // `git merge-base <base> <head>` answers the base; `git diff --name-only … <base> <head>` the PR's files,
      // and the same diff without the merge base the files the shell lane's path check reads.
      writeFileSync(
        join(directory, 'git'),
        [
          '#!/usr/bin/env bash',
          'set -euo pipefail',
          'case "$1" in',
          '  merge-base) [ "$2 $3" = "base-sha head-sha" ] && echo merge-base-sha ;;',
          '  diff) case "$*" in',
          '    "diff --name-only --no-renames --relative merge-base-sha head-sha" | "diff --name-only --no-renames base-sha head-sha") cat "$FIXTURES/files" ;;',
          '    "diff --no-renames -U0 merge-base-sha head-sha -- pnpm-workspace.yaml") cat "$FIXTURES/workspace-diff" ;;',
          '    *) echo "unexpected git $*" >&2; exit 1 ;;',
          '  esac ;;',
          '  *) echo "unexpected git $*" >&2; exit 1 ;;',
          'esac',
          '',
        ].join('\n'),
        { mode: 0o700 },
      );
      const output = join(directory, 'output');
      writeFileSync(output, '');
      const result = spawnSync('bash', ['-e', '-c', planScript], {
        cwd: directory,
        encoding: 'utf8',
        env: Object.fromEntries([
          ['PATH', `${directory}:${process.env['PATH'] ?? ''}`],
          ['FIXTURES', directory],
          ['RUNNER_TEMP', directory],
          ['GITHUB_EVENT_NAME', event],
          ['GITHUB_OUTPUT', output],
          ['NX_BASE', 'base-sha'],
          ['NX_HEAD', 'head-sha'],
          ['REUSED', ''],
          ['LANE_SELECTORS', selectors],
          ['SHELL_LANE_PATHS', planStep?.env?.['SHELL_LANE_PATHS'] ?? '[]'],
          ['NATIVE_DARWIN_LANE_PATHS', planStep?.env?.['NATIVE_DARWIN_LANE_PATHS'] ?? '[]'],
          ['COMPUTE_QUALIFY_LANE_PROJECTS', planStep?.env?.['COMPUTE_QUALIFY_LANE_PROJECTS'] ?? '[]'],
          ['COMPUTE_QUALIFY_LANE_PATHS', planStep?.env?.['COMPUTE_QUALIFY_LANE_PATHS'] ?? '[]'],
          ['VIEWER_PARITY_LANE_PATHS', planStep?.env?.['VIEWER_PARITY_LANE_PATHS'] ?? '[]'],
          ['VIEWER_PARITY_PINS', planStep?.env?.['VIEWER_PARITY_PINS'] ?? '[]'],
          ['QUEUE_HUBS', planStep?.env?.['QUEUE_HUBS'] ?? '[]'],
        ]),
      });
      const outputs = Object.fromEntries(
        readFileSync(output, 'utf8')
          .split('\n')
          .filter((line) => line !== '')
          .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
      );
      return { status: result.status ?? undefined, stdout: result.stdout, stderr: result.stderr, outputs };
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  };

  it('should run every affected lane in the merge queue', () => {
    const { status, stderr, outputs } = plan('merge_group', {
      affected: everything,
      files: ['packages/core/src/index.ts'],
    });
    expect(status, stderr).toBe(0);
    expect(outputs).toMatchObject({ api: 'true', billing: 'true', formal: 'true', browser: 'true', 'cli-e2e': 'true' });
  });

  describe('package-check shards (ST-3, ST-4)', () => {
    // Measured snapshot seconds: cli 333, host 218, skills 201, warehouse 148, opencascade 139, viewer 124.
    const checked = (root: string): Node => ({ root, type: 'lib', targets: ['pkgcheck'] });
    const graphNodes: Record<string, Node> = {
      ...nodes,
      cli: { ...nodes['cli']!, targets: [...(nodes['cli']?.targets ?? []), 'pkgcheck', 'readme-quickstart'] },
      host: { ...nodes['host']!, targets: [...(nodes['host']?.targets ?? []), 'audit-public-surface'] },
      skills: checked('packages/skills'),
      warehouse: checked('packages/warehouse'),
      opencascade: checked('packages/plugins/opencascade'),
      viewer: checked('packages/viewer'),
    };
    type Shard = { readonly shard: number; readonly shards: number; readonly projects: string };
    const shards = (outputs: Record<string, string>): Shard[] =>
      JSON.parse(outputs['pkgcheck-shards'] ?? 'null') as Shard[];

    it('should run one package-check job for a narrow entry', () => {
      const { status, stderr, outputs } = plan('merge_group', {
        affected: ['core', 'viewer'],
        files: ['packages/viewer/src/index.ts'],
        graphNodes,
      });
      expect(status, stderr).toBe(0);
      expect(outputs['pkgcheck']).toBe('true');
      expect(shards(outputs)).toEqual([{ shard: 1, shards: 1, projects: 'viewer' }]);
    });

    it('should choose the shard count from the measured seconds and partition the projects (C5)', () => {
      const affected = [...everything, 'skills', 'warehouse', 'opencascade', 'viewer'];
      const { status, stderr, outputs } = plan('merge_group', { affected, files: ['package.json'], graphNodes });
      expect(status, stderr).toBe(0);
      // 1,163 measured seconds at 600 s a shard: two jobs, every checked project in exactly one.
      const matrix = shards(outputs);
      expect(matrix.map(({ shard, shards: count }) => [shard, count])).toEqual([
        [1, 2],
        [2, 2],
      ]);
      const union = matrix.flatMap(({ projects }) => projects.split(','));
      expect(union.toSorted()).toEqual(['cli', 'host', 'opencascade', 'skills', 'viewer', 'warehouse']);
      expect(new Set(union).size).toBe(union.length);
    });

    it('should run no package check for an entry that affects none, on a pull request as in the queue', () => {
      for (const event of ['merge_group', 'pull_request']) {
        const { status, stderr, outputs } = plan(event, {
          affected: ['core'],
          files: ['packages/core/x.ts'],
          graphNodes,
        });
        expect(status, stderr).toBe(0);
        expect(outputs['pkgcheck']).toBe('false');
        expect(outputs['pkgcheck-shards']).toBe('[]');
      }
    });

    it('should gate every shard in the required check', () => {
      const job = ci.jobs['pkgcheck'];
      expect(job?.needs).toEqual(['plan']);
      expect(job?.if).toBe(
        expression("!cancelled() && needs.plan.result == 'success' && needs.plan.outputs.pkgcheck == 'true'"),
      );
      expect(job?.strategy?.matrix?.['shard']).toBe(expression('fromJSON(needs.plan.outputs.pkgcheck-shards)'));
      const gate = ci.jobs['affected']?.steps?.[0];
      expect(gate?.env?.['PKGCHECK_REQUIRED']).toBe(expression('needs.plan.outputs.pkgcheck'));
      expect(gate?.env?.['PKGCHECK_RESULT']).toBe(expression('needs.pkgcheck.result'));
      expect(gate?.run).toContain('if [ "$PKGCHECK_REQUIRED" = true ]; then test "$PKGCHECK_RESULT" = success; fi');
      expect(planScript).toContain(
        '--max-shards 4 --shard-seconds 600 --durations scripts/src/pkgcheck-shard-durations.json',
      );
    });
  });

  it('should leave a touched-rule lane to the queue on a pull request that affects it only through a dependency', () => {
    const { status, stderr, outputs } = plan('pull_request', {
      affected: everything,
      files: ['packages/core/src/index.ts'],
    });
    expect(status, stderr).toBe(0);
    expect(outputs['api']).toBe('false');
    // Lanes without a pull-request rule run as Nx selected them.
    expect(outputs['apps']).toBe('["api","api-e2e","ui"]');
    expect(outputs['size']).toBe('true');
    expect(outputs['api-image']).toBe('true');
  });

  it('should run a touched-rule lane on a pull request whose own diff touches one of its projects', () => {
    const { status, stderr, outputs } = plan('pull_request', {
      affected: everything,
      files: ['packages/core/src/index.ts', 'apps/libs/api-billing/src/ledger.ts'],
    });
    expect(status, stderr).toBe(0);
    expect(outputs['api']).toBe('true');
    // A queue-rule lane stays in the queue even when the diff touches its project.
    expect(outputs['billing']).toBe('false');
    for (const lane of ['formal', 'browser', 'geospec-examples', 'cli-e2e', 'native-hosts', 'viewer-parity']) {
      expect(outputs[lane], lane).toBe('false');
    }
    expect(outputs['native-linux']).toBe('');
    expect(outputs['browser-projects']).toBe('[]');
  });

  it('should run the browser lane on a pull request only for the browser projects its diff touches (MQ-5)', () => {
    const touched = plan('pull_request', { affected: everything, files: ['apps/ui/app/root.tsx'] });
    expect(touched.status, touched.stderr).toBe(0);
    expect(touched.outputs['browser']).toBe('true');
    expect(touched.outputs['browser-projects']).toBe('["ui"]');
    const untouched = plan('pull_request', { affected: everything, files: ['packages/core/src/index.ts'] });
    expect(untouched.status, untouched.stderr).toBe(0);
    expect(untouched.outputs['browser']).toBe('false');
    expect(untouched.outputs['browser-projects']).toBe('[]');
  });

  it('should own a file by the deepest project root above it, as Nx does', () => {
    // `apps/api-e2e/…` is not under `apps/api`; a root-level file belongs to the workspace project.
    const outside = plan('pull_request', {
      affected: ['api', 'workspace'],
      files: ['pnpm-lock.yaml', 'apps/api-docs/readme.md'],
    });
    expect(outside.status, outside.stderr).toBe(0);
    expect(outside.outputs['api']).toBe('false');
    const sibling = plan('pull_request', { affected: ['api', 'api-e2e'], files: ['apps/api-e2e/src/smoke.test.ts'] });
    expect(sibling.status, sibling.stderr).toBe(0);
    expect(sibling.stdout).toContain('Pull request (touched) api: ["api-e2e"]');
    const own = plan('pull_request', { affected: ['api'], files: ['apps/api/app/main.ts'] });
    expect(own.stdout).toContain('Pull request (touched) api: ["api"]');
  });

  it('should run the affected shell projects in the merge queue and none on a pull request', () => {
    const queue = plan('merge_group', { affected: ['host'], files: ['packages/host/src/acp/server.ts'] });
    expect(queue.status, queue.stderr).toBe(0);
    expect(queue.outputs['shell']).toBe('true');
    expect(queue.outputs['shell-projects']).toBe('["host"]');
    const pullRequest = plan('pull_request', { affected: ['host'], files: ['packages/host/src/acp/server.ts'] });
    expect(pullRequest.status, pullRequest.stderr).toBe(0);
    expect(pullRequest.outputs['shell']).toBe('false');
    expect(pullRequest.outputs['shell-projects']).toBe('[]');
    const unrelated = plan('merge_group', { affected: ['api'], files: ['apps/api/app/main.ts'] });
    expect(unrelated.status, unrelated.stderr).toBe(0);
    expect(unrelated.outputs['shell']).toBe('false');
  });

  it.each([
    '.github/workflows/shell-conformance.yml',
    'apps/desktop/scripts/hosted-linux-bwrap-fixture.mts',
    'apps/desktop/scripts/linux-apt-package.mts',
    'apps/desktop/scripts/runtime-stage.mts',
  ])('should select the sandbox rows in the merge queue when %s changes', (file) => {
    const queue = plan('merge_group', { affected: ['host'], files: [file] });
    expect(queue.status, queue.stderr).toBe(0);
    expect(queue.outputs['shell']).toBe('true');
    expect(queue.outputs['shell-projects']).toBe('["host","sandbox"]');
    // The pull-request rule still leaves the lane to the queue.
    const pullRequest = plan('pull_request', { affected: [], files: [file] });
    expect(pullRequest.status, pullRequest.stderr).toBe(0);
    expect(pullRequest.outputs['shell']).toBe('false');
  });

  it('should run the affected formal nightly projects in the merge queue and none on a pull request', () => {
    const queue = plan('merge_group', { affected: ['host', 'api'], files: ['packages/host/src/acp/server.ts'] });
    expect(queue.status, queue.stderr).toBe(0);
    expect(queue.outputs['formal-nightly']).toBe('true');
    expect(queue.outputs['formal-nightly-projects']).toBe('["host"]');
    // A dependency-only change leaves the nightly tiers to the release gate (merge-queue defects MQ-2).
    const dependency = plan('merge_group', { affected: everything, files: ['packages/core/src/index.ts'] });
    expect(dependency.outputs['formal-nightly-projects']).toBe('[]');
    const both = plan('merge_group', {
      affected: everything,
      files: ['packages/host/src/acp/server.ts', 'apps/libs/api-billing/src/ledger.ts'],
    });
    expect(both.outputs['formal-nightly-projects']).toBe('["api-billing","host"]');
    const pullRequest = plan('pull_request', { affected: ['host'], files: ['packages/host/src/acp/server.ts'] });
    expect(pullRequest.status, pullRequest.stderr).toBe(0);
    expect(pullRequest.outputs['formal-nightly']).toBe('false');
    expect(pullRequest.outputs['formal-nightly-projects']).toBe('[]');
    const unrelated = plan('merge_group', { affected: ['api'], files: ['apps/api/app/main.ts'] });
    expect(unrelated.status, unrelated.stderr).toBe(0);
    expect(unrelated.outputs['formal-nightly']).toBe('false');
  });

  it('should run the whole shell selection in the merge queue only when the entry touches a shell project', () => {
    // A hub change (`agent-host` reaching `host`) selects no shell row (merge-queue defects MQ-2).
    const hub = plan('merge_group', { affected: ['host', 'sandbox'], files: ['packages/core/src/index.ts'] });
    expect(hub.status, hub.stderr).toBe(0);
    expect(hub.outputs['shell']).toBe('false');
    expect(hub.outputs['shell-projects']).toBe('[]');
    expect(hub.stdout).toContain('Merge queue (any-touched) shell: []');
    // A shell change keeps every affected shell project, as before.
    const shell = plan('merge_group', { affected: ['host', 'sandbox'], files: ['libs/sandbox/src/shell/run.ts'] });
    expect(shell.status, shell.stderr).toBe(0);
    expect(shell.outputs['shell-projects']).toBe('["host","sandbox"]');
  });

  it('should run the native host rows in the merge queue only for the projects the entry touches', () => {
    const hub = plan('merge_group', { affected: everything, files: ['packages/core/src/index.ts'] });
    expect(hub.status, hub.stderr).toBe(0);
    expect(hub.outputs['native-hosts']).toBe('false');
    expect(hub.outputs).not.toHaveProperty('native-intel');
    expect(hub.outputs['native-linux']).toBe('');
    const own = plan('merge_group', { affected: everything, files: ['packages/plugins/picogk/src/index.ts'] });
    expect(own.status, own.stderr).toBe(0);
    expect(own.outputs['native-hosts']).toBe('true');
    // A project the row depends on outside a hub selects it; the same project reached only through a hub does not.
    const dependencies = { cli: ['host', 'build123d'], host: ['sandbox'], build123d: ['core'] };
    const direct = plan('merge_group', { affected: everything, files: ['packages/core/src/index.ts'], dependencies });
    expect(direct.status, direct.stderr).toBe(0);
    expect(direct.stdout).toContain('Merge queue (closure) native-hosts: ["cli"]');
    const throughHub = plan('merge_group', { affected: everything, files: ['libs/sandbox/src/a.ts'], dependencies });
    expect(throughHub.stdout).toContain('Merge queue (closure) native-hosts: []');
    // A lockfile change applies no merge-queue rule.
    const lockfile = plan('merge_group', { affected: everything, files: ['pnpm-lock.yaml'] });
    expect(lockfile.stdout).toContain('The entry changes pnpm-lock.yaml: no merge-queue rule applies.');
    expect(lockfile.outputs['native-hosts']).toBe('true');
  });

  it('should not select the shell lane for a file beside the fixture paths', () => {
    const queue = plan('merge_group', { affected: [], files: ['apps/desktop/scripts/hosted-linux-vm.sh'] });
    expect(queue.status, queue.stderr).toBe(0);
    expect(queue.outputs['shell']).toBe('false');
  });

  it('should run the affected native darwin rows in the merge queue and none on a pull request (Q-2)', () => {
    const queue = plan('merge_group', { affected: ['cli'], files: ['packages/cli/src/index.ts'] });
    expect(queue.status, queue.stderr).toBe(0);
    expect(queue.outputs['native-darwin']).toBe('true');
    expect(queue.outputs['native-darwin-projects']).toBe('cli');
    const pullRequest = plan('pull_request', { affected: ['cli'], files: ['packages/cli/src/index.ts'] });
    expect(pullRequest.status, pullRequest.stderr).toBe(0);
    expect(pullRequest.outputs['native-darwin']).toBe('false');
    expect(pullRequest.outputs['native-darwin-projects']).toBe('');
    const unrelated = plan('merge_group', { affected: ['api'], files: ['apps/api/app/main.ts'] });
    expect(unrelated.outputs['native-darwin']).toBe('false');
  });

  it.each([
    '.github/workflows/native-darwin.yml',
    'scripts/src/check-standalone-project.ts',
    'apps/ui/app/utils/kernel-libraries.ts',
    'libs/tau-examples/src/standalone/picogk/Program.cs',
  ])('should select every native darwin row in the merge queue when %s changes', (file) => {
    const queue = plan('merge_group', { affected: [], files: [file] });
    expect(queue.status, queue.stderr).toBe(0);
    expect(queue.outputs['native-darwin']).toBe('true');
    expect(queue.outputs['native-darwin-projects']).toBe('cli,picogk');
    const pullRequest = plan('pull_request', { affected: [], files: [file] });
    expect(pullRequest.outputs['native-darwin']).toBe('false');
  });

  it('should not select the native darwin lane for a file beside its paths', () => {
    const queue = plan('merge_group', { affected: [], files: ['libs/tau-examples/src/standalone/picogk-extra.ts'] });
    expect(queue.status, queue.stderr).toBe(0);
    expect(queue.outputs['native-darwin']).toBe('false');
  });

  it('should run the compute qualification lane only when a measured project is affected or a qualification path changed', () => {
    // The runtime-e2e project is affected through almost any dependency; a measured project (the Replicad plugin) keeps it.
    for (const event of ['merge_group', 'pull_request']) {
      const measured = plan(event, {
        affected: ['replicad', 'runtime-e2e'],
        files: ['packages/plugins/replicad/src/a.ts'],
      });
      expect(measured.status, measured.stderr).toBe(0);
      expect(measured.outputs['compute-qualify'], event).toBe('true');
    }
    const harness = plan('pull_request', {
      affected: ['runtime-e2e'],
      files: ['apps/runtime-e2e/src/compute-baseline/qualification-baselines.json'],
    });
    expect(harness.status, harness.stderr).toBe(0);
    expect(harness.outputs['compute-qualify']).toBe('true');
    const model = plan('merge_group', {
      affected: ['core', 'runtime-e2e'],
      files: ['libs/tau-examples/src/kernels/replicad/six-axis-arm/main.ts'],
    });
    expect(model.outputs['compute-qualify']).toBe('true');
    // Affected only through an unmeasured dependency, or a sibling suite of the project: no lane.
    const unrelated = plan('merge_group', { affected: ['core', 'runtime-e2e'], files: ['packages/core/src/index.ts'] });
    expect(unrelated.status, unrelated.stderr).toBe(0);
    expect(unrelated.outputs['compute-qualify']).toBe('false');
    const sibling = plan('pull_request', {
      affected: ['runtime-e2e'],
      files: ['apps/runtime-e2e/src/host-relay.test.ts'],
    });
    expect(sibling.outputs['compute-qualify']).toBe('false');
  });

  it.each([
    'packages/viewer/src/graphics/three/renderer.ts',
    'packages/viewer/src/graphics/three/utils/fixtures/flanged-housing.glb',
    'packages/three/src/camera/index.ts',
    'packages/plugins/image/src/nanoraster-camera.ts',
    'libs/agent-tools/src/capture/viewer-capture-options.ts',
    'libs/types/src/constants/viewer-render-profile.constants.ts',
    'libs/tau-examples/fixtures/viewer-parity/capture-seconds.json',
    'libs/tau-examples/scripts/viewer-parity.gate.test.ts',
    'libs/tau-examples/src/kernels/replicad/heat-exchanger/main.ts',
    'apps/ui/app/routes/convert/gear-8.glb',
    '.github/workflows/viewer-parity.yml',
    'tools/pnpm/patches/three@0.184.0.patch',
  ])('should run viewer parity on a pull request whose own diff touches %s, and never in the merge queue', (file) => {
    const pullRequest = plan('pull_request', { affected: [], files: [file] });
    expect(pullRequest.status, pullRequest.stderr).toBe(0);
    expect(pullRequest.outputs['viewer-parity']).toBe('true');
    expect(pullRequest.stdout).toContain('Viewer parity inputs changed');
    const queue = plan('merge_group', { affected: everything, files: [file] });
    expect(queue.status, queue.stderr).toBe(0);
    expect(queue.outputs['viewer-parity']).toBe('false');
    expect(queue.stdout).toContain('Merge queue (never) viewer-parity: []');
  });

  it.each([
    // Kernel code: the viewer and nanoraster draw the same GLB bytes, so a kernel change moves both sides alike.
    'packages/plugins/replicad/src/kernel.ts',
    'packages/plugins/picovoxel/src/index.ts',
    // An example that is no parity fixture, a sibling of a fixture path, and the hubs that select it by graph.
    'libs/tau-examples/src/kernels/replicad/birdhouse/main.ts',
    'libs/tau-examples/src/kernels/replicad/ibeam-extra/main.ts',
    'libs/tau-examples/scripts/test-geospec.mts',
    'packages/ui/src/components/button.tsx',
    'packages/runtime/src/index.ts',
    'pnpm-lock.yaml',
  ])('should leave viewer parity off a pull request that touches only %s', (file) => {
    const pullRequest = plan('pull_request', { affected: everything, files: [file] });
    expect(pullRequest.status, pullRequest.stderr).toBe(0);
    expect(pullRequest.outputs['viewer-parity']).toBe('false');
  });

  it('should run viewer parity on a pull request that moves a three or nanoraster pin, and not another pin', () => {
    const pin = (workspaceDiff: string) =>
      plan('pull_request', { affected: [], files: ['pnpm-workspace.yaml'], workspaceDiff }).outputs['viewer-parity'];
    const header = '--- a/pnpm-workspace.yaml\n+++ b/pnpm-workspace.yaml\n@@ -283 +283 @@\n';
    expect(pin(`${header}-  three: 0.184.0\n+  three: 0.185.0\n`)).toBe('true');
    expect(pin(`${header}-  nanoraster: ^0.9.0\n+  nanoraster: ^0.10.0\n`)).toBe('true');
    expect(pin(`${header}-  nanoraster-darwin-arm64: 0.9.0\n+  nanoraster-darwin-arm64: 0.10.0\n`)).toBe('true');
    expect(pin(`${header}+  three@0.185.0: tools/pnpm/patches/three@0.185.0.patch\n`)).toBe('true');
    expect(pin(`${header}-  three-mesh-bvh: 0.9.0\n+  three-mesh-bvh: 0.9.1\n`)).toBe('false');
    expect(pin(`${header}-  vitest: 4.1.11\n+  vitest: 4.1.12\n`)).toBe('false');
  });

  it('should keep viewer parity out of a merge-queue entry that changes the lockfile', () => {
    const queue = plan('merge_group', { affected: everything, files: ['pnpm-lock.yaml', 'packages/viewer/src/a.ts'] });
    expect(queue.status, queue.stderr).toBe(0);
    expect(queue.stdout).toContain('The entry changes pnpm-lock.yaml: no merge-queue rule applies.');
    expect(queue.outputs['viewer-parity']).toBe('false');
  });

  it('should still run viewer parity on a push the queue did not prove, through the graph', () => {
    const push = plan('push', { affected: everything, files: ['packages/runtime/src/index.ts'] });
    expect(push.status, push.stderr).toBe(0);
    expect(push.outputs['viewer-parity']).toBe('true');
  });

  it('should fail the plan when a lane other than viewer parity names the paths rule', () => {
    const selectors = JSON.stringify({ ...laneSelectors, api: { tags: ['scope:api'], pr: 'paths' } });
    const { status, stderr } = plan('merge_group', { affected: everything, files: [], selectors });
    expect(status).not.toBe(0);
    expect(stderr).toContain('only the viewer-parity lane has a pull-request path list');
  });

  it('should fail the plan on a pull-request rule it does not know', () => {
    const selectors = JSON.stringify({ ...laneSelectors, api: { tags: ['scope:api'], pr: 'sometimes' } });
    const { status, stderr } = plan('merge_group', { affected: everything, files: [], selectors });
    expect(status).not.toBe(0);
    expect(stderr).toContain('lane selectors name a pull-request rule other than queue, touched or paths');
  });

  it('should run one row per ratcheted suite of an affected project in the merge queue, and on a pull request only when its diff touches the project', () => {
    const queue = plan('merge_group', { affected: ['ui-e2e'], files: ['apps/ui-e2e/src/smoke.test.ts'] });
    expect(queue.status, queue.stderr).toBe(0);
    expect(queue.outputs['e2e-queue']).toBe('true');
    expect(JSON.parse(queue.outputs['e2e-queue-suites'] ?? '')).toEqual([
      {
        project: 'ui-e2e',
        target: 'test:e2e:daemon-host',
        label: 'ui-e2e test:e2e:daemon-host',
        slug: 'ui-e2e-test-e2e-daemon-host',
      },
      {
        project: 'ui-e2e',
        target: 'test:e2e:development',
        label: 'ui-e2e test:e2e:development',
        slug: 'ui-e2e-test-e2e-development',
      },
    ]);
    // MQ-5: a pull request that touches the project runs its suites before it queues.
    const pullRequest = plan('pull_request', { affected: ['ui-e2e'], files: ['apps/ui-e2e/src/smoke.test.ts'] });
    expect(pullRequest.status, pullRequest.stderr).toBe(0);
    expect(pullRequest.outputs['e2e-queue']).toBe('true');
    expect(pullRequest.outputs['e2e-queue-suites']).toBe(queue.outputs['e2e-queue-suites']);
    // A pull request that reaches the project only through a dependency runs none.
    const dependency = plan('pull_request', { affected: ['ui-e2e', 'ui'], files: ['apps/ui/app/root.tsx'] });
    expect(dependency.status, dependency.stderr).toBe(0);
    expect(dependency.outputs['e2e-queue']).toBe('false');
    expect(dependency.outputs['e2e-queue-suites']).toBe('[]');
    const unrelated = plan('merge_group', { affected: ['api'], files: ['apps/api/app/main.ts'] });
    expect(unrelated.status, unrelated.stderr).toBe(0);
    expect(unrelated.outputs['e2e-queue']).toBe('false');
    expect(unrelated.outputs['e2e-queue-suites']).toBe('[]');
  });

  it.each([
    [['^test:e2e'], 'depends on "^test:e2e", which is not a target of ui-e2e'],
    [['csharp-language:prepare'], 'depends on "csharp-language:prepare", which is not a target of ui-e2e'],
    [[{ target: 'test:e2e:development' }], 'which is not a target of ui-e2e'],
    [['test:e2e'], 'ui-e2e:test:e2e declares shards; the e2e-queue lane runs a suite as one job'],
  ])('should fail the plan when a ratchet lists %j', (dependsOn, message) => {
    const endToEnd = nodes['ui-e2e'];
    const graphNodes = {
      ...nodes,
      'ui-e2e': {
        ...endToEnd,
        root: endToEnd?.root ?? '',
        config: { ...endToEnd?.config, 'test:e2e:queue': { dependsOn } },
      },
    };
    const { status, stderr } = plan('merge_group', { affected: ['ui-e2e'], files: [], graphNodes });
    expect(status).not.toBe(0);
    expect(stderr).toContain(message);
  });
});

describe('ci.yml formal nightly lane (CI throughput review Q-4 step 2)', () => {
  type FormalNightlyWorkflow = {
    readonly on: Record<string, unknown> & {
      readonly workflow_call?: {
        readonly inputs?: Record<string, { readonly type?: string; readonly required?: boolean }>;
      };
    };
    readonly concurrency?: { readonly group?: string; readonly 'cancel-in-progress'?: boolean };
    readonly jobs: Record<string, Job>;
  };
  const nightly = load(read('.github/workflows/formal-nightly.yml')) as FormalNightlyWorkflow;
  const lane = ci.jobs['formal-nightly'];
  const condition =
    "!cancelled() && needs.plan.result == 'success' && needs.plan.outputs.formal-nightly == 'true' && github.event_name == 'merge_group'";

  it('should plan the lane from formal:nightly, in the merge queue only', () => {
    expect(laneSelectors['formal-nightly']).toEqual({ targets: ['formal:nightly'], pr: 'queue', queue: 'touched' });
    expect(planScript).toContain('formal_nightly=$(flag formal-nightly)');
    expect(planScript).toContain('echo "formal-nightly-projects=$formal_nightly_projects"');
    expect(ci.jobs['plan']?.outputs?.['formal-nightly-projects']).toBe(
      expression('steps.plan.outputs.formal-nightly-projects'),
    );
    expect(lane?.if).toBe(expression(condition));
  });

  it('should call the nightly tiers with the planned projects, seeded by the queue commit', () => {
    expect(lane?.uses).toBe('./.github/workflows/formal-nightly.yml');
    expect(lane?.needs).toEqual(['plan']);
    expect(lane?.with).toEqual({
      ref: expression('github.sha'),
      projects: expression('needs.plan.outputs.formal-nightly-projects'),
      seed: expression('github.sha'),
    });
  });

  it('should require the lane in the required check when the queue planned it', () => {
    const step = ci.jobs['affected']?.steps?.[0];
    expect(step?.env?.['FORMAL_NIGHTLY_REQUIRED']).toBe(expression('needs.plan.outputs.formal-nightly'));
    expect(step?.env?.['FORMAL_NIGHTLY_RESULT']).toBe(expression('needs.formal-nightly.result'));
    const check = step?.run ?? '';
    const rule =
      'if [ "$FORMAL_NIGHTLY_REQUIRED" = true ] && [ "$EVENT" = merge_group ]; then test "$FORMAL_NIGHTLY_RESULT" = success; fi';
    expect(check).toContain(rule);
    expect(check.indexOf(rule)).toBeGreaterThan(check.indexOf('if [ -n "$REUSED" ]; then'));
  });

  it('should take ref, projects and seed as workflow_call inputs and give each caller its own group', () => {
    const inputs = nightly.on.workflow_call?.inputs ?? {};
    expect(Object.keys(inputs).toSorted()).toEqual(['projects', 'ref', 'seed', 'uncached']);
    expect(inputs['ref']).toMatchObject({ type: 'string', required: true });
    expect(inputs['projects']).toMatchObject({ type: 'string', required: false });
    expect(inputs['seed']).toMatchObject({ type: 'string', required: false });
    expect(nightly.concurrency?.group).toBe(
      `formal-nightly\${{ inputs.ref && format('-{0}-{1}', inputs.ref, github.run_id) || '' }}`,
    );
    expect(nightly.concurrency?.['cancel-in-progress']).toBe(false);
  });

  it('should narrow the matrix to the requested projects and fail on an unknown or empty list', () => {
    const step = nightly.jobs['projects']?.steps?.find((candidate) => candidate.id === 'list');
    expect(step?.env?.['REQUESTED']).toBe(expression("inputs.projects || ''"));
    const script = step?.run ?? '';
    expect(script).toContain('type == "array" and length > 0');
    expect(script).toContain('--argjson requested "$projects"');
  });

  it('should derive FORMAL_SEED from the seed source and leave it random without one', () => {
    const run = nightly.jobs['formal-nightly']?.steps?.find((step) => step.run?.includes('nx run-many'));
    expect(run?.env?.['TAU_FORMAL_SEED']).toBe(expression("inputs.seed || ''"));
    const derive = /^\s*(FORMAL_SEED=.*)$/mu.exec(run?.run ?? '')?.[1] ?? '';
    expect(derive).toBe(
      'FORMAL_SEED=$(( 16#$(printf \'%s\' "$TAU_FORMAL_SEED" | sha256sum | cut -c1-8) % 2147483647 ))',
    );
    const seedOf = (source: string): number => {
      const result = spawnSync('bash', ['-euo', 'pipefail', '-c', `${derive}; echo "$FORMAL_SEED"`], {
        encoding: 'utf8',
        env: Object.fromEntries([
          ['PATH', process.env['PATH'] ?? ''],
          ['TAU_FORMAL_SEED', source],
        ]),
      });
      expect(result.status, result.stderr).toBe(0);
      return Number(result.stdout.trim());
    };
    const sha = '1f869be2c0ffee00000000000000000000000000';
    // The same source replays the same seed; a commit sha and a run id both give a seed the tools accept.
    expect(seedOf(sha)).toBe(seedOf(sha));
    expect(seedOf(sha)).not.toBe(seedOf('43212287515'));
    for (const source of [sha, '43212287515']) {
      expect(Number.isInteger(seedOf(source))).toBe(true);
      expect(seedOf(source)).toBeGreaterThanOrEqual(0);
      expect(seedOf(source)).toBeLessThan(2_147_483_647);
    }
    expect(run?.run).toContain('if [ -n "$TAU_FORMAL_SEED" ]; then');
  });
});

describe('ci.yml test lanes (CI throughput review ST-1)', () => {
  const lane = ci.jobs['affected-lane'];
  const rows = ((lane?.strategy?.matrix?.['lane'] ?? []) as readonly string[]).filter((row) => row.startsWith('test-'));
  const script = lane?.steps?.find((step) => step.name === "Run the lane's tasks")?.run ?? '';
  const uiTargets = Object.keys(
    (JSON.parse(read('apps/ui/project.json')) as { targets: Record<string, unknown> }).targets,
  ).filter((target) => /^test:shard-\d+$/u.test(target));

  it('should deal over exactly the test rows of the matrix', () => {
    // A row the deal does not know runs nothing; a deal over more shards than rows drops their projects.
    expect(rows).toEqual(Array.from({ length: rows.length }, (_, index) => `test-${index + 1}`));
    expect(rows.length).toBeGreaterThanOrEqual(4);
    expect(script).toContain(
      `node scripts/src/test-shard-dealer.ts --shard "\${LANE#test-}" --shards ${String(rows.length)})`,
    );
    expect(uiTargets.length).toBeGreaterThanOrEqual(4);
  });

  /** Run every test row's script against a task graph of `projects`; returns each row's `nx run-many` calls. */
  const runRows = (
    projects: Readonly<Record<string, { readonly tags?: readonly string[]; readonly targets: readonly string[] }>>,
  ): string[][] => {
    const directory = mkdtempSync(join(tmpdir(), 'ci-test-lanes-'));
    try {
      writeFileSync(
        join(directory, 'graph.json'),
        JSON.stringify({
          graph: {
            nodes: Object.fromEntries(
              Object.entries(projects).map(([name, { tags = [], targets }]) => [
                name,
                { data: { tags, targets: Object.fromEntries(targets.map((target) => [target, {}])) } },
              ]),
            ),
          },
          tasks: {
            tasks: Object.fromEntries(
              Object.keys(projects).flatMap((name) => [
                [`${name}:test`, { target: { project: name, target: 'test' } }],
                [`${name}:copy-assets`, { target: { project: name, target: 'copy-assets' } }],
              ]),
            ),
          },
        }),
      );
      writeFileSync(
        join(directory, 'pnpm'),
        [
          '#!/usr/bin/env bash',
          'set -euo pipefail',
          'case "$*" in',
          '  "nx affected -t test --exclude tag:scope:api,tag:ci:quarantined --graph="*) cp "$FIXTURES/graph.json" "$(cut -d= -f2- <<< "$7")" ;;',
          '  "nx run-many "*) echo "$*" >> "$FIXTURES/calls" ;;',
          '  *) echo "unexpected pnpm $*" >&2; exit 1 ;;',
          'esac',
          '',
        ].join('\n'),
        { mode: 0o700 },
      );
      return rows.map((row) => {
        writeFileSync(join(directory, 'calls'), '');
        const result = spawnSync('bash', ['-e', '-c', script], {
          cwd: root,
          encoding: 'utf8',
          env: Object.fromEntries([
            ['PATH', `${directory}:${process.env['PATH'] ?? ''}`],
            ['FIXTURES', directory],
            ['RUNNER_TEMP', directory],
            ['LANE', row],
          ]),
        });
        expect(result.status, result.stderr).toBe(0);
        return readFileSync(join(directory, 'calls'), 'utf8')
          .split('\n')
          .filter((line) => line !== '');
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  };

  /** The `<project>:<target>` tasks one `nx run-many -t <targets> --projects <projects>` call runs. */
  const tasksOf = (call: string): string[] => {
    const match =
      /^nx run-many -t (?<targets>.+?) --projects (?<projects>\S+) --parallel=1 --outputStyle=stream$/u.exec(call);
    expect(match, call).not.toBeNull();
    const targets = match?.groups?.['targets']?.split(' ') ?? [];
    return (match?.groups?.['projects']?.split(',') ?? []).flatMap((project) =>
      targets.map((target) => `${project}:${target}`),
    );
  };

  const ui = { targets: ['test', 'test:e2e', ...uiTargets] };

  it('should run every ui shard once across the rows and never the whole ui:test', { timeout: 60_000 }, () => {
    const calls = runRows({
      ui,
      cli: { targets: ['test'] },
      host: { targets: ['test'] },
      scripts: { targets: ['test'] },
      viewer: { targets: ['test'] },
      'small-a': { targets: ['test'] },
      'small-b': { targets: ['test'] },
      'api-like': { tags: ['scope:api'], targets: ['test'] },
    });
    const tasks = calls.flat().flatMap((call) => tasksOf(call));
    expect(tasks.toSorted()).toEqual(
      [
        ...uiTargets.map((target) => `ui:${target}`),
        'cli:test',
        'host:test',
        'scripts:test',
        'viewer:test',
        'small-a:test',
        'small-b:test',
      ].toSorted(),
    );
    expect(tasks).not.toContain('ui:test');
  });

  it('should spread ui alone over the rows, one shard per row while the rows last', { timeout: 60_000 }, () => {
    const perRow = runRows({ ui }).map((row) => row.flatMap((call) => tasksOf(call)));
    expect(perRow.flat().toSorted()).toEqual(uiTargets.map((target) => `ui:${target}`).toSorted());
    expect(Math.max(...perRow.map((row) => row.length))).toBe(Math.ceil(uiTargets.length / rows.length));
  });

  it('should run a project without shard targets as its whole test', { timeout: 60_000 }, () => {
    expect(runRows({ scripts: { targets: ['test'] } }).flat()).toEqual([
      'nx run-many -t test --projects scripts --parallel=1 --outputStyle=stream',
    ]);
  });
});
