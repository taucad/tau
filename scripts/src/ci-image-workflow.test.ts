/* eslint-disable @typescript-eslint/naming-convention -- Environment variables of the scripts under test. */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { load } from 'js-yaml';
import { afterEach, describe, expect, it } from 'vitest';

/*
 * `ci-image.yml` and `tools/ci-image` (CI throughput programme, ST-4): the prebuilt Linux CI job image is
 * built from pinned bases, published to GHCR only by one job, attested with an SBOM and provenance,
 * rebuilt on its inputs and weekly, and consumed only by digest through `tools/ci-image/image.lock.json`.
 * A lockfile with no pinned image resolves to no image, so its jobs set up on the runner as before.
 */

const root = resolve(import.meta.dirname, '../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

type Step = {
  readonly id?: string;
  readonly name?: string;
  readonly if?: string;
  readonly run?: string;
  readonly uses?: string;
  readonly env?: Record<string, string>;
  readonly with?: Record<string, string | boolean>;
};
type Job = {
  readonly if?: string;
  readonly needs?: string | readonly string[];
  readonly permissions?: Record<string, string>;
  readonly environment?: { readonly name: string };
  readonly outputs?: Record<string, string>;
  readonly steps: readonly Step[];
};
type Workflow = {
  readonly on: {
    readonly push?: { readonly branches?: readonly string[]; readonly paths?: readonly string[] };
    readonly pull_request?: { readonly paths?: readonly string[] };
    readonly schedule?: ReadonlyArray<{ readonly cron: string }>;
    readonly workflow_dispatch?: unknown;
  };
  readonly permissions?: Record<string, string>;
  readonly env?: Record<string, string>;
  readonly jobs: Record<string, Job>;
};
type Lock = {
  readonly image: string;
  readonly digests: Record<string, { readonly digest: string; readonly recipe: string }>;
};

const source = read('.github/workflows/ci-image.yml');
const workflow = load(source) as Workflow;
const job = (name: string): Job => {
  const found = workflow.jobs[name];
  if (found === undefined) {
    throw new Error(`ci-image.yml has no ${name} job`);
  }
  return found;
};
const buildStep = (name: string): Step => {
  const step = job(name).steps.find((candidate) => candidate.uses?.startsWith('docker/build-push-action@'));
  if (step === undefined) {
    throw new Error(`${name} has no docker/build-push-action step`);
  }
  return step;
};
const dockerfile = read('tools/ci-image/Dockerfile');
const setupNx = load(read('.github/actions/setup-nx/action.yml')) as {
  readonly inputs: Record<string, { readonly default?: string }>;
};
const image = 'ghcr.io/taucad/tau-ci';
const digestPattern = /^sha256:[\da-f]{64}$/u;

describe('ci-image.yml permissions', () => {
  it('should read contents by default and grant package writes only to the publish job', () => {
    expect(workflow.permissions).toEqual({ contents: 'read' });
    const writers = Object.entries(workflow.jobs)
      .filter(([, { permissions }]) => permissions?.['packages'] === 'write')
      .map(([name]) => name);
    expect(writers).toEqual(['publish']);
    expect(job('publish').permissions).toEqual({ contents: 'read', packages: 'write' });
  });

  it('should never publish from a pull request, a fork or the verify job', () => {
    expect(job('verify').if).toBe("github.event_name == 'pull_request'");
    expect(job('verify').permissions).toBeUndefined();
    expect(buildStep('verify').with?.['push']).toBe(false);
    expect(job('publish').if).toContain("github.event_name != 'pull_request'");
    expect(job('publish').if).toContain("github.repository == 'taucad/tau'");
  });

  it('should pass no secret to a build and hold the bot token only in the pin job', () => {
    for (const name of ['verify', 'publish']) {
      expect(JSON.stringify(job(name))).not.toContain('secrets.');
      const step = buildStep(name);
      expect(Object.keys(step.with ?? {})).not.toEqual(
        expect.arrayContaining(['secrets', 'secret-files', 'secret-envs']),
      );
    }
    expect(job('pin').environment?.name).toBe('release-pr');
    expect(job('pin').permissions).toBeUndefined();
  });

  it('should pin every action by commit', () => {
    const unpinned = Object.values(workflow.jobs)
      .flatMap(({ steps }) => steps)
      .flatMap(({ uses }) => (uses === undefined ? [] : [uses]))
      .filter((uses) => !/@[\da-f]{40}$/u.test(uses));
    expect(unpinned).toEqual([]);
  });
});

describe('ci-image.yml rebuilds', () => {
  it('should rebuild on main when the lockfile, the Dockerfile or a toolchain pin changes', () => {
    expect(workflow.on.push?.branches).toEqual(['main']);
    expect(workflow.on.push?.paths).toEqual(
      expect.arrayContaining([
        'pnpm-lock.yaml',
        'pnpm-workspace.yaml',
        'package.json',
        'tools/pnpm/**',
        'tools/ci-image/Dockerfile',
        'tools/ci-image/Dockerfile.dockerignore',
        'tools/ci-image/image-key.sh',
        '.github/actions/setup-nx/action.yml',
        '.github/workflows/ci-image.yml',
      ]),
    );
  });

  it('should rebuild weekly without the layer cache for operating-system patches', () => {
    const crons = (workflow.on.schedule ?? []).map(({ cron }) => cron);
    expect(crons).toHaveLength(1);
    const [minute, hour, dayOfMonth, month, dayOfWeek] = crons[0]?.split(' ') ?? [];
    expect([dayOfMonth, month]).toEqual(['*', '*']);
    expect(dayOfWeek).toMatch(/^[0-6]$/u);
    expect(minute).not.toBe('0');
    expect(hour).toMatch(/^\d+$/u);
    expect(buildStep('publish').with?.['no-cache']).toContain("github.event_name == 'schedule'");
    expect(dockerfile).toContain('apt-get upgrade');
    expect(workflow.on).toHaveProperty('workflow_dispatch');
  });

  it('should skip a push whose recipe the lock already pins, and build the schedule and dispatches', () => {
    const key = job('publish').steps.find((step) => step.id === 'key');
    expect(key?.run).toContain('tools/ci-image/image-key.sh recipe');
    expect(key?.run).toContain('[ "$EVENT" = push ] && [ "$pinned" = "$recipe" ]');
    expect(buildStep('publish').if).toBe("steps.key.outputs.build == 'true'");
  });

  it('should never make a lockfile pull request wait for the image', () => {
    expect(workflow.on.pull_request?.paths).not.toContain('pnpm-lock.yaml');
    expect(
      workflow.on.pull_request?.paths?.every(
        (path) => path.startsWith('tools/ci-image/') || path === '.github/workflows/ci-image.yml',
      ),
    ).toBe(true);
  });
});

describe('ci-image.yml provenance and pinning', () => {
  it('should attach an SBOM and max-mode provenance to every pushed image', () => {
    const publish = buildStep('publish');
    expect(publish.with?.['push']).toBe(true);
    expect(publish.with?.['sbom']).toBe(true);
    expect(publish.with?.['provenance']).toBe('mode=max');
    expect(publish.with?.['file']).toBe('tools/ci-image/Dockerfile');
    expect(workflow.env?.['IMAGE']).toBe(image);
  });

  it('should tag the image by its key and check the pushed digest before pinning it', () => {
    const publish = buildStep('publish');
    expect(String(publish.with?.['tags'])).toContain('steps.key.outputs.key');
    expect(String(publish.with?.['build-args'])).toMatch(/^CI_IMAGE_TAG=\$\{\{ steps\.key\.outputs\.key \}\}$/u);
    const check = job('publish').steps.find((step) => step.name === 'Check the pushed image');
    expect(check?.run).toBe('tools/ci-image/smoke.sh "$IMAGE@$DIGEST"');
    expect(job('publish').outputs?.['digest']).toContain('steps.build.outputs.digest');
  });

  it('should record only a validated digest, through one bot pull request', () => {
    const pin = job('pin');
    expect(pin.needs).toBe('publish');
    expect(pin.if).toBe("needs.publish.outputs.digest != ''");
    const run = pin.steps.at(-1)?.run ?? '';
    expect(run).toContain('^sha256:[0-9a-f]{64}$');
    expect(run).toContain('tools/ci-image/image.lock.json');
    expect(run).toContain('gh pr create --base main --head "$BRANCH"');
    expect(run).not.toContain('--auto');
  });

  it('should keep the lock file a map of keys to digests of the published image', () => {
    const lock = JSON.parse(read('tools/ci-image/image.lock.json')) as Lock;
    expect(lock.image).toBe(image);
    for (const [key, entry] of Object.entries(lock.digests)) {
      expect(key).toMatch(/^lock-[\da-f]{16}-node\d+\.\d+\.\d+-linux-(?:x64|arm64)$/u);
      expect(entry.digest).toMatch(digestPattern);
      expect(entry.recipe).toMatch(/^[\da-f]{16}$/u);
    }
  });
});

describe('tools/ci-image/Dockerfile', () => {
  it('should pin every base image by digest', () => {
    const bases = [...dockerfile.matchAll(/^ARG \w+_IMAGE=(\S+)$/gmu)].map((match) => match[1] ?? '');
    expect(bases).toHaveLength(2);
    for (const base of bases) {
      expect(base).toMatch(/:[\w.-]+@sha256:[\da-f]{64}$/u);
    }
    const froms = [...dockerfile.matchAll(/^FROM (\S+)/gmu)].map((match) => match[1] ?? '');
    expect(froms.every((from) => from.startsWith('${') || ['base', 'store'].includes(from))).toBe(true);
  });

  it("should run setup-nx's default Node.js", () => {
    const node = setupNx.inputs['node-version']?.default;
    expect(node).toMatch(/^\d+\.\d+\.\d+$/u);
    expect(dockerfile).toMatch(new RegExp(`^ARG NODE_IMAGE=node:${node?.replaceAll('.', String.raw`\.`)}-`, 'mu'));
  });

  it('should bake no npm configuration, token or node_modules', () => {
    const instructions = dockerfile
      .split('\n')
      .filter((line) => !line.startsWith('#'))
      .join('\n');
    expect(instructions).not.toMatch(/npmrc|_authToken|NPM_TOKEN|NODE_AUTH_TOKEN|--mount=type=secret/u);
    expect(dockerfile).toMatch(/^COPY --from=store \/opt\/pnpm-store \/opt\/pnpm-store$/mu);
    expect(dockerfile).not.toMatch(/^COPY --from=store \S*node_modules/mu);
    const ignore = read('tools/ci-image/Dockerfile.dockerignore').split('\n');
    expect(ignore.find((line) => line !== '' && !line.startsWith('#'))).toBe('*');
    expect(ignore.filter((line) => line.startsWith('!'))).toEqual([
      '!package.json',
      '!pnpm-lock.yaml',
      '!pnpm-workspace.yaml',
      '!**/package.json',
      '!tools/pnpm',
    ]);
  });
});

describe('tools/ci-image key and resolution', () => {
  const temporary: string[] = [];
  afterEach(() => {
    for (const directory of temporary.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  /** A copy of the files the scripts read, so a test can change them. */
  const checkout = (pinned?: Lock): string => {
    const lock = pinned ?? { image, digests: {} };
    const directory = mkdtempSync(join(tmpdir(), 'ci-image-'));
    temporary.push(directory);
    for (const path of [
      'tools/ci-image/image-key.sh',
      'tools/ci-image/resolve.sh',
      'tools/ci-image/Dockerfile',
      'tools/ci-image/Dockerfile.dockerignore',
      'tools/pnpm',
      '.github/actions/setup-nx/action.yml',
      'package.json',
      'pnpm-workspace.yaml',
    ]) {
      mkdirSync(dirname(join(directory, path)), { recursive: true });
      cpSync(resolve(root, path), join(directory, path), { recursive: true });
    }
    writeFileSync(join(directory, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n");
    writeFileSync(join(directory, 'tools/ci-image/image.lock.json'), JSON.stringify(lock));
    return directory;
  };

  const run = (directory: string, [script, ...args]: readonly string[], env: NodeJS.ProcessEnv = {}) => {
    const result = spawnSync('bash', [join(directory, 'tools/ci-image', script ?? ''), ...args], {
      encoding: 'utf8',
      env: { ...process.env, CI_IMAGE_ARCH: 'x64', TAU_CI_IMAGE: '', ...env },
    });
    return { status: result.status, stdout: result.stdout.trim(), stderr: result.stderr };
  };

  const keyOf = (directory: string): string => run(directory, ['image-key.sh', 'key']).stdout;
  const digest = `sha256:${'a'.repeat(64)}`;

  it("should key the image by the lockfile's hash, Node.js, the OS and the architecture", () => {
    const directory = checkout();
    const node = setupNx.inputs['node-version']?.default ?? '';
    expect(keyOf(directory)).toMatch(
      new RegExp(`^lock-[\\da-f]{16}-node${node.replaceAll('.', String.raw`\.`)}-linux-x64$`, 'u'),
    );
    expect(run(directory, ['image-key.sh', 'key'], { CI_IMAGE_ARCH: 'arm64' }).stdout).toMatch(/-linux-arm64$/u);
    const before = keyOf(directory);
    writeFileSync(join(directory, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\nimporters: {}\n");
    expect(keyOf(directory)).not.toBe(before);
    expect(run(directory, ['image-key.sh']).status).toBe(2);
  });

  it('should change the recipe when the Dockerfile changes and keep it otherwise', () => {
    const directory = checkout();
    const recipe = run(directory, ['image-key.sh', 'recipe']).stdout;
    expect(recipe).toMatch(/^[\da-f]{16}$/u);
    expect(run(directory, ['image-key.sh', 'recipe']).stdout).toBe(recipe);
    writeFileSync(join(directory, 'tools/ci-image/Dockerfile'), `${dockerfile}\n# changed\n`);
    expect(run(directory, ['image-key.sh', 'recipe']).stdout).not.toBe(recipe);
  });

  it('should resolve the pinned digest for the current key', () => {
    const key = keyOf(checkout());
    const directory = checkout({ image, digests: { [key]: { digest, recipe: '0'.repeat(16) } } });
    expect(run(directory, ['resolve.sh'])).toMatchObject({ status: 0, stdout: `key=${key}\nimage=${image}@${digest}` });
  });

  it('should fall back to no image when the lockfile has no pinned image yet', () => {
    const directory = checkout({
      image,
      digests: { [`lock-${'0'.repeat(16)}-node24.20.0-linux-x64`]: { digest, recipe: '0'.repeat(16) } },
    });
    const result = run(directory, ['resolve.sh']);
    expect(result.status).toBe(0);
    expect(result.stdout.split('\n').at(-1)).toBe('image=');
    expect(result.stderr).toContain('No CI job image is pinned');
  });

  it('should fall back to no image for a malformed digest or when switched off', () => {
    const key = keyOf(checkout());
    const malformed = checkout({ image, digests: { [key]: { digest: 'latest', recipe: '0'.repeat(16) } } });
    expect(run(malformed, ['resolve.sh']).stdout.split('\n').at(-1)).toBe('image=');
    const pinned = checkout({ image, digests: { [key]: { digest, recipe: '0'.repeat(16) } } });
    expect(run(pinned, ['resolve.sh'], { TAU_CI_IMAGE: 'off' }).stdout.split('\n').at(-1)).toBe('image=');
  });
});
