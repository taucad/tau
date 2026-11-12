import { execFileSync } from 'node:child_process';
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
 * A new `env:` entry in `ci.yml` that a task reads therefore has to be declared here first, or, when only one lane
 * sets it for targets that read it, as an `env` input of each of those targets.
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
  for (const step of testSteps()) {
    for (const name of step.env) {
      names.add(name);
    }
  }
  return names;
};

/** Each `ci.yml` step that runs an `nx … -t test…` command: the targets it names and the job and step environment. */
function testSteps(): Array<{ readonly targets: readonly string[]; readonly env: readonly string[] }> {
  return Object.values(ci.jobs).flatMap((job) =>
    (job.steps ?? []).flatMap((step) =>
      step.run && /\bnx\b[^\n]*-t test\b/.test(step.run)
        ? [
            {
              targets: [...step.run.matchAll(/\bnx\b[^\n]*?-t ((?:\w[\w:-]* ?)+)/gu)].flatMap((match) =>
                (match[1] ?? '').trim().split(' '),
              ),
              env: [...Object.keys(job.env ?? {}), ...Object.keys(step.env ?? {})],
            },
          ]
        : [],
    ),
  );
}

/** The `env` inputs each explicitly configured target declares, by target name, across every project.json. */
const projectTargetEnvironment = (): ReadonlyMap<string, ReadonlyArray<ReadonlySet<string>>> => {
  const byTarget = new Map<string, Array<ReadonlySet<string>>>();
  const files = execFileSync('git', ['ls-files', '*project.json'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter((file) => file.endsWith('project.json'));
  for (const file of files) {
    const { targets } = JSON.parse(read(file)) as { targets?: Record<string, { inputs?: readonly Input[] }> };
    for (const [target, { inputs }] of Object.entries(targets ?? {})) {
      const env = new Set(
        (inputs ?? []).flatMap((input) =>
          typeof input === 'object' && typeof input['env'] === 'string' ? [input['env']] : [],
        ),
      );
      byTarget.set(target, [...(byTarget.get(target) ?? []), env]);
    }
  }
  return byTarget;
};

/**
 * Whether every target a step runs declares the name itself: a value only a sharded lane sets (`TAU_CI_SHARD`) is an
 * input of the targets that read it, not of every `test` task.
 */
const declaredByEveryTarget = (name: string): boolean =>
  testSteps()
    .filter((step) => step.env.includes(name))
    .every((step) =>
      step.targets.every((target) => {
        const declared = projectTargetEnvironment().get(target) ?? [];
        return declared.length > 0 && declared.every((env) => env.has(name));
      }),
    );

describe('nx cache inputs', () => {
  it('should keep workflow files out of sharedGlobals and hash the runner Node version instead', () => {
    const shared = nx.namedInputs['sharedGlobals'] ?? [];
    expect(shared.filter((input) => typeof input === 'string' && input.includes('.github/'))).toEqual([]);
    expect(shared).toContainEqual({ runtime: 'node --version' });
  });

  it('should build the API image on the Node that setup-nx gives CI, so its task hashes match CI cache entries', () => {
    const setupNx = load(read('.github/actions/setup-nx/action.yml')) as {
      readonly inputs: Record<string, { readonly default?: string }>;
    };
    const ciNode = setupNx.inputs['node-version']?.default;
    const imageNode = /^ARG NODE_VERSION=(\S+)$/mu.exec(read('apps/api/Dockerfile'))?.[1];
    expect(ciNode).toMatch(/^\d+\.\d+\.\d+$/u);
    expect(imageNode).toBe(ciNode);
  });

  it('should declare every environment value ci.yml gives a test task as an input of the test default', () => {
    expect(nx.targetDefaults['test']?.inputs).toContain('serviceEnvironment');
    const undeclared = [...testEnvironment()].filter(
      (name) => !notTaskInputs.has(name) && !declaredEnvironment.has(name) && !declaredByEveryTarget(name),
    );
    expect(undeclared).toEqual([]);
  });

  it('should still find the API suites step, so the scan above is not vacuous', () => {
    const names = testEnvironment();
    expect(names).toContain('DATABASE_URL');
    expect(names).toContain('TAU_API_URL');
  });

  it('should accept a lane-only value only when every target its lane runs declares it', () => {
    expect(testEnvironment()).toContain('TAU_CI_SHARD');
    expect(declaredByEveryTarget('TAU_CI_SHARD')).toBe(true);
    expect(declaredByEveryTarget('DATABASE_URL')).toBe(false);
  });
});
