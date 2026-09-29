import { afterEach, describe, expect, it, vi } from 'vitest';

import { tauBillingAccountArgs, tauDatabaseExecArgs } from '#support/tau-account.js';

afterEach(() => {
  vi.unstubAllGlobals();
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
