import { z } from 'zod';

const allowsAiTrainingDescription =
  'Legacy supplier-training preference; does not authorize recording, Tau training or reusable evaluation';
const allowsUsageMetricsDescription =
  'Whether the user allows anonymous, content-free usage metrics about agent turns to be reported for product improvement';

/**
 * Schema for privacy preferences
 */
export const privacyPreferencesSchema = z.object({
  allowsAiTraining: z.boolean().describe(allowsAiTrainingDescription),
  allowsUsageMetrics: z.boolean().describe(allowsUsageMetricsDescription),
});

/**
 * Schema for updating privacy preferences (all fields optional)
 */
export const updatePrivacyPreferencesSchema = z
  .object({
    allowsAiTraining: z.boolean().optional().describe(allowsAiTrainingDescription),
    allowsUsageMetrics: z.boolean().optional().describe(allowsUsageMetricsDescription),
  })
  .meta({ id: 'UpdatePrivacyPreferences' });

/**
 * Privacy preferences type
 */
export type PrivacyPreferences = z.infer<typeof privacyPreferencesSchema>;

/**
 * Update privacy preferences input type
 */
export type UpdatePrivacyPreferencesInput = z.infer<typeof updatePrivacyPreferencesSchema>;
