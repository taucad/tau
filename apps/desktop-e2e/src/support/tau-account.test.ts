import { afterEach, describe, expect, it, vi } from 'vitest';

import { tauBillingAccountArgs, tauDatabaseExecArgs } from '#support/tau-account.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.doUnmock('node:child_process');
  vi.doUnmock('#support/config.js');
  vi.resetModules();
});

describe('test-account billing discovery', () => {
  it.each([
    { completedArtifact: true, acceptsAbsentRoute: true },
    { completedArtifact: false, acceptsAbsentRoute: false },
  ])(
    'handles a missing billing route only in completed-artifact mode: %j',
    async ({ completedArtifact, acceptsAbsentRoute }) => {
      vi.resetModules();
      vi.doMock('#support/config.js', () => ({
        // eslint-disable-next-line @typescript-eslint/naming-convention -- actual config export
        desktopE2EApiUrl: 'http://127.0.0.1:4014',
        // eslint-disable-next-line @typescript-eslint/naming-convention -- actual config export
        desktopE2EFrontendUrl: 'http://localhost:3014',
        // eslint-disable-next-line @typescript-eslint/naming-convention -- actual config export
        desktopE2ECompletedArtifact: completedArtifact,
      }));
      vi.doMock('node:child_process', () => ({
        execFile: (...args: unknown[]) => {
          const callback = args.at(-1) as (error: Error | undefined, stdout: string, stderr: string) => void;
          callback(undefined, '', '');
        },
      }));
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response('{}', { status: 200 }))
        .mockResolvedValueOnce(new Response('{}', { status: 200, headers: { 'set-auth-token': 'test-bearer' } }))
        .mockResolvedValueOnce(new Response('', { status: 404 }));
      vi.stubGlobal('fetch', fetchMock);
      const { seedTauTestUser } = await import('#support/tau-account.js');
      const account = { email: 'tau-desktop-billing-route@example.test', name: 'Test', password: 'test' };

      const result = expect(seedTauTestUser(account));
      await (acceptsAbsentRoute
        ? result.resolves.toBe('test-bearer')
        : result.rejects.toThrow('Reading the Tau billing environment failed with HTTP 404.'));
      expect(fetchMock).toHaveBeenCalledTimes(3);
    },
  );
});

describe('completed-artifact development funding', () => {
  const project = 'tau-desktop-e2e-123e4567-e89b-42d3-a456-426614174000';
  const databaseUrl = 'postgresql://desktop_e2e:private@127.0.0.1:32789/desktop_e2e';

  it.each([
    { billingUrl: databaseUrl, port: '127.0.0.1:32789', cluster: project, allowed: true },
    { billingUrl: databaseUrl, port: '127.0.0.1:32790', cluster: project, allowed: false },
    { billingUrl: databaseUrl, port: '127.0.0.1:32789', cluster: 'another-project', allowed: false },
    {
      billingUrl: 'postgresql://desktop_e2e:private@127.0.0.1:5432/desktop_e2e',
      port: '127.0.0.1:32789',
      cluster: project,
      allowed: false,
    },
  ])('funds only the verified run-owned database: %j', async ({ billingUrl, port, cluster, allowed }) => {
    vi.resetModules();
    vi.stubEnv('TAU_E2E_COMPLETED_CLOUD_GATEWAY', 'true');
    vi.stubEnv('TAU_E2E_COMPOSE_PROJECT', project);
    vi.stubEnv('TAU_E2E_POSTGRES_CONTAINER', 'a'.repeat(64));
    vi.stubEnv('TAU_E2E_POSTGRES_DATABASE', 'desktop_e2e');
    vi.stubEnv('TAU_E2E_POSTGRES_USER', 'desktop_e2e');
    vi.stubEnv('DATABASE_URL', databaseUrl);
    vi.stubEnv('BILLING_DATABASE_URL', billingUrl);
    vi.doMock('#support/config.js', () => ({
      // eslint-disable-next-line @typescript-eslint/naming-convention -- actual config export
      desktopE2EApiUrl: 'http://127.0.0.1:4014',
      // eslint-disable-next-line @typescript-eslint/naming-convention -- actual config export
      desktopE2EFrontendUrl: 'http://localhost:3014',
      // eslint-disable-next-line @typescript-eslint/naming-convention -- actual config export
      desktopE2ECompletedArtifact: true,
    }));
    const calls: Array<{ command: unknown; arguments_: unknown; options: unknown }> = [];
    vi.doMock('node:child_process', () => {
      const execFile = (...args: unknown[]): void => {
        const [command, arguments_, options] = args;
        calls.push({ command, arguments_, options });
        const callback = args.at(-1) as (error: Error | undefined, stdout: string, stderr: string) => void;
        const identity = Array.isArray(arguments_) && arguments_.includes('-At');
        const published = Array.isArray(arguments_) && arguments_.includes('port');
        callback(undefined, identity ? `${cluster}|desktop_e2e|desktop_e2e\n` : published ? `${port}\n` : '', '');
      };
      Object.defineProperty(execFile, Symbol.for('nodejs.util.promisify.custom'), {
        value: async (...args: unknown[]) => {
          const [command, arguments_, options] = args;
          calls.push({ command, arguments_, options });
          const identity = Array.isArray(arguments_) && arguments_.includes('-At');
          const published = Array.isArray(arguments_) && arguments_.includes('port');
          return {
            stdout: identity ? `${cluster}|desktop_e2e|desktop_e2e\n` : published ? `${port}\n` : '',
            stderr: '',
          };
        },
      });
      return { execFile };
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response('{}', { status: 200 }))
        .mockResolvedValueOnce(new Response('{}', { status: 200, headers: { 'set-auth-token': 'test-bearer' } }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ environment: 'development' }), { status: 200 })),
    );
    const { seedTauTestUser } = await import('#support/tau-account.js');
    const account = { email: 'tau-desktop-billing-owner@example.test', name: 'Test', password: 'test' };
    const result = expect(seedTauTestUser(account));
    await (allowed ? result.resolves.toBe('test-bearer') : result.rejects.toThrow(/Completed-artifact billing/u));
    const funding = calls.find((call) => call.command === process.execPath);
    expect(Boolean(funding)).toBe(allowed);
    if (funding) {
      expect(funding.arguments_).not.toContain('--env-file-if-exists=apps/api/.env');
      expect(funding.options).toMatchObject({
        env: {
          // eslint-disable-next-line @typescript-eslint/naming-convention -- process environment contract
          DATABASE_URL: databaseUrl,
          // eslint-disable-next-line @typescript-eslint/naming-convention -- process environment contract
          BILLING_DATABASE_URL: databaseUrl,
          // eslint-disable-next-line @typescript-eslint/naming-convention -- process environment contract
          BILLING_ENVIRONMENT: 'development',
        },
      });
    }
  });
});

describe('completed-artifact database isolation', () => {
  it('targets the run-owned Compose database identity', () => {
    const environment: NodeJS.ProcessEnv = {};
    environment['TAU_E2E_POSTGRES_CONTAINER'] = 'a'.repeat(64);
    environment['TAU_E2E_POSTGRES_DATABASE'] = 'desktop_e2e';
    environment['TAU_E2E_POSTGRES_USER'] = 'desktop_e2e';
    environment['TAU_E2E_COMPLETED_ARTIFACT'] = 'true';

    expect(tauDatabaseExecArgs('select 1', environment)).toEqual([
      'exec',
      'a'.repeat(64),
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'desktop_e2e',
      '-d',
      'desktop_e2e',
      '-c',
      'select 1',
    ]);
  });

  it('rejects an injectable container identity', () => {
    const environment: NodeJS.ProcessEnv = {};
    environment['TAU_E2E_POSTGRES_CONTAINER'] = 'owned; touch /tmp/x';

    expect(() => tauDatabaseExecArgs('select 1', environment)).toThrow(/unsupported characters/u);
  });

  it.each(['TAU_E2E_POSTGRES_CONTAINER', 'TAU_E2E_POSTGRES_DATABASE', 'TAU_E2E_POSTGRES_USER'])(
    'rejects completed mode without %s',
    (missingKey) => {
      const environment: NodeJS.ProcessEnv = {};
      environment['TAU_E2E_COMPLETED_ARTIFACT'] = 'true';
      environment['TAU_E2E_POSTGRES_CONTAINER'] = 'a'.repeat(64);
      environment['TAU_E2E_POSTGRES_DATABASE'] = 'desktop_e2e';
      environment['TAU_E2E_POSTGRES_USER'] = 'desktop_e2e';
      environment[missingKey] = undefined;

      expect(() => tauDatabaseExecArgs('select 1', environment)).toThrow(/every run-owned database identity/u);
    },
  );
});

describe('development billing account command', () => {
  it('funds through the API entry point, not the legacy credit tables', () => {
    expect(tauBillingAccountArgs('fund', 'tau-desktop-smoke@example.test')).toEqual([
      '--env-file-if-exists=apps/api/.env',
      '--import',
      '@oxc-node/core/register',
      'apps/api/app/testing/development-billing-account.ts',
      'fund',
      '--email',
      'tau-desktop-smoke@example.test',
    ]);
  });

  it('closes the same account before auth deletion', () => {
    expect(tauBillingAccountArgs('close', 'tau-desktop-smoke@example.test').slice(-3)).toEqual([
      'close',
      '--email',
      'tau-desktop-smoke@example.test',
    ]);
  });

  it('rejects an injectable account identity', () => {
    expect(() => tauBillingAccountArgs('fund', 'a@b.test\'; DROP TABLE "user"; --')).toThrow(
      /outside the tau-desktop-\*@example\.test namespace/u,
    );
    expect(() => tauBillingAccountArgs('close', 'richard@example.com')).toThrow(/namespace/u);
  });
});
