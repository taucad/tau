import { Module, VersioningType } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_PIPE } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { ZodValidationPipe } from 'nestjs-zod';
import { getEnvironment } from '@taucad/api-core';
import { TelemetryModule } from '@taucad/api-observability';
import { RedisModule } from '@taucad/api-redis';
import { DatabaseModule, DatabaseService } from '@taucad/api-database';
import { AuthModule } from '@taucad/api-auth/module';
import { AuthExtensionsModule } from '#composition/auth-extensions.module.js';
import { BillingModule } from '#api/billing/billing.module.js';
import { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import { BillingService } from '#api/billing/billing.service.js';
// IMPORTANT: LoggerModule must be imported AFTER every `@InjectPinoLogger`
// consumer above — nestjs-pino materialises the per-context logger providers
// from decorator side effects that have run by the time logger.module.ts
// evaluates (production gets this ordering transitively via ApiModule).
import { LoggerModule } from '@taucad/api-observability/logger-module';

/**
 * Focused NestJS module for billing integration tests: REAL database, Redis,
 * Better Auth (with the stripe plugin reading `STRIPE_*` from the process env)
 * and the billing capability. No chat/kernels surface — webhook and ledger
 * flows only.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ validate: getEnvironment, isGlobal: true }),
    LoggerModule, // Provides the PinoLogger DatabaseService injects
    TelemetryModule, // @Global() — must precede RedisModule (RedisService depends on MetricsService)
    RedisModule, // @Global()
    DatabaseModule,
    BillingModule,
    AuthExtensionsModule.forRoot({ tauCloudEnabled: true }),
    AuthModule.forRootAsync({ tauCloudEnabled: true }),
  ],
  providers: [{ provide: APP_PIPE, useClass: ZodValidationPipe }],
})
class BillingTestModule {}

export type BillingTestApp = {
  app: NestFastifyApplication;
  baseUrl: string;
  databaseService: DatabaseService;
  creditLedgerService: CreditLedgerService;
  billingService: BillingService;
  close: () => Promise<void>;
};

/**
 * Boots the billing test app on an ephemeral port with the auth catch-all and
 * the Stripe webhook raw-body carve-out registered — exactly the production
 * wire path for `/v1/auth/stripe/webhook`.
 *
 * `env` entries are applied to `process.env` BEFORE config validation so
 * suites can pin `STRIPE_WEBHOOK_SECRET`/`STRIPE_PRICE_ID_PRO_MONTHLY` to
 * known values (the L2 offline-signed suite) or to `stripe listen` outputs
 * (the L3 suite).
 */
export async function createBillingTestApp(options: { env?: Record<string, string> } = {}): Promise<BillingTestApp> {
  for (const [key, value] of Object.entries(options.env ?? {})) {
    process.env[key] = value;
  }

  const moduleRef = await Test.createTestingModule({ imports: [BillingTestModule] }).compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  app.enableVersioning({ type: VersioningType.URI });

  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  await app.listen(0);

  const address = app.getHttpServer().address();
  const port = typeof address === 'string' ? address : address?.port;

  return {
    app,
    baseUrl: `http://localhost:${port}`,
    databaseService: moduleRef.get(DatabaseService),
    creditLedgerService: moduleRef.get(CreditLedgerService),
    billingService: moduleRef.get(BillingService),
    close: async () => {
      await app.close();
    },
  };
}
