import { createMiddleware } from 'langchain';
import type { AgentMiddleware } from 'langchain';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import type { BaseMessage, UsageMetadata } from '@langchain/core/messages';
import { z } from 'zod';
import type { ModelService } from '#api/models/model.service.js';

const tokenUsageContextSchema = z.object({
  modelId: z.string(),
  modelService: z.custom<ModelService>(),
});

/**
 * Inject the `<system-reminder>` only once the agent has consumed this fraction
 * of the context window. Below the threshold the middleware is a no-op so the
 * cacheable prefix stays byte-stable across turns and Gemini / OpenAI / Anthropic
 * implicit caches keep hitting.
 *
 * Anchored at 0.7 because:
 *   - At 70% used the agent still has ~30% of headroom to wind down work, so
 *     self-throttling guidance lands early enough to be actionable.
 *   - Below 70% the steady-state cost dominates, and any per-turn prefix
 *     mutation here busts ~$0.20–$0.25 of cache discount per Gemini turn (see
 *     the repro in docs/research/gemini-prompt-cache-busting.md, Finding 1).
 *
 * This is the gate referenced by the Cache-Safety Contract section below.
 */
const reminderInjectionThreshold = 0.7;

/**
 * Locate the most recent AIMessage that carries `usage_metadata`. Returns
 * `undefined` when no such message exists (turn 1, or when the provider
 * has not surfaced token counts yet).
 */
function findMostRecentUsage(messages: readonly BaseMessage[]): UsageMetadata | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]!;
    if (message instanceof AIMessage) {
      const usage = message.usage_metadata as UsageMetadata | undefined;
      if (usage) {
        return usage;
      }
    }
  }
  return undefined;
}

/**
 * Build the deterministic `<system-reminder>` body. Output bytes depend only
 * on the three integers, satisfying the Cache-Safety Contract CS3
 * (byte-determinism for byte-identical input).
 */
function formatTokenUsageReminder(used: number, total: number | undefined): string {
  const lines = [`Token usage: ${used} used`];
  if (total !== undefined && total > 0) {
    const remaining = Math.max(0, total - used);
    lines[0] = `Token usage: ${used} used / ${total} total / ${remaining} remaining`;
  }
  return `<system-reminder>
${lines.join('\n')}
</system-reminder>`;
}

/**
 * Middleware that injects a per-turn token-usage `<system-reminder>` so the
 * agent can self-throttle as it approaches the context window.
 *
 * Behaviour:
 *   - Turn 1 (no AIMessage with `usage_metadata`): pass-through, no inject.
 *   - Turns where `used / total < reminderInjectionThreshold` (the steady
 *     state for nearly every chat): pass-through, no inject. Suppressing the
 *     reminder here keeps `messages[0]` byte-stable across turns so the Gemini
 *     implicit cache, the OpenAI prompt cache, and the Anthropic incremental
 *     cache all continue to hit.
 *   - Turns where `used / total >= reminderInjectionThreshold`: prepend a
 *     HumanMessage carrying `used / total / remaining` so the agent has an
 *     authoritative signal that it is about to run out of context.
 *   - Total context window unknown: pass-through (cache-safe default; without
 *     a denominator we cannot compute the threshold).
 *
 * Cache-Safety Contract:
 *   - CS1 (no mutation): when the reminder fires, builds a fresh `messages`
 *     array with `[reminder, ...messages]`; never mutates input instances.
 *   - CS3 (byte-determinism): the reminder body depends only on three
 *     integers, so byte-identical input produces a byte-identical prepended
 *     message.
 *   - CS4 (steady-state stability): below the threshold the request is
 *     forwarded unchanged so `messages[0]` does not vary turn-to-turn. Without
 *     this rule the reminder body's monotonically-growing `used` count would
 *     invalidate every provider's prefix cache on every turn — this was the
 *     smoking-gun cache-bust documented in
 *     `docs/research/gemini-prompt-cache-busting.md` Finding 1.
 *
 * Wiring order (chat.service.ts): inserted between `usage-tracking` (which
 * records the previous turn's `usage_metadata`) and `agent-safeguards` (which
 * also injects `<system-reminder>` nudges into the cacheable prefix).
 */
export const createTokenUsageContextMiddleware = (): AgentMiddleware =>
  createMiddleware({
    name: 'TokenUsageContext',
    contextSchema: tokenUsageContextSchema,

    async wrapModelCall(request, handler) {
      const usage = findMostRecentUsage(request.messages);
      if (!usage) {
        return handler(request);
      }

      const { modelId, modelService } = request.runtime.context;
      const used = usage.input_tokens + usage.output_tokens;
      const total = modelService.getContextWindow(modelId);

      // Cache-safe default: with no denominator we cannot compute the gate, so
      // suppress the reminder rather than emit a per-turn-mutating prefix.
      if (total === undefined || total <= 0) {
        return handler(request);
      }

      // Steady-state pass-through. CS4: prefix bytes do not change across turns
      // until the agent crosses the threshold, so provider-side prompt caches
      // keep hitting.
      if (used / total < reminderInjectionThreshold) {
        return handler(request);
      }

      const reminderBody = formatTokenUsageReminder(used, total);
      const reminder = new HumanMessage(reminderBody);
      const messages = [reminder, ...request.messages];

      return handler({ ...request, messages });
    },
  });
