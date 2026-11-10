import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

/*
 * The affected-only rule for `ci.yml`: a job that runs a project test target runs it because the plan
 * found that lane affected, or selects its own projects with `nx affected`, on pull requests, in the
 * merge queue and on `main` pushes alike. A job's `if` may not add an event or branch clause that runs
 * the lane regardless. A `main` push may skip a lane only on the merge-queue verdict for the identical
 * commit, and `staging.yml` accepts a skipped service lane only when the same CI run's plan says
 * nothing of it was affected or names the reused queue run that passed it.
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
    readonly workflow_call?: { readonly inputs?: Record<string, { readonly type?: string }> } | null;
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
      billing: { targets: ['test:billing-foundation'] },
      'cli-e2e': { targets: ['test:scenarios'] },
      size: { targets: ['size'] },
      formal: { targets: ['formal'] },
      'geospec-examples': { targets: ['test-geospec'] },
      browser: { tags: ['ci:browser'], targets: ['verify-browser'] },
      standalone: { tags: ['ci:standalone'] },
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
    // The verdict is empty unless this is a push to `main` with a green merge-group run on the same commit.
    const action = read('.github/actions/queue-verdict/action.yml');
    expect(action).toContain('if [ "$EVENT" = push ] && [ "$REF" = refs/heads/main ]; then');
    expect(action).toContain('event=merge_group&status=success');
    // The required gate still waits for the plan and every lane, and passes a skip only on the plan's verdict.
    const gate = ci.jobs['affected'];
    expect(gate?.needs).toEqual([
      'plan',
      'affected-lane',
      'browser',
      'geospec-examples',
      'cli-e2e',
      'native-hosts',
      'viewer-parity',
    ]);
    const check = gate?.steps?.[0]?.run ?? '';
    expect(check).toContain('test "$PLAN_RESULT" = success');
    expect(check).toContain('test "$LANES_RESULT" = success');
    expect(gate?.steps?.[0]?.env?.['REUSED']).toBe(expression('needs.plan.outputs.reused'));
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

  it('should leave the service, formal, browser, GeoSpec, CLI end-to-end, native-host, viewer-parity and standalone lanes to the merge queue on a pull request', () => {
    const slim = planScript.slice(planScript.indexOf('if [ "$GITHUB_EVENT_NAME" = pull_request ]; then'));
    expect(slim).toMatch(/^\s*native_linux=''$/mu);
    for (const lane of [
      'run_api',
      'run_billing',
      'formal',
      'browser',
      'geospec_examples',
      'cli_e2e',
      'native_hosts',
      'viewer_parity',
      'standalone',
    ]) {
      expect(slim, lane).toMatch(new RegExp(`^\\s*${lane}=false$`, 'mu'));
    }
    // The PR-only Docker smoke test keeps its own flag, the raw API selection.
    expect(planScript).toContain('echo "api-image=$api_image"');
    expect(ci.jobs['api-docker-smoke']?.if).toBe(
      "github.event_name == 'pull_request' && needs.plan.outputs.api-image == 'true'",
    );
  });

  it('should skip a service lane on a push only where the reused queue run passed it', () => {
    expect(planStep?.env?.['QUEUE_LANES']).toBe(expression("steps.queue.outputs.lanes || '{}'"));
    expect(planScript).toContain(`if [ "$(jq -r '.api // ""' <<< "$QUEUE_LANES")" = success ]; then run_api=false; fi`);
    expect(planScript).toContain(
      `if [ "$(jq -r '."billing-e2e" // ""' <<< "$QUEUE_LANES")" = success ]; then run_billing=false; fi`,
    );
    expect(planScript).toContain('echo "api=$run_api"');
    expect(planScript).toContain('echo "billing=$run_billing"');
    // Both are decided inside `if [ -n "$REUSED" ]`, which only a push to `main` can enter.
    const reused = planScript.slice(planScript.indexOf('if [ -n "$REUSED" ]; then'));
    const end = reused.indexOf('\nfi\n');
    expect(end).toBeGreaterThan(0);
    expect(reused.indexOf('run_api=false')).toBeLessThan(end);
    expect(reused.indexOf('run_billing=false')).toBeLessThan(end);
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
    // A push that reuses the merge-queue verdict skips the lane, as it skips the shards.
    const planStep = ci.jobs['plan']?.steps?.find((step) => step.id === 'plan')?.run ?? '';
    expect(planStep).toMatch(/if \[ -n "\$REUSED" \]; then[^]*?cli_e2e=false[^]*?fi/u);
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

  it('should fail the required check when a selected native-host or viewer-parity lane did not pass', () => {
    const check = gateStep?.run ?? '';
    for (const [key, job] of [
      ['NATIVE_HOSTS', 'native-hosts'],
      ['VIEWER_PARITY', 'viewer-parity'],
    ] as const) {
      expect(gateStep?.env?.[`${key}_REQUIRED`]).toBe(expression(`needs.plan.outputs.${job}`));
      expect(gateStep?.env?.[`${key}_RESULT`]).toBe(expression(`needs.${job}.result`));
      expect(check).toContain(`if [ "$${key}_REQUIRED" = true ]; then test "$${key}_RESULT" = success; fi`);
    }
  });

  it('should leave a push to the native-hosts workflow and skip viewer parity on a reused queue verdict', () => {
    const reused = planScript.slice(planScript.indexOf('if [ -n "$REUSED" ]; then'));
    expect(reused.slice(0, reused.indexOf('\nfi\n'))).toMatch(/^\s*viewer_parity=false$/mu);
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
    expect(planScript).toContain(
      `'{api: $api, "billing-e2e": $billing, "reused-run": $reused, queue: (if $reused == "" then {} else $queue end)}'`,
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
    expect(script).toContain(`[ "$(jq -r --arg key "$key" '.[$key] // "true"' <<< "$plan")" = false ]; then`);
    expect(script.match(/conclusion=not-affected/gu)).toHaveLength(1);
  });

  it('should turn a skip into reused only for a planned lane the reused queue run passed', () => {
    expect(script).toContain(`elif [ -n "$(jq -r '."reused-run" // ""' <<< "$plan")" ] &&`);
    expect(script).toContain(`[ "$(jq -r --arg key "$key" '.queue[$key] // ""' <<< "$plan")" = success ]; then`);
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
