import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, matchesGlob, resolve } from 'node:path';
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
/*
 * `.dockerignore` matching as BuildKit applies it: each pattern is anchored at the context root, `**`
 * spans directories, a pattern that matches a directory excludes everything below it, and the last
 * matching pattern wins, so `!` re-includes.
 */
const globTokens: Record<string, string> = { '**/': '(?:.*/)?', '**': '.*', '*': '[^/]*', '?': '[^/]' };

const dockerIgnoreRules = (path: string): ReadonlyArray<{ readonly pattern: RegExp; readonly include: boolean }> =>
  read(path)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => {
      const include = line.startsWith('!');
      const glob = (include ? line.slice(1) : line).replace(/^\/+/u, '').replace(/\/+$/u, '');
      const source = glob
        .split(/(\*\*\/|\*\*|\*|\?)/u)
        .map((part) => globTokens[part] ?? part.replaceAll(/[.+^${}()|[\]\\]/gu, String.raw`\$&`))
        .join('');
      return { pattern: new RegExp(`^${source}$`, 'u'), include };
    });

const excludedFromContext = (
  rules: ReadonlyArray<{ readonly pattern: RegExp; readonly include: boolean }>,
  file: string,
): boolean => {
  const segments = file.split('/');
  const prefixes = segments.map((_, index) => segments.slice(0, index + 1).join('/'));
  let excluded = false;
  for (const { pattern, include } of rules) {
    if (prefixes.some((prefix) => pattern.test(prefix))) {
      excluded = !include;
    }
  }
  return excluded;
};

type Manifest = {
  readonly name?: string;
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
};

/** Directories of the workspace packages `apps/api` reaches through `workspace:` dependencies, itself included. */
const apiWorkspaceClosure = (tracked: readonly string[]): readonly string[] => {
  const directories = new Map<string, string>();
  for (const file of tracked.filter((path) => path.endsWith('/package.json'))) {
    const { name } = JSON.parse(read(file)) as Manifest;
    if (name && !directories.has(name)) {
      directories.set(name, dirname(file));
    }
  }
  const seen = new Set<string>(['apps/api']);
  const queue = ['apps/api'];
  while (queue.length > 0) {
    const manifest = JSON.parse(read(`${queue.shift()}/package.json`)) as Manifest;
    for (const [dependency, range] of Object.entries({
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.peerDependencies,
    })) {
      const directory = directories.get(dependency);
      if (range.startsWith('workspace:') && directory && !seen.has(directory)) {
        seen.add(directory);
        queue.push(directory);
      }
    }
  }
  return [...seen];
};

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

  /*
   * The image's build stage hashes the API's tasks against the remote cache CI writes, so its context
   * must hold every file a CI checkout hashes for them: Nx hashes the root `.gitignore` into every
   * task, infers each project's npm dependencies from all its sources (tests included), and hashes
   * the tracked `.env` templates of a project's production files. Any one missing made every task a
   * miss (CI audit 2026-11-12, F5: 0 hits in every image build).
   */
  it('should give the API image build every tracked file CI hashes for the API and its workspace dependencies', () => {
    const rules = dockerIgnoreRules('apps/api/Dockerfile.dockerignore');
    const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
      .split('\0')
      .filter((file) => file !== '');
    const closure = apiWorkspaceClosure(tracked);
    expect(closure.length).toBeGreaterThan(10);
    const hashedRoots = new Set([
      '.gitignore',
      'nx.json',
      'package.json',
      'pnpm-lock.yaml',
      'tools/typescript/base.json',
    ]);
    const missing = tracked.filter(
      (file) =>
        (hashedRoots.has(file) || closure.some((directory) => file.startsWith(`${directory}/`))) &&
        excludedFromContext(rules, file),
    );
    expect(missing).toEqual([]);
  });

  it('should still keep secrets and other projects out of the API image context, so the check above is not vacuous', () => {
    const rules = dockerIgnoreRules('apps/api/Dockerfile.dockerignore');
    expect(excludedFromContext(rules, 'apps/api/.env')).toBe(true);
    expect(excludedFromContext(rules, 'apps/api/.env.local')).toBe(true);
    expect(excludedFromContext(rules, 'apps/api/.env.test')).toBe(false);
    expect(excludedFromContext(rules, 'apps/api-e2e/src/health.test.ts')).toBe(true);
    expect(excludedFromContext(rules, 'packages/runtime/dist/index.js')).toBe(true);
    expect(excludedFromContext(rules, 'node_modules/nx/package.json')).toBe(true);
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

/*
 * Nx marks every project affected whose target inputs name a changed `{workspaceRoot}/` file, so the
 * React event-layer counter (`react-event-layer.ts`) is an input of the projects that run it and of no
 * target default: as a `test` and `typecheck` default, and inside the `lint` default's oxlint glob, each
 * edit to it made all 138 projects affected. The policy tests import it with `nx-ignore-next-line`, so the
 * input is the only thing that reruns them.
 */
describe('react event-layer counter input', () => {
  const helper = 'libs/oxlint/src/react-event-layer.ts';
  const projectsRunningCounter = execFileSync('git', ['ls-files', '*react-event-layer.policy.node.test.ts'], {
    cwd: root,
    encoding: 'utf8',
  })
    .split('\n')
    .filter((file) => file !== '')
    .map((file) => file.slice(0, file.search(/\/(?:src|app)\//u)));

  /** The `{workspaceRoot}/` file globs an input list names, named inputs expanded. */
  const workspaceGlobs = (inputs: readonly Input[]): readonly string[] =>
    inputs.flatMap((input) => {
      if (typeof input === 'object') {
        return [];
      }
      if (input in nx.namedInputs) {
        return workspaceGlobs(nx.namedInputs[input] ?? []);
      }
      return input.startsWith('{workspaceRoot}/') ? [input.slice('{workspaceRoot}/'.length)] : [];
    });

  it('should name the counter in no target default, so an edit to it touches only the projects that run it', () => {
    const naming = Object.entries(nx.targetDefaults).filter(([, { inputs }]) =>
      workspaceGlobs(inputs ?? []).some((glob) => matchesGlob(helper, glob)),
    );
    expect(naming.map(([target]) => target)).toEqual([]);
  });

  it('should name the counter in the test and typecheck inputs of every project that runs the policy test', () => {
    expect(projectsRunningCounter.length).toBeGreaterThan(5);
    const missing = projectsRunningCounter.flatMap((project) => {
      const { targets } = JSON.parse(read(`${project}/project.json`)) as {
        targets?: Record<string, { inputs?: readonly Input[] }>;
      };
      return ['test', 'typecheck'].flatMap((target) =>
        workspaceGlobs(targets?.[target]?.inputs ?? []).includes(helper) ? [] : [`${project}:${target}`],
      );
    });
    expect(missing).toEqual([]);
  });
});
