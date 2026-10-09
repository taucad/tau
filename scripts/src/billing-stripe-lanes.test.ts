import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

/** Every variable `api:test:billing-stripe` checks with `test -n` before it runs. */
const requiredByTarget = (): readonly string[] => {
  const project = JSON.parse(read('apps/api/project.json')) as {
    readonly targets: Record<string, { readonly options?: { readonly command?: string } }>;
  };
  const command = project.targets['test:billing-stripe']?.options?.command ?? '';
  return [...command.matchAll(/test -n "\$(?<name>\w+)"/gu)].map((match) => match.groups?.['name'] ?? '');
};

type Job = {
  readonly env?: Record<string, string>;
  readonly steps?: ReadonlyArray<{ readonly id?: string; readonly run?: string }>;
};

const job = (path: string, name: string): Job => {
  const workflow = load(read(path)) as { readonly jobs: Record<string, Job> };
  return workflow.jobs[name] ?? {};
};

const lanes = [
  ['.github/workflows/ci.yml', 'billing-e2e'],
  ['.github/workflows/billing-nightly.yml', 'billing-nightly'],
] as const;

describe('real Stripe acceptance lanes', () => {
  it('requires the test-mode price and product along with the keys', () => {
    expect(requiredByTarget()).toEqual(
      expect.arrayContaining(['STRIPE_PRICE_ID_PRO_MONTHLY', 'STRIPE_PRODUCT_ID_CREDIT_PACK']),
    );
  });

  it.each(lanes)('%s exports each of them from a STRIPE_TEST_* secret', (path, name) => {
    const environment = job(path, name).env ?? {};

    // The lane copies `.env.example` into `.env`; anything it does not export resolves to a placeholder there.
    for (const variable of requiredByTarget()) {
      expect(environment[variable] ?? '', variable).toMatch(/^\$\{\{ secrets\.STRIPE_TEST_\w+ \}\}$/u);
    }
  });

  it.each(lanes)('%s runs only when every one of them is set', (path, name) => {
    const gate = job(path, name).steps?.find((step) => step.id === 'gate')?.run ?? '';

    for (const variable of requiredByTarget()) {
      expect(gate, variable).toContain(`"$${variable}"`);
    }
    expect(gate).toContain(`"$set" -eq ${requiredByTarget().length}`);
  });
});
