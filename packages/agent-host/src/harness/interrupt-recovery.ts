import type { JsonObject, JsonValue, ProviderMessage, UserProviderMessage } from '#log/event-types.js';

const interruptCauses = ['USER_INTERRUPTED', 'CLIENT_DISCONNECTED', 'STREAM_ERROR'] as const;
type InterruptCause = (typeof interruptCauses)[number];

const isJsonObject = (value: unknown): value is JsonObject =>
  value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value);

type RecoveryToolCall = JsonObject & { readonly id: string; readonly name: string };

const objectContent = (content: JsonValue): JsonObject | undefined => {
  if (isJsonObject(content)) {
    return content;
  }
  if (typeof content !== 'string') {
    return undefined;
  }
  try {
    const parsed = JSON.parse(content) as JsonValue;
    return isJsonObject(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
};

const interruptCause = (message: ProviderMessage): InterruptCause | undefined => {
  if (message.role !== 'tool-output' || !message.isError) {
    return undefined;
  }
  const code = objectContent(message.content)?.['errorCode'];
  return interruptCauses.find((candidate) => candidate === code);
};

const toolCalls = (message: ProviderMessage | undefined) =>
  message?.role === 'assistant' && Array.isArray(message.content)
    ? message.content.filter(
        (block): block is RecoveryToolCall =>
          isJsonObject(block) &&
          block['type'] === 'toolCall' &&
          typeof block['id'] === 'string' &&
          typeof block['name'] === 'string',
      )
    : [];

const shortHash = async (value: string): Promise<string> => {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
};

const reminderBody = (input: {
  readonly completedCount: number;
  readonly interruptedCount: number;
  readonly cause: InterruptCause;
}): string => {
  const opening =
    input.cause === 'USER_INTERRUPTED'
      ? 'The previous turn was interrupted by the user.'
      : input.cause === 'CLIENT_DISCONNECTED'
        ? 'The previous turn was cut short by a network drop.'
        : 'The previous turn ended with a stream error.';
  return `${opening} ${input.completedCount} tool call(s)
completed successfully and ${input.interruptedCount} were cancelled before they
finished. Tools that mutate state (file writes, edits, deletes) may have
partially executed.

Before retrying, verify the current state of any file or resource you were
operating on (read_file / list_directory / evaluate_model) and only then
decide whether to repeat, adjust, or skip the cancelled work. Do NOT assume
the cancelled tools left the system unchanged.`;
};

/** How a turn's last reply ended when no cancelled tool output says why the turn stopped. */
type ReplyEnding = 'stopped' | 'error';

/**
 * The reminder for a turn whose last reply was stopped or failed with no cancelled tool behind it. It names no cause
 * the history does not show: a stopped reply is the person's Stop, a closed host or a lost connection alike, and no
 * tool is counted, so nothing is said about tool calls.
 *
 * @param ending - How the last reply ended.
 * @returns The reminder's text, without its tags.
 */
const replyReminderBody = (ending: ReplyEnding): string =>
  `${
    ending === 'stopped'
      ? 'The previous turn was stopped before it finished.'
      : 'The previous turn ended with an error before it finished.'
  } Its last reply may be incomplete. Do NOT assume that work it described
was carried out: verify the current state of any file or resource before you
rely on it.`;

const isInterruptReminder = (message: ProviderMessage | undefined): boolean =>
  message?.role === 'user' && message.metadata?.tauInternal?.['kind'] === 'interrupt-recovery';

/**
 * Whether a message is a reply that was stopped or failed before it said anything: what a run writes when its next
 * request is refused.
 *
 * @param message - A message of the history, if any.
 * @returns `true` for an assistant message with no content whose stop reason is `aborted` or `error`.
 */
const isEmptyEndedReply = (message: ProviderMessage | undefined): boolean =>
  message?.role === 'assistant' &&
  (message.metadata?.stopReason === 'aborted' || message.metadata?.stopReason === 'error') &&
  (Array.isArray(message.content) ? message.content.length === 0 : message.content === '');

/**
 * The output a resume records for a call whose host stopped before it returned (D23, I6, I13).
 *
 * The call's durable `tool-input` row is its start marker: with no output row after it, the effect may have started,
 * finished or neither. The call is recorded `interrupted` and never run again, whether or not it recalled an approval,
 * and an approval it recalled stays spent. `errorCode` keeps the reminder's cause tally; `status` is the outcome a
 * tool with its own result vocabulary, such as `shell`, reads.
 *
 * @param input - The unanswered call, the new message id and the time it is recorded.
 * @returns The `tool-output` message that answers the call.
 */
export const interruptedToolOutput = (input: {
  readonly id: string;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly timestamp: number;
}): Extract<ProviderMessage, { readonly role: 'tool-output' }> => ({
  id: input.id,
  role: 'tool-output',
  toolCallId: input.toolCallId,
  toolName: input.toolName,
  content: {
    status: 'interrupted',
    errorCode: 'CLIENT_DISCONNECTED',
    message:
      'The prior host stopped before this tool returned. It may have changed files and was not run again. Verify state before retrying.',
  },
  isError: true,
  metadata: { timestamp: input.timestamp },
});

/** Build the canonical API-compatible reminder for the trailing interrupted tool block. */
export const createInterruptRecoveryMessage = async (input: {
  readonly messages: readonly ProviderMessage[];
  readonly timestamp: number;
}): Promise<UserProviderMessage | undefined> => {
  let index = input.messages.length - 1;
  const outputs: Array<Extract<ProviderMessage, { readonly role: 'tool-output' }>> = [];
  while (index >= 0) {
    const message = input.messages[index]!;
    if (message.role === 'tool-output') {
      outputs.unshift(message);
      index--;
      continue;
    }
    if (message.role === 'tool-input') {
      index--;
      continue;
    }
    break;
  }

  let parent = input.messages[index];
  let calls = toolCalls(parent);
  const interrupted = outputs.filter((message) => interruptCause(message) !== undefined);
  let ending: ReplyEnding | undefined;
  if (calls.length === 0 || interrupted.length === 0) {
    const tail = input.messages.at(-1);
    if (
      tail?.role !== 'assistant' ||
      (tail.metadata?.stopReason !== 'aborted' && tail.metadata?.stopReason !== 'error')
    ) {
      return undefined;
    }
    /* A run stopped while its tools ran writes their reminder itself, then an empty stopped reply when its next
     * request is refused. That reminder already covers the stop: a second one, after it, would only disagree. */
    let before = input.messages.length - 1;
    while (before >= 0 && isEmptyEndedReply(input.messages[before])) {
      before--;
    }
    if (before < input.messages.length - 1 && isInterruptReminder(input.messages[before])) {
      return undefined;
    }
    parent = tail;
    calls = [];
    ending = tail.metadata.stopReason === 'aborted' ? 'stopped' : 'error';
  }

  const tallies = new Map<InterruptCause, number>();
  for (const output of interrupted) {
    const cause = interruptCause(output);
    if (cause) {
      tallies.set(cause, (tallies.get(cause) ?? 0) + 1);
    }
  }
  let cause: InterruptCause = 'CLIENT_DISCONNECTED';
  let causeCount = -1;
  for (const candidate of interruptCauses) {
    const count = tallies.get(candidate) ?? 0;
    if (interrupted.length > 0 && count > causeCount) {
      cause = candidate;
      causeCount = count;
    }
  }
  const byCall = new Map(outputs.map((output) => [output.toolCallId, output]));
  const completedCount = calls.filter((call) => {
    const output = byCall.get(call.id);
    return output !== undefined && interruptCause(output) === undefined;
  }).length;
  const interruptedCount = calls.filter((call) => {
    const output = byCall.get(call.id);
    return output !== undefined && interruptCause(output) !== undefined;
  }).length;
  const seed =
    parent?.id ??
    calls
      .map((call) => call.id)
      .toSorted((left, right) => left.localeCompare(right))
      .join(':');
  const signature = await shortHash(`${seed}:${ending ?? cause}`);
  const id = `tau:interrupt-recovery:${signature}`;
  if (input.messages.some((message) => message.id === id)) {
    return undefined;
  }
  return {
    id,
    role: 'user',
    content: `<system-reminder>\n${
      ending === undefined ? reminderBody({ completedCount, interruptedCount, cause }) : replyReminderBody(ending)
    }\n</system-reminder>`,
    metadata: {
      tauInternal: {
        kind: 'interrupt-recovery',
        anchorId: signature,
        pruning: 'preserve-until-compaction',
      },
      timestamp: input.timestamp,
    },
  };
};
