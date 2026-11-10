import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

/*
 * The Nx cache key must hold what a task reads, and nothing that only describes how CI schedules it.
 * Workflow files used to sit in `sharedGlobals`, so every `ci.yml` or `publish.yml` edit changed
 * every task hash and marked all projects affected. They are out now, and two things replace what
 * they implicitly covered: the runner's Node version is a `runtime` input, and every environment
 * value the cache-writing workflow hands to a `test` task is an `env` input of `serviceEnvironment`.
 * A new `env:` entry in `ci.yml` that a task reads therefore has to be declared here first.
 */

const root = resolve(import.meta.dirname, '../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

type Input = string | Record<string, string>;
type NxJson = {
  readonly namedInputs: Record<string, readonly Input[]>;
  readonly targetDefaults: Record<string, { readonly inputs?: readonly Input[] }>;
};
type Step = { readonly name?: string; readonly run?: string; readonly env?: Record<string, string> };
type Workflow = {
  readonly env?: Record<string, string>;
  readonly jobs: Record<string, { readonly env?: Record<string, string>; readonly steps?: readonly Step[] }>;
};

const nx = JSON.parse(read('nx.json')) as NxJson;
const ci = load(read('.github/workflows/ci.yml')) as Workflow;

const declaredEnvironment = new Set(
  (nx.namedInputs['serviceEnvironment'] ?? []).flatMap((input) =>
    typeof input === 'object' && typeof input['env'] === 'string' ? [input['env']] : [],
  ),
);

/*
 * Values that change no task output: the cache transport itself, pnpm's install check, the lane
 * name the affected-lane step uses to pick its command, and the
 * S3 conformance credentials, whose suite is switched on by the endpoint and bucket that are
 * declared (hashing credential material into a cache key is avoided on purpose).
 */
const notTaskInputs = new Set([
  'NX_SELF_HOSTED_REMOTE_CACHE_SERVER',
  'NX_SELF_HOSTED_REMOTE_CACHE_ACCESS_TOKEN',
  'pnpm_config_verify_deps_before_run',
  'LANE',
  'TAU_S3_CONFORMANCE_ACCESS_KEY_ID',
  'TAU_S3_CONFORMANCE_SECRET_ACCESS_KEY',
]);

/** Environment that reaches an `nx … -t test` command in `ci.yml`: workflow, job and step level. */
const testEnvironment = (): ReadonlySet<string> => {
  const names = new Set(Object.keys(ci.env ?? {}));
  for (const job of Object.values(ci.jobs)) {
    for (const step of job.steps ?? []) {
      if (step.run && /\bnx\b[^\n]*-t test\b/.test(step.run)) {
        for (const name of [...Object.keys(job.env ?? {}), ...Object.keys(step.env ?? {})]) {
          names.add(name);
        }
      }
    }
  }
  return names;
};

describe('nx cache inputs', () => {
  it('should keep workflow files out of sharedGlobals and hash the runner Node version instead', () => {
    const shared = nx.namedInputs['sharedGlobals'] ?? [];
    expect(shared.filter((input) => typeof input === 'string' && input.includes('.github/'))).toEqual([]);
    expect(shared).toContainEqual({ runtime: 'node --version' });
  });

  it('should declare every environment value ci.yml gives a test task as an input of the test default', () => {
    expect(nx.targetDefaults['test']?.inputs).toContain('serviceEnvironment');
    const undeclared = [...testEnvironment()].filter(
      (name) => !notTaskInputs.has(name) && !declaredEnvironment.has(name),
    );
    expect(undeclared).toEqual([]);
  });

  it('should still find the API suites step, so the scan above is not vacuous', () => {
    const names = testEnvironment();
    expect(names).toContain('DATABASE_URL');
    expect(names).toContain('TAU_API_URL');
  });
});
