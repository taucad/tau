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
 * Assert the message contains at least one reasoning part.
 */
export function expectHasReasoningParts(message: UIMessage): void {
  const reasoningParts = message.parts.filter((p) => p.type === 'reasoning');
  expect(reasoningParts.length).toBeGreaterThan(0);
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
