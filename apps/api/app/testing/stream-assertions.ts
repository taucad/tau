/**
 * Thin assertion helpers over UIMessage parts and UIMessageChunk arrays.
 * These operate on stable AI SDK types, not protocol-level details.
 */
import { expect } from 'vitest';
import type { UIMessage, UIMessageChunk } from 'ai';

/**
 * Assert the message contains at least one non-empty text part.
 */
export function expectHasTextContent(message: UIMessage): void {
  const textParts = message.parts.filter((p) => p.type === 'text');
  expect(textParts.length).toBeGreaterThan(0);

  const totalText = textParts.map((p) => p.text).join('');
  expect(totalText.trim().length).toBeGreaterThan(0);
}

/**
 * Assert the message contains a tool invocation with the given name.
 * Works with both static (tool-NAME) and dynamic (dynamic-tool) parts.
 */
export function expectHasToolCall(message: UIMessage, toolName: string): void {
  const found = message.parts.some((p) => {
    if (p.type === 'dynamic-tool') {
      return p.toolName === toolName;
    }

    return p.type === `tool-${toolName}`;
  });
  expect(found, `Expected tool call '${toolName}' in message parts`).toBe(true);
}

/**
 * Assert the message has a completed tool invocation for the given name.
 * Checks for state 'output-available' (success) on the part.
 */
export function expectToolCallSucceeded(message: UIMessage, toolName: string): void {
  const found = message.parts.some((p) => {
    const matchesName = p.type === 'dynamic-tool' ? p.toolName === toolName : p.type === `tool-${toolName}`;
    if (!matchesName) {
      return false;
    }

    return 'state' in p && p.state === 'output-available';
  });
  expect(found, `Expected completed tool call '${toolName}'`).toBe(true);
}

/**
 * Assert that the raw chunks include at least one chunk of the given type.
 */
export function expectChunkTypesInclude(chunks: UIMessageChunk[], type: string): void {
  const matching = chunks.filter((c) => c.type === type);
  expect(matching.length, `Expected at least one chunk of type '${type}'`).toBeGreaterThan(0);
}

/**
 * Assert that the specified chunk types appear in order (not necessarily contiguous).
 */
export function expectChunkOrder(chunks: UIMessageChunk[], ...types: string[]): void {
  let position = 0;

  for (const type of types) {
    const startAt = position;
    const index = chunks.findIndex((c, i) => i >= startAt && c.type === type);
    expect(index, `Expected chunk type '${type}' after position ${startAt}`).toBeGreaterThanOrEqual(startAt);
    position = index + 1;
  }
}

/**
 * Assert that tool input was streamed incrementally (multiple tool-input-delta chunks).
 * A properly streaming tool call should produce:
 *   tool-input-start -> tool-input-delta (x N) -> tool-input-available
 * with N >= 2 deltas for non-trivial arguments.
 */
export function expectIncrementalToolInput(chunks: UIMessageChunk[], _toolName: string): void {
  const deltaChunks = chunks.filter((c) => c.type === 'tool-input-delta');
  expect(
    deltaChunks.length,
    `Expected multiple tool-input-delta chunks for incremental streaming, got ${deltaChunks.length}`,
  ).toBeGreaterThanOrEqual(2);
}

/**
 * Assert that no error chunks were emitted in the stream.
 * Extracts the errorText from any error chunks for clear failure messages.
 */
export function expectNoErrors(chunks: UIMessageChunk[]): void {
  const errorChunks = chunks.filter((c) => c.type === 'error');
  const errorMessages = errorChunks.map((c) => {
    if ('errorText' in c && typeof c.errorText === 'string') {
      return c.errorText;
    }

    return JSON.stringify(c);
  });
  expect(
    errorChunks.length,
    `Expected no error chunks but got ${errorChunks.length}: ${errorMessages.join('; ')}`,
  ).toBe(0);
}

/**
 * Assert that the agent completed multiple LangGraph steps (multi-turn).
 * Each step produces start-step/finish-step pairs. Multi-turn means >= 2 pairs.
 */
export function expectMultipleSteps(chunks: UIMessageChunk[], minSteps = 2): void {
  const finishSteps = chunks.filter((c) => c.type === 'finish-step');
  expect(
    finishSteps.length,
    `Expected at least ${minSteps} finish-step chunks (multi-turn), got ${finishSteps.length}`,
  ).toBeGreaterThanOrEqual(minSteps);
}

/**
 * Extract usage data objects from raw stream chunks.
 * Usage data is written by the usageTrackingMiddleware as custom data chunks.
 */
export function extractUsageData(chunks: UIMessageChunk[]): Array<Record<string, unknown>> {
  const usageChunks: Array<Record<string, unknown>> = [];

  for (const chunk of chunks) {
    if ('data' in chunk && typeof chunk.data === 'object' && chunk.data !== null) {
      const data = chunk.data as Record<string, unknown>;
      if (data['type'] === 'usage') {
        usageChunks.push(data);
      }
    }
  }

  return usageChunks;
}

/**
 * Extract context compaction data objects from raw stream chunks.
 * Compaction data is written by the compactionMiddleware as custom data chunks.
 */
export function extractContextCompactionData(chunks: UIMessageChunk[]): Array<Record<string, unknown>> {
  const compactionChunks: Array<Record<string, unknown>> = [];

  for (const chunk of chunks) {
    if ('data' in chunk && typeof chunk.data === 'object' && chunk.data !== null) {
      const data = chunk.data as Record<string, unknown>;
      if (data['type'] === 'context-compaction') {
        compactionChunks.push(data);
      }
    }
  }

  return compactionChunks;
}

/**
 * Assert that at least one context compaction event was emitted.
 */
export function expectContextCompaction(chunks: UIMessageChunk[]): void {
  const compactionChunks = extractContextCompactionData(chunks);
  expect(compactionChunks.length, 'Expected at least one context compaction data chunk').toBeGreaterThan(0);
}

/**
 * Extracted tool call part with input args and output (when available).
 */
export type ToolCallPartInfo = {
  toolName: string;
  toolCallId: string;
  state: string;
  input: unknown;
  output: unknown;
};

/**
 * Extract all tool invocation parts for a given tool name from the final UIMessage.
 * Returns their input args, output, and state for structured assertions.
 */
export function extractToolCallParts(message: UIMessage, toolName: string): ToolCallPartInfo[] {
  const results: ToolCallPartInfo[] = [];

  for (const part of message.parts) {
    const matchesName = part.type === 'dynamic-tool' ? part.toolName === toolName : part.type === `tool-${toolName}`;
    if (!matchesName) {
      continue;
    }

    if (!('state' in part)) {
      continue;
    }

    results.push({
      toolName,
      toolCallId: 'toolCallId' in part ? part.toolCallId : 'unknown',
      state: part.state as string,
      input: 'input' in part ? part.input : undefined,
      output: 'output' in part ? part.output : undefined,
    });
  }

  return results;
}

/**
 * Assert that a tool call for the given name completed successfully and its
 * output satisfies the predicate. Throws with a descriptive message if no
 * matching tool call is found or the predicate fails.
 */
export function expectToolCallOutput(message: UIMessage, toolName: string, predicate: (output: unknown) => void): void {
  const parts = extractToolCallParts(message, toolName);
  const completed = parts.filter((p) => p.state === 'output-available');

  expect(
    completed.length,
    `Expected at least one completed tool call '${toolName}' with output-available, found ${completed.length}`,
  ).toBeGreaterThan(0);

  predicate(completed[0]!.output);
}

/**
 * Assert that cache token normalization is plausible: when cacheReadTokens > 0,
 * inputTokens should represent only non-cached input (the cached portion was
 * subtracted by normalizeUsageTokens).
 *
 * We can only verify the shape here — that cache read tokens are present and
 * input tokens are non-negative — because the raw (pre-normalization) prompt
 * token count is not included in the stream usage data. The actual subtraction
 * logic is tested at the unit level in ModelService.normalizeUsageTokens.
 *
 * Providers like Google Gemini include cachedContentTokenCount inside
 * promptTokenCount, so normalizeUsageTokens must subtract it.
 */
export function expectCacheTokenNormalization(chunks: UIMessageChunk[]): void {
  const usageData = extractUsageData(chunks);
  expect(usageData.length, 'Expected at least one usage data chunk').toBeGreaterThan(0);

  const withCache = usageData.filter((u) => (Number(u['cacheReadTokens']) || 0) > 0);
  expect(
    withCache.length,
    'Expected at least one usage chunk with cacheReadTokens > 0 (multi-turn needed for cache hits)',
  ).toBeGreaterThan(0);

  for (const u of withCache) {
    const inputTokens = Number(u['inputTokens']) || 0;
    const cacheReadTokens = Number(u['cacheReadTokens']) || 0;

    expect(inputTokens, 'Normalized inputTokens should be non-negative').toBeGreaterThanOrEqual(0);
    expect(cacheReadTokens, 'cacheReadTokens should be positive').toBeGreaterThan(0);
  }
}
