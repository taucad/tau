import { z } from 'zod';

/**
 * The agent-observability processing purposes an account decides on
 * independently (blueprint T04, data lifecycle "Purpose decisions"). One is
 * never inferred from another. `allowsUsageMetrics` governs anonymous metrics
 * only; `allowsAiTraining` matters only as the Free plan's default, which
 * grants the improvement purposes to an assured Free account until it decides
 * them itself (see `resolvePurposeAuthority`).
 */
export const telemetryPurposes = ['summary', 'feedback', 'content', 'diagnosis', 'reuse', 'training'] as const;

/** One processing purpose. @see telemetryPurposes */
export const telemetryPurposeSchema = z.enum(telemetryPurposes);

/** One processing purpose. */
export type TelemetryPurpose = z.infer<typeof telemetryPurposeSchema>;
