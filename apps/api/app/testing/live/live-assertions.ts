import { expect } from 'vitest';
import type { HostRunSnapshot, ProviderMessage, ToolInputProviderMessage } from '@taucad/agent-host';

/**
 * Assertions the live provider suites share.
 *
 * They assert durable outcomes only — a run's lifecycle state, the paired
 * tool-call/tool-result rows of its session log, and the text of its final
 * answer — never a model's prose style. When one fails it says what the model
 * did: a model that declines a request completes its run with an answer and no
 * tool call, which no other field distinguishes from a lost call
 * (docs/research/grok-4-7-live-suite-refusal-blueprint.md).
 */

/** @returns The text blocks of one message, joined; reasoning and its signature are not text. */
export const textOf = (message: ProviderMessage): string =>
  typeof message.content === 'string'
    ? message.content
    : Array.isArray(message.content)
      ? message.content
          .flatMap((block) =>
            block !== null && typeof block === 'object' && !Array.isArray(block) && typeof block['text'] === 'string'
              ? [block['text']]
              : [],
          )
          .join('')
      : '';

/** One message as a failing row reports it: who spoke and what they said, or which tool a call named. */
const reported = (message: ProviderMessage): Readonly<Record<string, string>> =>
  message.role === 'tool-input' || message.role === 'tool-output'
    ? { role: message.role, toolName: message.toolName }
    : { role: message.role, text: textOf(message) };

/**
 * @returns Why a row failed: the provider's typed refusal when the run failed,
 * otherwise its last two messages — where a model that declined says so.
 */
export const refusal = (snapshot: HostRunSnapshot): string =>
  JSON.stringify(snapshot.failure ?? snapshot.messages.slice(-2).map((message) => reported(message)));

export const expectCompleted = (snapshot: HostRunSnapshot): void => {
  expect(snapshot.state, refusal(snapshot)).toBe('completed');
};

/** @returns The final answer's text, which is where a consumed tool result has to show up. */
export const finalText = (snapshot: HostRunSnapshot): string => {
  const assistant = snapshot.messages.findLast((message) => message.role === 'assistant');
  if (!assistant) {
    expect.fail(`the thread produced no assistant message: ${refusal(snapshot)}`);
  }
  return textOf(assistant);
};

/** @returns The tool calls among `messages`, optionally only those of one tool. */
export const toolCalls = (messages: readonly ProviderMessage[], name?: string): readonly ToolInputProviderMessage[] =>
  messages.filter(
    (message): message is ToolInputProviderMessage =>
      message.role === 'tool-input' && (name === undefined || message.toolName === name),
  );

/** Every tool call in this history was dispatched and answered, nothing was left open, and there was at least one. */
export const expectPairedToolMessages = (snapshot: HostRunSnapshot): void => {
  const answered = new Set(
    snapshot.messages.flatMap((message) => (message.role === 'tool-output' ? [message.toolCallId] : [])),
  );
  expect(
    toolCalls(snapshot.messages)
      .map((call) => call.toolCallId)
      .filter((id) => !answered.has(id)),
    `tool calls without a result: ${refusal(snapshot)}`,
  ).toEqual([]);
  expect(toolCalls(snapshot.messages).length, `the model made no tool call: ${refusal(snapshot)}`).toBeGreaterThan(0);
};
