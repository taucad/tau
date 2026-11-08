import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { DatabaseModule, DatabaseService } from '@taucad/api-database';
import { eraseAccountEvidence } from '#api/agent-observability/evidence-erasure.js';
import {
  BillingAccountClosureService,
  BillingModule,
  BillingPaymentsService,
  stripeWebhookRoute,
} from '@taucad/api-billing';
import { HostsModule, HostsService } from '@taucad/api-hosts';
import { accountDeletionGateToken, accountDeletionHooksToken, authRouteExtensionsToken } from '@taucad/api-auth';
import type { AccountDeletionHook, AuthRouteExtension } from '@taucad/api-auth';

/**
 * Binds the auth module's extension ports (`auth-extensions.ts`) to the
 * domains that implement them, so auth itself depends on neither billing nor
 * hosts. Global, because the auth module resolves the ports from its own scope.
 *
 * - Account deletion: in Tau Cloud billing's account closure gates it; then
 *   the account's cloud hosts stop before the storage tombstone (W10 a4) and
 *   its agent evidence is erased after it (T13), in that order.
 * - Auth routes: in Tau Cloud the byte-exact Stripe webhook registers ahead of
 *   the Better Auth wildcard, when billing provides payments.
 */
@Module({})
export class AuthExtensionsModule {
  public static forRoot(options: { readonly tauCloudEnabled: boolean }): DynamicModule {
    return {
      global: true,
      module: AuthExtensionsModule,
      imports: [DatabaseModule, HostsModule, ...(options.tauCloudEnabled ? [BillingModule] : [])],
      providers: [
        ...(options.tauCloudEnabled
          ? [
              { provide: accountDeletionGateToken, useExisting: BillingAccountClosureService },
              {
                provide: authRouteExtensionsToken,
                inject: [{ token: BillingPaymentsService, optional: true }],
                useFactory: (payments: BillingPaymentsService | undefined): AuthRouteExtension[] =>
                  payments === undefined ? [] : [stripeWebhookRoute(payments)],
              },
            ]
          : []),
        {
          provide: accountDeletionHooksToken,
          inject: [HostsService, DatabaseService],
          useFactory: (hosts: HostsService, databaseService: DatabaseService): AccountDeletionHook[] => [
            {
              stage: 'before-storage-tombstone',
              run: async ({ userId }) => hosts.retireCloudHosts(userId),
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
        ...(options.tauCloudEnabled ? [accountDeletionGateToken, authRouteExtensionsToken] : []),
      ],
    };
  }
}
