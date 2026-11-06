import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { getSchema } from 'better-auth/db';
import type * as BetterAuthModule from 'better-auth';
import type postgres from 'postgres';

/*
 * D17: the CLI-only instance in `auth.ts` used to be created whenever the runtime imported
 * `staticAuthConfig`, and Better Auth logged its missing-secret and base-URL warnings at every boot.
 * These spies count instance and database-client creation without changing either.
 */
const { betterAuthCalls, postgresCalls } = vi.hoisted(() => ({
  betterAuthCalls: { count: 0 },
  postgresCalls: { count: 0 },
}));

vi.mock('better-auth', async (importOriginal) => {
  const actual = await importOriginal<typeof BetterAuthModule>();
  return {
    ...actual,
    betterAuth: ((options: Parameters<typeof actual.betterAuth>[0]) => {
      betterAuthCalls.count += 1;
      return actual.betterAuth(options);
    }) as typeof actual.betterAuth,
  };
});

vi.mock('postgres', async (importOriginal) => {
  const actual = await importOriginal<{ default: typeof postgres }>();
  const spied = ((...args: Parameters<typeof actual.default>) => {
    postgresCalls.count += 1;
    return actual.default(...args);
  }) as typeof actual.default;
  return { ...actual, default: spied };
});

describe('auth config modules', () => {
  it('lets the runtime import its auth config without creating the CLI instance or a database client', async () => {
    await import('#config/auth-static.config.js');
    await import('#config/better-auth.config.js');

    expect(betterAuthCalls.count).toBe(0);
    expect(postgresCalls.count).toBe(0);
  });

  it('keeps the runtime config off the CLI module', () => {
    const source = readFileSync(fileURLToPath(new URL('better-auth.config.ts', import.meta.url)), 'utf8');

    expect(source).not.toMatch(/from '#config\/auth\.js'/);
  });

  // The better-auth CLI (`nx run api:auth-schema-generate`) loads `auth.ts` and reads the `auth` export's options.
  it('still gives the CLI an instance that generates every auth table', async () => {
    const { auth } = await import('#config/auth.js');

    expect(betterAuthCalls.count).toBe(1);
    // Tables Better Auth keeps out of migrations (the memory-backed rate limit) are not generated either.
    const models = Object.entries(getSchema(auth.options))
      .filter(([, table]) => table.disableMigrations !== true)
      .map(([name]) => name);
    const schema = readFileSync(fileURLToPath(new URL('../database/auth-schema.ts', import.meta.url)), 'utf8');
    const tables = [...schema.matchAll(/pgTable\(\s*'([^']+)'/g)].map(([, name]) => name);

    // `deviceCode` is newer than the generated file and is declared by hand in `database/schema.ts`.
    expect(models.toSorted()).toEqual(['account', 'apikey', 'deviceCode', 'session', 'user', 'verification']);
    expect(models).toEqual(expect.arrayContaining(tables));
  });
});
