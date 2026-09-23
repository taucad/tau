import { createServer } from 'node:http';
import { once } from 'node:events';
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { Module, VersioningType } from '@nestjs/common';
import type { NestModule } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { Stripe } from 'stripe';
import { AuthModule } from '#auth/auth.module.js';
import { authInstanceKey } from '#constants/auth.constant.js';
import { BillingPaymentsService } from '#api/billing/billing-payments.service.js';
import type { BillingCashQualification } from '#api/billing/billing-payments.service.js';
import type { BillingPolicyService } from '#api/billing/billing-policy.service.js';
import type { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import { createBillingStripeClient, stripeApiVersion } from '#api/billing/billing-stripe.js';
import * as schema from '#database/schema.js';

const databaseUrl = process.env['BILLING_TEST_DATABASE_URL'];
if (!databaseUrl || !process.env['BILLING_TEST_OWNED']) {
  throw new Error('Use the isolated billing launcher');
}

const webhookSecret = 'whsec_c06_foundation';
const stripeAccountId = 'acct_c06_foundation';
const runtimeClient = postgres(databaseUrl, { max: 1, connection: { role: 'tau_billing_runtime' } });
const adminClient = postgres(databaseUrl, { max: 1 });
const database = drizzle(runtimeClient, { schema });
const stripeFixture = createServer((_request, response) => {
  response.writeHead(404, { 'content-type': 'application/json' });
  response.end(
    JSON.stringify({ error: { message: 'Unexpected Stripe transport call', type: 'invalid_request_error' } }),
  );
});
let app: NestFastifyApplication;
let stripe: Stripe;
let authCalls = 0;

const auth = {
  options: { basePath: '/v1/auth', hooks: {} },
  async handler(): Promise<Response> {
    authCalls += 1;
    return new Response('auth wildcard', { status: 418 });
  },
};

// oxlint-disable-next-line new-cap -- Module is a Nest decorator factory.
@Module({
  imports: [DiscoveryModule],
  providers: [
    AuthModule,
    { provide: authInstanceKey, useValue: auth },
    {
      provide: BillingPaymentsService,
      useFactory(): BillingPaymentsService {
        return new BillingPaymentsService(
          { database },
          stripe,
          stripe,
          {
            environment: 'development',
            stripeAccountId,
            livemode: false,
            uiOrigin: 'https://tau.test',
            webhookSecret,
            collection: null,
          },
          mockDeep<BillingPolicyService>(),
          mockDeep<CreditLedgerService>(),
          mockDeep<BillingCashQualification>(),
        );
      },
    },
  ],
})
class WebhookFoundationModule implements NestModule {
  public constructor(private readonly authModule: AuthModule) {}

  public configure(): void {
    this.authModule.configure();
  }
}

function payload(input: {
  readonly id: string;
  readonly type?: string;
  readonly object?: { readonly id: string; readonly object: string };
  readonly created?: number;
  readonly apiVersion?: string;
  readonly livemode?: boolean;
  readonly account?: string;
}): string {
  return ` {\n  "id": ${JSON.stringify(input.id)}, "object": "event",\n  "api_version": ${JSON.stringify(input.apiVersion ?? stripeApiVersion)}, "created": ${input.created ?? 1_788_650_000},\n  "livemode": ${input.livemode ?? false},${input.account === undefined ? '' : ` "account": ${JSON.stringify(input.account)},`}\n  "type": ${JSON.stringify(input.type ?? 'payment_intent.succeeded')},\n  "data": { "object": ${JSON.stringify(input.object ?? { id: 'pi_c06', object: 'payment_intent' })} }\n}\n`;
}

function signature(body: string): string {
  return stripe.webhooks.generateTestHeaderString({ payload: body, secret: webhookSecret });
}

async function deliver(body: string, stripeSignature = signature(body)) {
  return app.inject({
    method: 'POST',
    url: '/v1/auth/stripe/webhook',
    headers: { 'content-type': 'application/json', 'stripe-signature': stripeSignature },
    payload: body,
  });
}

beforeAll(async () => {
  stripeFixture.listen(0, '127.0.0.1');
  await once(stripeFixture, 'listening');
  const address = stripeFixture.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Stripe fixture address unavailable');
  }
  stripe = createBillingStripeClient({ secretKey: 'sk_test_c06', fixtureUrl: `http://127.0.0.1:${address.port}/` });
  const moduleRef = await Test.createTestingModule({ imports: [WebhookFoundationModule] }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  app.enableVersioning({ type: VersioningType.URI });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  await app.close();
  await Promise.all([runtimeClient.end(), adminClient.end()]);
  await new Promise<void>((resolve, reject) => {
    stripeFixture.close((error) => {
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    });
  });
});

describe('billing webhook native foundation', () => {
  it('preserves signed whitespace bytes and takes precedence over the auth wildcard', async () => {
    const eventId = `evt_${randomUUID()}`;
    const body = payload({ id: eventId });
    const before = authCalls;
    const response = await deliver(body);
    expect(response.statusCode).toBe(200);
    expect(authCalls).toBe(before);
    const rows = await database.select().from(schema.stripeEventInbox);
    const retained = rows.find((row) => row.eventId === eventId);
    const parsed: unknown = JSON.parse(body);
    // The digest covers the event content without the per-delivery `pending_webhooks` count.
    expect(retained?.payloadDigest).toBe(
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Stripe's wire field name.
      createHash('sha256')
        .update(JSON.stringify({ ...(parsed as Record<string, unknown>), pending_webhooks: undefined }))
        .digest('hex'),
    );

    const reserialized = JSON.stringify(parsed);
    const changedBytes = await deliver(reserialized, signature(body));
    expect(changedBytes.statusCode).toBe(400);
    const neighboringAuth = await app.inject({
      method: 'POST',
      url: '/v1/auth/not-stripe',
      headers: { 'content-type': 'application/json' },
      payload: '{}',
    });
    expect(neighboringAuth.statusCode).toBe(418);
    expect(authCalls).toBe(before + 1);
  });

  it('rejects invalid signature, account, mode, version, and unsupported event type without persistence', async () => {
    const cases = [
      { id: `evt_${randomUUID()}`, kind: 'signature' },
      { id: `evt_${randomUUID()}`, kind: 'account' },
      { id: `evt_${randomUUID()}`, kind: 'mode' },
      { id: `evt_${randomUUID()}`, kind: 'version' },
      { id: `evt_${randomUUID()}`, kind: 'event' },
    ];
    for (const fixture of cases) {
      const body = payload({
        id: fixture.id,
        ...(fixture.kind === 'account' ? { account: 'acct_connected' } : {}),
        ...(fixture.kind === 'mode' ? { livemode: true } : {}),
        ...(fixture.kind === 'version' ? { apiVersion: '2025-01-01.acacia' } : {}),
        ...(fixture.kind === 'event' ? { type: 'customer.updated' } : {}),
      });
      // oxlint-disable-next-line no-await-in-loop -- delivery rejection cases are deliberately sequential.
      const response = await deliver(body, fixture.kind === 'signature' ? 'invalid' : signature(body));
      expect(response.statusCode).toBe(400);
      // oxlint-disable-next-line no-await-in-loop -- verifies each rejected delivery left no durable row.
      const rejectedRows = await database.select().from(schema.stripeEventInbox);
      expect(rejectedRows.some((row) => row.eventId === fixture.id)).toBe(false);
    }
  });

  it('deduplicates an exact delivery and retains supported adverse lifecycle events before 2xx', async () => {
    for (const { type, object } of [
      { type: 'invoice.payment_failed', object: { id: 'in_c06', object: 'invoice' } },
      { type: 'refund.failed', object: { id: 're_c06', object: 'refund' } },
      { type: 'charge.dispute.funds_withdrawn', object: { id: 'dp_c06', object: 'dispute' } },
    ]) {
      const eventId = `evt_${randomUUID()}`;
      const body = payload({ id: eventId, type, object });
      // oxlint-disable-next-line no-await-in-loop -- persistence and replay ordering is the behavior under test.
      const first = await deliver(body);
      expect(first.statusCode).toBe(200);
      // oxlint-disable-next-line no-await-in-loop -- query observes the just-committed delivery before replay.
      const persistedRows = await database.select().from(schema.stripeEventInbox);
      const persisted = persistedRows.filter((row) => row.eventId === eventId);
      expect(persisted).toHaveLength(1);
      expect(persisted[0]?.eventType).toBe(type);
      // oxlint-disable-next-line no-await-in-loop -- replay follows the committed first delivery.
      const replay = await deliver(body);
      expect(replay.statusCode).toBe(200);
      // oxlint-disable-next-line no-await-in-loop -- query verifies the sequential replay did not duplicate the row.
      const replayedRows = await database.select().from(schema.stripeEventInbox);
      expect(replayedRows.filter((row) => row.eventId === eventId)).toHaveLength(1);
      // Stripe changes `pending_webhooks` between deliveries of one event; a redelivery is still a replay.
      // oxlint-disable-next-line no-await-in-loop -- redelivery follows the committed first delivery.
      const redelivery = await deliver(body.replace('"object": "event",', '"object": "event", "pending_webhooks": 2,'));
      expect(redelivery.statusCode).toBe(200);
      const conflicting = payload({ id: eventId, type: 'payment_intent.canceled' });
      // oxlint-disable-next-line no-await-in-loop -- conflicting replay follows the committed exact replay.
      const conflict = await deliver(conflicting);
      expect(conflict.statusCode).toBe(409);
    }
  });

  it('does not return 2xx when the transaction fails and rejects a body over one MiB', async () => {
    const eventId = `evt_${randomUUID()}`;
    await adminClient.unsafe(
      `create or replace function billing.c06_reject_webhook() returns trigger language plpgsql as $$ begin if new.event_id = '${eventId}' then raise exception 'controlled webhook insert failure'; end if; return new; end $$; create trigger c06_reject_webhook before insert on billing.stripe_event_inbox for each row execute function billing.c06_reject_webhook()`,
    );
    try {
      const failed = await deliver(payload({ id: eventId }));
      expect(failed.statusCode).toBe(503);
      const rows = await database.select().from(schema.stripeEventInbox);
      expect(rows.some((row) => row.eventId === eventId)).toBe(false);
    } finally {
      await adminClient.unsafe(
        'drop trigger if exists c06_reject_webhook on billing.stripe_event_inbox; drop function if exists billing.c06_reject_webhook()',
      );
    }
    const oversized = `${payload({ id: `evt_${randomUUID()}` })}${' '.repeat(1024 * 1024)}`;
    const response = await deliver(oversized);
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(response.statusCode).toBeLessThan(500);
  });
});
