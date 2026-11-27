/**
 * The account's Tau Desktop sign-ins on PostgreSQL: listed by refresh family, revoked as a family, scoped to the
 * account (desktop sign-in execution plan DSI-2; the D5=B "signed-in apps" list).
 */
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, inArray } from 'drizzle-orm';
import postgres from 'postgres';
import type { DatabaseService } from '@taucad/api-database';
import * as schema from '@taucad/api-database/schema';
import { AccountService } from '#api/account/account.service.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const day = 24 * 60 * 60 * 1000;

describe('AccountService desktop sign-ins', () => {
  const client = postgres(databaseUrl, { max: 2, onnotice: () => undefined });
  const database = drizzle(client, { schema });
  const service = new AccountService({ database } as unknown as DatabaseService);
  const owner = `user_${randomUUID()}`;
  const stranger = `user_${randomUUID()}`;

  /** One refresh row of a family, as the provider writes it. */
  const refreshRow = (
    { userId, familyId, createdAt }: { userId: string; familyId: string; createdAt: Date },
    extra: Partial<typeof schema.oauthRefreshToken.$inferInsert> = {},
  ): typeof schema.oauthRefreshToken.$inferInsert => ({
    id: `ort_${randomUUID()}`,
    token: randomUUID(),
    clientId: 'tau-desktop',
    userId,
    authorizationCodeId: familyId,
    expiresAt: new Date(createdAt.getTime() + 30 * day),
    createdAt,
    scopes: ['openid', 'offline_access'],
    ...extra,
  });

  beforeAll(async () => {
    const now = Date.now();
    await database.insert(schema.user).values(
      [owner, stranger].map((id) => ({
        id,
        name: 'Desktop',
        email: `${id}@example.test`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    );
    await database.insert(schema.oauthRefreshToken).values([
      // A live sign-in that rotated twice: signed in 10 days ago, last refreshed an hour ago.
      refreshRow(
        { userId: owner, familyId: 'family-live', createdAt: new Date(now - 10 * day) },
        { revoked: new Date(now - 9 * day) },
      ),
      refreshRow(
        { userId: owner, familyId: 'family-live', createdAt: new Date(now - 5 * day) },
        { revoked: new Date(now - day) },
      ),
      refreshRow({ userId: owner, familyId: 'family-live', createdAt: new Date(now - 3_600_000) }),
      // Revoked as a family.
      refreshRow(
        { userId: owner, familyId: 'family-revoked', createdAt: new Date(now - 2 * day) },
        { revoked: new Date(now - day) },
      ),
      // Past the 90-day cap although its newest row is unexpired.
      refreshRow(
        { userId: owner, familyId: 'family-capped', createdAt: new Date(now - 91 * day) },
        { revoked: new Date(now - 60 * day) },
      ),
      refreshRow({ userId: owner, familyId: 'family-capped', createdAt: new Date(now - 3_600_000) }),
      // Idle for longer than 30 days: expired.
      refreshRow({ userId: owner, familyId: 'family-idle', createdAt: new Date(now - 40 * day) }),
      // Another account's sign-in.
      refreshRow({ userId: stranger, familyId: 'family-stranger', createdAt: new Date(now - day) }),
    ]);
    await database.insert(schema.oauthAccessToken).values({
      id: `oat_${randomUUID()}`,
      token: randomUUID(),
      clientId: 'tau-desktop',
      userId: owner,
      authorizationCodeId: 'family-live',
      expiresAt: new Date(now + 3_600_000),
      createdAt: new Date(now),
      scopes: ['openid', 'offline_access'],
    });
  });

  afterAll(async () => {
    await database.delete(schema.user).where(inArray(schema.user.id, [owner, stranger]));
    await client.end();
  });

  it('should list only live sign-ins inside their 90 days, newest activity first, with their end', async () => {
    const signIns = await service.listDesktopSignIns(owner);

    expect(signIns.map((signIn) => signIn.id)).toEqual(['family-live']);
    const [live] = signIns;
    const signedInAt = new Date(live!.signedInAt).getTime();
    expect(Date.now() - signedInAt).toBeGreaterThan(10 * day - 60_000);
    expect(new Date(live!.endsAt).getTime() - signedInAt).toBe(90 * day);
    expect(Date.now() - new Date(live!.lastActiveAt).getTime()).toBeLessThan(2 * 3_600_000);
  });

  it("should not reveal or revoke another account's sign-in", async () => {
    await expect(service.revokeDesktopSignIn(owner, 'family-stranger')).resolves.toBe(false);
    const strangers = await service.listDesktopSignIns(stranger);
    expect(strangers.map((signIn) => signIn.id)).toEqual(['family-stranger']);
  });

  it('should revoke every refresh token of the family and delete its access tokens', async () => {
    await expect(service.revokeDesktopSignIn(owner, 'family-live')).resolves.toBe(true);

    const refreshRows = await database
      .select({ revoked: schema.oauthRefreshToken.revoked })
      .from(schema.oauthRefreshToken)
      .where(eq(schema.oauthRefreshToken.authorizationCodeId, 'family-live'));
    const accessRows = await database
      .select({ id: schema.oauthAccessToken.id })
      .from(schema.oauthAccessToken)
      .where(eq(schema.oauthAccessToken.authorizationCodeId, 'family-live'));
    expect(refreshRows.every((row) => row.revoked !== null)).toBe(true);
    expect(accessRows).toEqual([]);
    expect(await service.listDesktopSignIns(owner)).toEqual([]);
  });

  it('should answer false for an unknown sign-in', async () => {
    await expect(service.revokeDesktopSignIn(owner, 'family-unknown')).resolves.toBe(false);
  });
});
