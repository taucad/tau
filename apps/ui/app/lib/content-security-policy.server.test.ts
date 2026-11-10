// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildReportOnlyContentSecurityPolicy,
  reportOnlyContentSecurityPolicy,
  resolveContentSecurityPolicyEnvironment,
} from '#lib/content-security-policy.server.js';
import type { ContentSecurityPolicyEnvironment } from '#lib/content-security-policy.server.js';
import { contentSecurityPolicyHeaders } from '#scripts/write-content-security-policy-headers.mts';

const appRoot = resolve(import.meta.dirname, '../..');
const productionPolicy = buildReportOnlyContentSecurityPolicy('production');
const stagingPolicy = buildReportOnlyContentSecurityPolicy('staging');
const developmentPolicy = buildReportOnlyContentSecurityPolicy('development');

/** Every host a policy names, from each directive's `scheme://host` sources. */
const hostsOf = (policy: string): string[] =>
  [...policy.matchAll(/\b(?:https|wss):\/\/([^\s;]+)/gu)].map((match) => match[1]!);

const directive = (policy: string, name: string): string[] =>
  new RegExp(`(?:^|; )${name} ([^;]+)`, 'u').exec(policy)?.[1]?.split(' ') ?? [];

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(async (cleanup) => cleanup()));
});

describe('resolveContentSecurityPolicyEnvironment', () => {
  it.each<[string | undefined, ContentSecurityPolicyEnvironment]>([
    ['https://tau.new', 'production'],
    ['https://tau.new/', 'production'],
    ['https://taucad.dev', 'staging'],
    ['http://localhost:3000', 'development'],
    ['https://taucad-prod-us.netlify.app', 'development'],
    ['https://api.tau.new', 'development'],
    ['not a url', 'development'],
    [undefined, 'development'],
  ])('should map TAU_FRONTEND_URL %s to %s', (frontendUrl, environment) => {
    expect(resolveContentSecurityPolicyEnvironment(frontendUrl)).toBe(environment);
  });
});

describe('buildReportOnlyContentSecurityPolicy', () => {
  it('should name no staging host in the production policy', () => {
    expect(hostsOf(productionPolicy).filter((host) => host.includes('taucad.dev'))).toEqual([]);
    expect(productionPolicy).not.toContain('tau-staging');
  });

  it('should name no production host in the staging policy', () => {
    expect(hostsOf(stagingPolicy).filter((host) => host === 'tau.new' || host.endsWith('.tau.new'))).toEqual([]);
    expect(stagingPolicy).not.toContain('tau-prod');
  });

  it('should admit production hosts only in the production policy', () => {
    expect(directive(productionPolicy, 'img-src')).toContain('https://cdn.tau.new');
    expect(directive(productionPolicy, 'connect-src')).toEqual(
      expect.arrayContaining([
        'https://tau-prod-content-private.271cffba9907a76320b6a4993f756601.r2.cloudflarestorage.com',
        'https://files.tau.new',
        'https://api.tau.new',
        'wss://api.tau.new',
        'https://cdn.tau.new',
        'https://dependencies.tau.new',
      ]),
    );
  });

  it('should admit staging hosts only in the staging policy', () => {
    expect(directive(stagingPolicy, 'img-src')).toContain('https://cdn.taucad.dev');
    expect(directive(stagingPolicy, 'connect-src')).toEqual(
      expect.arrayContaining([
        'https://tau-staging-au-content-private.271cffba9907a76320b6a4993f756601.r2.cloudflarestorage.com',
        'https://files.taucad.dev',
        'https://api.taucad.dev',
        'wss://api.taucad.dev',
        'https://cdn.taucad.dev',
        'https://dependencies.taucad.dev',
      ]),
    );
  });

  it('should name neither environment in the development policy', () => {
    expect(hostsOf(developmentPolicy).filter((host) => /(?:^|\.)(?:tau\.new|taucad\.dev)$/u.test(host))).toEqual([]);
    expect(developmentPolicy).not.toContain('r2.cloudflarestorage.com');
  });

  it.each(['production', 'staging', 'development'] as const)(
    'should keep the shared third parties and every other directive in the %s policy',
    (environment) => {
      const policy = buildReportOnlyContentSecurityPolicy(environment);
      expect(directive(policy, 'img-src')).toEqual(
        expect.arrayContaining(["'self'", 'data:', 'blob:', 'https://github.com', 'https:']),
      );
      expect(directive(policy, 'connect-src')).toEqual(
        expect.arrayContaining([
          "'self'",
          'https://api.github.com',
          'https://api.zoo.dev',
          'https://api.kittycad.io',
          'https://*.ingest.sentry.io',
          'https://*.ingest.us.sentry.io',
          'https://registry.npmjs.org',
          'wss:',
        ]),
      );
      const withoutHostLists = (value: string): string =>
        value
          .split('; ')
          .filter((part) => !part.startsWith('img-src ') && !part.startsWith('connect-src '))
          .join('; ');
      expect(withoutHostLists(policy)).toBe(
        "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; worker-src 'self' blob:; child-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests; report-to default;",
      );
    },
  );

  it("should serve the test run's site the development policy", () => {
    // The vitest setup does not set process.env.TAU_FRONTEND_URL to a deployed origin.
    expect(reportOnlyContentSecurityPolicy).toBe(
      buildReportOnlyContentSecurityPolicy(resolveContentSecurityPolicyEnvironment(process.env['TAU_FRONTEND_URL'])),
    );
  });
});

describe('write-content-security-policy-headers', () => {
  it('should write the site policy for every path into _headers', async () => {
    const parent = resolve(appRoot, 'node_modules/.cache');
    await mkdir(parent, { recursive: true });
    const client = await mkdtemp(join(parent, 'csp-headers-'));
    cleanups.push(async () => rm(client, { recursive: true, force: true }));
    execFileSync(process.execPath, ['scripts/write-content-security-policy-headers.mts', client], {
      cwd: appRoot,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variable name
      env: { ...process.env, TAU_FRONTEND_URL: 'https://tau.new' },
      stdio: 'pipe',
    });
    const written = await readFile(join(client, '_headers'), 'utf8');
    expect(written).toBe(contentSecurityPolicyHeaders('production'));
    expect(written).toBe(`/*\n  Content-Security-Policy-Report-Only: ${productionPolicy}\n`);
  });

  it('should run in every netlify.toml build command right after the UI build', async () => {
    const toml = await readFile(join(appRoot, 'netlify.toml'), 'utf8');
    const commands = [...toml.matchAll(/^command = "(.*)"$/gmu)]
      .map((match) => match[1]!)
      .filter((command) => command.includes('pnpm nx build ui'));
    expect(commands).toHaveLength(4);
    for (const command of commands) {
      expect(command).toContain(
        'pnpm nx build ui && node scripts/write-content-security-policy-headers.mts build/client',
      );
    }
  });
});
