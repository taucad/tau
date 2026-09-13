import { createMiddleware } from 'langchain';
import type { AgentMiddleware } from 'langchain';
import { ToolMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { TauRpcBackendFactory } from '#api/chat/tau-rpc-backend.js';
import { MetricsService } from '#telemetry/metrics.js';

/**
 * Aggregate char budget across every `ToolMessage` in the latest turn.
 * Mirrors claude-code's `MAX_TOOL_RESULTS_PER_MESSAGE_CHARS` envelope: a
 * single turn whose tool fan-out blows past this ceiling has the largest
 * fresh results persisted to `.tau/tool-results/` and replaced with a
 * `<persisted-output>` envelope until the budget is satisfied.
 */
const maxToolResultsPerMessageChars = 200_000;

/** Characters per token approximation, same constant as `tool-offloading.middleware.ts`. */
const charactersPerToken = 4;

/** Head budget (chars) for the `<persisted-output>` envelope preview. */
const envelopePreviewBudget = 4000;

/**
 * Structural marker used to detect tool messages that already carry an offload
 * envelope. Both this middleware and {@link createToolOffloadingMiddleware}
 * emit content that begins with this prefix; matching it lets us skip
 * re-persisting bytes that were already persisted in a previous pass.
 */
const persistedEnvelopeOpenTag = '<persisted-output>';

const budgetContextSchema = z.object({
  chatId: z.string(),
});

type ToolMessageEntry = {
  index: number;
  message: ToolMessage;
  content: string;
};

function getToolMessages(messages: BaseMessage[]): ToolMessageEntry[] {
  const entries: ToolMessageEntry[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const candidate = messages[i];
    if (candidate instanceof ToolMessage) {
      const message = candidate as ToolMessage;
      const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
      entries.push({ index: i, message, content });
      continue;
    }
    if (entries.length > 0) {
      break;
    }
  }
  return entries;
}

function totalChars(entries: ToolMessageEntry[]): number {
  let total = 0;
  for (const entry of entries) {
    total += entry.content.length;
  }
  return total;
}

function headTruncateAtNewline(content: string, budget: number): string {
  if (content.length <= budget) {
    return content;
  }
  const slice = content.slice(0, budget);
  const lastNewline = slice.lastIndexOf('\n');
  const cutAt = lastNewline > budget / 2 ? lastNewline : budget;
  return slice.slice(0, cutAt);
}

function buildEnvelope(options: { toolName: string; persistedPath: string; rawContent: string }): string {
  const preview = headTruncateAtNewline(options.rawContent, envelopePreviewBudget);
  const truncatedChars = options.rawContent.length - preview.length;
  const header =
    `Tool ${options.toolName} output persisted (${options.rawContent.length} chars) to ${options.persistedPath}. ` +
    (truncatedChars > 0
      ? `Re-read narrower ranges via read_file ${options.persistedPath} offset=<line> limit=<lines> ` +
        `(showing head ${preview.length} chars; ${truncatedChars} chars omitted).`
      : `Full content shown below.`);
  return [persistedEnvelopeOpenTag, header, '', preview, '</persisted-output>'].join('\n');
}

function buildPersistedPath(options: { chatId: string; toolCallId: string }): string {
  return `.tau/tool-results/${options.chatId}/${options.toolCallId}.txt`;
}

function estimateTokens(chars: number): number {
  return Math.ceil(chars / charactersPerToken);
}

/**
 * Returns true when the content already carries a `<persisted-output>`
 * envelope. The check is purely structural — we never persisted these bytes
 * in this process, but the offload-envelope shape is stable across both
 * middleware (this one and `tool-offloading.middleware.ts`) so a prefix
 * match is a sufficient short-circuit. Avoiding a second persist keeps the
 * prompt-cache prefix byte-identical AND makes the dedup logic stateless,
 * which is essential for cross-instance / cross-region durability.
 */
function isAlreadyPersisted(content: string): boolean {
  return content.startsWith(persistedEnvelopeOpenTag);
}

/**
 * Per-turn aggregate-budget middleware. Inserts between `toolOffloading` and
 * `toolResultTrimmer` in `chat.service.ts`. Runs at the `wrapModelCall`
 * boundary because parallel tool fan-outs only become visible as a group at
 * that boundary — `wrapToolCall` runs once per tool with no cross-tool
 * visibility.
 *
 * Algorithm (mirrors claude-code's `enforceToolResultBudget`):
 *
 * 1. Identify the trailing run of `ToolMessage`s in `request.messages` (those
 *    are the just-finished turn's tool results).
 * 2. Sum their content lengths. If under {@link maxToolResultsPerMessageChars},
 *    return the request unchanged.
 * 3. Otherwise sort the *fresh* results (those whose content does NOT already
 *    begin with `<persisted-output>`) descending by size. Persist the largest
 *    one via `TauRpcBackend.write`, replace its content with a
 *    `<persisted-output>` envelope. Continue until the budget is satisfied.
 *
 * The fresh-vs-persisted distinction is purely structural — see
 * {@link isAlreadyPersisted}. There is no in-process state to consult; the
 * checkpointer's serialised `messages` channel is the single source of truth
 * across pods, regions, and process restarts.
 *
 * @public
 */
export const createToolResultBudgetMiddleware = (
  rpcBackendFactory: TauRpcBackendFactory,
  metricsService: MetricsService,
  options?: { maxChars?: number },
): AgentMiddleware => {
  const maxChars = options?.maxChars ?? maxToolResultsPerMessageChars;

  return createMiddleware({
    name: 'ToolResultBudget',
    contextSchema: budgetContextSchema,

    async wrapModelCall(request, handler) {
      const { context } = request.runtime;
      const { chatId } = context;
      const entries = getToolMessages(request.messages);

      if (entries.length === 0) {
        return handler(request);
      }

      let total = totalChars(entries);
      if (total <= maxChars) {
        return handler(request);
      }

      const messages = [...request.messages];
      const freshEntries = entries.filter((entry) => !isAlreadyPersisted(entry.content));
      freshEntries.sort((a, b) => b.content.length - a.content.length);

      for (const entry of freshEntries) {
        if (total <= maxChars) {
          break;
        }
        const toolCallId = entry.message.tool_call_id;
        const toolNameValue = entry.message.name ?? '';
        const persistedPath = buildPersistedPath({ chatId, toolCallId });

        try {
          const backend = rpcBackendFactory.create(chatId, toolCallId);
          // oxlint-disable-next-line no-await-in-loop -- sequential writes intentional: persisting in parallel can stress the FS backend mid-stream
          await backend.write(persistedPath, entry.content);
        } catch {
          continue;
        }

        const replacement = buildEnvelope({ toolName: toolNameValue, persistedPath, rawContent: entry.content });

        metricsService.chatToolResultOffloaded.add(1, {
          // eslint-disable-next-line @typescript-eslint/naming-convention -- OTEL attribute names use dot-notation
          'tool.name': toolNameValue,
          // eslint-disable-next-line @typescript-eslint/naming-convention -- OTEL attribute names use dot-notation
          'tool.result.original_bytes': entry.content.length,
          // eslint-disable-next-line @typescript-eslint/naming-convention -- OTEL attribute names use dot-notation
          'tool.result.persisted_bytes': replacement.length,
          // eslint-disable-next-line @typescript-eslint/naming-convention -- OTEL attribute names use dot-notation
          'tool.result.original_tokens_estimated': estimateTokens(entry.content.length),
          // eslint-disable-next-line @typescript-eslint/naming-convention -- OTEL attribute names use dot-notation
          'tool.result.persisted_tokens_estimated': estimateTokens(replacement.length),
          // eslint-disable-next-line @typescript-eslint/naming-convention -- OTEL attribute names use dot-notation
          'tool.result.source': 'budget_overflow',
        });

        const replaced = new ToolMessage({
          content: replacement,
          // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
          tool_call_id: toolCallId,
          name: toolNameValue,
        });
        messages[entry.index] = replaced;
        total = total - entry.content.length + replacement.length;
        entry.content = replacement;
      }

      return handler({ ...request, messages });
    },
  });
};
