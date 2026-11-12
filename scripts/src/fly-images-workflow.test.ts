import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

/* eslint-disable @typescript-eslint/naming-convention -- environment variable names and resolver output keys are exact external names. */

/*
 * Staging builds the API-family Fly images (API, storage, mirror, maintenance: targets of
 * `apps/api/Dockerfile`) once per push in `fly-images.yml`, and each staging deploy job deploys
 * its prebuilt image. Built in each deploy job, the shared stages ran four times and each job
 * exported its own `mode=max` cache (CI audit 2026-11-12, F5 items 3 and 4). Production keeps
 * building in `deploy.yml` until it moves deliberately.
 */

const root = resolve(import.meta.dirname, '../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

type Step = {
  readonly name?: string;
  readonly id?: string;
  readonly if?: string;
  readonly uses?: string;
  readonly run?: string;
  readonly with?: Record<string, unknown>;
};
type Job = {
  readonly name?: string;
  readonly needs?: string | readonly string[];
  readonly if?: string;
  readonly uses?: string;
  readonly with?: Record<string, unknown>;
  readonly steps?: readonly Step[];
};
type Workflow = { readonly jobs: Record<string, Job> };

const workflow = (path: string): Workflow => load(read(path)) as Workflow;
const staging = workflow('.github/workflows/staging.yml');
const images = workflow('.github/workflows/fly-images.yml');
const deploy = workflow('.github/workflows/deploy.yml');
const release = workflow('.github/workflows/release-build.yml');

const flyApps: ReadonlySet<unknown> = new Set(['api', 'storage', 'mirror', 'maintenance']);

const resolveApp = (
  app: string,
  environment: string,
): { status: number | undefined; fields: Record<string, string> } => {
  const result = spawnSync('bash', [resolve(root, '.github/actions/fly-app/resolve.sh'), app, environment], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_SHA: 'c0ffee' },
  });
  const fields = Object.fromEntries(
    result.stdout
      .split('\n')
      .filter((line) => line.includes('='))
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
  );
  return { status: result.status ?? undefined, fields };
};

describe('fly-app resolver', () => {
  type Expected = { app: string; environment: string; flyApp: string; target: string; token: string };
  it.each<Expected>([
    { app: 'api', environment: 'staging', flyApp: 'tau-api-staging', target: 'runtime', token: 'FLY_API_TOKEN' },
    { app: 'api', environment: 'production', flyApp: 'tau-api', target: 'runtime', token: 'FLY_API_TOKEN' },
    {
      app: 'mirror',
      environment: 'staging',
      flyApp: 'tau-mirror-staging',
      target: 'mirror',
      token: 'FLY_MIRROR_API_TOKEN',
    },
    { app: 'mirror', environment: 'production', flyApp: 'tau-mirror', target: 'mirror', token: 'FLY_MIRROR_API_TOKEN' },
    {
      app: 'maintenance',
      environment: 'production',
      flyApp: 'tau-maintenance',
      target: 'maintenance',
      token: 'FLY_MAINTENANCE_API_TOKEN',
    },
    {
      app: 'storage',
      environment: 'staging',
      flyApp: 'tau-storage-staging',
      target: 'storage',
      token: 'FLY_STORAGE_API_TOKEN',
    },
  ])(
    'should map $app in $environment to its Fly app, target and token',
    ({ app, environment, flyApp, target, token }) => {
      const { status, fields } = resolveApp(app, environment);
      expect(status).toBe(0);
      expect(fields).toMatchObject({
        fly_app: flyApp,
        docker_target: target,
        token_secret: token,
        config_file: `apps/${app}/fly.${environment === 'staging' ? 'staging' : 'prod'}.toml`,
        image: `registry.fly.io/${flyApp}:c0ffee`,
        dockerfile: 'apps/api/Dockerfile',
      });
    },
  );

  it('should refuse a production storage app and an unknown app', () => {
    expect(resolveApp('storage', 'production').status).toBe(1);
    expect(resolveApp('ui', 'staging').status).toBe(1);
    expect(resolveApp('api', 'preview').status).toBe(1);
  });
});

describe('staging API-family deploys', () => {
  const build = Object.entries(staging.jobs).find(([, job]) => job.uses === './.github/workflows/fly-images.yml');
  const deploys = Object.entries(staging.jobs).filter(
    ([, job]) => job.uses === './.github/workflows/deploy.yml' && flyApps.has(job.with?.['app']),
  );

  it('should build every API-family image in one job', () => {
    expect(build).toBeDefined();
    expect(new Set(deploys.map(([, job]) => job.with?.['app']))).toEqual(flyApps);
    expect(deploys).toHaveLength(flyApps.size);
  });

  it('should deploy each prebuilt image only after the build passed', () => {
    const [buildName] = build ?? [''];
    for (const [name, job] of deploys) {
      expect(job.with?.['prebuilt'], name).toBe(true);
      expect(job.needs, name).toContain(buildName);
      expect(job.if, name).toContain(`needs.${buildName}.result == 'success'`);
    }
  });
});

describe('fly-images.yml', () => {
  const steps = images.jobs['build']?.steps ?? [];
  const scripts = steps.map((step) => step.run ?? '').join('\n');

  it('should export one registry cache, from the shared build only', () => {
    expect(scripts.match(/--cache-to /gu)).toHaveLength(1);
    expect(steps.find((step) => step.name === 'Build the shared stages')?.run).toContain('--target pruned');
  });

  it('should log in with each app’s own token right before pushing that app, and never print a token', () => {
    const push = steps.find((step) => step.name === "Push each app's image")?.run ?? '';
    expect(push.indexOf('docker login')).toBeLessThan(push.indexOf('--push'));
    expect(push).toContain('.github/actions/fly-app/resolve.sh "$app" "$ENVIRONMENT"');
    for (const login of scripts.match(/.*docker login.*/gu) ?? []) {
      expect(login).toContain('--password-stdin');
    }
    expect(scripts).not.toMatch(/set -x|echo "\$token"|echo "\$\{token\}"/u);
  });
});

describe('deploy.yml', () => {
  const steps = deploy.jobs['deploy']?.steps ?? [];

  it('should skip its own build only when the caller says the image is prebuilt', () => {
    const buildStep = ['Build and push ', '$', '{{ inputs.app }} image'].join('');
    for (const name of ['Set up Docker Buildx', 'Authenticate to registry.fly.io', buildStep]) {
      expect(steps.find((step) => step.name === name)?.if, name).toContain('!inputs.prebuilt');
    }
    expect(steps.find((step) => step.name === 'Deploy prebuilt image to Fly.io')?.if ?? '').not.toContain('prebuilt');
  });

  it('should keep production building its own images through release-build.yml', () => {
    const production = Object.values(release.jobs).filter((job) => job.uses === './.github/workflows/deploy.yml');
    expect(production.map((job) => job.with?.['app'])).toEqual(['api', 'mirror', 'maintenance']);
    for (const job of production) {
      expect(job.with?.['environment']).toBe('production');
      expect(job.with?.['prebuilt']).toBeUndefined();
    }
  });
});

/* eslint-enable @typescript-eslint/naming-convention -- end of the external names. */
