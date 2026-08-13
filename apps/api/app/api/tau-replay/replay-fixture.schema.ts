import { z } from 'zod';
import { getToolInputSchema } from '@taucad/chat/schemas';

/**
 * Per-turn token usage the replay model emits as LangChain `usage_metadata`
 * (`{ input_tokens, output_tokens, … }`). Summed across turns this reproduces
 * the recorded totals so the metering + credit pipeline runs realistically.
 */
export const replayUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  reasoningTokens: z.number().int().nonnegative().optional(),
  cacheReadTokens: z.number().int().nonnegative().optional(),
  cacheWriteTokens: z.number().int().nonnegative().optional(),
});

/**
 * A scripted tool call. `args` is validated against the SAME per-tool input
 * schema the real tool uses (`getToolInputSchema` from `@taucad/chat/schemas`),
 * so any drift in a tool's input schema fails the fixture at validate time —
 * the type-safety guarantee (redesign R4). The registry is the single source of
 * truth, so this stays DRY across all tools.
 */
export const replayToolCallSchema = z
  .object({
    name: z.string().describe('Tool name, e.g. "create_file"'),
    args: z.record(z.string(), z.unknown()).describe('Tool arguments, validated against the tool input registry'),
  })
  .superRefine((call, context) => {
    const toolSchema = getToolInputSchema(`tool-${call.name}`);
    if (toolSchema === undefined) {
      context.addIssue({ code: 'custom', message: `Unknown replay tool "${call.name}"`, path: ['name'] });
      return;
    }
    const parsed = toolSchema.safeParse(call.args);
    if (!parsed.success) {
      context.addIssue({
        code: 'custom',
        message: `Invalid args for "${call.name}": ${parsed.error.message}`,
        path: ['args'],
      });
    }
  });

/**
 * One assistant turn — a single LangGraph model-node call: optional reasoning,
 * then either tool calls (the loop continues) or final text (the loop ends).
 */
export const replayTurnSchema = z
  .object({
    reasoning: z.string().optional().describe('Emitted as a LangChain reasoning content block'),
    toolCalls: z.array(replayToolCallSchema).optional(),
    text: z
      .string()
      .optional()
      .describe('Emitted as a text content block; a turn with text and no tool calls ends the loop'),
    usage: replayUsageSchema,
  })
  .refine((turn) => (turn.toolCalls?.length ?? 0) > 0 || (turn.text?.length ?? 0) > 0, {
    message: 'A replay turn must call tools or produce text',
  });

/** An ordered, replayable transcript of assistant decisions for one chat. */
export const replayFixtureSchema = z.object({
  id: z.string().describe('Fixture id, e.g. "cube-cylinder-cutout"'),
  sourceModel: z.string().describe('Provenance: the real model the transcript was recorded from'),
  turns: z.array(replayTurnSchema).min(1),
});

export type ReplayUsage = z.infer<typeof replayUsageSchema>;
export type ReplayToolCall = z.infer<typeof replayToolCallSchema>;
export type ReplayTurn = z.infer<typeof replayTurnSchema>;
export type ReplayFixture = z.infer<typeof replayFixtureSchema>;
