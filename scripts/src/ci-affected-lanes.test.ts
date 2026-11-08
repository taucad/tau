import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

/*
 * The affected-only rule for `ci.yml`: a job that runs a project test target runs it because the plan
 * found that lane affected, on pull requests, in the merge queue and on `main` pushes alike. A job's
 * `if` may not add an event or branch clause that runs the lane regardless; `staging.yml` accepts a
 * skipped lane only when the same CI run's plan says nothing of it was affected.
 */

const root = resolve(import.meta.dirname, '../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

type Step = {
  readonly id?: string;
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
};
type Workflow = { readonly jobs: Record<string, Job> };

const ci = load(read('.github/workflows/ci.yml')) as Workflow;
const staging = load(read('.github/workflows/staging.yml')) as Workflow;

/** A GitHub Actions `${{ … }}` expression, built so the source holds no template-like string literal. */
const expression = (body: string): string => ['$', '{{ ', body, ' }}'].join('');

const isTestTarget = (target: string): boolean => /^test(?:$|[:-])/u.test(target);

/** The Nx targets a shell command runs, and whether its projects are selected by `affected` there. */
const nxTargets = (command: string): ReadonlyArray<{ readonly target: string; readonly affected: boolean }> => {
  const found: Array<{ target: string; affected: boolean }> = [];
  for (const [line] of command.matchAll(/\bnx\s+(?:run-many|affected)\b[^\n]*/gu)) {
    // `nx affected`, or `run-many` over a `--projects` list this script took from `nx show projects --affected`.
    const affected =
      /\bnx\s+affected\b/u.test(line) ||
      (/\s--projects\s+"\$\w+"/u.test(line) && /\bnx show projects --affected\b/u.test(command));
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

/** Plan outputs computed from `nx show projects --affected`, keyed by output name. */
const affectedPlanOutputs = (): ReadonlySet<string> => {
  const { plan } = ci.jobs;
  const script = plan?.steps?.find((step) => step.id === 'plan')?.run ?? '';
  const outputs = new Set<string>();
  for (const [, key, variable] of script.matchAll(/"([\w-]+)=\$(\w+)"/gu)) {
    const computed = new RegExp(`^\\s*${variable}=\\$\\(pnpm nx show projects --affected\\b`, 'mu');
    if (
      key !== undefined &&
      computed.test(script) &&
      plan?.outputs?.[key] === expression(`steps.plan.outputs.${key}`)
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
      expect.arrayContaining(['api', 'billing', 'size', 'formal', 'browser', 'geospec-examples']),
    );
    expect(testJobs.map(({ name }) => name)).toEqual(expect.arrayContaining(['affected-lane', 'api', 'billing-e2e']));
  });

  it.each(testJobs.map(({ name, definition, targets }) => [name, definition, targets] as const))(
    'should gate %s on a plan affected output',
    (_name, definition, targets) => {
      const condition = definition.if ?? '';
      expect([definition.needs ?? []].flat()).toContain('plan');
      // `nx affected` selects its own projects; every other test command needs a lane the plan selected.
      if (!targets.every(({ affected }) => affected)) {
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

  it('should gate billing contracts on the billing plan output alone', () => {
    expect(ci.jobs['billing-e2e']?.if).toBe(
      expression("!cancelled() && needs.plan.result == 'success' && needs.plan.outputs.billing == 'true'"),
    );
    expect(ci.jobs['api']?.if).toBe(
      expression("!cancelled() && needs.plan.result == 'success' && needs.plan.outputs.api == 'true'"),
    );
  });
});

describe('staging.yml skipped-lane rule', () => {
  const wait = staging.jobs['ci']?.steps?.find((step) => step.id === 'wait');
  const script = wait?.run ?? '';
  const planned = JSON.parse(wait?.env?.['PLANNED_LANES'] ?? '[]') as string[];

  it('should read the lane plan that the same CI run uploaded', () => {
    const planStep = ci.jobs['plan']?.steps?.find((step) => step.id === 'plan')?.run ?? '';
    expect(planStep).toContain(`'{api: $api, "billing-e2e": $billing}' > out/ci-plan/lanes.json`);
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

  it('should let deploys accept not-affected for the planned lanes only', () => {
    for (const [name, definition] of Object.entries(staging.jobs)) {
      const condition = definition.if ?? '';
      for (const [, key] of condition.matchAll(/needs\.ci\.outputs\.([\w-]+) == 'not-affected'/gu)) {
        expect(planned, name).toContain(key);
        expect(condition, name).toContain(
          `(needs.ci.outputs.${key} == 'success' || needs.ci.outputs.${key} == 'not-affected')`,
        );
      }
      for (const [, key, value] of condition.matchAll(/needs\.ci\.outputs\.([\w-]+) == '([\w-]+)'/gu)) {
        expect(['success', ...(planned.includes(key ?? '') ? ['not-affected'] : [])], name).toContain(value);
      }
    }
  });
});
