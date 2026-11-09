import { Global, Injectable, Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { BillingModule, BillingService } from '@taucad/api-billing';
import type {
  CommercialEntitlements,
  CommercialEntitlementsService,
} from '@taucad/api-projects/entitlements/commercial-entitlements';
import { commercialEntitlementsKey } from '@taucad/api-projects/entitlements/commercial-entitlements';
import { storageLimitBytesByTier } from '@taucad/billing';

@Injectable()
class CloudCommercialEntitlementsService implements CommercialEntitlementsService {
  public constructor(private readonly billing: BillingService) {}

  public async getEntitlements(userId: string): Promise<CommercialEntitlements> {
    return this.billing.getEntitlements(userId);
  }
}

@Injectable()
class SelfHostCommercialEntitlementsService implements CommercialEntitlementsService {
  public async getEntitlements(): Promise<CommercialEntitlements> {
    return {
      canUseProKernels: true,
      canCreatePrivateShares: true,
      canSyncFiles: true,
      storageLimitBytes: storageLimitBytesByTier.pro,
    };
  }
}

/** Selects commercial policy before Nest creates the application container. */
@Global()
@Module({})
export class CommercialEntitlementsModule {
  public static forRoot(options: { readonly tauCloudEnabled: boolean }): DynamicModule {
    const implementation = options.tauCloudEnabled
      ? CloudCommercialEntitlementsService
      : SelfHostCommercialEntitlementsService;
    return {
      global: true,
      module: CommercialEntitlementsModule,
      imports: options.tauCloudEnabled ? [BillingModule] : [],
      providers: [implementation, { provide: commercialEntitlementsKey, useExisting: implementation }],
      exports: [commercialEntitlementsKey],
    };
  }
}
