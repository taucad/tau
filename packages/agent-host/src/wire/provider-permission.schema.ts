import { z } from 'zod';

/**
 * Provider-owned permission choices, separate from a Tau authority receipt.
 * Requested scopes describe the reviewed adapter's option, never proof of saving or effective policy.
 * @public
 */
export const providerPermissionSchema = z.strictObject({
  owner: z.literal('provider'),
  persistence: z.literal('unverified'),
  readback: z.enum(['config-layers', 'permission-file', 'unsupported']).optional(),
  unsupportedReason: z.literal('unconfigured-mcp-server').optional(),
  options: z.array(
    z.strictObject({
      optionId: z.string().min(1),
      requestedScope: z.enum(['once', 'session', 'persistent', 'unspecified']),
    }),
  ),
});

/** Presentation facts about a provider-owned choice; this is not an execution grant. @public */
export type ProviderPermission = z.infer<typeof providerPermissionSchema>;

const observationFields = {
  version: z.literal(1),
  toolCallId: z.string().min(1).max(512),
  requestedScope: z.literal('persistent'),
  stored: z.enum(['present', 'absent', 'unknown']),
  preexisting: z.union([z.boolean(), z.literal('unknown')]),
  reason: z.enum([
    'policy-observed',
    'policy-overridden',
    'policy-absent',
    'config-read-failed',
    'config-changed',
    'policy-unqualified',
    'unsupported-identity',
    'unconfigured-mcp-server',
    'request-cancelled',
  ]),
};

/** Narrow provider configuration readback; this is neither a save receipt nor an execution grant. @public */
export const providerPermissionObservationSchema = z.discriminatedUnion('provider', [
  z.strictObject({
    ...observationFields,
    provider: z.literal('codex'),
    optionId: z.literal('allow_always'),
    effective: z.enum(['allowed', 'overridden', 'unknown']),
    observation: z.literal('config-readback'),
    layerKind: z.enum(['user', 'project']).optional(),
  }),
  z.strictObject({
    ...observationFields,
    provider: z.literal('grok'),
    optionId: z.literal('always-allow'),
    effective: z.enum(['overridden', 'unknown']),
    observation: z.literal('permission-file-readback'),
    layerKind: z.literal('project'),
  }),
]);

/** Bounded facts observed in one provider's settings after the selected request. @public */
export type ProviderPermissionObservation = z.infer<typeof providerPermissionObservationSchema>;

/** Durable selected option and an optional matching provider configuration observation. @public */
export const providerPermissionResolutionSchema = z
  .strictObject({
    outcome: z.enum(['approved', 'denied', 'cancelled']),
    optionId: z.string().min(1).max(512).optional(),
    observation: providerPermissionObservationSchema.optional(),
  })
  .refine(
    (value) =>
      value.observation === undefined ||
      (value.outcome === 'approved' && value.optionId === value.observation.optionId),
    { message: 'Provider readback must match the approved option' },
  );

/** Resolved provider permission presentation; the outcome remains owned by the host inbox. @public */
export type ProviderPermissionResolution = z.infer<typeof providerPermissionResolutionSchema>;
