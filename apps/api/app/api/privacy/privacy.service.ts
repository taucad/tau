import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '#database/database.service.js';
import { user } from '#database/schema.js';
import type { PrivacyPreferences, UpdatePrivacyPreferencesInput } from '#api/privacy/privacy.schema.js';
import { effectiveTrainingConsent } from '#api/privacy/training-consent.js';
import { tierAssuranceKey } from '#api/telemetry-purposes/tier-assurance.js';
import type { TierAssuranceSource } from '#api/telemetry-purposes/tier-assurance.js';
import { Span } from '#telemetry/tracer.service.js';

type StoredPreferences = Pick<
  typeof user.$inferSelect,
  'allowsAiTraining' | 'aiTrainingDecidedAt' | 'allowsUsageMetrics'
>;

@Injectable()
export class PrivacyService {
  public constructor(
    private readonly databaseService: DatabaseService,
    @Inject(tierAssuranceKey) private readonly tierAssurance: TierAssuranceSource,
  ) {}

  /**
   * Get privacy preferences for a user. `allowsAiTraining` is the effective consent for the user's plan.
   */
  @Span()
  public async getPrivacyPreferences(userId: string): Promise<PrivacyPreferences> {
    const result = await this.databaseService.database.query.user.findFirst({
      where: eq(user.id, userId),
      columns: {
        allowsAiTraining: true,
        aiTrainingDecidedAt: true,
        allowsUsageMetrics: true,
      },
    });

    return this.toPreferences(userId, result);
  }

  /**
   * Update privacy preferences for a user. Choosing `allowsAiTraining` records when it was chosen, which is what lets
   * a paid plan opt in.
   */
  @Span()
  public async updatePrivacyPreferences(
    userId: string,
    preferences: UpdatePrivacyPreferencesInput,
  ): Promise<PrivacyPreferences> {
    const [updated] = await this.databaseService.database
      .update(user)
      .set({
        allowsAiTraining: preferences.allowsAiTraining,
        aiTrainingDecidedAt: preferences.allowsAiTraining === undefined ? undefined : new Date(),
        allowsUsageMetrics: preferences.allowsUsageMetrics,
      })
      .where(eq(user.id, userId))
      .returning({
        allowsAiTraining: user.allowsAiTraining,
        aiTrainingDecidedAt: user.aiTrainingDecidedAt,
        allowsUsageMetrics: user.allowsUsageMetrics,
      });

    return this.toPreferences(userId, updated);
  }

  private async toPreferences(userId: string, stored: StoredPreferences | undefined): Promise<PrivacyPreferences> {
    const { tier, assured } = await this.tierAssurance.getTierAssurance(userId);
    return {
      allowsAiTraining: effectiveTrainingConsent({
        tier,
        assured,
        allowsAiTraining: stored?.allowsAiTraining ?? true,
        decidedAt: stored?.aiTrainingDecidedAt ?? undefined,
      }),
      allowsUsageMetrics: stored?.allowsUsageMetrics ?? true,
    };
  }
}
