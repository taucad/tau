import { z } from 'zod';

/**
 * The agent-observability processing purposes an account decides on
 * independently (blueprint T04, data lifecycle "Purpose decisions"). One is
 * never inferred from another, and none of them is derived from the existing
 * `allowsAiTraining` / `allowsUsageMetrics` booleans: those govern anonymous
 * metrics and supplier training preference, not recorded prompts, designs or
 * account-linked task histories.
 */
export const telemetryPurposes = ['summary', 'feedback', 'content', 'diagnosis', 'reuse', 'training'] as const;

/** One processing purpose. @see telemetryPurposes */
export const telemetryPurposeSchema = z.enum(telemetryPurposes);

/** One processing purpose. */
export type TelemetryPurpose = z.infer<typeof telemetryPurposeSchema>;
