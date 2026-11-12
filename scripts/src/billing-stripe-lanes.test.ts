import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

type Job = {
  readonly if?: string;
  readonly needs?: readonly string[];
  readonly env?: Record<string, string>;
  readonly steps?: ReadonlyArray<{
    readonly if?: string;
    readonly id?: string;
    readonly run?: string;
    readonly env?: Record<string, string>;
  }>;
};

const job = (path: string, name: string): Job => {
  const workflow = load(read(path)) as { readonly jobs: Record<string, Job> };
  return workflow.jobs[name] ?? {};
};

/** A pull of `postgres:17-alpine` by digest, then the local tag the billing launcher runs (`pull_policy: never`). */
const pinnedPostgresPull =
  /^docker pull postgres:17-alpine@(sha256:[0-9a-f]{64})\ndocker tag postgres@\1 postgres:17-alpine\n?$/u;

const lanes = [
  ['.github/workflows/ci.yml', 'billing-e2e'],
  ['.github/workflows/billing-nightly.yml', 'billing-nightly'],
] as const;

describe('credential-free billing CI', () => {
  it.each(lanes)('should execute local contracts without a credential gate in %s', (path, name) => {
    const lane = job(path, name);
    const execution = lane.steps?.find((step) => step.run === 'pnpm nx run-many -t test:billing-foundation');
    expect(execution).toBeDefined();
    expect(execution?.if).toBeUndefined();
    expect(lane.env).toBeUndefined();
    expect(lane.steps?.some((step) => step.id === 'gate')).toBe(false);
    expect(lane.steps?.some((step) => pinnedPostgresPull.test(step.run ?? ''))).toBe(true);
  });

  it('should run every billing PostgreSQL pull on one pinned digest, under the tag the launcher runs', () => {
    const pulls = [...lanes, ['.github/workflows/ci.yml', 'api'] as const].flatMap(([path, name]) =>
      (job(path, name).steps ?? [])
        .map((step) => step.run ?? '')
        .filter((run) => run.includes('postgres:17-alpine'))
        .map((run) => ({ lane: `${path}#${name}`, digest: pinnedPostgresPull.exec(run)?.[1] })),
    );

    expect(pulls.map(({ lane }) => lane)).toEqual([
      '.github/workflows/ci.yml#billing-e2e',
      '.github/workflows/billing-nightly.yml#billing-nightly',
      '.github/workflows/ci.yml#api',
    ]);
    expect(pulls.filter(({ digest }) => digest === undefined)).toEqual([]);
    expect(new Set(pulls.map(({ digest }) => digest)).size).toBe(1);
    // The launcher never pulls: it runs the image the workflow tagged.
    const launcher = read('apps/libs/api-billing/scripts/test-billing-foundation.mts');
    expect(launcher).toContain("image: 'postgres:17-alpine'");
    expect(launcher).toContain("pull_policy: 'never'");
  });

  it('should run every target billing-nightly runs in a planned ci.yml lane', () => {
    const targets = (path: string, name: string): readonly string[] =>
      (job(path, name).steps ?? []).flatMap(
        ({ run }) => /^pnpm nx run-many -t (test:billing-[\w-]+)$/u.exec(run ?? '')?.slice(1) ?? [],
      );

    const nightly = targets('.github/workflows/billing-nightly.yml', 'billing-nightly');
    expect(nightly).toEqual(['test:billing-foundation', 'test:billing-composition']);
    expect(targets('.github/workflows/ci.yml', 'billing-e2e')).toContain('test:billing-foundation');
    expect(targets('.github/workflows/ci.yml', 'api')).toContain('test:billing-composition');
    // Assembled so the source holds no template-like string literal.
    expect(job('.github/workflows/ci.yml', 'api').if).toBe(
      ['$', "{{ !cancelled() && needs.plan.result == 'success' && needs.plan.outputs.api == 'true' }}"].join(''),
    );
  });

  it('should select billing contracts by the billing plan output and gate staging on completed billing tests', () => {
    const path = '.github/workflows/ci.yml';
    // Billing contracts run exactly when a project with the suite (`api-billing`) or one it depends on is affected.
    const plan = job(path, 'plan').steps?.find((step) => step.id === 'plan');
    const selectors = JSON.parse(plan?.env?.['LANE_SELECTORS'] ?? '{}') as Record<string, unknown>;
    expect(selectors['billing']).toEqual({ targets: ['test:billing-foundation'] });
    expect(plan?.run).toContain('billing=$(flag billing)');
    expect(plan?.run).toContain('echo "billing=$billing"');
    // Assembled so the source holds no template-like string literal.
    expect(job(path, 'billing-e2e').if).toBe(
      ['$', "{{ !cancelled() && needs.plan.result == 'success' && needs.plan.outputs.billing == 'true' }}"].join(''),
    );
    const staging = '.github/workflows/staging.yml';
    expect(read(staging)).toContain('"billing-e2e": "Billing contracts (no Stripe credentials)"');
    const deployment = job(staging, 'deploy-api-staging');
    expect(deployment.needs).toContain('ci');
    expect(deployment.if).toContain(
      "(needs.ci.outputs.billing-e2e == 'success' || needs.ci.outputs.billing-e2e == 'not-affected' || needs.ci.outputs.billing-e2e == 'reused')",
    );
  });

  it('should gate staging only on checks that ci.yml defines', () => {
    const ci = load(read('.github/workflows/ci.yml')) as { readonly jobs: Record<string, { readonly name?: string }> };
    const names = new Set(Object.values(ci.jobs).map((definition) => definition.name));
    const gate = job('.github/workflows/staging.yml', 'ci').steps?.find((step) => step.id === 'check') as
      | { readonly env?: Record<string, string> }
      | undefined;
    const checks = Object.values(JSON.parse(gate?.env?.['CHECKS'] ?? '{}') as Record<string, string>);
    expect(checks).toContain('Billing contracts (no Stripe credentials)');
    for (const check of checks) {
      expect(names, check).toContain(check);
    }
  });

  it('should keep provider credentials and sandbox acceptance out of every Actions workflow', () => {
    for (const filename of readdirSync(resolve(root, '.github/workflows'))) {
      if (!filename.endsWith('.yml') && !filename.endsWith('.yaml')) {
        continue;
      }
      const workflow = read(`.github/workflows/${filename}`);
      expect(workflow, filename).not.toMatch(/STRIPE_TEST_|test:billing-stripe|billing-e2e:test:staging/u);
    }
    expect(existsSync(resolve(root, '.github/workflows/billing-staging-e2e.yml'))).toBe(false);
  });

  it('should retain explicit local sandbox probes without silently accepting absent credentials', () => {
    const project = JSON.parse(read('apps/libs/api-billing/project.json')) as {
      readonly targets: Record<string, { readonly options?: { readonly command?: string } }>;
    };
    const command = project.targets['test:billing-stripe']?.options?.command ?? '';
    for (const name of ['STRIPE_SECRET_KEY', 'STRIPE_READ_SECRET_KEY', 'STRIPE_REFUND_SECRET_KEY']) {
      expect(command).toContain(`test -n "$${name}"`);
    }
    expect(command).toContain('BILLING_STRIPE_ACCEPTANCE=true');
  });
});
