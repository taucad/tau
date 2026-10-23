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
  readonly steps?: ReadonlyArray<{ readonly if?: string; readonly id?: string; readonly run?: string }>;
};

const job = (path: string, name: string): Job => {
  const workflow = load(read(path)) as { readonly jobs: Record<string, Job> };
  return workflow.jobs[name] ?? {};
};

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
    expect(lane.steps?.some((step) => step.run === 'docker pull postgres:17-alpine')).toBe(true);
  });

  it('should preserve the API lane selection and gate staging on completed billing tests', () => {
    const path = '.github/workflows/ci.yml';
    expect(job(path, 'billing-e2e').if).toBe(job(path, 'api').if);
    const deployment = job(path, 'deploy-api-staging');
    expect(deployment.needs).toContain('billing-e2e');
    expect(deployment.if).toContain("needs.billing-e2e.result == 'success'");
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
    const project = JSON.parse(read('apps/api/project.json')) as {
      readonly targets: Record<string, { readonly options?: { readonly command?: string } }>;
    };
    const command = project.targets['test:billing-stripe']?.options?.command ?? '';
    for (const name of ['STRIPE_SECRET_KEY', 'STRIPE_READ_SECRET_KEY', 'STRIPE_REFUND_SECRET_KEY']) {
      expect(command).toContain(`test -n "$${name}"`);
    }
    expect(command).toContain('BILLING_STRIPE_ACCEPTANCE=true');
  });
});
