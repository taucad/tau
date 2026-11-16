import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { DatabaseModule, DatabaseService } from '@taucad/api-database';
import { eraseAccountEvidence } from '@taucad/api-agent-observability/evidence-erasure';
import {
  BillingAccountClosureService,
  BillingModule,
  BillingPaymentsService,
  stripeWebhookRoute,
} from '@taucad/api-billing';
import {
  EmailDeliverabilityModule,
  normalizeEmailAddress,
  ResendWebhookService,
  resendWebhookRoute,
} from '@taucad/api-email';
import { emailAddressState, emailEvent, user } from '@taucad/api-database/schema';
import { eq } from 'drizzle-orm';
import { HostsModule, HostsService } from '@taucad/api-hosts';
import {
  accountDeletionGateToken,
  accountDeletionHooksToken,
  authRateLimitStoreToken,
  authRouteExtensionsToken,
} from '@taucad/api-auth';
import type { AccountDeletionHook, AuthRateLimitStore, AuthRouteExtension } from '@taucad/api-auth';
import { PublicationRateLimiterService, RedisService } from '@taucad/api-redis';

/**
 * Binds the auth module's extension ports (`auth-extensions.ts`) to the
 * domains that implement them, so auth itself depends on neither billing nor
 * hosts. Global, because the auth module resolves the ports from its own scope.
 *
 * - Account deletion: in Tau Cloud billing's account closure gates it; then
 *   the account's cloud hosts stop before the storage tombstone (W10 a4) and
 *   its agent evidence is erased after it (T13), in that order.
 * - Auth routes: the byte-exact Resend webhook always, and in Tau Cloud the
 *   byte-exact Stripe webhook when billing provides payments, register ahead
 *   of the Better Auth wildcard.
 * - Account deletion also erases the account address's delivery mirror
 *   (`email_address_state`, `email_event`) before the user row goes.
 * - Rate limits: Better Auth counts in Redis, so every Machine shares one count
 *   per client and path instead of each keeping its own.
 */
@Module({})
export class AuthExtensionsModule {
  public static forRoot(options: { readonly tauCloudEnabled: boolean }): DynamicModule {
    return {
      global: true,
      module: AuthExtensionsModule,
      imports: [
        DatabaseModule,
        EmailDeliverabilityModule,
        HostsModule,
        ...(options.tauCloudEnabled ? [BillingModule] : []),
      ],
      providers: [
        ...(options.tauCloudEnabled
          ? [
              { provide: accountDeletionGateToken, useExisting: BillingAccountClosureService },
              {
                provide: authRouteExtensionsToken,
                inject: [ResendWebhookService, { token: BillingPaymentsService, optional: true }],
                useFactory: (
                  resend: ResendWebhookService,
                  payments: BillingPaymentsService | undefined,
                ): AuthRouteExtension[] => [
                  resendWebhookRoute(resend),
                  ...(payments === undefined ? [] : [stripeWebhookRoute(payments)]),
                ],
              },
            ]
          : [
              {
                provide: authRouteExtensionsToken,
                inject: [ResendWebhookService],
                useFactory: (resend: ResendWebhookService): AuthRouteExtension[] => [resendWebhookRoute(resend)],
              },
            ]),
        {
          provide: authRateLimitStoreToken,
          inject: [RedisService],
          useFactory: (redis: RedisService): AuthRateLimitStore => {
            const budgets = new PublicationRateLimiterService(redis);
            return {
              consume: async ({ key, limit, windowSeconds }) =>
                budgets.consumeWindowBudget({ key, limit, windowSeconds }),
            };
          },
        },
        {
          provide: accountDeletionHooksToken,
          inject: [HostsService, DatabaseService],
          useFactory: (hosts: HostsService, databaseService: DatabaseService): AccountDeletionHook[] => [
            {
              stage: 'before-storage-tombstone',
              run: async ({ userId }) => hosts.retireCloudHosts(userId),
            },
            {
              // Verified erasure removes the account address's delivery facts with it (bounce blueprint, Storage).
              stage: 'before-storage-tombstone',
              run: async ({ userId }) => {
                const { database } = databaseService;
                const [account] = await database.select({ email: user.email }).from(user).where(eq(user.id, userId));
                if (account === undefined) {
                  return;
                }
                const address = normalizeEmailAddress(account.email);
                await database.delete(emailAddressState).where(eq(emailAddressState.address, address));
                await database.delete(emailEvent).where(eq(emailEvent.recipient, address));
              },
            },
            {
              stage: 'after-storage-tombstone',
              run: async ({ userId }) => {
                await eraseAccountEvidence(databaseService.database, userId);
              },
            },
          ],
        },
      ],
      exports: [
        accountDeletionHooksToken,
        authRateLimitStoreToken,
        authRouteExtensionsToken,
        ...(options.tauCloudEnabled ? [accountDeletionGateToken] : []),
      ],
    };
  }
}
