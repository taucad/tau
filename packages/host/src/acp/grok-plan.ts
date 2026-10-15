/** Translate Grok's native plan gate to Tau's durable approval flow. */
import { z } from 'zod';
import type { RequestPermissionRequest, RequestPermissionResponse } from '@agentclientprotocol/sdk';

/** Validate the native plan request before it reaches the session. @internal */
export const grokPlanSchema = z.object({
  sessionId: z.string().min(1),
  toolCallId: z.string().min(1).max(256),
  planContent: z.string().nullish(),
});

/**
 * Ask the person before Grok leaves planning and starts implementing.
 * @param request - The validated plan request.
 * @returns A standard permission request using the same session identity.
 * @internal
 */
export const permissionOfGrokPlan = (request: z.infer<typeof grokPlanSchema>): RequestPermissionRequest => ({
  sessionId: request.sessionId,
  toolCall: {
    toolCallId: request.toolCallId,
    title: request.planContent
      ? `Approve Grok’s plan and start implementing?\n\n${request.planContent}`
      : 'Approve Grok’s plan and start implementing?',
    kind: 'switch_mode',
    ...(request.planContent === null || request.planContent === undefined
      ? {}
      : { content: [{ type: 'content', content: { type: 'text', text: request.planContent } }] }),
  },
  options: [
    { optionId: 'approve-plan', name: 'Approve plan', kind: 'allow_once' },
    { optionId: 'reject-plan', name: 'Keep planning', kind: 'reject_once' },
  ],
});

/**
 * Only the explicit approval option lets Grok leave planning.
 * @param response - Tau's settled permission response.
 * @returns Grok's native result.
 * @internal
 */
export const grokPlanResponseOf = (response: RequestPermissionResponse): { outcome: 'approved' | 'cancelled' } => ({
  outcome:
    response.outcome.outcome === 'selected' && response.outcome.optionId === 'approve-plan' ? 'approved' : 'cancelled',
});
