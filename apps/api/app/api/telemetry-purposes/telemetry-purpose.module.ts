import { Global, Injectable, Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { DatabaseModule } from '#database/database.module.js';
import { BillingModule } from '#api/billing/billing.module.js';
import { HostsModule } from '#api/hosts/hosts.module.js';
import { BillingService } from '#api/billing/billing.service.js';
import type { TierAssurance } from '#api/billing/subscription-tier.js';
import { TelemetryPurposeController } from '#api/telemetry-purposes/telemetry-purpose.controller.js';
import { TelemetryPurposeService } from '#api/telemetry-purposes/telemetry-purpose.service.js';
import { tierAssuranceKey } from '#api/telemetry-purposes/tier-assurance.js';
import type { TierAssuranceSource } from '#api/telemetry-purposes/tier-assurance.js';

@Injectable()
class CloudTierAssurance implements TierAssuranceSource {
  public constructor(private readonly billing: BillingService) {}

  public async getTierAssurance(userId: string): Promise<TierAssurance> {
    return this.billing.getTierAssurance(userId);
  }
}

/**
 * A self-hosted API has no billing ledger, so no tier is established. The
 * answer is `free` but unassured, which refuses reuse and training exactly as
 * an unrecognised plan does, and leaves every other purpose to the account.
 */
@Injectable()
class SelfHostTierAssurance implements TierAssuranceSource {
  public async getTierAssurance(): Promise<TierAssurance> {
    return { tier: 'free', assured: false };
  }
}

/**
 * Selects the tier source before Nest creates the container, as commercial
 * entitlements do. Global so a consumer such as evidence ingress shares this
 * one instance instead of mounting the purposes controller a second time.
 */
@Global()
@Module({})
export class TelemetryPurposeModule {
  public static forRoot(options: { readonly tauCloudEnabled: boolean }): DynamicModule {
    const implementation = options.tauCloudEnabled ? CloudTierAssurance : SelfHostTierAssurance;
    return {
      global: true,
      module: TelemetryPurposeModule,
      imports: options.tauCloudEnabled ? [DatabaseModule, HostsModule, BillingModule] : [DatabaseModule, HostsModule],
      controllers: [TelemetryPurposeController],
      providers: [implementation, { provide: tierAssuranceKey, useExisting: implementation }, TelemetryPurposeService],
      // The tier source is shared with privacy preferences, which default a paid plan's training consent off.
      exports: [TelemetryPurposeService, tierAssuranceKey],
    };
  }
}
