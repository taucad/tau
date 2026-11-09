import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertDeletionDatabase } from '#project-deletion.fixture.js';

const marker = 'cpd07-acceptance-postgres-0a1b2c';
const isolated = 'postgresql://cpd_acceptance:password@127.0.0.1:55432/cpd_acceptance';

describe('assertDeletionDatabase', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should accept the isolated loopback database when its container marker is set', () => {
    vi.stubEnv('CPD_ACCEPTANCE_POSTGRES_CONTAINER', marker);

    expect(assertDeletionDatabase(isolated)).toBe(isolated);
  });

  it('should refuse any database while the container marker is absent', () => {
    vi.stubEnv('CPD_ACCEPTANCE_POSTGRES_CONTAINER', '');

    expect(() => assertDeletionDatabase(isolated)).toThrow(/owned PostgreSQL container marker/u);
  });

  it('should refuse a missing connection string', () => {
    vi.stubEnv('CPD_ACCEPTANCE_POSTGRES_CONTAINER', marker);

    expect(() => assertDeletionDatabase(undefined)).toThrow(/owned PostgreSQL container marker/u);
  });

  it.each([
    ['the shared developer port', 'postgresql://cpd_acceptance:password@127.0.0.1:5432/cpd_acceptance'],
    ['a non-loopback host', 'postgresql://cpd_acceptance:password@db.example.invalid:55432/cpd_acceptance'],
    ['another role', 'postgresql://dev_user:password@127.0.0.1:55432/cpd_acceptance'],
    ['the developer database', 'postgresql://cpd_acceptance:password@127.0.0.1:55432/tau_dev'],
  ])('should refuse %s', (_case, connection) => {
    vi.stubEnv('CPD_ACCEPTANCE_POSTGRES_CONTAINER', marker);

    expect(() => assertDeletionDatabase(connection)).toThrow(/isolated loopback PostgreSQL database/u);
  });
});
