import { z } from 'zod';

/**
 * Provider-owned permission choices, separate from a Tau authority receipt.
 * Requested scopes describe the reviewed adapter's option, never proof of saving or effective policy.
 * @public
 */
export const providerPermissionSchema = z.object({
  owner: z.literal('provider'),
  persistence: z.literal('unverified'),
  options: z.array(
    z.object({
      optionId: z.string().min(1),
      requestedScope: z.enum(['once', 'session', 'persistent', 'unspecified']),
    }),
  ),
});

/** Presentation facts about a provider-owned choice; this is not an execution grant. @public */
export type ProviderPermission = z.infer<typeof providerPermissionSchema>;
