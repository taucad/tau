import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import * as schema from '@taucad/api-database/schema';
import { emailAddressState, emailEvent } from '@taucad/api-database/schema';
import { databaseReachable } from '@taucad/api-database/testing/database-reachable';
import { reapExpiredEmailEvents } from '#email-event-retention.js';

const databaseUrl = process.env.DATABASE_URL;
const day = 24 * 60 * 60 * 1000;

describe.skipIf(!(await databaseReachable(databaseUrl)))('email event retention (blueprint D6)', () => {
  const client = postgres(databaseUrl, { max: 1, prepare: false });
  const database = drizzle(client, { schema });

  afterAll(async () => {
    await client.end();
  });

  it('deletes events and cleared address rows older than 90 days and keeps live and recent ones', async () => {
    const now = new Date('2026-11-15T00:00:00.000Z');
    const at = (daysAgo: number): Date => new Date(now.getTime() - daysAgo * day);
    const [oldEvent, recentEvent] = [`msg_${randomUUID()}`, `msg_${randomUUID()}`];
    const event = (svixId: string, receivedAt: Date) => ({
      svixId,
      environment: 'development',
      type: 'email.sent',
      occurredAt: receivedAt,
      receivedAt,
    });
    await database.insert(emailEvent).values([event(oldEvent, at(91)), event(recentEvent, at(89))]);
    const [oldCleared, recentCleared, live] = [randomUUID(), randomUUID(), randomUUID()].map(
      (id) => `${id}@example.com`,
    ) as [string, string, string];
    const state = (address: string, clearedAt?: Date): typeof emailAddressState.$inferInsert => ({
      address,
      state: 'bounced',
      originEvent: `msg_${randomUUID()}`,
      since: at(200),
      clearedAt,
    });
    await database
      .insert(emailAddressState)
      .values([state(oldCleared, at(91)), state(recentCleared, at(10)), state(live)]);

    await expect(reapExpiredEmailEvents(database, { now, limit: 1000 })).resolves.toMatchObject({
      events: expect.any(Number) as number,
    });

    const events = await database
      .select({ svixId: emailEvent.svixId })
      .from(emailEvent)
      .where(inArray(emailEvent.svixId, [oldEvent, recentEvent]));
    expect(events.map((row) => row.svixId)).toStrictEqual([recentEvent]);
    const states = await database
      .select({ address: emailAddressState.address })
      .from(emailAddressState)
      .where(inArray(emailAddressState.address, [oldCleared, recentCleared, live]));
    expect(states.map((row) => row.address).toSorted()).toStrictEqual([recentCleared, live].toSorted());
  });
});
