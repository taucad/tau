import { describe, expect, it } from 'vitest';

import { tauBillingAccountArgs, tauDatabaseExecArgs } from '#support/tau-account.js';

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
