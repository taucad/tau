import { emptyChatLedger, foldChatLedger } from '@taucad/agent-host';

/** A reduced desktop-log message with its original run identity. */
export type DurableMessage = {
  readonly id: string;
  readonly runId: string;
  readonly role: string;
  readonly toolCallId?: string;
  readonly toolName?: string;
  readonly content?: unknown;
  readonly isError?: boolean;
};

/** Reduce message replacements without losing the run that appended the message. */
export const durableMessages = (events: string): readonly DurableMessage[] => {
  const messages = new Map<string, DurableMessage>();
  for (const line of events.split('\n').filter((line) => line.trim() !== '')) {
    const event = JSON.parse(line) as {
      type: string;
      runId: string;
      message?: DurableMessage;
      messageId?: string;
      replacement?: DurableMessage;
    };
    if (event.type === 'message.appended' && event.message) {
      messages.set(event.message.id, { ...event.message, runId: event.runId });
    }
    if (event.type === 'message.envelope-replaced' && event.replacement && event.messageId) {
      const original = messages.get(event.messageId);
      if (original) {
        messages.set(original.id, { ...event.replacement, runId: original.runId });
      }
    }
  }
  return [...messages.values()];
};

/** A successful result must join an input from the selected run and exact target. */
export const toolResult = (
  events: string,
  expected: { runId: string; toolName: string; targetFile: string },
): unknown => {
  const messages = durableMessages(events).filter((message) => message.runId === expected.runId);
  const inputs = messages.filter(
    (message) =>
      message.role === 'tool-input' &&
      message.toolName === expected.toolName &&
      (expected.toolName === 'test_model' ||
        (message.content as { targetFile?: string } | undefined)?.targetFile === expected.targetFile),
  );
  const result = messages.findLast(
    (message) =>
      message.role === 'tool-output' &&
      message.toolName === expected.toolName &&
      inputs.some((input) => input.toolCallId === message.toolCallId),
  );
  const input = inputs.find(
    (message) =>
      message.role === 'tool-input' &&
      message.toolCallId === result?.toolCallId &&
      message.toolName === expected.toolName,
  );
  if (result?.isError !== false || !input || !result.toolCallId) {
    throw new Error(`No successful ${expected.toolName} input/result pair in run ${expected.runId}.`);
  }
  if (expected.toolName === 'test_model') {
    const content = result.content as { passes?: Array<{ targetFile: string }> };
    if (!content.passes?.some((pass) => pass.targetFile === expected.targetFile)) {
      throw new Error(`No passing geometry assertion for ${expected.targetFile}.`);
    }
  } else if ((input.content as { targetFile?: string } | undefined)?.targetFile !== expected.targetFile) {
    throw new Error(`${expected.toolName} targeted a different source than ${expected.targetFile}.`);
  }
  return result.content;
};

/**
 * The chat ledger's current run and its lifecycle state, from the rows written so far.
 * A line still being written is skipped rather than failing the read.
 */
export const currentRun = (events: string): { readonly runId: string; readonly lifecycle?: string } | undefined => {
  const rows = events
    .split('\n')
    .filter((line) => line.trim() !== '')
    .flatMap((line): unknown[] => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
  const { currentRunId, runs } = foldChatLedger(emptyChatLedger, rows);
  return currentRunId === undefined ? undefined : { runId: currentRunId, lifecycle: runs[currentRunId]?.lifecycle };
};

/** Resolve the terminal run instead of accidentally accepting an older successful result: the chat ledger's current run. */
export const latestCompletedRun = (events: string): string => {
  const rows = events
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line): unknown => JSON.parse(line));
  const { currentRunId, runs } = foldChatLedger(emptyChatLedger, rows);
  if (currentRunId === undefined || runs[currentRunId]?.lifecycle !== 'completed') {
    throw new Error('The latest desktop run has not completed successfully.');
  }
  return currentRunId;
};
