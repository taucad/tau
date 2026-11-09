import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '@taucad/api-database';
import { user } from '@taucad/api-database/schema';
import type { PrivacyPreferences, UpdatePrivacyPreferencesInput } from '#api/privacy/privacy.schema.js';
import { effectiveTrainingConsent } from '@taucad/billing/training-consent';
import { tierAssuranceKey } from '@taucad/api-agent-observability/telemetry-purposes/tier-assurance';
import type { TierAssuranceSource } from '@taucad/api-agent-observability/telemetry-purposes/tier-assurance';
import { Span } from '@taucad/api-observability';

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
