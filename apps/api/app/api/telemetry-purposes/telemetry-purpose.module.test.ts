import { describe, expect, it } from 'vitest';
import { BillingModule } from '#api/billing/billing.module.js';
import { TelemetryPurposeModule } from '#api/telemetry-purposes/telemetry-purpose.module.js';
import { tierAssuranceKey } from '#api/telemetry-purposes/tier-assurance.js';
import type { TierAssuranceSource } from '#api/telemetry-purposes/tier-assurance.js';

describe('TelemetryPurposeModule', () => {
  it('reads the billing projection only on Tau Cloud', () => {
    expect(TelemetryPurposeModule.forRoot({ tauCloudEnabled: true }).imports).toContain(BillingModule);
    expect(TelemetryPurposeModule.forRoot({ tauCloudEnabled: false }).imports).not.toContain(BillingModule);
  });

  it('establishes no tier on a self-hosted API, so reuse and training stay refused', async () => {
    const providers = TelemetryPurposeModule.forRoot({ tauCloudEnabled: false }).providers ?? [];
    const binding = providers.find(
      (provider): provider is { provide: symbol; useExisting: new () => TierAssuranceSource } =>
        typeof provider === 'object' && 'provide' in provider && provider.provide === tierAssuranceKey,
    );
    expect(binding).toBeDefined();
    const selfHost: TierAssuranceSource = Reflect.construct(binding!.useExisting, []);

    await expect(selfHost.getTierAssurance('user-1')).resolves.toEqual({ tier: 'free', assured: false });
  });
});
