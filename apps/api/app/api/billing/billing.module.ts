import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { DatabaseModule } from '#database/database.module.js';
import { EmailModule } from '#email/email.module.js';
import { ModelModule } from '#api/models/model.module.js';
import { BillingController } from '#api/billing/billing.controller.js';
import { BillingService } from '#api/billing/billing.service.js';
import { ChatPreflightService } from '#api/billing/chat-preflight.service.js';
import { CreditLedgerOutbox } from '#api/billing/credit-ledger-outbox.service.js';
import { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import { CreditMaintenanceService } from '#api/billing/credit-maintenance.service.js';
import { StripeEventRouter } from '#api/billing/stripe-event-router.service.js';
import { stripeClientKey } from '#api/billing/billing.constants.js';
import type { Environment } from '#config/environment.config.js';

/**
 * Billing capability: the shared Stripe client (BA6), the entitlements
 * projection, the durable credit-ledger paths, and the webhook fan-out. The
 * Better Auth stripe plugin (AuthModule) consumes the exported services for its
 * lifecycle hooks; Chat/Kernels import this module for enforcement in B2/B4.
 *
 * Every `@Injectable` under `app/api/billing/` is registered here — including
 * ChatPreflightService, which ChatController injects. Consumers get it by
 * importing this module; ModelModule is imported for its ModelService dep.
 */
@Module({
  imports: [DatabaseModule, EmailModule, ModelModule],
  controllers: [BillingController],
  providers: [
    {
      provide: stripeClientKey,
      useFactory(configService: ConfigService<Environment, true>): Stripe {
        const secretKey = configService.get('STRIPE_SECRET_KEY', { infer: true });
        // Local dev runs without keys ('' per the env schema): the dummy secret
        // keeps DI construction green while every real Stripe call fails closed.
        // apiVersion is deliberately omitted — the SDK pins its bundled default
        // (blueprint Q24: pin at SDK major, bump deliberately).
        return new Stripe(secretKey === '' ? 'sk_test_dummy_dev_only' : secretKey);
      },
      inject: [ConfigService],
    },
    BillingService,
    ChatPreflightService,
    CreditLedgerOutbox,
    CreditLedgerService,
    CreditMaintenanceService,
    StripeEventRouter,
  ],
  exports: [stripeClientKey, BillingService, ChatPreflightService, CreditLedgerService, StripeEventRouter],
})
export class BillingModule {}
