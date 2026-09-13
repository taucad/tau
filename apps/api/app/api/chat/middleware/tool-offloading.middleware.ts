import { createMiddleware } from 'langchain';
import type { AgentMiddleware } from 'langchain';
import { ToolMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { toolName, fileUnchangedMarker } from '@taucad/chat/constants';
import { TauRpcBackendFactory } from '#api/chat/tau-rpc-backend.js';
import { MetricsService } from '#telemetry/metrics.js';

/** Characters per token approximation. */
const charactersPerToken = 4;

/** Default cap for tools not in the offload config. Mirrors claude-code's 20 K-char fallback. */
const defaultUnknownToolMaxChars = 20_000;

/** Per-field char threshold for structure-preserving compaction on the jsonCompact fallback path. */
const perFieldCharacterThreshold = 1000;

/** Head budget (chars) for the `<persisted-output>` envelope preview. */
const envelopePreviewBudget = 4000;

/**
 * Per-tool offload thresholds. Tools whose offloaded ToolMessage payload exceeds
 * `maxChars` are persisted to disk and replaced with a generic
 * `<persisted-output>` envelope. Tools missing from this map fall back to the
 * structure-preserving `jsonCompact` path at {@link defaultUnknownToolMaxChars}.
 *
 * Mirrors claude-code's `toolResultStorage.maybePersistLargeToolResult` per-tool
 * char caps (and is more conservative for dense `.d.ts` reads — bumped to 80 K
 * so legitimate 80-line slices don't trip the offload while transcripts that
 * pull thousands of lines do).
 */
const offloadConfig: Record<string, { maxChars: number }> = {
  [toolName.readFile]: { maxChars: 80_000 },
  [toolName.grep]: { maxChars: 20_000 },
  [toolName.globSearch]: { maxChars: 20_000 },
  [toolName.listDirectory]: { maxChars: 20_000 },
};

/**
 * Tools that should never have their output persisted/replaced. Their results
 * are either tiny ack messages (mutators) or binary fixtures consumed by the
 * UI verbatim (screenshot).
 */
const skipOffloadTools: ReadonlySet<string> = new Set<string>([
  toolName.editFile,
  toolName.createFile,
  toolName.deleteFile,
  toolName.screenshot,
]);

const offloadingContextSchema = z.object({
  chatId: z.string(),
});

/**
 * Recursively walks a parsed JSON value and replaces string leaves exceeding
 * the threshold with compact placeholders. Preserves the overall structure
 * (objects, arrays, primitives) so downstream schemas still validate. Used
 * exclusively on the jsonCompact fallback path for unknown tools.
 *
 * @public
 */
export function compactLargeStrings(value: unknown, threshold: number): unknown {
  if (typeof value === 'string') {
    return value.length > threshold ? `[offloaded: ${value.length} chars]` : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => compactLargeStrings(item, threshold));
  }

  if (value !== null && typeof value === 'object') {
    const compacted: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      compacted[key] = compactLargeStrings(entry, threshold);
    }
    return compacted;
  }

  return value;
}

/**
 * Head-truncates at the nearest preceding newline so the envelope never breaks
 * a line mid-stream. Returns the full string when it fits in the budget.
 */
function headTruncateAtNewline(content: string, budget: number): { preview: string; truncatedChars: number } {
  if (content.length <= budget) {
    return { preview: content, truncatedChars: 0 };
  }
  const slice = content.slice(0, budget);
  const lastNewline = slice.lastIndexOf('\n');
  const cutAt = lastNewline > budget / 2 ? lastNewline : budget;
  return { preview: slice.slice(0, cutAt), truncatedChars: content.length - cutAt };
}

/**
 * Builds the generic `<persisted-output>` envelope used for every offloaded
 * configured tool. The envelope carries enough metadata for the LLM to
 * re-target a narrower re-read without re-issuing the original heavy call:
 *
 * - Tool name and original size so the model sees the scale of what was hidden.
 * - Persisted path for explicit follow-up reads of the full bytes.
 * - Head-truncated preview at a newline boundary so structure (gutter line
 *   numbers from `handle-read-file`, `file:line:` triples from `handle-grep`)
 *   survives intact.
 *
 * Mirrors claude-code's `toolResultStorage.maybePersistLargeToolResult` shape.
 */
function buildPersistedEnvelope(options: { toolName: string; persistedPath: string; rawContent: string }): string {
  const { preview, truncatedChars } = headTruncateAtNewline(options.rawContent, envelopePreviewBudget);
  const header =
    `Tool ${options.toolName} output persisted (${options.rawContent.length} chars) to ${options.persistedPath}. ` +
    (truncatedChars > 0
      ? `Re-read narrower ranges via read_file ${options.persistedPath} offset=<line> limit=<lines> ` +
        `(showing head ${preview.length} chars; ${truncatedChars} chars omitted).`
      : `Full content shown below.`);

  return ['<persisted-output>', header, '', preview, '</persisted-output>'].join('\n');
}

/**
 * Returns the structure-preserving JSON compaction or a plain head/tail preview
 * for tools not enumerated in {@link offloadConfig}. Keeps the existing
 * downstream-schema-valid output shape for fan-out / agent-output tools (e.g.
 * `web_search`, `test_model`) whose UI relies on parsing the JSON.
 */
function compactJsonContent(content: string, filePath: string): string {
  try {
    const parsed: unknown = JSON.parse(content);
    const compacted = compactLargeStrings(parsed, perFieldCharacterThreshold);

    if (compacted !== null && typeof compacted === 'object' && !Array.isArray(compacted)) {
      (compacted as Record<string, unknown>)['_offloadedTo'] = filePath;
    }

    return JSON.stringify(compacted);
  } catch {
    const { preview } = headTruncateAtNewline(content, envelopePreviewBudget);
    return (
      `Tool result too large (${Math.ceil(content.length / charactersPerToken)} tokens). ` +
      `Full result saved to: ${filePath}\n` +
      `Use read_file to access the full result.\n\n` +
      `Preview:\n${preview}`
    );
  }
}

function looksLikeJson(content: string): boolean {
  const trimmed = content.trimStart();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

/**
 * Computes the persisted path for an offloaded tool result. Session-scoped
 * under `.tau/tool-results/<chatId>/` so concurrent chats never collide and
 * eviction can be done by directory.
 */
function buildPersistedPath(options: { chatId: string; toolCallId: string; isJson: boolean }): string {
  const extension = options.isJson ? 'json' : 'txt';
  return `.tau/tool-results/${options.chatId}/${options.toolCallId}.${extension}`;
}

function estimateTokens(chars: number): number {
  return Math.ceil(chars / charactersPerToken);
}

/**
 * Extracts the `content` field from a JSON-serialised `read_file` tool result
 * so the middleware can short-circuit when the tool already substituted it
 * with `fileUnchangedMarker`. Returns an empty string on parse failure.
 */
function extractReadFileContent(serialised: string): string {
  try {
    const parsed = JSON.parse(serialised) as { content?: unknown };
    return typeof parsed.content === 'string' ? parsed.content : '';
  } catch {
    return '';
  }
}

/**
 * Creates middleware that offloads large tool results to the chat virtual
 * filesystem. When a configured tool's payload exceeds its per-tool
 * `maxChars`, the full result is written to
 * `.tau/tool-results/<chatId>/<toolCallId>.{json,txt}` and the `ToolMessage`
 * content is replaced with a `<persisted-output>` envelope carrying a
 * head-truncated preview plus directive copy for narrower re-reads. Unknown
 * tools fall back to structure-preserving JSON compaction so downstream
 * schemas still parse.
 *
 * Emits the `chat.tool_result.offloads` OTEL counter on every successful
 * offload (per-tool attributes including original/persisted bytes and
 * estimated token saves) so Grafana can quantify cache pressure reduction.
 *
 * @public
 */
export const createToolOffloadingMiddleware = (
  rpcBackendFactory: TauRpcBackendFactory,
  metricsService: MetricsService,
  options?: {
    /** Replace the per-tool maxChars map (test override). */
    perToolMaxCharsOverride?: Record<string, number>;
    /** Override the fallback char threshold for unknown tools. */
    unknownToolMaxChars?: number;
  },
): AgentMiddleware => {
  const resolvedConfig: Record<string, { maxChars: number }> = options?.perToolMaxCharsOverride
    ? Object.fromEntries(
        Object.entries(options.perToolMaxCharsOverride).map(([key, value]) => [key, { maxChars: value }]),
      )
    : offloadConfig;
  const unknownToolMaxChars = options?.unknownToolMaxChars ?? defaultUnknownToolMaxChars;

  return createMiddleware({
    name: 'ToolOffloading',
    contextSchema: offloadingContextSchema,

    async wrapToolCall(request, handler) {
      const result = await handler(request);
      const { context } = request.runtime;
      const { chatId } = context;

      if (!(result instanceof ToolMessage)) {
        return result;
      }

      const tool = result.name ?? '';
      if (skipOffloadTools.has(tool)) {
        return result;
      }

      const content = typeof result.content === 'string' ? result.content : JSON.stringify(result.content);

      // Short-circuit when `read_file` has already been deduped by the tool
      // itself (see `tool-read-file.ts`). The tool substitutes content with
      // `fileUnchangedMarker.build(priorToolCallId)` via a `Command` state
      // update; neither a fresh offload write nor a new envelope is needed.
      // The check is purely structural so it works without any in-process
      // registry — the marker is part of the tool's serialised output.
      if (tool === toolName.readFile && fileUnchangedMarker.matches(extractReadFileContent(content))) {
        return result;
      }

      const configured = resolvedConfig[tool];
      const maxChars = configured?.maxChars ?? unknownToolMaxChars;

      if (content.length <= maxChars) {
        return result;
      }

      const toolCallId = result.tool_call_id;
      const isJson = looksLikeJson(content);
      const persistedPath = buildPersistedPath({ chatId, toolCallId, isJson });

      try {
        const backend = rpcBackendFactory.create(chatId, toolCallId);
        await backend.write(persistedPath, content);

        const replacementContent = configured
          ? buildPersistedEnvelope({ toolName: tool, persistedPath, rawContent: content })
          : compactJsonContent(content, persistedPath);

        metricsService.chatToolResultOffloaded.add(1, {
          // eslint-disable-next-line @typescript-eslint/naming-convention -- OTEL attribute names use dot-notation
          'tool.name': tool,
          // eslint-disable-next-line @typescript-eslint/naming-convention -- OTEL attribute names use dot-notation
          'tool.result.original_bytes': content.length,
          // eslint-disable-next-line @typescript-eslint/naming-convention -- OTEL attribute names use dot-notation
          'tool.result.persisted_bytes': replacementContent.length,
          // eslint-disable-next-line @typescript-eslint/naming-convention -- OTEL attribute names use dot-notation
          'tool.result.original_tokens_estimated': estimateTokens(content.length),
          // eslint-disable-next-line @typescript-eslint/naming-convention -- OTEL attribute names use dot-notation
          'tool.result.persisted_tokens_estimated': estimateTokens(replacementContent.length),
        });

        return new ToolMessage({
          content: replacementContent,
          // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
          tool_call_id: toolCallId,
          name: tool,
        });
      } catch {
        return result;
      }
    },
  });
};
