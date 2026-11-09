/**
 * Read deduplication (LangChain plane regression review R5).
 *
 * The LangChain plane answered a `read_file` that returned exactly what an earlier, still-visible read in the same chat
 * returned with a short marker naming that earlier call, so re-reading an unchanged file did not put it in context
 * twice. The chat's committed history is the record: a prior read counts only while its body is still in history,
 * never once compaction cleared it.
 *
 * @module
 */
import type { JsonObject, JsonValue, ProviderMessage } from '#log/event-types.js';
import type { ToolRegistry } from '#waist/ports.js';

const isJsonObject = (value: JsonValue | undefined): value is JsonObject =>
  value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value);

const readFileToolName = 'read_file';

/**
 * The marker text. It must keep `@taucad/chat`'s `fileUnchangedMarker` prefix, which the UI's read row matches to show
 * "Re-read, cached"; agent-host cannot import that library.
 *
 * @param priorToolCallId - The earlier call whose result is still in context.
 * @returns The marker.
 */
export const readUnchangedMarker = (priorToolCallId: string): string =>
  `[File unchanged since last read in tool_call ${priorToolCallId}. Refer to the earlier read_file output in this conversation.]`;

type JsonRecord = Readonly<Record<string, JsonValue>>;

const recordOf = (value: JsonValue | undefined): JsonRecord | undefined => {
  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed) as JsonValue;
    } catch {
      return undefined;
    }
  }
  return isJsonObject(parsed) ? parsed : undefined;
};

/** The identity of one read: the file and the page of it. */
const readKey = (input: JsonValue | undefined): string | undefined => {
  const fields = recordOf(input);
  const targetFile = fields?.['targetFile'];
  if (typeof targetFile !== 'string') {
    return undefined;
  }
  return JSON.stringify([targetFile, fields?.['offset'] ?? 1, fields?.['limit'] ?? null]);
};

const bodyText = (content: JsonValue | undefined): string | undefined => {
  const text = recordOf(content)?.['content'];
  return typeof text === 'string' ? text : undefined;
};

/**
 * The earlier read with the same key and the same text that is still in history, newest first.
 *
 * @param history - Committed history.
 * @param key - The new read's key.
 * @param text - The new read's text.
 * @returns The earlier call id, or `undefined`.
 */
const priorIdenticalRead = (history: readonly ProviderMessage[], key: string, text: string): string | undefined => {
  const keys = new Map<string, string | undefined>();
  for (const message of history) {
    if (message.role === 'tool-input' && message.toolName === readFileToolName) {
      keys.set(message.toolCallId, readKey(message.content));
    }
  }
  for (const message of history.toReversed()) {
    if (
      message.role === 'tool-output' &&
      message.toolName === readFileToolName &&
      !message.isError &&
      keys.get(message.toolCallId) === key &&
      bodyText(message.content) === text
    ) {
      return message.toolCallId;
    }
  }
  return undefined;
};

/**
 * Wrap a registry so a `read_file` whose text an earlier visible read already returned answers with the marker.
 *
 * The file is still read, so a changed file is always returned in full; only the duplicate text is withheld.
 *
 * @param registry - The run's registry.
 * @param history - Reads the chat's committed history at call time.
 * @returns The wrapped registry.
 */
export const withReadDedup = (
  registry: ToolRegistry,
  history: () => Promise<readonly ProviderMessage[]>,
): ToolRegistry => ({
  ...(registry.answerApproval === undefined
    ? {}
    : { answerApproval: async (answer) => registry.answerApproval?.(answer) }),
  list: () => registry.list(),
  invoke: async (invocation) => {
    const result = await registry.invoke(invocation);
    if (invocation.toolName !== readFileToolName || result.isError) {
      return result;
    }
    const key = readKey(invocation.input);
    const text = bodyText(result.content);
    const fields = recordOf(result.content);
    if (key === undefined || text === undefined || fields === undefined || text.startsWith('[File unchanged')) {
      return result;
    }
    const prior = priorIdenticalRead(await history(), key, text);
    return prior === undefined ? result : { ...result, content: { ...fields, content: readUnchangedMarker(prior) } };
  },
});
