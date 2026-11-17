/* eslint-disable @typescript-eslint/naming-convention -- Resend wire fields, environment variable names and the registry attribute name */
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import process from 'node:process';
import { BadRequestException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@taucad/api-database/schema';
import { emailAddressState, emailEvent } from '@taucad/api-database/schema';
import { databaseReachable } from '@taucad/api-database/testing/database-reachable';
import type { DatabaseService } from '@taucad/api-database';
import { EmailDeliverabilityService } from '#email-deliverability.service.js';
import { ResendWebhookService } from '#resend-webhook.service.js';
import type { ResendWebhookHeaders } from '#resend-webhook.service.js';

/*
 * T2 to T7 of the email bounce blueprint, against the real PostgreSQL the API suites share. Every
 * delivery id and address is generated per test, so the shared database needs no cleanup between them.
 */

const secret = `whsec_${randomBytes(24).toString('base64')}`;

/** The Standard Webhooks (svix) signature Resend sends: HMAC-SHA256 of `id.timestamp.body` under the decoded secret. */
const sign = (input: {
  readonly id: string;
  readonly timestamp: string;
  readonly payload: string;
  readonly key?: string;
}) => {
  const key = Buffer.from((input.key ?? secret).replace(/^whsec_/u, ''), 'base64');
  const digest = createHmac('sha256', key).update(`${input.id}.${input.timestamp}.${input.payload}`).digest('base64');
  return `v1,${digest}`;
};

const now = (): string => String(Math.floor(Date.now() / 1000));

const delivery = (
  event: Record<string, unknown>,
  options: { readonly key?: string; readonly timestamp?: string } = {},
): { payload: string; headers: ResendWebhookHeaders } => {
  const payload = JSON.stringify(event);
  const id = `msg_${randomUUID()}`;
  const timestamp = options.timestamp ?? now();
  return {
    payload,
    headers: {
      id,
      timestamp,
      signature: sign({ id, timestamp, payload, key: options.key }),
    },
  };
};

const emailEventOf = (
  type: string,
  input: {
    readonly to: string;
    readonly emailId?: string;
    readonly tags?: Record<string, string>;
    readonly extra?: Record<string, unknown>;
  },
): Record<string, unknown> => ({
  type,
  created_at: '2026-11-15T08:00:00.000Z',
  data: {
    created_at: '2026-11-15T08:00:00.000Z',
    email_id: input.emailId ?? randomUUID(),
    message_id: `<${randomUUID()}@resend.dev>`,
    from: 'Tau <identity@taucad.dev>',
    to: [input.to],
    subject: 'Verify your email',
    tags: input.tags ?? { kind: 'verify-email', env: 'staging' },
    ...input.extra,
  },
});

const suppressionEventOf = (
  type: 'suppression.added' | 'suppression.removed',
  input: {
    readonly email: string;
    readonly origin: 'bounce' | 'complaint' | 'manual';
    readonly sourceId?: string;
  },
): Record<string, unknown> => ({
  type,
  created_at: '2026-11-15T09:00:00.000Z',
  data: {
    id: randomUUID(),
    email: input.email,
    origin: input.origin,
    source_id: input.sourceId ?? null,
    created_at: '2026-11-15T09:00:00.000Z',
  },
});

const configWith = (values: Record<string, string | undefined>) => ({
  get: vi.fn((key: string) => values[key] ?? ''),
});

const metrics = { emailEventsTotal: { add: vi.fn() } };

const stagingValues: Record<string, string | undefined> = {
  RESEND_WEBHOOK_SECRET: secret,
  BILLING_ENVIRONMENT: 'staging',
};

const createService = (
  database: DatabaseService['database'],
  values?: Record<string, string | undefined>,
): ResendWebhookService =>
  new ResendWebhookService(
    configWith(values ?? stagingValues) as unknown as ConstructorParameters<typeof ResendWebhookService>[0],
    { database },
    metrics as unknown as ConstructorParameters<typeof ResendWebhookService>[2],
  );

const unreachable = {
  transaction: async () => {
    throw new Error('no database');
  },
} as unknown as DatabaseService['database'];

describe('ResendWebhookService before the database', () => {
  // T5
  it('answers 503 and accepts nothing unsigned while RESEND_WEBHOOK_SECRET is unset', async () => {
    const service = createService(unreachable, {});
    const { payload, headers } = delivery(emailEventOf('email.sent', { to: 'a@example.com' }));

    await expect(service.receive({ payload, headers })).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  // T3
  it.each([
    ['a body re-serialised after signing', (d: ReturnType<typeof delivery>) => ({ ...d, payload: `${d.payload} ` })],
    [
      'a signature under another secret',
      () =>
        delivery(emailEventOf('email.sent', { to: 'a@example.com' }), {
          key: `whsec_${randomBytes(24).toString('base64')}`,
        }),
    ],
    [
      'a missing svix-signature header',
      (d: ReturnType<typeof delivery>) => ({
        ...d,
        headers: { ...d.headers, signature: undefined },
      }),
    ],
    [
      'a missing svix-id header',
      (d: ReturnType<typeof delivery>) => ({
        ...d,
        headers: { ...d.headers, id: undefined },
      }),
    ],
    [
      'a timestamp an hour old',
      () =>
        delivery(emailEventOf('email.sent', { to: 'a@example.com' }), {
          timestamp: String(Math.floor(Date.now() / 1000) - 3600),
        }),
    ],
  ])('answers 400 for %s', async (_case, tamper) => {
    const service = createService(unreachable);
    const signed = delivery(emailEventOf('email.sent', { to: 'a@example.com' }));

    await expect(service.receive(tamper(signed))).rejects.toBeInstanceOf(BadRequestException);
  });

  // The Loki alert rules (taucad/tau#2252) key on these exact texts; this test stops them drifting.
  it.each([
    ['not_configured', {}, (d: ReturnType<typeof delivery>) => d],
    [
      'missing_header',
      undefined,
      (d: ReturnType<typeof delivery>) => ({
        ...d,
        headers: { ...d.headers, timestamp: undefined },
      }),
    ],
    ['invalid_signature', undefined, (d: ReturnType<typeof delivery>) => ({ ...d, payload: `${d.payload}\n` })],
  ] as const)('logs a rejected delivery as "Resend webhook rejected %s"', async (reason, values, tamper) => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    try {
      const service = values === undefined ? createService(unreachable) : createService(unreachable, values);
      await expect(
        service.receive(tamper(delivery(emailEventOf('email.sent', { to: 'a@example.com' })))),
      ).rejects.toThrow();

      expect(warn).toHaveBeenCalledExactlyOnceWith(`Resend webhook rejected ${reason}`);
    } finally {
      warn.mockRestore();
    }
  });

  // T6
  it('acknowledges and drops an event tagged with the other environment without touching the database', async () => {
    metrics.emailEventsTotal.add.mockClear();
    const service = createService(unreachable);

    await expect(
      service.receive(
        delivery(
          emailEventOf('email.bounced', {
            to: 'a@example.com',
            tags: { kind: 'magic-link', env: 'prod-us' },
          }),
        ),
      ),
    ).resolves.toBe('other_environment');
    expect(metrics.emailEventsTotal.add).toHaveBeenCalledExactlyOnceWith(1, {
      type: 'email.bounced',
      outcome: 'other_environment',
    });
  });

  it('acknowledges an event type the endpoint does not subscribe to and stores nothing', async () => {
    const service = createService(unreachable);

    await expect(service.receive(delivery(emailEventOf('email.opened', { to: 'a@example.com' })))).resolves.toBe(
      'ignored',
    );
  });
});

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!(await databaseReachable(databaseUrl)))('ResendWebhookService with PostgreSQL', () => {
  const client = postgres(databaseUrl, { max: 2, prepare: false });
  const database = drizzle(client, { schema });
  const service = createService(database);
  const deliverability = new EmailDeliverabilityService({ database });

  afterAll(async () => {
    await client.end();
  });

  beforeEach(() => {
    metrics.emailEventsTotal.add.mockClear();
  });

  const address = (): string => `user-${randomUUID()}@Example.COM`;
  const rowsFor = async (svixIds: readonly string[]) =>
    database
      .select()
      .from(emailEvent)
      .where(inArray(emailEvent.svixId, [...svixIds]));
  const stateOf = async (recipient: string) => {
    const rows = await database
      .select()
      .from(emailAddressState)
      .where(eq(emailAddressState.address, recipient.toLowerCase()));
    return rows[0];
  };

  // T2
  it('stores a verified delivery as one row with its kind, environment and normalised recipient', async () => {
    const to = address();
    const signed = delivery(
      emailEventOf('email.delivered', {
        to,
        tags: { kind: 'reset-password', env: 'staging' },
      }),
    );

    await expect(service.receive(signed)).resolves.toBe('stored');

    const rows = await rowsFor([signed.headers.id ?? '']);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: 'email.delivered',
      environment: 'staging',
      kind: 'reset-password',
      recipient: to.toLowerCase(),
      bounceType: null,
      occurredAt: new Date('2026-11-15T08:00:00.000Z'),
    });
    expect(await stateOf(to)).toBeUndefined();
  });

  // T4
  it('stores a delivery delivered twice once, and counts it once', async () => {
    const signed = delivery(emailEventOf('email.sent', { to: address() }));

    await expect(service.receive(signed)).resolves.toBe('stored');
    await expect(service.receive(signed)).resolves.toBe('duplicate');

    expect(await rowsFor([signed.headers.id ?? ''])).toHaveLength(1);
    expect(metrics.emailEventsTotal.add).toHaveBeenCalledExactlyOnceWith(1, {
      type: 'email.sent',
      kind: 'verify-email',
      bounce_type: 'none',
      outcome: 'stored',
    });
  });

  it('writes one stable log line per stored event, with the recipient masked to its domain', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const to = address();
    try {
      await service.receive(
        delivery(
          emailEventOf('email.bounced', {
            to,
            tags: { kind: 'magic-link', env: 'staging' },
            extra: {
              bounce: {
                type: 'Permanent',
                subType: 'General',
                message: 'mailbox does not exist',
              },
            },
          }),
        ),
      );

      expect(warn).toHaveBeenCalledExactlyOnceWith(
        'Resend event email.bounced kind=magic-link bounce_type=Permanent origin=none env=staging recipient=recipient@example.com',
      );
      expect(JSON.stringify(warn.mock.calls)).not.toContain(to.split('@')[0]);
      // The alert rules match this prefix: the type, one space, then `kind=`.
      expect(warn.mock.calls[0]?.[0]).toMatch(/^Resend event email\.bounced kind=magic-link bounce_type=Permanent /u);
    } finally {
      warn.mockRestore();
    }
  });

  it('marks an address bounced on a permanent bounce, and leaves it deliverable on a transient one', async () => {
    const permanent = address();
    const transient = address();
    const bounced = (to: string, type: string) =>
      delivery(
        emailEventOf('email.bounced', {
          to,
          tags: { kind: 'magic-link', env: 'staging' },
          extra: {
            bounce: { type, subType: 'General', message: 'not stored' },
          },
        }),
      );

    await service.receive(bounced(permanent, 'Permanent'));
    await service.receive(bounced(transient, 'Transient'));

    expect(await stateOf(permanent)).toMatchObject({
      state: 'bounced',
      originKind: 'magic-link',
      clearedAt: null,
    });
    expect(await stateOf(transient)).toBeUndefined();
    expect(await deliverability.undeliverableAmong([permanent, transient])).toStrictEqual(
      new Set([permanent.toLowerCase()]),
    );
  });

  // T7
  it('mirrors suppression.added with the origin and the kind of the email that caused it, then clears it on removal', async () => {
    const to = address();
    const emailId = randomUUID();
    await service.receive(
      delivery(
        emailEventOf('email.sent', {
          to,
          emailId,
          tags: { kind: 'publication-invite', env: 'staging' },
        }),
      ),
    );

    const added = delivery(
      suppressionEventOf('suppression.added', {
        email: to,
        origin: 'complaint',
        sourceId: emailId,
      }),
    );
    await expect(service.receive(added)).resolves.toBe('stored');

    expect(await stateOf(to)).toMatchObject({
      state: 'complained',
      originKind: 'publication-invite',
      originEvent: added.headers.id,
      clearedAt: null,
    });
    expect(await deliverability.stateOf(to)).toBe('complained');

    const removed = delivery(
      suppressionEventOf('suppression.removed', {
        email: to,
        origin: 'complaint',
      }),
    );
    await expect(service.receive(removed)).resolves.toBe('stored');

    expect(await stateOf(to)).toMatchObject({
      state: 'complained',
      clearedAt: new Date('2026-11-15T09:00:00.000Z'),
      clearedBy: removed.headers.id,
    });
    expect(await deliverability.stateOf(to)).toBeUndefined();
  });

  it('mirrors a suppression from any environment, since Resend applies it to the whole team', async () => {
    const to = address();
    await service.receive(
      delivery(
        suppressionEventOf('suppression.added', {
          email: to,
          origin: 'manual',
        }),
      ),
    );

    expect(await stateOf(to)).toMatchObject({
      state: 'suppressed',
      originKind: null,
    });
  });
});
