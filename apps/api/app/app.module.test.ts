/* eslint-disable @typescript-eslint/naming-convention -- Configuration fixtures retain their environment key names. */
import { ConfigService } from '@nestjs/config';
import { mockDeep } from 'vitest-mock-extended';
import {
  BillingAccountClosureService,
  BillingPaymentsService,
  createBillingStripeClient,
  stripeApiVersion,
} from '@taucad/api-billing';
import { DatabaseService } from '@taucad/api-database';
import { getEnvironment } from '@taucad/api-core';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AppModule } from '#app.module.js';
import { accountDeletionGateToken, accountDeletionHooksToken, authRouteExtensionsToken } from '@taucad/api-auth';
import type { AccountDeletionHook, AuthRouteExtension } from '@taucad/api-auth';
import { ApiModule } from '#api/api.module.js';
import { ChatController } from '#api/chat/chat.controller.js';
import { DirectModelInvocationService } from '@taucad/api-llm-gateway';
import { StorageAccountingScheduler } from '#api/storage-accounting/storage-accounting.scheduler.js';

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
      imports: [AppModule.forRoot({ ...getEnvironment(), TAU_CLOUD_ENABLED: false })],
    }).compile();

    // ChatController is the deepest consumer — it spans chat, billing, models
    // and telemetry in one constructor.
    expect(moduleRef.get(ChatController)).toBeInstanceOf(ChatController);
    expect(moduleRef.get(DirectModelInvocationService)).toBeInstanceOf(DirectModelInvocationService);
    expect(moduleRef.get(StorageAccountingScheduler)).toBeInstanceOf(StorageAccountingScheduler);
    expect(
      ApiModule.forRoot({ tauCloudEnabled: false }).imports?.map((entry) =>
        typeof entry === 'function' ? entry.name : 'module' in entry ? entry.module.name : '',
      ),
    ).not.toContain('CodeCompletionModule');
    expect(() => moduleRef.get(BillingPaymentsService)).toThrow();
    // Auth's extension ports: self-host binds no deletion gate and no extra auth route, and still retires
    // cloud hosts before the storage tombstone and erases agent evidence after it.
    expect(() => moduleRef.get<unknown>(accountDeletionGateToken)).toThrow();
    expect(() => moduleRef.get<unknown>(authRouteExtensionsToken)).toThrow();
    expect(moduleRef.get<AccountDeletionHook[]>(accountDeletionHooksToken).map(({ stage }) => stage)).toEqual([
      'before-storage-tombstone',
      'after-storage-tombstone',
    ]);
  });

  it('should configure Stripe test collection and preserve webhook persistence failure', async () => {
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
      STRIPE_PRICE_ID_PRO_MONTHLY: 'price_module_fixture',
      STRIPE_PRODUCT_ID_CREDIT_PACK: 'prod_module_fixture',
    });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot({ ...getEnvironment(), TAU_CLOUD_ENABLED: true })],
    })
      .overrideProvider(ConfigService)
      .useValue(config)
      .overrideProvider(DatabaseService)
      .useValue(database)
      .compile();
    const payments = moduleRef.get(BillingPaymentsService);
    // Tau Cloud gates account deletion on billing's closure and registers the Stripe webhook ahead of the auth wildcard.
    expect(moduleRef.get(accountDeletionGateToken)).toBe(moduleRef.get(BillingAccountClosureService));
    expect(moduleRef.get<AuthRouteExtension[]>(authRouteExtensionsToken)).toHaveLength(1);
    await expect(
      payments.prepareTopup('user', {
        requestId: 'request',
        returnPath: '/',
        amountMinor: '500',
        method: 'checkout',
      }),
    ).rejects.toThrow('Controlled unavailable storage');
    expect(database.database.transaction).toHaveBeenCalledOnce();
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
    expect(database.database.transaction).toHaveBeenCalledTimes(2);
    await expect(payments.recoverPayments({ environment: 'prod-us', limit: 1 })).rejects.toThrow(
      'Invalid payment recovery scope',
    );
  });
});
