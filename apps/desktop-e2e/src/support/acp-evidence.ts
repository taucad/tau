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

/** Resolve the terminal run instead of accidentally accepting an older successful result. */
export const latestCompletedRun = (events: string): string => {
  const rows = events
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as { type: string; state?: string; runId: string });
  const run = rows.findLast((row) => row.type === 'run.lifecycle');
  if (run?.state !== 'completed') {
    throw new Error('The latest desktop run has not completed successfully.');
  }
  return run.runId;
};
