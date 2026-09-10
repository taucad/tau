/* eslint-disable @typescript-eslint/naming-convention -- Configuration fixtures retain their environment key names. */
import { ConfigService } from '@nestjs/config';
import { mockDeep } from 'vitest-mock-extended';
import { BillingPaymentsService } from '#api/billing/billing-payments.service.js';
import { createBillingStripeClient, stripeApiVersion } from '#api/billing/billing-stripe.js';
import { DatabaseService } from '#database/database.service.js';
import { getEnvironment } from '#config/environment.config.js';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AppModule } from '#app.module.js';
import { ChatController } from '#api/chat/chat.controller.js';

/**
 * Whole-graph DI guard. `compile()` instantiates every module, provider and
 * controller — the same `InstanceLoader` pass that runs at `NestFactory.create`
 * — so an `@Injectable` that no module registers fails HERE instead of crash
 * looping `nx run api:dev`. Unit tests that `new` a service never exercise DI,
 * and the integration harnesses each boot a hand-rolled subset of the graph, so
 * this is the only check that sees the real module wiring.
 *
 * No infrastructure required: `compile()` does not run `onModuleInit`, so
 * migrations, Redis connects (`lazyConnect: true`) and the maintenance
 * intervals never fire — only constructors run. Env comes from `.env.test` plus
 * the `TAU_VIEW_COOKIE_SECRET` pin in `vitest.setup.ts`.
 */
describe('AppModule', () => {
  it('should resolve every provider and controller in the application graph', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    // ChatController is the deepest consumer — it spans chat, billing, models
    // and telemetry in one constructor.
    expect(moduleRef.get(ChatController)).toBeInstanceOf(ChatController);
  });

  it('configures the inbox financial environment while keeping collection structurally closed', async () => {
    const database = mockDeep<DatabaseService>();
    database.database.transaction.mockRejectedValue(new Error('Controlled unavailable storage'));
    const webhookSecret = 'whsec_module_fixture';
    const config = new ConfigService({
      ...getEnvironment(),
      BILLING_ENVIRONMENT: 'staging',
      STRIPE_ACCOUNT_ID: 'acct_module_fixture',
      STRIPE_LIVEMODE: false,
      STRIPE_SECRET_KEY: 'sk_test_module',
      STRIPE_READ_SECRET_KEY: 'rk_test_module',
      STRIPE_WEBHOOK_SECRET: webhookSecret,
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService)
      .useValue(config)
      .overrideProvider(DatabaseService)
      .useValue(database)
      .compile();
    const payments = moduleRef.get(BillingPaymentsService);
    await expect(
      payments.prepareTopup('user', {
        requestId: 'request',
        returnPath: '/',
        amountMinor: '500',
        method: 'checkout',
      }),
    ).rejects.toThrow('payment_collection_disabled');
    const payload = JSON.stringify({
      id: 'evt_module',
      object: 'event',
      api_version: stripeApiVersion,
      type: 'payment_intent.succeeded',
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      data: { object: { id: 'pi_module', object: 'payment_intent' } },
    });
    const stripe = createBillingStripeClient({
      secretKey: 'sk_test_signature_only',
    });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: webhookSecret,
    });
    await expect(payments.receiveWebhook(new TextEncoder().encode(payload), signature)).rejects.toThrow(
      'stripe_webhook_persistence_failed',
    );
    expect(database.database.transaction).toHaveBeenCalledOnce();
    await expect(payments.recoverPayments({ environment: 'prod-us', limit: 1 })).rejects.toThrow(
      'Invalid payment recovery scope',
    );
  });
});
