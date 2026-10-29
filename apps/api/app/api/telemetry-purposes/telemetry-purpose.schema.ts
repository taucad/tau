import { z } from 'zod';

/**
 * The agent-observability processing purposes an account decides on
 * independently (blueprint T04, data lifecycle "Purpose decisions"). One is
 * never inferred from another, and none of them is derived from the existing
 * `allowsAiTraining` / `allowsUsageMetrics` booleans: those govern anonymous
 * metrics and supplier training preference, not recorded prompts, designs or
 * account-linked task histories.
 */
export const telemetryPurposes = ['summary', 'content', 'diagnosis', 'reuse', 'training'] as const;

/** One processing purpose. @see telemetryPurposes */
export const telemetryPurposeSchema = z.enum(telemetryPurposes);

/** One processing purpose. */
export type TelemetryPurpose = z.infer<typeof telemetryPurposeSchema>;

/**
 * Why a purpose is not available. Every value is a refusal: the resolver has
 * no "unknown" state that a caller could read as permission.
 */
export const purposeRefusals = [
  /* No approved production notice is configured, so no decision can be taken yet (T01 gate). */
  'notice-unapproved',
  /* The account has never decided this purpose under the current notice. */
  'no-decision',
  /* A decision exists, but it was taken against a superseded notice version. */
  'notice-superseded',
  /* The account decided against this purpose. */
  'withdrawn',
  /* The project is deletion-fenced; nothing may be captured or reused from it. */
  'project-fenced',
  /* The principal does not own the project. */
  'project-not-owned',
  /* The project carries another account's material, so protection is unknown. */
  'project-mixed-source',
  /* The tier is permanently excluded from this purpose (the Pro no-training ruling). */
  'tier-excluded',
  /* The entitlement could not be established affirmatively, so it cannot authorise reuse. */
  'tier-unverified',
] as const;

/** Why a purpose is not available. */
export const purposeRefusalSchema = z.enum(purposeRefusals);

/** Why a purpose is not available. */
export type PurposeRefusal = z.infer<typeof purposeRefusalSchema>;

/** The effective state of one purpose, as the account's own UI displays it. */
export const telemetryPurposeStateSchema = z.object({
  purpose: telemetryPurposeSchema,
  /** The server's authority answer. The only field a caller may act on. */
  allowed: z.boolean(),
  /** Whether the account has recorded a decision under the current notice. */
  decided: z.boolean(),
  /** What the account chose; `false` while undecided, which is not a refusal by the account. */
  granted: z.boolean(),
  /** Absent only when `allowed` is true. */
  refusal: purposeRefusalSchema.optional(),
});

/** The effective state of one purpose. */
export type TelemetryPurposeState = z.infer<typeof telemetryPurposeStateSchema>;

/**
 * The whole effective answer for one principal, and optionally one project.
 *
 * `epoch` binds the answer to the principal, project and notice it was
 * computed for. A client discards any response whose epoch does not match the
 * principal and project it is currently showing, so a sign-out, account switch
 * or project switch cannot be answered from another subject's cached grant.
 */
export const effectiveTelemetryPurposesSchema = z
  .object({
    epoch: z.string().describe('Opaque principal/project/notice binding; clients must not parse it'),
    noticeVersion: z
      .string()
      .optional()
      .describe('The approved production notice in force. Absent while none is, which refuses every purpose.'),
    projectId: z.string().optional().describe('The project the answer was scoped to, absent for the account alone.'),
    purposes: z.array(telemetryPurposeStateSchema),
  })
  .meta({ id: 'EffectiveTelemetryPurposes' });

/** The whole effective answer for one principal, and optionally one project. */
export type EffectiveTelemetryPurposes = z.infer<typeof effectiveTelemetryPurposesSchema>;

/**
 * A decision submission. Each purpose is named explicitly; an omitted purpose
 * is left as it was, and there is no "all" shorthand that could grant content
 * capture as a side effect of granting summaries.
 */
export const updateTelemetryPurposesSchema = z
  .object({
    /** The notice version the account was shown. A stale version is refused. */
    noticeVersion: z.string().min(1),
    decisions: z
      .array(z.object({ purpose: telemetryPurposeSchema, granted: z.boolean() }))
      .min(1)
      .max(telemetryPurposes.length),
  })
  .meta({ id: 'UpdateTelemetryPurposes' });

/** The read query. A repeated or empty `projectId` is refused rather than passed on. */
export const telemetryPurposesQuerySchema = z.object({
  projectId: z.string().min(1).optional(),
});

/** A decision submission. */
export type UpdateTelemetryPurposesInput = z.infer<typeof updateTelemetryPurposesSchema>;
